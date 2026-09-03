'use client'

import { optionAvailability, colorImageMap } from '@/lib/product-options'
import { getSwatchColor } from '@/lib/color-swatches'
import type { StoreProduct } from '@/lib/store.types'

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
  return (
    <button
      type="button"
      onClick={interactive && available ? onClick : undefined}
      disabled={!interactive || !available}
      title={available ? undefined : 'Currently unavailable'}
      aria-pressed={selected}
      className={
        'rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ' +
        (available
          ? selected
            ? 'border-teal-deep bg-teal-deep text-white'
            : 'border-ink/15 text-ink/70' + (interactive ? ' hover:border-ink/30 cursor-pointer' : '')
          : 'border-ink/10 text-ink/30 line-through decoration-ink/25 cursor-not-allowed')
      }
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

  return (
    <div className="mt-4 flex flex-wrap gap-6">
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