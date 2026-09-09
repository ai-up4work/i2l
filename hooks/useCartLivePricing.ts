'use client'

import { useEffect, useRef, useState } from 'react'
import type { CartLineItem, CartProduct } from '@/contexts/Cartcontext'

/**
 * What a live fetch reports back for one cart line. `null` means the fetch
 * couldn't be attempted or failed outright (no real url on the line — see
 * the synthetic `platform:id` fallback in AddToBagButton/ItemInfoModal's
 * snapshot builders — network error, etc). Anything else is a real answer,
 * even if that answer is "no longer available".
 */
export type LiveProductResult = {
  price: number
  currencyCode?: string | null
  /**
   * Is the specific selected variant (or the product itself, if it has no
   * variants) still purchasable right now? False covers both "sold out"
   * and "this exact combination no longer exists" (e.g. the seller
   * dropped that color entirely).
   */
  available: boolean
  /**
   * Set only when a variant was requested and that exact combination is
   * the thing that's gone — lets the UI say "Size M / Black is no longer
   * available" instead of a generic "unavailable". Omit if the whole
   * product (not a specific variant) is unavailable, or if there were no
   * selectedOptions to begin with.
   */
  unavailableOptions?: Record<string, string>
} | null

/**
 * Caller-supplied fetch. Should branch on `product.source` / `product.site`
 * to hit the right backend — the scraper for 'link' items (re-run against
 * `product.url`), the platform/store catalog API for 'catalogue' items
 * (product id + platform, not a generic URL scrape) — and pass
 * `product.selectedOptions` through so the check is for the exact variant
 * the shopper added, not just the base product.
 */
export type FetchFreshProductData = (product: CartProduct) => Promise<LiveProductResult>

export type PricedLineItem = CartLineItem & {
  /** True if the live fetch returned a different price than the stored snapshot. */
  priceChanged: boolean
  /** The sourcePrice this line had before this refresh pass. Only set when priceChanged. */
  previousSourcePrice?: string | null
  /**
   * True if the fetch itself failed or was skipped (no real url to check,
   * network error, etc) — distinct from `unavailable`, which means the
   * fetch succeeded and reported "no". UI should fall back to the stored
   * snapshot price for these lines but flag them as unverified.
   */
  priceStale: boolean
  /**
   * True if the fetch succeeded and reported this line's product/variant
   * as no longer purchasable. Should block checkout for this line until
   * the shopper removes it or picks a different variant.
   */
  unavailable: boolean
  /** The specific option combo that's gone, when known — see LiveProductResult. */
  unavailableOptions?: Record<string, string>
}

function toPricedFallback(line: CartLineItem): PricedLineItem {
  return { ...line, priceChanged: false, priceStale: false, unavailable: false }
}

/**
 * Refreshes cart line prices AND variant availability against a live
 * source, instead of trusting whatever was captured in the snapshot at
 * add-time (`product.sourcePrice`, plus the fact that `product.selectedOptions`
 * was even in stock when the shopper clicked "Add to bag").
 *
 * Refetches whenever the SET of line ids changes (add/remove), not on
 * every qty bump — qty doesn't affect unit price or variant availability,
 * so there's no reason to hit the network again just because someone
 * clicked the quantity stepper.
 *
 * Race safety: if the cart changes again while a refresh is in flight
 * (shopper adds/removes an item mid-fetch), the in-flight result is
 * discarded rather than stomping newer state.
 */
export function useCartLivePricing(items: CartLineItem[], fetchFreshProductData: FetchFreshProductData) {
  const [pricedItems, setPricedItems] = useState<PricedLineItem[]>(() => items.map(toPricedFallback))
  const [refreshing, setRefreshing] = useState(true)

  // Keyed on ids only (order-independent identity of the cart), so qty
  // changes or snapshot field churn don't retrigger a network refetch.
  const idKey = items
    .map((line) => line.product.id)
    .slice()
    .sort()
    .join('|')

  const requestId = useRef(0)

  useEffect(() => {
    let cancelled = false
    const thisRequest = ++requestId.current

    async function run() {
      if (items.length === 0) {
        setPricedItems([])
        setRefreshing(false)
        return
      }

      setRefreshing(true)

      const results = await Promise.all(
        items.map(async (line): Promise<PricedLineItem> => {
          try {
            const fresh = await fetchFreshProductData(line.product)

            if (fresh == null) {
              return { ...toPricedFallback(line), priceStale: true }
            }

            if (!fresh.available) {
              // Don't touch price further once something's unavailable —
              // surface it and let the cart UI stop this line from
              // proceeding to checkout.
              return {
                ...line,
                priceChanged: false,
                priceStale: false,
                unavailable: true,
                unavailableOptions: fresh.unavailableOptions ?? line.product.selectedOptions,
              }
            }

            const previousSourcePrice = line.product.sourcePrice
            const freshPriceStr = String(fresh.price)
            const changed = previousSourcePrice != null && previousSourcePrice !== freshPriceStr

            return {
              ...line,
              product: {
                ...line.product,
                sourcePrice: freshPriceStr,
                currencyCode: fresh.currencyCode ?? line.product.currencyCode,
              },
              priceChanged: changed,
              previousSourcePrice: changed ? previousSourcePrice : undefined,
              priceStale: false,
              unavailable: false,
            }
          } catch {
            return { ...toPricedFallback(line), priceStale: true }
          }
        }),
      )

      // A newer refresh started (cart changed mid-fetch) or this effect
      // instance was cleaned up — don't overwrite fresher state with a
      // stale result.
      if (cancelled || thisRequest !== requestId.current) return

      setPricedItems(results)
      setRefreshing(false)
    }

    run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey])

  return {
    items: pricedItems,
    refreshing,
    hasPriceChanges: pricedItems.some((line) => line.priceChanged),
    hasStaleLines: pricedItems.some((line) => line.priceStale),
    hasUnavailableLines: pricedItems.some((line) => line.unavailable),
  }
}