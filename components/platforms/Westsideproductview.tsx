// app/demo/scraper-qa/platforms/WestsideProductView.tsx
'use client'

import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { formatPrice } from '@/lib/currency'
import type { ScrapeResult } from '@/lib/scrape/parsers'

/**
 * Renders a scrape result to look like the real Westside product page
 * (westside.com). Westside's own PDP is deliberately minimal — no
 * rating pill, no percentage-off badge, uppercase micro-labels, thin
 * 1px borders, and a plain black "ADD TO BAG" button — so this view
 * intentionally omits the rating/discount-tag treatment used on the
 * marketplace views (Amazon/Flipkart/etc.) rather than forcing it in.
 * Color/size are both rendered as plain square outline swatches, the
 * same understated tile Westside uses for both dimensions (no image
 * swatches for color — Westside represents color as a text/hex chip,
 * not a thumbnail).
 *
 * Purely presentational / read-only: ADD TO BAG is disabled, since this
 * is a scrape QA tool, not a real storefront.
 *
 * result.site for this platform may come through as 'westside'
 * (lowercase) even though the `platform` slug in data/stores/data.ts is
 * 'Westside' — no `scraperSite` override is set there, so if the real
 * scraper reports a different casing/literal, add a `scraperSite:
 * 'westside'` override on that entry rather than relying on the
 * platform slug's casing.
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

type VariantDimension = NonNullable<ScrapeResult['variants']>[number]

/** Plain outline tile row — used for both Color and Size, matching
 * Westside's own understated, single-style variant picker. */
function TileRow({
  dim,
  onSelect,
}: {
  dim: VariantDimension
  onSelect: (url: string) => void
}) {
  const selectedOpt = dim.options.find((o) => o.selected)
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a8a8a]">
        {dim.dimension}
        {selectedOpt?.label && <span className="text-[#141414]"> — {selectedOpt.label}</span>}
      </p>
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
              className={`flex h-10 min-w-[46px] items-center justify-center border px-3 text-[13px] font-medium tracking-wide ${
                opt.selected
                  ? 'border-[#141414] bg-[#141414] text-white'
                  : opt.outOfStock
                    ? 'cursor-not-allowed border-[#e5e5e5] text-[#cfcfcf] line-through'
                    : clickable
                      ? 'border-[#d4d4d4] text-[#141414] hover:border-[#141414]'
                      : 'cursor-not-allowed border-[#e5e5e5] text-[#cfcfcf]'
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

export default function WestsideProductView({
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

  const inStock = result.unavailable
    ? false
    : result.availability
      ? !/sold out|out of stock|unavailable/i.test(result.availability)
      : true

  const variants = result.variants ?? []

  return (
    <div className="border border-[#ececec] bg-white p-5 font-sans">
      <div className="grid gap-10 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Image gallery */}
        <div className="flex gap-3">
          {images.length > 1 && (
            <div className="flex flex-col gap-2">
              {images.slice(0, 8).map((src) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setMainImage(src)}
                  className={`h-12 w-12 flex-none overflow-hidden border ${
                    mainImage === src ? 'border-[#141414]' : 'border-[#ececec]'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-full w-full object-contain" />
                </button>
              ))}
            </div>
          )}
          <div className="aspect-[3/4] flex-1 overflow-hidden bg-[#fafafa]">
            {mainImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mainImage} alt={result.title ?? 'Product image'} className="h-full w-full object-contain" />
            ) : (
              <div className="grid h-full place-items-center text-xs text-[#9a9a9a]">No image found</div>
            )}
          </div>
        </div>

        {/* Buy box + details */}
        <div className="flex flex-col">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a8a8a]">Westside</p>
          <h1 className="mt-1.5 font-serif text-xl font-normal leading-snug text-[#141414]">
            {result.title ?? <span className="italic text-[#9a9a9a]">No title found</span>}
          </h1>

          <div className="mt-3 flex items-baseline gap-2.5">
            {price ? (
              <span className="text-lg font-semibold text-[#141414]">{price}</span>
            ) : (
              <span className="text-base font-semibold text-[#9a9a9a]">No price found</span>
            )}
            {mrp && <span className="text-sm text-[#9a9a9a] line-through">{mrp}</span>}
          </div>
          <p className="mt-1 text-[11px] text-[#9a9a9a]">M.R.P. inclusive of all taxes</p>

          <div className="mt-6 flex flex-col gap-5">
            {variants.map((dim) => (
              <TileRow key={dim.dimension} dim={dim} onSelect={onSelectVariant} />
            ))}
          </div>

          <p className="mt-5 text-[13px] font-medium">
            {result.unavailable ? (
              <span className="text-[#8a1f1f]">Currently unavailable</span>
            ) : inStock ? (
              <span className="text-[#1f5c2e]">In stock</span>
            ) : (
              <span className="text-[#8a8a8a]">{result.availability}</span>
            )}
          </p>

          <div className="mt-4 sm:max-w-[280px]">
            <button
              type="button"
              disabled
              title="Demo only — this QA tool does not place real orders"
              className="flex w-full cursor-not-allowed items-center justify-center bg-[#141414] px-4 py-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-white opacity-70"
            >
              Add to Bag
            </button>
          </div>

          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#141414] hover:underline"
          >
            Open original listing <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </div>
  )
}