// lib/price-estimate.ts
//
// "Know the rupee price? See roughly what it costs in Sri Lanka."
//
// A quick look for shoppers — nothing is ordered. It runs the price and
// weight through the SAME formula the storefront and checkout use
// (getDualDeliveryPricing in lib/pricing.ts, with the live rates from the
// Pricing engine), so the estimate moves with your rates automatically.
//
// Indian stores only. Economy is always listed; while it's switched off
// (Admin → Pricing engine, lib/feature-flags.ts) it's marked `locked` and
// the estimator shows it as "Coming soon" with no price.
//
// Safe to import from client and server code.

import { getDualDeliveryPricing, type DeliveryPriceOption } from '@/lib/pricing'
import { getPricingSettings, type PricingSettings } from '@/lib/pricing-settings'
import { isEconomyLocked } from '@/lib/feature-flags'

/** Rough packed weights, for shoppers who don't know theirs. */
export const WEIGHT_PRESETS: { label: string; kg: number }[] = [
  { label: 'T-shirt / top', kg: 0.3 },
  { label: 'Kurti / dress', kg: 0.5 },
  { label: 'Jeans / trousers', kg: 0.7 },
  { label: 'Saree', kg: 0.8 },
  { label: 'Shoes', kg: 1.2 },
  { label: 'Handbag', kg: 0.8 },
  { label: 'Watch / jewellery', kg: 0.3 },
  { label: 'Makeup / skincare', kg: 0.4 },
  { label: 'Phone', kg: 0.5 },
  { label: 'Headphones', kg: 0.6 },
]

/** Weights we'd ever quote: 100 g to 110 kg. */
export const ESTIMATE_LIMITS = { maxPriceINR: 10_000_000, minWeightKg: 0.1, maxWeightKg: 110, maxQty: 50 }

export type WeightUnit = 'kg' | 'g'

const fmtNum = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 3 })

/**
 * Reads the weight box: the number typed plus the unit the shopper picked
 * (kg / g), forgiving the common unit slip. Nothing we quote is under
 * 100 g or over 110 kg, so:
 *   - in kg, more than 110      → they meant grams: 540 → 540 g (0.54 kg)
 *   - in g, less than 100       → they meant kilograms: 5 → 5 kg
 *   - still outside the range   → clamped to 100 g / 110 kg
 * `readAs` is the unit the number was actually read in — the box flips its
 * switch to it when the shopper leaves the box. `note` (shown under the
 * box) says what was assumed, so it can be fixed.
 * Empty / zero / not a number → { kg: null } (the default weight applies).
 */
export function interpretWeightInput(
  text: string,
  unit: WeightUnit = 'kg',
): { kg: number | null; readAs: WeightUnit; note: string | null } {
  const n = Number(text)
  if (!text.trim() || !Number.isFinite(n) || n <= 0) return { kg: null, readAs: unit, note: null }
  const { minWeightKg, maxWeightKg } = ESTIMATE_LIMITS
  const clamp = (kg: number) => Math.min(maxWeightKg, Math.max(minWeightKg, kg))

  // Which unit does this number really mean?
  let readAs: WeightUnit = unit
  if (unit === 'kg' && n > maxWeightKg) readAs = 'g'
  else if (unit === 'g' && n < minWeightKg * 1000) readAs = 'kg'

  const raw = readAs === 'g' ? n / 1000 : n
  const kg = clamp(raw)

  let note: string | null = null
  if (raw < minWeightKg) note = `Under 100 g, so we used 100 g`
  else if (raw > maxWeightKg) note = `Over ${maxWeightKg} kg, so we used ${maxWeightKg} kg`
  else if (readAs !== unit) note = readAs === 'g' ? `Read as ${fmtNum(n)} g (${fmtNum(kg)} kg)` : `Read as ${fmtNum(n)} kg`
  else if (readAs === 'g') note = `= ${fmtNum(kg)} kg`

  return { kg, readAs, note }
}

export type PriceEstimate = {
  /** One option per delivery method on offer (Express only while Economy is locked). */
  options: { method: 'express' | 'economy'; label: string; perItem: DeliveryPriceOption; totalLKR: number; locked: boolean }[]
  qty: number
  /** The weight actually used — the default block when the shopper didn't give one. */
  weightKg: number
  weightIsDefault: boolean
}

/** The weight the formula uses when none is given (one weight block). */
export function defaultEstimateWeightKg(settings: PricingSettings = getPricingSettings()): number {
  return settings.storefront.weightBlockKg
}

/**
 * Approximate final price in LKR for an Indian-store item. Returns null
 * for an empty or impossible price.
 */
export function estimateIndianItem(
  input: { priceINR: number; weightKg?: number | null; qty?: number },
  settings: PricingSettings = getPricingSettings(),
): PriceEstimate | null {
  const price = Number(input.priceINR)
  if (!Number.isFinite(price) || price <= 0 || price > ESTIMATE_LIMITS.maxPriceINR) return null
  const qty = Math.min(ESTIMATE_LIMITS.maxQty, Math.max(1, Math.floor(Number(input.qty) || 1)))
  const given = Number(input.weightKg)
  const weightIsDefault = !(Number.isFinite(given) && given > 0)
  const weightKg = weightIsDefault
    ? defaultEstimateWeightKg(settings)
    : Math.min(ESTIMATE_LIMITS.maxWeightKg, Math.max(ESTIMATE_LIMITS.minWeightKg, given))

  const dual = getDualDeliveryPricing({ price, currency: 'INR', weightKg, origin: 'IN' }, settings)
  const options: PriceEstimate['options'] = [
    { method: 'express', label: 'Express', perItem: dual.express, totalLKR: dual.express.actualTotalLKR * qty, locked: false },
    {
      method: 'economy',
      label: 'Economy',
      perItem: dual.economy,
      totalLKR: dual.economy.actualTotalLKR * qty,
      locked: isEconomyLocked(settings),
    },
  ]
  return { options, qty, weightKg, weightIsDefault }
}
