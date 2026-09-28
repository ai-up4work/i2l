// lib/supabase/affiliated-stores.ts
import 'server-only'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { marketplaceStores, type AffiliatedStore } from '@/data/stores/data'
import { createClient } from '@/lib/supabase/server'
import { mapRowToAffiliatedStore } from './affiliated-stores-shared'

export { mapRowToAffiliatedStore }

/**
 * Server Component only. Hardcoded marketplaces (see data/stores/data.ts)
 * plus all active local sellers from the DB. See the note on
 * hooks/useAffiliatedStores.ts (the client-side equivalent of this file)
 * for why marketplaces aren't a `sellers` row.
 */
export async function fetchAffiliatedStores(): Promise<AffiliatedStore[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('sellers').select('*').eq('status', 'active')
  if (error) {
    console.error('[fetchAffiliatedStores]', error)
    return marketplaceStores
  }
  return [...marketplaceStores, ...(data ?? []).map(mapRowToAffiliatedStore)]
}

/**
 * Server Component only. One active store by platform slug — checks the
 * hardcoded marketplace list first (no DB row exists for those), then
 * falls back to a real seller lookup. Returns null if neither matches.
 */
export async function fetchAffiliatedStore(platform: string): Promise<AffiliatedStore | null> {
  const marketplace = marketplaceStores.find((s) => s.platform === platform)
  if (marketplace) return marketplace

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sellers')
    .select('*')
    .eq('platform_slug', platform)
    .eq('status', 'active')
    .maybeSingle()
  if (error || !data) return null
  return mapRowToAffiliatedStore(data)
}

// ─── Lookup by product URL (used by /api/product-lookup) ────────────────────

/** Lowercased hostname without a leading "www.", or null for a bad URL. */
export function normalizeHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

// Short in-memory cache: the scraper route is hit on every paste.
const hostCache = new Map<string, { at: number; store: AffiliatedStore | null }>()
const HOST_CACHE_TTL_MS = 60_000

/**
 * Active seller whose provider_config.scraper.siteHost matches this URL's
 * host, or null. Uses a service-role client on purpose: the scraper route
 * may run without a logged-in user, and an RLS policy on `sellers` would
 * otherwise make every affiliated store look like "not found".
 *
 * Treat the result as an ENRICHMENT, never a gate — a null must fall
 * through to generic detection (detectSite), not produce an error.
 */
export async function fetchStoreByUrl(url: string): Promise<AffiliatedStore | null> {
  const host = normalizeHost(url)
  if (!host) return null

  const hit = hostCache.get(host)
  if (hit && Date.now() - hit.at < HOST_CACHE_TTL_MS) return hit.store

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data, error } = await admin
    .from('sellers')
    .select('*')
    .eq('status', 'active')
    .eq('provider_config->scraper->>siteHost', host)
    .maybeSingle()

  if (error) console.error('[fetchStoreByUrl]', error)
  const store = error || !data ? null : mapRowToAffiliatedStore(data)
  hostCache.set(host, { at: Date.now(), store })
  return store
}