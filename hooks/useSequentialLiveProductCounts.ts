'use client'

import { useEffect, useRef, useState } from 'react'

// Must match PER_PAGE_MAX in app/api/stores/[platform]/route.ts — no point
// requesting more than the route will actually honor.
const MAX_PER_PAGE = 48

// How many sellers' real counts are fetched at once. Was strictly 1 (see
// the original module comment about not wanting N simultaneous requests
// on page load) — bumped to a small capped pool on request, so several
// rows settle to their real count together instead of queueing behind
// each other one at a time. Still bounded, not unbounded: a sellers list
// with 40 real feeds fires at most this many requests concurrently, not 40.
const DEFAULT_CONCURRENCY = 4

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
 * Fetches REAL product counts for a list of seller platforms using a small
 * worker pool (see DEFAULT_CONCURRENCY) instead of either "all at once" or
 * strictly "one at a time". Several rows resolve together, but a large
 * sellers list still can't fire dozens of simultaneous external requests.
 *
 * Each platform starts 'pending', flips to 'loading' when a worker picks
 * it up, then settles to 'done' or 'error'. Callers should keep showing
 * the seller's cached/mock count for 'pending' and 'loading' states — the
 * row never goes blank, it just gets confirmed or corrected once it's
 * been checked.
 *
 * `refresh(platform)` re-queues just one platform without disturbing
 * whatever else is in flight.
 */
export function useSequentialLiveProductCounts(platforms: string[], concurrency = DEFAULT_CONCURRENCY) {
  const [entries, setEntries] = useState<Record<string, LiveCountEntry>>(() =>
    Object.fromEntries(platforms.map((p) => [p, EMPTY_ENTRY]))
  )

  const queueRef = useRef<string[]>([...platforms])
  const activeWorkersRef = useRef(0)
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

    processQueue()

    return () => {
      mountedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platforms.join(',')])

  async function runOne(platform: string) {
    setEntries((prev) => ({
      ...prev,
      [platform]: { ...(prev[platform] ?? EMPTY_ENTRY), status: 'loading', error: null },
    }))

    try {
      const res = await fetch(`/api/stores/${platform}?per_page=${MAX_PER_PAGE}`)
      if (!res.ok) throw new Error(`Store feed returned ${res.status}`)
      const data: FetchResult = await res.json()
      if (typeof data.total !== 'number') throw new Error(data.error ?? 'Feed response had no total')

      if (!mountedRef.current) return
      setEntries((prev) => ({
        ...prev,
        [platform]: {
          status: 'done',
          count: data.total!,
          atLeast: data.totalIsExact === false,
          error: null,
        },
      }))
    } catch (err) {
      if (!mountedRef.current) return
      setEntries((prev) => ({
        ...prev,
        [platform]: { status: 'error', count: null, atLeast: false, error: (err as Error).message },
      }))
    }
  }

  function processQueue() {
    const slotsToFill = Math.max(0, concurrency - activeWorkersRef.current)
    for (let i = 0; i < slotsToFill; i++) {
      spawnWorker()
    }
  }

  async function spawnWorker() {
    if (queueRef.current.length === 0) return
    activeWorkersRef.current += 1

    while (queueRef.current.length > 0) {
      if (!mountedRef.current) break
      const platform = queueRef.current.shift()!
      await runOne(platform)
    }

    activeWorkersRef.current -= 1
  }

  function refresh(platform: string) {
    if (!queueRef.current.includes(platform)) queueRef.current.push(platform)
    setEntries((prev) => ({ ...prev, [platform]: { ...(prev[platform] ?? EMPTY_ENTRY), status: 'pending', error: null } }))
    processQueue()
  }

  return { entries, refresh }
}