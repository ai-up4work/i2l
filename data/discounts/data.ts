// data/discounts/data.ts
//
// Mirrors data/collections/data.ts and data/sellers/data.ts's shape: label
// maps for rendering, a flat constant array for list-page filtering, and a
// getDiscount(id) lookup for the detail page. Replace ADMIN_DISCOUNTS and
// the functions below with real fetches once the Discount table exists
// (see requirements doc, section 6/7 — Collections pages were built the
// same way first, this follows that precedent).
//
// One discount record covers every kind of promo the business runs:
// storewide %, threshold ("10% off orders over Rs 5,000"), seller-specific,
// collection-specific, product-specific, coupon-code, automatic, and
// free-gift. Rather than separate tables per promo type, everything is one
// row with a `type` + `scope` that together determine which fields matter —
// same "one shape, branch on a field" approach as Sellers (feed-integrated
// vs manual-mode) in data/sellers/data.ts.

export type DiscountType = 'percentage' | 'fixed' | 'free_gift'

export type DiscountMethod = 'code' | 'automatic'

export type DiscountScopeType = 'storewide' | 'seller' | 'collection' | 'products'

// Display-only status. Never stored directly — always derived from
// `enabled` + `startsAt`/`endsAt` + usage caps via getDiscountStatus(),
// the same way a real backend would compute it at read time rather than
// risk a stale stored status drifting from the dates. `enabled` is the
// one manual switch ops actually flips (mirrors the draft/published
// toggle on Collections); everything else here is math on top of it.
export type DiscountStatus = 'draft' | 'scheduled' | 'active' | 'expired' | 'disabled'

export const STATUS_LABEL: Record<DiscountStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  active: 'Active',
  expired: 'Expired',
  disabled: 'Disabled',
}

// Same pill/badge role as STATUS_STYLE in data/collections/data.ts.
export const STATUS_STYLE: Record<DiscountStatus, string> = {
  active: 'bg-teal/12 text-teal-deep ring-1 ring-inset ring-teal/25',
  scheduled: 'bg-indigo/12 text-indigo-deep ring-1 ring-inset ring-indigo/25',
  draft: 'bg-ink/[0.05] text-ink/50 ring-1 ring-inset ring-ink/10',
  expired: 'bg-ink/[0.05] text-ink/40 ring-1 ring-inset ring-ink/10',
  disabled: 'bg-ink/[0.05] text-ink/40 ring-1 ring-inset ring-ink/10',
}

export const TYPE_LABEL: Record<DiscountType, string> = {
  percentage: 'Percentage off',
  fixed: 'Fixed amount off',
  free_gift: 'Free gift',
}

export const METHOD_LABEL: Record<DiscountMethod, string> = {
  code: 'Coupon code',
  automatic: 'Automatic',
}

export const SCOPE_LABEL: Record<DiscountScopeType, string> = {
  storewide: 'Storewide',
  seller: 'Specific seller',
  collection: 'Specific collection',
  products: 'Specific products',
}

// What a discount applies to. Only the fields matching `type` are
// populated — e.g. a 'seller' scope only fills sellerId/sellerName, a
// 'products' scope only fills productIds/productNames. Names are
// denormalized onto the record (same choice CollectionItem makes with
// productName/sellerName) so list/detail pages don't need extra joins
// against mock data — a real API would either do the join server-side or
// keep this same denormalized shape for read performance.
export type DiscountScopeTarget = {
  type: DiscountScopeType
  sellerId?: string
  sellerName?: string
  collectionId?: string
  collectionName?: string
  productIds?: string[]
  productNames?: string[]
}

export type Discount = {
  id: string
  name: string // internal/ops-facing label, e.g. "Diwali storewide 15%"
  description: string
  type: DiscountType
  method: DiscountMethod
  code?: string // required when method === 'code'
  value?: number // percentage (0–100) or fixed Rs amount; unused for free_gift
  giftProductId?: string // used only when type === 'free_gift'
  giftProductName?: string
  scope: DiscountScopeTarget
  minPurchaseAmount?: number | null // e.g. 5000 → "on orders over Rs. 5,000"
  usageLimitTotal?: number | null // null = unlimited
  usageLimitPerCustomer?: number | null // null = unlimited
  usageCount: number // times redeemed so far
  enabled: boolean // manual on/off switch, independent of dates
  startsAt: string // ISO
  endsAt?: string | null // null = no end date
  updatedAt: string // ISO
}

function computeStatus(d: Discount, now: Date = new Date()): DiscountStatus {
  if (!d.enabled) return d.usageCount > 0 || new Date(d.startsAt) < now ? 'disabled' : 'draft'
  if (new Date(d.startsAt) > now) return 'scheduled'
  if (d.endsAt && new Date(d.endsAt) < now) return 'expired'
  if (d.usageLimitTotal != null && d.usageCount >= d.usageLimitTotal) return 'expired'
  return 'active'
}

export function getDiscountStatus(discount: Discount): DiscountStatus {
  return computeStatus(discount)
}

