'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Heart, ImageOff, LayoutGrid, Plus, ShoppingBagIcon } from 'lucide-react'

import { useWishlist, type WishlistEntry } from '@/contexts/Wishlistcontext'
import { useCart, type CartProduct } from '@/contexts/Cartcontext'
import Image from 'next/image'

const promoItem = { label: 'Layered Pendant Necklace', price: 'US$5.00' }

// ---------------------------------------------------------------------------
// Shared thumbnail — mirrors Header.tsx's ProductThumb: falls back to a
// plain icon tile when there's no image instead of a broken <img>.
// ---------------------------------------------------------------------------

function ProductThumb({ image, alt }: { image?: string | null; alt: string }) {
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-ink/10 bg-card">
      {image ? (
        <Image src={image} alt={alt} className="h-full w-full object-contain p-2" width={220} height={220} />
      ) : (
        <div className="grid h-full w-full place-items-center bg-gold/10">
          <ImageOff className="h-7 w-7 text-teal-deep/40" />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Loading skeleton — mirrors this page's actual shape: centered title,
// the "My Boards" + "New Board" button row, then the product grid.
// ---------------------------------------------------------------------------

function WishlistPageSkeleton() {
  return (
    <>
      <div className="mt-6 flex flex-col items-center gap-3 text-center">
        <div className="h-8 w-48 animate-pulse rounded bg-ink/10 sm:h-9 sm:w-56" />
        <div className="flex items-center gap-2">
          <div className="h-9 w-32 animate-pulse rounded-xl bg-ink/10" />
          <div className="h-9 w-28 animate-pulse rounded-xl bg-ink/10" />
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex flex-col rounded-2xl border border-ink/10 bg-card p-3">
            <div className="aspect-square w-full animate-pulse rounded-xl bg-ink/10" />
            <div className="mt-2.5 h-3.5 w-4/5 animate-pulse rounded bg-ink/10" />
            <div className="mt-1.5 h-3.5 w-1/2 animate-pulse rounded bg-ink/10" />
            <div className="mt-2 h-3.5 w-1/3 animate-pulse rounded bg-ink/10" />
          </div>
        ))}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WishlistPage() {
  const router = useRouter()
  const wishlist = useWishlist()
  const cart = useCart()

  // Newest first — same ordering used in Header's preview dropdown/sheet.
  const items = wishlist.items.slice().sort((a, b) => b.addedAt - a.addedAt)

  const addWishlistEntryToBag = (entry: WishlistEntry) => {
    const product: CartProduct = {
      id: entry.id,
      url: entry.url,
      site: entry.site,
      title: entry.title,
      image: entry.image,
      currencyCode: entry.currencyCode,
      sourcePrice: entry.price,
    }
    cart.addItem(product, 1)
  }

  // DESIGN PASS: "New board" no longer opens a name-it-first modal. A
  // board is a low-stakes, instantly-renamable object — asking for a name
  // before you can even see it just adds a step. This creates an empty,
  // auto-named board immediately and drops you straight into it; naming
  // and adding items both happen from inside the board itself (rename
  // inline there, add items via the existing "Add items" action on that
  // page), the same way Notion/Trello handle "new."
  const handleQuickCreateBoard = () => {
    const board = wishlist.createBoard('', [])
    router.push(`/account/boards/${board.id}`)
  }

  if (!wishlist.hydrated) {
    return (
      <div className="mx-auto max-w-7xl px-6 pb-16 lg:px-10">
        <WishlistPageSkeleton />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-6 pb-16 lg:px-10">
      <div className="mt-6 flex flex-col items-center gap-3 text-center">
        <h1 className="font-display text-3xl text-ink sm:text-4xl">My Wishlist</h1>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push('/account/boards')}
            className="flex items-center gap-1.5 rounded-xl border border-ink/15 bg-card px-4 py-2 text-sm font-semibold text-ink transition-all hover:border-teal/50 active:scale-[0.98]"
          >
            <LayoutGrid size={14} />
            My Boards ({wishlist.boards.length})
          </button>
          <button
            type="button"
            onClick={handleQuickCreateBoard}
            disabled={items.length === 0}
            className="group flex items-center gap-1.5 rounded-xl bg-teal-deep px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-teal active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-ink/20 disabled:active:scale-100"
          >
            <Plus size={15} className="transition-transform duration-200 group-hover:rotate-90" />
            New board
          </button>
        </div>
      </div>

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
              className="mt-5 rounded-full bg-teal-deep px-8 py-3 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98]"
            >
              Shop now
            </button>
          </div>

          <div className="mt-12 border-t border-ink/10" />

          {/* Heart It promo */}
          <div className="mt-10 flex flex-col items-center gap-8 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-2xl text-ink">Heart It.</h2>
              <p className="mt-2 text-sm text-ink/55">Store everything you love on one page.</p>
              <ul className="mt-4 flex flex-col gap-2 text-sm text-ink/70">
                <li
                  className="flex items-center gap-2 motion-safe:[animation:fadeUp_0.4s_ease-out_both]"
                  style={{ animationDelay: '80ms' }}
                >
                  <Heart size={13} fill="currentColor" className="text-teal-deep" />
                  Think about it before purchasing it.
                </li>
                <li
                  className="flex items-center gap-2 motion-safe:[animation:fadeUp_0.4s_ease-out_both]"
                  style={{ animationDelay: '200ms' }}
                >
                  <Heart size={13} fill="currentColor" className="text-teal-deep" />
                  Get notification about out-of-stock items.
                </li>
              </ul>
            </div>

            <HeartItPromoCard />
          </div>
        </>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {items.map((item) => (
            <WishlistCard
              key={item.id}
              item={item}
              onRemove={() => wishlist.removeItem(item.id)}
              onAddToBag={() => addWishlistEntryToBag(item)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// "Heart It." promo card — a demo product, not a real one.
//  1. A small "Example" gold badge marks it as a sample rather than a real
//     product.
//  2. The heart in the corner is clickable and toggles, using the
//     `heartPop` keyframe already defined in boards.css (previously unused
//     anywhere) — so it demonstrates the exact save gesture.
//  3. NEW: the product photo itself starts desaturated (grayscale, slightly
//     dimmed) — "not yet saved" — and blooms into full color the moment you
//     tap the heart, so liking something visibly brings it to life instead
//     of just toggling an icon next to an unaffected photo. Clicking again
//     (un-hearting) fades it back to grayscale.
// ---------------------------------------------------------------------------

function HeartItPromoCard() {
  const [liked, setLiked] = useState(false)
  const [popKey, setPopKey] = useState(0)

  const toggleLiked = () => {
    setLiked((prev) => !prev)
    setPopKey((k) => k + 1) // remounts the icon's animation below, so it replays every click
  }

  return (
    <div className="w-full max-w-[220px] flex-none rounded-xl border border-ink/10 bg-card p-3 motion-safe:[animation:floatSlow_5s_ease-in-out_infinite]">
      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-gold/10">
        <Image
          src="/products/hero-product-3.png"
          alt=""
          className={`h-full w-full object-cover transition-all duration-700 ease-out ${
            liked ? 'grayscale-0 saturate-100 opacity-100' : 'grayscale saturate-0 opacity-75'
          }`}
          width={220}
          height={220}
        />
        <span className="absolute right-2 top-2 rounded-full bg-gold px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
          Example
        </span>
      </div>
      <div className="mt-2.5 flex items-center justify-between">
        <span className="text-sm font-bold text-ink">{promoItem.price}</span>
        <button
          key={popKey}
          type="button"
          onClick={toggleLiked}
          aria-label={liked ? 'Remove this example from your wishlist' : 'Try hearting this example'}
          className="rounded-full p-1 text-teal-deep transition-transform hover:scale-110 motion-safe:[animation:heartPop_0.4s_ease-out]"
        >
          <Heart size={17} fill={liked ? 'currentColor' : 'none'} />
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Wishlist item card
// ---------------------------------------------------------------------------

function WishlistCard({
  item,
  onRemove,
  onAddToBag,
}: {
  item: WishlistEntry
  onRemove: () => void
  onAddToBag: () => void
}) {
  return (
    <div className="group relative flex flex-col rounded-2xl border border-ink/10 bg-card p-3">
      <div className="relative">
        <ProductThumb image={item.image} alt={item.title} />

        <button
          type="button"
          aria-label="Remove from wish list"
          onClick={onRemove}
          className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-card/90 text-teal-deep shadow-sm transition-all hover:bg-card active:scale-90"
        >
          <Heart size={15} fill="currentColor" />
        </button>

        <button
          type="button"
          aria-label={`Add ${item.title} to bag`}
          onClick={onAddToBag}
          className="absolute bottom-2 right-2 grid h-8 w-8 place-items-center rounded-full bg-indigo text-white shadow-sm transition-all hover:bg-indigo-deep active:scale-90"
        >
          <ShoppingBagIcon size={14} />
        </button>
      </div>

      <a href={item.url} className="mt-2.5 line-clamp-2 text-sm font-semibold text-ink hover:underline">
        {item.title}
      </a>

      {item.price && (
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-sm font-bold text-ink">
            {item.currencyCode ?? ''} {item.price}
          </span>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Create board modal — REMOVED from this page. "New board" now creates an
// empty, auto-named board immediately (see handleQuickCreateBoard above)
// and navigates straight into it; naming and adding items both happen from
// inside the board itself. The Boards page still has its own version of
// this modal for the case where you explicitly want to name/seed a board
// before creating it from that page's "+" tile — kept there deliberately,
// not duplicated here.
// ---------------------------------------------------------------------------