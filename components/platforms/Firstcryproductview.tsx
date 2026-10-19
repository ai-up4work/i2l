// components/platforms/Firstcryproductview.tsx
'use client'

import { useEffect, useState } from 'react'
import { Star, ExternalLink, Minus, Plus, Heart, ShoppingBag, ShoppingCart, Check } from 'lucide-react'
import { formatPrice } from '@/lib/currency'
import type { ScrapeResult } from '@/lib/scrape/parsers'
import type { PlatformViewProps } from '@/lib/scrape/platform-view-props'
import ProductGallery from '@/components/stores/ProductGallery'
import RequestActionButton from '@/components/stores/RequestActionButton'
import Image from 'next/image'
import { SITE_LOGOS } from '@/lib/platform-logos'
import { PDP_REST, PDP_TITLE } from './pdp-styles'
import PdpInfoTabs from './PdpInfoTabs'

/**
 * FirstCry look-alike view for the scrape QA tool, brought into full
 * structural conformance with AmazonProductView / FlipkartProductView
 * / MyntraProductView — same grid-area layout, same inline
 * price/mrp block (no separate PriceBlock component, no club-price
 * tier, no delivery/pincode UI), same stock-status line, and the same
 * *CommerceActions button order (qty stepper -> wishlist heart -> Add
 * to Cart -> Get Quote), with the wishlist heart living inside the
 * commerce actions row rather than floating over the gallery.
 *
 * Palette stays pink (rose/pink-500/600) per the original request,
 * applied the same way the other three apply their own brand accent
 * to the shared skeleton.
 *
 * FirstCry-specific extractor behavior preserved (see
 * lib/scrape/extractors/firstcry.ts for the source of truth):
 *   - A "Color" dimension's tiles carry no `url` — FirstCry swaps
 *     color via an in-page AJAX call, not navigation — so those tiles
 *     are always informational/non-clickable, regardless of
 *     `selected`/`outOfStock`.
 *   - A "Size" dimension's tiles ARE real per-size PDPs (`url`
 *     resolves to that size's own product id); clicking a
 *     non-selected, in-stock size re-scrapes that URL, same
 *     click-to-refetch pattern the generic VariantPicker uses for
 *     Amazon/Flipkart/etc. Rendered as pill buttons under "Size",
 *     with a "SIZE CHART" link matching the real site's layout.
 *   - `rating`/`review_count` are frequently both null — the
 *     extractor already normalizes FirstCry's "0"/"NaN" down to null,
 *     so this view omits the rating row entirely when absent.
 */

function fmt(amount: string | null | undefined, currency: string | null | undefined) {
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
 * Pill-style size selector, matching the real FirstCry "New Born /
 * 0-3M / 3-6M / ..." row. Selected = solid pink outline (the real
 * site uses orange here). Out of stock = greyed, not clickable.
 */
function SizePill({
  label,
  selected,
  outOfStock,
  onClick,
  disabledTitle,
}: {
  label: string
  selected: boolean
  outOfStock?: boolean
  onClick?: () => void
  disabledTitle?: string
}) {
  const clickable = !!onClick && !outOfStock
  return (
    <button
      type="button"
      disabled={!clickable}
      title={disabledTitle}
      aria-pressed={selected}
      onClick={clickable ? onClick : undefined}
      className={
        'rounded-lg border px-3.5 py-2 text-xs font-bold transition-colors ' +
        (selected
          ? 'border-pink-500 text-pink-600'
          : outOfStock
            ? 'cursor-not-allowed border-ink/10 text-ink/25 line-through'
            : clickable
              ? 'border-ink/15 text-ink/70 hover:border-pink-300 hover:text-pink-600 cursor-pointer'
              : 'cursor-not-allowed border-ink/10 text-ink/40')
      }
    >
      {label}
    </button>
  )
}

/**
 * Informational-only color swatch. Never clickable — see file header
 * on why (FirstCry swaps color via AJAX, this view has no way to
 * trigger that from a scrape result).
 */
