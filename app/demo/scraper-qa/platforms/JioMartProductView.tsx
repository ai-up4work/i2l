// app/demo/scraper-qa/platforms/JioMartProductView.tsx
'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, Star, ShoppingCart } from 'lucide-react'
import { formatPrice } from '@/lib/currency'
import type { ScrapeResult } from '@/lib/scrape/parsers'

/**
 * Renders a scrape result to look like a JioMart product page —
 * blue brand accent, "Options" pill row (JioMart skews grocery/FMCG,
 * so variants are usually pack-size/quantity/weight rather than a
 * fashion size/color split), ADD TO CART button (disabled, same
 * read-only philosophy as every other platform view in this QA tool).
 *
 * ******************************************************************
 * STATUS: this is a best-effort first pass, NOT verified against a
 * real captured JioMart page — unlike MyntraProductView, which was
 * built and corrected against an actual captured pdpData payload and
 * screenshot. Colors, spacing, and copy below are a reasonable visual
 * approximation, not a pixel-matched clone. The underlying data model
 * (JioMartVariantDimension/-Option) comes from
 * lib/scrape/extractors/jiomart.ts, which is itself an unconfirmed
 * scaffold — see that file's header comment. Once real selectors are
 * confirmed there, this view should keep working unmodified, since it
 * only reads the already-normalized ScrapeResult shape.
 * ******************************************************************
 *
 * Like AmazonProductView/MyntraProductView, this keeps its own local
 * "currently highlighted" selection state per dimension
 * (`selectedByDimension`) rather than relying purely on `opt.selected`
 * from the scrape result, so the tile the user just clicked stays
 * visually "sticky" until a fresh re-scrape result comes back.
 */

function fmt(amount: string | null | undefined, currency: string | null | undefined) {
  const n = amount != null ? Number(amount) : NaN
  if (Number.isNaN(n)) return null
  try {
    return formatPrice(n, currency ?? 'LKR')
  } catch {
    return `${currency ?? ''} ${n}`.trim()
  }
}

function JioMartRatingBadge({ rating, count }: { rating: string | null | undefined; count?: string | null }) {
  const value = rating ? parseFloat(rating) : NaN
  if (Number.isNaN(value)) return null
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center gap-0.5 rounded bg-[#0d47a1] px-1.5 py-0.5 text-[11px] font-bold text-white">
        {value.toFixed(1)}
        <Star size={10} strokeWidth={0} fill="currentColor" />
      </span>
      {count && <span className="text-xs font-medium text-[#5c6b73]">{count} Ratings</span>}
    </span>
  )
}

type VariantDimension = NonNullable<ScrapeResult['variants']>[number]

/** Plain pill row for a variant dimension (pack size / weight / quantity
 * etc — see jiomart.ts's doc comment on why this is generic rather than
 * assuming Size/Color the way the fashion-site views do). Out-of-stock
 * tiles are shown desaturated with a strike, same "visible but
 * disabled" convention used across every other platform view here. */
