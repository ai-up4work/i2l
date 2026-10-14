// app/account/recently-viewed/page.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Clock, ImageOff, ShoppingBagIcon, Trash2 } from 'lucide-react'
import { useRecentlyViewed } from '@/contexts/RecentlyViewedContext'
import { useCart } from '@/contexts/Cartcontext'
import { useLiveProductData, type LiveProductData } from '@/hooks/useLiveProductData'
import ShopperPrice from '@/components/shared/ShopperPrice'
import { imageThumb } from '@/lib/media'
import { AccountEmpty, AccountPage, AccountPageHeader, btnPrimary, btnSecondary } from '@/components/account/AccountPageKit'

/** Our own store pages open in place; other links open as they are. */
function productHref(url: string): string {
  try {
    const u = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'https://wishdrop.shop')
    return u.pathname.startsWith('/stores/') ? u.pathname + u.search : url
  } catch {
    return url
  }
}

/** The store slug for pricing, from a /stores/<slug>/... link. */
function storeSlugOf(url: string): string | null {
  const m = url.match(/\/stores\/([^/?#]+)/)
  return m ? m[1] : null
}

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const

function ProductThumb({ image, alt }: { image?: string | null; alt: string }) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageThumb(image, 400)} alt={alt} loading="lazy" className="aspect-[3/4] w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" />
  }
  return (
    <div className="grid aspect-[3/4] w-full place-items-center bg-parchment">
      <ImageOff size={18} className="text-ink/15" />
    </div>
  )
}

function RecentlyViewedSkeleton() {
  return (
    <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="animate-pulse">
          <div className="aspect-[3/4] w-full rounded-2xl bg-ink/[0.06]" />
          <div className="mt-2 h-3.5 w-3/4 rounded bg-ink/[0.06]" />
          <div className="mt-1.5 h-3.5 w-1/3 rounded bg-ink/[0.06]" />
        </div>
      ))}
    </div>
  )
}

// Skeleton shown per-card while its live lookup is still in flight —
// distinct from RecentlyViewedSkeleton, which is the whole-page skeleton
// shown only before localStorage hydrates.
function CardLoadingState() {
  return (
    <div className="animate-pulse">
      <div className="aspect-[3/4] w-full rounded-2xl bg-ink/[0.06]" />
      <div className="mt-2 h-3.5 w-3/4 rounded bg-ink/[0.06]" />
      <div className="mt-1.5 h-3.5 w-1/3 rounded bg-ink/[0.06]" />
    </div>
  )
}

