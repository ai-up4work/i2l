// lib/store-modules/casecraft/settings.ts
//
// Case Craft's settings and prices.
//
//   Seller-editable (Prices & models page): which case types and phone
//   models are on sale, the price per size band, the delivery fee,
//   payment methods and the delivery time text. Saved as
//   casecraft_settings.settings.
//
//   Staff only: Wishdrop's margin, a % added on top of every seller
//   price (casecraft_settings.margin_percent). Shown in the seller
//   portal only when a Super Admin / Manager opened it with their own
//   login.
//
//   Shopper price = seller price + margin, rounded up to the next Rs 10.
//   Delivery is added once per order.
//
// Pure — safe to import from client components.

import { CASE_TYPES, modelKey, sizeClassOf, type CaseTypeId, type SizeClass } from './catalog'

export type PaymentMethod = 'cod' | 'bank'

export const PAYMENT_LABELS: Record<PaymentMethod, { label: string; hint: string }> = {
  cod: { label: 'Cash on delivery', hint: 'Pay when your case arrives' },
  bank: { label: 'Bank transfer', hint: 'Pay before we print; bank details after you order' },
}

export type CaseCraftSettings = {
  caseTypes: Record<CaseTypeId, { enabled: boolean; prices: Record<SizeClass, number> }>
  /** modelKey(caseType, label) of models that are switched off. */
  disabledModels: string[]
  deliveryFeeLKR: number
  /** Free delivery from this order total (before delivery). 0 = never. */
  freeDeliveryFromLKR: number
  payments: { cod: boolean; bank: boolean; bankDetails: string }
  /** Shown under the price, e.g. "Printed and delivered in 3 to 5 days". */
  leadTime: string
  /** Most of one item a shopper can order at once. */
  maxQuantity: number
}

const DEFAULT_PRICES: Record<SizeClass, number> = { standard: 2400, pro: 2800, plus: 2900, promax: 3200 }

export const DEFAULT_CASECRAFT_SETTINGS: CaseCraftSettings = {
  caseTypes: {
    'tough-cases': { enabled: true, prices: { ...DEFAULT_PRICES } },
    'tough-phone-cases': { enabled: true, prices: { ...DEFAULT_PRICES } },
  },
  disabledModels: [],
  deliveryFeeLKR: 400,
  freeDeliveryFromLKR: 0,
  payments: { cod: true, bank: true, bankDetails: '' },
  leadTime: 'Printed and delivered in 3 to 5 days',
  maxQuantity: 5,
}

function money(v: unknown, fallback: number): number {
  const n = typeof v === 'string' ? Number(v) : v
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback
  return Math.round(Math.min(1_000_000, Math.max(0, n)))
}

/** Any input -> complete, valid settings. Never throws. */
export function normalizeCaseCraftSettings(raw: unknown): CaseCraftSettings {
  const d = DEFAULT_CASECRAFT_SETTINGS
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const ct = (r.caseTypes ?? {}) as Record<string, unknown>
  const caseTypes = {} as CaseCraftSettings['caseTypes']
  for (const t of CASE_TYPES) {
    const v = (ct[t.id] ?? {}) as Record<string, unknown>
    const p = (v.prices ?? {}) as Record<string, unknown>
    const base = d.caseTypes[t.id]
    caseTypes[t.id] = {
      enabled: typeof v.enabled === 'boolean' ? v.enabled : base.enabled,
      prices: {
        standard: money(p.standard, base.prices.standard),
        pro: money(p.pro, base.prices.pro),
        plus: money(p.plus, base.prices.plus),
        promax: money(p.promax, base.prices.promax),
      },
    }
  }
  const valid = new Set(CASE_TYPES.flatMap((t) => t.models.map((m) => modelKey(t.id, m.label))))
  const disabledModels = Array.isArray(r.disabledModels) ? [...new Set(r.disabledModels.filter((k): k is string => typeof k === 'string' && valid.has(k)))] : []
  const pay = (r.payments ?? {}) as Record<string, unknown>
  const payments = {
    cod: typeof pay.cod === 'boolean' ? pay.cod : d.payments.cod,
    bank: typeof pay.bank === 'boolean' ? pay.bank : d.payments.bank,
    bankDetails: typeof pay.bankDetails === 'string' ? pay.bankDetails.slice(0, 600) : '',
  }
  if (!payments.cod && !payments.bank) payments.cod = true
  const maxQ = money(r.maxQuantity, d.maxQuantity)
  return {
    caseTypes,
    disabledModels,
    deliveryFeeLKR: money(r.deliveryFeeLKR, d.deliveryFeeLKR),
    freeDeliveryFromLKR: money(r.freeDeliveryFromLKR, d.freeDeliveryFromLKR),
    payments,
    leadTime: typeof r.leadTime === 'string' ? r.leadTime.trim().slice(0, 120) : d.leadTime,
    maxQuantity: Math.min(20, Math.max(1, maxQ)),
  }
}

