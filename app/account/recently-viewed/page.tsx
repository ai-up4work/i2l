'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Clock, ImageOff, ShoppingBagIcon, Trash2 } from 'lucide-react'
import { useRecentlyViewed } from '@/contexts/RecentlyViewedContext'
import { useCart } from '@/contexts/Cartcontext'

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const

// ---------------------------------------------------------------------------
// Thumbnail — same "icon on tinted ink bg" placeholder pattern used for
// missing product images in the boards modals, just full-bleed at card size
// instead of a small 10x10 row thumb.
// ---------------------------------------------------------------------------

function ProductThumb({ image, alt }: { image?: string | null; alt: string }) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt={alt} className="aspect-[4/5] w-full rounded-xl object-cover" />
  }
  return (
    <div className="grid aspect-[4/5] w-full place-items-center rounded-xl border border-ink/10 bg-ink/[0.02]">
      <ImageOff size={18} className="text-ink/15" />
    </div>
  )
}

function RecentlyViewedSkeleton() {
  return (
    <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-4 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-5">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="animate-pulse">
          <div className="aspect-[4/5] w-full rounded-xl bg-ink/[0.06]" />
          <div className="mt-2 h-3.5 w-3/4 rounded bg-ink/[0.06]" />
          <div className="mt-1.5 h-3.5 w-1/3 rounded bg-ink/[0.06]" />
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RecentlyViewedPage() {
  const router = useRouter()
  const { hydrated, items, removeItem } = useRecentlyViewed()
  const { addItem } = useCart()

  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmingDelete, setConfirmingDelete] = useState(false)

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

  const handleConfirmDelete = () => {
    selected.forEach((id) => removeItem(id))
    setSelected(new Set())
    setSelectMode(false)
    setConfirmingDelete(false)
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
      <div className="mx-auto max-w-7xl px-6 pb-24 lg:px-10">
        <div className="mt-10 flex items-end justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-ink sm:text-xl">Recently Viewed</h1>
            <p className="mt-1 text-[13px] text-ink/40">Items you've looked at recently.</p>
          </div>
        </div>
        <RecentlyViewedSkeleton />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-6 pb-24 lg:px-10">
      <div className="mt-10 flex items-end justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-ink sm:text-xl">Recently Viewed</h1>
          <p className="mt-1 text-[13px] text-ink/40">Items you've looked at recently.</p>
        </div>
        {items.length > 0 && (
          <button
            type="button"
            onClick={toggleSelectMode}
            className="text-[13px] font-medium text-ink/50 transition-colors hover:text-ink"
          >
            {selectMode ? 'Cancel' : 'Select'}
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
          className="mt-16 flex flex-col items-center text-center"
        >
          <Clock size={28} className="text-ink/25" />
          <p className="mt-3 text-[13px] font-medium text-ink">Nothing viewed yet</p>
          <p className="mt-1 text-[13px] text-ink/40">Items you look at will show up here.</p>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="mt-5 rounded-full bg-teal-deep px-6 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-teal"
          >
            Browse stores
          </button>
        </motion.div>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-4 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-5">
          <AnimatePresence initial={false}>
            {items.map(({ product }, idx) => {
              const isChecked = selected.has(product.id)
              return (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{
                    duration: 0.25,
                    delay: Math.min(idx * 0.02, 0.24),
                    ease: EASE_OUT_EXPO,
                  }}
                  className="relative"
                >
                  {selectMode && (
                    <button
                      type="button"
                      aria-label={isChecked ? 'Deselect item' : 'Select item'}
                      onClick={() => toggleItem(product.id)}
                      className={`absolute right-2 top-2 z-10 grid h-6 w-6 place-items-center rounded-full border-2 transition-colors ${
                        isChecked
                          ? 'border-teal-deep bg-teal-deep text-white'
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

                    <p className="mt-2 line-clamp-2 text-[13px] text-ink/80">{product.title}</p>

                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-sm font-bold text-teal-deep">
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
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Selection action bar — matches modal footer treatment (border-t
          ink/[0.06], bg-card) instead of a plain white bar. */}
      {selectMode && items.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-ink/[0.06] bg-card px-6 py-4 lg:px-10">
          <div className="mx-auto flex max-w-7xl items-center justify-between">
            <button
              type="button"
              onClick={selectAll}
              className="text-[13px] font-medium text-ink/50 transition-colors hover:text-ink"
            >
              Select all ({items.length})
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              disabled={selected.size === 0}
              className="flex items-center gap-1.5 rounded-full bg-red-500 px-5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Trash2 size={14} />
              Delete ({selected.size})
            </button>
          </div>
        </div>
      )}

      <ConfirmDeleteModal
        open={confirmingDelete}
        count={selected.size}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Delete confirmation modal — same shape/motion as boards' DeleteBoardModal,
// since bulk-removing viewed items is destructive too.
// ---------------------------------------------------------------------------

function ConfirmDeleteModal({
  open,
  count,
  onCancel,
  onConfirm,
}: {
  open: boolean
  count: number
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center" role="dialog" aria-modal="true">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-ink/40"
            onClick={onCancel}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.15, ease: EASE_OUT_EXPO }}
            className="relative w-full max-w-sm rounded-2xl bg-card p-5 shadow-[0_8px_30px_rgba(32,36,43,0.15)]"
            style={{ border: '1px solid rgba(32, 36, 43, 0.08)' }}
          >
            <h2 className="text-base font-semibold text-ink">Remove {count} item{count === 1 ? '' : 's'}?</h2>
            <p className="mt-1.5 text-[13px] text-ink/50">
              This only clears them from your recently viewed list — nothing else is affected.
            </p>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="px-3 py-1.5 rounded-full text-[13px] text-ink/50 hover:text-ink hover:bg-ink/10 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className="rounded-full bg-red-500 px-5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-red-600"
              >
                Delete
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}