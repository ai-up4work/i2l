// lib/store-origin.ts
//
// Store LOCATION: is a store in India (the default, everything Wishdrop
// was built for) or a local shop in Sri Lanka?
//
// Saved on the seller row as sellers.store_origin ('IN' | 'LK'), added by
// data/wishdrop-store-types-and-location.sql. It is independent of the
// store's type (lib/catalogue-stores.ts), so a feed store, an extractor
// store or a social store can each be local.
//
// What changes for a local (LK) store:
//
//   Price   The store's own price (normally LKR) + Wishdrop's margin.
//           No exchange-rate markup, freight, customs or service charge.
//           Social stores already have their margin baked into the price
//           by the server (lib/catalogue-products.ts), so it isn't added
//           twice — that's what `marginIncluded` is for.
//   Pickup  localPickupFeeLKR(), once per local store per order, to bring
//           the items from the shop to our warehouse. Added at checkout
//           (see localPickupFees below), not to each item.
//   Delivery The normal delivery fee from our warehouse to the customer
//           (same fee Wishdrop Mall uses).
//
// The order steps are unchanged (Ordered → Quality check → Shipped →
// Delivered), by decision.
//
// Pure — safe to import from client components.

import { getPricingSettings, type PricingSettings } from './pricing-settings'

export type StoreOrigin = 'IN' | 'LK'
export const STORE_ORIGINS: StoreOrigin[] = ['IN', 'LK']
export const DEFAULT_STORE_ORIGIN: StoreOrigin = 'IN'

export const STORE_ORIGIN_LABEL: Record<StoreOrigin, string> = {
  IN: 'India',
  LK: 'Sri Lanka (local)',
}

export const STORE_ORIGIN_FLAG: Record<StoreOrigin, string> = {
  IN: '🇮🇳',
  LK: '🇱🇰',
}

// ---- Business numbers ---------------------------------------------------
// Editable on Admin → Pricing engine (settings.local, lib/pricing-settings.ts).

/** Bringing one local shop's items to our warehouse, per order. */
export function localPickupFeeLKR(settings: PricingSettings = getPricingSettings()): number {
  return settings.local.pickupFeeLKR
}

/** Warehouse → customer delivery for a local item. */
export function localDeliveryFeeLKR(settings: PricingSettings = getPricingSettings()): number {
  return settings.local.deliveryFeeLKR
}

/** Margin added to a local feed / extractor store's price. Social stores
 *  use their own per-product margin instead (already in the price). */
export function localStoreMarginPercent(settings: PricingSettings = getPricingSettings()): number {
  return settings.local.marginPercent
}

// ----------------------------------------------------------------------

export function isStoreOrigin(value: unknown): value is StoreOrigin {
  return value === 'IN' || value === 'LK'
}

/** The store's location from a sellers row. Defaults to India. */
export function storeOriginOf(row: Record<string, unknown>): StoreOrigin {
  return isStoreOrigin(row.store_origin) ? row.store_origin : DEFAULT_STORE_ORIGIN
}

/**
 * The currency a SOCIAL store's prices are entered in: rupees for a local
 * Sri Lankan shop, Indian rupees otherwise. The store decides — not each
 * product row — so switching a store's location can never leave some of
 * its prices in one currency and some in the other.
 */
export function socialStoreCurrency(origin: StoreOrigin): 'LKR' | 'INR' {
  return origin === 'LK' ? 'LKR' : 'INR'
}

/** Pricing facts a product carries from its store. */
export type StorePricingInfo = {
  origin: StoreOrigin
  /** True when the product price already includes Wishdrop's margin
   *  (social stores — priced on the server). */
  marginIncluded: boolean
  /** Social stores only: the store's currency, which wins over whatever
   *  the product row says (see socialStoreCurrency). */
  currency?: string
}

/** Copies the store's pricing facts onto a product (or list of them). */
export function withStorePricing<T extends object>(product: T, info: StorePricingInfo): T & StorePricingInfo {
  return {
    ...product,
    origin: info.origin,
    marginIncluded: info.marginIncluded,
    ...(info.currency ? { currency: info.currency } : {}),
  }
}

/**
 * The handling fee split across a local shop's units in this order, so it
 * can be shown as part of each item's service charge. slug -> LKR per unit.
 */
export function localServiceShares(
  lines: { storeSlug?: string | null; origin?: StoreOrigin | null; qty: number }[],
  settings: PricingSettings = getPricingSettings(),
): Map<string, number> {
  const units = new Map<string, number>()
  for (const line of lines) {
    if (line.origin !== 'LK') continue
    const key = line.storeSlug || '(unknown store)'
    units.set(key, (units.get(key) ?? 0) + Math.max(1, line.qty))
  }
  const fee = localPickupFeeLKR(settings)
  return new Map([...units].map(([slug, n]) => [slug, fee / n]))
}

/**
 * The pickup charge for one order: localPickupFeeLKR() for every
 * different local store in it. `lines` are the order's lines; each needs
 * its store slug and whether that store is local.
 */
export function localPickupFees(
  lines: { storeSlug?: string | null; origin?: StoreOrigin | null }[],
  settings: PricingSettings = getPricingSettings(),
): {
  storeCount: number
  totalLKR: number
} {
  const stores = new Set<string>()
  for (const line of lines) {
    if (line.origin === 'LK') stores.add(line.storeSlug || '(unknown store)')
  }
  return { storeCount: stores.size, totalLKR: stores.size * localPickupFeeLKR(settings) }
}
