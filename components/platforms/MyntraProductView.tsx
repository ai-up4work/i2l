'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, Star, ChevronDown, Minus, Plus, Heart, ShoppingBag, ShoppingCart, Check } from 'lucide-react'
import { formatPrice } from '@/lib/currency'
import type { ScrapeResult } from '@/lib/scrape/parsers'
import type { PlatformViewProps } from '@/lib/scrape/platform-view-props'
import ProductGallery from './ProductGallery'
import RequestActionButton from '../stores/RequestActionButton'

/**
 * Renders a scrape result using the SAME structural layout as
 * AmazonProductView — gallery (shared ProductGallery component) + buy
 * box side by side (max-w-6xl), buy box ordered as brand/name ->
 * rating -> price/savings -> color swatches -> size row (+ size chart)
 * -> stock -> original listing link -> MyntraCommerceActions, then a
 * bottom-most full-width ProductInfoTabs section — but restyled with
 * Myntra's own visual language (pink #ff3f6c accents, teal rating
 * pill, "MORE COLORS" swatch strip, pill-shaped size selector, openable
 * size chart).
 *
 * All the Myntra-specific behavior from the previous version is kept
 * as-is:
 *   - brand/name split derived from `result.brand` (not from splitting
 *     the title on its first space)
 *   - "Color" dimension always rendered as an image swatch strip
 *     (ColorSwatchRow), never as text pills
 *   - "Size" (or any other non-color) dimension rendered as pill row
 *     (SizeRow) with per-tile price shown when it differs from the
 *     headline price, plus a low-stock badge
 *   - SizeChartSection reads the real extractor shape (`rows` as
 *     objects keyed by column name, `Available` as a synthetic
 *     sold-out flag column filtered from the visible header), supports
 *     the in/cm unit toggle, and highlights whichever row matches the
 *     size currently selected in the pill row above
 *   - countryOfOrigin/manufacturer/myntraStyleId "Product Details"
 *     block, now folded into the bottom ProductInfoTabs Details tab
 *     instead of floating separately
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

// Mirrors MyntraSizeChartTable / MyntraSizeChartRow from
// lib/scrape/extractors/myntra.ts exactly. `rows` is an array of plain
// objects keyed by column name — NOT an array of arrays. `Available` is
// a synthetic column the extractor adds itself to flag sold-out size
// rows; it's filtered out of the visible table and used only for
// styling.
type SizeChartRow = Record<string, string>
type SizeChartTable = {
  columns: string[]
  rows: SizeChartRow[]
  imageUrl?: string | null
  note?: string | null
  unit?: 'in' | 'cm'
}

/** Image swatch strip for the "Color" dimension — matches Myntra's own
 * "MORE COLORS" block. Drops the "self" option (no image/url) and any
 * option explicitly flagged out-of-stock, since the real site hides OOS
 * colors entirely rather than showing them struck-through. */
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
      <p className="text-[10px] font-bold uppercase tracking-wide text-[#535766]">
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

/** Plain-text size pill row. Out-of-stock tiles shown desaturated with
 * a strike. When an option carries its own `price` that differs from
 * the product's headline price, that price is shown as a second line
 * on the tile. */
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
      <p className="text-[10px] font-bold uppercase tracking-wide text-[#535766]">
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

/** Openable (collapsed by default) size-chart panel. Reads `chart.rows`
 * as objects keyed by `chart.columns`. Highlights whichever row matches
 * `selectedSize`; a row flagged `Available: 'false'` is struck-through
 * and desaturated. */
