// lib/supabase/affiliated-stores.ts
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
