// lib/store-providers/catalogue.ts
//
// Implements the 'catalogue' StoreProviderType — a store whose products
// live in our OWN `products` / `product_variants` tables instead of a
// third-party feed. Used by:
//   - Wishdrop Mall (lib/wishdrop-mall.ts), staff-curated;
//   - custom (manual) sellers, who add products in the seller portal —
//     lib/store-config-db.ts maps their 'mock' config to 'catalogue'.
//
// DEMO FALLBACK: a custom seller that hasn't added any products of its
// own yet still shows its hardcoded demo products (data/stores/data.ts,
// via ./mock) exactly as before, so switching them onto the DB never
// empties a live store page. The moment they have one real active
// product, only their real products are shown.
//
// Uses the service-role client on purpose, same pattern as
// getActiveSellerUrls in lib/store-config-db.ts: this runs from public,
// CDN-cached routes with no cookie context. Because service role bypasses
// RLS, every query below re-applies the public boundary itself
// (active = true) and selects an EXPLICIT column list — cost_price,
// margin_percent and every source_* column (where we buy it from) are
// ops-only and must never reach a shopper's browser.

import { createServiceRoleClient } from '@/lib/supabase/server'
import type { StoreProduct, StoreProductOption, StoreProductVariant } from '@/lib/store.types'
import type { ProviderFetchParams, ProviderFetchResult } from './types'
import { extractColors, extractSizes } from './types'
import { fetchMockProduct, fetchMockProducts } from './mock'
import { WISHDROP_MALL_SLUG, categorySlug } from '@/lib/wishdrop-mall'
import { videoPoster } from '@/lib/media'

/** Wishdrop Mall category by its storefront handle (slug), or by name for
 *  older links. Null if there's no such active category. */
async function findMallCategoryId(handle: string): Promise<string | null> {
  const supabase = createServiceRoleClient()
  const bySlug = await supabase
    .from('mall_categories')
    .select('id')
    .eq('active', true)
    .eq('slug', categorySlug(handle))
    .limit(1)
    .maybeSingle()
  if (bySlug.data) return (bySlug.data as { id: string }).id
  const byName = await supabase
    .from('mall_categories')
    .select('id')
    .eq('active', true)
    .eq('name', handle.trim())
    .limit(1)
    .maybeSingle()
  return (byName.data as { id: string } | null)?.id ?? null
}

const PUBLIC_PRODUCT_COLUMNS =
  'id, handle, name, brand, description, full_description, highlights, specs, category, condition, tags, gender, sku, price, compare_at_price, currency, weight_kg, images, videos, stock_count, average_rating, review_count, created_at'

// Fallbacks for a database that hasn't had every migration run yet, tried
// in order, so a pending migration degrades gracefully instead of
// breaking every catalogue store page (Mall AND custom sellers):
//   1. without `videos`            (data/wishdrop-seller-media.sql pending)
//   2. also without brand/highlights/specs (data/wishdrop-mall.sql pending)
const NO_VIDEO_COLUMNS = PUBLIC_PRODUCT_COLUMNS.replace('videos, ', '')
const LEGACY_PRODUCT_COLUMNS = NO_VIDEO_COLUMNS.replace('brand, ', '').replace('highlights, specs, ', '')
const COLUMN_FALLBACKS = [PUBLIC_PRODUCT_COLUMNS, NO_VIDEO_COLUMNS, LEGACY_PRODUCT_COLUMNS]
let columnTier = 0

/** Postgres "column does not exist". */
function isMissingColumn(error: { code?: string } | null): boolean {
  return error?.code === '42703'
}

/** Runs a product query with the fullest column list the database
 *  supports, stepping down (and remembering the step) on a missing column. */
async function withColumnFallback<T extends { error: { code?: string } | null }>(
  run: (columns: string) => PromiseLike<T>,
): Promise<T> {
  let result = await run(COLUMN_FALLBACKS[columnTier])
  while (isMissingColumn(result.error) && columnTier < COLUMN_FALLBACKS.length - 1) {
    columnTier += 1
    result = await run(COLUMN_FALLBACKS[columnTier])
  }
  return result
}

const PUBLIC_VARIANT_COLUMNS = 'id, label, options, price, compare_at_price, stock, image_url, available'

