// components/cart/CartVariantPicker.tsx
//
// Size / colour picker for a store item that's in the bag ("Change",
// "Choose a colour") or on its way there from the wishlist / a board
// (mode="add": a product with nothing to choose is added straight away). Loads
// the product from its store (same API the product page uses), shows the
// same size / colour picker, and swaps the bag line for the chosen variant
// (same quantity). The new line is built by lib/cart-snapshot.ts, exactly
// like "Add to bag", so price, photo and the saved choice all follow.
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, Loader2, X } from 'lucide-react'
import SizeAndColorPicker from '@/components/stores/SizeAndColorPicker'
import type { CartLineItem, CartProduct } from '@/contexts/Cartcontext'
import type { StoreProduct } from '@/lib/store.types'
import { cleanSelection, missingSelections, requiredSelections, selectionHint, variantFor } from '@/lib/product-selection'
import { storeHandleFor, toCartSnapshot } from '@/lib/cart-snapshot'

/** Store items in the bag whose variant can be (re)chosen here. */
export function cartLineHandle(product: CartProduct): string | null {
  if (product.source !== 'catalogue' || !product.site) return null
  return storeHandleFor(product)
}

/** "Colour: Black · Size: M" */
export function optionsLabel(selected?: Record<string, string>): string {
  if (!selected) return ''
  return Object.entries(selected)
    .map(([k, v]) => `${k === 'Color' ? 'Colour' : k}: ${v}`)
    .join(' · ')
}

export default function CartVariantPicker({
  line,
  onClose,
  onSave,
  mode = 'change',
  onFallback,
}: {
  line: CartLineItem
  onClose: () => void
  onSave: (next: CartProduct) => void
  /** 'add' = moving into the bag (wishlist / board): button says "Add to
   *  bag", and a product with nothing to choose is added without asking. */
  mode?: 'change' | 'add'
  /** Offered when the product can't be loaded: add it as saved instead. */
  onFallback?: () => void
}) {
  const site = line.product.site as string
  const handle = cartLineHandle(line.product)
  const [product, setProduct] = useState<StoreProduct | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [size, setSize] = useState<string | undefined>(line.product.selectedOptions?.Size)
  const [color, setColor] = useState<string | undefined>(line.product.selectedOptions?.Color)

  useEffect(() => {
    if (!handle) {
      setError('This item can’t be changed here. Remove it and add it again from the store.')
      return
    }
    let cancelled = false
    fetch(`/api/stores/${encodeURIComponent(site)}/product/${encodeURIComponent(handle)}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}))
        if (cancelled) return
        if (!r.ok) setError('This product isn’t available from the store any more.')
        else setProduct(body as StoreProduct)
      })
      .catch(() => !cancelled && setError('Couldn’t load the product. Check your connection and try again.'))
    return () => {
      cancelled = true
    }
  }, [site, handle])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const selection = useMemo(() => {
    const s: Record<string, string> = {}
    if (size) s.Size = size
    if (color) s.Color = color
    return s
  }, [size, color])

  const missing = product ? missingSelections(product, selection) : []
  const variant = product ? variantFor(product, selection) : null
  const soldOut = product ? product.inStock === false || (variant ? !variant.available : false) : false
  const photo = variant?.fullImage ?? variant?.image ?? product?.images?.[0] ?? product?.image ?? line.product.image ?? null
  const canSave = !!product && missing.length === 0 && !soldOut

  const save = () => {
    if (!product || !canSave) return
    onSave(toCartSnapshot(product, site, cleanSelection(product, selection)))
  }

  // Adding from the wishlist: nothing to choose -> straight into the bag.
  const autoAdded = useRef(false)
  useEffect(() => {
    if (mode !== 'add' || !product || autoAdded.current) return
    if (requiredSelections(product).length === 0 && product.inStock !== false) {
      autoAdded.current = true
      onSave(toCartSnapshot(product, site, undefined))
    }
  }, [mode, product, site, onSave])

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Choose options">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-parchment shadow-2xl sm:max-w-md sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
          <p className="font-display text-base font-semibold text-indigo">Choose options</p>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full hover:bg-ink/[0.06]">
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="flex gap-4">
            <div className="h-24 w-20 flex-none overflow-hidden rounded-2xl bg-card ring-1 ring-ink/10">
              {photo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover object-top" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-semibold text-ink">{line.product.title}</p>
              <p className="mt-1 text-xs text-ink/55">
                {mode === 'add'
                  ? `Pick your option to add ${line.qty > 1 ? `${line.qty} to` : 'it to'} your bag`
                  : `${line.qty} in your bag · the price updates for the option you choose`}
              </p>
              {product && soldOut && <p className="mt-1.5 text-xs font-semibold text-rose-700">That choice is sold out</p>}
            </div>
          </div>

          {error ? (
            <div className="mt-6">
              <p className="flex items-start gap-2 rounded-2xl bg-gold/10 p-3 text-sm text-ink/70 ring-1 ring-gold/30">
                <AlertCircle size={16} className="mt-0.5 flex-none text-gold-deep" /> {error}
              </p>
              {onFallback && (
                <button type="button" onClick={onFallback} className="mt-3 text-sm font-semibold text-teal-deep hover:underline">
                  Add it anyway — we’ll confirm the details with you
                </button>
              )}
            </div>
          ) : !product ? (
            <div className="flex justify-center py-10 text-ink/40">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : (
            <SizeAndColorPicker
              product={product}
              selectedSize={size}
              selectedColor={color}
              onSelectSize={setSize}
              onSelectColor={setColor}
            />
          )}
        </div>

        <div className="border-t border-ink/10 bg-card px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className="flex h-12 w-full items-center justify-center rounded-full bg-teal-deep text-sm font-bold text-white transition-colors hover:bg-indigo disabled:cursor-not-allowed disabled:opacity-40"
          >
            {product && missing.length ? selectionHint(missing) : soldOut ? 'Sold out' : mode === 'add' ? 'Add to bag' : 'Update bag'}
          </button>
        </div>
      </div>
    </div>
  )
}
