// lib/wishdrop-mall.ts
//
// Wishdrop Mall — Wishdrop's OWN house store, sold as its own channel
// alongside the affiliated sellers. Unlike every other store (whose
// products are fetched live from a third-party feed), the Mall's
// catalogue lives in our own `products` table: staff pick products from
// any affiliated store's feed, or paste a product link from anywhere,
// set a price in LKR, and the product goes on sale at
// /stores/wishdrop-mall under Wishdrop's own name.
//
// This file is CLIENT-SAFE (no server imports) — pure constants and
// helpers shared by the admin page, the API routes, the storefront
// provider and lib/pricing.ts.
// Server-only sourcing logic lives in lib/wishdrop-mall/sourcing.ts.

import { rateToLKR } from './currency-config'
import { SIMPLE_DELIVERY_FLAT_LKR } from './quote'

export const WISHDROP_MALL_SLUG = 'wishdrop-mall'
export const WISHDROP_MALL_NAME = 'Wishdrop Mall'
export const WISHDROP_MALL_DESCRIPTION =
  'Handpicked products sourced, quality-checked and sold directly by Wishdrop.'

// ── Pricing ─────────────────────────────────────────────────────────────
// Mall prices are set by staff directly in LKR for the Sri Lankan market
// and already include everything (import, duty, margin). Shoppers pay
// that price plus this flat delivery fee — nothing else. The storefront
// side of this lives in lib/pricing.ts (isFixedPriceItem).
//
// Reuses the site's existing flat delivery fee so the Mall stays in step
// if that rate changes. Change it here to give the Mall its own rate.
export const MALL_DELIVERY_FEE_LKR = SIMPLE_DELIVERY_FLAT_LKR

/** Currency every Mall product is priced in. */
export const MALL_CURRENCY = 'LKR'

/** Rough LKR equivalent of a source price at today's configured rate —
 *  shown to staff as a reference while they set the Mall price. Not the
 *  landed cost: freight/duty aren't included. */
export function approxLKR(amount: number | null | undefined, currency: string | null | undefined): number | null {
  if (amount == null || !Number.isFinite(amount)) return null
  return Math.round(amount * rateToLKR(currency))
}

/** URL-safe handle for /stores/wishdrop-mall/product/[handle]. A short
 *  random suffix keeps two products with the same name from colliding
 *  on the (seller_id, handle) unique constraint. */
export function mallHandle(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  const suffix = Math.random().toString(36).slice(2, 7)
  return `${base || 'product'}-${suffix}`
}

/** One purchasable option combination, with its price at the source. */
export type MallDraftVariant = {
  label: string
  /** e.g. { Size: 'M', Color: 'Red' } — axis order is preserved. */
  options: Record<string, string>
  costPrice: number | null
  compareAtCost: number | null
  available: boolean
  imageUrl: string | null
  sku: string | null
  /** This variant's own page at the source, when it has one (Amazon gives
   *  each colour/size its own link). */
  sourceUrl: string | null
}

export type MallSpec = { name: string; value: string }

/** A product as fetched from its source, before it's saved to the Mall.
 *  All prices here are the SOURCE's prices (what Wishdrop pays), in the
 *  source's currency — for reference only. The Mall's own selling price
 *  is set separately, in LKR, by staff. */
export type MallDraft = {
  name: string
  brand: string | null
  description: string
  /** "About this item" bullet points (Amazon key features). */
  highlights: string[]
  /** Specification rows (Amazon "Product details" / item specifics). */
  specs: MallSpec[]
  fullDescription: string | null
  category: string
  images: string[]
  costPrice: number | null
  compareAtCost: number | null
  currency: string
  tags: string[]
  gender: 'men' | 'women' | 'unisex' | null
  sku: string | null
  weightKg: number | null
  stockCount: number | null
  inStock: boolean
  variants: MallDraftVariant[]
  /** Option values the supplier lists that AREN'T part of its variants —
   *  e.g. a size list shared by every design. The editor offers to add
   *  them as an extra variant option. */
  suggestedOptions?: Record<string, string[]>
  source: {
    /** Affiliated store slug (e.g. 'giva'), or the scraper's site id / hostname for a pasted link. */
    platform: string
    /** Product handle inside that store's feed, when it came from a feed. */
    handle: string | null
    /** Where staff should go to actually buy it when an order comes in. */
    url: string | null
    /** Human label for the source, e.g. 'GIVA' or 'amazon.in'. */
    name: string
  }
}