// Human-readable value string for list/detail display, e.g. "15% off",
// "Rs. 500 off", "Free gift: Brass Diya Set (6pc)".
export function formatDiscountValue(discount: Discount): string {
  switch (discount.type) {
    case 'percentage':
      return `${discount.value ?? 0}% off`
    case 'fixed':
      return `Rs. ${(discount.value ?? 0).toLocaleString('en-LK')} off`
    case 'free_gift':
      return `Free gift: ${discount.giftProductName ?? 'Unassigned'}`
  }
}

// Human-readable scope string for list/detail display.
export function formatDiscountScope(discount: Discount): string {
  const s = discount.scope
  switch (s.type) {
    case 'storewide':
      return 'Storewide'
    case 'seller':
      return s.sellerName ? `Seller: ${s.sellerName}` : 'Seller (unassigned)'
    case 'collection':
      return s.collectionName ? `Collection: ${s.collectionName}` : 'Collection (unassigned)'
    case 'products':
      if (!s.productNames || s.productNames.length === 0) return 'Products (unassigned)'
      return s.productNames.length === 1
        ? s.productNames[0]
        : `${s.productNames[0]} + ${s.productNames.length - 1} more`
  }
}

// Flat constant, filtered directly by the list page — same pattern as
// ADMIN_SELLERS / ADMIN_COLLECTIONS.
export const ADMIN_DISCOUNTS: Discount[] = [
  {
    id: 'disc_diwali_storewide',
    name: 'Diwali storewide 15%',
    description: 'Platform-wide festive discount across every affiliated store.',
    type: 'percentage',
    method: 'automatic',
    value: 15,
    scope: { type: 'storewide' },
    minPurchaseAmount: null,
    usageLimitTotal: null,
    usageLimitPerCustomer: null,
    usageCount: 482,
    enabled: true,
    startsAt: '2026-09-01T00:00:00.000Z',
    endsAt: '2026-10-05T23:59:59.000Z',
    updatedAt: '2026-09-08T10:00:00.000Z',
  },
  {
    id: 'disc_spend_5000',
    name: 'Rs. 500 off orders over Rs. 5,000',
    description: 'Spend-threshold incentive to lift average order value storewide.',
    type: 'fixed',
    method: 'automatic',
    value: 500,
    scope: { type: 'storewide' },
    minPurchaseAmount: 5000,
    usageLimitTotal: null,
    usageLimitPerCustomer: 1,
    usageCount: 129,
    enabled: true,
    startsAt: '2026-08-15T00:00:00.000Z',
    endsAt: null,
    updatedAt: '2026-09-06T12:00:00.000Z',
  },
  {
    id: 'disc_welcome10',
    name: 'WELCOME10',
    description: 'First-order coupon for new customers, shared via onboarding email.',
    type: 'percentage',
    method: 'code',
    code: 'WELCOME10',
    value: 10,
    scope: { type: 'storewide' },
    minPurchaseAmount: null,
    usageLimitTotal: 1000,
    usageLimitPerCustomer: 1,
    usageCount: 341,
    enabled: true,
    startsAt: '2026-06-01T00:00:00.000Z',
    endsAt: null,
    updatedAt: '2026-09-01T09:00:00.000Z',
  },
  {
    id: 'disc_meera_textiles_20',
    name: 'Meera Textiles 20% off',
    description: 'Seller-funded promo to clear festive kurta stock.',
    type: 'percentage',
    method: 'code',
    code: 'MEERA20',
    value: 20,
    scope: { type: 'seller', sellerId: 'sel_meera_textiles', sellerName: 'Meera Textiles' },
    minPurchaseAmount: null,
    usageLimitTotal: 200,
    usageLimitPerCustomer: 1,
    usageCount: 57,
    enabled: true,
    startsAt: '2026-09-05T00:00:00.000Z',
    endsAt: '2026-09-20T23:59:59.000Z',
    updatedAt: '2026-09-07T15:00:00.000Z',
  },
  {
    id: 'disc_diwali_picks_10',
    name: 'Diwali Picks collection 10%',
    description: 'Extra discount layered on top of the Diwali Picks shelf.',
    type: 'percentage',
    method: 'automatic',
    value: 10,
    scope: { type: 'collection', collectionId: 'col_diwali', collectionName: 'Diwali Picks' },
    minPurchaseAmount: null,
    usageLimitTotal: null,
    usageLimitPerCustomer: null,
    usageCount: 96,
    enabled: true,
    startsAt: '2026-09-08T00:00:00.000Z',
    endsAt: '2026-10-05T23:59:59.000Z',
    updatedAt: '2026-09-08T10:00:00.000Z',
  },
  {
    id: 'disc_diya_free_gift',
    name: 'Free diya set over Rs. 8,000',
    description: 'Free-gift promo tied to two specific festive products.',
    type: 'free_gift',
    method: 'automatic',
    giftProductId: 'p_102',
    giftProductName: 'Brass Diya Set (6pc)',
    scope: {
      type: 'products',
      productIds: ['p_101', 'p_103'],
      productNames: ['Embroidered Silk Kurta', 'Hand-block Print Dupatta'],
    },
    minPurchaseAmount: 8000,
    usageLimitTotal: 150,
    usageLimitPerCustomer: 1,
    usageCount: 22,
    enabled: true,
    startsAt: '2026-09-08T00:00:00.000Z',
    endsAt: '2026-10-05T23:59:59.000Z',
    updatedAt: '2026-09-08T10:00:00.000Z',
  },
  {
    id: 'disc_new_year_preview',
    name: 'New Year storewide 20%',
    description: 'Scheduled for the New Year sale — not live yet.',
    type: 'percentage',
    method: 'automatic',
    value: 20,
    scope: { type: 'storewide' },
    minPurchaseAmount: null,
    usageLimitTotal: null,
    usageLimitPerCustomer: null,
    usageCount: 0,
    enabled: true,
    startsAt: '2026-12-28T00:00:00.000Z',
    endsAt: '2027-01-03T23:59:59.000Z',
    updatedAt: '2026-09-09T08:00:00.000Z',
  },
  {
    id: 'disc_summer_clearance_ended',
    name: 'Summer clearance 25%',
    description: 'Past promo, kept for reference/reporting.',
    type: 'percentage',
    method: 'code',
    code: 'SUMMER25',
    value: 25,
    scope: { type: 'storewide' },
    minPurchaseAmount: null,
    usageLimitTotal: 500,
    usageLimitPerCustomer: 1,
    usageCount: 500,
    enabled: true,
    startsAt: '2026-06-01T00:00:00.000Z',
    endsAt: '2026-07-15T23:59:59.000Z',
    updatedAt: '2026-07-16T00:00:00.000Z',
  },
  {
    id: 'disc_studio_alma_draft',
    name: 'Studio Alma launch discount',
    description: 'Draft — pending final % from the seller before going live.',
    type: 'percentage',
    method: 'code',
    code: 'ALMANEW',
    value: 15,
    scope: { type: 'seller', sellerId: 'sel_studio_alma', sellerName: 'Studio Alma' },
    minPurchaseAmount: null,
    usageLimitTotal: null,
    usageLimitPerCustomer: 1,
    usageCount: 0,
    enabled: false,
    startsAt: '2026-09-15T00:00:00.000Z',
    endsAt: null,
    updatedAt: '2026-09-10T11:00:00.000Z',
  },
]

