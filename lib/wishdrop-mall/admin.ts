// lib/wishdrop-mall/admin.ts
//
// SERVER-ONLY helpers shared by app/api/admin/wishdrop-mall/**. Every
// caller has already passed requireStaffRole(SOURCING_ROLES) and hands in
// the service-role client from that check.

import type { createServiceRoleClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'
import {
  MALL_CURRENCY,
  WISHDROP_MALL_SLUG,
  variantLabel,
  type MallCategory,
  type MallProductFull,
  type MallProductInput,
  type MallStoreRow,
  type MallVariantInput,
} from '@/lib/wishdrop-mall'

export type AdminClient = ReturnType<typeof createServiceRoleClient>

export const MALL_STORE_COLUMNS =
  'id, platform_slug, name, description, logo_url, status, categories'

export const MALL_PRODUCT_COLUMNS =
  'id, seller_id, handle, name, category, mall_category_id, images, cost_price, margin_percent, price, compare_at_price, currency, stock_count, active, created_at, updated_at, source_platform, source_handle, source_url, source_price, source_currency, source_synced_at'

export async function getMallStore(admin: AdminClient): Promise<MallStoreRow | null> {
  const { data, error } = await admin
    .from('sellers')
    .select(MALL_STORE_COLUMNS)
    .eq('platform_slug', WISHDROP_MALL_SLUG)
    .maybeSingle()
  if (error) throw error
  return (data as unknown as MallStoreRow | null) ?? null
}

/** A positive LKR amount, rounded to whole rupees. Null if invalid. */
export function toLKR(value: unknown): number | null {
  const n = typeof value === 'string' ? parseFloat(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0 || n > 100_000_000) return null
  return Math.round(n)
}

/** Optional "was" price: must be higher than the price, else dropped. */
export function compareAtOrNull(value: unknown, price: number): number | null {
  const n = toLKR(value)
  return n != null && n > price ? n : null
}

/** Loads a product and confirms it belongs to the Mall — every
 *  per-product Mall route must go through this so it can't be used to
 *  edit some other seller's product. */
export async function loadMallProduct(admin: AdminClient, mallId: string, productId: string) {
  const { data, error } = await admin.from('products').select(MALL_PRODUCT_COLUMNS).eq('id', productId).maybeSingle()
  if (error) throw error
  const row = data as unknown as ({ seller_id: string } & Record<string, unknown>) | null
  if (!row || row.seller_id !== mallId) return null
  return row as unknown as {
    id: string
    seller_id: string
    handle: string
    name: string
    price: number
    compare_at_price: number | null
    currency: string
    active: boolean
    source_platform: string | null
    source_handle: string | null
    source_url: string | null
    source_price: number | null
    source_currency: string | null
  }
}

/** An existing Mall product imported from the same source, if any —
 *  matched on (source_platform, source_handle) for feed products, or on
 *  source_url for pasted links. Used to stop accidental double-imports. */
export async function findMallDuplicate(
  admin: AdminClient,
  mallId: string,
  source: { platform: string; handle: string | null; url: string | null },
): Promise<{ id: string; name: string } | null> {
  if (source.handle) {
    const { data, error } = await admin
      .from('products')
      .select('id, name')
      .eq('seller_id', mallId)
      .eq('source_platform', source.platform)
      .eq('source_handle', source.handle)
      .limit(1)
      .maybeSingle()
    if (error) throw error
    if (data) return data as { id: string; name: string }
  }
  if (source.url) {
    const { data, error } = await admin
      .from('products')
      .select('id, name')
      .eq('seller_id', mallId)
      .eq('source_url', source.url)
      .limit(1)
      .maybeSingle()
    if (error) throw error
    if (data) return data as { id: string; name: string }
  }
  return null
}

// ── Full product editor: validation + saving ────────────────────────────


const MAX_IMAGES = 20
const MAX_VARIANTS = 250
const MAX_OPTION_AXES = 3

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}
function strOrNull(v: unknown, max: number): string | null {
  return str(v, max) || null
}
function httpsUrl(v: unknown): string | null {
  const s = str(v, 2000)
  if (!s) return null
  return /^https?:\/\//i.test(s) ? s : null
}
function nonNegNumber(v: unknown, max = 1e9): number | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= max ? n : null
}

