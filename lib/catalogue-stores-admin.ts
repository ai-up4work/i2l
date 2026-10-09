// lib/catalogue-stores-admin.ts
//
// Shared by the admin catalogue-store API routes
// (app/api/admin/catalogues/stores/**): which columns to read, and the
// shape sent to the admin UI.

import { isCatalogueStoreRow } from '@/lib/catalogue-stores'

export const STORE_COLUMNS =
  'id, platform_slug, name, type, status, description, logo_url, country, contact_name, contact_email, contact_phone, notes, provider_type, provider_config, owner_user_id, default_margin_percent, created_at'
/** Added by data/wishdrop-social-stores.sql. */
export const PROFILE_COLUMNS = 'cover_url, tagline, instagram_url, facebook_url'

export type StoreRow = Record<string, unknown>

/** Shape sent to the admin UI. */
export function toAdminStore(row: StoreRow, counts?: { total: number; active: number }) {
  return {
    id: row.id as string,
    slug: row.platform_slug as string,
    name: row.name as string,
    status: row.status as string,
    kind: isCatalogueStoreRow(row) ? ('catalogue' as const) : ('legacy' as const),
    description: (row.description as string | null) ?? '',
    logoUrl: (row.logo_url as string | null) ?? '',
    coverUrl: (row.cover_url as string | null) ?? '',
    tagline: (row.tagline as string | null) ?? '',
    instagram: (row.instagram_url as string | null) ?? '',
    facebook: (row.facebook_url as string | null) ?? '',
    country: (row.country as string | null) ?? '',
    contactName: (row.contact_name as string | null) ?? '',
    contactEmail: (row.contact_email as string | null) ?? '',
    contactPhone: (row.contact_phone as string | null) ?? '',
    notes: (row.notes as string | null) ?? '',
    defaultMarginPercent: Number(row.default_margin_percent ?? 25),
    hasLogin: Boolean(row.owner_user_id),
    productCount: counts?.total ?? 0,
    activeProductCount: counts?.active ?? 0,
    createdAt: row.created_at as string,
  }
}

export type AdminStore = ReturnType<typeof toAdminStore>
