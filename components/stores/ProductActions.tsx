'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Heart, Minus, Plus } from 'lucide-react'
import AddToBagButton from '@/components/stores/AddToBagButton'
import SizeAndColorPicker from '@/components/stores/SizeAndColorPicker'
import { isMatchableOption } from '@/lib/product-options'
import type { VariantStatus } from '@/lib/feature-flags'
import { useWishlist, type WishlistProduct } from '@/contexts/Wishlistcontext'
import type { StoreProduct } from '@/lib/store.types'


/**
 * Builds the small serializable snapshot WishlistContext stores, out of
 * the already-fetched StoreProduct. `product.url` (falling back to a
 * platform-scoped id) is the identity key, same convention used by
 * MarketplaceProductActions and ItemInfoModal, so the same listing
 * saved from any of those three places dedupes to one wishlist entry
 * instead of three. (Deliberately the bare product URL, not the
 * ?variant= URL, for the same reason.)
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
    productHandle: product.handle || product.id,
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
  variantStatus,
  variantUrl,
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
  /** Computed once by the parent (it already needs the matched variant
   * for the gallery/price swap) and passed down rather than recomputed
   * here — avoids two separate findMatchingVariant calls silently
   * disagreeing if the matching logic ever changes in only one call site.
   * 'not-applicable' = no per-variant data to check; 'incomplete' = still
   * picking; 'match' = a variant resolved; 'none' = fully selected but
   * nothing matches that combination. */
  variantStatus: VariantStatus
  /** Product URL + ?variant=<id>, so the cart line carries the exact
   * variant's link. Falls back to product.url downstream. */
  variantUrl?: string
}) {
  const wishlist = useWishlist()
  const router = useRouter()

  const hasSizes = !!product.sizes?.length
  const hasColors = !!product.colors?.length
  // Same "informational vs. actually matchable" distinction as
  // ProductPurchasePanel's needsSelection — must stay consistent with
  // it, since that's what variantStatus (passed down as a prop) was
  // computed against. A mismatch here would mean this component asks
  // for a size the parent never required before resolving the variant.
  const sizeRequired = hasSizes && isMatchableOption(product, 'size')
  const colorRequired = hasColors && isMatchableOption(product, 'color')
  const missingSize = sizeRequired && !selectedSize
  const missingColor = colorRequired && !selectedColor
  const needsSelection = missingSize || missingColor

  // Fully selected, but no variant exists for that combination.
  const comboUnavailable = variantStatus === 'none'

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

  // Desktop (lg+): this fills the rest of the buy box (it stretches to the
  // gallery's height), with the size/colour picker centred in the free
  // space and quantity + buttons pinned to the bottom — level with the
  // bottom of the photo. Phones keep the plain stacked layout.
  return (
    <div className="mt-6 lg:flex lg:flex-1 lg:flex-col">
      <div className="lg:my-auto lg:py-6">
        <SizeAndColorPicker
          product={product}
          selectedSize={selectedSize}
          selectedColor={selectedColor}
          onSelectSize={onSelectSize}
          onSelectColor={onSelectColor}
        />
      </div>

      <div>
      <div className={`flex flex-wrap items-center gap-3 ${hasSizes || hasColors ? 'mt-4 lg:mt-0' : ''}`}>
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
            variantUrl={variantUrl}
            disabled={needsSelection || comboUnavailable}
          />
        </div>

        {/* Buy now: adds this item (same rules as Add to bag — a size /
            colour must be chosen first) and opens the bag. */}
        <div className="min-w-[130px] flex-1">
          <AddToBagButton
            product={product}
            platform={platform}
            quantity={qty}
            compact
            label="Buy now"
            selectedOptions={selectedOptions}
            variantUrl={variantUrl}
            disabled={needsSelection || comboUnavailable}
            onAdded={() => router.push('/account/cart')}
            className="bg-teal-deep text-white hover:bg-indigo-deep"
          />
        </div>
      </div>

      {selectionHint ? (
        <p className="mt-1.5 text-[11px] font-medium text-gold-deep">{selectionHint}</p>
      ) : (
        <p className="mt-1.5 text-[11px] text-ink/40">Max 10 per order</p>
      )}
      </div>
    </div>
  )
}