export function normalizeMargin(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : v
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0
  return Math.round(Math.min(500, Math.max(0, n)) * 100) / 100
}

// ---- Prices ---------------------------------------------------------------

/** Seller price + margin, rounded up to the next Rs 10. */
export function shopperPrice(sellerPriceLKR: number, marginPercent: number): number {
  const raw = sellerPriceLKR * (1 + marginPercent / 100)
  return Math.ceil(raw / 10 - 1e-9) * 10
}

/** The seller's price for a custom case of this type and model. */
export function sellerCustomPrice(settings: CaseCraftSettings, caseTypeId: CaseTypeId, modelLabel: string): number {
  return settings.caseTypes[caseTypeId].prices[sizeClassOf(modelLabel)]
}

export function isModelOnSale(settings: CaseCraftSettings, caseTypeId: CaseTypeId, modelLabel: string): boolean {
  return settings.caseTypes[caseTypeId]?.enabled === true && !settings.disabledModels.includes(modelKey(caseTypeId, modelLabel))
}

export function deliveryFor(settings: CaseCraftSettings, subtotalLKR: number): number {
  if (settings.freeDeliveryFromLKR > 0 && subtotalLKR >= settings.freeDeliveryFromLKR) return 0
  return settings.deliveryFeeLKR
}

export function formatRs(n: number): string {
  return `Rs ${Math.round(n).toLocaleString('en-LK')}`
}

// ---- What the storefront gets ------------------------------------------------
// Margin is already applied, so the margin itself never reaches the browser.

export type StorefrontDesign = {
  id: string
  name: string
  subtitle: string | null
  imageUrl: string
  caseTypeId: CaseTypeId
  /** Models it is sold for (already filtered to models on sale). */
  models: string[]
  price: number
  isNew: boolean
  isBestseller: boolean
}

export type StorefrontData = {
  storeSlug: string
  /** Shopper prices per case type and size band. Missing = not on sale. */
  prices: Partial<Record<CaseTypeId, Record<SizeClass, number>>>
  /** Models on sale per case type. */
  models: Partial<Record<CaseTypeId, string[]>>
  designs: StorefrontDesign[]
  deliveryFeeLKR: number
  freeDeliveryFromLKR: number
  payments: PaymentMethod[]
  leadTime: string
  maxQuantity: number
}

export type DesignRow = {
  id: string
  name: string
  subtitle: string | null
  image_url: string
  case_type: string
  models: string[] | null
  price_lkr: number | string
  is_new: boolean | null
  is_bestseller: boolean | null
  active: boolean
  sort: number | null
}

