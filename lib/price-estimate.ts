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

export const ESTIMATE_LIMITS = { maxPriceINR: 10_000_000, maxWeightKg: 50, maxQty: 50 }

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
  const weightKg = weightIsDefault ? defaultEstimateWeightKg(settings) : Math.min(given, ESTIMATE_LIMITS.maxWeightKg)

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