export type CleanMallProduct = {
  fields: {
    name: string
    brand: string | null
    category: string
    gender: 'men' | 'women' | 'unisex' | null
    sku: string | null
    tags: string[]
    images: string[]
    description: string | null
    highlights: string[]
    specs: { name: string; value: string }[]
    price: number
    compare_at_price: number | null
    currency: string
    weight_kg: number | null
    stock_count: number | null
    active: boolean
    source_platform: string | null
    source_handle: string | null
    source_url: string | null
    source_price: number | null
    source_currency: string | null
    full_description: null
    cost_price: null
    margin_percent: null
    mall_category_id: string | null
  }
  variants: {
    id?: string
    label: string
    options: Record<string, string>
    price: number | null
    image_url: string | null
    source_url: string | null
    source_price: number | null
    sku: string | null
    available: boolean
    stock: number
  }[]
}

/** Validates an editor payload. Returns DB-ready fields or an error. */
export function cleanMallInput(body: Partial<MallProductInput>): CleanMallProduct | { error: string } {
  const name = str(body.name, 200)
  if (!name) return { error: 'Title is required.' }

  const price = toLKR(body.priceLKR)
  if (price == null) return { error: 'Enter the selling price in LKR.' }

  const images = (Array.isArray(body.images) ? body.images : [])
    .map((u) => httpsUrl(u))
    .filter((u): u is string => !!u)
  const uniqueImages = Array.from(new Set(images)).slice(0, MAX_IMAGES)
  if (Array.isArray(body.images) && body.images.some((u) => str(u, 2000) && !httpsUrl(u))) {
    return { error: 'Image links must start with https://' }
  }

  const gender = body.gender === 'men' || body.gender === 'women' || body.gender === 'unisex' ? body.gender : null

  const highlights = (Array.isArray(body.highlights) ? body.highlights : [])
    .map((h) => str(h, 500))
    .filter(Boolean)
    .slice(0, 30)
  const specs = (Array.isArray(body.specs) ? body.specs : [])
    .map((r) => ({ name: str(r?.name, 120), value: str(r?.value, 500) }))
    .filter((r) => r.name && r.value)
    .slice(0, 80)
  const tags = (Array.isArray(body.tags) ? body.tags : [])
    .map((t) => str(t, 60))
    .filter(Boolean)
    .slice(0, 30)

  const src = body.source ?? { platform: null, handle: null, url: null, price: null, currency: null }
  const sourceUrl = str(src.url, 2000)
  if (sourceUrl && !httpsUrl(sourceUrl)) return { error: 'Buy link must start with https://' }

  // ── Variants ──
  const optionNames = (Array.isArray(body.optionNames) ? body.optionNames : [])
    .map((n) => str(n, 40))
    .filter(Boolean)
    .slice(0, MAX_OPTION_AXES)
  const rawVariants = (Array.isArray(body.variants) ? body.variants : []).slice(0, MAX_VARIANTS)
  const variants: CleanMallProduct['variants'] = []
  const seenLabels = new Set<string>()
  for (const v of rawVariants as MallVariantInput[]) {
    const options: Record<string, string> = {}
    for (const axis of optionNames) {
      const val = str(v?.options?.[axis], 80)
      if (val) options[axis] = val
    }
    if (Object.keys(options).length === 0) continue // empty row
    const label = variantLabel(options, optionNames)
    if (seenLabels.has(label)) return { error: `Two variants are both "${label}". Each variant needs a different combination.` }
    seenLabels.add(label)

    const vSource = str(v.sourceUrl, 2000)
    if (vSource && !httpsUrl(vSource)) return { error: `Buy link for "${label}" must start with https://` }
    const vImage = str(v.imageUrl, 2000)
    if (vImage && !httpsUrl(vImage)) return { error: `Image for "${label}" must start with https://` }

    const stock = nonNegNumber(v.stock, 1e7)
    variants.push({
      id: typeof v.id === 'string' && v.id ? v.id : undefined,
      label,
      options,
      price: v.priceLKR == null || (v.priceLKR as unknown) === '' ? null : toLKR(v.priceLKR),
      image_url: vImage || null,
      source_url: vSource || null,
      source_price: nonNegNumber(v.sourcePrice) || null,
      sku: strOrNull(v.sku, 80),
      stock: stock == null ? 0 : Math.floor(stock),
      // Sellable only while there's stock (and it isn't switched off).
      available: v.available !== false && (stock ?? 0) > 0,
    })
  }

  // Inventory: the Mall only sells stock Wishdrop holds, so quantity is
  // always tracked. With variants, the product total is their sum.
  let stockCount: number
  if (variants.length > 0) {
    stockCount = variants.reduce((sum, v) => sum + v.stock, 0)
  } else {
    const n = nonNegNumber(body.stockCount, 1e7)
    if (n == null) return { error: 'Enter the quantity you have in stock (0 if none yet).' }
    stockCount = Math.floor(n)
  }

  return {
    fields: {
      name,
      brand: strOrNull(body.brand, 120),
      category: str(body.category, 80) || 'General',
      gender,
      sku: strOrNull(body.sku, 80),
      tags,
      images: uniqueImages,
      description: str(body.description, 10000) || null,
      highlights,
      specs,
      price,
      compare_at_price: compareAtOrNull(body.compareAtLKR, price),
      currency: MALL_CURRENCY,
      weight_kg: nonNegNumber(body.weightKg, 500),
      stock_count: stockCount,
      active: body.active !== false,
      source_platform: strOrNull(src.platform, 120) ?? (sourceUrl ? hostOf(sourceUrl) : null),
      source_handle: strOrNull(src.handle, 300),
      source_url: sourceUrl || null,
      source_price: nonNegNumber(src.price) || null,
      source_currency: strOrNull(src.currency, 3)?.toUpperCase() ?? null,
      // Mall details are structured (description/highlights/specs) and
      // composed into HTML at serve time — see catalogue.ts.
      full_description: null,
      cost_price: null,
      margin_percent: null,
      // Checked against mall_categories by resolveMallCategory() in the route.
      mall_category_id: typeof body.categoryId === 'string' && body.categoryId ? body.categoryId : null,
    },
    variants,
  }
}

