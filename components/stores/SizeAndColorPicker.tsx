'use client'

import { optionAvailability, colorImageMap } from '@/lib/product-options'
import { getSwatchColor } from '@/lib/color-swatches'
import type { StoreProduct } from '@/lib/store.types'

/** Store colour names that are stock codes ("ACB2480", "SKU-1234")
 *  mean nothing to shoppers — those are shown as "Design 1, 2, …". */
export function isCodeLike(name: string): boolean {
  const t = name.trim()
  return /\d{3,}/.test(t) && !/\s[a-z]{3,}/i.test(t) && /^[A-Z0-9][A-Z0-9 _\-/.#]*$/i.test(t)
}

/** Circle swatch; photo swatches are larger so the design is visible. */
function ColorSwatch({
  name,
  label,
  available,
  imageUrl,
  selected,
  onClick,
}: {
  name: string
  /** What to print under the swatch (defaults to the name). */
  label?: string
  available: boolean
  imageUrl?: string
  selected?: boolean
  onClick?: () => void
}) {
  const hex = imageUrl ? null : getSwatchColor(name)
  const interactive = !!onClick

  return (
    <span className="inline-flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={interactive && available ? onClick : undefined}
        disabled={!interactive || !available}
        title={available ? name : `${name} — Currently unavailable`}
        aria-pressed={selected}
        aria-label={name}
        className={
          'relative grid place-items-center overflow-hidden rounded-full border-2 shadow-sm bg-cover bg-center transition-all ' +
          (imageUrl ? 'h-[72px] w-[72px] ' : 'h-15 w-15 ') +
          (selected
            ? 'border-teal-deep ring-2 ring-teal-deep ring-offset-1 ring-offset-parchment'
            : available
              ? 'border-white ring-1 ring-ink/15'
              : 'border-white ring-1 ring-ink/10 grayscale opacity-40') +
          (interactive && available ? ' cursor-pointer hover:ring-2 hover:ring-ink/25' : '') +
          (interactive && !available ? ' cursor-not-allowed' : '')
        }
        style={
          imageUrl
            ? { backgroundImage: `url(${imageUrl})` }
            : hex
              ? { backgroundColor: hex }
              : { background: 'linear-gradient(135deg, #e5e0d8 0%, #cfc8ba 100%)' }
        }
      >
        {!imageUrl && !hex && (
          <span className="text-[9px] font-bold uppercase tracking-tight text-ink/50">
            {name.trim().slice(0, 2)}
          </span>
        )}
        {!available && (
          <svg
            viewBox="0 0 36 36"
            className="pointer-events-none absolute inset-0 h-full w-full rounded-full"
            aria-hidden="true"
          >
            <line x1="4" y1="32" x2="32" y2="4" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        )}
      </button>
      <span
        className={
          'text-[10px] font-medium ' +
          (available ? (selected ? 'text-teal-deep' : 'text-ink/60') : 'text-ink/30')
        }
      >
        {label ?? name}
      </span>
    </span>
  )
}

/**
 * Size option as a plain, readable choice ("5ml", "M", "UK 8"). Sizes
 * never carry an image, and a tinted tile with the label's first two
 * characters said nothing (and made "10ml" and "100ml" both read "10"),
 * so the label itself is the button.
 */
function SizeChip({
  label,
  available,
  selected,
  onClick,
}: {
  label: string
  available: boolean
  selected: boolean
  onClick?: () => void
}) {
  const interactive = !!onClick
  const clickable = interactive && available

  return (
    <button
      type="button"
      onClick={clickable ? onClick : undefined}
      disabled={!interactive || !available}
      title={available ? undefined : 'Sold out'}
      aria-pressed={selected}
      className={`relative min-w-[64px] rounded-xl border px-4 py-2.5 text-sm font-semibold tabular-nums transition-all ${
        selected
          ? 'border-teal-deep bg-teal/[0.07] text-teal-deep shadow-[0_0_0_1px_var(--color-teal-deep)]'
          : !available
            ? 'cursor-not-allowed border-dashed border-ink/15 bg-transparent text-ink/30 line-through decoration-ink/25'
            : clickable
              ? 'border-ink/15 bg-white text-ink/80 hover:-translate-y-0.5 hover:border-teal/50 hover:text-ink hover:shadow-[0_4px_12px_-8px_rgba(15,15,15,0.18)]'
              : 'cursor-default border-ink/15 bg-white text-ink/80'
      }`}
    >
      {label}
    </button>
  )
}

/**
 * Shows every size/color the product comes in, with unavailable ones
 * visually muted rather than removed. Interactive (clickable, highlights
 * the current pick) when `onSelectSize`/`onSelectColor` are passed;
 * read-only otherwise — e.g. the marketplace "Request this item" flow,
 * which doesn't add to a bag so there's nothing for a selection to feed.
 */
export default function SizeAndColorPicker({
  product,
  selectedSize,
  selectedColor,
  onSelectSize,
  onSelectColor,
}: {
  product: StoreProduct
  selectedSize?: string
  selectedColor?: string
  onSelectSize?: (size: string) => void
  onSelectColor?: (color: string) => void
}) {
  const hasSizes = !!product.sizes?.length
  const hasColors = !!product.colors?.length
  if (!hasSizes && !hasColors) return null

  const sizeAvailability = hasSizes ? optionAvailability(product, 'size') : new Map<string, boolean>()
  const colorAvailability = hasColors ? optionAvailability(product, 'color') : new Map<string, boolean>()
  const colorImages = hasColors ? colorImageMap(product) : new Map<string, string>()
  // Stock codes as colour names -> "Design 1, 2, …" (the code stays in
  // brackets once chosen, and in the tooltip).
  const codes = hasColors && product.colors!.every(isCodeLike)
  const colorName = (c: string) => (codes ? `Design ${product.colors!.indexOf(c) + 1}` : c)
  const colorHeading = codes ? 'Design' : product.variantLabel ?? 'Colour'

  return (
    <div className="mt-4 flex flex-col gap-4">
      {hasSizes && (
        <div>
          <p className="mb-2 text-xs text-ink/50">
            <span className="font-bold uppercase tracking-wide text-ink/45">Size</span>
            {selectedSize ? (
              <span className="ml-1.5 font-semibold text-ink">{selectedSize}</span>
            ) : onSelectSize ? (
              <span className="ml-1.5 text-ink/40">choose one</span>
            ) : null}
          </p>
          <div className="flex flex-wrap gap-2">
            {product.sizes!.map((s) => (
              <SizeChip
                key={s}
                label={s}
                available={sizeAvailability.get(s) ?? true}
                selected={selectedSize === s}
                onClick={onSelectSize ? () => onSelectSize(s) : undefined}
              />
            ))}
          </div>
        </div>
      )}
      {hasColors && (
        <div>
          <p className="mb-2 text-xs text-ink/50">
            <span className="font-bold uppercase tracking-wide text-ink/45">{colorHeading}</span>
            {selectedColor ? (
              <span className="ml-1.5 font-semibold text-ink">
                {colorName(selectedColor)}
                {codes && <span className="ml-1 font-normal text-ink/40">({selectedColor})</span>}
              </span>
            ) : onSelectColor ? (
              <span className="ml-1.5 text-ink/40">choose one</span>
            ) : null}
          </p>
          <div className="flex flex-wrap gap-3">
            {product.colors!.map((c) => (
              <ColorSwatch
                key={c}
                name={c}
                label={colorName(c)}
                available={colorAvailability.get(c) ?? true}
                imageUrl={colorImages.get(c)}
                selected={selectedColor === c}
                onClick={onSelectColor ? () => onSelectColor(c) : undefined}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}