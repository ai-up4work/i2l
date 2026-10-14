// lib/currency-config.ts
//
// Conversion of upstream product currencies into LKR. The rates are part
// of the editable pricing settings (lib/pricing-settings.ts, Admin →
// Pricing engine) — no longer hardcoded here. They're still static (not
// fetched from a live FX API), so a flaky FX service can never break the
// storefront; staff update them when rates drift.
//
// Each value = how many LKR one unit of that currency is worth.

import { DEFAULT_PRICING_SETTINGS, getPricingSettings, type PricingSettings } from './pricing-settings'

/** The rates that used to be hardcoded — the defaults until staff save their own. */
export const DEFAULT_CURRENCY_RATES_TO_LKR: Record<string, number> = DEFAULT_PRICING_SETTINGS.currencyRatesToLKR

/**
 * Looks up the rate for a given upstream currency code. Falls back to 1
 * (treats the amount as already-LKR) for any code not on file, instead of
 * throwing — an unrecognized currency shouldn't crash a product page.
 */
export function rateToLKR(currencyCode: string | null | undefined, settings: PricingSettings = getPricingSettings()): number {
  if (!currencyCode) return 1
  const upper = currencyCode.trim().toUpperCase()
  return settings.currencyRatesToLKR[upper] ?? 1
}
