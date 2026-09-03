// app/demo/scraper-qa/AmazonProductView.tsx
'use client'

import { useEffect, useState } from 'react'
import { Star, ExternalLink } from 'lucide-react'
import { formatPrice } from '@/lib/currency'
import type { ScrapeResult } from '@/lib/scrape/parsers'

/**
 * Renders a scrape result to look like the real Amazon product page,
 * rather than the site-agnostic generic layout used for other
 * marketplaces. This makes it trivial for a reviewer to eyeball
 * "does this match what's actually on amazon.com" at a glance —
 * same swatch-with-price-underneath color grid, same size pill row,
 * same yellow/orange CTA buttons, same red deal badge.
 *
 * Purely presentational / read-only: Add to Cart & Buy Now are
 * disabled, since this is a scrape QA tool, not a real storefront.
 *
 * VARIANT SELECTION NOTE: each variant dimension (Color, Size, Style,
 * ...) is rendered as its own fully separate, independently-selectable
 * block — never merged into one shared tile grid. Each dimension keeps
 * its OWN local "currently highlighted" state (`selectedByDimension`),
 * set the instant a tile is clicked, rather than relying purely on
 * `opt.selected` from the scrape result. This matters because clicking
 * any tile triggers a full re-scrape of that tile's URL
 * (onSelectVariant), and the resulting page's `variants` array reflects
 * ONLY what's selected on THAT specific URL — which may not preserve
 * whatever the user had picked in a different dimension a moment ago.
 * Local state keeps each dimension's tile visually "sticky" to what the
 * user actually clicked until a fresh result comes back and we re-sync
 * from it (see the `useEffect` keyed on `result.url`/`result.variants`).
 *
 * SIZE CHART NOTE (see conversation): a previous version always showed
 * a hardcoded generic S–XXL chest/length reference chart whenever a
 * Size dimension existed, since the scraper didn't extract a real one
 * yet — this showed nonsense on products with no actual size chart at
 * all (e.g. kitchen items). Now that `extractAmazonSizeChart()` (in
 * lib/scrape/extractors/amazon.ts) scrapes the REAL per-listing chart
 * from Amazon's `.fit-sizechartv2-tables-wrapper` popover markup, the
 * "Size Chart" link/toggle is shown ONLY when `result.sizeChart`
 * actually has data. No fallback is rendered when it's absent — that's
 * either a product with no size chart, or (per the extractor's own
 * caveat) a page whose chart popover wasn't present in the fetched
 * HTML at all.
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

function AmazonStars({ rating, count }: { rating: string | null | undefined; count?: string | null }) {
  const value = rating ? parseFloat(rating) : NaN
  if (Number.isNaN(value)) return null
  const rounded = Math.round(value * 2) / 2 // allow half-stars visually
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-sm font-semibold text-[#007185]">{value.toFixed(1)}</span>
      <span className="inline-flex items-center" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => {
          const filled = i + 1 <= Math.floor(rounded)
          const half = !filled && i < rounded
          return (
            <span key={i} className="relative inline-block">
              <Star size={16} className="text-[#e3e6e6]" strokeWidth={0} fill="currentColor" />
              {(filled || half) && (
                <Star
                  size={16}
                  className="absolute inset-0 text-[#f0a80c]"
                  strokeWidth={0}
                  fill="currentColor"
                  style={half ? { clipPath: 'inset(0 50% 0 0)' } : undefined}
                />
              )}
            </span>
          )
        })}
      </span>
      {count && (
        <span className="text-sm text-[#007185] hover:text-[#c7511f] hover:underline">({count})</span>
      )}
    </span>
  )
}

/** A single variant dimension rendered as an Amazon-style swatch grid
 * (thumbnail + price under each tile) — used for dimensions where the
 * scraper found option images, e.g. Color. `selectedLabel` is this
 * dimension's OWN local selection state, fully independent of every
 * other dimension on the page. */
