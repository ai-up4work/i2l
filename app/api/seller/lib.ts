// app/api/seller/lib.ts
//
// Shared validation for the seller product routes. The seller supplies
// only what they own — name, description, category, THEIR cost price,
// stock, weight, photos, visibility. Wishdrop's margin and the selling
// price are never accepted from the client: price is always
// cost × (1 + margin%) computed here, with the margin taken from the
// seller's default (new products) or kept as-is (edits — staff may have
// set a per-product margin in Catalogues).

export const SELLER_PRODUCT_COLUMNS =
  'id, handle, name, description, category, cost_price, margin_percent, price, currency, stock_count, images, weight_kg, active, created_at'

export const MAX_IMAGES = 10

export type SellerProductInput = {
  name?: string
  description?: string | null
  category?: string | null
  costPrice?: number | string
  stockCount?: number | string | null
  weightKg?: number | string | null
  images?: string[]
  active?: boolean
}

export type CleanFields = {
  name?: string
  description?: string | null
  category?: string | null
  cost_price?: number
  stock_count?: number | null
  weight_kg?: number | null
  images?: string[]
  active?: boolean
}

export function sellerPrice(cost: number, marginPercent: number): number {
  return Math.round(cost * (1 + marginPercent / 100) * 100) / 100
}

function optionalNumber(v: unknown, { integer = false, max = 1e9 } = {}): number | null | 'invalid' {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'string' ? Number(v) : v
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > max) return 'invalid'
  return integer ? Math.floor(n) : n
}

/** Validates a create/edit body. `requireAll` for creates. Returns the
 *  cleaned DB fields, or an error message. */
export function cleanSellerInput(body: SellerProductInput, requireAll: boolean): { fields: CleanFields } | { error: string } {
  const fields: CleanFields = {}

  if (body.name !== undefined || requireAll) {
    const name = String(body.name ?? '').trim().slice(0, 200)
    if (!name) return { error: 'Product name is required.' }
    fields.name = name
  }
  if (body.description !== undefined) fields.description = String(body.description ?? '').trim().slice(0, 5000) || null
  if (body.category !== undefined) fields.category = String(body.category ?? '').trim().slice(0, 80) || null

  if (body.costPrice !== undefined || requireAll) {
    const cost = typeof body.costPrice === 'string' ? Number(body.costPrice) : body.costPrice
    if (typeof cost !== 'number' || !Number.isFinite(cost) || cost <= 0 || cost > 1e8) {
      return { error: 'Enter a valid cost price.' }
    }
    fields.cost_price = Math.round(cost * 100) / 100
  }
  if (body.stockCount !== undefined) {
    const n = optionalNumber(body.stockCount, { integer: true, max: 1e7 })
    if (n === 'invalid') return { error: 'Stock must be a whole number of 0 or more.' }
    fields.stock_count = n
  }
  if (body.weightKg !== undefined) {
    const n = optionalNumber(body.weightKg, { max: 500 })
    if (n === 'invalid') return { error: 'Weight must be a number in kg.' }
    fields.weight_kg = n
  }
  if (body.images !== undefined) {
    if (!Array.isArray(body.images)) return { error: 'images must be a list of links.' }
    const images = body.images
      .map((u) => String(u).trim())
      .filter(Boolean)
      .slice(0, MAX_IMAGES)
    for (const u of images) {
      if (!/^https:\/\//i.test(u)) return { error: 'Photo links must start with https://' }
    }
    fields.images = images
  }
  if (body.active !== undefined) fields.active = Boolean(body.active)

  return { fields }
}
