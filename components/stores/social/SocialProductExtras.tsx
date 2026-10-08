// components/stores/social/SocialProductExtras.tsx
//
// Extra pieces on a custom seller's product page:
//   - MoreFromStore: other products from the same store, under the details.
//   - StickyBuyBar: on phones, a bar pinned to the bottom with the price
//     and the buy button, shown whenever the real buttons are off screen
//     (the photos come first on a phone, so the buttons start out below
//     the fold).
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import AddToBagButton from '@/components/stores/AddToBagButton'
import type { StoreProduct } from '@/lib/store.types'
import SocialProductCard from './SocialProductCard'

export function MoreFromStore({
  products,
  platform,
  storeName,
}: {
  products: StoreProduct[]
  platform: string
  storeName: string
}) {
  if (products.length === 0) return null
  return (
    <section className="mt-14 border-t border-ink/10 pt-8">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="font-display text-xl font-bold text-ink">More from {storeName}</h2>
        <Link href={`/stores/${platform}`} className="flex flex-none items-center gap-0.5 text-xs font-semibold text-teal-deep hover:underline">
          Visit store <ChevronRight size={13} />
        </Link>
      </div>
      <div className="-mx-6 flex snap-x gap-3 overflow-x-auto px-6 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-4 sm:gap-4 sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
        {products.map((p) => (
          <div key={p.id} className="w-[42vw] flex-none snap-start sm:w-auto">
            <SocialProductCard product={p} platform={platform} />
          </div>
        ))}
      </div>
    </section>
  )
}

export function StickyBuyBar({
  product,
  platform,
  formattedPrice,
}: {
  product: StoreProduct
  platform: string
  formattedPrice: string
}) {
  const [visible, setVisible] = useState(false)
  const needsOptions = Boolean(product.variants?.length)

  useEffect(() => {
    const target = document.getElementById('buy-actions')
    if (!target) return
    const observer = new IntersectionObserver(([entry]) => setVisible(!entry.isIntersecting), { threshold: 0.2 })
    observer.observe(target)
    return () => observer.disconnect()
  }, [])

  if (!visible) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink/10 bg-card/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md lg:hidden">
      <div className="mx-auto flex max-w-xl items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-ink/55">{product.name}</p>
          <p className="font-display text-lg font-extrabold tabular-nums text-ink">{formattedPrice}</p>
        </div>
        <div className="w-[52%] max-w-[220px] flex-none">
          {!product.inStock ? (
            <span className="flex h-12 items-center justify-center rounded-xl bg-ink/10 text-sm font-semibold text-ink/50">Sold out</span>
          ) : needsOptions ? (
            <button
              type="button"
              onClick={() => document.getElementById('buy-actions')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              className="flex h-12 w-full items-center justify-center rounded-xl bg-teal text-sm font-bold text-white hover:bg-teal-deep"
            >
              Choose options
            </button>
          ) : (
            <AddToBagButton product={product} platform={platform} quantity={1} compact />
          )}
        </div>
      </div>
    </div>
  )
}