function SwatchGrid({
  dim,
  selectedLabel,
  onPick,
}: {
  dim: NonNullable<ScrapeResult['variants']>[number]
  selectedLabel: string | null
  onPick: (label: string, url: string | null) => void
}) {
  return (
    <div>
      <p className="text-[13px] text-[#0F1111]">
        {dim.dimension}: <span className="font-bold">{selectedLabel ?? '—'}</span>
      </p>
      <div className="mt-1.5 grid grid-cols-4 gap-2 sm:grid-cols-5">
        {dim.options.map((opt, i) => {
          const price = fmt(opt.price, opt.currencyCode)
          const isSelected = opt.label === selectedLabel
          return (
            <button
              key={`${opt.label}-${i}`}
              type="button"
              onClick={() => onPick(opt.label, opt.url)}
              title={opt.url ? opt.label : `${opt.label} — no direct link found, selection is visual only`}
              className={`flex flex-col items-center gap-0.5 rounded border p-1.5 text-center ${
                isSelected
                  ? 'border-[#007185] ring-1 ring-[#007185]'
                  : 'border-[#d5d9d9] hover:border-[#008296]'
              }`}
            >
              {opt.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={opt.image} alt={opt.label} className="h-12 w-12 object-contain" />
              ) : (
                <span className="grid h-12 w-12 place-items-center text-[10px] text-[#565959]">
                  {opt.label}
                </span>
              )}
              {price && <span className="text-[11px] leading-tight text-[#0F1111]">{price}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** A single variant dimension rendered as an Amazon-style plain button
 * row (no image) — used for dimensions like Size. `selectedLabel` is
 * this dimension's OWN local state, independent of every other
 * dimension — picking a Size here never touches Color's selection. */
function ButtonRow({
  dim,
  selectedLabel,
  onPick,
}: {
  dim: NonNullable<ScrapeResult['variants']>[number]
  selectedLabel: string | null
  onPick: (label: string, url: string | null) => void
}) {
  return (
    <div>
      <p className="text-[13px] text-[#0F1111]">
        {dim.dimension}: <span className="font-bold">{selectedLabel ?? '—'}</span>
      </p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {dim.options.map((opt) => {
          const isSelected = opt.label === selectedLabel
          return (
            <button
              key={opt.label}
              type="button"
              onClick={() => onPick(opt.label, opt.url)}
              title={opt.url ? undefined : `${opt.label} — no direct link found, selection is visual only`}
              className={`rounded-md border px-3 py-1.5 text-[13px] font-medium ${
                isSelected
                  ? 'border-[#007185] bg-[#e7f5f8] text-[#0F1111]'
                  : 'border-[#d5d9d9] text-[#0F1111] hover:border-[#008296]'
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

/** Renders the REAL scraped size chart tables only — one block per
 * table (a listing can have more than one, e.g. separate US/EU tables).
 * Never called when `chart` is null/empty; see the gating in the main
 * component below (`hasRealSizeChart`). */
function SizeChart({ chart }: { chart: NonNullable<ScrapeResult['sizeChart']> }) {
  return (
    <div className="mt-2 flex flex-col gap-3 rounded-lg border border-[#d5d9d9] bg-[#f7f8f8] p-3">
      {chart.map((table, i) => (
        <div key={i}>
          {'title' in table && table.title && (
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[#565959]">{table.title}</p>
          )}
          <table className="w-full border-collapse text-left text-[12px] text-[#0F1111]">
            <thead>
              <tr className="border-b border-[#d5d9d9]">
                {table.columns.map((col) => (
                  <th key={col} className="py-1 pr-4 font-semibold">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, r) => (
                <tr key={r} className="border-b border-[#efefef] last:border-0">
                  {table.columns.map((col) => (
                    <td key={col} className="py-1 pr-4">
                      {row[col]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

export default function AmazonProductView({
  result,
  onSelectVariant,
}: {
  result: ScrapeResult
  onSelectVariant: (url: string) => void
}) {
  const images = result.images ?? []
  const [mainImage, setMainImage] = useState(images[0] ?? null)
  const [sizeChartOpen, setSizeChartOpen] = useState(false)

  // Per-dimension local selection state — e.g. { Color: "Maroon", Size: "L" }.
  // Kept fully independent per dimension key so picking one never
  // overwrites another. Re-synced from the scrape result's own
  // `selected` flags every time a NEW result comes in (new url), so a
  // fresh page load starts from what the site actually reports, but
  // in-between clicks stay locally sticky rather than flickering back
  // to server state on every render.
  const [selectedByDimension, setSelectedByDimension] = useState<Record<string, string>>({})

  useEffect(() => {
    setMainImage((result.images ?? [])[0] ?? null)
    setSizeChartOpen(false)

    const initial: Record<string, string> = {}
    for (const dim of result.variants ?? []) {
      const selectedOpt = dim.options.find((o) => o.selected)
      if (selectedOpt) initial[dim.dimension] = selectedOpt.label
    }
    setSelectedByDimension(initial)
    // Re-sync whenever a genuinely new scrape result lands.
  }, [result.url, result.variants])

  function pickOption(dimension: string, label: string, url: string | null) {
    // Update this dimension's selection immediately — independent of
    // every other dimension, and independent of whether a re-fetch is
    // even possible for this tile.
    setSelectedByDimension((prev) => ({ ...prev, [dimension]: label }))
    if (url) onSelectVariant(url)
  }

  const price = fmt(result.price, result.currencyCode)
  const mrp = result.mrp && result.mrp !== result.price ? fmt(result.mrp, result.currencyCode) : null
  const pctOff =
    result.mrp && result.price && Number(result.mrp) > Number(result.price)
      ? Math.round((1 - Number(result.price) / Number(result.mrp)) * 100)
      : null

  const inStock =
    result.unavailable
      ? false
      : result.availability
        ? /in stock|available/i.test(result.availability)
        : true

  // Gate entirely on real scraped data — no generic/fallback chart, ever.
  const hasRealSizeChart = !!result.sizeChart && result.sizeChart.length > 0

  return (
    <div className="rounded-2xl border border-[#d5d9d9] bg-white p-5 font-sans">
      <div className="grid gap-8 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* Image gallery — thumbnail rail + main image, like amazon.com */}
        <div className="flex gap-3">
          {images.length > 1 && (
            <div className="flex flex-col gap-2">
              {images.slice(0, 8).map((src) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setMainImage(src)}
                  className={`h-12 w-12 flex-none overflow-hidden rounded border ${
                    mainImage === src ? 'border-[#e77600] ring-1 ring-[#e77600]' : 'border-[#d5d9d9]'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-full w-full object-contain" />
                </button>
              ))}
            </div>
          )}
          <div className="aspect-square flex-1 overflow-hidden rounded-lg border border-[#e7e7e7]">
            {mainImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mainImage} alt={result.title ?? 'Product image'} className="h-full w-full object-contain" />
            ) : (
              <div className="grid h-full place-items-center text-xs text-[#565959]">No image found</div>
            )}
          </div>
        </div>

        {/* Buy box + details */}
        <div>
          <h1 className="text-xl font-normal leading-snug text-[#0F1111]">
            {result.title ?? <span className="italic text-[#8a8a8a]">No title found</span>}
          </h1>

          {result.rating && (
            <div className="mt-1.5">
              <AmazonStars rating={result.rating} count={result.review_count} />
            </div>
          )}

          <hr className="my-3 border-[#e7e7e7]" />

          <div>
            {pctOff !== null && (
              <span className="mr-2 text-lg font-medium text-[#CC0C39]">-{pctOff}%</span>
            )}
            {price ? (
              <span className="text-2xl font-medium text-[#0F1111]">{price}</span>
            ) : (
              <span className="text-base font-semibold text-[#8a8a8a]">No price found</span>
            )}
          </div>
          {mrp && (
            <p className="mt-0.5 text-sm text-[#565959]">
              List Price: <span className="line-through">{mrp}</span>
            </p>
          )}

          {/* Each dimension is its own fully separate block — Color,
              Size, Style, etc. never share a tile grid, and each one's
              selection is tracked independently via
              selectedByDimension[dim.dimension]. */}
          <div className="mt-4 flex flex-col gap-4">
            {result.variants?.map((dim) => {
              const hasImages = dim.options.some((o) => !!o.image)
              const isSizeDim = /size/i.test(dim.dimension)
              const selectedLabel = selectedByDimension[dim.dimension] ?? null
              const onPick = (label: string, url: string | null) => pickOption(dim.dimension, label, url)

              return (
                <div key={dim.dimension}>
                  {hasImages ? (
                    <SwatchGrid dim={dim} selectedLabel={selectedLabel} onPick={onPick} />
                  ) : (
                    <ButtonRow dim={dim} selectedLabel={selectedLabel} onPick={onPick} />
                  )}

                  {/* Only rendered when a REAL size chart was scraped
                      for this listing — no generic fallback, no chart
                      shown at all if extractAmazonSizeChart() found
                      nothing. */}
                  {isSizeDim && hasRealSizeChart && (
                    <div className="mt-1.5">
                      <button
                        type="button"
                        onClick={() => setSizeChartOpen((v) => !v)}
                        className="inline-flex items-center gap-1 text-[13px] font-medium text-[#007185] hover:text-[#c7511f] hover:underline"
                      >
                        Size Chart
                        <span
                          className={`inline-block transition-transform ${sizeChartOpen ? 'rotate-180' : ''}`}
                        >
                          ⌄
                        </span>
                      </button>
                      {sizeChartOpen && <SizeChart chart={result.sizeChart!} />}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <p className="mt-4 text-lg font-medium">
            {result.unavailable ? (
              <span className="text-[#B12704]">Currently unavailable</span>
            ) : inStock ? (
              <span className="text-[#007600]">In Stock</span>
            ) : (
              <span className="text-[#565959]">{result.availability}</span>
            )}
          </p>

          <div className="mt-3 flex flex-col gap-2 sm:max-w-[220px]">
            <button
              type="button"
              disabled
              title="Demo only — this QA tool does not place real orders"
              className="w-full cursor-not-allowed rounded-full border border-[#a88734] bg-[#FFD814] px-4 py-2 text-sm font-medium text-[#0F1111] opacity-70"
            >
              Add to Cart
            </button>
            <button
              type="button"
              disabled
              title="Demo only — this QA tool does not place real orders"
              className="w-full cursor-not-allowed rounded-full border border-[#a5570e] bg-[#FFA41C] px-4 py-2 text-sm font-medium text-[#0F1111] opacity-70"
            >
              Buy Now
            </button>
          </div>

          <div className="mt-4 space-y-1 text-[13px] text-[#0F1111]">
            {result.seller && (
              <p>
                Sold by <span className="text-[#007185]">{result.seller}</span>
              </p>
            )}
            <p className="text-[#565959]">source: {result.source === 'direct' ? 'fetched directly' : 'via ScraperAPI'}</p>
          </div>

          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#007185] hover:underline"
          >
            Open original listing <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </div>
  )
}