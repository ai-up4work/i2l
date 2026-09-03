// app/demo/scraper-qa/platforms/MeeshoProductView.tsx
'use client'

import { useState } from 'react'
import { ExternalLink, Star, Truck } from 'lucide-react'
import { formatPrice } from '@/lib/currency'
import type { ScrapeResult } from '@/lib/scrape/parsers'

/**
 * Renders a scrape result to look like the real Meesho product page:
 * a purple/pink accent palette, a "Select Size" row of pill buttons
 * above the buy box, the price shown large with MRP struck through and
 * a "X% off" tag, a free-delivery line, and a green rating pill.
 *
 * Purely presentational / read-only, same as AmazonProductView and
 * FlipkartProductView — ADD TO CART & BUY NOW are disabled since this
 * is a scrape QA tool, not a real storefront.
 *
 * NOTE: unlike the Amazon/Flipkart views, this layout was NOT checked
 * against a real captured Meesho screenshot in this conversation — it's
 * a best-effort approximation of Meesho's look. Treat colors/spacing as
 * a first draft to correct against a real page if it doesn't match.
 *
 * Size tiles the extractor flagged `outOfStock` (meesho.ts's per-tile
 * disabled/class/text-based detection) are rendered disabled, struck
 * through, and labeled distinctly from a merely-linkless tile.
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

/** Meesho's green rating pill — filled white star + numeric rating. */
function MeeshoRatingPill({ rating, count }: { rating: string | null | undefined; count?: string | null }) {
  const value = rating ? parseFloat(rating) : NaN
  if (Number.isNaN(value)) return null
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-flex items-center gap-0.5 rounded bg-[#00A82D] px-1.5 py-0.5 text-xs font-bold text-white">
        {value.toFixed(1)}
        <Star size={11} className="fill-white text-white" strokeWidth={0} />
      </span>
      {count && <span className="text-sm font-medium text-[#8C8C8C]">{count} ratings</span>}
    </span>
  )
}

/** "Select Size" row of pill buttons. An out-of-stock size is disabled,
 * shown with a struck-through label and a small "Out of stock" note,
 * same treatment pattern as FlipkartProductView's PillDimension. */
