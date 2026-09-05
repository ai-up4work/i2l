'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Heart, Minus, Plus, ShoppingCart } from 'lucide-react'
import AddToBagButton from '@/components/stores/AddToBagButton'
import SizeAndColorPicker from '@/components/stores/SizeAndColorPicker'
import { findMatchingVariant } from '@/lib/product-options'
import { useWishlist, type WishlistProduct } from '@/contexts/Wishlistcontext'
import type { StoreProduct } from '@/lib/store.types'

/**
 * Builds the small serializable snapshot WishlistContext stores, out of
 * the already-fetched StoreProduct. `product.url` (falling back to a
 * platform-scoped id) is the identity key, same convention used by
 * MarketplaceProductActions and ItemInfoModal, so the same listing
 * saved from any of those three places dedupes to one wishlist entry
 * instead of three.
 */
function toWishlistSnapshot(product: StoreProduct, platform: string): WishlistProduct {
  const url = product.url || ''
  const id = url || `${platform}:${product.id}`
  return {
    id,
    url: url || id,
    site: platform,
    title: product.name,
    image: product.images?.[0] ?? product.image ?? null,
    currencyCode: product.currency ?? null,
    price: product.price != null ? String(product.price) : null,
  }
}

export default function ProductActions({
  product,
  platform,
}: {
  product: StoreProduct
  platform: string
}) {
  const [qty, setQty] = useState(1)
  const [selectedSize, setSelectedSize] = useState<string | undefined>()
  const [selectedColor, setSelectedColor] = useState<string | undefined>()
  const wishlist = useWishlist()

  const hasSizes = !!product.sizes?.length
  const hasColors = !!product.colors?.length
  const missingSize = hasSizes && !selectedSize
  const missingColor = hasColors && !selectedColor
  const needsSelection = missingSize || missingColor

  // Once every required option has a value, cross-check the actual
  // combination against the variant list — a size that's fine on its own
  // can still be sold out in the color the shopper just picked, which the
  // chips (checked one option at a time) can't catch by themselves.
  const variantMatch = useMemo(() => {
    if (needsSelection) return null
    const selected: Record<string, string> = {}
    if (selectedSize) selected['Size'] = selectedSize
    if (selectedColor) selected['Color'] = selectedColor
    return findMatchingVariant(product, selected)
  }, [product, selectedSize, selectedColor, needsSelection])

  // null = no per-variant data to check (nothing to block on);
  // undefined = fully selected but no variant matches that combo.
  const comboUnavailable = variantMatch === undefined

  const selectedOptions = useMemo(() => {
    const opts: Record<string, string> = {}
    if (selectedSize) opts['Size'] = selectedSize
    if (selectedColor) opts['Color'] = selectedColor
    return Object.keys(opts).length ? opts : undefined
  }, [selectedSize, selectedColor])

  const selectionHint =
    missingSize && missingColor
      ? 'Select a size and color'
      : missingSize
        ? 'Select a size'
        : missingColor
          ? 'Select a color'
          : comboUnavailable
            ? 'That combination is unavailable'
            : undefined

  const wishlistSnapshot = useMemo(() => toWishlistSnapshot(product, platform), [product, platform])
  const wishlisted = wishlist.isInWishlist(wishlistSnapshot.id)

  // "Get Quote" reuses the same request-flow destination the marketplace
  // branch already sends shoppers to — it doesn't depend on a size/color
  // selection since it's just kicking off a request, not adding a
  // specific variant to the bag.
  const requestHref = `/login?redirect=${encodeURIComponent(
    `/account/requests/new?productId=${product.id}`
  )}`

  return (
    <div className="mt-6">
      <SizeAndColorPicker
        product={product}
        selectedSize={selectedSize}
        selectedColor={selectedColor}
        onSelectSize={setSelectedSize}
        onSelectColor={setSelectedColor}
      />

      <div className={`flex flex-wrap items-center gap-3 ${hasSizes || hasColors ? 'mt-4' : ''}`}>
        <div className="flex shrink-0 items-center overflow-hidden rounded-xl border border-ink/15">
          <button
            type="button"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            aria-label="Decrease quantity"
            className="flex h-11 w-10 items-center justify-center transition-colors hover:bg-card"
          >
            <Minus size={13} />
          </button>
          <span className="w-8 text-center text-sm font-bold text-ink">{qty}</span>
          <button
            type="button"
            onClick={() => setQty((q) => Math.min(10, q + 1))}
            aria-label="Increase quantity"
            className="flex h-11 w-10 items-center justify-center transition-colors hover:bg-card"
          >
            <Plus size={13} />
          </button>
        </div>

        <button
          type="button"
          onClick={() => wishlist.toggleItem(wishlistSnapshot)}
          aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
          aria-pressed={wishlisted}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-all ${
            wishlisted ? 'border-red-200 bg-red-50' : 'border-ink/15 hover:bg-card'
          }`}
        >
          <Heart size={17} className={wishlisted ? 'fill-red-500 text-red-500' : 'text-ink'} />
        </button>

        <div className="min-w-[160px] flex-1">
          <AddToBagButton
            product={product}
            platform={platform}
            quantity={qty}
            compact
            selectedOptions={selectedOptions}
            disabled={needsSelection || comboUnavailable}
          />
        </div>

        <Link
          href={requestHref}
          className="flex h-11 min-w-[130px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-teal-deep px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-deep"
        >
          <ShoppingCart size={15} />
          Get Quote
        </Link>
      </div>

      {selectionHint ? (
        <p className="mt-1.5 text-[11px] font-medium text-gold-deep">{selectionHint}</p>
      ) : (
        <p className="mt-1.5 text-[11px] text-ink/40">Max 10 per order</p>
      )}
    </div>
  )
}