// hooks/useSavedItemStock.ts
//
// For wishlist / board items saved from one of our stores: is it still in
// stock? Loads each product from its store (the same API the product page
// uses), a few at a time, and caches the answer for the session. Pasted
// links aren't checked (we'd have to scrape the page) — they get no badge.
'use client'

import { useEffect, useState } from 'react'
import { storeHandleFor } from '@/lib/cart-snapshot'

type Saved = { id: string; url: string; site?: string | null; productHandle?: string | null }
export type SavedStock = 'in-stock' | 'sold-out' | 'gone'

const cache = new Map<string, SavedStock>()
const MAX_CHECKS = 40
const CONCURRENCY = 4

export function useSavedItemStock(items: Saved[]): Map<string, SavedStock> {
  const [status, setStatus] = useState<Map<string, SavedStock>>(() => new Map())
  const key = items.map((i) => i.id).join('|')

  useEffect(() => {
    let cancelled = false
    const todo = items
      .map((i) => ({ id: i.id, site: i.site, handle: storeHandleFor(i) }))
      .filter((i): i is { id: string; site: string; handle: string } => !!i.site && !!i.handle)
      .slice(0, MAX_CHECKS)

    const known = new Map<string, SavedStock>()
    for (const t of todo) {
      const hit = cache.get(`${t.site}/${t.handle}`)
      if (hit) known.set(t.id, hit)
    }
    setStatus(new Map(known))
    const queue = todo.filter((t) => !known.has(t.id))

    const worker = async () => {
      while (!cancelled && queue.length) {
        const t = queue.shift()!
        let result: SavedStock | null = null
        try {
          const r = await fetch(`/api/stores/${encodeURIComponent(t.site)}/product/${encodeURIComponent(t.handle)}`)
          if (r.status === 404) result = 'gone'
          else if (r.ok) {
            const p = (await r.json()) as { inStock?: boolean }
            result = p.inStock === false ? 'sold-out' : 'in-stock'
          }
        } catch {
          /* offline — no badge */
        }
        if (result && !cancelled) {
          cache.set(`${t.site}/${t.handle}`, result)
          setStatus((prev) => new Map(prev).set(t.id, result!))
        }
      }
    }
    void Promise.all(Array.from({ length: CONCURRENCY }, worker))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return status
}
