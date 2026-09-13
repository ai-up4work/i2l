// lib/supabase/affiliated-stores-shared.ts
//
// Pure mapper only — no server or client Supabase imports here. This file
// exists specifically so client components (via hooks/useAffiliatedStores.ts)
// can use the mapping logic without pulling in lib/supabase/server.ts
// (which imports next/headers and breaks if it ends up in a client bundle).

import type { AffiliatedStore } from '@/data/stores/data'

export function mapRowToAffiliatedStore(row: Record<string, unknown>): AffiliatedStore {
  const providerConfig = (row.provider_config ?? {}) as Record<string, unknown>
  const display = (providerConfig.display ?? {}) as Record<string, unknown>

  return {
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
    buildType: (display.buildType as AffiliatedStore['buildType']) ?? 'template',
  }
}