function SizeDimension({
  dim,
  onSelect,
}: {
  dim: NonNullable<ScrapeResult['variants']>[number]
  onSelect: (url: string) => void
}) {
  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-wide text-[#5F5F5F]">
        Select {dim.dimension}
      </p>
      <div className="mt-2 flex flex-wrap gap-2.5">
        {dim.options.map((opt) => {
          const clickable = !!opt.url && !opt.selected && !opt.outOfStock
          return (
            <button
              key={opt.label}
              type="button"
              disabled={!clickable}
              onClick={() => opt.url && onSelect(opt.url)}
              title={
                opt.outOfStock
                  ? 'Out of stock'
                  : opt.url
                    ? undefined
                    : 'No direct link found for this option'
              }
              className={`flex h-11 min-w-[52px] flex-col items-center justify-center rounded-lg border-[1.5px] px-3 text-sm font-medium ${
                opt.selected
                  ? 'border-[#9F2089] bg-[#FCEBFA] text-[#9F2089]'
                  : opt.outOfStock
                    ? 'cursor-not-allowed border-[#E5E5E5] text-[#C7C7C7] line-through'
                    : clickable
                      ? 'border-[#D5D5D5] text-[#2D2D2D] hover:border-[#9F2089]'
                      : 'cursor-not-allowed border-[#E5E5E5] text-[#C7C7C7]'
              }`}
            >
              {opt.label}
              {opt.outOfStock && (
                <span className="text-[8px] font-bold uppercase tracking-wide text-[#E4535E] no-underline">
                  Out of stock
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function MeeshoProductView({
  result,
  onSelectVariant,
}: {
  result: ScrapeResult
  onSelectVariant: (url: string) => void
}) {
  const images = result.images ?? []
  const [mainImage, setMainImage] = useState(images[0] ?? null)

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
  const sizeDims = variants.filter((d) => d.dimension.toLowerCase() === 'size')
  const otherDims = variants.filter((d) => d.dimension.toLowerCase() !== 'size')

  return (
    <div className="rounded-2xl border border-[#EDEDED] bg-white p-5 font-sans">
      <div className="grid gap-8 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* Image gallery — thumbnail rail + main image */}
        <div className="flex gap-3">
          {images.length > 1 && (
            <div className="flex flex-col gap-2">
              {images.slice(0, 8).map((src) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setMainImage(src)}
                  className={`h-12 w-12 flex-none overflow-hidden rounded border ${
                    mainImage === src ? 'border-[#9F2089] ring-1 ring-[#9F2089]' : 'border-[#EDEDED]'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-full w-full object-contain" />
                </button>
              ))}
            </div>
          )}
          <div className="aspect-square flex-1 overflow-hidden rounded-lg border border-[#F5F5F5]">
            {mainImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mainImage} alt={result.title ?? 'Product image'} className="h-full w-full object-contain" />
            ) : (
              <div className="grid h-full place-items-center text-xs text-[#8C8C8C]">No image found</div>
            )}
          </div>
        </div>

        {/* Buy box + details */}
        <div>
          <h1 className="text-base font-medium leading-snug text-[#2D2D2D]">
            {result.title ?? <span className="italic text-[#A0A0A0]">No title found</span>}
          </h1>

          {result.rating && (
            <div className="mt-2">
              <MeeshoRatingPill rating={result.rating} count={result.review_count} />
            </div>
          )}

          <div className="mt-3 flex items-baseline gap-2.5">
            {price ? (
              <span className="text-2xl font-bold text-[#2D2D2D]">{price}</span>
            ) : (
              <span className="text-base font-semibold text-[#A0A0A0]">No price found</span>
            )}
            {mrp && <span className="text-sm font-medium text-[#8C8C8C] line-through">{mrp}</span>}
            {mrp && pctOff !== null && (
              <span className="text-sm font-bold text-[#00A82D]">{pctOff}% off</span>
            )}
          </div>

          <p className="mt-1 text-xs font-medium text-[#8C8C8C]">Inclusive of all taxes</p>

          <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-[#00A82D]">
            <Truck size={13} strokeWidth={2} />
            Free Delivery
          </div>

          {/* Variant pickers sit above the buy box on the real PDP */}
          {(sizeDims.length > 0 || otherDims.length > 0) && (
            <div className="mt-4 flex flex-col gap-4">
              {sizeDims.map((dim) => (
                <SizeDimension key={dim.dimension} dim={dim} onSelect={onSelectVariant} />
              ))}
              {otherDims.map((dim) => (
                <SizeDimension key={dim.dimension} dim={dim} onSelect={onSelectVariant} />
              ))}
            </div>
          )}

          <p className="mt-4 text-sm font-semibold">
            {result.unavailable ? (
              <span className="text-[#E4535E]">Currently unavailable</span>
            ) : inStock ? (
              <span className="text-[#00A82D]">In stock</span>
            ) : (
              <span className="text-[#8C8C8C]">{result.availability}</span>
            )}
          </p>

          <div className="mt-4 sm:max-w-[260px]">
            <button
              type="button"
              disabled
              title="Demo only — this QA tool does not place real orders"
              className="flex w-full cursor-not-allowed items-center justify-center rounded-lg bg-[#9F2089] px-4 py-3 text-sm font-bold text-white opacity-70"
            >
              ADD TO CART
            </button>
          </div>

          <div className="mt-4 space-y-1 text-xs text-[#8C8C8C]">
            <p>source: {result.source === 'direct' ? 'fetched directly' : 'via ScraperAPI'}</p>
          </div>

          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#9F2089] hover:underline"
          >
            Open original listing <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </div>
  )
}