/**
 * Confirms the chosen category exists and sets products.category to its
 * name (or 'General' when uncategorized). Returns an error message if the
 * category id is unknown.
 */
export async function resolveMallCategory(
  admin: AdminClient,
  fields: { mall_category_id: string | null; category: string },
): Promise<string | null> {
  if (!fields.mall_category_id) {
    fields.category = 'General'
    return null
  }
  const { data } = await admin.from('mall_categories').select('name').eq('id', fields.mall_category_id).maybeSingle()
  if (!data) return 'That category no longer exists. Pick another one.'
  fields.category = (data as { name: string }).name
  return null
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./i, '')
  } catch {
    return null
  }
}

/**
 * Makes the product's variants match `wanted`: rows with a known id are
 * updated, new rows inserted, and rows no longer in the list deleted
 * (orders keep their own copy — order_items.variant_id is ON DELETE SET
 * NULL). Variant prices are LKR or null (= product price).
 */
export async function syncMallVariants(
  admin: AdminClient,
  productId: string,
  wanted: CleanMallProduct['variants'],
): Promise<void> {
  const { data: current, error } = await admin.from('product_variants').select('id').eq('product_id', productId)
  if (error) throw error
  const currentIds = new Set(((current ?? []) as { id: string }[]).map((r) => r.id))
  const keptIds = new Set<string>()

  for (const v of wanted) {
    const { id, ...fields } = v
    const row = { ...fields, compare_at_price: null, cost_price: null }
    if (id && currentIds.has(id)) {
      keptIds.add(id)
      const { error: uErr } = await admin.from('product_variants').update(row).eq('id', id)
      if (uErr) throw uErr
    } else {
      const { error: iErr } = await admin.from('product_variants').insert({ ...row, product_id: productId })
      if (iErr) throw iErr
    }
  }

  const removed = Array.from(currentIds).filter((id) => !keptIds.has(id))
  if (removed.length > 0) {
    const { error: dErr } = await admin.from('product_variants').delete().in('id', removed)
    if (dErr) throw dErr
  }
}

