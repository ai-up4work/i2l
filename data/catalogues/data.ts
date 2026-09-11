// data/catalogues/data.ts

import { ADMIN_SELLERS } from '@/data/sellers/data'

// ---------------------------------------------------------------------------
// Catalogue entries — Sales & Purchase Executive (full access) +
// Seller Dashboard (own entries, cost price + availability only).
//
// Two roles write to the same record with different boundaries:
//   - Admin/Manager/Sales & Purchase: full field access, can approve/reject
//     a seller's proposed change, sees sellingPrice/markup/margin.
//   - Seller: can only PROPOSE a change to costPrice/inStock/variant
//     availability — never writes directly, never sees sellingPrice,
//     markupPercent, or any margin/profit figure (§ decision: hide
//     margin entirely from the seller view — showing both cost and
//     selling price together would let them subtract it out anyway, so
//     sellingPrice is simply never sent to the seller-facing page).
//
// pendingChange holds exactly one outstanding proposal at a time (a
// second submission before the first is reviewed overwrites it, rather
// than queuing multiple — keeps "what's live vs proposed" a single
// unambiguous diff for the admin reviewing it).
//
// ADDED (admin Catalogues pages): approve/reject is identical for Manager
// and Super Admin — both review the same pendingChange the same way.
// updateCataloguePricing() is the one Super-Admin-only power: editing
// costPrice/markupPercent directly, without going through a seller's
// change request. The admin detail page only renders the UI for this when
// role === "super_admin" — the function itself has no permission check
// since it's a mock; a real API would enforce that server-side.
// ---------------------------------------------------------------------------

export type CatalogueStatus = 'active' | 'draft' | 'hidden'

export const STATUS_LABEL: Record<CatalogueStatus, string> = {
  active: 'Active',
  draft: 'Draft',
  hidden: 'Hidden',
}

export const STATUS_DOT: Record<CatalogueStatus, string> = {
  active: 'bg-teal-deep',
  draft: 'bg-gold-deep',
  hidden: 'bg-ink/30',
}

export const STATUS_PILL: Record<CatalogueStatus, string> = {
  active: 'bg-teal/12 text-teal-deep ring-1 ring-inset ring-teal/25',
  draft: 'bg-gold/15 text-gold-deep ring-1 ring-inset ring-gold/30',
  hidden: 'bg-ink/[0.05] text-ink/50 ring-1 ring-inset ring-ink/10',
}

export interface CatalogueVariant {
  id: string
  title: string
  size?: string
  color?: string
  costPrice: number
  sellingPrice: number
  available: boolean
}

export interface CatalogueChangeRequest {
  id: string
  submittedBy: 'seller' | 'admin'
  submittedByName?: string
  submittedAt: string
  note?: string
  changes: {
    costPrice?: number
    inStock?: boolean
    variants?: { id: string; costPrice: number; available: boolean }[]
  }
}

export interface CatalogueEntry {
  id: string
  title: string
  description?: string
  sellerId: string // matches an ADMIN_SELLERS platform slug
  sourceProductId?: string
  sourceUrl?: string
  images: string[]
  category?: string
  costPrice: number
  currency: string
  markupPercent: number
  sellingPrice: number
  sizes?: string[]
  colors?: string[]
  variants?: CatalogueVariant[]
  inStock: boolean
  status: CatalogueStatus
  createdAt: string
  /** A seller-submitted (or admin-submitted) proposed change awaiting
   * Manager/Super Admin review. Null/undefined = nothing pending. */
  pendingChange?: CatalogueChangeRequest | null
}

// ---------------------------------------------------------------------------
// Mock data — swap for a real fetch once app/api/admin/catalogues exists.
// ---------------------------------------------------------------------------

const MOCK_CATALOGUES: CatalogueEntry[] = [
  {
    id: 'cat_001',
    title: 'Banarasi Silk Saree — Emerald',
    description: 'Handwoven Banarasi silk with gold zari border, unstitched blouse piece included.',
    sellerId: ADMIN_SELLERS[0]?.platform ?? 'unknown-seller',
    sourceProductId: 'shopify_8891234',
    images: [],
    category: 'Sarees',
    costPrice: 4200,
    currency: 'INR',
    markupPercent: 22,
    sellingPrice: 5124,
    sizes: [],
    colors: ['Emerald', 'Maroon', 'Royal Blue'],
    variants: [
      { id: 'v1', title: 'Emerald', color: 'Emerald', costPrice: 4200, sellingPrice: 5124, available: true },
      { id: 'v2', title: 'Maroon', color: 'Maroon', costPrice: 4200, sellingPrice: 5124, available: true },
      { id: 'v3', title: 'Royal Blue', color: 'Royal Blue', costPrice: 4350, sellingPrice: 5307, available: false },
    ],
    inStock: true,
    status: 'active',
    createdAt: '2026-07-14T10:00:00Z',
    pendingChange: {
      id: 'chg_001',
      submittedBy: 'seller',
      submittedByName: 'Chennai Silk House',
      submittedAt: '2026-09-08T09:15:00Z',
      note: 'Cotton price went up with our supplier, adjusting cost.',
      changes: { costPrice: 4450 },
    },
  },
  {
    id: 'cat_002',
    title: "Men's Kurta Set — Cream",
    sellerId: ADMIN_SELLERS[0]?.platform ?? 'unknown-seller',
    images: [],
    category: 'Menswear',
    costPrice: 1800,
    currency: 'INR',
    markupPercent: 25,
    sellingPrice: 2250,
    sizes: ['S', 'M', 'L', 'XL'],
    inStock: true,
    status: 'draft',
    createdAt: '2026-08-02T10:00:00Z',
  },
]

