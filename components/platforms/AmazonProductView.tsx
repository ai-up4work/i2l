'use client'

import { useEffect, useState } from 'react'
import { Star, ExternalLink, Minus, Plus, Heart, ShoppingBag, ShoppingCart, Check } from 'lucide-react'
import { formatPrice } from '@/lib/currency'
import type { ScrapeResult } from '@/lib/scrape/parsers'
import type { PlatformViewProps } from '@/lib/scrape/platform-view-props'
import ProductGallery from './ProductGallery'
import RequestActionButton from '@/components/stores/RequestActionButton'

/**
 * Renders a scrape result using the SAME visual language as the
 * marketplace product page — labeled variant rows with chip/swatch
 * styling, teal-deep price, the same stock-status treatment.
 *
 * LAYOUT (top to bottom):
 *   1. Gallery (shared ProductGallery component) + buy box, side by
 *      side, capped at max-w-6xl. The buy box's right column also
 *      contains AmazonCommerceActions (qty stepper, wishlist, Add to
 *      Cart, Get Quote, disclaimer) — all inline in a single wrapping
 *      row — directly beneath the price/variants/stock/original-listing-
 *      link stack.
 *   2. ProductInfoTabs — Description/Details/Shipping & Returns,
 *      inlined into this same file, still the BOTTOM-MOST, full-width
 *      section of the whole view. The real scraped size chart (when
 *      present) lives inside its Details tab.
 *
 * Variant chips/swatches now show BOTH the option's price and its
 * struck-through original/list price, sourced directly from
 * `opt.mrp` — the per-tile field now populated by
 * extractAmazonAllVariants() in lib/scrape/extractors/amazon.ts (each
 * swatch tile's own `.a-text-price .a-offscreen`, scoped per-tile so it
 * can't cross-contaminate with a different tile's price/mrp, same
 * safety property as the main buybox price extraction).
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

function RatingStars({ rating, count }: { rating: string | null | undefined; count?: string | null }) {
  const value = rating ? parseFloat(rating) : NaN
  if (Number.isNaN(value)) return null
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

function DimensionChip({
  label,
  price,
  originalPrice,
  selected,
  onClick,
  disabledTitle,
}: {
  label: string
  price?: string | null
  originalPrice?: string | null
  selected: boolean
  onClick?: () => void
  disabledTitle?: string
}) {
  const interactive = !!onClick
  return (
    <button
      type="button"
      onClick={interactive ? onClick : undefined}
      title={disabledTitle}
      aria-pressed={selected}
      className={
        'flex flex-col items-center rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ' +
        (selected
          ? 'border-teal-deep bg-teal-deep text-white'
          : 'border-ink/15 text-ink/70' + (interactive ? ' hover:border-ink/30 cursor-pointer' : ''))
      }
    >
      {label}
      {price && (
        <span className={`text-[10px] font-semibold ${selected ? 'text-white' : 'text-ink/70'}`}>{price}</span>
      )}
      {originalPrice && (
        <span className={`text-[10px] font-normal line-through ${selected ? 'text-white/60' : 'text-ink/35'}`}>
          {originalPrice}
        </span>
      )}
    </button>
  )
}

function DimensionSwatch({
  label,
  imageUrl,
  price,
  originalPrice,
  selected,
  onClick,
  disabledTitle,
}: {
  label: string
  imageUrl?: string | null
  price?: string | null
  originalPrice?: string | null
  selected: boolean
  onClick?: () => void
  disabledTitle?: string
}) {
  const interactive = !!onClick
  return (
    <span className="inline-flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={interactive ? onClick : undefined}
        title={disabledTitle}
        aria-pressed={selected}
        aria-label={label}
        className={
          'relative grid h-9 w-9 place-items-center overflow-hidden rounded-full border-2 shadow-sm bg-cover bg-center transition-all ' +
          (selected
            ? 'border-teal-deep ring-2 ring-teal-deep ring-offset-1 ring-offset-parchment'
            : 'border-white ring-1 ring-ink/15') +
          (interactive ? ' cursor-pointer hover:ring-2 hover:ring-ink/25' : '')
        }
        style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : { background: 'linear-gradient(135deg, #e5e0d8 0%, #cfc8ba 100%)' }}
      >
        {!imageUrl && (
          <span className="text-[9px] font-bold uppercase tracking-tight text-ink/50">{label.trim().slice(0, 2)}</span>
        )}
      </button>
      <span className={`text-[10px] font-medium ${selected ? 'text-teal-deep' : 'text-ink/60'}`}>{label}</span>
      {price && <span className="text-[10px] font-semibold text-ink/70">{price}</span>}
      {originalPrice && <span className="text-[10px] font-normal text-ink/35 line-through">{originalPrice}</span>}
    </span>
  )
}

/**
 * Amazon-styled qty/wishlist/cart/request block — rendered inside the
 * right (buy box) column. Qty stepper, wishlist heart, Add to Cart,
 * and Get Quote all sit inline in a single wrapping row.
 */
