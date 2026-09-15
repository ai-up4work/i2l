// app/demo/scraper-qa/platforms/HopscotchProductView.tsx
'use client'

import { useEffect, useState } from 'react'
import { Star, ExternalLink } from 'lucide-react'
import { formatPrice } from '@/lib/currency'
import type { ScrapeResult } from '@/lib/scrape/parsers'

/**
 * Renders a scrape result to look like the real Hopscotch product page
 * (hopscotch.in). Matches the actual PDP's coral/orange brand color for
 * the CTA and discount tag, and the age/size row rendered as a single
 * horizontal strip of pill buttons (Hopscotch's baby/kids sizing is
 * age-based — "0-3M", "3-6M", "1-2Y", etc. — so this reuses the same
 * pill treatment as Flipkart's size row rather than inventing a
 * separate "age" component).
 *
 * Purely presentational / read-only: ADD TO BAG is disabled, since this
 * is a scrape QA tool, not a real storefront.
 */

const HOPSCOTCH_CORAL = '#FF6F59'

function fmt(amount: string | null | undefined, currency: string | null | undefined) {
  const n = amount != null ? Number(amount) : NaN
  if (Number.isNaN(n)) return null
  try {
    return formatPrice(n, currency ?? 'LKR')
  } catch {
    return `${currency ?? ''} ${n}`.trim()
  }
}

function HopscotchRating({ rating, count }: { rating: string | null | undefined; count?: string | null }) {
  const value = rating ? parseFloat(rating) : NaN
  if (Number.isNaN(value)) return null
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center gap-0.5 rounded-full bg-[#2E7D32] px-1.5 py-0.5 text-xs font-bold text-white">
        {value.toFixed(1)}
        <Star size={10} className="fill-white text-white" strokeWidth={0} />
      </span>
      {count && <span className="text-xs font-medium text-[#8a8a8a]">{count} Ratings</span>}
    </span>
  )
}

type VariantDimension = NonNullable<ScrapeResult['variants']>[number]

/** Age/size strip — plain pill buttons in a single scrollable row,
 * matching the compact age-band selector on hopscotch.in PDPs. */
