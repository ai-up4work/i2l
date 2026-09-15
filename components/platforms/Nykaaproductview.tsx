// app/demo/scraper-qa/platforms/NykaaProductView.tsx
'use client'

import { useEffect, useState } from 'react'
import { Star, ExternalLink, Heart } from 'lucide-react'
import { formatPrice } from '@/lib/currency'
import type { ScrapeResult } from '@/lib/scrape/parsers'

/**
 * Renders a scrape result to look like the real Nykaa product page
 * (nykaa.com). Matches the actual PDP's magenta/pink brand color for
 * the CTA and rating pill, the "MRP Incl. of all taxes" note under the
 * price (beauty listings in India show this explicitly, unlike most
 * fashion PDPs), and the shade/size swatch row rendered as small
 * rounded chips rather than square tiles — Nykaa's variant picker for
 * shade/size is a pill row even when the option carries a swatch image
 * (unlike Flipkart's larger square swatches).
 *
 * Purely presentational / read-only: ADD TO BAG is disabled, since this
 * is a scrape QA tool, not a real storefront.
 */

const NYKAA_PINK = '#FC2779'

function fmt(amount: string | null | undefined, currency: string | null | undefined) {
  const n = amount != null ? Number(amount) : NaN
  if (Number.isNaN(n)) return null
  try {
    return formatPrice(n, currency ?? 'LKR')
  } catch {
    return `${currency ?? ''} ${n}`.trim()
  }
}

function NykaaRating({ rating, count }: { rating: string | null | undefined; count?: string | null }) {
  const value = rating ? parseFloat(rating) : NaN
  if (Number.isNaN(value)) return null
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-bold text-white"
        style={{ backgroundColor: NYKAA_PINK }}
      >
        {value.toFixed(1)}
        <Star size={10} className="fill-white text-white" strokeWidth={0} />
      </span>
      {count && <span className="text-xs font-medium text-[#767676]">{count} Reviews</span>}
    </span>
  )
}

type VariantDimension = NonNullable<ScrapeResult['variants']>[number]

/** Shade/size chip row — small rounded pills, with a tiny swatch dot
 * inline when the option has an image, matching Nykaa's compact variant
 * picker (it never uses large square tiles the way Flipkart/Amazon do). */
function ChipRow({
  dim,
  onSelect,
}: {
  dim: VariantDimension
  onSelect: (url: string) => void
}) {
  const selectedOpt = dim.options.find((o) => o.selected)
  return (
    <div>
      <p className="text-[13px] text-[#282828]">
        <span className="font-semibold">{dim.dimension}:</span> {selectedOpt?.label ?? ''}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {dim.options.map((opt) => {
          const isSelected = !!opt.selected
          const clickable = !!opt.url && !isSelected && !opt.outOfStock
          return (
            <button
              key={opt.label}
              type="button"
              disabled={!clickable}
              onClick={() => opt.url && onSelect(opt.url)}
              title={opt.outOfStock ? 'Out of stock' : opt.url ? undefined : 'No direct link found for this option'}
              className={`flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium ${
                isSelected
                  ? 'text-white'
                  : opt.outOfStock
                    ? 'cursor-not-allowed border-[#ececec] text-[#c7c7c7] line-through'
                    : clickable
                      ? 'border-[#dcdcdc] text-[#282828] hover:border-[#fc2779]/50'
                      : 'cursor-not-allowed border-[#ececec] text-[#c7c7c7]'
              }`}
              style={isSelected ? { backgroundColor: NYKAA_PINK, borderColor: NYKAA_PINK } : undefined}
            >
              {opt.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={opt.image} alt="" className="h-4 w-4 flex-none rounded-full object-cover" />
              )}
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function NykaaProductView({
  result,
  onSelectVariant,
}: {
  result: ScrapeResult
  onSelectVariant: (url: string) => void
}) {
  const images = result.images ?? []
  const [mainImage, setMainImage] = useState(images[0] ?? null)

  useEffect(() => {
    setMainImage((result.images ?? [])[0] ?? null)
  }, [result.url, result.images])

  const price = fmt(result.price, result.currencyCode)
  const mrp = result.mrp && result.mrp !== result.price ? fmt(result.mrp, result.currencyCode) : null
  const pctOff =
    result.mrp && result.price && Number(result.mrp) > Number(result.price)
      ? Math.round((1 - Number(result.price) / Number(result.mrp)) * 100)
      : null

  const inStock = result.unavailable
    ? false
    : result.availability
      ? !/sold out|out of stock|unavailable/i.test(result.availability)
      : true

  const variants = result.variants ?? []

  return (
    <div className="rounded-2xl border border-[#ececec] bg-white p-5 font-sans">
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
                    mainImage === src ? 'ring-1' : 'border-[#ececec]'
                  }`}
                  style={mainImage === src ? { borderColor: NYKAA_PINK } : undefined}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-full w-full object-contain" />
                </button>
              ))}
            </div>
          )}
          <div className="relative aspect-square flex-1 overflow-hidden rounded-lg border border-[#f5f5f5]">
            {mainImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mainImage} alt={result.title ?? 'Product image'} className="h-full w-full object-contain" />
            ) : (
              <div className="grid h-full place-items-center text-xs text-[#a3a3a3]">No image found</div>
            )}
            <span className="absolute right-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-full bg-white/90 shadow-sm">
              <Heart size={15} className="text-[#a3a3a3]" />
            </span>
          </div>
        </div>

        {/* Buy box + details */}
        <div>
          {result.seller && (
            <p className="text-[13px] font-semibold text-[#282828]">{result.seller}</p>
          )}
          <h1 className="mt-0.5 text-base font-normal leading-snug text-[#767676]">
            {result.title ?? <span className="italic text-[#a3a3a3]">No title found</span>}
          </h1>

          {result.rating && (
            <div className="mt-2">
              <NykaaRating rating={result.rating} count={result.review_count} />
            </div>
          )}

          <div className="mt-3 flex items-baseline gap-2.5">
            {price ? (
              <span className="text-2xl font-bold text-[#282828]">{price}</span>
            ) : (
              <span className="text-base font-semibold text-[#a3a3a3]">No price found</span>
            )}
            {mrp && <span className="text-sm font-medium text-[#a3a3a3] line-through">{mrp}</span>}
            {mrp && pctOff !== null && (
              <span className="text-sm font-bold" style={{ color: NYKAA_PINK }}>
                ({pctOff}% Off)
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-[#a3a3a3]">MRP Incl. of all taxes</p>

          <div className="mt-5 flex flex-col gap-4">
            {variants.map((dim) => (
              <ChipRow key={dim.dimension} dim={dim} onSelect={onSelectVariant} />
            ))}
          </div>

          <p className="mt-4 text-sm font-semibold">
            {result.unavailable ? (
              <span style={{ color: NYKAA_PINK }}>Out of Stock</span>
            ) : inStock ? (
              <span className="text-[#1E7E34]">In Stock</span>
            ) : (
              <span className="text-[#767676]">{result.availability}</span>
            )}
          </p>

          <div className="mt-4 sm:max-w-[280px]">
            <button
              type="button"
              disabled
              title="Demo only — this QA tool does not place real orders"
              className="flex w-full cursor-not-allowed items-center justify-center rounded-md px-4 py-3 text-sm font-bold text-white opacity-70"
              style={{ backgroundColor: NYKAA_PINK }}
            >
              ADD TO BAG
            </button>
          </div>

          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold hover:underline"
            style={{ color: NYKAA_PINK }}
          >
            Open original listing <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </div>
  )
}