function SizeChartSection({
  charts,
  selectedSize,
}: {
  charts: SizeChartTable[]
  selectedSize: string | null
}) {
  const [open, setOpen] = useState(false)

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

/**
 * Myntra-styled qty/wishlist/cart/request block — same functional shape
 * as AmazonCommerceActions (qty stepper, wishlist heart, Add to Cart,
 * Get Quote, inline in one wrapping row), replacing the old disabled
 * Wishlist/Add to Bag placeholder pair with pink (#ff3f6c) accents.
 */
function MyntraCommerceActions({
  result,
  qty,
  onQtyChange,
  inWishlist,
  onToggleWishlist,
  onAddToCart,
  justAdded,
  onRequestReview,
  loading,
  canAct,
}: {
  result: ScrapeResult
  qty: number
  onQtyChange: (qty: number) => void
  inWishlist: boolean
  onToggleWishlist: () => void
  onAddToCart: () => void
  justAdded: boolean
  onRequestReview: () => void
  loading?: boolean
  canAct: boolean
}) {
  return (
    <div className="mt-6 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-none items-center gap-3.5 rounded-xl border border-[#d4d5d9] px-2.5 py-1.5">
          <button
            type="button"
            aria-label="Decrease quantity"
            onClick={() => onQtyChange(Math.max(1, qty - 1))}
            className="grid h-7 w-7 place-items-center rounded-md border border-[#d4d5d9] text-[#94969f] transition-colors hover:border-[#ff3f6c]/40 hover:bg-[#ff3f6c]/5 hover:text-[#ff3f6c] active:scale-90"
          >
            <Minus size={15} />
          </button>
          <span className="min-w-[20px] text-center font-bold tabular-nums text-[#282c3f]">{qty}</span>
          <button
            type="button"
            aria-label="Increase quantity"
            onClick={() => onQtyChange(qty + 1)}
            className="grid h-7 w-7 place-items-center rounded-md border border-[#d4d5d9] text-[#94969f] transition-colors hover:border-[#ff3f6c]/40 hover:bg-[#ff3f6c]/5 hover:text-[#ff3f6c] active:scale-90"
          >
            <Plus size={15} />
          </button>
        </div>

        <button
          type="button"
          aria-label={inWishlist ? 'Remove from wishlist' : 'Save to wishlist'}
          aria-pressed={inWishlist}
          onClick={onToggleWishlist}
          disabled={!canAct}
          className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl border border-[#d4d5d9] text-[#94969f] transition-all duration-200 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Heart size={17} fill={inWishlist ? 'currentColor' : 'none'} color={inWishlist ? '#e11d48' : 'currentColor'} />
        </button>

        <button
          type="button"
          onClick={onAddToCart}
          disabled={loading || result.unavailable || !canAct}
          className="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded border border-[#d4d5d9] px-4 py-3 text-sm font-bold uppercase text-[#282c3f] transition-all duration-200 hover:border-[#ff3f6c]/40 hover:bg-[#ff3f6c]/5 hover:text-[#ff3f6c] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {justAdded ? <Check size={16} className="text-[#ff3f6c]" /> : <ShoppingBag size={16} />}
          {justAdded ? 'Added' : 'Add to Bag'}
        </button>

        <RequestActionButton
          onClick={onRequestReview}
          disabled={!canAct}
          loading={loading}
          unavailable={result.unavailable}
          unavailableLabel="NOT AVAILABLE"
          icon={<ShoppingCart size={16} />}
          className="flex-1 whitespace-nowrap rounded-xl bg-[#fb641b] px-5 py-3 text-sm font-bold text-white hover:brightness-95 disabled:bg-[#c7c7c7]"
        >
          GET QUOTE
        </RequestActionButton>
      </div>

      <p className="text-xs text-[#94969f]">You will not be charged now. This is just a request.</p>
    </div>
  )
}

/* ---------------------------------------------------------------------
 * ProductInfoTabs — inlined, Myntra-flavored (pink active indicator),
 * same Description / Details / Shipping & Returns structure and
 * bottom-most full-width slot as AmazonProductView. The old floating
 * "Product Details" block (Style ID / Country of Origin / Manufacturer)
 * is folded into the Details tab here.
 * ------------------------------------------------------------------- */

const INFO_TABS = ['Description', 'Details', 'Shipping & Returns'] as const
type InfoTab = (typeof INFO_TABS)[number]

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="font-semibold text-[#282c3f]/80">{label}</dt>
      <dd className="text-right text-[#94969f]">{value}</dd>
    </div>
  )
}

function ProductInfoTabs({
  result,
  countryOfOrigin,
  manufacturer,
  myntraStyleId,
}: {
  result: ScrapeResult
  countryOfOrigin?: string | null
  manufacturer?: string | null
  myntraStyleId?: number | string | null
}) {
  const [activeTab, setActiveTab] = useState<InfoTab>('Description')
  const hasDetails = countryOfOrigin || manufacturer || myntraStyleId || result.brand

  return (
    <div className="mt-8 border-t border-[#eaeaec] pt-6">
      <div className="flex gap-5 border-b border-[#eaeaec]">
        {INFO_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`-mb-px border-b-2 pb-2.5 text-sm font-semibold transition-colors ${
              activeTab === tab
                ? 'border-[#ff3f6c] text-[#282c3f]'
                : 'border-transparent text-[#94969f] hover:text-[#282c3f]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
      <div
        key={activeTab}
        className="min-h-[96px] pb-2 pt-4 text-sm leading-relaxed text-[#535766] motion-safe:[animation:tabFadeIn_0.18s_ease-out_both]"
      >
        {activeTab === 'Description' &&
          ((result as ScrapeResult & { description?: string }).description ? (
            <p>{(result as ScrapeResult & { description?: string }).description}</p>
          ) : (
            <p className="text-[#94969f]">
              We don&apos;t have a description for this listing. Here&apos;s the title instead:{' '}
              {result.title ?? 'no title available.'}
            </p>
          ))}
        {activeTab === 'Details' && (
          <dl className="flex flex-col gap-1.5 text-xs">
            {result.brand && <DetailRow label="Brand" value={result.brand} />}
            {myntraStyleId != null && <DetailRow label="Style ID" value={String(myntraStyleId)} />}
            {countryOfOrigin && <DetailRow label="Country of Origin" value={countryOfOrigin} />}
            {manufacturer && <DetailRow label="Manufacturer" value={manufacturer} />}
            {!hasDetails && <p className="text-[#94969f]">We don&apos;t have any additional details for this listing.</p>}
          </dl>
        )}
        {activeTab === 'Shipping & Returns' && (
          <dl className="flex flex-col gap-1.5 text-xs">
            {result.seller && <DetailRow label="Sold by" value={result.seller} />}
            {result.itemLocation && <DetailRow label="Ships from" value={result.itemLocation} />}
            <DetailRow
              label="Returns"
              value={
                result.returnsAccepted
                  ? `Accepted${result.returnPeriodDays ? ` within ${result.returnPeriodDays} days` : ''}`
                  : 'Not accepted by seller'
              }
            />
            {result.availability ? (
              <DetailRow label="Availability" value={result.availability} />
            ) : (
              !result.itemLocation &&
              !result.seller && (
                <p className="mt-1 text-[#94969f]">
                  We don&apos;t have shipping details from the seller for this listing.
                </p>
              )
            )}
          </dl>
        )}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------
 * Main component
 * ------------------------------------------------------------------- */

export default function MyntraProductView({
  result,
  onSelectVariant,
  qty,
  onQtyChange,
  inWishlist,
  onToggleWishlist,
  onAddToCart,
  justAdded,
  onRequestReview,
  loading,
  canAct,
}: PlatformViewProps) {
  const images = result.images ?? []
  const [selectedByDimension, setSelectedByDimension] = useState<Record<string, string>>({})

  useEffect(() => {
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
    brand && result.title?.startsWith(brand) ? result.title.slice(brand.length).trim() : result.title ?? null

  const colorDim = result.variants?.find((d) => d.dimension.toLowerCase() === 'color')
  const otherDims = result.variants?.filter((d) => d.dimension.toLowerCase() !== 'color') ?? []

  const countryOfOrigin = (result as any).countryOfOrigin as string | null | undefined
  const manufacturer = (result as any).manufacturer as string | null | undefined
  const myntraStyleId = (result as any).myntraStyleId as number | string | null | undefined

  const sizeCharts = (result as any).sizeChart as SizeChartTable[] | undefined

  const inStock = result.unavailable ? false : result.availability ? !/sold out/i.test(result.availability) : true

  return (
    <div className="mx-auto max-w-6xl px-6 lg:px-10 font-sans">
      <div className="grid gap-8 sm:grid-cols-2">
        {/* Image gallery — shared component, Myntra theme */}
        <ProductGallery
          images={images}
          title={result.title}
          resetKey={result.url}
          theme={{
            frameBorder: 'border-[#eaeaec]',
            activeThumb: 'border-[#ff3f6c] ring-1 ring-[#ff3f6c]',
            restingThumb: 'border-[#eaeaec]',
            placeholderText: 'text-[#94969f]',
          }}
        />

        {/* Buy box — same element order as AmazonProductView:
            brand/name -> rating -> price/savings -> color swatches ->
            size row (+ size chart) -> stock -> link -> commerce
            actions. */}
        <div className="min-w-0">
          {brand && (
            <p className="text-xs font-semibold uppercase tracking-wide text-[#94969f]">Myntra</p>
          )}
          {brand && <h1 className="mt-1 text-xl font-bold text-[#282c3f] sm:text-2xl">{brand}</h1>}
          <h2 className={`text-[15px] text-[#535766] ${brand ? 'mt-0.5' : 'mt-2'}`}>
            {name || (!brand && <span className="italic text-[#94969f]">No title found</span>)}
          </h2>

          {result.rating && (
            <div className="mt-2">
              <MyntraRatingBadge rating={result.rating} count={result.review_count} />
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-baseline gap-2">
            {price ? (
              <span className="text-3xl font-bold text-[#282c3f]">{price}</span>
            ) : (
              <span className="text-base font-semibold text-[#94969f]">No price found</span>
            )}
            {mrp && <span className="text-base font-medium text-[#94969f] line-through">MRP {mrp}</span>}
            {pctOff !== null && <span className="text-sm font-bold text-[#ff905a]">({pctOff}% OFF)</span>}
          </div>
          {savings && <p className="mt-0.5 text-xs font-semibold text-[#03a685]">You save {savings}</p>}
          <p className="mt-0.5 text-[11px] text-[#94969f]">inclusive of all taxes</p>

          <div className="mt-4 flex flex-col gap-4">
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

          <p className="mt-5 text-sm font-semibold">
            {result.unavailable ? (
              <span className="text-[#ff3f6c]">Sold Out</span>
            ) : inStock ? (
              <span className="text-[#03a685]">In Stock</span>
            ) : (
              <span className="text-[#535766]">{result.availability}</span>
            )}
          </p>

          {result.url && (
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#ff3f6c] hover:underline"
            >
              Open original listing <ExternalLink size={12} />
            </a>
          )}

          <MyntraCommerceActions
            result={result}
            qty={qty}
            onQtyChange={onQtyChange}
            inWishlist={inWishlist}
            onToggleWishlist={onToggleWishlist}
            onAddToCart={onAddToCart}
            justAdded={justAdded}
            onRequestReview={onRequestReview}
            loading={loading}
            canAct={canAct}
          />
        </div>
      </div>

      {/* Description/Details/Shipping & Returns — bottom-most,
          full-width section of the entire component. */}
      <ProductInfoTabs
        result={result}
        countryOfOrigin={countryOfOrigin}
        manufacturer={manufacturer}
        myntraStyleId={myntraStyleId}
      />
    </div>
  )
}