function ColorSwatch({ label, imageUrl, selected }: { label: string; imageUrl?: string | null; selected: boolean }) {
  return (
    <span
      className="inline-flex flex-col items-center gap-1"
      title="FirstCry swaps colors in-page — open the original listing to change color"
    >
      <span
        className={
          'grid h-9 w-9 place-items-center overflow-hidden rounded-full border-2 bg-cover bg-center shadow-sm ' +
          (selected
            ? 'border-pink-500 ring-2 ring-pink-300 ring-offset-1 ring-offset-parchment'
            : 'border-white ring-1 ring-ink/15')
        }
        style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : { background: 'linear-gradient(135deg, #f6dbe4 0%, #ecc3d3 100%)' }}
      >
        {!imageUrl && <span className="text-[9px] font-bold uppercase tracking-tight text-ink/50">{label.trim().slice(0, 2)}</span>}
      </span>
      <span className={`text-[10px] font-medium ${selected ? 'text-pink-600' : 'text-ink/60'}`}>{label}</span>
    </span>
  )
}

/**
 * FirstCry-styled qty/wishlist/cart/request block — same shape and
 * slot as Amazon/Flipkart/Myntra's *CommerceActions: qty stepper ->
 * wishlist heart -> Add to Cart grouped as one flex-nowrap atomic
 * unit, Get Quote as a separate item that's the only thing allowed to
 * wrap on mobile.
 */
function FirstCryCommerceActions({
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
          <div className="flex flex-none items-center gap-2 rounded-xl border border-ink/15 px-1.5 py-1.5 sm:gap-3.5 sm:px-2.5">
            <button
              type="button"
              aria-label="Decrease quantity"
              onClick={() => onQtyChange(Math.max(1, qty - 1))}
              className="grid h-7 w-7 place-items-center rounded-md border border-ink/15 text-ink/60 transition-colors hover:border-pink-300 hover:bg-pink-50 hover:text-pink-600 active:scale-90"
            >
              <Minus size={15} />
            </button>
            <span className="min-w-[20px] text-center font-bold tabular-nums">{qty}</span>
            <button
              type="button"
              aria-label="Increase quantity"
              onClick={() => onQtyChange(qty + 1)}
              className="grid h-7 w-7 place-items-center rounded-md border border-ink/15 text-ink/60 transition-colors hover:border-pink-300 hover:bg-pink-50 hover:text-pink-600 active:scale-90"
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
            icon={justAdded ? <Check size={16} className="text-white" /> : <ShoppingBag size={16} />}
            color="#ec4899"
            disabledColor="#c7c7c7"
            className="min-w-0 flex-1 whitespace-nowrap rounded-xl px-3 py-3 text-sm font-bold sm:px-5 text-white hover:brightness-95"
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
            color="#f7941d"           
            disabledColor="#c7c7c7"
            className="grow basis-full whitespace-nowrap rounded-xl px-5 py-3 text-sm font-bold text-violet-900 hover:brightness-95 sm:grow-0 sm:basis-auto"
          >
            GET QUOTE
          </RequestActionButton>
      </div>

      <p className="text-xs text-ink/40">You will not be charged now. This is just a request.</p>
    </div>
  )
}

/* ---------------------------------------------------------------------
 * ProductInfoTabs — same Description / Details / Shipping & Returns
 * tab-switcher pattern as the other three views, recolored pink,
 * rendered as the bottom-most, full-width section of the whole view.
 * ------------------------------------------------------------------- */


function ProductInfoTabs({ result }: { result: ScrapeResult }) {
  return <PdpInfoTabs result={result} accent="#ec4899" />
}

/* ---------------------------------------------------------------------
 * Main component
 * ------------------------------------------------------------------- */