export default function RecentlyViewedPage() {
  const router = useRouter()
  const { hydrated, items, removeItem } = useRecentlyViewed()
  const { addItem } = useCart()
  const liveData = useLiveProductData(items)

  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [addedId, setAddedId] = useState<string | null>(null)

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
    setSelected(new Set(items.map((entry) => entry.ref.id)))
  }

  const handleConfirmDelete = () => {
    selected.forEach((id) => removeItem(id))
    setSelected(new Set())
    setSelectMode(false)
    setConfirmingDelete(false)
  }

  const handleAddToBag = (id: string) => {
    const entry = items.find((e) => e.ref.id === id)
    const live = liveData[id]
    if (!entry || !live || live.status !== 'ready') return
    addItem(
      {
        id: entry.ref.id,
        url: entry.ref.url,
        title: live.title,
        image: live.image,
        currencyCode: live.currencyCode,
        estimatedPrice: live.price,
        source: entry.ref.source ?? 'catalogue',
      },
      1,
    )
  }

  const header = (
    <AccountPageHeader
      eyebrow="My favourites"
      title="Recently viewed"
      subtitle={hydrated && items.length ? `${items.length} ${items.length === 1 ? 'item' : 'items'} you looked at lately.` : 'Items you look at show up here.'}
      actions={
        hydrated && items.length > 0 ? (
          <button type="button" onClick={toggleSelectMode} className={selectMode ? btnPrimary : btnSecondary}>
            {selectMode ? 'Done' : 'Select'}
          </button>
        ) : undefined
      }
    />
  )

  if (!hydrated) {
    return (
      <AccountPage wide>
        {header}
        <RecentlyViewedSkeleton />
      </AccountPage>
    )
  }

  return (
    <AccountPage wide>
      {header}

      {items.length === 0 ? (
        <div className="mt-6">
          <AccountEmpty
            icon={Clock}
            title="Nothing viewed yet"
            body="Products you open will be kept here so you can find them again."
            action={
              <button type="button" onClick={() => router.push('/stores')} className={btnPrimary}>
                Browse stores
              </button>
            }
          />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          <AnimatePresence initial={false}>
            {items.map(({ ref }, idx) => {
              const id = ref.id
              const isChecked = selected.has(id)
              const live: LiveProductData | undefined = liveData[id]

              if (!live || live.status === 'loading') {
                return (
                  <motion.div key={id} initial={false} animate={{ opacity: 1 }}>
                    <CardLoadingState />
                  </motion.div>
                )
              }

              const unavailable = live.status === 'unavailable' || live.status === 'error'
              const href = productHref(ref.url)

              return (
                <motion.div
                  key={id}
                  initial={{ opacity: 0, scale: 0.96, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  transition={{ duration: 0.25, delay: Math.min(idx * 0.02, 0.24), ease: EASE_OUT_EXPO }}
                  className={`group relative overflow-hidden rounded-2xl bg-card ring-1 transition-shadow hover:shadow-[0_10px_28px_-16px_rgba(32,36,43,0.35)] ${
                    isChecked ? 'ring-2 ring-teal' : 'ring-ink/10'
                  }`}
                >
                  <a
                    href={selectMode ? undefined : href}
                    onClick={(e) => {
                      if (selectMode) {
                        e.preventDefault()
                        toggleItem(id)
                      }
                    }}
                    className="block cursor-pointer"
                  >
                    <div className="relative overflow-hidden bg-parchment">
                      <ProductThumb image={live.image} alt={live.title || 'Product'} />
                      {unavailable && (
                        <span className="absolute inset-x-2 bottom-2 rounded-full bg-ink/75 py-1 text-center text-[11px] font-semibold text-white backdrop-blur-sm">
                          No longer available
                        </span>
                      )}
                      {selectMode && (
                        <span
                          className={`absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full border-2 transition-colors ${
                            isChecked ? 'border-teal bg-teal text-white' : 'border-white bg-white/80 text-transparent'
                          }`}
                          aria-hidden
                        >
                          <Check size={14} strokeWidth={3} />
                        </span>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="line-clamp-2 min-h-[2.5rem] text-[13px] leading-snug text-ink/80">{live.title || (unavailable ? 'Product unavailable' : '—')}</p>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        {unavailable || live.price == null ? (
                          <span className="text-sm font-bold text-ink/35">—</span>
                        ) : (
                          <ShopperPrice
                            price={live.price}
                            currency={live.currencyCode}
                            site={storeSlugOf(ref.url)}
                            className="truncate text-sm font-bold text-ink"
                          />
                        )}
                        {!selectMode && (
                          <button
                            type="button"
                            aria-label={`Add ${live.title || 'product'} to bag`}
                            disabled={unavailable}
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              handleAddToBag(id)
                              setAddedId(id)
                              setTimeout(() => setAddedId((cur) => (cur === id ? null : cur)), 1500)
                            }}
                            className={`grid h-9 w-9 flex-none place-items-center rounded-full transition-colors ${
                              unavailable
                                ? 'cursor-not-allowed bg-ink/5 text-ink/25'
                                : addedId === id
                                  ? 'bg-teal text-white'
                                  : 'bg-indigo text-parchment hover:bg-indigo-deep'
                            }`}
                          >
                            {addedId === id ? <Check size={15} strokeWidth={2.5} /> : <ShoppingBagIcon size={15} />}
                          </button>
                        )}
                      </div>
                    </div>
                  </a>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Selection bar: floats above the phone bottom bar. */}
      {selectMode && items.length > 0 && (
        <div className="fixed inset-x-0 bottom-24 z-[45] px-4 lg:bottom-6">
          <div className="mx-auto flex max-w-md items-center justify-between gap-3 rounded-full bg-indigo px-4 py-2.5 shadow-[0_14px_34px_-10px_rgba(8,39,79,0.6)] ring-1 ring-white/10">
            <button type="button" onClick={selectAll} className="text-sm font-semibold text-parchment/80 hover:text-parchment">
              Select all ({items.length})
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              disabled={selected.size === 0}
              className="inline-flex items-center gap-1.5 rounded-full bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 size={14} /> Remove ({selected.size})
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
    </AccountPage>
  )
}

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
            className="relative mx-4 w-full max-w-sm rounded-3xl bg-card p-6 shadow-[0_8px_30px_rgba(32,36,43,0.15)]"
            style={{ border: '1px solid rgba(32, 36, 43, 0.08)' }}
          >
            <h2 className="font-display text-xl text-ink">Remove {count} item{count === 1 ? '' : 's'}?</h2>
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