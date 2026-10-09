// lib/catalogue-products.ts
//
// Server-only: validating and saving a social-store product (a product of
// a seller with no website feed — see lib/catalogue-stores.ts). Used by
// both the seller portal (/api/seller/products/**) and staff
// (/api/admin/catalogues/**), so the two can never disagree on the rules.
//
// The fields follow a Shopify-style product page: title, description,
// media, category, pricing (with a "was" price), inventory and SKU,
// shipping weight, size/colour variants, product details, brand, tags and
// status.
//
// PRICING. Prices are never accepted from the browser. The seller enters
// THEIR price (cost_price, INR); the listed price is always
//   cost × (1 + margin%)
// computed here. The same goes for the "was" price and for each variant
// that has its own price.
//
// VARIANTS are limited to Size and Color (the two options the storefront
// picker understands), up to 100 combinations. They are saved by id:
// rows sent back keep their id (so links like ?variant=<id> keep
// working), rows left out are deleted, new rows are added.

import 'server-only'
import { isOwnCloudinaryUrl, MEDIA_LIMITS } from '@/lib/cloudinary'
import { mallHandle } from '@/lib/wishdrop-mall'
import type { createServiceRoleClient } from '@/lib/supabase/server'
import { productCollectionIds, setProductCollections } from '@/lib/store-collections'

type Admin = ReturnType<typeof createServiceRoleClient>

export const MAX_IMAGES = MEDIA_LIMITS.image.maxCount
export const MAX_VIDEOS = MEDIA_LIMITS.video.maxCount
export const MAX_VARIANTS = 100
export const VARIANT_OPTION_NAMES = ['Size', 'Color'] as const

const VARIANT_SELECT = 'product_variants(id, label, options, sku, cost_price, price, compare_at_price, stock, image_url, available)'

/** Everything the editor needs to reopen a product. */
export const PRODUCT_EDIT_COLUMNS =
  'id, handle, name, description, category, brand, tags, gender, sku, cost_price, margin_percent, price, compare_at_price, currency, stock_count, images, videos, weight_kg, highlights, specs, active, created_at, seller_id'
export const PRODUCT_EDIT_SELECT = `${PRODUCT_EDIT_COLUMNS}, ${VARIANT_SELECT}`

/** Postgres "column does not exist" (a pending migration) -> a message
 *  staff can act on, instead of a raw database error. */
export function friendlyDbError(error: { code?: string; message: string }): string {
  if (error.code === '42703' || error.code === 'PGRST200' || /column .* does not exist/i.test(error.message)) {
    return 'The database needs an update before products can be saved: run data/wishdrop-mall.sql and data/wishdrop-seller-media.sql in Supabase.'
  }
  return error.message
}

export function listedPrice(cost: number, marginPercent: number): number {
  return Math.round(cost * (1 + marginPercent / 100) * 100) / 100
}

// ─── Input ───────────────────────────────────────────────────────────────

export type ProductInput = {
  name?: string
  description?: string | null
  category?: string | null
  brand?: string | null
  tags?: string[] | string | null
  gender?: string | null
  sku?: string | null
  costPrice?: number | string
  /** The seller's own "was" price (same terms as costPrice). */
  compareAtPrice?: number | string | null
  trackInventory?: boolean
  stockCount?: number | string | null
  weightKg?: number | string | null
  images?: string[]
  videos?: string[]
  highlights?: string[]
  specs?: { name?: string; value?: string }[]
  active?: boolean
  /** null or [] = no variants. Omit to leave variants unchanged. */
  variants?: VariantInput[] | null
  /** Store collections the product is in (exact list). Omit = unchanged. */
  collectionIds?: string[] | null
}

export type VariantInput = {
  id?: string
  options?: Record<string, string>
  costPrice?: number | string | null
  stock?: number | string | null
  sku?: string | null
  imageUrl?: string | null
  available?: boolean
}

