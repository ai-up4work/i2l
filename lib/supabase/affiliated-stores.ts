// lib/supabase/affiliated-stores.ts
import type { AffiliatedStore } from '@/data/stores/data'
import { createClient } from '@/lib/supabase/server'
import { mapRowToAffiliatedStore } from './affiliated-stores-shared'

export { mapRowToAffiliatedStore }

/** Server Component only. All active sellers, marketplaces + local alike. */
export async function fetchAffiliatedStores(): Promise<AffiliatedStore[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('sellers').select('*').eq('status', 'active')
  if (error) {
    console.error('[fetchAffiliatedStores]', error)
    return []
  }
  return (data ?? []).map(mapRowToAffiliatedStore)
}

/** Server Component only. One active seller by platform slug, or null. */
export async function fetchAffiliatedStore(platform: string): Promise<AffiliatedStore | null> {
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