/** Row shape returned by GET /api/admin/wishdrop-mall for the products table. */
export type MallProductRow = {
  id: string
  handle: string
  name: string
  category: string | null
  images: string[]
  cost_price: number | null
  margin_percent: number | null
  price: number
  compare_at_price: number | null
  currency: string
  stock_count: number | null
  active: boolean
  created_at: string
  updated_at: string
  source_platform: string | null
  source_handle: string | null
  source_url: string | null
  source_price: number | null
  source_currency: string | null
  source_synced_at: string | null
  mall_category_id: string | null
  variant_count: number
}

/** A Mall category, as the admin sees it. */
export type MallCategory = {
  id: string
  name: string
  slug: string
  description: string | null
  image_url: string | null
  sort_order: number
  active: boolean
  /** All products in it (live + hidden). */
  product_count: number
  /** Products shoppers can see. */
  live_count: number
}

/** URL-safe slug for a category name ("Home & Kitchen" -> "home-kitchen"). */
export function categorySlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

export type MallStoreRow = {
  id: string
  platform_slug: string
  name: string
  description: string | null
  logo_url: string | null
  status: string
  categories: string[]
}

// ── Full product editor ────────────────────────────────────────────────
// What the editor sends to POST /api/admin/wishdrop-mall/products and
// PUT /api/admin/wishdrop-mall/products/[id], and what GET returns. The
// server validates everything in lib/wishdrop-mall/admin.ts
// (cleanMallInput) — prices are LKR, set by staff.

export type MallVariantInput = {
  /** Existing variant id when editing; absent for new rows. */
  id?: string
  /** e.g. { Color: 'Red', Size: 'M' }. The label is built from these. */
  options: Record<string, string>
  /** LKR. null = same as the product's price. */
  priceLKR: number | null
  imageUrl: string | null
  /** Where to buy THIS variant. */
  sourceUrl: string | null
  /** Its price at the source (reference only), in the product's source currency. */
  sourcePrice: number | null
  sku: string | null
  available: boolean
  /** Quantity on hand for this variant. */
  stock: number
}

export type MallProductInput = {
  name: string
  brand: string | null
  /** Mall category (mall_categories.id); null = uncategorized. */
  categoryId: string | null
  /** Legacy free-text category — derived from categoryId on save. */
  category: string
  gender: 'men' | 'women' | 'unisex' | null
  sku: string | null
  tags: string[]
  /** First image is the primary (card/listing) photo; the rest are gallery photos. */
  images: string[]
  description: string
  highlights: string[]
  specs: MallSpec[]
  priceLKR: number
  compareAtLKR: number | null
  weightKg: number | null
  /** Quantity on hand. Ignored when the product has variants — then it's
   *  the sum of the variants' stock. */
  stockCount: number | null
  active: boolean
  source: {
    platform: string | null
    handle: string | null
    /** Main buy link. */
    url: string | null
    price: number | null
    currency: string | null
  }
  /** Option axis names in display order, e.g. ['Color', 'Size']. */
  optionNames: string[]
  variants: MallVariantInput[]
}

/** GET /api/admin/wishdrop-mall/products/[id] — a saved product in editor shape. */
export type MallProductFull = MallProductInput & { id: string; handle: string }

/** The label stored for a variant, from its option values in axis order. */
export function variantLabel(options: Record<string, string>, optionNames: string[]): string {
  const ordered = optionNames.length ? optionNames : Object.keys(options)
  const parts = ordered.map((n) => options[n]).filter((v) => v && v.trim())
  return parts.join(' / ') || 'Default'
}
