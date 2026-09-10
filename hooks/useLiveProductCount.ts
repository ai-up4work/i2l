// lib/hooks/useLiveProductCount.ts
'use client'

import { useEffect, useState } from 'react'

// Must match PER_PAGE_MAX in app/api/stores/[platform]/route.ts — no point
// requesting more than the route will actually honor.
const MAX_PER_PAGE = 48

interface LiveProductCount {
  count: number | null
  /**
   * True when the feed has more pages than this one request could see.
   * Some providers (Shopify's public /products.json in particular) have
   * no total-count signal independent of what was actually returned on
   * this page — so `count` in that case is only a lower bound, not an
   * exact total. WooCommerce (X-WP-Total header) and jsonapi backends
   * that return their whole catalog in one shot aren't affected the same
   * way, but this flag is safe to check regardless of provider type.
   */
  atLeast: boolean
  loading: boolean
  error: string | null
  refresh: () => void
}

/**
 * Fetches the REAL product count for a seller by hitting the same
 * app/api/stores/[platform] route the storefront uses. Requests
 * MAX_PER_PAGE rather than a minimal page size — for providers whose
 * `total` is only as accurate as what was actually fetched (see `atLeast`
 * above), asking for 1 product would silently report "1" for every store
 * regardless of real size. MAX_PER_PAGE is exact for any catalogue at or
 * under that size, and an honest lower bound ("48+") beyond it.
 *
 * Only meaningful once a seller's provider config is something other than
 * 'mock' — callers should gate `enabled` on that (a mock/manual-entry
 * seller has no feed to ask).
 */
export function useLiveProductCount(platform: string, enabled: boolean): LiveProductCount {
  const [count, setCount] = useState<number | null>(null)
  const [atLeast, setAtLeast] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setLoading(true)
    setError(null)

    fetch(`/api/stores/${platform}?per_page=${MAX_PER_PAGE}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Store feed returned ${res.status}`)
        return res.json()
      })
      .then((data: { total?: number; totalPages?: number; totalIsExact?: boolean; error?: string }) => {
        if (cancelled) return
        if (typeof data.total === 'number') {
          setCount(data.total)
          // Explicit false is the only thing that marks this a lower
          // bound now — a missing field (older/unpatched providers) is
          // still trusted as exact, matching prior behavior.
          setAtLeast(data.totalIsExact === false)
        } else {
          throw new Error(data.error ?? 'Feed response had no total')
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [platform, enabled, nonce])

  return { count, atLeast, loading, error, refresh: () => setNonce((n) => n + 1) }
}