function AgeSizeRow({
  dim,
  onSelect,
}: {
  dim: VariantDimension
  onSelect: (url: string) => void
}) {
  return (
    <div>
      <p className="text-[13px] font-semibold text-[#232323]">Select {dim.dimension}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {dim.options.map((opt) => {
          const clickable = !!opt.url && !opt.selected && !opt.outOfStock
          return (
            <button
              key={opt.label}
              type="button"
              disabled={!clickable}
              onClick={() => opt.url && onSelect(opt.url)}
              title={opt.outOfStock ? 'Out of stock' : opt.url ? undefined : 'No direct link found for this option'}
              className={`flex h-10 min-w-[54px] items-center justify-center rounded-lg border px-3 text-[13px] font-semibold ${
                opt.selected
                  ? 'text-white'
                  : opt.outOfStock
                    ? 'cursor-not-allowed border-[#eee] text-[#cfcfcf] line-through'
                    : clickable
                      ? 'border-[#dcdcdc] text-[#232323] hover:border-[#FF6F59]/60'
                      : 'cursor-not-allowed border-[#eee] text-[#cfcfcf]'
              }`}
              style={opt.selected ? { backgroundColor: HOPSCOTCH_CORAL, borderColor: HOPSCOTCH_CORAL } : undefined}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Color swatch strip — only rendered for dimensions that carry option
 * images (Color), same split convention used across the other
 * platform views (see FlipkartProductView's swatchDims/pillDims). */
function ColorSwatchRow({
  dim,
  onSelect,
}: {
  dim: VariantDimension
  onSelect: (url: string) => void
}) {
  const selectedOpt = dim.options.find((o) => o.selected)
  return (
    <div>
      <p className="text-[13px] text-[#232323]">
        <span className="font-semibold">{dim.dimension}:</span> {selectedOpt?.label ?? ''}
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
              title={opt.outOfStock ? 'Out of stock' : opt.url ? undefined : 'No direct link found for this option'}
              className={`relative h-14 w-14 flex-none overflow-hidden rounded-full border-2 ${
                opt.selected
                  ? ''
                  : opt.outOfStock
                    ? 'cursor-not-allowed border-[#eee] opacity-50'
                    : clickable
                      ? 'border-transparent hover:border-[#FF6F59]/40'
                      : 'cursor-not-allowed border-[#eee] opacity-50'
              }`}
              style={opt.selected ? { borderColor: HOPSCOTCH_CORAL } : undefined}
            >
              {opt.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={opt.image} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center bg-[#f7f7f7] text-[8px] text-[#a0a0a0]">
                  {opt.label}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function HopscotchProductView({
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
  const swatchDims = variants.filter((d) => d.options.some((o) => o.image))
  const pillDims = variants.filter((d) => !d.options.some((o) => o.image))

  return (
    <div className="rounded-2xl border border-[#f0f0f0] bg-white p-5 font-sans">
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
                  className={`h-12 w-12 flex-none overflow-hidden rounded-lg border ${
                    mainImage === src ? 'ring-1' : 'border-[#f0f0f0]'
                  }`}
                  style={mainImage === src ? { borderColor: HOPSCOTCH_CORAL } : undefined}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-full w-full object-contain" />
                </button>
              ))}
            </div>
          )}
          <div className="aspect-square flex-1 overflow-hidden rounded-xl border border-[#f5f5f5] bg-[#fffaf7]">
            {mainImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mainImage} alt={result.title ?? 'Product image'} className="h-full w-full object-contain" />
            ) : (
              <div className="grid h-full place-items-center text-xs text-[#a3a3a3]">No image found</div>
            )}
          </div>
        </div>

        {/* Buy box + details */}
        <div>
          {result.seller && (
            <p className="text-[12px] font-semibold uppercase tracking-wide text-[#a3a3a3]">{result.seller}</p>
          )}
          <h1 className="mt-1 text-lg font-bold leading-snug text-[#232323]">
            {result.title ?? <span className="italic text-[#a3a3a3]">No title found</span>}
          </h1>

          {result.rating && (
            <div className="mt-2">
              <HopscotchRating rating={result.rating} count={result.review_count} />
            </div>
          )}

          <div className="mt-3 flex items-baseline gap-2.5">
            {price ? (
              <span className="text-2xl font-bold text-[#232323]">{price}</span>
            ) : (
              <span className="text-base font-semibold text-[#a3a3a3]">No price found</span>
            )}
            {mrp && <span className="text-sm font-medium text-[#a3a3a3] line-through">{mrp}</span>}
            {mrp && pctOff !== null && (
              <span
                className="rounded-full px-2 py-0.5 text-xs font-bold text-white"
                style={{ backgroundColor: HOPSCOTCH_CORAL }}
              >
                {pctOff}% OFF
              </span>
            )}
          </div>

          <div className="mt-5 flex flex-col gap-4">
            {swatchDims.map((dim) => (
              <ColorSwatchRow key={dim.dimension} dim={dim} onSelect={onSelectVariant} />
            ))}
            {pillDims.map((dim) => (
              <AgeSizeRow key={dim.dimension} dim={dim} onSelect={onSelectVariant} />
            ))}
          </div>

          <p className="mt-4 text-sm font-semibold">
            {result.unavailable ? (
              <span style={{ color: HOPSCOTCH_CORAL }}>Out of Stock</span>
            ) : inStock ? (
              <span className="text-[#2E7D32]">In Stock</span>
            ) : (
              <span className="text-[#8a8a8a]">{result.availability}</span>
            )}
          </p>

          <div className="mt-4 sm:max-w-[280px]">
            <button
              type="button"
              disabled
              title="Demo only — this QA tool does not place real orders"
              className="flex w-full cursor-not-allowed items-center justify-center rounded-full px-4 py-3 text-sm font-bold text-white opacity-70"
              style={{ backgroundColor: HOPSCOTCH_CORAL }}
            >
              ADD TO BAG
            </button>
          </div>

          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold hover:underline"
            style={{ color: HOPSCOTCH_CORAL }}
          >
            Open original listing <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </div>
  )
}