export function buildStorefrontData(storeSlug: string, settings: CaseCraftSettings, marginPercent: number, designs: DesignRow[]): StorefrontData {
  const prices: StorefrontData['prices'] = {}
  const models: StorefrontData['models'] = {}
  for (const t of CASE_TYPES) {
    if (!settings.caseTypes[t.id].enabled) continue
    const onSale = t.models.filter((m) => isModelOnSale(settings, t.id, m.label)).map((m) => m.label)
    if (!onSale.length) continue
    models[t.id] = onSale
    const p = settings.caseTypes[t.id].prices
    prices[t.id] = {
      standard: shopperPrice(p.standard, marginPercent),
      pro: shopperPrice(p.pro, marginPercent),
      plus: shopperPrice(p.plus, marginPercent),
      promax: shopperPrice(p.promax, marginPercent),
    }
  }
  const out: StorefrontDesign[] = []
  for (const d of designs) {
    if (!d.active) continue
    const typeId = d.case_type as CaseTypeId
    const onSale = models[typeId]
    if (!onSale) continue
    const fits = d.models?.length ? d.models.filter((m) => onSale.includes(m)) : onSale
    if (!fits.length) continue
    out.push({
      id: d.id,
      name: d.name,
      subtitle: d.subtitle,
      imageUrl: d.image_url,
      caseTypeId: typeId,
      models: fits,
      price: shopperPrice(Number(d.price_lkr), marginPercent),
      isNew: Boolean(d.is_new),
      isBestseller: Boolean(d.is_bestseller),
    })
  }
  const payments = (['cod', 'bank'] as const).filter((p) => settings.payments[p])
  return {
    storeSlug,
    prices,
    models,
    designs: out,
    deliveryFeeLKR: settings.deliveryFeeLKR,
    freeDeliveryFromLKR: settings.freeDeliveryFromLKR,
    payments,
    leadTime: settings.leadTime,
    maxQuantity: settings.maxQuantity,
  }
}

// ---- Orders -----------------------------------------------------------------

export type OrderStatus = 'new' | 'confirmed' | 'printing' | 'dispatched' | 'delivered' | 'cancelled'

export const ORDER_STATUSES: { id: OrderStatus; label: string; customer: string }[] = [
  { id: 'new', label: 'New', customer: 'Order received' },
  { id: 'confirmed', label: 'Confirmed', customer: 'Confirmed' },
  { id: 'printing', label: 'Printing', customer: 'Being printed' },
  { id: 'dispatched', label: 'Dispatched', customer: 'On the way' },
  { id: 'delivered', label: 'Delivered', customer: 'Delivered' },
  { id: 'cancelled', label: 'Cancelled', customer: 'Cancelled' },
]

export type DeliveryDetails = {
  name: string
  phone: string
  address: string
  city: string
  district: string
  postalCode: string
  notes: string
}

export const SRI_LANKA_DISTRICTS = [
  'Ampara', 'Anuradhapura', 'Badulla', 'Batticaloa', 'Colombo', 'Galle', 'Gampaha', 'Hambantota', 'Jaffna', 'Kalutara',
  'Kandy', 'Kegalle', 'Kilinochchi', 'Kurunegala', 'Mannar', 'Matale', 'Matara', 'Monaragala', 'Mullaitivu', 'Nuwara Eliya',
  'Polonnaruwa', 'Puttalam', 'Ratnapura', 'Trincomalee', 'Vavuniya',
]

export function normalizeDelivery(raw: unknown): DeliveryDetails | null {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const s = (k: string, max = 200) => (typeof r[k] === 'string' ? (r[k] as string).trim().slice(0, max) : '')
  const d: DeliveryDetails = {
    name: s('name', 120),
    phone: s('phone', 30),
    address: s('address', 300),
    city: s('city', 80),
    district: s('district', 40),
    postalCode: s('postalCode', 12),
    notes: s('notes', 500),
  }
  if (!d.name || !d.address || !d.city || !SRI_LANKA_DISTRICTS.includes(d.district)) return null
  if (d.phone.replace(/\D/g, '').length < 9) return null
  return d
}

export function isDeliveryComplete(d: DeliveryDetails): boolean {
  return normalizeDelivery(d) !== null
}