function AmazonCommerceActions({
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
        <div className="flex flex-none items-center gap-3.5 rounded-xl border border-ink/15 px-2.5 py-1.5">
          <button
            type="button"
            aria-label="Decrease quantity"
            onClick={() => onQtyChange(Math.max(1, qty - 1))}
            className="grid h-7 w-7 place-items-center rounded-md border border-ink/15 text-ink/60 transition-colors hover:border-teal/30 hover:bg-teal/5 hover:text-teal-deep active:scale-90"
          >
            <Minus size={15} />
          </button>
          <span className="min-w-[20px] text-center font-bold tabular-nums">{qty}</span>
          <button
            type="button"
            aria-label="Increase quantity"
            onClick={() => onQtyChange(qty + 1)}
            className="grid h-7 w-7 place-items-center rounded-md border border-ink/15 text-ink/60 transition-colors hover:border-teal/30 hover:bg-teal/5 hover:text-teal-deep active:scale-90"
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

        <button
          type="button"
          onClick={onAddToCart}
          disabled={loading || result.unavailable || !canAct}
          className="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-ink/15 px-4 py-3 text-sm font-semibold text-ink transition-all duration-200 hover:border-teal/30 hover:bg-teal/5 hover:text-teal-deep active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {justAdded ? <Check size={16} className="text-teal-deep" /> : <ShoppingBag size={16} />}
          {justAdded ? 'Added' : 'Add to Cart'}
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

      <p className="text-xs text-ink/40">You will not be charged now. This is just a request.</p>
    </div>
  )
}

/* ---------------------------------------------------------------------
 * ProductInfoTabs — inlined here (no separate file). Same
 * Description / Details / Shipping & Returns tab-switcher as before,
 * rendered as the bottom-most, full-width section of the whole view.
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

/** Renders the REAL scraped size chart tables only — one block per table. */
function SizeChart({ chart }: { chart: NonNullable<ScrapeResult['sizeChart']> }) {
  return (
    <div className="flex flex-col gap-3">
      {chart.map((table, i) => (
        <div key={i}>
          {'title' in table && table.title && (
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-ink/45">{table.title}</p>
          )}
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
        </div>
      ))}
    </div>
  )
}