type FullRow = {
  id: string
  handle: string
  name: string
  brand: string | null
  category: string | null
  mall_category_id: string | null
  gender: 'men' | 'women' | 'unisex' | null
  sku: string | null
  tags: string[] | null
  images: string[] | null
  description: string | null
  full_description: string | null
  highlights: string[] | null
  specs: { name: string; value: string }[] | null
  price: number
  compare_at_price: number | null
  currency: string
  weight_kg: number | null
  stock_count: number | null
  active: boolean
  source_platform: string | null
  source_handle: string | null
  source_url: string | null
  source_price: number | null
  source_currency: string | null
}

type VariantRow = {
  id: string
  label: string
  options: Record<string, string> | null
  price: number | null
  image_url: string | null
  source_url: string | null
  source_price: number | null
  sku: string | null
  available: boolean
  stock: number | null
}

/** Loads a Mall product in the editor's shape. Null if not a Mall product. */
export async function loadMallProductFull(
  admin: AdminClient,
  mallId: string,
  productId: string,
): Promise<MallProductFull | null> {
  const { data, error } = await admin
    .from('products')
    .select(
      'id, seller_id, handle, name, brand, category, mall_category_id, gender, sku, tags, images, description, full_description, highlights, specs, price, compare_at_price, currency, weight_kg, stock_count, active, source_platform, source_handle, source_url, source_price, source_currency',
    )
    .eq('id', productId)
    .maybeSingle()
  if (error) throw error
  const row = data as unknown as (FullRow & { seller_id: string }) | null
  if (!row || row.seller_id !== mallId) return null

  const { data: vData, error: vErr } = await admin
    .from('product_variants')
    .select('id, label, options, price, image_url, source_url, source_price, sku, available, stock')
    .eq('product_id', productId)
  if (vErr) throw vErr
  const variants = (vData ?? []) as unknown as VariantRow[]

  const optionNames: string[] = []
  for (const v of variants) for (const k of Object.keys(v.options ?? {})) if (!optionNames.includes(k)) optionNames.push(k)

  return {
    id: row.id,
    handle: row.handle,
    name: row.name,
    brand: row.brand,
    categoryId: row.mall_category_id,
    category: row.category ?? 'General',
    gender: row.gender,
    sku: row.sku,
    tags: row.tags ?? [],
    images: row.images ?? [],
    // Products saved before the editor existed may only have HTML.
    description: row.description ?? (row.full_description ? row.full_description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : ''),
    highlights: row.highlights ?? [],
    specs: Array.isArray(row.specs) ? row.specs : [],
    priceLKR: row.currency === 'LKR' ? row.price : 0,
    compareAtLKR: row.currency === 'LKR' ? row.compare_at_price : null,
    weightKg: row.weight_kg,
    stockCount: row.stock_count,
    active: row.active,
    source: {
      platform: row.source_platform,
      handle: row.source_handle,
      url: row.source_url,
      price: row.source_price,
      currency: row.source_currency,
    },
    optionNames,
    variants: variants.map((v) => ({
      id: v.id,
      options: v.options ?? {},
      priceLKR: v.price,
      imageUrl: v.image_url,
      sourceUrl: v.source_url,
      sourcePrice: v.source_price,
      sku: v.sku,
      available: v.available,
      stock: v.stock ?? 0,
    })),
  }
}

// ── Inventory history ───────────────────────────────────────────────────

export type StockSnapshot = { product: number | null; variants: Map<string, number> }

