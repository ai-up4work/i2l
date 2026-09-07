'use client'

import { optionAvailability, colorImageMap } from '@/lib/product-options'
import { getSwatchColor } from '@/lib/color-swatches'
import type { StoreProduct } from '@/lib/store.types'

// Deterministic placeholder tint — same value always renders the same
// tint so a size/color with no real image doesn't look random across
// re-renders or refetches.
const SWATCH_TINTS = [
  'linear-gradient(135deg, #d8cdbf 0%, #b8a892 100%)',
  'linear-gradient(135deg, #cfd9d4 0%, #a7bdb3 100%)',
  'linear-gradient(135deg, #ddd0e0 0%, #b9a3c0 100%)',
  'linear-gradient(135deg, #d9d2c3 0%, #b3a687 100%)',
  'linear-gradient(135deg, #cdd6e0 0%, #a3b6cc 100%)',
]
function tintFor(label: string) {
  let hash = 0
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0
  return SWATCH_TINTS[hash % SWATCH_TINTS.length]
}

/** Original circle swatch — unchanged from before. */
function ColorSwatch({
  name,
  available,
  imageUrl,
  selected,
  onClick,
}: {
  name: string
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
          'relative grid h-9 w-9 place-items-center overflow-hidden rounded-full border-2 shadow-sm bg-cover bg-center transition-all ' +
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
        {name}
      </span>
    </span>
  )
}

/**
 * Size option rendered as a small tinted tile (label's initials, keyed
 * off the same deterministic palette as color swatches) instead of a
 * plain text pill — sizes never carry a real image, so this is always
 * the placeholder path, just styled like a swatch rather than a chip.
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
      title={available ? undefined : 'Currently unavailable'}
      aria-pressed={selected}
      className={`flex w-[52px] flex-col items-center gap-1 rounded-lg border p-1.5 text-center transition-all ${
        selected
          ? 'border-teal-deep bg-teal/5 shadow-[0_1px_2px_rgba(15,15,15,0.04),0_4px_10px_-6px_rgba(20,120,110,0.35)]'
          : !available
            ? 'cursor-not-allowed border-ink/8 bg-card/40 opacity-45 grayscale'
            : clickable
              ? 'border-ink/10 bg-white hover:-translate-y-0.5 hover:border-teal/40 hover:shadow-[0_4px_12px_-8px_rgba(15,15,15,0.18)]'
              : 'cursor-default border-ink/10 bg-white'
      }`}
    >
      <span
        className={`relative grid h-8 w-8 place-items-center overflow-hidden rounded-md ring-1 ${
          selected ? 'ring-2 ring-teal-deep ring-offset-1 ring-offset-white' : 'ring-ink/10'
        }`}
        style={{ backgroundImage: tintFor(label) }}
      >
        <span className="text-[9px] font-bold uppercase tracking-tight text-white/85 drop-shadow-sm">
          {label.trim().slice(0, 2)}
        </span>
        {selected && (
          <span className="absolute bottom-[-1px] right-[-1px] grid h-3.5 w-3.5 place-items-center rounded-full bg-teal-deep text-white shadow-sm">
            <svg width="8" height="8" viewBox="0 0 20 20" fill="none">
              <path d="M4 10.5L8 14.5L16 6" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}
      </span>
      <span
        className={`line-clamp-1 text-[10px] font-semibold ${
          !available ? 'text-ink/35 line-through decoration-ink/25' : selected ? 'text-teal-deep' : 'text-ink/75'
        }`}
      >
        {label}
      </span>
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

  return (
    <div className="mt-4 flex flex-col gap-4">
      {hasSizes && (
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-ink/45">Sizes</p>
          <div className="flex flex-wrap gap-1.5">
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
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-ink/45">Colors</p>
          <div className="flex flex-wrap gap-3">
            {product.colors!.map((c) => (
              <ColorSwatch
                key={c}
                name={c}
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