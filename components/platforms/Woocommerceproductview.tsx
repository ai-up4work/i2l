// app/demo/scraper-qa/platforms/WooCommerceProductView.tsx
'use client'

import { useEffect, useState } from 'react'
import { BadgeCheck, ExternalLink, Star, Minus, Plus, Heart, ShoppingBag, ShoppingCart, Check } from 'lucide-react'
import { formatPrice } from '@/lib/currency'
import type { ScrapeResult } from '@/lib/scrape/parsers'
import type { PlatformViewProps } from '@/lib/scrape/platform-view-props'
import ProductGallery from '@/components/stores/ProductGallery'
import RequestActionButton from '../stores/RequestActionButton'
import Image from 'next/image'
import { SITE_LOGOS } from '@/lib/platform-logos'
import { PDP_GRID, PDP_REST, PDP_TITLE } from './pdp-styles'
import PdpInfoTabs from './PdpInfoTabs'

/**
 * Renders a WooCommerce scrape result (source: 'woocommerce_api') using
 * the SAME structural layout as AmazonProductView — gallery (shared
 * ProductGallery component, same as MyntraProductView/EbayProductView)
 * + buy box side by side (max-w-6xl), buy box ordered as badge/title ->
 * seller -> rating -> price/discount -> stock -> variant rows ->
 * original listing link -> WooCommerceCommerceActions, then a
 * bottom-most full-width ProductInfoTabs section — using the app's own
 * design tokens (teal/ink/indigo-deep/gold-deep) rather than imitating
 * a fake storefront skin: WooCommerce stores run on the merchant's own
 * WordPress theme, so there's no single canonical look to match.
 * What's consistent and worth surfacing is that this data came straight
 * from the store's public Store API (/wp-json/wc/store/v1/products),
 * not a DOM/JSON-LD scrape guess — hence the badge below.
 *
 * VARIANT TILES ARE NEVER CLICKABLE, BY DESIGN — same as Shopify's view:
 * buildStoreVariantDimensions() in parsers.ts always sets `url: null`,
 * since the one Store API call already returned every variant's
 * price/image/availability. `onSelectVariant` is accepted for interface
 * parity with the other platform views but will never fire; tiles only
 * update local display state.
 *
 * VARIANT TILE STYLING: same swatch-card treatment as
 * ShopifyProductView — square image (or a deterministically-tinted
 * gradient placeholder keyed off the option's label when no image was
 * returned), a checkmark badge + ring on the selected tile, and a soft
 * hover lift, matching Amazon/Flipkart's swatch weight instead of a
 * flat chip row.
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

function Stars({ rating, count }: { rating: string | null | undefined; count?: string | null }) {
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

// Small deterministic palette used to give text-only swatches (no
// product image on the option) a distinct-looking tile instead of every
// one collapsing into the same flat gray placeholder — purely cosmetic,
// picked by hashing the option label so the same value always renders
// the same tint.
const SWATCH_TINTS = [
  'linear-gradient(135deg, #d8cdbf 0%, #b8a892 100%)',
  'linear-gradient(135deg, #cfd9d4 0%, #a7bdb3 100%)',
  'linear-gradient(135deg, #ddd0e0 0%, #b9a3c0 100%)',
  'linear-gradient(135deg, #d9d2c3 0%, #b3a687 100%)',
  'linear-gradient(135deg, #cdd6e0 0%, #a3b6cc 100%)',
]
function tintFor(label: string) {
  let hash = 0
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0
  return SWATCH_TINTS[hash % SWATCH_TINTS.length]
}

/** One variant dimension (Size, Color, ...) as a row of informational
 * swatch cards — never clickable, since every tile's url is always
 * null (see doc comment above). Selecting one only updates local
 * display state. Each card pairs a square image (or a tinted
 * placeholder when no image was returned) with the label and price
 * stacked underneath. */
