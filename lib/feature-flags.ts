import { getPricingSettings, type PricingSettings } from '@/lib/pricing-settings'

// Whether Economy delivery is switched off ("Coming soon"). Set by staff in
// Admin → Super Admin → Pricing engine → "Offer Economy delivery", saved with
// the other rates (pricing_settings.storefront.economyEnabled). Off by default.
//
// Every place that shows or accepts Economy asks this — the product page,
// ProductPurchasePanel, the item screen, the cart, checkout, the price
// estimator and Shipping → Pricing — so they all flip together.
//
// Server code: pass the settings from ensurePricingSettings() so it reads the
// saved value, not a stale one. Browser code can call it with no argument
// (the root layout puts the saved settings on the page).
export function isEconomyLocked(settings: PricingSettings = getPricingSettings()): boolean {
  return !settings.storefront.economyEnabled
}

/**
 * Result of resolving the shopper's size/color selection to a variant.
 *  - not-applicable: nothing to resolve (marketplace, no variants, or
 *    the size/color lists are informational only)
 *  - incomplete: a required size/color hasn't been picked yet
 *  - match: a specific variant was found
 *  - none: fully selected, but no variant exists for that combination
 */
export type VariantStatus = 'not-applicable' | 'incomplete' | 'match' | 'none'