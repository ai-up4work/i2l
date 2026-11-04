// lib/pricing-settings.ts
//
// Every number the pricing engine uses, in ONE editable object.
//
// Before this, the rates lived as hardcoded constants in lib/quote.ts and
// lib/currency-config.ts, so changing a fee meant a code change and a
// deploy. Now:
//
//   - DEFAULT_PRICING_SETTINGS holds the values that used to be hardcoded.
//     They're only used until staff save their own (and as a fallback if
//     the database can't be reached).
//   - The live values are saved in Supabase (table pricing_settings,
//     data/wishdrop-pricing-settings.sql) and edited on Admin → Pricing
//     engine (/admin/super-admin/pricing).
//   - The server loads them once per request cycle (cached, invalidated on
//     save — lib/pricing-settings-server.ts) and hands them to the browser
//     through an inline script in the root layout (pricingSettingsScript), so
//     the server and the browser always price with the same numbers.
//   - lib/quote.ts, lib/pricing.ts, lib/currency-config.ts,
//     lib/store-origin.ts and lib/wishdrop-mall.ts all read from here.
//
// Pure — safe to import from client components.

export interface QuoteRates {
  dutyPercent: number // Duty % only
  palPercent: number // PAL % only
  sscLPercent: number // SSCL % only
  cessPercent: number // Cess % only
  surchargePercent: number // Surcharge % only (on Duty)
  vatPercent: number // VAT % only
}

export interface HsCodeRates extends QuoteRates {
  /** Shown in the HS code dropdown, e.g. "Cotton T-shirts". */
  label: string
}

/** A weight category a shopper can pick for a pasted link whose store
 *  doesn't tell us the weight (lib/weight-estimate.ts). */
export interface WeightPreset {
  /** Stable id, saved on cart lines, e.g. "shoes". */
  id: string
  /** Shown to shoppers, e.g. "Shoes & sandals". */
  label: string
  kg: number
  /** Words in a product title that suggest this category, lower case. */
  keywords: string[]
}

export interface PricingSettings {
  /** How many LKR one unit of each currency is worth. LKR is always 1. */
  currencyRatesToLKR: Record<string, number>

  /** Weight categories for pasted links with no weight from the store.
   *  The best match for the product title is picked automatically and the
   *  shopper can change it (or type their own weight). */
  weightPresets: WeightPreset[]

  /** Storefront pricing (lib/quote.ts calculateSimpleQuote) — what every
   *  product page, card and cart line uses. */
  storefront: {
    profitPercent: number
    /** Freight and customs clearance are billed per block of this many kg. */
    weightBlockKg: number
    /** Pasted links whose store gives a weight: that weight is raised by
     *  this much for packaging (a 400 g item ships at 520 g at 30%). */
    storeWeightMarginPercent: number
    /** Express: freight, LKR per kg (billed in weight blocks). */
    freightRatePerKgLKR: number
    /** Express: customs clearance, LKR per kg (billed in weight blocks). */
    customsClearanceRatePerKgLKR: number
    /** Express: flat delivery fee per item. */
    deliveryFeeLKR: number
    /** Economy: postal charge India → Sri Lanka, LKR per kg (replaces
     *  freight + clearance). Sri Lanka delivery is billed separately below. */
    economyPostalRatePerKgLKR: number
    /** Economy: flat Sri Lanka delivery fee per item — the Economy
     *  counterpart of `deliveryFeeLKR` (Express). Kept separate so the two
     *  methods can be priced independently. */
    economyDeliveryFeeLKR: number
    /** Flat extra margin per item, shown to shoppers as the service charge. */
    extraMarginLKR: number
    /** Economy delivery on offer. Off = shown as "Coming soon" and can't be
     *  chosen anywhere (lib/feature-flags.ts isEconomyLocked). */
    economyEnabled: boolean
  }

  /** Local Sri Lankan stores (lib/store-origin.ts). */
  local: {
    /** Shop → warehouse pickup, once per local store per order. */
    pickupFeeLKR: number
    /** Warehouse → customer delivery, per item. */
    deliveryFeeLKR: number
    /** Margin on a local feed / extractor store's price (social stores
     *  use their own per-product margin). */
    marginPercent: number
  }

  /** Wishdrop Mall (lib/wishdrop-mall.ts). */
  mall: {
    deliveryFeeLKR: number
  }

  /** Customs cascade (lib/quote.ts calculateQuote) — the full Sri Lanka
   *  duty/tax calculation used by the quote calculator. */
  customs: {
    freightRatePerKgLKR: number
    defaultWeightKg: number
    /** HS code → rates. "DEFAULT" is used for any code not listed. */
    hsCodes: Record<string, HsCodeRates>
  }
}