// Lightweight lookups for the scope picker in the create/edit form —
// mirrors PICKABLE_PRODUCTS in data/collections/data.ts. Names match the
// mock sellers/collections/products used elsewhere so cross-links (e.g.
// disc_meera_textiles_20 → Meera Textiles) resolve to something real in
// the UI rather than dangling IDs.
export type PickableSeller = { id: string; name: string }
export type PickableCollection = { id: string; name: string }
export type PickableProductRef = { id: string; name: string; sellerName: string }

const PICKABLE_SELLERS: PickableSeller[] = [
  { id: 'sel_meera_textiles', name: 'Meera Textiles' },
  { id: 'sel_home_hearth', name: 'Home & Hearth Co.' },
  { id: 'sel_studio_alma', name: 'Studio Alma' },
  { id: 'sel_riya_accessories', name: 'Riya Accessories' },
]

const PICKABLE_COLLECTIONS: PickableCollection[] = [
  { id: 'col_diwali', name: 'Diwali Picks' },
  { id: 'col_new_this_week', name: 'New This Week' },
  { id: 'col_gift_under_2k', name: 'Gifts Under Rs. 2,000' },
]

const PICKABLE_PRODUCTS: PickableProductRef[] = [
  { id: 'p_101', name: 'Embroidered Silk Kurta', sellerName: 'Meera Textiles' },
  { id: 'p_102', name: 'Brass Diya Set (6pc)', sellerName: 'Home & Hearth Co.' },
  { id: 'p_103', name: 'Hand-block Print Dupatta', sellerName: 'Meera Textiles' },
  { id: 'p_201', name: 'Oversized Linen Shirt', sellerName: 'Studio Alma' },
  { id: 'p_202', name: 'Canvas Tote — Natural', sellerName: 'Studio Alma' },
  { id: 'p_301', name: 'Copper Water Bottle', sellerName: 'Home & Hearth Co.' },
  { id: 'p_302', name: 'Sandalwood Incense (pack of 20)', sellerName: 'Home & Hearth Co.' },
  { id: 'p_401', name: 'Beaded Anklet Set', sellerName: 'Riya Accessories' },
]

export function getDiscount(id: string): Discount | undefined {
  return ADMIN_DISCOUNTS.find((d) => d.id === id)
}

export function getPickableSellers(): PickableSeller[] {
  return PICKABLE_SELLERS
}

export function getPickableCollections(): PickableCollection[] {
  return PICKABLE_COLLECTIONS
}

export function getPickableProducts(): PickableProductRef[] {
  return PICKABLE_PRODUCTS
}