type PublicProductRow = {
  id: string
  handle: string
  name: string
  brand: string | null
  description: string | null
  full_description: string | null
  highlights: string[] | null
  specs: { name: string; value: string }[] | null
  category: string | null
  condition: string | null
  tags: string[] | null
  gender: 'men' | 'women' | 'unisex' | null
  sku: string | null
  price: number
  compare_at_price: number | null
  currency: string
  weight_kg: number | null
  images: string[] | null
  videos?: string[] | null
  stock_count: number | null
  average_rating: number | null
  review_count: number | null
  created_at: string
}

type PublicVariantRow = {
  id: string
  label: string
  options: Record<string, string> | null
  price: number | null
  compare_at_price: number | null
  stock: number | null
  image_url: string | null
  available: boolean
}

async function resolveSellerId(platform: string): Promise<string | null> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('sellers')
    .select('id')
    .eq('platform_slug', platform)
    .eq('status', 'active')
    .maybeSingle()
  if (error) throw error
  return (data as { id: string } | null)?.id ?? null
}

/** True if this seller has at least one live product of its own in the DB. */
async function hasOwnProducts(sellerId: string): Promise<boolean> {
  const supabase = createServiceRoleClient()
  const { count, error } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('seller_id', sellerId)
    .eq('active', true)
  if (error) throw error
  return (count ?? 0) > 0
}

/** Strips characters that have meaning inside a PostgREST `or=(...)` filter. */
function sanitizeSearch(q: string): string {
  return q.replace(/[,()*%\\]/g, ' ').trim()
}