function ProductInfoTabs({ result }: { result: ScrapeResult }) {
  const [activeTab, setActiveTab] = useState<InfoTab>('Description')
  const hasRealSizeChart = !!result.sizeChart && result.sizeChart.length > 0

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
                ? 'border-teal-deep text-ink'
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
          ((result as ScrapeResult & { description?: string }).description ? (
            <p>{(result as ScrapeResult & { description?: string }).description}</p>
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
              {!result.brand && !result.mpn && !result.itemSpecifics?.length && !hasRealSizeChart && (
                <p className="text-ink/45">We don&apos;t have any additional details for this listing.</p>
              )}
            </dl>

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

export default function AmazonProductView({
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

  const inStock = result.unavailable
    ? false
    : result.availability
      ? /in stock|available/i.test(result.availability)
      : true

  return (
    <div className="mx-auto max-w-6xl px-6 lg:px-10">
      <div className="grid gap-8 sm:grid-cols-2">
        {/* Image gallery — shared component, Amazon theme */}
        <ProductGallery
          images={images}
          title={result.title}
          resetKey={result.url}
          theme={{
            frameBorder: 'border-ink/10',
            activeThumb: 'border-teal-deep ring-1 ring-teal-deep',
            restingThumb: 'border-ink/10',
            placeholderText: 'text-ink/40',
          }}
        />

        {/* Buy box — also contains the qty/cart/quote block right
            below the price/variants/stock/link stack. */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-ink/50">
            <span>Amazon</span>
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

          <div className="mt-3 flex items-baseline gap-2">
            {price ? (
              <p className="text-3xl font-bold text-teal-deep">{price}</p>
            ) : (
              <p className="text-base font-semibold text-ink/40">No price found</p>
            )}
            {mrp && <p className="text-base font-semibold text-ink/40 line-through">{mrp}</p>}
          </div>

          {!!result.variants?.length && (
            <div className="mt-4 flex flex-wrap gap-6">
              {result.variants.map((dim) => {
                const hasImages = dim.options.some((o) => !!o.image)
                const selectedLabel = selectedByDimension[dim.dimension] ?? null

                return (
                  <div key={dim.dimension}>
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-ink/45">
                      {dim.dimension}
                    </p>
                    <div className={hasImages ? 'flex flex-wrap gap-3' : 'flex flex-wrap gap-1.5'}>
                      {dim.options.map((opt, i) => {
                        const optPrice = fmt(opt.price, opt.currencyCode)

                        // opt.mrp is populated directly by
                        // extractAmazonAllVariants() in
                        // lib/scrape/extractors/amazon.ts — each swatch
                        // tile's own struck-through list price, scoped
                        // per-tile (see that file's comments on
                        // BUYBOX_PRICE_CONTAINERS for why cross-tile
                        // contamination is the bug being avoided here).
                        const optOriginalPrice =
                          opt.mrp && opt.mrp !== opt.price ? fmt(opt.mrp, opt.currencyCode) : null

                        const selected = opt.label === selectedLabel
                        const disabledTitle = opt.url ? undefined : `${opt.label} — no direct link found, selection is visual only`
                        const onPick = () => pickOption(dim.dimension, opt.label, opt.url)
                        return hasImages ? (
                          <DimensionSwatch
                            key={`${opt.label}-${i}`}
                            label={opt.label}
                            imageUrl={opt.image}
                            price={optPrice}
                            originalPrice={optOriginalPrice}
                            selected={selected}
                            onClick={onPick}
                            disabledTitle={disabledTitle}
                          />
                        ) : (
                          <DimensionChip
                            key={opt.label}
                            label={opt.label}
                            price={optPrice}
                            originalPrice={optOriginalPrice}
                            selected={selected}
                            onClick={onPick}
                            disabledTitle={disabledTitle}
                          />
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <p className="mt-5 text-sm font-semibold">
            {result.unavailable ? (
              <span className="text-ink/45">Currently unavailable</span>
            ) : inStock ? (
              <span className="text-teal-deep">In stock</span>
            ) : (
              <span className="text-ink/45">{result.availability}</span>
            )}
          </p>

          {result.url && (
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-ink/45 transition-colors hover:text-ink"
            >
              Open original listing <ExternalLink size={12} />
            </a>
          )}

          {/* Qty/wishlist/cart/request — inline row, inside the right
              column, directly under the link above. */}
          <AmazonCommerceActions
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
      <ProductInfoTabs result={result} />
    </div>
  )
}