export default function FirstCryProductView({
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
      ? !/sold out|out of stock|unavailable/i.test(result.availability)
      : true

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl sm:px-6 lg:px-10">
      <div
        className="grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-6 [grid-template-areas:'info'_'gallery'_'rest'] sm:grid-cols-2 sm:grid-rows-[auto_1fr] sm:gap-y-5 sm:[grid-template-areas:'gallery_info'_'gallery_rest']"
      >
        {/* Top of buy box: logo + brand + rating, then title.
            Mobile: first (area "info"). Desktop: top-right column. */}
        <div className="min-w-0 [grid-area:info]">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-ink/50">
            <a href={result.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center">
              <Image src={SITE_LOGOS.firstcry!} alt="FirstCry" width={70} height={16} />
            </a>
            {result.brand && (
              <>
                <span className="text-ink/20">·</span>
                <span>{result.brand}</span>
              </>
            )}
            {result.rating && (
              <>
                <span className="text-ink/20">·</span>
                <RatingStars rating={result.rating} count={result.review_count} />
              </>
            )}
          </div>

          <h1 className={PDP_TITLE}>
            {result.title ?? <span className="italic text-ink/40">No title found</span>}
          </h1>
        </div>

        {/* Image gallery — shared component, FirstCry theme.
            Mobile: second (area "gallery"). Desktop: left column,
            spanning both rows since "gallery" repeats in both area rows. */}
        <div className="min-w-0 [grid-area:gallery]">
          <ProductGallery
            images={images}
            title={result.title}
            resetKey={result.url}
            theme={{
              frameBorder: 'border-ink/10',
              activeThumb: 'border-pink-500 ring-1 ring-pink-500',
              restingThumb: 'border-ink/10',
              placeholderText: 'text-ink/40',
            }}
          />
        </div>

        {/* Rest of buy box: price, variants, stock, cart/quote actions.
            Mobile: third (area "rest"). Desktop: bottom-right column. */}
        <div className={PDP_REST}>
          <div className="flex items-baseline gap-2">
            {price ? (
              <p className="text-3xl font-bold text-pink-600">{price}</p>
            ) : (
              <p className="text-base font-semibold text-ink/40">No price found</p>
            )}
            {mrp && <p className="text-base font-semibold text-ink/40 line-through">{mrp}</p>}
          </div>

          {!!result.variants?.length && (
            <div className="mt-5 flex flex-col gap-4">
              {result.variants.map((dim) => {
                const isColor = dim.dimension.toLowerCase() === 'color'
                const isSize = dim.dimension.toLowerCase() === 'size'
                const selectedLabel = selectedByDimension[dim.dimension] ?? null

                return (
                  <div key={dim.dimension}>
                    <div className="mb-1.5 flex items-center justify-between gap-4">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-ink/45">{dim.dimension}</p>
                      {/* {isSize && (
                        <button type="button" className="text-[11px] font-bold text-pink-600 hover:underline">
                          SIZE CHART
                        </button>
                      )} */}
                    </div>

                    <div className={isColor ? 'flex flex-wrap gap-3' : 'flex flex-wrap gap-1.5'}>
                      {dim.options.map((opt) => {
                        const selected = opt.label === selectedLabel

                        if (isColor) {
                          return <ColorSwatch key={opt.label} label={opt.label} imageUrl={opt.image} selected={selected} />
                        }

                        const clickable = !!opt.url && !selected && !opt.outOfStock
                        const disabledTitle = opt.outOfStock
                          ? 'Out of stock'
                          : opt.url
                            ? undefined
                            : `${opt.label} — no direct link found, selection is visual only`

                        return (
                          <SizePill
                            key={opt.label}
                            label={opt.label}
                            selected={selected}
                            outOfStock={opt.outOfStock}
                            disabledTitle={disabledTitle}
                            onClick={clickable ? () => pickOption(dim.dimension, opt.label, opt.url) : undefined}
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
              <span className="text-pink-600">In stock</span>
            ) : (
              <span className="text-ink/45">{result.availability}</span>
            )}
          </p>

          <FirstCryCommerceActions
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