// lib/wishdrop-mall/admin.ts
//
// SERVER-ONLY helpers shared by app/api/admin/wishdrop-mall/**. Every
// caller has already passed requireStaffRole(SOURCING_ROLES) and hands in
// the service-role client from that check.

import type { createServiceRoleClient } from '@/lib/supabase/server'
import { WISHDROP_MALL_SLUG, type MallStoreRow } from '@/lib/wishdrop-mall'

export type AdminClient = ReturnType<typeof createServiceRoleClient>

export const MALL_STORE_COLUMNS =
  'id, platform_slug, name, description, logo_url, status, categories'

export const MALL_PRODUCT_COLUMNS =
  'id, seller_id, handle, name, category, images, cost_price, margin_percent, price, compare_at_price, currency, stock_count, active, created_at, updated_at, source_platform, source_handle, source_url, source_price, source_currency, source_synced_at'

export async function getMallStore(admin: AdminClient): Promise<MallStoreRow | null> {
  const { data, error } = await admin
    .from('sellers')
    .select(MALL_STORE_COLUMNS)
    .eq('platform_slug', WISHDROP_MALL_SLUG)
    .maybeSingle()
  if (error) throw error
  return (data as unknown as MallStoreRow | null) ?? null
}

/** A positive LKR amount, rounded to whole rupees. Null if invalid. */
export function toLKR(value: unknown): number | null {
  const n = typeof value === 'string' ? parseFloat(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0 || n > 100_000_000) return null
  return Math.round(n)
}

/** Optional "was" price: must be higher than the price, else dropped. */
export function compareAtOrNull(value: unknown, price: number): number | null {
  const n = toLKR(value)
  return n != null && n > price ? n : null
}

/** Loads a product and confirms it belongs to the Mall — every
 *  per-product Mall route must go through this so it can't be used to
 *  edit some other seller's product. */
export async function loadMallProduct(admin: AdminClient, mallId: string, productId: string) {
  const { data, error } = await admin.from('products').select(MALL_PRODUCT_COLUMNS).eq('id', productId).maybeSingle()
  if (error) throw error
  const row = data as unknown as ({ seller_id: string } & Record<string, unknown>) | null
  if (!row || row.seller_id !== mallId) return null
  return row as unknown as {
    id: string
    seller_id: string
    handle: string
    name: string
    price: number
    compare_at_price: number | null
    currency: string
    active: boolean
    source_platform: string | null
    source_handle: string | null
    source_url: string | null
    source_price: number | null
    source_currency: string | null
  }
}

/** An existing Mall product imported from the same source, if any —
 *  matched on (source_platform, source_handle) for feed products, or on
 *  source_url for pasted links. Used to stop accidental double-imports. */
export async function findMallDuplicate(
  admin: AdminClient,
  mallId: string,
  source: { platform: string; handle: string | null; url: string | null },
): Promise<{ id: string; name: string } | null> {
  if (source.handle) {
    const { data, error } = await admin
      .from('products')
      .select('id, name')
      .eq('seller_id', mallId)
      .eq('source_platform', source.platform)
      .eq('source_handle', source.handle)
      .limit(1)
      .maybeSingle()
    if (error) throw error
    if (data) return data as { id: string; name: string }
  }
  if (source.url) {
    const { data, error } = await admin
      .from('products')
      .select('id, name')
      .eq('seller_id', mallId)
      .eq('source_url', source.url)
      .limit(1)
      .maybeSingle()
    if (error) throw error
    if (data) return data as { id: string; name: string }
  }
  return null
}
