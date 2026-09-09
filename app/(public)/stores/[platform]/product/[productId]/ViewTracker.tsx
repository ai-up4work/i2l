// app/(public)/stores/[platform]/product/[productId]/ViewTracker.tsx
'use client'

import { useEffect } from 'react'
import { useRecentlyViewed } from '@/contexts/RecentlyViewedContext'
import type { StoreProduct } from '@/lib/store.types'

type Props = {
  platform: string
  productId: string
  product: StoreProduct
  formattedPrice?: string | null
  discountPercent?: number | null
}

// Minimum time on the product page before it counts as a "view" —
// stops a bounce/scroll-past from polluting the recently-viewed queue.
const DWELL_THRESHOLD_MS = 5000

export default function ViewTracker({
  platform,
  productId,
  product,
  formattedPrice,
  discountPercent,
}: Props) {
  const { markViewed } = useRecentlyViewed()

  useEffect(() => {
    const timer = setTimeout(() => {
      markViewed({
        id: `${platform}:${productId}`,
        title: product.name,
        image: product.image,
        currencyCode: product.currency,
        estimatedPrice: formattedPrice ?? null,
        discountPct: discountPercent ?? null,
      })
    }, DWELL_THRESHOLD_MS)

    // Unmounted (navigated away) before the threshold — cancel, never
    // record. This is the whole point: only genuine dwell counts.
    return () => clearTimeout(timer)
    // Only re-fire if the shopper navigates to a genuinely different
    // product — not on every re-render of this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform, productId])

  return null
}