type CleanVariant = {
  id?: string
  options: Record<string, string>
  label: string
  cost: number | null
  stock: number
  sku: string | null
  imageUrl: string | null
  available: boolean
}

export type CleanProduct = {
  fields: {
    name?: string
    description?: string | null
    category?: string | null
    brand?: string | null
    tags?: string[]
    gender?: 'men' | 'women' | 'unisex' | null
    sku?: string | null
    cost_price?: number
    weight_kg?: number | null
    images?: string[]
    videos?: string[]
    highlights?: string[]
    specs?: { name: string; value: string }[]
    active?: boolean
  }
  /** undefined = not sent; null = clear it. In the seller's terms. */
  compareAtCost?: number | null
  /** undefined = not sent. */
  trackInventory?: boolean
  stockCount?: number | null
  /** undefined = leave variants as they are. */
  variants?: CleanVariant[]
  /** undefined = leave collections as they are. */
  collectionIds?: string[]
}

function optionalNumber(v: unknown, { integer = false, max = 1e9 } = {}): number | null | 'invalid' {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'string' ? Number(v) : v
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > max) return 'invalid'
  return integer ? Math.floor(n) : Math.round(n * 1000) / 1000
}

const text = (v: unknown, max: number): string | null => String(v ?? '').trim().slice(0, max) || null

