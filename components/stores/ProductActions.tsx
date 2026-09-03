'use client'

import { useMemo, useState } from 'react'
import { Heart, Minus, Plus } from 'lucide-react'
import AddToBagButton from '@/components/stores/AddToBagButton'
import SizeAndColorPicker from '@/components/stores/SizeAndColorPicker'
import { findMatchingVariant } from '@/lib/product-options'
import type { StoreProduct } from '@/lib/store.types'

export default function ProductActions({
  product,
  platform,
}: {
  product: StoreProduct
  platform: string
}) {
  const [qty, setQty] = useState(1)
  const [wishlisted, setWishlisted] = useState(false)
  const [selectedSize, setSelectedSize] = useState<string | undefined>()
  const [selectedColor, setSelectedColor] = useState<string | undefined>()

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

        <button
          type="button"
          onClick={() => setWishlisted((v) => !v)}
          aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-all ${
            wishlisted ? 'border-red-200 bg-red-50' : 'border-ink/15 hover:bg-card'
          }`}
        >
          <Heart size={17} className={wishlisted ? 'fill-red-500 text-red-500' : 'text-ink'} />
        </button>
      </div>

      {selectionHint ? (
        <p className="mt-1.5 text-[11px] font-medium text-gold-deep">{selectionHint}</p>
      ) : (
        <p className="mt-1.5 text-[11px] text-ink/40">Max 10 per order</p>
      )}
    </div>
  )
}