// app/demo/scraper-qa/platforms/JioMartProductView.tsx
'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, Star, Minus, Plus, Heart, ShoppingBag, ShoppingCart, Check } from 'lucide-react'
import { formatPrice } from '@/lib/currency'
import type { ScrapeResult } from '@/lib/scrape/parsers'
import type { PlatformViewProps } from '@/lib/scrape/platform-view-props'
import ProductGallery from '@/components/stores/ProductGallery'
import RequestActionButton from '../stores/RequestActionButton'

/**
 * Renders a scrape result using the SAME structural layout as
 * AmazonProductView — gallery (shared ProductGallery component, same
 * as MyntraProductView/EbayProductView) + buy box side by side
 * (max-w-6xl), buy box ordered as brand/title -> rating ->
 * price/discount -> option rows -> stock -> original listing link ->
 * JioMartCommerceActions, then a bottom-most full-width
 * ProductInfoTabs section — restyled with JioMart's own blue
 * (#0d47a1) accent instead of Amazon's teal-deep tokens.
 *
 * ******************************************************************
 * STATUS: this is a best-effort first pass, NOT verified against a
 * real captured JioMart page — unlike MyntraProductView, which was
 * built and corrected against an actual captured pdpData payload and
 * screenshot. Colors, spacing, and copy below are a reasonable visual
 * approximation, not a pixel-matched clone. The underlying data model
 * (JioMartVariantDimension/-Option) comes from
 * lib/scrape/extractors/jiomart.ts, which is itself an unconfirmed
 * scaffold — see that file's header comment. Once real selectors are
 * confirmed there, this view should keep working unmodified, since it
 * only reads the already-normalized ScrapeResult shape.
 * ******************************************************************
 *
 * Like AmazonProductView, this keeps its own local "currently
 * highlighted" selection state per dimension (`selectedByDimension`)
 * rather than relying purely on `opt.selected` from the scrape result,
 * so the tile the user just clicked stays visually "sticky" until a
 * fresh re-scrape result comes back.
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

function JioMartRatingBadge({ rating, count }: { rating: string | null | undefined; count?: string | null }) {
  const value = rating ? parseFloat(rating) : NaN
  if (Number.isNaN(value)) return null
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center gap-0.5 rounded bg-[#0d47a1] px-1.5 py-0.5 text-[11px] font-bold text-white">
        {value.toFixed(1)}
        <Star size={10} strokeWidth={0} fill="currentColor" />
      </span>
      {count && <span className="text-xs font-medium text-[#5c6b73]">{count} Ratings</span>}
    </span>
  )
}

type VariantDimension = NonNullable<ScrapeResult['variants']>[number]

/** Plain pill row for a variant dimension (pack size / weight / quantity
 * etc — see jiomart.ts's doc comment on why this is generic rather than
 * assuming Size/Color the way the fashion-site views do). Out-of-stock
 * tiles are shown desaturated with a strike, same "visible but
 * disabled" convention used across every other platform view here. */