/** Validates a create/edit body. `requireAll` for creates. */
export function cleanProductInput(body: ProductInput, requireAll: boolean): CleanProduct | { error: string } {
  const out: CleanProduct = { fields: {} }
  const f = out.fields

  if (body.name !== undefined || requireAll) {
    const name = String(body.name ?? '').trim().slice(0, 200)
    if (!name) return { error: 'Product name is required.' }
    f.name = name
  }
  if (body.description !== undefined) f.description = String(body.description ?? '').trim().slice(0, 8000) || null
  if (body.category !== undefined) f.category = text(body.category, 80)
  if (body.brand !== undefined) f.brand = text(body.brand, 80)
  if (body.sku !== undefined) f.sku = text(body.sku, 80)

  if (body.tags !== undefined) {
    const list = Array.isArray(body.tags) ? body.tags : String(body.tags ?? '').split(',')
    f.tags = Array.from(new Set(list.map((t) => String(t).trim().toLowerCase().slice(0, 40)).filter(Boolean))).slice(0, 20)
  }
  if (body.gender !== undefined) {
    const g = String(body.gender ?? '').trim().toLowerCase()
    if (g && g !== 'men' && g !== 'women' && g !== 'unisex') return { error: 'Choose who it is for: women, men or everyone.' }
    f.gender = (g || null) as 'men' | 'women' | 'unisex' | null
  }

  if (body.costPrice !== undefined || requireAll) {
    const cost = typeof body.costPrice === 'string' ? Number(body.costPrice) : body.costPrice
    if (typeof cost !== 'number' || !Number.isFinite(cost) || cost <= 0 || cost > 1e8) return { error: 'Enter a valid price.' }
    f.cost_price = Math.round(cost * 100) / 100
  }
  if (body.compareAtPrice !== undefined) {
    const n = optionalNumber(body.compareAtPrice, { max: 1e8 })
    if (n === 'invalid') return { error: 'The "was" price must be a number.' }
    out.compareAtCost = n
  }

  if (body.trackInventory !== undefined) out.trackInventory = Boolean(body.trackInventory)
  if (body.stockCount !== undefined) {
    const n = optionalNumber(body.stockCount, { integer: true, max: 1e7 })
    if (n === 'invalid') return { error: 'Quantity must be a whole number of 0 or more.' }
    out.stockCount = n
  }
  if (body.weightKg !== undefined) {
    const n = optionalNumber(body.weightKg, { max: 500 })
    if (n === 'invalid') return { error: 'Weight must be a number in kg.' }
    f.weight_kg = n
  }

  if (body.images !== undefined) {
    if (!Array.isArray(body.images)) return { error: 'images must be a list of links.' }
    const images = body.images.map((u) => String(u).trim()).filter(Boolean).slice(0, MAX_IMAGES)
    for (const u of images) if (!/^https:\/\//i.test(u)) return { error: 'Photo links must start with https://' }
    f.images = images
  }
  if (body.videos !== undefined) {
    if (!Array.isArray(body.videos)) return { error: 'videos must be a list of links.' }
    const videos = body.videos.map((u) => String(u).trim()).filter(Boolean).slice(0, MAX_VIDEOS)
    for (const u of videos) {
      if (!isOwnCloudinaryUrl(u, 'video')) return { error: 'Videos must be uploaded with the upload button.' }
    }
    f.videos = videos
  }

  if (body.highlights !== undefined) {
    if (!Array.isArray(body.highlights)) return { error: 'highlights must be a list.' }
    f.highlights = body.highlights.map((h) => String(h).trim().slice(0, 300)).filter(Boolean).slice(0, 12)
  }
  if (body.specs !== undefined) {
    if (!Array.isArray(body.specs)) return { error: 'details must be a list.' }
    f.specs = body.specs
      .map((s) => ({ name: String(s?.name ?? '').trim().slice(0, 60), value: String(s?.value ?? '').trim().slice(0, 500) }))
      .filter((s) => s.name && s.value)
      .slice(0, 20)
  }
  if (body.active !== undefined) f.active = Boolean(body.active)

  if (body.collectionIds !== undefined) {
    const ids = Array.isArray(body.collectionIds) ? body.collectionIds : []
    out.collectionIds = ids.filter((id) => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)).slice(0, 50)
  }

  if (body.variants !== undefined) {
    const list = body.variants ?? []
    if (!Array.isArray(list)) return { error: 'variants must be a list.' }
    if (list.length > MAX_VARIANTS) return { error: `Up to ${MAX_VARIANTS} variants per product.` }
    const seen = new Set<string>()
    const variants: CleanVariant[] = []
    for (const v of list) {
      const options: Record<string, string> = {}
      for (const name of VARIANT_OPTION_NAMES) {
        const value = String(v.options?.[name] ?? '').trim().slice(0, 40)
        if (value) options[name] = value
      }
      if (Object.keys(options).length === 0) return { error: 'Each variant needs a size or a colour.' }
      const key = VARIANT_OPTION_NAMES.map((n) => options[n] ?? '').join('|').toLowerCase()
      if (seen.has(key)) return { error: `"${Object.values(options).join(' / ')}" is listed twice.` }
      seen.add(key)

      const cost = optionalNumber(v.costPrice, { max: 1e8 })
      if (cost === 'invalid' || cost === 0) return { error: `Check the price of ${Object.values(options).join(' / ')}.` }
      const stock = optionalNumber(v.stock, { integer: true, max: 1e7 })
      if (stock === 'invalid') return { error: `Check the quantity of ${Object.values(options).join(' / ')}.` }
      const imageUrl = String(v.imageUrl ?? '').trim()
      if (imageUrl && !/^https:\/\//i.test(imageUrl)) return { error: 'Variant photos must be one of the product photos.' }

      variants.push({
        id: typeof v.id === 'string' && /^[0-9a-f-]{36}$/i.test(v.id) ? v.id : undefined,
        options,
        // Size first, then colour: "M / Red"
        label: VARIANT_OPTION_NAMES.map((n) => options[n]).filter(Boolean).join(' / '),
        cost,
        stock: stock ?? 0,
        sku: text(v.sku, 80),
        imageUrl: imageUrl || null,
        available: v.available !== false,
      })
    }
    out.variants = variants
  }

  return out
}

// ─── Save ────────────────────────────────────────────────────────────────

type ExistingRow = {
  id: string
  seller_id: string
  cost_price: number | null
  margin_percent: number | null
  compare_at_price: number | null
  stock_count: number | null
}

/** Inventory: null = not tracked. With variants it's their sum. */
function resolveStock(track: boolean, variants: CleanVariant[] | null, single: number | null | undefined): number | null {
  if (!track) return null
  if (variants && variants.length) return variants.reduce((sum, v) => sum + v.stock, 0)
  return single ?? 0
}

async function writeVariants(admin: Admin, productId: string, variants: CleanVariant[], margin: number, track: boolean) {
  const { data: existing, error: readError } = await admin.from('product_variants').select('id').eq('product_id', productId)
  if (readError) throw readError
  const existingIds = new Set(((existing ?? []) as { id: string }[]).map((r) => r.id))
  const keepIds = new Set(variants.map((v) => v.id).filter((id): id is string => Boolean(id && existingIds.has(id))))

  const toDelete = [...existingIds].filter((id) => !keepIds.has(id))
  if (toDelete.length) {
    const { error } = await admin.from('product_variants').delete().in('id', toDelete)
    if (error) throw error
  }

  for (const v of variants) {
    const row = {
      product_id: productId,
      label: v.label,
      options: v.options,
      sku: v.sku,
      cost_price: v.cost,
      price: v.cost != null ? listedPrice(v.cost, margin) : null,
      stock: track ? v.stock : 0,
      image_url: v.imageUrl,
      available: v.available,
    }
    const result =
      v.id && keepIds.has(v.id)
        ? await admin.from('product_variants').update(row).eq('id', v.id)
        : await admin.from('product_variants').insert(row)
    if (result.error) throw result.error
  }
}

/** Re-prices every variant that has its own price, e.g. after a margin change. */
async function repriceVariants(admin: Admin, productId: string, margin: number) {
  const { data, error } = await admin.from('product_variants').select('id, cost_price').eq('product_id', productId)
  if (error) throw error
  for (const v of (data ?? []) as { id: string; cost_price: number | null }[]) {
    if (v.cost_price == null) continue
    const { error: e } = await admin.from('product_variants').update({ price: listedPrice(v.cost_price, margin) }).eq('id', v.id)
    if (e) throw e
  }
}

export async function loadEditableProduct(admin: Admin, productId: string, sellerId?: string) {
  let query = admin.from('products').select(PRODUCT_EDIT_SELECT).eq('id', productId)
  if (sellerId) query = query.eq('seller_id', sellerId)
  const result = await query.maybeSingle()
  if (result.data) {
    ;(result.data as unknown as Record<string, unknown>).collection_ids = await productCollectionIds(admin, productId)
  }
  return result
}

export type SaveResult = { ok: true; productId: string } | { ok: false; status: number; error: string }

/** Create a product for a seller. `margin` is the seller's (or staff's) margin. */
export async function createProduct(admin: Admin, sellerId: string, margin: number, clean: CleanProduct): Promise<SaveResult> {
  const f = clean.fields
  const cost = f.cost_price as number
  const variants = clean.variants ?? []
  const track = clean.trackInventory ?? clean.stockCount != null
  const compareAt = clean.compareAtCost != null && clean.compareAtCost > cost ? listedPrice(clean.compareAtCost, margin) : null
  const now = new Date().toISOString()

  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await admin
      .from('products')
      .insert({
        ...f,
        name: f.name as string,
        seller_id: sellerId,
        handle: mallHandle(f.name as string),
        margin_percent: margin,
        price: listedPrice(cost, margin),
        compare_at_price: compareAt,
        stock_count: resolveStock(track, variants, clean.stockCount),
        currency: 'INR',
        active: f.active ?? true,
        created_at: now,
        updated_at: now,
      })
      .select('id')
      .single()
    if (!error) {
      const productId = (data as { id: string }).id
      if (variants.length || clean.collectionIds?.length) {
        try {
          if (variants.length) await writeVariants(admin, productId, variants, margin, track)
          if (clean.collectionIds?.length) await setProductCollections(admin, productId, sellerId, clean.collectionIds)
        } catch (e) {
          // Don't leave a half-saved product behind.
          await admin.from('products').delete().eq('id', productId)
          return { ok: false, status: 500, error: friendlyDbError(e as { code?: string; message: string }) }
        }
      }
      return { ok: true, productId }
    }
    if (error.code !== '23505' || attempt === 1) return { ok: false, status: 500, error: friendlyDbError(error) }
  }
  return { ok: false, status: 500, error: 'Could not create the product.' }
}

