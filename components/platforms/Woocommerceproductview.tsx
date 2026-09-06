// app/demo/scraper-qa/platforms/WooCommerceProductView.tsx
'use client'

import { useEffect, useState } from 'react'
import { BadgeCheck, ExternalLink, Star, Minus, Plus, Heart, ShoppingBag, ShoppingCart, Check } from 'lucide-react'
import { formatPrice } from '@/lib/currency'
import type { ScrapeResult } from '@/lib/scrape/parsers'
import type { PlatformViewProps } from '@/lib/scrape/platform-view-props'
import ProductGallery from '@/components/stores/ProductGallery'
import RequestActionButton from '../stores/RequestActionButton'

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
 * ProductInfoTabs — inlined, using the app's own design tokens (teal
 * active indicator), same Description / Details / Shipping & Returns
 * structure and bottom-most full-width slot as AmazonProductView.
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

function ProductInfoTabs({ result }: { result: ScrapeResult }) {
  const [activeTab, setActiveTab] = useState<InfoTab>('Description')

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
          <dl className="flex flex-col gap-1.5 text-xs">
            {result.brand && <DetailRow label="Brand" value={result.brand} />}
            {result.mpn && <DetailRow label="Model" value={result.mpn} />}
            {result.categoryPath && <DetailRow label="Category" value={result.categoryPath} />}
            {result.itemSpecifics?.map((spec) => (
              <DetailRow key={spec.name} label={spec.name} value={spec.value} />
            ))}
            {!result.brand && !result.mpn && !result.itemSpecifics?.length && (
              <p className="text-ink/45">We don&apos;t have any additional details for this listing.</p>
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
    <div className="mx-auto max-w-6xl px-6 lg:px-10">
      <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-teal/10 px-2.5 py-1 text-[11px] font-bold text-teal-deep ring-1 ring-inset ring-teal/20">
        <BadgeCheck size={13} strokeWidth={2} />
        Verified via WooCommerce&apos;s Store API
      </div>

      <div className="grid gap-8 sm:grid-cols-2">
        {/* Image gallery — shared component, app default theme */}
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

        {/* Buy box — same element order as AmazonProductView: title ->
            seller -> rating -> price/discount -> stock -> variant rows
            -> link -> commerce actions. */}
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
            {result.title ?? <span className="italic text-ink/40">No title found</span>}
          </h1>

          {result.seller && <p className="mt-1.5 text-xs font-semibold text-ink/45">by {result.seller}</p>}

          {result.rating && (
            <div className="mt-2">
              <Stars rating={result.rating} count={result.review_count} />
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-baseline gap-2">
            {pctOff !== null && <span className="text-sm font-bold text-indigo-deep">-{pctOff}%</span>}
            {price ? (
              <p className="text-3xl font-bold text-teal-deep">{price}</p>
            ) : (
              <p className="text-base font-semibold text-ink/40">No price found</p>
            )}
            {mrp && <p className="text-base font-semibold text-ink/40 line-through">{mrp}</p>}
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