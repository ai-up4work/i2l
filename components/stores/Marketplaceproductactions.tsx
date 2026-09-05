'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Heart, Minus, Plus, ShoppingBag, ShoppingCart, Check } from 'lucide-react'
import { useCart, type CartProduct } from '@/contexts/Cartcontext'
import { useWishlist, type WishlistProduct } from '@/contexts/Wishlistcontext'
import type { StoreProduct } from '@/lib/store.types'

/**
 * Wishlist / quantity / Add-to-Cart / Get-Quote action row for the
 * marketplace product detail page (app/(public)/stores/[platform]/product/[productId]).
 *
 * This deliberately mirrors the action row inside ItemInfoModal (the
 * "Get Quote"/cart/wishlist row under the estimated-price box) so a
 * shopper gets the same three actions — save, add to cart, request a
 * quote — whether they're looking at a listing inside that overlay or
 * on this full page. Same CartContext/WishlistContext, same button
 * styling and layout; the only real difference is the data source:
 * the modal builds its snapshot from a scraped `ScrapeResult`, this
 * builds it from the already-fetched `StoreProduct`.
 *
 * This only covers the marketplace (isMarketplace) branch of the page —
 * non-marketplace stores keep using <ProductActions>, which already
 * owns the "Add to bag → WhatsApp" flow for that case.
 */

function toProductSnapshot(product: StoreProduct, platform: string) {
  const url = product.url || ''
  const id = url || `${platform}:${product.id}`
  return {
    id,
    url: url || id,
    site: platform,
    title: product.name,
    image: product.images?.[0] ?? product.image ?? null,
    currencyCode: product.currency ?? null,
  }
}

export default function MarketplaceProductActions({
  product,
  platform,
  requestHref,
}: {
  product: StoreProduct
  platform: string
  requestHref: string
}) {
  const [qty, setQty] = useState(1)
  const [justAdded, setJustAdded] = useState(false)
  const cart = useCart()
  const wishlist = useWishlist()

  const snapshot = toProductSnapshot(product, platform)
  const inWishlist = wishlist.isInWishlist(snapshot.id)
  const soldOut = product.inStock === false

  function handleToggleWishlist() {
    const wishlistProduct: WishlistProduct = {
      ...snapshot,
      price: product.price != null ? String(product.price) : null,
    }
    wishlist.toggleItem(wishlistProduct)
  }

  function handleAddToCart() {
    const cartProduct: CartProduct = {
      ...snapshot,
      sourcePrice: product.price != null ? String(product.price) : null,
      estimatedPrice: null,
    }
    cart.addItem(cartProduct, qty)
    setJustAdded(true)
    window.setTimeout(() => setJustAdded(false), 1600)
  }

  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      {/* Quantity stepper — same shape as ItemInfoModal's */}
      <div className="flex flex-none items-center gap-3.5 rounded-xl border border-ink/15 px-2.5 py-1.5">
        <button
          type="button"
          aria-label="Decrease quantity"
          onClick={() => setQty((q) => Math.max(1, q - 1))}
          className="grid h-7 w-7 place-items-center rounded-md border border-ink/15 text-ink/60 transition-colors hover:border-teal/30 hover:bg-teal/5 hover:text-teal-deep active:scale-90"
        >
          <Minus size={15} />
        </button>
        <span className="min-w-[20px] text-center font-bold tabular-nums">{qty}</span>
        <button
          type="button"
          aria-label="Increase quantity"
          onClick={() => setQty((q) => q + 1)}
          className="grid h-7 w-7 place-items-center rounded-md border border-ink/15 text-ink/60 transition-colors hover:border-teal/30 hover:bg-teal/5 hover:text-teal-deep active:scale-90"
        >
          <Plus size={15} />
        </button>
      </div>

      {/* Wishlist toggle */}
      <button
        type="button"
        aria-label={inWishlist ? 'Remove from wishlist' : 'Save to wishlist'}
        aria-pressed={inWishlist}
        onClick={handleToggleWishlist}
        className="grid h-[46px] w-[46px] flex-none place-items-center rounded-xl border border-ink/15 text-ink/50 transition-all duration-200 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500"
      >
        <Heart
          key={inWishlist ? 'saved' : 'unsaved'}
          size={18}
          fill={inWishlist ? 'currentColor' : 'none'}
          color={inWishlist ? '#e11d48' : 'currentColor'}
        />
      </button>

      {/* Add to cart */}
      <button
        type="button"
        onClick={handleAddToCart}
        disabled={soldOut}
        className="flex min-w-[140px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-ink/15 px-4 py-3.5 text-sm font-semibold text-ink transition-all duration-200 hover:border-teal/30 hover:bg-teal/5 hover:text-teal-deep active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
      >
        {justAdded ? <Check size={16} className="text-teal-deep" /> : <ShoppingBag size={16} />}
        {justAdded ? 'Added' : 'Add to Cart'}
      </button>

      {/* Get Quote / Request — same destination as before (requestHref),
          just restyled to match the "Get Quote" button in ItemInfoModal
          and disabled visually when the item is sold out. */}
      {soldOut ? (
        <span
          aria-disabled="true"
          className="flex min-w-[150px] flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-ink/25 px-5 py-3.5 text-sm font-bold text-white sm:flex-none sm:w-auto sm:px-8"
        >
          <ShoppingCart size={16} />
          Sold Out
        </span>
      ) : (
        <Link
          href={requestHref}
          className="flex min-w-[150px] flex-1 items-center justify-center gap-2 rounded-xl bg-teal px-5 py-3.5 text-sm font-bold text-white transition-colors hover:bg-teal-deep sm:flex-none sm:w-auto sm:px-8"
        >
          <ShoppingCart size={16} />
          Get Quote
        </Link>
      )}
    </div>
  )
}