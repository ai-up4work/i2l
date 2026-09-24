// app/demo/scraper-qa/platforms/HopscotchProductView.tsx
'use client'

import { useEffect, useState } from 'react'
import {
  Star,
  Minus,
  Plus,
  Heart,
  ShoppingBag,
  ShoppingCart,
  Check,
  ChevronRight,
} from 'lucide-react'
import { formatPrice } from '@/lib/currency'
import type { ScrapeResult } from '@/lib/scrape/parsers'
import type { PlatformViewProps } from '@/lib/scrape/platform-view-props'
import ProductGallery from '@/components/stores/ProductGallery'
import RequestActionButton from '@/components/stores/RequestActionButton'
import Image from 'next/image'
import { SITE_LOGOS } from '@/lib/platform-logos'

/**
 * Hopscotch look-alike view, now brought into the SAME structural
 * pattern as AmazonProductView / FlipkartProductView / EbayProductView:
 * the same [info / gallery / rest] grid shell, the same
 * price -> variants -> stock -> commerce-actions ordering inside
 * "rest", the same qty+wishlist+Add-to-Cart atomic group with a
 * separately-wrapping quote/buy button, and the same bottom-most
 * full-width ProductInfoTabs (Description / Details / Shipping &
 * Returns) instead of the old two-accordion layout. Only the color
 * tokens (purple-700 for accents/CTAs) and a couple of Hopscotch-only
 * data points (MRP-only price framing, size-chart-missing warning,
 * `moreInfo` free-text block folded into the Details tab) differ from
 * the other three views now.
 *
 * Extractor-specific notes (from the sample scrape result this was
 * built against):
 *   - Hopscotch's variant options (Size, and any other dimension such
 *     as Color) carry no `url` and no `image` — they're chosen from
 *     in-page pickers that don't navigate or swap the SKU via a link,
 *     so there's nothing to `onSelectVariant` into. Picking an option
 *     here is local UI state only (mirrors the result's own
 *     `selected`/`outOfStock` flags) and does not re-scrape.
 *     `onSelectVariant` itself is therefore unused (see the
 *     destructured, renamed prop below) — same convention as the
 *     other views use for props they don't need.
 *   - Every variant dimension the extractor found (not just "Size") is
 *     rendered as its own pill row, in the order returned by
 *     `result.variants`, so a second dimension (e.g. Color) is never
 *     silently dropped.
 *   - `hasSizeChart: true` with `sizeChart: null` is a known Hopscotch
 *     extraction gap: the chart only renders into the DOM after the
 *     "View size chart" button is clicked client-side, so a plain
 *     fetch won't have captured it. When that combination occurs, the
 *     Details tab surfaces `result.warning` instead of silently
 *     showing nothing.
 *   - `moreInfo` is a Hopscotch-specific free-text field (manufacturer/
 *     packer/country-of-origin block), arriving as one unbroken string
 *     like "Label: value Label: value ...". It's parsed into label/
 *     value rows and folded into the bottom of the Details tab.
 */

function fmtPrice(amount: string | null | undefined, currency: string | null | undefined) {
  const n = amount != null ? Number(amount) : NaN
  if (Number.isNaN(n)) return null
  try {
    return formatPrice(n, currency ?? 'INR')
  } catch {
    return `${currency ?? ''} ${n}`.trim()
  }
}

function RatingStars({ rating, count }: { rating: string | null | undefined; count?: string | null }) {
  const value = rating ? parseFloat(rating) : NaN
  if (Number.isNaN(value) || value <= 0) return null
  const rounded = Math.round(value)
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center gap-0.5" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            size={13}
            className={i < rounded ? 'fill-gold-deep text-gold-deep' : 'fill-transparent text-ink/20'}
            strokeWidth={1.5}
          />
        ))}
      </span>
      <span className="text-xs font-semibold text-ink/60">
        {value.toFixed(1)}
        {count && <span className="font-normal text-ink/40"> ({count})</span>}
      </span>
    </span>
  )
}

/**
 * Button/pill variant picker — same visual pattern as the other
 * platform views (DimensionChip on Amazon, FlipkartPill, eBay's
 * VariantRow): a row of selectable chips per dimension. Local UI
 * state only — see file header on why Hopscotch variant options
 * don't drive `onSelectVariant`.
 */