/**
 * Update a product. `sellerId` scopes it to one seller (seller portal);
 * `newMargin` is staff-only. Re-prices the product, its "was" price and
 * its variants whenever the cost or the margin changes.
 */
export async function updateProduct(
  admin: Admin,
  productId: string,
  clean: CleanProduct,
  opts: { sellerId?: string; newMargin?: number; fallbackMargin: number },
): Promise<SaveResult> {
  let query = admin.from('products').select('id, seller_id, cost_price, margin_percent, compare_at_price, stock_count').eq('id', productId)
  if (opts.sellerId) query = query.eq('seller_id', opts.sellerId)
  const { data: found, error: findError } = await query.maybeSingle()
  if (findError) return { ok: false, status: 500, error: friendlyDbError(findError) }
  if (!found) return { ok: false, status: 404, error: 'Product not found.' }
  const row = found as ExistingRow

  const f = clean.fields
  const oldMargin = row.margin_percent ?? opts.fallbackMargin
  const margin = opts.newMargin ?? oldMargin
  const cost = f.cost_price ?? row.cost_price
  const patch: Record<string, unknown> = { ...f, updated_at: new Date().toISOString() }

  const marginChanged = opts.newMargin !== undefined && opts.newMargin !== oldMargin
  if (f.cost_price !== undefined || marginChanged) {
    patch.margin_percent = margin
    if (cost != null) patch.price = listedPrice(cost, margin)
  }

  if (clean.compareAtCost !== undefined) {
    patch.compare_at_price = clean.compareAtCost != null && cost != null && clean.compareAtCost > cost ? listedPrice(clean.compareAtCost, margin) : null
  } else if (marginChanged && row.compare_at_price != null) {
    // Keep the "was" price in step with the new margin.
    const wasCost = row.compare_at_price / (1 + oldMargin / 100)
    patch.compare_at_price = listedPrice(wasCost, margin)
  }

  // Inventory.
  const variantsSent = clean.variants !== undefined
  if (clean.trackInventory !== undefined || clean.stockCount !== undefined || variantsSent) {
    const track = clean.trackInventory ?? row.stock_count != null
    if (variantsSent) {
      patch.stock_count = resolveStock(track, clean.variants ?? [], clean.stockCount)
    } else if (!track) {
      patch.stock_count = null
    } else if (clean.stockCount !== undefined) {
      patch.stock_count = clean.stockCount ?? 0
    } else if (row.stock_count == null) {
      patch.stock_count = 0
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let update = admin.from('products').update(patch as any).eq('id', productId)
  if (opts.sellerId) update = update.eq('seller_id', opts.sellerId)
  const { error } = await update
  if (error) return { ok: false, status: 500, error: friendlyDbError(error) }

  try {
    if (variantsSent) {
      const track = clean.trackInventory ?? (patch.stock_count !== undefined ? patch.stock_count != null : row.stock_count != null)
      await writeVariants(admin, productId, clean.variants ?? [], margin, track)
    } else if (marginChanged) {
      await repriceVariants(admin, productId, margin)
    }
    if (clean.collectionIds !== undefined) {
      await setProductCollections(admin, productId, row.seller_id, clean.collectionIds)
    }
  } catch (e) {
    return { ok: false, status: 500, error: friendlyDbError(e as { code?: string; message: string }) }
  }

  return { ok: true, productId }
}
