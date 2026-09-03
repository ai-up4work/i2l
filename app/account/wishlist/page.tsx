'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronDown,
  Heart,
  Plus,
  ShoppingBag,
  ShoppingBagIcon,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Stubs — replace these with your real modules when dropping this back in.
// ---------------------------------------------------------------------------

type WishlistItem = {
  id: string
  label: string
  price: string
  originalPrice?: string
  badge?: string
  swatches?: string[]
}

type Board = { id: string; name: string; itemCount: number }

// Placeholder thumbnail — swap for a real <Image> once product photos exist.
function ProductThumb({ swatches }: { swatches?: string[] }) {
  return (
    <div className="relative grid aspect-square w-full place-items-center rounded-xl bg-gold/10">
      <ShoppingBag className="h-7 w-7 text-teal-deep" />
      {swatches && swatches.length > 0 && (
        <div className="absolute bottom-2 right-2 flex -space-x-1">
          {swatches.slice(0, 3).map((color) => (
            <span
              key={color}
              className="h-3.5 w-3.5 rounded-full border border-white"
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mock data — wire this up to your real wishlist store/API.
// ---------------------------------------------------------------------------

const initialItems: WishlistItem[] = []

const initialBoards: Board[] = []

const categories = ['All', 'Men', 'Women Apparel', 'Kids', 'Shoes', 'Underwear & Sleepwear', 'Bags']

const recommended: WishlistItem[] = [
  {
    id: 'r1',
    label: "1pc Men's Graphic Tee — Vino Print",
    price: '$8.39',
    originalPrice: '$8.49',
    badge: '#1 Bestseller',
    swatches: ['#1c1c1c', '#c9a15a', '#2f4f4f'],
  },
  {
    id: 'r2',
    label: "1pc Men's Graphic Tee — Abstract Sunset",
    price: '$8.49',
    swatches: ['#7c8b6f', '#3a3f4b'],
  },
  {
    id: 'r3',
    label: "1pc Men's Graphic Tee — Amore Stripe",
    price: '$8.37',
    swatches: ['#1c2b4a'],
  },
  {
    id: 'r4',
    label: "GRDR Men's Cute Letter Tee",
    price: '$6.99',
    badge: 'Trending',
  },
  {
    id: 'r5',
    label: "Manfinity KASUA Men's Striped Shorts",
    price: '$9.20',
    swatches: ['#e6c98b', '#d9d9d9'],
  },
  {
    id: 'r6',
    label: 'Limoncello Print Shirt',
    price: '$11.20',
    swatches: ['#f2e6c9'],
  },
]

const promoItem = { label: 'Layered Pendant Necklace', price: 'US$5.00' }

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Tab = 'items' | 'boards'

export default function WishlistPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('items')
  const [items, setItems] = useState<WishlistItem[]>(initialItems)
  const [boards, setBoards] = useState<Board[]>(initialBoards)
  const [category, setCategory] = useState('All')

  const removeItem = (id: string) => setItems((prev) => prev.filter((item) => item.id !== id))

  const createBoard = () => {
    const nextNumber = 1000 + boards.length + 1
    setBoards((prev) => [...prev, { id: `${nextNumber}`, name: `Board ${nextNumber}`, itemCount: 0 }])
  }

  return (
    <div className="mx-auto max-w-7xl px-6 pb-16 lg:px-10">
      <div className="mt-6 text-center">
        <h1 className="font-display text-3xl text-ink sm:text-4xl">My Wishlist</h1>
      </div>

      {/* Items / Boards tabs */}
      <div className="mx-auto mt-8 flex max-w-md items-center justify-center gap-16 border-b border-ink/10">
        <button
          type="button"
          onClick={() => setTab('items')}
          className={`relative pb-3 text-sm font-semibold tracking-wide transition-colors ${
            tab === 'items' ? 'text-ink' : 'text-ink/40 hover:text-ink/60'
          }`}
        >
          ITEMS({items.length})
          {tab === 'items' && <span className="absolute -bottom-px left-0 right-0 h-0.5 bg-ink" />}
        </button>
        <button
          type="button"
          onClick={() => setTab('boards')}
          className={`relative pb-3 text-sm font-semibold tracking-wide transition-colors ${
            tab === 'boards' ? 'text-ink' : 'text-ink/40 hover:text-ink/60'
          }`}
        >
          BOARDS({boards.length})
          {tab === 'boards' && <span className="absolute -bottom-px left-0 right-0 h-0.5 bg-ink" />}
        </button>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* ITEMS TAB                                                          */}
      {/* ------------------------------------------------------------------ */}
      {tab === 'items' && (
        <>
          {items.length === 0 ? (
            <>
              <div className="mt-12 flex flex-col items-center text-center">
                <p className="max-w-md text-sm text-ink/55">
                  You currently have nothing saved to your Wishlist. Personalize your shopping
                  experience with your Wishlist.
                </p>
                <button
                  type="button"
                  onClick={() => router.push('/')}
                  className="mt-5 rounded-none border border-ink px-10 py-3 text-sm font-bold tracking-wide text-ink transition-colors hover:bg-ink hover:text-white"
                >
                  SHOP NOW
                </button>
              </div>

              <div className="mt-12 border-t border-ink/10" />

              {/* Heart It promo */}
              <div className="mt-10 flex flex-col items-center gap-8 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-display text-2xl text-ink">Heart It.</h2>
                  <p className="mt-2 text-sm text-ink/55">Store everything you love on one page.</p>
                  <ul className="mt-4 flex flex-col gap-2 text-sm text-ink/70">
                    <li className="flex items-center gap-2">
                      <Heart size={13} fill="currentColor" className="text-ink" />
                      Think about it before purchasing it.
                    </li>
                    <li className="flex items-center gap-2">
                      <Heart size={13} fill="currentColor" className="text-ink" />
                      Get notification about out-of-stock items.
                    </li>
                  </ul>
                </div>

                <div className="w-full max-w-[220px] flex-none rounded-xl border border-ink/10 bg-card p-3">
                  <div className="aspect-square w-full rounded-lg bg-gold/10" />
                  <div className="mt-2.5 flex items-center justify-between">
                    <span className="text-sm font-bold text-ink">{promoItem.price}</span>
                    <Heart size={16} className="text-ink/35" />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
              {items.map((item) => (
                <WishlistCard key={item.id} item={item} onRemove={() => removeItem(item.id)} />
              ))}
            </div>
          )}

          {/* You May Also Like */}
          <div className="mt-14">
            <h2 className="text-center font-display text-2xl text-ink">You May Also Like</h2>

            <div className="mt-6 flex items-center gap-6 overflow-x-auto border-b border-ink/10 pb-px">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`relative flex-none whitespace-nowrap pb-3 text-sm font-semibold transition-colors ${
                    category === cat ? 'text-ink' : 'text-ink/40 hover:text-ink/60'
                  }`}
                >
                  {cat}
                  {category === cat && (
                    <span className="absolute -bottom-px left-0 right-0 h-0.5 bg-ink" />
                  )}
                </button>
              ))}
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
              {recommended.map((item) => (
                <RecommendedCard key={item.id} item={item} />
              ))}
            </div>
          </div>
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* BOARDS TAB                                                         */}
      {/* ------------------------------------------------------------------ */}
      {tab === 'boards' && (
        <div className="mt-8">
          <button
            type="button"
            onClick={createBoard}
            className="flex w-full items-center gap-3 rounded-xl bg-ink/[0.04] px-5 py-6 text-left transition-colors hover:bg-ink/[0.06]"
          >
            <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-ink text-white">
              <Plus size={16} />
            </span>
            <span className="font-semibold text-ink">Create a new board</span>
          </button>

          {boards.length > 0 && (
            <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
              {boards.map((board) => (
                <button
                  key={board.id}
                  type="button"
                  onClick={() => router.push(`/account/wishlist/boards/${board.id}`)}
                  className="text-left"
                >
                  <div className="grid grid-cols-2 gap-0.5 overflow-hidden rounded-lg">
                    <div className="aspect-square bg-ink/[0.06]" />
                    <div className="col-span-1 row-span-2 aspect-auto bg-ink/[0.06]" />
                    <div className="aspect-square bg-ink/[0.06]" />
                  </div>
                  <p className="mt-3 font-display text-base text-ink">{board.name}</p>
                  <p className="mt-0.5 text-sm text-ink/50">
                    {board.itemCount} {board.itemCount === 1 ? 'Item' : 'Items'}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

function WishlistCard({ item, onRemove }: { item: WishlistItem; onRemove: () => void }) {
  return (
    <div className="group relative flex flex-col rounded-2xl border border-ink/10 bg-card p-3">
      <div className="relative">
        <ProductThumb swatches={item.swatches} />

        {item.badge && (
          <span className="absolute left-2 top-2 rounded-md bg-ink px-1.5 py-0.5 text-[10px] font-bold text-white">
            {item.badge}
          </span>
        )}

        <button
          type="button"
          aria-label="Remove from wish list"
          onClick={onRemove}
          className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-white/90 text-teal-deep shadow-sm transition-colors hover:bg-white"
        >
          <Heart size={15} fill="currentColor" />
        </button>

        <button
          type="button"
          aria-label={`Add ${item.label} to bag`}
          className="absolute bottom-2 right-2 grid h-8 w-8 place-items-center rounded-full bg-ink text-white shadow-sm transition-opacity hover:opacity-90"
        >
          <ShoppingBagIcon size={14} />
        </button>
      </div>

      <p className="mt-2.5 line-clamp-2 text-sm font-semibold text-ink">{item.label}</p>

      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-sm font-bold text-ink">{item.price}</span>
        {item.originalPrice && (
          <span className="text-xs text-ink/40 line-through">{item.originalPrice}</span>
        )}
      </div>
    </div>
  )
}

function RecommendedCard({ item }: { item: WishlistItem }) {
  return (
    <div className="group relative flex flex-col rounded-2xl border border-ink/10 bg-card p-3">
      <div className="relative">
        <ProductThumb swatches={item.swatches} />

        {item.badge && (
          <span className="absolute left-2 top-2 rounded-md bg-ink px-1.5 py-0.5 text-[10px] font-bold text-white">
            {item.badge}
          </span>
        )}

        <button
          type="button"
          aria-label={`Save ${item.label} to wish list`}
          className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-white/90 text-ink/40 shadow-sm transition-colors hover:bg-white hover:text-teal-deep"
        >
          <Heart size={15} />
        </button>

        <button
          type="button"
          aria-label={`Add ${item.label} to bag`}
          className="absolute bottom-2 right-2 grid h-8 w-8 place-items-center rounded-full bg-ink text-white shadow-sm transition-opacity hover:opacity-90"
        >
          <ShoppingBagIcon size={14} />
        </button>
      </div>

      <p className="mt-2.5 line-clamp-2 text-sm font-semibold text-ink">{item.label}</p>

      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-sm font-bold text-ink">{item.price}</span>
        {item.originalPrice && (
          <span className="text-xs text-ink/40 line-through">{item.originalPrice}</span>
        )}
      </div>
    </div>
  )
}