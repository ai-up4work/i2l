// lib/weight-estimate.ts
//
// Weight for a pasted-link product (Amazon, Myntra, FirstCry...).
//
// Freight and customs clearance are charged by weight, but almost no store
// page tells us an item's weight. Before this, every such item was quietly
// priced at the weight block (0.5 kg) and the product page only showed the
// store price converted to rupees. Now:
//
//   1. The store's own weight, when the listing has one, plus the packaging
//      margin from the Pricing engine (default 30%) ('store'). The shopper
//      may still change it (not encouraged; then it's an estimate).
//   2. Otherwise the weight category that best matches the product title
//      (Pricing engine → Weight categories), e.g. a kurti → 0.3 kg
//      ('category', guessed = true).
//   3. Otherwise the weight block ('default').
//
// The shopper can change 2 and 3: pick another category ('category') or type
// their own weight ('custom'). Whatever isn't the store's own weight is an
// estimate: checkout saves it on the order item and flags the order so
// staff confirm the weight and price (Admin → order → Price check).
//
// Pure — safe to import from client components and the server.

import { getPricingSettings, type PricingSettings, type WeightPreset } from '@/lib/pricing-settings'

export type WeightSource = 'store' | 'category' | 'custom' | 'default' | 'staff'

/** What a shopper is allowed to type. Staff can go outside this. */
export const CUSTOMER_WEIGHT_LIMITS = { min: 0.1, max: 30 } as const

export type WeightChoice = {
  kg: number
  source: WeightSource
  /** Category id when source = 'category'. */
  presetId?: string | null
  /** Shown next to the weight, e.g. "Shoes & sandals". */
  label?: string | null
  /** True when the category was picked automatically from the title. */
  guessed?: boolean
  /** source 'store': the store's own weight, before the packaging margin. */
  storeKg?: number | null
  /** source 'store': the packaging margin added, in %. */
  marginPercent?: number | null
}

/** The store's weight plus the packaging margin (Pricing engine). */
export function withPackagingMargin(storeKg: number, settings: PricingSettings = getPricingSettings()): number {
  return roundKg(storeKg * (1 + settings.storefront.storeWeightMarginPercent / 100))
}

export function roundKg(kg: number): number {
  return Math.round(kg * 1000) / 1000
}

export function clampCustomerWeight(kg: number): number {
  if (!Number.isFinite(kg)) return CUSTOMER_WEIGHT_LIMITS.min
  return roundKg(Math.min(CUSTOMER_WEIGHT_LIMITS.max, Math.max(CUSTOMER_WEIGHT_LIMITS.min, kg)))
}

/** "0.3 kg", "1.25 kg", "450 g" style label. */
export function formatKg(kg: number): string {
  if (kg < 1) return `${Math.round(kg * 1000)} g`
  return `${Number(kg.toFixed(2))} kg`
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * The weight category whose keyword best matches `text` (the product title,
 * plus category/breadcrumb if known). Whole-word, case-insensitive; the
 * longest matching keyword wins, so "smartwatch" beats "watch" and
 * "sling bag" beats "bag". Null when nothing matches.
 */
export function guessWeightPreset(text: string | null | undefined, presets: WeightPreset[]): WeightPreset | null {
  if (!text) return null
  const hay = ` ${text.toLowerCase().replace(/[^a-z0-9-]+/g, ' ')} `
  let best: { preset: WeightPreset; len: number } | null = null
  for (const preset of presets) {
    for (const kw of preset.keywords) {
      const k = kw.toLowerCase().replace(/[^a-z0-9-]+/g, ' ').trim()
      if (!k) continue
      // Whole word, allowing a plural "s" (shoe → shoes).
      if (new RegExp(`[ ]${escapeRegExp(k)}s?[ ]`).test(hay) && (!best || k.length > best.len)) {
        best = { preset, len: k.length }
      }
    }
  }
  return best?.preset ?? null
}

/** A real, positive weight from the store listing, or null. */
export function storeWeightOf(result: { weightKg?: number | null } | null | undefined): number | null {
  const w = Number(result?.weightKg)
  return Number.isFinite(w) && w > 0 ? roundKg(w) : null
}

/**
 * The weight to price with before the shopper changes anything: the
 * store's own plus the packaging margin, else the best-matching category,
 * else the weight block.
 */
export function initialWeightChoice(
  product: { title?: string | null; category?: string | null; productType?: string | null; weightKg?: number | null },
  settings: PricingSettings = getPricingSettings(),
): WeightChoice {
  const store = storeWeightOf(product)
  if (store != null) {
    const margin = settings.storefront.storeWeightMarginPercent
    return { kg: withPackagingMargin(store, settings), source: 'store', label: 'From the store', storeKg: store, marginPercent: margin }
  }
  const text = [product.title, product.category, product.productType].filter(Boolean).join(' ')
  const preset = guessWeightPreset(text, settings.weightPresets)
  if (preset) return { kg: preset.kg, source: 'category', presetId: preset.id, label: preset.label, guessed: true }
  return { kg: settings.storefront.weightBlockKg, source: 'default', label: 'Standard estimate' }
}

/** True when the weight is ours or the shopper's guess, not the store's. */
export function isEstimatedWeight(source: WeightSource | null | undefined): boolean {
  return source !== 'store' && source !== 'staff'
}

export function isWeightSource(v: unknown): v is WeightSource {
  return v === 'store' || v === 'category' || v === 'custom' || v === 'default' || v === 'staff'
}
