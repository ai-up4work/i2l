'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { Heart, Minus, Plus } from 'lucide-react'
import AddToBagButton from '@/components/stores/AddToBagButton'
import SizeAndColorPicker from '@/components/stores/SizeAndColorPicker'
import type { StoreProductVariant } from '@/lib/store.types'
import { isMatchableOption } from '@/lib/product-options'
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
  qty,
  onQtyChange,
  selectedSize,
  selectedColor,
  onSelectSize,
  onSelectColor,
  variantMatch,
}: {
  product: StoreProduct
  platform: string
  /** Quantity now lives in the parent (ProductPurchasePanel) alongside
   * the size/color selection, since AddToBagButton needs all three
   * together and the parent is what actually owns that combined state. */
  qty: number
  onQtyChange: (qty: number) => void
  selectedSize?: string
  selectedColor?: string
  onSelectSize: (size: string) => void
  onSelectColor: (color: string) => void
  /** Computed once by the parent (it already needs this for the gallery/
   * price swap) and passed down rather than recomputed here — avoids two
   * separate findMatchingVariant calls silently disagreeing if the
   * matching logic ever changes in only one call site. undefined = no
   * per-variant data to check; null = fully selected but nothing matches
   * that combination. */
  variantMatch: StoreProductVariant | null | undefined
}) {
  const wishlist = useWishlist()

  const hasSizes = !!product.sizes?.length
  const hasColors = !!product.colors?.length
  // Same "informational vs. actually matchable" distinction as
  // ProductPurchasePanel's needsSelection — must stay consistent with
  // it, since that's what variantMatch (passed down as a prop) was
  // computed against. A mismatch here would mean this component asks
  // for a size the parent never required before resolving the variant.
  const sizeRequired = hasSizes && isMatchableOption(product, 'size')
  const colorRequired = hasColors && isMatchableOption(product, 'color')
  const missingSize = sizeRequired && !selectedSize
  const missingColor = colorRequired && !selectedColor
  const needsSelection = missingSize || missingColor

  // null = no per-variant data to check (nothing to block on);
  // undefined = fully selected but no variant matches that combo.
  const comboUnavailable = !needsSelection && variantMatch === undefined

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

  return (
    <div className="mt-6">
      <SizeAndColorPicker
        product={product}
        selectedSize={selectedSize}
        selectedColor={selectedColor}
        onSelectSize={onSelectSize}
        onSelectColor={onSelectColor}
      />

      <div className={`flex flex-wrap items-center gap-3 ${hasSizes || hasColors ? 'mt-4' : ''}`}>
        <div className="flex shrink-0 items-center overflow-hidden rounded-xl border border-ink/15">
          <button
            type="button"
            onClick={() => onQtyChange(Math.max(1, qty - 1))}
            aria-label="Decrease quantity"
            className="flex h-11 w-10 items-center justify-center transition-colors hover:bg-card"
          >
            <Minus size={13} />
          </button>
          <span className="w-8 text-center text-sm font-bold text-ink">{qty}</span>
          <button
            type="button"
            onClick={() => onQtyChange(Math.min(10, qty + 1))}
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

        {/* Was ProductRequestButton (the single-item "Get Quote" request
            flow via DashboardContext) — wrong flow entirely for the
            affiliate catalog: it bypassed CartContext (what
            AddToBagButton actually writes to) and created a one-off
            request instead of taking the shopper to a real cart preview.
            This is a plain navigation to the cart page, which reads
            whatever's already in CartContext (potentially added from
            several different products/platforms) and shows the full
            per-line + total breakdown. */}
        <Link
          href="/account/cart"
          className="flex h-11 min-w-[130px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-teal-deep px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-deep"
        >
          CHECKOUT
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