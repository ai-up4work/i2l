// hooks/useCurrencyConversion.ts
'use client'

import { useEffect, useState } from 'react'
import { convertAmount } from '@/lib/currency/convert'

type ConversionState = {
  convertedAmount: number | null
  loading: boolean
  error: string | null
}

/**
 * Converts a fixed original amount/currency into a chosen display currency.
 * The original values are never mutated — this only affects what's rendered.
 */
export function useCurrencyConversion(
  originalAmount: number | null,
  originalCurrency: string | null,
  displayCurrency: string
): ConversionState {
  const [state, setState] = useState<ConversionState>({
    convertedAmount: originalAmount,
    loading: false,
    error: null,
  })

  useEffect(() => {
    if (originalAmount == null || !originalCurrency) {
      setState({ convertedAmount: null, loading: false, error: null })
      return
    }

    if (originalCurrency === displayCurrency) {
      setState({ convertedAmount: originalAmount, loading: false, error: null })
      return
    }

    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))

    convertAmount(originalAmount, originalCurrency, displayCurrency)
      .then((converted) => {
        if (!cancelled) setState({ convertedAmount: converted, loading: false, error: null })
      })
      .catch((e) => {
        if (!cancelled) {
          setState({
            convertedAmount: null,
            loading: false,
            error: e instanceof Error ? e.message : 'Conversion failed',
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [originalAmount, originalCurrency, displayCurrency])

  return state
}