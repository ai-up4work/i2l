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
// Lookups exported:
//   - getSellerAndConfig          — public, status-gated (`active` only).
//     Used by the public storefront route. A pending_review/inactive
//     seller correctly 404s here — shoppers shouldn't see it.
//   - getSellerAndConfigForAdmin  — admin-only, sees every status. Used by
//     admin panel code (e.g. the live product-count hook on the seller
//     detail page) so a seller can be tested/counted while still being
//     set up, before it's flipped to active.
//   - matchAffiliatedSellerUrl    — given an arbitrary pasted product URL
//     (not a platform slug), finds whether its hostname belongs to one of
//     our own active affiliated sellers. Used by /api/product-lookup to
//     short-circuit the external scraper when a customer pastes a link
//     from a seller we already have a confirmed pricing relationship
//     with. Backed by a 24h platform-wide cache — see getActiveSellerUrls.
//   - invalidateSellerUrlCache    — call from any admin action that
//     changes a seller's status or outbound_url, so matchAffiliatedSellerUrl
//     doesn't serve a stale mapping for up to 24h after the change.
//
// Only call the admin variant from admin-gated code — it deliberately
// bypasses the visibility filter that keeps unpublished sellers off the
// public site.

import { unstable_cache, revalidateTag } from 'next/cache'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { affiliatedStores, type AffiliatedStore } from '@/data/stores/data'
import { getProviderConfig, type StoreProviderConfig } from '@/lib/store-config'

export type ResolvedSeller = {
  platform: string
  name: string
  url?: string
  config: StoreProviderConfig
}

type SellerRow = {
  platform_slug: string
  name: string
  outbound_url: string | null
  provider_type: string | null
  provider_config: unknown
  status: string
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
  type?: string | null
}): ResolvedSeller {
  // provider_config was seeded/saved as the full StoreProviderConfig
  // object (type, baseUrl, currency, etc, plus a non-standard `display`
  // key for storefront-only fields — see scripts/seed-sellers.mjs).
  // Strip `display` before treating this as a StoreProviderConfig.
  const { display: _display, ...rawConfig } = (data.provider_config ?? { type: 'mock' }) as Record<string, unknown>
  let config = rawConfig

  // Custom (manual) sellers — no feed; they add products themselves in the
  // seller portal (/seller/products), which writes to our `products`
  // table. Their provider_config is 'mock', which only ever served the
  // hardcoded demo products in data/stores/data.ts, so nothing a seller
  // added ever reached their store page. Serve them from the DB instead
  // (lib/store-providers/catalogue.ts, which still falls back to the demo
  // products for a seller that hasn't added any of their own yet).
  // anishka-creation is 'mock' too but has its own hardcoded extractor,
  // dispatched before any provider type is looked at — leave it alone.
  if (data.type === 'manual' && rawConfig.type === 'mock' && data.platform_slug !== 'anishka-creation') {
    config = { ...rawConfig, type: 'catalogue', currency: (rawConfig.currency as string | undefined) ?? 'INR' }
  }

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
      .select('platform_slug, name, outbound_url, provider_type, provider_config, status, type')
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
      .select('platform_slug, name, outbound_url, provider_type, provider_config, status, type')
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

// ── Affiliated-seller URL matching (cached, platform-wide) ──────────────

// Platform-wide, 24h cache of every active seller's outbound_url. Sellers
// change rarely (a new one onboarded, an existing one's storefront URL
// updated) — no reason to hit Supabase on every single pasted-link
// lookup just to check "is this actually one of ours". Cached at Next's
// shared data-cache layer (unstable_cache), not per-process memory, so
// it's genuinely platform-wide rather than re-fetched per server
// instance. Tagged 'sellers' so an admin action that changes a seller's
// status/outbound_url can force an immediate refresh via
// invalidateSellerUrlCache() instead of waiting out the full 24h window.
//
// Deliberately the service-role client here, not createClient(): this
// runs inside a cached function with no per-request cookie context, and
// the query already mirrors the same status='active' boundary RLS would
// enforce anyway (see getSellerAndConfig's own comment on this pattern).
const getActiveSellerUrls = unstable_cache(
  async (): Promise<SellerRow[]> => {
    const supabase = createServiceRoleClient()
    const { data, error } = await supabase
      .from('sellers')
      .select('platform_slug, name, outbound_url, provider_type, provider_config, status')
      .eq('status', 'active')
      .not('outbound_url', 'is', null)
      // If `sellers` rows always represent local/affiliated sellers only
      // (marketplaces are hardcoded in data/stores/data.ts, never a
      // sellers row — see affiliated-stores.ts's own comment on this),
      // this filter is a no-op safety net. Kept explicit in case that
      // assumption ever changes.

    if (error) throw error
    return data ?? []
  },
  ['affiliated-seller-urls'],
  { revalidate: 86400, tags: ['sellers'] },
)

function normalizeHostname(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return null
  }
}

/**
 * Given an arbitrary pasted URL, checks whether its hostname matches one
 * of our own active affiliated sellers' outbound_url — i.e. the customer
 * pasted a product link from a store we already have a confirmed pricing
 * relationship with, not an unknown external site. Backed by the 24h
 * platform-wide cache above, so this never hits Supabase on the hot path
 * of every single /api/product-lookup call.
 *
 * Falls back to the hardcoded affiliatedStores list on any cache/DB
 * failure, same defensive pattern as getSellerAndConfig — a broken
 * lookup here should never crash product-lookup; worst case it just
 * treats a real affiliated URL as an unknown external link and scrapes
 * it (correct data, just the slow/wasteful path).
 *
 * Matches on exact hostname only (after stripping a leading "www."),
 * never substring — so "shop.example.com" never accidentally matches a
 * seller whose outbound_url happens to contain that string elsewhere.
 */
export async function matchAffiliatedSellerUrl(rawUrl: string): Promise<ResolvedSeller | null> {
  const targetHost = normalizeHostname(rawUrl)
  if (!targetHost) return null

  try {
    const rows = await getActiveSellerUrls()
    const match = rows.find((row) => {
      const sellerHost = row.outbound_url ? normalizeHostname(row.outbound_url) : null
      return sellerHost !== null && sellerHost === targetHost
    })
    if (match) return rowToResolvedSeller(match)
  } catch (err) {
    console.error('[store-config-db] affiliated-seller URL cache lookup failed', err)
  }

  // Fallback: hardcoded list — LOCAL sellers only. Marketplace entries
  // (Amazon, eBay, Westside, etc.) intentionally still go through the
  // external scraper: they're third-party sites we have no pricing
  // arrangement with, not sellers whose catalog/pricing we already have
  // confirmed. Matching a marketplace entry here would wrongly redirect
  // a customer internally instead of scraping the real product they
  // pasted.
  const hardcodedMatch = affiliatedStores.find(
    (s) => s.storeType === 'local' && s.url && normalizeHostname(s.url) === targetHost,
  )
  if (!hardcodedMatch) return null

  return {
    platform: hardcodedMatch.platform,
    name: hardcodedMatch.name,
    url: hardcodedMatch.url,
    config: getProviderConfig(hardcodedMatch.platform),
  }
}

/**
 * Call this from any admin action that changes a seller's status or
 * outbound_url (activate/deactivate, edit storefront URL, onboard a new
 * seller) so matchAffiliatedSellerUrl doesn't serve a stale mapping for
 * up to 24h after the change.
 */
export function invalidateSellerUrlCache() {
  revalidateTag('sellers', { expire: 0 })
}