function VariantPill({
  label,
  selected,
  outOfStock,
  onClick,
}: {
  label: string
  selected: boolean
  outOfStock?: boolean
  onClick?: () => void
}) {
  const interactive = !!onClick && !outOfStock
  return (
    <button
      type="button"
      onClick={interactive ? onClick : undefined}
      title={outOfStock ? 'Out of stock' : undefined}
      aria-pressed={selected}
      disabled={!interactive}
      className={
        'rounded-lg border-[1.5px] px-3.5 py-2 text-sm font-medium transition-colors ' +
        (selected
          ? 'border-purple-700 bg-purple-700 text-white'
          : outOfStock
            ? 'cursor-not-allowed border-ink/10 text-ink/30 line-through'
            : 'border-ink/15 text-ink hover:border-purple-400 hover:bg-purple-50 cursor-pointer')
      }
    >
      {label}
    </button>
  )
}

function VariantRow({
  dimension,
  selectedLabel,
  onChange,
}: {
  dimension: NonNullable<ScrapeResult['variants']>[number]
  selectedLabel: string | null
  onChange: (label: string) => void
}) {
  const isSizeDimension = dimension.dimension.toLowerCase() === 'size'
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-wide text-ink/45">{dimension.dimension}</p>
        {isSizeDimension && (
          <button type="button" className="flex items-center gap-0.5 text-xs font-bold text-purple-700 hover:underline">
            VIEW SIZE CHART <ChevronRight size={13} />
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {dimension.options.map((opt) => (
          <VariantPill
            key={opt.label}
            label={opt.label}
            selected={opt.label === selectedLabel}
            outOfStock={opt.outOfStock}
            onClick={() => onChange(opt.label)}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Hopscotch-styled qty/wishlist/cart/request block — same functional
 * shape as AmazonCommerceActions/FlipkartCommerceActions/
 * EbayCommerceActions: qty stepper + wishlist heart + Add to Cart
 * grouped into one `flex-nowrap` atomic unit, with a separately-
 * wrapping "BUY NOW" button playing the same role the other views
 * give "GET QUOTE" — fixed to its natural width on desktop
 * (sm:grow-0 sm:basis-auto), the only thing allowed to wrap to its
 * own full-width line on mobile (grow basis-full).
 */
function HopscotchCommerceActions({
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
        <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-2">
          <div className="flex flex-none items-center gap-3.5 rounded-xl border border-ink/15 px-2.5 py-1.5">
            <button
              type="button"
              aria-label="Decrease quantity"
              onClick={() => onQtyChange(Math.max(1, qty - 1))}
              className="grid h-7 w-7 place-items-center rounded-md border border-ink/15 text-ink/60 transition-colors hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700 active:scale-90"
            >
              <Minus size={15} />
            </button>
            <span className="min-w-[20px] text-center font-bold tabular-nums">{qty}</span>
            <button
              type="button"
              aria-label="Increase quantity"
              onClick={() => onQtyChange(qty + 1)}
              className="grid h-7 w-7 place-items-center rounded-md border border-ink/15 text-ink/60 transition-colors hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700 active:scale-90"
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
            className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl border border-ink/15 text-ink/50 transition-all duration-200 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Heart size={17} fill={inWishlist ? 'currentColor' : 'none'} color={inWishlist ? '#e11d48' : 'currentColor'} />
          </button>

          <RequestActionButton
            onClick={onAddToCart}
            disabled={!canAct}
            loading={loading}
            unavailable={result.unavailable}
            unavailableLabel="NOT AVAILABLE"
            icon={justAdded ? <Check size={16} className="text-purple-700" /> : <ShoppingBag size={16} />}
            color="#6d28d9"
            disabledColor="#c7c7c7"
            className="flex-1 whitespace-nowrap rounded-xl border-2 border-purple-700 px-5 py-3 text-sm font-bold text-purple-700 hover:bg-purple-50"
          >
            {justAdded ? 'ADDED' : 'ADD TO CART'}
          </RequestActionButton>
        </div>

          <RequestActionButton
            onClick={onRequestReview}
            disabled={!canAct}
            loading={loading}
            unavailable={result.unavailable}
            unavailableLabel="NOT AVAILABLE"
            icon={<ShoppingCart size={16} />}
            color="#4169E1"           
            disabledColor="#c7c7c7"
            className="grow basis-full whitespace-nowrap rounded-xl px-5 py-3 text-sm font-bold text-amber-900 hover:brightness-95 sm:grow-0 sm:basis-auto"
          >
            BUY NOW
          </RequestActionButton>
      </div>

      <p className="text-xs text-ink/40">You will not be charged now. This is just a request.</p>
    </div>
  )
}

/* ---------------------------------------------------------------------
 * ProductInfoTabs — same Description / Details / Shipping & Returns
 * tab-switcher as Amazon/Flipkart/eBay, purple active indicator,
 * rendered as the bottom-most, full-width section. Hopscotch's
 * `moreInfo` free-text block and sizeChart-missing warning are folded
 * into the Details tab rather than living in separate accordions.
 * ------------------------------------------------------------------- */

const INFO_TABS = ['Description', 'Details', 'Shipping & Returns'] as const
type InfoTab = (typeof INFO_TABS)[number]

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="font-semibold text-ink/70">{label}</dt>
      <dd className="text-right text-ink/55">{value}</dd>
    </div>
  )
}

function SizeChart({ chart }: { chart: NonNullable<ScrapeResult['sizeChart']> }) {
  return (
    <div className="flex flex-col gap-3">
      {chart.map((table, i) => (
        <div key={i}>
          {'title' in table && table.title && (
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-ink/45">{table.title}</p>
          )}
          {'columns' in table ? (
            <table className="w-full border-collapse text-left text-[12px] text-ink">
              <thead>
                <tr className="border-b border-ink/10">
                  {table.columns.map((col) => (
                    <th key={col} className="py-1 pr-4 font-semibold">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, r) => (
                  <tr key={r} className="border-b border-ink/5 last:border-0">
                    {table.columns.map((col) => (
                      <td key={col} className="py-1 pr-4">
                        {row[col]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <pre className="whitespace-pre-wrap text-[12px] text-ink">{JSON.stringify(table, null, 2)}</pre>
          )}
        </div>
      ))}
    </div>
  )
}

/** Parses Hopscotch's `moreInfo` blob ("Label: value Label: value ...")
 * into label/value rows, same DetailRow shape as everything else. */
function parseMoreInfo(moreInfo: string): { name: string; value: string }[] {
  const parts = moreInfo.split(/(?=[A-Z][a-zA-Z ]+:)/g).filter(Boolean)
  return parts.map((part) => {
    const idx = part.indexOf(':')
    if (idx === -1) return { name: part.trim(), value: '' }
    return { name: part.slice(0, idx).trim(), value: part.slice(idx + 1).trim() }
  })
}

function ProductInfoTabs({ result }: { result: ScrapeResult & { moreInfo?: string | null } }) {
  const [activeTab, setActiveTab] = useState<InfoTab>('Description')
  const hasRealSizeChart = !!result.sizeChart && result.sizeChart.length > 0
  const sizeChartMissing = result.sizeChart === null && !!result.warning
  const moreInfoRows = result.moreInfo ? parseMoreInfo(result.moreInfo) : []

  return (
    <div className="mt-8 border-t border-ink/10 pt-6">
      <div className="flex gap-5 border-b border-ink/10">
        {INFO_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`-mb-px border-b-2 pb-2.5 text-sm font-semibold transition-colors ${
              activeTab === tab
                ? 'border-purple-700 text-ink'
                : 'border-transparent text-ink/40 hover:text-ink/70'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
      <div
        key={activeTab}
        className="min-h-[96px] pb-2 pt-4 text-sm leading-relaxed text-ink/65 motion-safe:[animation:tabFadeIn_0.18s_ease-out_both]"
      >
        {activeTab === 'Description' &&
          (result.description ? (
            <p>{result.description}</p>
          ) : (
            <p className="text-ink/45">
              We don&apos;t have a description for this listing. Here&apos;s the title instead:{' '}
              {result.title ?? 'no title available.'}
            </p>
          ))}
        {activeTab === 'Details' && (
          <div className="flex flex-col gap-4">
            <dl className="flex flex-col gap-1.5 text-xs">
              {result.brand && <DetailRow label="Brand" value={result.brand} />}
              {result.mpn && <DetailRow label="Model" value={result.mpn} />}
              {result.categoryPath && <DetailRow label="Category" value={result.categoryPath} />}
              {result.itemSpecifics?.map((spec) => (
                <DetailRow key={spec.name} label={spec.name} value={spec.value} />
              ))}
              {moreInfoRows.map((row, i) => (
                <DetailRow key={`more-${i}`} label={row.name} value={row.value} />
              ))}
              {!result.brand &&
                !result.mpn &&
                !result.itemSpecifics?.length &&
                !moreInfoRows.length &&
                !hasRealSizeChart && <p className="text-ink/45">We don&apos;t have any additional details for this listing.</p>}
            </dl>

            {sizeChartMissing && (
              <p className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-2.5 text-xs text-purple-800">
                {result.warning}
              </p>
            )}

            {hasRealSizeChart && (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink/45">Size chart</p>
                <div className="rounded-lg border border-ink/10 bg-card p-3">
                  <SizeChart chart={result.sizeChart!} />
                </div>
              </div>
            )}
          </div>
        )}
        {activeTab === 'Shipping & Returns' && (
          <dl className="flex flex-col gap-1.5 text-xs">
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
              !result.itemLocation && (
                <p className="mt-1 text-ink/45">
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

export default function HopscotchProductView({
  result,
  onSelectVariant: _onSelectVariant,
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
  const variants = result.variants ?? []

  const [selectedByDimension, setSelectedByDimension] = useState<Record<string, string | null>>({})

  useEffect(() => {
    const initial: Record<string, string | null> = {}
    for (const dim of variants) {
      initial[dim.dimension] = dim.options.find((o) => o.selected)?.label ?? null
    }
    setSelectedByDimension(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.url])

  function pickOption(dimension: string, label: string) {
    setSelectedByDimension((prev) => ({ ...prev, [dimension]: label }))
  }

  const price = fmtPrice(result.price, result.currencyCode)
  const mrp = result.mrp && result.mrp !== result.price ? fmtPrice(result.mrp, result.currencyCode) : null

  const inStock = result.unavailable
    ? false
    : result.availability
      ? !/sold out|out of stock|unavailable/i.test(result.availability)
      : true

  return (
    <div className="mx-auto max-w-6xl px-6 lg:px-10">
      <div
        className="grid gap-8 [grid-template-areas:'info'_'gallery'_'rest'] sm:grid-cols-2 sm:[grid-template-areas:'gallery_info'_'gallery_rest']"
      >
        {/* Top of buy box: logo + rating, then title.
            Mobile: first (area "info"). Desktop: top-right column. */}
        <div className="min-w-0 [grid-area:info]">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-ink/50">
            <a href={result.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center">
              <Image src={SITE_LOGOS.hopscotch!} alt="Hopscotch" width={90} height={18} />
            </a>
            {result.rating && (
              <>
                <span className="text-ink/20">·</span>
                <RatingStars rating={result.rating} count={result.review_count} />
              </>
            )}
          </div>

          <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
            {result.title ?? <span className="italic text-ink/40">No title found</span>}
          </h1>
        </div>

        {/* Image gallery — shared component, Hopscotch theme.
            Mobile: second (area "gallery"). Desktop: left column,
            spanning both rows since "gallery" repeats in both area rows. */}
        <div className="min-w-0 [grid-area:gallery]">
          <ProductGallery
            images={images}
            title={result.title}
            resetKey={result.url}
            theme={{
              frameBorder: 'border-ink/10',
              activeThumb: 'border-purple-600 ring-1 ring-purple-600',
              restingThumb: 'border-ink/10',
              placeholderText: 'text-ink/40',
            }}
          />
        </div>

        {/* Rest of buy box: price -> variants -> stock -> commerce
            actions. Mobile: third (area "rest"). Desktop: bottom-right
            column — same ordering as Amazon/Flipkart/eBay. */}
        <div className="min-w-0 [grid-area:rest]">
          <div className="flex items-baseline gap-2">
            {price ? (
              <p className="text-3xl font-bold text-purple-700">{price}</p>
            ) : (
              <p className="text-base font-semibold text-ink/40">No price found</p>
            )}
            {mrp && <p className="text-base font-semibold text-ink/40 line-through">{mrp}</p>}
          </div>
          <p className="mt-1 text-xs text-ink/40">Inclusive of all taxes</p>

          {!!variants.length && (
            <div className="mt-4 flex flex-wrap gap-6">
              {variants.map((dim) => (
                <VariantRow
                  key={dim.dimension}
                  dimension={dim}
                  selectedLabel={selectedByDimension[dim.dimension] ?? null}
                  onChange={(label) => pickOption(dim.dimension, label)}
                />
              ))}
            </div>
          )}

          <p className="mt-5 text-sm font-semibold">
            {result.unavailable ? (
              <span className="text-ink/45">Currently unavailable</span>
            ) : inStock ? (
              <span className="text-purple-700">In stock</span>
            ) : (
              <span className="text-ink/45">{result.availability}</span>
            )}
          </p>

          <HopscotchCommerceActions
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
          full-width section of the entire component, same as the
          other three platform views. */}
      <ProductInfoTabs result={result as ScrapeResult & { moreInfo?: string | null }} />
    </div>
  )
}