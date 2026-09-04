// hooks/useProductLookup.ts
'use client'
import { useCallback, useState } from 'react'
import type { ScrapeResult } from '@/lib/scrape/parsers'

export function useProductLookup() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Full, unmodified /api/product-lookup payload for the most recent URL —
  // this is what ItemInfoModal needs as its `scrapeResult` prop so it can
  // read `.site` / `.variants` / `.error` and decide whether to render the
  // rich platform view (AmazonProductView, FlipkartProductView, etc.),
  // exactly the way ScraperQaClient does with its own `result` state.
  const [result, setResult] = useState<ScrapeResult | null>(null)

  const lookup = useCallback(async (url: string): Promise<ScrapeResult | null> => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/product-lookup?url=${encodeURIComponent(url)}`)
      const data = (await res.json().catch(() => null)) as ScrapeResult | null

      if (!res.ok || !data || data.error) {
        setError((data && data.error) ?? 'Could not fetch product details from that link.')
        setResult(data ?? null)
        return data ?? null
      }
      if (data.warning) {
        // Non-fatal — we may still have partial data, but flag it so the
        // UI can tell the person to double-check what was auto-filled.
        setError(data.warning)
      }

      setResult(data)
      return data
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Something went wrong fetching that link.'
      setError(message)
      setResult(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setLoading(false)
    setError(null)
    setResult(null)
  }, [])

  return { loading, error, result, lookup, reset }
}