// ---- The values that used to be hardcoded ----------------------------------

export const DEFAULT_PRICING_SETTINGS: PricingSettings = {
  currencyRatesToLKR: {
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
  },
  weightPresets: [
    { id: 'light-clothing', label: 'T-shirt, top or kurti', kg: 0.3, keywords: ['t-shirt', 'tshirt', 'tee', 'top', 'tops', 'kurti', 'kurta', 'blouse', 'shirt', 'leggings', 'innerwear', 'bra', 'brief', 'socks', 'nightwear', 'shorts', 'dupatta', 'scarf', 'stole'] },
    { id: 'clothing', label: 'Dress, jeans or saree', kg: 0.6, keywords: ['dress', 'jeans', 'trouser', 'trousers', 'pant', 'pants', 'saree', 'sari', 'skirt', 'jumpsuit', 'co-ord', 'kurta set', 'salwar', 'suit'] },
    { id: 'heavy-clothing', label: 'Jacket, hoodie or lehenga', kg: 1, keywords: ['jacket', 'hoodie', 'sweatshirt', 'sweater', 'coat', 'blazer', 'lehenga', 'sherwani', 'gown'] },
    { id: 'shoes', label: 'Shoes & sandals', kg: 1.2, keywords: ['shoe', 'shoes', 'sneaker', 'sneakers', 'sandal', 'sandals', 'slipper', 'slippers', 'heels', 'boot', 'boots', 'footwear', 'flip flops', 'loafers', 'mojari', 'juttis'] },
    { id: 'bag', label: 'Bag or handbag', kg: 0.8, keywords: ['bag', 'handbag', 'backpack', 'tote', 'sling bag', 'clutch', 'purse', 'luggage', 'duffle'] },
    { id: 'small', label: 'Beauty, jewellery or small item', kg: 0.3, keywords: ['lipstick', 'serum', 'cream', 'perfume', 'cosmetic', 'makeup', 'shampoo', 'face wash', 'earring', 'earrings', 'necklace', 'bracelet', 'ring', 'jewellery', 'jewelry', 'wallet', 'sunglasses', 'watch', 'belt', 'cap'] },
    { id: 'electronics', label: 'Phone or small electronics', kg: 0.6, keywords: ['phone', 'smartphone', 'earbuds', 'earphones', 'headphones', 'headphone', 'smartwatch', 'charger', 'power bank', 'speaker', 'trimmer', 'mouse', 'keyboard'] },
    { id: 'large-electronics', label: 'Laptop or large electronics', kg: 3, keywords: ['laptop', 'notebook pc', 'monitor', 'printer', 'mixer', 'grinder', 'air fryer', 'microwave', 'tablet'] },
    { id: 'toys', label: 'Toys & kids items', kg: 0.8, keywords: ['toy', 'toys', 'puzzle', 'doll', 'lego', 'diaper', 'diapers', 'baby'] },
    { id: 'books', label: 'Books', kg: 0.5, keywords: ['book', 'novel', 'paperback', 'hardcover'] },
  ],
  storefront: {
    profitPercent: 30,
    weightBlockKg: 0.5,
    storeWeightMarginPercent: 30,
    freightRatePerKgLKR: 2380,
    customsClearanceRatePerKgLKR: 2000,
    deliveryFeeLKR: 450,
    economyPostalRatePerKgLKR: 3500,
    economyDeliveryFeeLKR: 450,
    extraMarginLKR: 250,
    economyEnabled: false,
  },
  local: {
    pickupFeeLKR: 500,
    deliveryFeeLKR: 450,
    marginPercent: 30,
  },
  mall: {
    deliveryFeeLKR: 450,
  },
  customs: {
    freightRatePerKgLKR: 1200,
    defaultWeightKg: 0.5,
    hsCodes: {
      DEFAULT: { label: 'Default rates', dutyPercent: 15, palPercent: 10, sscLPercent: 2.5, cessPercent: 10, surchargePercent: 50, vatPercent: 18 },
      '6109.10': { label: 'Cotton T-shirts', dutyPercent: 15, palPercent: 10, sscLPercent: 2.5, cessPercent: 0, surchargePercent: 50, vatPercent: 18 },
      '8517.13': { label: 'Smartphones', dutyPercent: 0, palPercent: 10, sscLPercent: 2.5, cessPercent: 0, surchargePercent: 0, vatPercent: 18 },
      '9503.00': { label: 'Toys', dutyPercent: 15, palPercent: 10, sscLPercent: 2.5, cessPercent: 15, surchargePercent: 50, vatPercent: 18 },
    },
  },
}