/** Current quantities, taken before an edit so changes can be logged. */
export async function readStockSnapshot(admin: AdminClient, productId: string): Promise<StockSnapshot> {
  const [{ data: p }, { data: vs }] = await Promise.all([
    admin.from('products').select('stock_count').eq('id', productId).maybeSingle(),
    admin.from('product_variants').select('id, stock, label').eq('product_id', productId),
  ])
  const variants = new Map<string, number>()
  for (const v of (vs ?? []) as { id: string; stock: number | null; label: string }[]) variants.set(v.label, v.stock ?? 0)
  return { product: (p as { stock_count: number | null } | null)?.stock_count ?? null, variants }
}

/**
 * Logs quantity changes made in the product editor into
 * mall_stock_movements (reason 'manual_edit'), comparing against the
 * snapshot taken before saving. Variants are matched by label. Logging
 * never blocks a save.
 */
export async function logManualStockChanges(
  admin: AdminClient,
  productId: string,
  before: StockSnapshot | null,
): Promise<void> {
  try {
    const after = await readStockSnapshot(admin, productId)
    const { data: vRows } = await admin.from('product_variants').select('id, label').eq('product_id', productId)
    const idByLabel = new Map(((vRows ?? []) as { id: string; label: string }[]).map((v) => [v.label, v.id]))
    const rows: Database['public']['Tables']['mall_stock_movements']['Insert'][] = []

    if (after.variants.size > 0) {
      for (const [label, qty] of after.variants) {
        const prev = before?.variants.get(label) ?? 0
        if (qty !== prev) {
          rows.push({ product_id: productId, variant_id: idByLabel.get(label) ?? null, quantity_change: qty - prev, stock_after: qty, reason: 'manual_edit' })
        }
      }
    } else if (after.product != null) {
      const prev = before?.product ?? 0
      if (after.product !== prev) {
        rows.push({ product_id: productId, quantity_change: after.product - prev, stock_after: after.product, reason: 'manual_edit' })
      }
    }
    if (rows.length) await admin.from('mall_stock_movements').insert(rows)
  } catch (err) {
    console.error('[wishdrop-mall] could not log stock change', err)
  }
}

// ── Categories ──────────────────────────────────────────────────────────

export const MALL_CATEGORY_COLUMNS = 'id, name, slug, description, image_url, sort_order, active'

/** All categories in display order, with product counts. */
export async function listMallCategories(admin: AdminClient, mallId: string): Promise<MallCategory[]> {
  const [{ data: cats, error }, { data: prods, error: pErr }] = await Promise.all([
    admin.from('mall_categories').select(MALL_CATEGORY_COLUMNS).order('sort_order').order('name'),
    admin.from('products').select('mall_category_id, active').eq('seller_id', mallId).not('mall_category_id', 'is', null),
  ])
  if (error) throw error
  if (pErr) throw pErr
  const counts = new Map<string, { all: number; live: number }>()
  for (const p of (prods ?? []) as { mall_category_id: string; active: boolean }[]) {
    const c = counts.get(p.mall_category_id) ?? { all: 0, live: 0 }
    c.all++
    if (p.active) c.live++
    counts.set(p.mall_category_id, c)
  }
  return ((cats ?? []) as Omit<MallCategory, 'product_count' | 'live_count'>[]).map((c) => ({
    ...c,
    product_count: counts.get(c.id)?.all ?? 0,
    live_count: counts.get(c.id)?.live ?? 0,
  }))
}

/** Moves products (Mall products only) into a category, or out of any
 *  category when categoryId is null. Keeps products.category in step. */
export async function assignMallCategory(
  admin: AdminClient,
  mallId: string,
  productIds: string[],
  categoryId: string | null,
): Promise<string[]> {
  if (productIds.length === 0) return []
  let name = 'General'
  if (categoryId) {
    const { data } = await admin.from('mall_categories').select('name').eq('id', categoryId).maybeSingle()
    if (!data) throw new Error('Category not found.')
    name = (data as { name: string }).name
  }
  const { data, error } = await admin
    .from('products')
    .update({ mall_category_id: categoryId, category: name, updated_at: new Date().toISOString() })
    .in('id', productIds)
    .eq('seller_id', mallId)
    .select('id')
  if (error) throw error
  return ((data ?? []) as { id: string }[]).map((r) => r.id)
}
