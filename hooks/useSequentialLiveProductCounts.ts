'use client'

import { useEffect, useRef, useState } from 'react'

// Must match PER_PAGE_MAX in app/api/stores/[platform]/route.ts — no point
// requesting more than the route will actually honor.
const MAX_PER_PAGE = 48

export type LiveCountStatus = 'pending' | 'loading' | 'done' | 'error'

export interface LiveCountEntry {
  status: LiveCountStatus
  count: number | null
  /** See useLiveProductCount.ts for why this exists — lower bound, not exact total. */
  atLeast: boolean
  error: string | null
}

interface FetchResult {
  total?: number
  totalPages?: number
  totalIsExact?: boolean
  error?: string
}

const EMPTY_ENTRY: LiveCountEntry = { status: 'pending', count: null, atLeast: false, error: null }

/**
 * Fetches REAL product counts for a list of seller platforms one request
 * at a time, in order, instead of firing one request per row in parallel.
 * Opening /admin/sellers with (say) 40 real feeds should not mean 40
 * simultaneous requests to 40 different third-party stores — this walks
 * the queue sequentially so only one external fetch is ever in flight.
 *
 * Each platform starts 'pending', flips to 'loading' when its turn comes
 * up, then settles to 'done' or 'error'. Callers should keep showing the
 * seller's cached/mock count for 'pending' and 'loading' states (that's
 * the point — the row never goes blank, it just gets confirmed or
 * corrected once its turn arrives).
 *
 * `refresh(platform)` re-queues just one platform without disturbing the
 * rest of the in-progress queue.
 */
export function useSequentialLiveProductCounts(platforms: string[]) {
  const [entries, setEntries] = useState<Record<string, LiveCountEntry>>(() =>
    Object.fromEntries(platforms.map((p) => [p, EMPTY_ENTRY]))
  )

  const queueRef = useRef<string[]>([...platforms])
  const runningRef = useRef(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true

    // Pick up any platform that showed up after the initial render (e.g.
    // sellers list loaded async) without restarting ones already queued.
    setEntries((prev) => {
      const next = { ...prev }
      for (const p of platforms) {
        if (!next[p]) {
          next[p] = EMPTY_ENTRY
          if (!queueRef.current.includes(p)) queueRef.current.push(p)
        }
      }
      return next
    })

    void processQueue()

    return () => {
      mountedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platforms.join(',')])

  async function processQueue() {
    if (runningRef.current) return
    runningRef.current = true

    while (queueRef.current.length > 0) {
      const platform = queueRef.current.shift()!
      if (!mountedRef.current) break

      setEntries((prev) => ({
        ...prev,
        [platform]: { ...(prev[platform] ?? EMPTY_ENTRY), status: 'loading', error: null },
      }))

      try {
        const res = await fetch(`/api/stores/${platform}?per_page=${MAX_PER_PAGE}`)
        if (!res.ok) throw new Error(`Store feed returned ${res.status}`)
        const data: FetchResult = await res.json()
        if (typeof data.total !== 'number') throw new Error(data.error ?? 'Feed response had no total')

        if (!mountedRef.current) break
        setEntries((prev) => ({
          ...prev,
          [platform]: {
            status: 'done',
            count: data.total!,
            // Explicit false is the only thing that marks this a lower
            // bound now — providers that don't send the field (or send
            // true) are trusted as exact, matching their existing
            // single-shot-fetch behavior.
            atLeast: data.totalIsExact === false,
            error: null,
          },
        }))
      } catch (err) {
        if (!mountedRef.current) break
        setEntries((prev) => ({
          ...prev,
          [platform]: { status: 'error', count: null, atLeast: false, error: (err as Error).message },
        }))
      }
    }

    runningRef.current = false
  }

  function refresh(platform: string) {
    if (!queueRef.current.includes(platform)) queueRef.current.push(platform)
    setEntries((prev) => ({ ...prev, [platform]: { ...(prev[platform] ?? EMPTY_ENTRY), status: 'pending', error: null } }))
    void processQueue()
  }

  return { entries, refresh }
}