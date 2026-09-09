'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Clock, ShoppingBagIcon, Trash2 } from 'lucide-react'
import { useRecentlyViewed } from '@/contexts/RecentlyViewedContext'
import { useCart } from '@/contexts/Cartcontext'

// ---------------------------------------------------------------------------
// Stub — replace with a real thumbnail once product photos exist.
// ---------------------------------------------------------------------------

function ProductThumb({ image, alt }: { image?: string | null; alt: string }) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt={alt} className="aspect-[4/5] w-full rounded-xl object-cover" />
  }
  return <div className="aspect-[4/5] w-full rounded-xl bg-gold/10" />
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RecentlyViewedPage() {
  const router = useRouter()
  const { hydrated, items, removeItem, clearAll } = useRecentlyViewed()
  const { addItem } = useCart()

  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const toggleSelectMode = () => {
    setSelectMode((prev) => !prev)
    setSelected(new Set())
  }

  const toggleItem = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    setSelected(new Set(items.map((entry) => entry.product.id)))
  }

  const deleteSelected = () => {
    selected.forEach((id) => removeItem(id))
    setSelected(new Set())
    setSelectMode(false)
  }

  const handleAddToBag = (productId: string) => {
    const entry = items.find((e) => e.product.id === productId)
    if (!entry) return
    addItem(
      {
        id: entry.product.id,
        url: `/products/${entry.product.id}`,
        title: entry.product.title,
        image: entry.product.image,
        currencyCode: entry.product.currencyCode,
        estimatedPrice: entry.product.estimatedPrice,
        source: 'catalogue',
      },
      1,
    )
  }

  // Still loading from localStorage — don't flash the empty state.
  if (!hydrated) {
    return (
      <div className="mx-auto max-w-7xl px-6 pb-24 pt-6 lg:px-10">
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-[4/5] w-full rounded-xl bg-ink/5" />
              <div className="mt-2 h-4 w-3/4 rounded bg-ink/5" />
              <div className="mt-1 h-4 w-1/3 rounded bg-ink/5" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-6 pb-24 lg:px-10">
      <div className="mt-6 flex items-center justify-between">
        <div className="w-16" />
        <h1 className="font-display text-3xl text-ink sm:text-4xl">Recently Viewed</h1>
        {items.length > 0 ? (
          <button
            type="button"
            onClick={toggleSelectMode}
            className="w-16 text-right text-sm font-semibold text-ink/60 transition-colors hover:text-ink"
          >
            {selectMode ? 'Cancel' : 'Select'}
          </button>
        ) : (
          <div className="w-16" />
        )}
      </div>

      {items.length === 0 ? (
        <div className="mt-16 flex flex-col items-center text-center">
          <Clock size={32} className="text-ink/25" />
          <p className="mt-3 text-sm font-semibold text-ink">Nothing viewed yet</p>
          <p className="mt-1 text-sm text-ink/50">Items you look at will show up here.</p>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="mt-5 rounded-none border border-ink px-10 py-3 text-sm font-bold tracking-wide text-ink transition-colors hover:bg-ink hover:text-white"
          >
            SHOP NOW
          </button>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-4 lg:grid-cols-5">
          {items.map(({ product }) => {
            const isChecked = selected.has(product.id)
            return (
              <div key={product.id} className="relative">
                {selectMode && (
                  <button
                    type="button"
                    aria-label={isChecked ? 'Deselect item' : 'Select item'}
                    onClick={() => toggleItem(product.id)}
                    className={`absolute right-2 top-2 z-10 grid h-6 w-6 place-items-center rounded-full border-2 transition-colors ${
                      isChecked
                        ? 'border-ink bg-ink text-white'
                        : 'border-white bg-white/70 text-transparent'
                    }`}
                  >
                    <Check size={14} />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => (selectMode ? toggleItem(product.id) : undefined)}
                  className="block w-full text-left"
                >
                  <div className="relative">
                    <ProductThumb image={product.image} alt={product.title} />
                    {!!product.discountPct && (
                      <span className="absolute left-0 top-2 rounded-r-md bg-teal px-1.5 py-0.5 text-[11px] font-bold text-white">
                        -{product.discountPct}%
                      </span>
                    )}
                  </div>

                  <p className="mt-2 line-clamp-2 text-sm text-ink">{product.title}</p>

                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-base font-bold text-indigo">
                      {product.estimatedPrice ?? '—'}
                    </span>
                    {!selectMode && (
                      <span
                        role="button"
                        aria-label={`Add ${product.title} to bag`}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleAddToBag(product.id)
                        }}
                        className="grid h-8 w-8 flex-none place-items-center rounded-full border border-ink/20 text-ink transition-colors hover:border-ink/40"
                      >
                        <ShoppingBagIcon size={14} />
                      </span>
                    )}
                  </div>
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Selection action bar */}
      {selectMode && items.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-ink/10 bg-white px-6 py-4 lg:px-10">
          <div className="mx-auto flex max-w-7xl items-center justify-between">
            <button
              type="button"
              onClick={selectAll}
              className="text-sm font-semibold text-ink/70 transition-colors hover:text-ink"
            >
              Select all ({items.length})
            </button>
            <button
              type="button"
              onClick={deleteSelected}
              disabled={selected.size === 0}
              className="flex items-center gap-1.5 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-30"
            >
              <Trash2 size={15} />
              Delete ({selected.size})
            </button>
          </div>
        </div>
      )}
    </div>
  )
}