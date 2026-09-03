// app/demo/scraper-qa/platforms/FlipkartProductView.tsx
'use client'

import { useState } from 'react'
import { ChevronRight, ExternalLink, Star } from 'lucide-react'
import { formatPrice } from '@/lib/currency'
import type { ScrapeResult } from '@/lib/scrape/parsers'

/**
 * Renders a scrape result to look like the real Flipkart product page.
 * Matches the actual PDP layout as closely as the scraped data allows:
 * a "Selected Color: X" line above a row of swatch thumbnails, a
 * "Select Size" row of pill buttons, the green rating pill, a "Hot Deal"
 * tag, the "-X%" discount line next to a struck-through MRP, and the
 * blue "Apply offers for maximum savings" box showing the best
 * (offer-inclusive) price — the same elements a reviewer would check
 * against flipkart.com at a glance, the same way AmazonProductView does
 * for Amazon.
 *
 * Purely presentational / read-only: ADD TO CART & BUY NOW are disabled,
 * since this is a scrape QA tool, not a real storefront.
 *
 * Individual swatch/size tiles that the extractor flagged as
 * `outOfStock` (Flipkart's "Out Of Stock" overlay badge on that specific
 * option — see flipkart.ts) are rendered disabled and visually muted,
 * same treatment as a tile with no resolvable link, plus a small
 * "Out of stock" label so a reviewer can tell the two apart.
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

/** Flipkart's green rating pill — filled white star + numeric rating,
 * no half-star rendering (Flipkart doesn't show half-stars either). */
function FlipkartRatingPill({ rating, count }: { rating: string | null | undefined; count?: string | null }) {
  const value = rating ? parseFloat(rating) : NaN
  if (Number.isNaN(value)) return null
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-flex items-center gap-0.5 rounded bg-[#388E3C] px-1.5 py-0.5 text-xs font-bold text-white">
        {value.toFixed(1)}
        <Star size={11} className="fill-white text-white" strokeWidth={0} />
      </span>
      {count && <span className="text-sm font-medium text-[#878787]">{count}</span>}
    </span>
  )
}

/** Color/style dimension rendered as a horizontally-scrollable row of
 * square image thumbnails, matching Flipkart's swatch strip — the
 * currently-selected tile gets a solid dark border, everything else a
 * thin gray one. A tile the extractor flagged as out-of-stock (real
 * Flipkart overlays an "Out Of Stock" badge on that swatch's image) is
 * rendered disabled, desaturated, and carries its own small label —
 * distinct from a merely-unclickable tile that's missing a link. A ">"
 * affordance hints there's more to scroll, the same way Flipkart's real
 * strip does when it overflows. */
