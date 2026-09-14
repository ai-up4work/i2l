// hooks/useAffiliatedStores.ts
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { mapRowToAffiliatedStore } from '@/lib/supabase/affiliated-stores-shared'
import { marketplaceStores, type AffiliatedStore } from '@/data/stores/data'

/**
 * Client-side equivalent of lib/supabase/affiliated-stores.ts's server
 * fetchers — same mapper, same shape, for 'use client' components
 * (ShopMegaMenu, landing page sections, account HomePage,
 * StoreCatalogClient's "other stores" rail) that can't use the async
 * Server Component fetchers directly.
 *
 * Returns the hardcoded international marketplaces (see data/stores/data.ts)
 * combined with real, active local sellers from the DB. Marketplaces are
 * deliberately NOT a `sellers` row — adding one is a code change either
 * way, so there's no DB round trip needed for something that never
 * changes without a redeploy anyway.
 */
export function useAffiliatedStores() {
  const [stores, setStores] = useState<AffiliatedStore[]>(marketplaceStores)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    supabase
      .from('sellers')
      .select('*')
      .eq('status', 'active')
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('[useAffiliatedStores]', error)
          setStores(marketplaceStores)
        } else {
          setStores([...marketplaceStores, ...(data ?? []).map(mapRowToAffiliatedStore)])
        }
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { stores, loading }
}
