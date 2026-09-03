// app/demo/scraper-qa/platforms/MyntraProductView.tsx
'use client'

import { useEffect, useState } from 'react'
import { Heart, ExternalLink, Star, ChevronDown } from 'lucide-react'
import { formatPrice } from '@/lib/currency'
import type { ScrapeResult } from '@/lib/scrape/parsers'

/**
 * Renders a scrape result to look like the real Myntra product page —
 * brand-over-name title block, pink discount %, green rating pill,
 * image "MORE COLORS" swatch strip, size pills (with per-size price
 * when it varies), an openable size chart, WISHLIST + ADD TO BAG button
 * pair.
 *
 * Purely presentational / read-only — both buttons are disabled, same
 * as every other platform view in this QA tool; this is a scrape QA
 * tool, not a real storefront.
 *
 * SIZE PICKER NOTE: like AmazonProductView, this keeps its OWN local
 * "currently highlighted" selection state per dimension
 * (`selectedByDimension`) rather than relying purely on `opt.selected`
 * from the scrape result. Myntra in particular very often has NO size
 * pre-selected at all on initial load (see extractMyntraOptions's own
 * comment), so the tile the user just clicked needs to stay visually
 * "sticky" until a fresh re-scrape result comes back — otherwise every
 * tile would just look unselected again on the very next render.
 *
 * FIX (brand/name split bug, see conversation): this view used to
 * derive the brand line by splitting `result.title` on its first space.
 * The extractor now exposes `result.brand` directly (read from
 * Myntra's own separate `h1.pdp-title` element), so this view derives
 * `name` by stripping the known-correct `brand` prefix off of `title`.
 *
 * FIX (colors, see conversation): previously every dimension —
 * including "Color" — was rendered through the plain-text SizeRow
 * pills. Myntra never shows color as text; it's always an image swatch
 * strip labelled "MORE COLORS". This view now renders the "Color"
 * dimension separately as ColorSwatchRow.
 *
 * FIX (size chart type mismatch, see conversation): this file used to
 * define its own local `SizeChartTable` shape — `{ title, headers,
 * rows: string[][], imageUrl }` — which never actually matched what
 * lib/scrape/extractors/myntra.ts's extractMyntraSizeChart() produces:
 * `{ columns: string[], rows: Record<string,string>[], imageUrl, note }`.
 * `rows` in particular was a completely different shape (array of
 * plain objects keyed by column name, not array-of-arrays), so the old
 * SizeChartSection would either throw trying to `.map()` a row like an
 * array, or (depending on how the mismatch was swallowed upstream)
 * silently never render anything. The local type below now mirrors the
 * extractor's real MyntraSizeChartTable shape exactly, and
 * SizeChartSection reads rows by column name instead of by index.
 *
 * FIX (size chart wasn't visibly tied to the size picker, see
 * conversation): the chart is built from the exact same
 * `pdpData.sizes[]` array the Size picker itself is built from (see
 * extractMyntraSizeChart's doc comment in myntra.ts) — so this view now
 * makes that connection visible: the row matching whatever size is
 * currently selected in the picker above is highlighted in the table,
 * mirroring the real Myntra page's own filled-radio selected row (see
 * the captured screenshot — size 30 shown selected in both the pill row
 * and the chart simultaneously). A sold-out row (extractor sets
 * `Available: 'false'` on it, sourced from `pdpData.sizes[].available`)
 * is shown struck-through and desaturated, same convention already used
 * for sold-out size pills.
 *
 * Renders the real table AND the "how to measure" diagram image
 * together whenever both are present (Myntra ships both side by side on
 * the real page). Falls back to whichever one was actually found when
 * only one is present, and renders nothing at all when neither is
 * present, so it never shows an empty shell.
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

function MyntraRatingBadge({ rating, count }: { rating: string | null | undefined; count?: string | null }) {
  const value = rating ? parseFloat(rating) : NaN
  if (Number.isNaN(value)) return null
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center gap-0.5 rounded bg-[#14958f] px-1.5 py-0.5 text-[11px] font-bold text-white">
        {value.toFixed(1)}
        <Star size={10} strokeWidth={0} fill="currentColor" />
      </span>
      {count && <span className="text-xs font-medium text-[#535766]">{count} Ratings</span>}
    </span>
  )
}

type VariantDimension = NonNullable<ScrapeResult['variants']>[number]
type VariantOption = VariantDimension['options'][number]

// Mirrors MyntraSizeChartTable / MyntraSizeChartRow from
// lib/scrape/extractors/myntra.ts exactly. Defined locally (and read off
// `result` with a defensive cast below, same pattern already used for
// countryOfOrigin / manufacturer / myntraStyleId further down this file)
// in case an older/stale ScrapeResult predates this field being added to
// the shared ScrapeResult type.
//
// `rows` is an array of plain objects keyed by column name (e.g.
// `{ Size: "30", "Brand Size": "76", "Thigh (in)": "22.8", ...,
// Available: "true" }`) — NOT an array of arrays. `Available` is a
// synthetic column the extractor adds itself (not a real column Myntra
// renders) to flag sold-out size rows; it's filtered out of the visible
// table below and used only to decide row styling.
type SizeChartRow = Record<string, string>
type SizeChartTable = {
  columns: string[]
  rows: SizeChartRow[]
  imageUrl?: string | null
  note?: string | null
  unit?: 'in' | 'cm'
}

/** Image swatch strip for the "Color" dimension — matches Myntra's own
 * "MORE COLORS" block. Drops the "self" option (no image/url — the
 * color of the page you're already on) and any option explicitly
 * flagged out-of-stock, since the real site hides OOS colors entirely
 * rather than showing them struck-through (unlike sizes). */