// ---- Validation ----------------------------------------------------------------

/** Field limits, used by normalisation and the admin form. */
export const PRICING_LIMITS = {
  money: { min: 0, max: 1_000_000 },
  percent: { min: 0, max: 1000 },
  weightKg: { min: 0.01, max: 100 },
  rate: { min: 0.0001, max: 1_000_000 },
} as const

function num(value: unknown, fallback: number, limits: { min: number; max: number }): number {
  const n = typeof value === 'string' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback
  return Math.min(limits.max, Math.max(limits.min, n))
}

const RATE_KEYS: (keyof QuoteRates)[] = ['dutyPercent', 'palPercent', 'sscLPercent', 'cessPercent', 'surchargePercent', 'vatPercent']

/**
 * Turns anything (a saved JSON blob, a form submission) into a complete,
 * valid PricingSettings: missing or broken fields fall back to the
 * defaults, numbers are clamped to sane ranges, LKR is always 1 and the
 * DEFAULT HS code always exists. Never throws.
 */
export function normalizePricingSettings(raw: unknown): PricingSettings {
  const d = DEFAULT_PRICING_SETTINGS
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const sf = (r.storefront ?? {}) as Record<string, unknown>
  const lo = (r.local ?? {}) as Record<string, unknown>
  const ma = (r.mall ?? {}) as Record<string, unknown>
  const cu = (r.customs ?? {}) as Record<string, unknown>

  // Currencies: 3-letter codes, positive rates. Falls back to the defaults
  // if nothing valid was given at all.
  const rawRates = (r.currencyRatesToLKR ?? null) as Record<string, unknown> | null
  const rates: Record<string, number> = {}
  if (rawRates && typeof rawRates === 'object') {
    for (const [code, value] of Object.entries(rawRates)) {
      const c = code.trim().toUpperCase()
      if (!/^[A-Z]{3}$/.test(c)) continue
      const n = num(value, NaN, PRICING_LIMITS.rate)
      if (Number.isFinite(n)) rates[c] = n
    }
  }
  const currencyRatesToLKR = Object.keys(rates).length ? rates : { ...d.currencyRatesToLKR }
  currencyRatesToLKR.LKR = 1

  // HS codes: keep valid entries; DEFAULT always present.
  const rawCodes = (cu.hsCodes ?? null) as Record<string, unknown> | null
  const hsCodes: Record<string, HsCodeRates> = {}
  const source = rawCodes && typeof rawCodes === 'object' && Object.keys(rawCodes).length ? rawCodes : d.customs.hsCodes
  for (const [code, value] of Object.entries(source)) {
    const c = code.trim()
    if (!c || c.length > 20) continue
    const v = (value ?? {}) as Record<string, unknown>
    const base = d.customs.hsCodes[c] ?? d.customs.hsCodes.DEFAULT
    const entry = { label: typeof v.label === 'string' ? v.label.trim().slice(0, 80) : base.label } as HsCodeRates
    for (const k of RATE_KEYS) entry[k] = num(v[k], base[k], PRICING_LIMITS.percent)
    hsCodes[c] = entry
  }
  if (!hsCodes.DEFAULT) hsCodes.DEFAULT = { ...d.customs.hsCodes.DEFAULT }

  // Weight categories: settings saved before this existed get the defaults.
  // An explicitly empty list is kept (staff turned categories off).
  const rawPresets = Array.isArray(r.weightPresets) ? (r.weightPresets as unknown[]) : null
  const weightPresets: WeightPreset[] = []
  const seenIds = new Set<string>()
  for (const p of rawPresets ?? d.weightPresets) {
    const v = (p ?? {}) as Record<string, unknown>
    const label = typeof v.label === 'string' ? v.label.trim().slice(0, 60) : ''
    const kg = num(v.kg, NaN, PRICING_LIMITS.weightKg)
    if (!label || !Number.isFinite(kg)) continue
    let id = (typeof v.id === 'string' && v.id.trim() ? v.id : label)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'category'
    while (seenIds.has(id)) id = `${id}-2`
    seenIds.add(id)
    const keywords = (Array.isArray(v.keywords) ? v.keywords : typeof v.keywords === 'string' ? v.keywords.split(',') : [])
      .filter((k): k is string => typeof k === 'string')
      .map((k) => k.trim().toLowerCase().slice(0, 40))
      .filter(Boolean)
      .slice(0, 40)
    weightPresets.push({ id, label, kg, keywords })
    if (weightPresets.length >= 20) break
  }

  return {
    currencyRatesToLKR,
    weightPresets,
    storefront: {
      profitPercent: num(sf.profitPercent, d.storefront.profitPercent, PRICING_LIMITS.percent),
      weightBlockKg: num(sf.weightBlockKg, d.storefront.weightBlockKg, PRICING_LIMITS.weightKg),
      storeWeightMarginPercent: num(sf.storeWeightMarginPercent, d.storefront.storeWeightMarginPercent, { min: 0, max: 200 }),
      freightRatePerKgLKR: num(sf.freightRatePerKgLKR, d.storefront.freightRatePerKgLKR, PRICING_LIMITS.money),
      customsClearanceRatePerKgLKR: num(sf.customsClearanceRatePerKgLKR, d.storefront.customsClearanceRatePerKgLKR, PRICING_LIMITS.money),
      deliveryFeeLKR: num(sf.deliveryFeeLKR, d.storefront.deliveryFeeLKR, PRICING_LIMITS.money),
      economyPostalRatePerKgLKR: num(sf.economyPostalRatePerKgLKR, d.storefront.economyPostalRatePerKgLKR, PRICING_LIMITS.money),
      economyDeliveryFeeLKR: num(sf.economyDeliveryFeeLKR, d.storefront.economyDeliveryFeeLKR, PRICING_LIMITS.money),
      extraMarginLKR: num(sf.extraMarginLKR, d.storefront.extraMarginLKR, PRICING_LIMITS.money),
      economyEnabled: typeof sf.economyEnabled === 'boolean' ? sf.economyEnabled : d.storefront.economyEnabled,
    },
    local: {
      pickupFeeLKR: num(lo.pickupFeeLKR, d.local.pickupFeeLKR, PRICING_LIMITS.money),
      deliveryFeeLKR: num(lo.deliveryFeeLKR, d.local.deliveryFeeLKR, PRICING_LIMITS.money),
      marginPercent: num(lo.marginPercent, d.local.marginPercent, PRICING_LIMITS.percent),
    },
    mall: {
      deliveryFeeLKR: num(ma.deliveryFeeLKR, d.mall.deliveryFeeLKR, PRICING_LIMITS.money),
    },
    customs: {
      freightRatePerKgLKR: num(cu.freightRatePerKgLKR, d.customs.freightRatePerKgLKR, PRICING_LIMITS.money),
      defaultWeightKg: num(cu.defaultWeightKg, d.customs.defaultWeightKg, PRICING_LIMITS.weightKg),
      hsCodes,
    },
  }
}

