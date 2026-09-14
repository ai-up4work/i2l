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

export default function ViewTracker({ platform, productId }: Props) {
  const { markViewed } = useRecentlyViewed()

  useEffect(() => {
    const timer = setTimeout(() => {
      markViewed({
        id: `${platform}:${productId}`,
        url: `/stores/${platform}/product/${productId}`,
        source: 'catalogue',
      })
    }, DWELL_THRESHOLD_MS)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform, productId])

  return null
}