function buildVariants(
  rows: PublicVariantRow[],
  parentPrice: number,
  /** Product tracks inventory (stock_count not null) — Wishdrop Mall. */
  stockTracked = false,
): { options: StoreProductOption[]; variants: StoreProductVariant[] } | null {
  if (rows.length === 0) return null

  // Axis names in first-seen order, e.g. ['Size', 'Color'].
  const axisNames: string[] = []
  for (const r of rows) {
    for (const key of Object.keys(r.options ?? {})) {
      if (!axisNames.includes(key)) axisNames.push(key)
    }
  }

  const options: StoreProductOption[] = axisNames.map((name) => ({
    name,
    values: Array.from(
      new Set(rows.map((r) => r.options?.[name]).filter((v): v is string => typeof v === 'string' && v !== '')),
    ),
  }))

  const variants: StoreProductVariant[] = rows.map((r) => {
    const price = r.price ?? parentPrice
    return {
      id: r.id,
      title: r.label,
      price,
      compareAtPrice: r.compare_at_price != null && r.compare_at_price > price ? r.compare_at_price : undefined,
      // Tracked inventory (Wishdrop Mall): sellable only while there's
      // stock. Untracked products: the `available` flag alone.
      available: r.available && (!stockTracked || (r.stock ?? 0) > 0),
      options: axisNames.map((name) => r.options?.[name] ?? null),
      image: r.image_url ?? undefined,
    }
  })

  return { options, variants }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Builds the product page's description HTML from the structured fields
 * the Mall editor saves: prose paragraphs, an "About this item" bullet
 * list (highlights) and a specifications <table>. ProductInfoTabs runs
 * this through normalizeDescription, which lifts the table rows into its
 * Details section — the same treatment a Shopify spec table gets.
 * Everything is escaped: these are staff-typed / scraped strings.
 */
export function composeDescriptionHtml(row: PublicProductRow): string | undefined {
  const parts: string[] = []
  if (row.full_description) parts.push(row.full_description)
  else if (row.description) {
    for (const para of row.description.split(/\n\s*\n/)) {
      const t = para.trim()
      if (t) parts.push(`<p>${escapeHtml(t).replace(/\n/g, '<br>')}</p>`)
    }
  }
  const highlights = (row.highlights ?? []).filter(Boolean)
  if (highlights.length) {
    parts.push(`<h3>About this item</h3><ul>${highlights.map((h) => `<li>${escapeHtml(h)}</li>`).join('')}</ul>`)
  }
  const specs = (Array.isArray(row.specs) ? row.specs : []).filter((r) => r?.name && r?.value)
  if (specs.length) {
    parts.push(
      `<table><tbody>${specs
        .map((r) => `<tr><th>${escapeHtml(r.name)}</th><td>${escapeHtml(r.value)}</td></tr>`)
        .join('')}</tbody></table>`,
    )
  }
  return parts.length ? parts.join('') : undefined
}

function rowToStoreProduct(
  row: PublicProductRow,
  variantRows: PublicVariantRow[],
  platform: string,
  sellerName: string,
): StoreProduct {
  const images = (row.images ?? []).filter(Boolean)
  const videos = (row.videos ?? []).filter(Boolean)
  // A product with only a video still needs a picture for cards, the
  // cart and order lines — use a still frame from the first video.
  const cover = images[0] ?? (videos[0] ? videoPoster(videos[0]) : '')
  const built = buildVariants(variantRows, row.price, row.stock_count != null)
  const onSale = row.compare_at_price != null && row.compare_at_price > row.price
  const anyVariantAvailable = built ? built.variants.some((v) => v.available) : true
  const inStock = (row.stock_count == null || row.stock_count > 0) && anyVariantAvailable

  const product: StoreProduct = {
    id: row.id,
    handle: row.handle,
    storeSlug: platform,
    stockCount: row.stock_count,
    name: row.name,
    image: cover,
    images: images.length ? images : cover ? [cover] : [],
    videos: videos.length ? videos : undefined,
    price: row.price,
    currency: row.currency,
    compareAtPrice: onSale ? row.compare_at_price ?? undefined : undefined,
    onSale,
    inStock,
    category: row.category ?? 'General',
    condition: row.condition ?? 'New',
    description: row.description ?? '',
    seller: sellerName,
    vendor: row.brand || sellerName,
    tags: row.tags ?? undefined,
    gender: row.gender ?? undefined,
    sku: row.sku ?? undefined,
    weightKg: row.weight_kg ?? undefined,
    fullDescription: composeDescriptionHtml(row),
    averageRating: row.average_rating ?? undefined,
    reviewCount: row.review_count ?? undefined,
    // NOTE: `url` is deliberately never set. For every other store it
    // points at the seller's own site; for the Mall that would be the
    // SOURCE we buy from, which shoppers shouldn't see.
  }

  if (built && built.variants.length > 0) {
    product.options = built.options
    product.variants = built.variants
    product.sizes = extractSizes(built.options)
    product.colors = extractColors(built.options)
  }

  return product
}

async function loadVariants(productIds: string[]): Promise<Map<string, PublicVariantRow[]>> {
  const byProduct = new Map<string, PublicVariantRow[]>()
  if (productIds.length === 0) return byProduct

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('product_variants')
    .select(`product_id, ${PUBLIC_VARIANT_COLUMNS}`)
    .in('product_id', productIds)
  if (error) throw error

  for (const raw of (data ?? []) as unknown as (PublicVariantRow & { product_id: string })[]) {
    const list = byProduct.get(raw.product_id) ?? []
    list.push(raw)
    byProduct.set(raw.product_id, list)
  }
  return byProduct
}

export async function fetchCatalogueProducts(
  platform: string,
  sellerName: string,
  params: ProviderFetchParams,
): Promise<ProviderFetchResult> {
  const sellerId = await resolveSellerId(platform)
  if (!sellerId) return { products: [], total: 0, totalPages: 1, totalIsExact: true }
  if (!(await hasOwnProducts(sellerId))) return fetchMockProducts(platform, params)

  const supabase = createServiceRoleClient()
  const from = (params.page - 1) * params.perPage
  const q = sanitizeSearch(params.search)

  // Wishdrop Mall filters by its managed categories (the filter value is
  // the category's slug); other catalogue stores by the category text.
  let mallCategoryId: string | null = null
  if (platform === WISHDROP_MALL_SLUG && params.category) {
    mallCategoryId = await findMallCategoryId(params.category)
    if (!mallCategoryId) return { products: [], total: 0, totalPages: 1, totalIsExact: true }
  }

  const run = (columns: string) => {
    let query = supabase
      .from('products')
      .select(columns, { count: 'exact' })
      .eq('seller_id', sellerId)
      .eq('active', true)

    if (mallCategoryId) query = query.eq('mall_category_id', mallCategoryId)
    else if (params.category) query = query.eq('category', params.category)
    if (q) query = query.or(`name.ilike.%${q}%,category.ilike.%${q}%,description.ilike.%${q}%`)

    if (params.sort === 'price-asc') query = query.order('price', { ascending: true })
    else if (params.sort === 'price-desc') query = query.order('price', { ascending: false })
    else if (params.sort === 'sale') query = query.order('compare_at_price', { ascending: false, nullsFirst: false })
    else query = query.order('created_at', { ascending: false })

    return query.range(from, from + params.perPage - 1)
  }

  const { data, error, count } = await withColumnFallback(run)
  if (error) throw error

  const rows = (data ?? []) as unknown as PublicProductRow[]
  const variantsByProduct = await loadVariants(rows.map((r) => r.id))

  const total = count ?? rows.length
  return {
    products: rows.map((r) => rowToStoreProduct(r, variantsByProduct.get(r.id) ?? [], platform, sellerName)),
    total,
    totalPages: Math.max(1, Math.ceil(total / params.perPage)),
    totalIsExact: true,
  }
}

/** Single product for /stores/[platform]/product/[handle]. Accepts the
 *  product's handle, or its uuid as a fallback (cart snapshots and older
 *  links sometimes carry the id). */
export async function fetchCatalogueProduct(
  platform: string,
  sellerName: string,
  handle: string,
): Promise<StoreProduct | null> {
  const sellerId = await resolveSellerId(platform)
  if (!sellerId) return null

  const supabase = createServiceRoleClient()
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(handle)

  const run = (columns: string) =>
    supabase
      .from('products')
      .select(columns)
      .eq('seller_id', sellerId)
      .eq('active', true)
      .eq(isUuid ? 'id' : 'handle', handle)
      .maybeSingle()

  const { data, error } = await withColumnFallback(run)
  if (error) throw error
  if (!data) {
    // Demo products (see DEMO FALLBACK above) — only while the seller has
    // none of their own, so a stale demo link can't shadow a real store.
    return (await hasOwnProducts(sellerId)) ? null : fetchMockProduct(platform, handle)
  }

  const row = data as unknown as PublicProductRow
  const variantsByProduct = await loadVariants([row.id])
  return rowToStoreProduct(row, variantsByProduct.get(row.id) ?? [], platform, sellerName)
}

/** Distinct categories that currently have at least one live product —
 *  powers the storefront's category filter (?collections=1). */
export async function fetchCatalogueCategories(platform: string): Promise<{ handle: string; title: string }[]> {
  const sellerId = await resolveSellerId(platform)
  if (!sellerId) return []
  const supabase = createServiceRoleClient()

  if (platform === WISHDROP_MALL_SLUG) {
    // Managed categories, in the order staff set, showing only ones that
    // have at least one live product (an empty category would just lead
    // shoppers to a blank page).
    const [{ data: cats }, { data: live }] = await Promise.all([
      supabase.from('mall_categories').select('id, slug, name').eq('active', true).order('sort_order').order('name'),
      supabase.from('products').select('mall_category_id').eq('seller_id', sellerId).eq('active', true).not('mall_category_id', 'is', null),
    ])
    const withProducts = new Set(((live ?? []) as { mall_category_id: string }[]).map((r) => r.mall_category_id))
    return ((cats ?? []) as { id: string; slug: string; name: string }[])
      .filter((c) => withProducts.has(c.id))
      .map((c) => ({ handle: c.slug, title: c.name }))
  }

  if (!(await hasOwnProducts(sellerId))) {
    // Demo fallback — categories of the demo products.
    const demo = await fetchMockProducts(platform, { page: 1, perPage: 1000, category: '', search: '', sort: 'newest' })
    return Array.from(new Set(demo.products.map((p) => p.category).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b))
      .map((title) => ({ handle: title, title }))
  }

  const { data, error } = await supabase
    .from('products')
    .select('category')
    .eq('seller_id', sellerId)
    .eq('active', true)
    .not('category', 'is', null)
    .limit(2000)
  if (error) throw error

  const seen = new Set<string>()
  for (const r of (data ?? []) as { category: string | null }[]) {
    if (r.category) seen.add(r.category)
  }
  return Array.from(seen)
    .sort((a, b) => a.localeCompare(b))
    .map((title) => ({ handle: title, title }))
}


/**
 * Products of this store that have at least one video, newest first —
 * the "reels" row on a custom seller's store page. Returns [] (never
 * throws) if the videos column doesn't exist yet.
 */
export async function fetchCatalogueReels(platform: string, sellerName: string, limit = 12): Promise<StoreProduct[]> {
  const sellerId = await resolveSellerId(platform)
  if (!sellerId) return []
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('products')
    .select(PUBLIC_PRODUCT_COLUMNS)
    .eq('seller_id', sellerId)
    .eq('active', true)
    .not('videos', 'eq', '{}')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return []
  const rows = (data ?? []) as unknown as PublicProductRow[]
  const variantsByProduct = await loadVariants(rows.map((r) => r.id))
  return rows
    .map((r) => rowToStoreProduct(r, variantsByProduct.get(r.id) ?? [], platform, sellerName))
    .filter((p) => p.videos?.length)
}