// ---- The live settings -------------------------------------------------------------
//
// One module-level value per JavaScript runtime (the server process, and
// each browser tab). The server sets it from the database before pricing
// anything (ensurePricingSettings). The browser gets the same object from
// an inline <script> the root layout writes into <head>
// (PRICING_SETTINGS_GLOBAL), which runs before any page code. Every
// pricing function reads it through getPricingSettings(), or takes an
// explicit `settings` argument (the admin page uses that to preview
// unsaved changes).

/** window property the root layout's inline script sets. */
export const PRICING_SETTINGS_GLOBAL = '__WISHDROP_PRICING__'

let current: PricingSettings = DEFAULT_PRICING_SETTINGS
let browserLoaded = false

export function getPricingSettings(): PricingSettings {
  if (!browserLoaded && typeof window !== 'undefined') {
    browserLoaded = true
    const injected = (window as unknown as Record<string, unknown>)[PRICING_SETTINGS_GLOBAL]
    if (injected) current = normalizePricingSettings(injected)
  }
  return current
}

/** The inline script the root layout puts in <head>: hands the server's
 *  saved settings to the browser. `<` is escaped so the JSON can't close
 *  the script tag. */
export function pricingSettingsScript(settings: PricingSettings): string {
  return `window.${PRICING_SETTINGS_GLOBAL}=${JSON.stringify(settings).replace(/</g, '\\u003c')};`
}

export function setPricingSettings(settings: PricingSettings): void {
  current = settings
  browserLoaded = true
}

/** HS codes other than DEFAULT, for dropdowns. */
export function hsCodeOptions(settings: PricingSettings = current): { code: string; label: string }[] {
  return Object.entries(settings.customs.hsCodes)
    .filter(([code]) => code !== 'DEFAULT')
    .map(([code, v]) => ({ code, label: v.label ? `${code} — ${v.label}` : code }))
}
