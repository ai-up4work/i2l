'use client'

import { useCallback, useState } from 'react'

export type ProductLookupResult = {
  name: string
  image: string | null
  price: number | null
  currency: string | null
  siteName: string | null
}

type LookupState = {
  loading: boolean
  error: string | null
  result: ProductLookupResult | null
}

const initialState: LookupState = { loading: false, error: null, result: null }

/**
 * useProductLookup — paste a product URL, get back a best-effort
 * name / image / price / currency, scraped server-side in /api/scrape.
 *
 * Always treat `result` as a *starting point* the person can edit, not
 * a guaranteed-accurate price — some stores don't expose structured
 * data, and prices can be in a different currency than expected.
 */
export function useProductLookup() {
  const [state, setState] = useState<LookupState>(initialState)

  const lookup = useCallback(async (url: string): Promise<ProductLookupResult | null> => {
    setState({ loading: true, error: null, result: null })

    try {
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })

      const data = await response.json()

      if (!response.ok) {
        const message = typeof data?.error === 'string' ? data.error : 'Could not read that product page.'
        setState({ loading: false, error: message, result: null })
        return null
      }

      const product = data.product as {
        name: string | null
        image: string | null
        price: number | null
        currency: string | null
        siteName: string | null
      }

      const result: ProductLookupResult = {
        name: product.name ?? '',
        image: product.image,
        price: product.price,
        currency: product.currency,
        siteName: product.siteName,
      }

      setState({ loading: false, error: null, result })
      return result
    } catch {
      const message = 'Something went wrong reaching that store. You can still fill the details in by hand.'
      setState({ loading: false, error: message, result: null })
      return null
    }
  }, [])

  const reset = useCallback(() => setState(initialState), [])

  return { ...state, lookup, reset }
}