function VariantRow({
  dim,
  selectedLabel,
  onPick,
}: {
  dim: NonNullable<ScrapeResult['variants']>[number]
  selectedLabel: string | null
  onPick: (label: string) => void
}) {
  // Options without pictures (sizes, mostly) read better as compact chips
  // than as big blank tiles — same chip style as every other store view.
  if (!dim.options.some((o) => !!o.image)) {
    return (
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wide text-ink/45">
          {dim.dimension}
          {selectedLabel && <span className="ml-1.5 text-[11px] font-semibold normal-case tracking-normal text-ink/70">{selectedLabel}</span>}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {dim.options.map((opt) => {
            const isSelected = opt.label === selectedLabel
            return (
              <button
                key={opt.label}
                type="button"
                onClick={() => onPick(opt.label)}
                disabled={opt.outOfStock}
                title={opt.outOfStock ? `${opt.label} — out of stock` : opt.label}
                aria-pressed={isSelected}
                className={`min-w-[2.75rem] rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                  isSelected
                    ? 'border-teal-deep bg-teal-deep text-white'
                    : opt.outOfStock
                      ? 'cursor-not-allowed border-ink/8 text-ink/25 line-through'
                      : 'border-ink/15 text-ink/70 hover:border-ink/35'
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

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-ink/45">
        {dim.dimension}
        {selectedLabel && <span className="normal-case tracking-normal text-ink/70"> — {selectedLabel}</span>}
      </p>
      <div className="mt-2 flex flex-wrap gap-3">
        {dim.options.map((opt) => {
          const isSelected = opt.label === selectedLabel
          const price = fmt(opt.price, opt.currencyCode)
          return (
            <button
              key={opt.label}
              type="button"
              onClick={() => onPick(opt.label)}
              disabled={opt.outOfStock}
              title={opt.outOfStock ? 'Out of stock' : opt.label}
              className={`group flex w-[86px] flex-col items-center gap-1.5 rounded-xl border p-2 text-center transition-all ${
                isSelected
                  ? 'border-teal-deep bg-teal/5 shadow-[0_1px_2px_rgba(15,15,15,0.04),0_4px_12px_-6px_rgba(20,120,110,0.35)]'
                  : opt.outOfStock
                    ? 'cursor-not-allowed border-ink/8 bg-card/40 opacity-45 grayscale'
                    : 'border-ink/10 bg-white hover:-translate-y-0.5 hover:border-teal/40 hover:shadow-[0_4px_14px_-8px_rgba(15,15,15,0.18)]'
              }`}
            >
              <span
                className={`relative grid h-14 w-14 place-items-center overflow-hidden rounded-lg bg-cover bg-center ring-1 ${
                  isSelected ? 'ring-2 ring-teal-deep ring-offset-1 ring-offset-white' : 'ring-ink/10'
                }`}
                style={
                  opt.image
                    ? { backgroundImage: `url(${opt.image})` }
                    : { backgroundImage: tintFor(opt.label) }
                }
              >
                {!opt.image && (
                  <span className="text-[10px] font-bold uppercase tracking-tight text-white/80 drop-shadow-sm">
                    {opt.label.trim().slice(0, 2)}
                  </span>
                )}
                {isSelected && (
                  <span className="absolute bottom-0.5 right-0.5 grid h-4 w-4 place-items-center rounded-full bg-teal-deep text-white shadow-sm">
                    <svg width="9" height="9" viewBox="0 0 20 20" fill="none">
                      <path d="M4 10.5L8 14.5L16 6" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                )}
              </span>
              <span className={`line-clamp-1 text-[11px] font-semibold ${isSelected ? 'text-teal-deep' : 'text-ink/75'}`}>
                {opt.label}
              </span>
              {opt.outOfStock ? (
                <span className="text-[9px] font-bold uppercase tracking-wide text-indigo-deep">Out of stock</span>
              ) : (
                price && <span className="text-[10px] font-bold text-ink/55">{price}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * WooCommerce-styled qty/wishlist/cart/request block — same functional
 * shape as ShopifyCommerceActions / AmazonCommerceActions (qty stepper,
 * wishlist heart, Add to Cart, Get Quote, all inline in one wrapping
 * row), using the app's own teal-deep tokens since there's no
 * WooCommerce-specific brand color to imitate here (see doc comment
 * above).
 */
function WooCommerceCommerceActions({
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
        {/* Atomic group: qty stepper + wishlist + Add to Cart. This
            never splits across lines — flex-nowrap keeps it as one
            unit for the outer row's wrap decision. flex-1 here means
            it absorbs all the leftover row width once GET QUOTE is
            pinned to its natural size on desktop (see below). */}
        <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-2">
          <div className="flex flex-none items-center gap-2 rounded-xl border border-ink/15 px-1.5 py-1.5 sm:gap-3.5 sm:px-2.5">
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

          <RequestActionButton
            onClick={onAddToCart}
            disabled={!canAct}
            loading={loading}
            unavailable={result.unavailable}
            unavailableLabel="NOT AVAILABLE"
            icon={justAdded ? <Check size={16} className="text-teal-deep" /> : <ShoppingBag size={16} />}
            color="#000000"
            disabledColor="#c7c7c7"
            className="min-w-0 flex-1 whitespace-nowrap rounded-xl px-3 py-3 text-sm font-bold sm:px-5 hover:brightness-95"
          >
            {justAdded ? 'ADDED' : 'ADD TO CART'}
          </RequestActionButton>
        </div>

        {/* Get Quote:
            - Mobile (below sm): grow + basis-full → the only thing
              allowed to wrap, and when it does it takes the entire
              next line by itself.
            - Desktop (sm and up): sm:grow-0 + sm:basis-auto → fixed to
              its own natural content width, no longer competing with
              the atomic group above for the row's free space. */}
        <RequestActionButton
          onClick={onRequestReview}
          disabled={!canAct}
          loading={loading}
          unavailable={result.unavailable}
          unavailableLabel="NOT AVAILABLE"
          icon={<ShoppingCart size={16} />}
          color="#9a5b92"
          disabledColor="#c7c7c7"
          className="grow basis-full whitespace-nowrap rounded-xl px-5 py-3 text-sm font-bold hover:brightness-95 sm:grow-0 sm:basis-auto"
        >
          GET QUOTE
        </RequestActionButton>
      </div>

      <p className="text-xs text-ink/40">You will not be charged now. This is just a request.</p>
    </div>
  )
}

/* ---------------------------------------------------------------------
 * ProductInfoTabs — inlined, using the app's own design tokens (teal
 * active indicator), same Description / Details / Shipping & Returns
 * structure and bottom-most full-width slot as AmazonProductView.
 * ------------------------------------------------------------------- */


function ProductInfoTabs({ result }: { result: ScrapeResult }) {
  return <PdpInfoTabs result={result} accent="#0f766e" />
}

/* ---------------------------------------------------------------------
 * Main component
 * ------------------------------------------------------------------- */

export default function WooCommerceProductView({
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

  const price = fmt(result.price, result.currencyCode)
  const mrp = result.mrp && result.mrp !== result.price ? fmt(result.mrp, result.currencyCode) : null
  const pctOff =
    result.mrp && result.price && Number(result.mrp) > Number(result.price)
      ? Math.round((1 - Number(result.price) / Number(result.mrp)) * 100)
      : null

  const inStock = !result.unavailable

  // See ShopifyProductView's identical note: onSelectVariant is kept only
  // for interface parity — WooCommerce variant tiles are never clickable.
  void onSelectVariant

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl sm:px-6 lg:px-10">
     

      <div className={PDP_GRID}>
        {/* Title block — same place and type as every other store view. */}
        <div className="min-w-0 [grid-area:info]">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-ink/50">
            <a href={result.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center">
              <Image src={SITE_LOGOS.woocommerce!} alt="WooCommerce" width={100} height={20} />
            </a>
            {result.rating && (
              <>
                <span className="text-ink/20">·</span>
                <Stars rating={result.rating} count={result.review_count} />
              </>
            )}
          </div>
          <h1 className={PDP_TITLE}>{result.title ?? <span className="italic text-ink/40">No title found</span>}</h1>
          {result.seller && <p className="mt-1.5 text-xs font-semibold text-ink/45">by {result.seller}</p>}
        </div>

        <div className="min-w-0 [grid-area:gallery]">
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
        </div>

        {/* Price, options, stock, buttons. */}
        <div className={PDP_REST}>
          <div className="flex flex-wrap items-baseline gap-2">
            {price ? (
              <p className="text-3xl font-bold text-teal-deep">{price}</p>
            ) : (
              <p className="text-base font-semibold text-ink/40">No price found</p>
            )}
            {mrp && <p className="text-base font-semibold text-ink/40 line-through">{mrp}</p>}
            {pctOff !== null && <span className="text-sm font-bold text-indigo-deep">{pctOff}% off</span>}
          </div>

          {!!result.variants?.length && (
            <div className="mt-4 flex flex-col gap-4">
              {result.variants.map((dim) => (
                <VariantRow
                  key={dim.dimension}
                  dim={dim}
                  selectedLabel={selectedByDimension[dim.dimension] ?? null}
                  onPick={(label) => setSelectedByDimension((prev) => ({ ...prev, [dim.dimension]: label }))}
                />
              ))}
            </div>
          )}

          <p className="mt-5 text-sm font-semibold">
            {inStock ? (
              <span className="text-teal-deep">In stock</span>
            ) : (
              <span className="text-ink/45">Out of stock</span>
            )}
          </p>


          <WooCommerceCommerceActions
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