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
}

/** A product as fetched from its source, before it's saved to the Mall.
 *  All prices here are the SOURCE's prices (what Wishdrop pays), in the
 *  source's currency — for reference only. The Mall's own selling price
 *  is set separately, in LKR, by staff. */
export type MallDraft = {
  name: string
  description: string
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
  variant_count: number
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
