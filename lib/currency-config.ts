// lib/currency-config.ts

/**
 * Static conversion rates for turning upstream product currencies into LKR.
 * Hardcoded here (rather than fetched live) so a flaky FX API can never
 * break the storefront. Update this table whenever rates drift — nothing
 * else in the app needs to change.
 *
 * Each value = how many LKR one unit of that currency is worth.
 */
export const CURRENCY_RATES_TO_LKR: Record<string, number> = {
  LKR: 1,
  USD: 300,
  GBP: 380,
  EUR: 325,
  INR: 3.6,
  AUD: 195,
  CAD: 220,
  SGD: 225,
  JPY: 2,
  HKD: 38,
}

/**
 * Looks up the rate for a given upstream currency code. Falls back to 1
 * (treats the amount as already-LKR) for any code not on file, instead of
 * throwing — an unrecognized currency shouldn't crash a product page.
 */
export function rateToLKR(currencyCode: string | null | undefined): number {
  if (!currencyCode) return 1
  const upper = currencyCode.trim().toUpperCase()
  return CURRENCY_RATES_TO_LKR[upper] ?? 1
}