function ColorSwatchRow({
  dim,
  onPick,
}: {
  dim: VariantDimension
  onPick: (label: string, url: string | null) => void
}) {
  const selectable = dim.options.filter((opt) => !opt.outOfStock && (opt.url || opt.image))

  if (selectable.length === 0) return null

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-[#535766]">
        More Colors <span className="normal-case text-[#94969f]">({selectable.length})</span>
      </p>
      <div className="mt-2 flex flex-wrap gap-3">
        {selectable.map((opt) => (
          <button
            key={opt.label}
            type="button"
            onClick={() => onPick(opt.label, opt.url)}
            title={opt.label}
            className="group flex w-16 flex-col items-center gap-1"
          >
            <span className="block h-16 w-16 overflow-hidden rounded-lg border border-[#eaeaec] group-hover:border-[#ff3f6c]">
              {opt.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={opt.image} alt={opt.label} className="h-full w-full object-cover" />
              ) : (
                <span className="grid h-full w-full place-items-center bg-[#f5f5f6] text-[9px] text-[#94969f]">
                  {opt.label}
                </span>
              )}
            </span>
            <span className="line-clamp-1 w-full text-center text-[11px] text-[#535766]">{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** Plain-text size pill row. Out-of-stock tiles are shown desaturated
 * with a strike, same "visible but disabled" philosophy as the generic
 * VariantPicker in ScraperQaClient.tsx. When an option carries its own
 * `price` that differs from the product's headline price (some Myntra
 * listings price sizes individually, e.g. plus sizes costing more),
 * that price is shown as a second line on the tile so it isn't hidden
 * from the user. */
function SizeRow({
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
      <p className="text-xs font-bold uppercase tracking-wide text-[#535766]">
        Select Size{selectedLabel && <span className="normal-case text-[#282c3f]"> — {selectedLabel}</span>}
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
              className={`relative flex min-h-11 min-w-11 flex-col items-center justify-center rounded-full border px-3 py-1.5 text-[13px] font-semibold ${
                opt.outOfStock
                  ? 'cursor-not-allowed border-[#eaeaec] text-[#c4c4c9] line-through'
                  : isSelected
                    ? 'border-[#ff3f6c] bg-[#fff0f3] text-[#ff3f6c]'
                    : 'border-[#d4d5d9] text-[#282c3f] hover:border-[#ff3f6c]'
              }`}
            >
              {opt.label}
              {tilePrice && <span className="text-[10px] font-medium leading-tight">{tilePrice}</span>}
              {!opt.outOfStock && lowStock && (
                <span className="mt-0.5 text-[9px] font-bold uppercase leading-tight text-[#ff905a]">
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

/** Openable (collapsed by default) size-chart panel, tucked right under
 * the size selector — same spot the real Myntra page puts its "Size
 * Chart" link. Reads `chart.rows` as objects keyed by `chart.columns`
 * (matching the real extractor shape — see the SizeChartTable type
 * comment above), never as arrays-by-index.
 *
 * The row whose "Size" value matches `selectedSize` (the size currently
 * highlighted in the pill row above) is visually marked with a filled
 * dot in the leading column, mirroring the real Myntra page's own
 * radio-selected row — see the captured screenshot, where size 30 is
 * shown selected in both the pill row and the chart at once. This is
 * the same underlying data (pdpData.sizes[]) driving both UI pieces, so
 * they can never disagree.
 *
 * A row flagged `Available: 'false'` (sold-out size, e.g. the 40 row in
 * the captured screenshot) is rendered struck-through and desaturated —
 * same "visible but disabled" convention as the sold-out size pills
 * above. `Available` itself is a synthetic column the extractor adds,
 * not a real Myntra column, and is filtered out of the visible header
 * row.
 */
function SizeChartSection({
  charts,
  selectedSize,
}: {
  charts: SizeChartTable[]
  selectedSize: string | null
}) {
  const [open, setOpen] = useState(false)

  // Prefer starting on "in" (matches the real page's own default), else
  // whichever unit table is first, else the one lone table if unit isn't
  // tagged at all (DOM-fallback path).
  const defaultUnit = charts.find((c) => c.unit === 'in')?.unit ?? charts[0]?.unit
  const [activeUnit, setActiveUnit] = useState<'in' | 'cm' | undefined>(defaultUnit)

  const chart = charts.find((c) => c.unit === activeUnit) ?? charts[0]
  const hasUnitToggle = charts.length > 1 && charts.some((c) => c.unit) 

  const visibleColumns = chart.columns.filter((c) => c !== 'Available')
  const hasRows = chart.rows.length > 0 && visibleColumns.length > 0
  const hasImage = !!chart.imageUrl

  if (!hasRows && !hasImage) return null

  return (
    <div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-[#ff3f6c]"
        >
          Size Chart
          <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} strokeWidth={2.4} />
        </button>

        {open && hasUnitToggle && (
          <div className="flex overflow-hidden rounded-full border border-[#d4d5d9]">
            {(['in', 'cm'] as const).map((u) => {
              const available = charts.some((c) => c.unit === u)
              if (!available) return null
              return (
                <button
                  key={u}
                  type="button"
                  onClick={() => setActiveUnit(u)}
                  className={`px-2.5 py-1 text-[11px] font-bold ${
                    activeUnit === u ? 'bg-[#282c3f] text-white' : 'bg-white text-[#535766]'
                  }`}
                >
                  {u}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {open && (
        <div className="mt-2 flex flex-col gap-3 rounded-lg border border-[#eaeaec] bg-[#fafafb] p-3">
          {hasRows && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-left text-[12px] text-[#535766]">
                <thead>
                  <tr>
                    <th className="w-6 border-b border-[#eaeaec] px-1 py-1.5" />
                    {visibleColumns.map((col) => (
                      <th key={col} className="border-b border-[#eaeaec] px-2.5 py-1.5 font-bold text-[#282c3f]">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {chart.rows.map((row, i) => {
                    const isSelected = selectedSize != null && row['Size'] === selectedSize
                    const isUnavailable = row['Available'] === 'false'

                    return (
                      <tr
                        key={row['Size'] ?? i}
                        className={
                          isUnavailable
                            ? 'text-[#c4c4c9] line-through'
                            : isSelected
                              ? 'bg-[#fff0f3] font-semibold text-[#282c3f]'
                              : i % 2 === 1
                                ? 'bg-white'
                                : undefined
                        }
                      >
                        <td className="px-1 py-1.5 text-center">
                          <span
                            className={`inline-block h-2.5 w-2.5 rounded-full border ${
                              isSelected
                                ? 'border-[#ff3f6c] bg-[#ff3f6c]'
                                : isUnavailable
                                  ? 'border-[#eaeaec]'
                                  : 'border-[#c4c4c9]'
                            }`}
                          />
                        </td>
                        {visibleColumns.map((col) => (
                          <td key={col} className="px-2.5 py-1.5">
                            {row[col] ?? ''}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {chart.note && <p className="mt-2 text-[10.5px] text-[#94969f]">{chart.note}</p>}
            </div>
          )}

          {hasImage && (
            <div>
              {hasRows && (
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[#94969f]">
                  How to measure yourself
                </p>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={chart.imageUrl!} alt="Size chart" className="max-w-full rounded" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function MyntraProductView({
  result,
  onSelectVariant,
}: {
  result: ScrapeResult
  onSelectVariant: (url: string) => void
}) {
  const images = result.images ?? []
  const [mainImage, setMainImage] = useState(images[0] ?? null)

  // Per-dimension local selection state, independent of every other
  // dimension — same pattern as AmazonProductView. Re-synced from the
  // scrape result's own `selected` flags whenever a genuinely new
  // result lands (new url), but sticky in between clicks.
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
  const savings =
    result.mrp && result.price && Number(result.mrp) > Number(result.price)
      ? fmt(String(Number(result.mrp) - Number(result.price)), result.currencyCode)
      : null

  const brand = result.brand ?? null
  const name =
    brand && result.title?.startsWith(brand)
      ? result.title.slice(brand.length).trim()
      : result.title ?? null

  const colorDim = result.variants?.find((d) => d.dimension.toLowerCase() === 'color')
  const otherDims = result.variants?.filter((d) => d.dimension.toLowerCase() !== 'color') ?? []

  // "More usable data" — fields the extractor already captures
  // (countryOfOrigin, manufacturer, myntraStyleId, sizeChart) but the
  // old UI never surfaced. Cast defensively in case an older/stale
  // ScrapeResult predates these fields being added to the type.
  const countryOfOrigin = (result as any).countryOfOrigin as string | null | undefined
  const manufacturer = (result as any).manufacturer as string | null | undefined
  const myntraStyleId = (result as any).myntraStyleId as number | string | null | undefined
  const hasDetails = countryOfOrigin || manufacturer || myntraStyleId

  const sizeCharts = (result as any).sizeChart as SizeChartTable[] | undefined

  return (
    <div className="rounded-2xl border border-[#eaeaec] bg-white p-5 font-sans">
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
                    mainImage === src ? 'border-[#ff3f6c] ring-1 ring-[#ff3f6c]' : 'border-[#eaeaec]'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-full w-full object-contain" />
                </button>
              ))}
            </div>
          )}
          <div className="aspect-square flex-1 overflow-hidden rounded-lg border border-[#eaeaec]">
            {mainImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mainImage} alt={result.title ?? 'Product image'} className="h-full w-full object-contain" />
            ) : (
              <div className="grid h-full place-items-center text-xs text-[#94969f]">No image found</div>
            )}
          </div>
        </div>

        {/* Buy box + details */}
        <div>
          {brand && <h1 className="text-lg font-bold text-[#282c3f]">{brand}</h1>}
          <h2 className="mt-0.5 text-[15px] text-[#535766]">
            {name || (!brand && <span className="italic text-[#94969f]">No title found</span>)}
          </h2>

          {result.rating && (
            <div className="mt-2">
              <MyntraRatingBadge rating={result.rating} count={result.review_count} />
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-baseline gap-2">
            {price ? (
              <span className="text-2xl font-bold text-[#282c3f]">{price}</span>
            ) : (
              <span className="text-base font-semibold text-[#94969f]">No price found</span>
            )}
            {mrp && <span className="text-sm font-medium text-[#94969f] line-through">MRP {mrp}</span>}
            {pctOff !== null && <span className="text-sm font-bold text-[#ff905a]">({pctOff}% OFF)</span>}
          </div>
          {savings && <p className="mt-0.5 text-xs font-semibold text-[#03a685]">You save {savings}</p>}
          <p className="mt-0.5 text-[11px] text-[#94969f]">inclusive of all taxes</p>

          <div className="mt-5 flex flex-col gap-4">
            {colorDim && <ColorSwatchRow dim={colorDim} onPick={(label, url) => pickOption('Color', label, url)} />}

            {otherDims.map((dim) => {
              const selectedLabel = selectedByDimension[dim.dimension] ?? null
              const isSizeDim = dim.dimension.toLowerCase() === 'size'
              return (
                <div key={dim.dimension} className="flex flex-col gap-2">
                  <SizeRow
                    dim={dim}
                    selectedLabel={selectedLabel}
                    basePrice={result.price}
                    onPick={(label, url) => pickOption(dim.dimension, label, url)}
                  />
                  {isSizeDim && sizeCharts && sizeCharts.length > 0 && (
                    <SizeChartSection charts={sizeCharts} selectedSize={selectedLabel} />
                  )}
                </div>
              )
            })}
          </div>

          <p className="mt-4 text-sm font-semibold">
            {result.unavailable ? (
              <span className="text-[#ff3f6c]">Sold Out</span>
            ) : result.availability ? (
              <span className="text-[#535766]">{result.availability}</span>
            ) : (
              <span className="text-[#03a685]">In Stock</span>
            )}
          </p>

          <div className="mt-4 flex gap-3 sm:max-w-[280px]">
            <button
              type="button"
              disabled
              title="Demo only — this QA tool does not place real orders"
              className="flex flex-1 items-center justify-center gap-1.5 rounded border border-[#d4d5d9] px-4 py-2.5 text-sm font-bold uppercase text-[#282c3f] opacity-70"
            >
              <Heart size={15} /> Wishlist
            </button>
            <button
              type="button"
              disabled
              title="Demo only — this QA tool does not place real orders"
              className="flex flex-1 cursor-not-allowed items-center justify-center rounded bg-[#ff3f6c] px-4 py-2.5 text-sm font-bold uppercase text-white opacity-70"
            >
              Add to Bag
            </button>
          </div>

          <div className="mt-4 space-y-1 text-[13px] text-[#535766]">
            {result.seller && <p>Sold by {result.seller}</p>}
            <p className="text-[#94969f]">source: {result.source === 'direct' ? 'fetched directly' : 'via ScraperAPI'}</p>
          </div>

          {hasDetails && (
            <div className="mt-4 space-y-1 rounded-lg bg-[#f5f5f6] p-3 text-[12px] text-[#535766]">
              <p className="text-xs font-bold uppercase tracking-wide text-[#282c3f]">Product Details</p>
              {myntraStyleId && <p>Style ID: {myntraStyleId}</p>}
              {countryOfOrigin && <p>Country of Origin: {countryOfOrigin}</p>}
              {manufacturer && <p className="line-clamp-2" title={manufacturer}>Manufacturer: {manufacturer}</p>}
            </div>
          )}

          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#ff3f6c] hover:underline"
          >
            Open original listing <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </div>
  )
}