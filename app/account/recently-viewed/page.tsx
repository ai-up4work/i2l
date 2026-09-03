'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Clock, ShoppingBagIcon, Trash2 } from 'lucide-react'

// ---------------------------------------------------------------------------
// Stub — replace with a real thumbnail once product photos exist.
// ---------------------------------------------------------------------------

type RecentItem = {
  id: string
  label: string
  price: string
  discountPct?: number
}

function ProductThumb() {
  return <div className="aspect-[4/5] w-full rounded-xl bg-gold/10" />
}

// ---------------------------------------------------------------------------
// Mock data — wire this up to your real recently-viewed history.
// ---------------------------------------------------------------------------

const initialItems: RecentItem[] = [
  { id: '1', label: "Manfinity KASUA Men's Striped Shorts", price: '$9.17', discountPct: 3 },
  { id: '2', label: "Siren Gaze Women's Chic Wrap Top", price: '$9.73', discountPct: 4 },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RecentlyViewedPage() {
  const router = useRouter()
  const [items, setItems] = useState<RecentItem[]>(initialItems)
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
    setSelected(new Set(items.map((item) => item.id)))
  }

  const deleteSelected = () => {
    setItems((prev) => prev.filter((item) => !selected.has(item.id)))
    setSelected(new Set())
    setSelectMode(false)
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
          {items.map((item) => {
            const isChecked = selected.has(item.id)
            return (
              <div key={item.id} className="relative">
                {selectMode && (
                  <button
                    type="button"
                    aria-label={isChecked ? 'Deselect item' : 'Select item'}
                    onClick={() => toggleItem(item.id)}
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
                  onClick={() => (selectMode ? toggleItem(item.id) : undefined)}
                  className="block w-full text-left"
                >
                  <div className="relative">
                    <ProductThumb />
                    {!!item.discountPct && (
                      <span className="absolute left-0 top-2 rounded-r-md bg-[#e64a19] px-1.5 py-0.5 text-[11px] font-bold text-white">
                        -{item.discountPct}%
                      </span>
                    )}
                  </div>

                  <p className="mt-2 line-clamp-2 text-sm text-ink">{item.label}</p>

                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-base font-bold text-[#e64a19]">{item.price}</span>
                    {!selectMode && (
                      <span
                        role="button"
                        aria-label={`Add ${item.label} to bag`}
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