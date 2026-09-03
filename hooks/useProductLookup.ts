// hooks/useProductLookup.ts
'use client'
import { useCallback, useState } from 'react'

export type LookedUpProduct = {
  name: string | null
  image: string | null
  price: number | null
  currency: string | null
  options: Record<string, string> | null
}

export function useProductLookup() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lookup = useCallback(async (url: string): Promise<LookedUpProduct | null> => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/product-lookup?url=${encodeURIComponent(url)}`)
      const data = await res.json()

      if (!res.ok || data.error) {
        setError(data.error ?? 'Could not fetch product details from that link.')
        return null
      }
      if (data.warning) {
        // Non-fatal — we may still have partial data, but flag it so the
        // UI can tell the person to double-check what was auto-filled.
        setError(data.warning)
      }

      return {
        name: data.title ?? null,
        image: Array.isArray(data.images) && data.images.length > 0 ? data.images[0] : null,
        price: data.price ? Number(data.price) : null,
        currency: data.currencyCode ?? null,
        options: data.options ?? null,
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong fetching that link.')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setLoading(false)
    setError(null)
  }, [])

  return { loading, error, lookup, reset }
}