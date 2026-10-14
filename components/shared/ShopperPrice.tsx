'use client'

// The price a shopper actually pays for a saved item (wishlist, boards,
// the header's cart and wishlist panels), in LKR — the same number the
// product card shows. Never the seller's raw price in their own currency.
//
// Uses the store's current location and currency
// (hooks/useStorePricingLookup.ts) over whatever the saved item
// remembered, so a store that moved to Sri Lanka prices correctly even
// for items saved before the move.

import { formatLKR, getDisplayPriceLKR } from '@/lib/pricing'
import { useStorePricingLookup } from '@/hooks/useStorePricingLookup'

export default function ShopperPrice({
  price,
  currency,
  site,
  weightKg,
  origin,
  marginIncluded,
  className,
}: {
  price: number | string | null | undefined
  currency: string | null | undefined
  /** Store slug the item came from. */
  site?: string | null
  weightKg?: number | null
  origin?: 'IN' | 'LK' | null
  marginIncluded?: boolean
  className?: string
}) {
  const { lookup } = useStorePricingLookup()
  const amount = typeof price === 'string' ? Number(price) : price
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return null

  const info = lookup(site, { origin: origin ?? undefined, marginIncluded })
  const lkr = getDisplayPriceLKR({
    price: amount,
    currency: info.currency ?? currency ?? 'LKR',
    weightKg: weightKg ?? undefined,
    storeSlug: site ?? null,
    origin: info.origin,
    marginIncluded: info.marginIncluded,
  })
  return <span className={className}>{formatLKR(lkr)}</span>
}