function OptionRow({
  dim,
  selectedLabel,
  basePrice,
  onPick,
}: {
  dim: VariantDimension
  selectedLabel: string | null
  basePrice: string | null | undefined
  onPick: (label: string, url: string | null) => void
}) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-[#5c6b73]">
        {dim.dimension}
        {selectedLabel && <span className="normal-case text-[#26292b]"> — {selectedLabel}</span>}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {dim.options.map((opt) => {
          const isSelected = opt.label === selectedLabel
          const clickable = !opt.outOfStock
          const tilePrice =
            opt.price != null && opt.price !== basePrice ? fmt(opt.price, opt.currencyCode ?? undefined) : null
          const stock = 'stock' in opt && typeof opt.stock === 'number' ? opt.stock : null
          const lowStock = stock != null && stock > 0 && stock <= 5

          return (
            <button
              key={opt.label}
              type="button"
              disabled={opt.outOfStock}
              onClick={() => clickable && onPick(opt.label, opt.url)}
              title={
                opt.outOfStock
                  ? 'Out of stock'
                  : opt.url
                    ? undefined
                    : `${opt.label} — no direct link found, selection is visual only`
              }
              className={`relative flex min-h-11 min-w-11 flex-col items-center justify-center rounded-md border px-3 py-1.5 text-[13px] font-semibold ${
                opt.outOfStock
                  ? 'cursor-not-allowed border-[#e5e8ea] text-[#c2c8cc] line-through'
                  : isSelected
                    ? 'border-[#0d47a1] bg-[#eaf1fb] text-[#0d47a1]'
                    : 'border-[#d6dbde] text-[#26292b] hover:border-[#0d47a1]'
              }`}
            >
              {opt.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={opt.image} alt="" className="mb-1 h-8 w-8 rounded object-contain" />
              )}
              {opt.label}
              {tilePrice && <span className="text-[10px] font-medium leading-tight">{tilePrice}</span>}
              {!opt.outOfStock && lowStock && (
                <span className="mt-0.5 text-[9px] font-bold uppercase leading-tight text-[#e07a1f]">
                  {stock} left
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function JioMartProductView({
  result,
  onSelectVariant,
}: {
  result: ScrapeResult
  onSelectVariant: (url: string) => void
}) {
  const images = result.images ?? []
  const [mainImage, setMainImage] = useState(images[0] ?? null)

  // Per-dimension local selection state, independent of every other
  // dimension — same pattern as AmazonProductView/MyntraProductView.
  // Re-synced from the scrape result's own `selected` flags whenever a
  // genuinely new result lands (new url), sticky in between clicks.
  const [selectedByDimension, setSelectedByDimension] = useState<Record<string, string>>({})

  useEffect(() => {
    setMainImage((result.images ?? [])[0] ?? null)

    const initial: Record<string, string> = {}
    for (const dim of result.variants ?? []) {
      const selectedOpt = dim.options.find((o) => o.selected)
      if (selectedOpt) initial[dim.dimension] = selectedOpt.label
    }
    setSelectedByDimension(initial)
  }, [result.url, result.variants])

  function pickOption(dimension: string, label: string, url: string | null) {
    setSelectedByDimension((prev) => ({ ...prev, [dimension]: label }))
    if (url) onSelectVariant(url)
  }

  const price = fmt(result.price, result.currencyCode)
  const mrp = result.mrp && result.mrp !== result.price ? fmt(result.mrp, result.currencyCode) : null
  const pctOff =
    result.mrp && result.price && Number(result.mrp) > Number(result.price)
      ? Math.round((1 - Number(result.price) / Number(result.mrp)) * 100)
      : null

  const dims = result.variants ?? []

  return (
    <div className="rounded-2xl border border-[#e5e8ea] bg-white p-5 font-sans">
      <div className="grid gap-8 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* Image gallery */}
        <div className="flex gap-3">
          {images.length > 1 && (
            <div className="flex flex-col gap-2">
              {images.slice(0, 8).map((src) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setMainImage(src)}
                  className={`h-12 w-12 flex-none overflow-hidden rounded border ${
                    mainImage === src ? 'border-[#0d47a1] ring-1 ring-[#0d47a1]' : 'border-[#e5e8ea]'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-full w-full object-contain" />
                </button>
              ))}
            </div>
          )}
          <div className="aspect-square flex-1 overflow-hidden rounded-lg border border-[#e5e8ea]">
            {mainImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mainImage} alt={result.title ?? 'Product image'} className="h-full w-full object-contain" />
            ) : (
              <div className="grid h-full place-items-center text-xs text-[#94a0a6]">No image found</div>
            )}
          </div>
        </div>

        {/* Buy box + details */}
        <div>
          {result.brand && <p className="text-xs font-bold uppercase tracking-wide text-[#0d47a1]">{result.brand}</p>}
          <h2 className="mt-0.5 text-[16px] font-semibold leading-snug text-[#26292b]">
            {result.title || <span className="italic text-[#94a0a6]">No title found</span>}
          </h2>

          {result.rating && (
            <div className="mt-2">
              <JioMartRatingBadge rating={result.rating} count={result.review_count} />
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-baseline gap-2">
            {price ? (
              <span className="text-2xl font-bold text-[#26292b]">{price}</span>
            ) : (
              <span className="text-base font-semibold text-[#94a0a6]">No price found</span>
            )}
            {mrp && <span className="text-sm font-medium text-[#94a0a6] line-through">{mrp}</span>}
            {pctOff !== null && <span className="text-sm font-bold text-[#1a9e5c]">({pctOff}% OFF)</span>}
          </div>
          <p className="mt-0.5 text-[11px] text-[#94a0a6]">inclusive of all taxes</p>

          {dims.length > 0 && (
            <div className="mt-5 flex flex-col gap-4">
              {dims.map((dim) => (
                <OptionRow
                  key={dim.dimension}
                  dim={dim}
                  selectedLabel={selectedByDimension[dim.dimension] ?? null}
                  basePrice={result.price}
                  onPick={(label, url) => pickOption(dim.dimension, label, url)}
                />
              ))}
            </div>
          )}

          <p className="mt-4 text-sm font-semibold">
            {result.unavailable ? (
              <span className="text-red-500">Out of Stock</span>
            ) : result.availability ? (
              <span className="text-[#5c6b73]">{result.availability}</span>
            ) : (
              <span className="text-[#1a9e5c]">In Stock</span>
            )}
          </p>

          <div className="mt-4 sm:max-w-[280px]">
            <button
              type="button"
              disabled
              title="Demo only — this QA tool does not place real orders"
              className="flex w-full cursor-not-allowed items-center justify-center gap-1.5 rounded-lg bg-[#0d47a1] px-4 py-2.5 text-sm font-bold uppercase text-white opacity-70"
            >
              <ShoppingCart size={15} /> Add to Cart
            </button>
          </div>

          <div className="mt-4 space-y-1 text-[13px] text-[#5c6b73]">
            {result.seller && <p>Sold by {result.seller}</p>}
            <p className="text-[#94a0a6]">source: {result.source === 'direct' ? 'fetched directly' : 'via ScraperAPI'}</p>
          </div>

          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#0d47a1] hover:underline"
          >
            Open original listing <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </div>
  )
}