function SwatchDimension({
  dim,
  onSelect,
}: {
  dim: NonNullable<ScrapeResult['variants']>[number]
  onSelect: (url: string) => void
}) {
  const selectedOpt = dim.options.find((o) => o.selected)
  return (
    <div>
      <p className="text-[15px] text-[#212121]">
        <span className="font-medium">Selected {dim.dimension}:</span>{' '}
        {selectedOpt?.label && !/^[a-f0-9-]{8,}$/i.test(selectedOpt.label) ? selectedOpt.label : ''}
      </p>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
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
              className={`relative h-[78px] w-[68px] flex-none overflow-hidden rounded-xl border-[1.5px] ${
                opt.selected
                  ? 'border-[#1f1f1f]'
                  : opt.outOfStock
                    ? 'cursor-not-allowed border-[#e8e8e8]'
                    : clickable
                      ? 'border-[#d6d6d6] hover:border-[#878787]'
                      : 'cursor-not-allowed border-[#e8e8e8] opacity-50'
              }`}
            >
              {opt.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={opt.image}
                  alt=""
                  className={`h-full w-full object-cover ${opt.outOfStock ? 'opacity-40 grayscale' : ''}`}
                />
              ) : (
                <div className="grid h-full w-full place-items-center bg-[#f5f5f5] text-[9px] text-[#a0a0a0]">
                  No image
                </div>
              )}
              {opt.outOfStock && (
                <span className="absolute inset-x-0 bottom-0 bg-black/70 py-0.5 text-center text-[8px] font-bold uppercase tracking-wide text-white">
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

/** Size (or any non-image) dimension rendered as a row of pill buttons,
 * matching Flipkart's plain-text size picker — no swatch image, just
 * the label in a rounded outline box. An out-of-stock tile is disabled,
 * shown with a struck-through label, matching the muted treatment used
 * for out-of-stock swatch tiles above. */
function PillDimension({
  dim,
  onSelect,
}: {
  dim: NonNullable<ScrapeResult['variants']>[number]
  onSelect: (url: string) => void
}) {
  return (
    <div>
      <div className="flex items-baseline gap-3">
        <p className="text-[15px] font-medium text-[#212121]">Select {dim.dimension}</p>
        <span className="text-sm font-medium text-[#2874F0]">Size Chart</span>
      </div>
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
              className={`flex h-11 min-w-[52px] items-center justify-center rounded-xl border-[1.5px] px-3 text-sm font-medium ${
                opt.selected
                  ? 'border-[#2874F0] bg-[#eaf2ff] text-[#0F1111]'
                  : opt.outOfStock
                    ? 'cursor-not-allowed border-[#e8e8e8] text-[#c7c7c7] line-through'
                    : clickable
                      ? 'border-[#d6d6d6] text-[#212121] hover:border-[#878787]'
                      : 'cursor-not-allowed border-[#e8e8e8] text-[#c7c7c7]'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function FlipkartProductView({
  result,
  onSelectVariant,
}: {
  result: ScrapeResult
  onSelectVariant: (url: string) => void
}) {
  const images = result.images ?? []
  const [mainImage, setMainImage] = useState(images[0] ?? null)
  const [offersOpen, setOffersOpen] = useState(true)

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

  // Split variant dimensions into image-swatch style (Color/Style — has
  // at least one tile with an image) vs. plain pill style (Size, or any
  // dimension whose tiles carry no image), so each renders with the
  // matching Flipkart layout instead of one generic picker for both.
  const variants = result.variants ?? []
  const swatchDims = variants.filter((d) => d.options.some((o) => o.image))
  const pillDims = variants.filter((d) => !d.options.some((o) => o.image))

  return (
    <div className="rounded-2xl border border-[#e0e0e0] bg-white p-5 font-sans">
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
                    mainImage === src ? 'border-[#2874F0] ring-1 ring-[#2874F0]' : 'border-[#e0e0e0]'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-full w-full object-contain" />
                </button>
              ))}
            </div>
          )}
          <div className="aspect-square flex-1 overflow-hidden rounded-lg border border-[#f0f0f0]">
            {mainImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mainImage} alt={result.title ?? 'Product image'} className="h-full w-full object-contain" />
            ) : (
              <div className="grid h-full place-items-center text-xs text-[#878787]">No image found</div>
            )}
          </div>
        </div>

        {/* Buy box + details */}
        <div>
          {/* Variant pickers sit above the title on the real PDP */}
          <div className="flex flex-col gap-5">
            {swatchDims.map((dim) => (
              <SwatchDimension key={dim.dimension} dim={dim} onSelect={onSelectVariant} />
            ))}
            {pillDims.map((dim) => (
              <PillDimension key={dim.dimension} dim={dim} onSelect={onSelectVariant} />
            ))}
          </div>

          <h1 className={`text-lg font-medium leading-snug text-[#212121] ${variants.length ? 'mt-4' : ''}`}>
            {result.title ?? <span className="italic text-[#a0a0a0]">No title found</span>}
          </h1>

          {result.rating && (
            <div className="mt-2">
              <FlipkartRatingPill rating={result.rating} count={result.review_count} />
            </div>
          )}

          {result.seller && (
            <p className="mt-1.5 text-xs font-medium text-[#878787]">Sold by {result.seller}</p>
          )}

          {pctOff !== null && pctOff >= 50 && (
            <span className="mt-3 inline-block rounded bg-[#388E3C] px-2 py-0.5 text-xs font-bold text-white">
              Hot Deal
            </span>
          )}

          <div className="mt-2 flex items-baseline gap-2.5">
            {mrp && pctOff !== null && (
              <span className="text-sm font-medium text-[#388E3C]">↓{pctOff}%</span>
            )}
            {mrp && <span className="text-sm font-medium text-[#878787] line-through">{mrp}</span>}
            {price ? (
              <span className="text-2xl font-bold text-[#212121]">{price}</span>
            ) : (
              <span className="text-base font-semibold text-[#a0a0a0]">No price found</span>
            )}
          </div>


          <p className="mt-4 text-sm font-semibold">
            {result.unavailable ? (
              <span className="text-[#FF6161]">Sold Out</span>
            ) : inStock ? (
              <span className="text-[#388E3C]">In stock</span>
            ) : (
              <span className="text-[#878787]">{result.availability}</span>
            )}
          </p>

          <div className="mt-4 flex flex-col gap-2 sm:max-w-[260px] sm:flex-row">
            <button
              type="button"
              disabled
              title="Demo only — this QA tool does not place real orders"
              className="flex w-full cursor-not-allowed items-center justify-center rounded-sm bg-[#ff9f00] px-4 py-3 text-sm font-bold text-white opacity-70"
            >
              ADD TO CART
            </button>
            <button
              type="button"
              disabled
              title="Demo only — this QA tool does not place real orders"
              className="flex w-full cursor-not-allowed items-center justify-center rounded-sm bg-[#fb641b] px-4 py-3 text-sm font-bold text-white opacity-70"
            >
              BUY NOW
            </button>
          </div>

          <div className="mt-4 space-y-1 text-xs text-[#878787]">
            <p>source: {result.source === 'direct' ? 'fetched directly' : 'via ScraperAPI'}</p>
          </div>

          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#2874F0] hover:underline"
          >
            Open original listing <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </div>
  )
}