function OptionRow({
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
      <p className="text-[10px] font-bold uppercase tracking-wide text-[#5c6b73]">
        {dim.dimension}
        {selectedLabel && <span className="normal-case text-[#26292b]"> — {selectedLabel}</span>}
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
              className={`relative flex min-h-11 min-w-11 flex-col items-center justify-center rounded-md border px-3 py-1.5 text-[13px] font-semibold ${
                opt.outOfStock
                  ? 'cursor-not-allowed border-[#e5e8ea] text-[#c2c8cc] line-through'
                  : isSelected
                    ? 'border-[#0d47a1] bg-[#eaf1fb] text-[#0d47a1]'
                    : 'border-[#d6dbde] text-[#26292b] hover:border-[#0d47a1]'
              }`}
            >
              {opt.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={opt.image} alt="" className="mb-1 h-8 w-8 rounded object-contain" />
              )}
              {opt.label}
              {tilePrice && <span className="text-[10px] font-medium leading-tight">{tilePrice}</span>}
              {!opt.outOfStock && lowStock && (
                <span className="mt-0.5 text-[9px] font-bold uppercase leading-tight text-[#e07a1f]">
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

/**
 * JioMart-styled qty/wishlist/cart/request block — same functional
 * shape as AmazonCommerceActions (qty stepper, wishlist heart, Add to
 * Cart, Get Quote, all inline in one wrapping row), replacing the old
 * single disabled "Add to Cart" button with JioMart's blue accent.
 */
function JioMartCommerceActions({
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
        <div className="flex flex-none items-center gap-3.5 rounded-xl border border-[#d6dbde] px-2.5 py-1.5">
          <button
            type="button"
            aria-label="Decrease quantity"
            onClick={() => onQtyChange(Math.max(1, qty - 1))}
            className="grid h-7 w-7 place-items-center rounded-md border border-[#d6dbde] text-[#5c6b73] transition-colors hover:border-[#0d47a1]/40 hover:bg-[#0d47a1]/5 hover:text-[#0d47a1] active:scale-90"
          >
            <Minus size={15} />
          </button>
          <span className="min-w-[20px] text-center font-bold tabular-nums text-[#26292b]">{qty}</span>
          <button
            type="button"
            aria-label="Increase quantity"
            onClick={() => onQtyChange(qty + 1)}
            className="grid h-7 w-7 place-items-center rounded-md border border-[#d6dbde] text-[#5c6b73] transition-colors hover:border-[#0d47a1]/40 hover:bg-[#0d47a1]/5 hover:text-[#0d47a1] active:scale-90"
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
          className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl border border-[#d6dbde] text-[#5c6b73] transition-all duration-200 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Heart size={17} fill={inWishlist ? 'currentColor' : 'none'} color={inWishlist ? '#e11d48' : 'currentColor'} />
        </button>

        <button
          type="button"
          onClick={onAddToCart}
          disabled={loading || result.unavailable || !canAct}
          className="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-[#d6dbde] px-4 py-3 text-sm font-bold uppercase text-[#26292b] transition-all duration-200 hover:border-[#0d47a1]/40 hover:bg-[#0d47a1]/5 hover:text-[#0d47a1] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {justAdded ? <Check size={16} className="text-[#0d47a1]" /> : <ShoppingBag size={16} />}
          {justAdded ? 'Added' : 'Add to Cart'}
        </button>

        <RequestActionButton
          onClick={onRequestReview}
          disabled={!canAct}
          loading={loading}
          unavailable={result.unavailable}
          unavailableLabel="NOT AVAILABLE"
          icon={<ShoppingCart size={16} />}
          color="#fb641b"
          disabledColor="#c7c7c7"
          className="flex-1 whitespace-nowrap rounded-xl px-5 py-3 text-sm font-bold hover:brightness-95"
        >
          GET QUOTE
        </RequestActionButton>
      </div>

      <p className="text-xs text-[#94a0a6]">You will not be charged now. This is just a request.</p>
    </div>
  )
}

/* ---------------------------------------------------------------------
 * ProductInfoTabs — inlined, JioMart-flavored (blue active indicator),
 * same Description / Details / Shipping & Returns structure and
 * bottom-most full-width slot as AmazonProductView.
 * ------------------------------------------------------------------- */

const INFO_TABS = ['Description', 'Details', 'Shipping & Returns'] as const
type InfoTab = (typeof INFO_TABS)[number]

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="font-semibold text-[#26292b]/80">{label}</dt>
      <dd className="text-right text-[#5c6b73]">{value}</dd>
    </div>
  )
}

function ProductInfoTabs({ result }: { result: ScrapeResult }) {
  const [activeTab, setActiveTab] = useState<InfoTab>('Description')

  return (
    <div className="mt-8 border-t border-[#e5e8ea] pt-6">
      <div className="flex gap-5 border-b border-[#e5e8ea]">
        {INFO_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`-mb-px border-b-2 pb-2.5 text-sm font-semibold transition-colors ${
              activeTab === tab
                ? 'border-[#0d47a1] text-[#26292b]'
                : 'border-transparent text-[#94a0a6] hover:text-[#26292b]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
      <div
        key={activeTab}
        className="min-h-[96px] pb-2 pt-4 text-sm leading-relaxed text-[#5c6b73] motion-safe:[animation:tabFadeIn_0.18s_ease-out_both]"
      >
        {activeTab === 'Description' &&
          ((result as ScrapeResult & { description?: string }).description ? (
            <p>{(result as ScrapeResult & { description?: string }).description}</p>
          ) : (
            <p className="text-[#94a0a6]">
              We don&apos;t have a description for this listing. Here&apos;s the title instead:{' '}
              {result.title ?? 'no title available.'}
            </p>
          ))}
        {activeTab === 'Details' && (
          <dl className="flex flex-col gap-1.5 text-xs">
            {result.brand && <DetailRow label="Brand" value={result.brand} />}
            {result.mpn && <DetailRow label="Model" value={result.mpn} />}
            {result.categoryPath && <DetailRow label="Category" value={result.categoryPath} />}
            {result.itemSpecifics?.map((spec) => (
              <DetailRow key={spec.name} label={spec.name} value={spec.value} />
            ))}
            {!result.brand && !result.mpn && !result.itemSpecifics?.length && (
              <p className="text-[#94a0a6]">We don&apos;t have any additional details for this listing.</p>
            )}
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
                <p className="mt-1 text-[#94a0a6]">
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

export default function JioMartProductView({
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

  // Per-dimension local selection state, independent of every other
  // dimension — same pattern as AmazonProductView. Re-synced from the
  // scrape result's own `selected` flags whenever a genuinely new
  // result lands (new url), sticky in between clicks.
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

  const dims = result.variants ?? []

  const inStock = result.unavailable
    ? false
    : result.availability
      ? !/out of stock|unavailable/i.test(result.availability)
      : true

  return (
    <div className="mx-auto max-w-6xl px-6 lg:px-10 font-sans">
      <div className="grid gap-8 sm:grid-cols-2">
        {/* Image gallery — shared component, JioMart theme */}
        <ProductGallery
          images={images}
          title={result.title}
          resetKey={result.url}
          theme={{
            frameBorder: 'border-[#e5e8ea]',
            activeThumb: 'border-[#0d47a1] ring-1 ring-[#0d47a1]',
            restingThumb: 'border-[#e5e8ea]',
            placeholderText: 'text-[#94a0a6]',
          }}
        />

        {/* Buy box — same element order as AmazonProductView:
            platform/brand -> title -> rating -> price/discount ->
            option rows -> stock -> link -> commerce actions. */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-[#5c6b73]">
            <span>JioMart</span>
            {result.brand && (
              <>
                <span className="text-[#c2c8cc]">·</span>
                <span className="text-[#0d47a1]">{result.brand}</span>
              </>
            )}
          </div>

          <h1 className="mt-2 text-2xl font-semibold leading-snug tracking-tight text-[#26292b] sm:text-3xl">
            {result.title || <span className="italic text-[#94a0a6]">No title found</span>}
          </h1>

          {result.rating && (
            <div className="mt-2">
              <JioMartRatingBadge rating={result.rating} count={result.review_count} />
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-baseline gap-2">
            {price ? (
              <p className="text-3xl font-bold text-[#26292b]">{price}</p>
            ) : (
              <p className="text-base font-semibold text-[#94a0a6]">No price found</p>
            )}
            {mrp && <p className="text-base font-medium text-[#94a0a6] line-through">{mrp}</p>}
            {pctOff !== null && <span className="text-sm font-bold text-[#1a9e5c]">({pctOff}% OFF)</span>}
          </div>
          <p className="mt-0.5 text-[11px] text-[#94a0a6]">inclusive of all taxes</p>

          {dims.length > 0 && (
            <div className="mt-4 flex flex-col gap-4">
              {dims.map((dim) => (
                <OptionRow
                  key={dim.dimension}
                  dim={dim}
                  selectedLabel={selectedByDimension[dim.dimension] ?? null}
                  basePrice={result.price}
                  onPick={(label, url) => pickOption(dim.dimension, label, url)}
                />
              ))}
            </div>
          )}

          <p className="mt-5 text-sm font-semibold">
            {result.unavailable ? (
              <span className="text-red-500">Out of Stock</span>
            ) : inStock ? (
              <span className="text-[#1a9e5c]">In Stock</span>
            ) : (
              <span className="text-[#5c6b73]">{result.availability}</span>
            )}
          </p>

          {result.url && (
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#0d47a1] hover:underline"
            >
              Open original listing <ExternalLink size={12} />
            </a>
          )}

          <JioMartCommerceActions
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