export const ADMIN_CATALOGUES: CatalogueEntry[] = MOCK_CATALOGUES

export function getCatalogueEntry(id: string): CatalogueEntry | undefined {
  return ADMIN_CATALOGUES.find((c) => c.id === id)
}

export function getCataloguesForSeller(sellerId: string): CatalogueEntry[] {
  return ADMIN_CATALOGUES.filter((c) => c.sellerId === sellerId)
}

export function getSellerName(sellerId: string): string {
  return ADMIN_SELLERS.find((s) => s.platform === sellerId)?.store.name ?? 'Unknown seller'
}

export function computeSellingPrice(costPrice: number, markupPercent: number): number {
  return Math.round(costPrice * (1 + markupPercent / 100))
}

// ---------------------------------------------------------------------------
// Change-request mutations. Mutates ADMIN_CATALOGUES in place for this
// mock — TODO(wire-up): replace with real API calls:
//   POST  /api/seller/catalogues/[id]/propose-change
//   POST  /api/admin/catalogues/[id]/approve-change
//   POST  /api/admin/catalogues/[id]/reject-change
// ---------------------------------------------------------------------------

export function submitChangeRequest(
  catalogueId: string,
  submittedBy: 'seller' | 'admin',
  changes: CatalogueChangeRequest['changes'],
  note?: string,
  submittedByName?: string
): CatalogueChangeRequest | null {
  const entry = getCatalogueEntry(catalogueId)
  if (!entry) return null
  const request: CatalogueChangeRequest = {
    id: `chg_${Date.now()}`,
    submittedBy,
    submittedByName,
    submittedAt: new Date().toISOString(),
    note,
    changes,
  }
  entry.pendingChange = request
  return request
}

export function approveChangeRequest(catalogueId: string): boolean {
  const entry = getCatalogueEntry(catalogueId)
  if (!entry?.pendingChange) return false
  const { costPrice, inStock, variants } = entry.pendingChange.changes
  if (costPrice != null) {
    entry.costPrice = costPrice
    entry.sellingPrice = computeSellingPrice(costPrice, entry.markupPercent)
  }
  if (inStock != null) entry.inStock = inStock
  if (variants && entry.variants) {
    entry.variants = entry.variants.map((v) => {
      const proposed = variants.find((p) => p.id === v.id)
      if (!proposed) return v
      return {
        ...v,
        costPrice: proposed.costPrice,
        sellingPrice: computeSellingPrice(proposed.costPrice, entry.markupPercent),
        available: proposed.available,
      }
    })
  }
  entry.pendingChange = null
  return true
}

export function rejectChangeRequest(catalogueId: string): boolean {
  const entry = getCatalogueEntry(catalogueId)
  if (!entry?.pendingChange) return false
  entry.pendingChange = null
  return true
}

// ---------------------------------------------------------------------------
// Super-Admin-only direct override — bypasses the seller change-request
// flow entirely. Recomputes sellingPrice from the new costPrice/markup
// so the two numbers never drift apart. Manager pages must not render a
// UI path that calls this; Manager reviews via approve/rejectChangeRequest
// only.
// ---------------------------------------------------------------------------

export function updateCataloguePricing(
  catalogueId: string,
  updates: { costPrice?: number; markupPercent?: number }
): boolean {
  const entry = getCatalogueEntry(catalogueId)
  if (!entry) return false
  if (updates.costPrice != null) entry.costPrice = updates.costPrice
  if (updates.markupPercent != null) entry.markupPercent = updates.markupPercent
  entry.sellingPrice = computeSellingPrice(entry.costPrice, entry.markupPercent)
  return true
}

// TODO(wire-up): replace with the real seller session lookup once seller
// auth exists (§3/§4.2 — separate auth system, never joins admin_users).
export function getCurrentSellerId(): string {
  return ADMIN_SELLERS[0]?.platform ?? ''
}