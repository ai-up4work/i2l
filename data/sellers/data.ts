// data/sellers/data.ts
//
// Admin seller records = a join across the REAL customer-facing sources,
// keyed by `platform`, plus a small admin-only metadata layer for the
// operational fields (contact info, status, notes) that have no reason to
// exist in the customer-facing types:
//   - data/stores/data.ts's `affiliatedStores`  → customer-facing profile
//   - lib/store-config.ts's `STORE_PROVIDERS`   → technical feed config
//   - SELLER_ADMIN_META below                    → admin-only extras
//
// This file does NOT duplicate store name/logo/categories/etc — it reads
// them live from affiliatedStores, so an admin edit that (once wired to a
// real PATCH) updates affiliatedStores is immediately what
// app/api/stores/[platform]/route.ts sees too, with no separate sync step.
//
// Only local sellers (storeType: 'local') are admin-manageable here — the
// four international marketplaces (eBay, Amazon, Rakuten, AliExpress) are
// request-flow channels, not onboarded third-party sellers, so they're
// excluded from ADMIN_SELLERS.

import { affiliatedStores, type AffiliatedStore } from '@/data/stores/data'
import {
  getProviderConfig,
  type StoreProviderConfig,
  type StoreProviderType,
} from '@/lib/store-config'

export type SellerStatus = 'active' | 'pending_review' | 'inactive'

/** Admin-only operational fields — no equivalent in AffiliatedStore or StoreProviderConfig. */
export interface SellerAdminMeta {
  status: SellerStatus
  contactName: string
  contactEmail: string
  contactPhone: string
  notes: string
  joinedAt: string // ISO date
  ordersReceived: number
  ordersPending: number
  /** Whether sellers.owner_user_id is set — i.e. this seller has a real login. */
  hasLogin?: boolean
  /** Wishdrop's markup applied automatically on top of a seller's own cost price. */
  defaultMarginPercent?: number
}

// TODO(wire-up): this becomes a real table (e.g. `seller_admin_meta`,
// keyed by platform) once a sellers API + DB exist. Until then it's the
// one genuinely mock piece here — everything else below reads real data.
const SELLER_ADMIN_META: Record<string, SellerAdminMeta> = {
  'santhiya-fashions': {
    status: 'active',
    contactName: 'Priya Raman',
    contactEmail: 'priya@santhiyafashions.example.com',
    contactPhone: '+91 98765 43210',
    notes: 'Reliable feed, updates stock nightly.',
    joinedAt: '2026-02-11',
    ordersReceived: 58,
    ordersPending: 4,
  },
  'skyt-boutique': {
    status: 'active',
    contactName: 'Ravi Iyer',
    contactEmail: 'ravi@skytboutique.example.com',
    contactPhone: '+91 90123 45678',
    notes:
      'Custom FastAPI backend, discovered via the frontend\u2019s Network tab. See lib/store-config.ts for the confirmed field mapping and which endpoints are still unverified.',
    joinedAt: '2026-06-03',
    ordersReceived: 22,
    ordersPending: 2,
  },
  'be-dapper': {
    status: 'active',
    contactName: 'Ops contact TBD',
    contactEmail: 'hello@bedapper.lk',
    contactPhone: '',
    notes: 'Public keyless wc/store/v1 endpoint, no credentials needed.',
    joinedAt: '2026-01-05',
    ordersReceived: 12,
    ordersPending: 0,
  },
}

const emptyAdminMeta = (): SellerAdminMeta => ({
  status: 'pending_review',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  notes: '',
  joinedAt: new Date().toISOString().slice(0, 10),
  ordersReceived: 0,
  ordersPending: 0,
})

export interface AdminSeller {
  platform: string
  store: AffiliatedStore
  providerConfig: StoreProviderConfig
  admin: SellerAdminMeta
}

export const STATUS_LABEL: Record<SellerStatus, string> = {
  active: 'Active',
  pending_review: 'Pending review',
  inactive: 'Inactive',
}

export const STATUS_STYLE: Record<SellerStatus, string> = {
  active: 'bg-teal-deep/10 text-teal-deep',
  pending_review: 'bg-gold/15 text-ink/70',
  inactive: 'bg-ink/10 text-ink/40',
}

// Human labels for every StoreProviderType — 'jsonapi' and 'html-scrape'
// are presented together in the admin UI as the two flavors of "Custom".
export const EXTRACTOR_TYPE_LABEL: Record<StoreProviderType, string> = {
  mock: 'None \u2014 manual only',
  shopify: 'Shopify',
  woocommerce: 'WooCommerce',
  jsonapi: 'Custom \u2014 JSON backend',
  'html-scrape': 'Custom \u2014 HTML scraping',
}

/** Every local (third-party affiliated) seller, joined across the real sources. */
export const ADMIN_SELLERS: AdminSeller[] = affiliatedStores
  .filter((s) => s.storeType === 'local')
  .map((store) => ({
    platform: store.platform,
    store,
    providerConfig: getProviderConfig(store.platform),
    admin: SELLER_ADMIN_META[store.platform] ?? emptyAdminMeta(),
  }))

export function getSeller(platform: string | undefined): AdminSeller | undefined {
  if (!platform) return undefined
  return ADMIN_SELLERS.find((s) => s.platform === platform)
}

// ---------------------------------------------------------------------------
// Real data path — maps a raw `sellers` table row (as returned by
// /api/admin/sellers or a direct server-side Supabase query) into the same
// AdminSeller shape as ADMIN_SELLERS above, so every consumer of AdminSeller
// (the list page, the add/edit wizard) renders identically regardless of
// whether the seller came from the database or (for anything not migrated
// yet) the hardcoded array above.
// ---------------------------------------------------------------------------
export function mapDbRowToAdminSeller(row: Record<string, unknown>): AdminSeller {
  const providerConfig = (row.provider_config ?? { type: 'mock' }) as Record<string, unknown>
  const display = (providerConfig.display ?? {}) as Record<string, unknown>
  const { display: _display, ...config } = providerConfig

  return {
    platform: row.platform_slug as string,
    store: {
      platform: row.platform_slug as string,
      name: row.name as string,
      logo: (row.logo_url as string) ?? '',
      url: (row.outbound_url as string) ?? undefined,
      country: (row.country as string) ?? '',
      flag: (row.flag_emoji as string) ?? '',
      description: (row.description as string) ?? '',
      categories: (row.categories as string[]) ?? [],
      storeType: row.store_kind as AffiliatedStore['storeType'],
      isNew: display.isNew as boolean | undefined,
      itemCount: display.itemCount as number | undefined,
      bannerStyle: display.bannerStyle as AffiliatedStore['bannerStyle'],
      shipping: display.shipping as string | undefined,
      payment: display.payment as string | undefined,
      tags: display.tags as string[] | undefined,
    },
    providerConfig: config as unknown as StoreProviderConfig,
    admin: {
      status: row.status as SellerStatus,
      contactName: (row.contact_name as string) ?? '',
      contactEmail: (row.contact_email as string) ?? '',
      contactPhone: (row.contact_phone as string) ?? '',
      notes: (row.notes as string) ?? '',
      joinedAt: ((row.created_at as string) ?? new Date().toISOString()).slice(0, 10),
      ordersReceived: 0, // TODO: derive from orders once order_items references sellers
      ordersPending: 0,
      hasLogin: Boolean(row.owner_user_id),
      defaultMarginPercent: row.default_margin_percent != null ? Number(row.default_margin_percent) : 25,
    },
  }
}