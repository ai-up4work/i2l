// hooks/useLiveProductData.ts
'use client'

import { useEffect, useRef, useState } from 'react'
import type { RecentlyViewedEntry } from '@/contexts/RecentlyViewedContext'
import type { ScrapeResult } from '@/lib/scrape/parsers'

export type LiveProductStatus = 'loading' | 'ready' | 'unavailable' | 'error'

export type LiveProductData = {
  title: string
  image?: string | null
  currencyCode?: string | null
  price?: string | null
  inStock: boolean
  status: LiveProductStatus
}

async function fetchLinkProduct(url: string): Promise<LiveProductData> {
  try {
    const res = await fetch(`/api/product-lookup?url=${encodeURIComponent(url)}`)
    const data = (await res.json().catch(() => null)) as ScrapeResult | null

    if (!res.ok || !data || data.error) {
      return { title: '', inStock: false, status: 'unavailable' }
    }

    return {
      title: data.title ?? '',
      image: data.images?.[0] ?? null,
      currencyCode: data.currencyCode ?? null,
      price: data.price != null ? String(data.price) : null,
      inStock: true,
      status: 'ready',
    }
  } catch {
    return { title: '', inStock: false, status: 'error' }
  }
}

/**
 * 'catalogue' products: id is always `${platform}:${productId}` (see
 * ViewTracker.tsx). Goes through /api/store-product rather than importing
 * fetchStoreProduct directly — that function's import chain reaches
 * lib/supabase/server.ts (next/headers), which can only run in a Server
 * Component, not this client hook.
 */
async function fetchCatalogueProduct(id: string): Promise<LiveProductData> {
  const sepIndex = id.indexOf(':')
  if (sepIndex === -1) return { title: '', inStock: false, status: 'error' }

  const platform = id.slice(0, sepIndex)
  const productId = id.slice(sepIndex + 1)

  try {
    const res = await fetch(
      `/api/store-product?platform=${encodeURIComponent(platform)}&productId=${encodeURIComponent(productId)}`,
    )
    const data = await res.json().catch(() => null)

    if (!res.ok || !data || data.error) {
      return { title: '', inStock: false, status: res.status === 404 ? 'unavailable' : 'error' }
    }

    return {
      title: data.title ?? '',
      image: data.image ?? null,
      currencyCode: data.currencyCode ?? null,
      price: data.price ?? null,
      inStock: !!data.inStock,
      status: 'ready',
    }
  } catch {
    return { title: '', inStock: false, status: 'error' }
  }
}

async function fetchLive(ref: RecentlyViewedEntry['ref']): Promise<LiveProductData> {
  try {
    if (ref.source === 'link') return await fetchLinkProduct(ref.url)
    return await fetchCatalogueProduct(ref.id)
  } catch {
    return { title: '', inStock: false, status: 'error' }
  }
}

export function useLiveProductData(entries: RecentlyViewedEntry[]) {
  const [dataById, setDataById] = useState<Record<string, LiveProductData>>({})
  const inFlight = useRef<Set<string>>(new Set())

  useEffect(() => {
    const ids = new Set(entries.map((e) => e.ref.id))

    setDataById((prev) => {
      const next: Record<string, LiveProductData> = {}
      for (const [id, val] of Object.entries(prev)) {
        if (ids.has(id)) next[id] = val
      }
      return next
    })

    entries.forEach((entry) => {
      const id = entry.ref.id
      if (inFlight.current.has(id)) return
      inFlight.current.add(id)

      setDataById((prev) => ({
        ...prev,
        [id]: prev[id] ?? { title: '', inStock: false, status: 'loading' },
      }))

      fetchLive(entry.ref)
        .then((result) => {
          setDataById((prev) => ({ ...prev, [id]: result }))
        })
        .finally(() => {
          inFlight.current.delete(id)
        })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries])

  return dataById
}