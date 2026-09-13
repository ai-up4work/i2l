// lib/store-config-db.ts
//
// Resolves a platform slug to its seller profile + provider config from
// Supabase first, falling back to the hardcoded data/stores/data.ts +
// lib/store-config.ts pair if the platform isn't in the database yet
// (e.g. mid-migration, or a platform like buckley-london/cherie-lueur that
// has a provider config staged but was never added to affiliatedStores).
//
// This is the ONLY place app/api/stores/[platform]/route.ts should get a
// seller/config from — do not import affiliatedStores or getProviderConfig
// directly in new code.
//
// Two lookups are exported:
//   - getSellerAndConfig          — public, status-gated (`active` only).
//     Used by the public storefront route. A pending_review/inactive
//     seller correctly 404s here — shoppers shouldn't see it.
//   - getSellerAndConfigForAdmin  — admin-only, sees every status. Used by
//     admin panel code (e.g. the live product-count hook on the seller
//     detail page) so a seller can be tested/counted while still being
//     set up, before it's flipped to active.
// Only call the admin variant from admin-gated code — it deliberately
// bypasses the visibility filter that keeps unpublished sellers off the
// public site.

import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { affiliatedStores, type AffiliatedStore } from '@/data/stores/data'
import { getProviderConfig, type StoreProviderConfig } from '@/lib/store-config'

export type ResolvedSeller = {
  platform: string
  name: string
  url?: string
  config: StoreProviderConfig
}

function fallbackToHardcoded(platform: string): ResolvedSeller | null {
  const store = affiliatedStores.find((s) => s.platform === platform)
  if (!store) return null
  return {
    platform: store.platform,
    name: store.name,
    url: store.url,
    config: getProviderConfig(platform),
  }
}

// Shared by both lookups below so they never drift on how a DB row gets
// turned into a ResolvedSeller.
function rowToResolvedSeller(data: {
  platform_slug: string
  name: string
  outbound_url: string | null
  provider_config: unknown
}): ResolvedSeller {
  // provider_config was seeded/saved as the full StoreProviderConfig
  // object (type, baseUrl, currency, etc, plus a non-standard `display`
  // key for storefront-only fields — see scripts/seed-sellers.mjs).
  // Strip `display` before treating this as a StoreProviderConfig.
  const { display: _display, ...config } = (data.provider_config ?? { type: 'mock' }) as Record<string, unknown>

  return {
    platform: data.platform_slug,
    name: data.name,
    url: data.outbound_url ?? undefined,
    config: config as unknown as StoreProviderConfig,
  }
}

export async function getSellerAndConfig(platform: string): Promise<ResolvedSeller | null> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('sellers')
      .select('platform_slug, name, outbound_url, provider_type, provider_config, status')
      .eq('platform_slug', platform)
      .eq('status', 'active')
      .maybeSingle()

    if (error) throw error
    if (!data) return fallbackToHardcoded(platform)

    return rowToResolvedSeller(data)
  } catch (err) {
    // DB unreachable, RLS misconfigured, etc — don't take the storefront
    // down over it, fall back to whatever's hardcoded for this platform.
    console.error('[store-config-db] falling back to hardcoded config for', platform, err)
    return fallbackToHardcoded(platform)
  }
}

/**
 * Admin-only counterpart to getSellerAndConfig — identical resolution
 * logic, but WITHOUT the `.eq('status', 'active')` filter, so a seller
 * that's still `pending_review` or has been set `inactive` can still have
 * its feed tested/counted from the admin panel. The public storefront
 * route must keep using getSellerAndConfig; only call this from
 * admin-gated code.
 */
export async function getSellerAndConfigForAdmin(platform: string): Promise<ResolvedSeller | null> {
  try {
    // Deliberately the service-role client, not createClient(). If RLS on
    // `sellers` restricts SELECT to status = 'active' (likely, since
    // that's the same boundary the public storefront route relies on),
    // dropping .eq('status', 'active') from the query above does nothing
    // by itself — the database would still silently filter the row out
    // before it reaches this code. Only the service role bypasses RLS
    // entirely, same as the admin seller detail page already does.
    const supabase = createServiceRoleClient()
    const { data, error } = await supabase
      .from('sellers')
      .select('platform_slug, name, outbound_url, provider_type, provider_config, status')
      .eq('platform_slug', platform)
      .maybeSingle()

    if (error) throw error
    if (!data) return fallbackToHardcoded(platform)

    return rowToResolvedSeller(data)
  } catch (err) {
    console.error('[store-config-db] (admin) falling back to hardcoded config for', platform, err)
    return fallbackToHardcoded(platform)
  }
}