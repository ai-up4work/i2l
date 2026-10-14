// hooks/useStorePricingLookup.ts
'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { storeSourceOf } from '@/lib/catalogue-stores'
import { socialStoreCurrency, storeOriginOf, type StorePricingInfo } from '@/lib/store-origin'

/**
 * Store slug -> its current location / margin facts (lib/store-origin.ts),
 * for pricing cart lines.
 *
 * A cart line remembers origin/marginIncluded from when it was added, but
 * lines restored from the database (or added before local stores
 * existed) may not have them, and staff can change a store's location
 * later. So the cart asks the live store list first and only falls back
 * to what the line remembered.
 *
 * One fetch per page load, shared by every component that uses this
 * (each cart row calls it).
 */

type PricingMap = Map<string, StorePricingInfo>

let cached: PricingMap | null = null
let inflight: Promise<PricingMap> | null = null

function loadPricingMap(): Promise<PricingMap> {
  if (cached) return Promise.resolve(cached)
  if (inflight) return inflight
  inflight = (async () => {
    const map: PricingMap = new Map()
    try {
      const supabase = createClient()
      const { data, error } = await supabase.from('sellers').select('*').eq('status', 'active')
      if (error) throw error
      for (const row of (data ?? []) as Record<string, unknown>[]) {
        const slug = row.platform_slug as string
        if (!slug) continue
        const origin = storeOriginOf(row)
        const social = storeSourceOf(row) === 'social'
        map.set(slug, { origin, marginIncluded: social, ...(social ? { currency: socialStoreCurrency(origin) } : {}) })
      }
      cached = map
    } catch (err) {
      console.error('[useStorePricingLookup]', err)
    } finally {
      inflight = null
    }
    return map
  })()
  return inflight
}

export function useStorePricingLookup() {
  const [map, setMap] = useState<PricingMap | null>(cached)

  useEffect(() => {
    if (map) return
    let cancelled = false
    loadPricingMap().then((m) => {
      if (!cancelled) setMap(m)
    })
    return () => {
      cancelled = true
    }
  }, [map])

  const lookup = useCallback(
    (slug: string | null | undefined, remembered?: Partial<StorePricingInfo>): StorePricingInfo => {
      const live = slug && map ? map.get(slug) : undefined
      return live ?? { origin: remembered?.origin ?? 'IN', marginIncluded: remembered?.marginIncluded ?? false }
    },
    [map],
  )

  return { lookup, loading: map === null }
}
