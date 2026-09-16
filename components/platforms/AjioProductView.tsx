'use client'

import { ExternalLink, Star, PackageX, Store, Minus, Plus, Heart, ShoppingCart, Check } from 'lucide-react'
import { formatPrice } from '@/lib/currency'
import type { ScrapeResult } from '@/lib/scrape/parsers'
import RequestActionButton from '@/components/stores/RequestActionButton'

function fmtPrice(amount: string | null | undefined, currency: string | null | undefined) {
  const n = amount != null ? Number(amount) : NaN
  if (Number.isNaN(n)) return null
  try {
    return formatPrice(n, currency ?? 'LKR')
  } catch {
    return `${currency ?? ''} ${n}`.trim()
  }
}

function discountPercent(price: string | null | undefined, mrp: string | null | undefined): number | null {
  const p = price != null ? Number(price) : NaN
  const m = mrp != null ? Number(mrp) : NaN
  if (Number.isNaN(p) || Number.isNaN(m) || m <= p || m <= 0) return null
  return Math.round(((m - p) / m) * 100)
}

function RatingBadge({ rating, count }: { rating: string | null | undefined; count?: string | null }) {
  const value = rating ? parseFloat(rating) : NaN
  if (Number.isNaN(value)) return null
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-teal-deep px-2 py-1 text-xs font-bold text-white">
      {value.toFixed(1)}
      <Star size={11} className="fill-white text-white" strokeWidth={0} />
      {count && <span className="ml-1 font-normal text-white/80">| {count}</span>}
    </span>
  )
}

function ImageRail({ images, alt }: { images: string[]; alt: string }) {
  if (!images.length) {
    return (
      <div className="grid aspect-[3/4] place-items-center rounded-lg border border-dashed border-ink/15 bg-card text-xs font-medium text-ink/35">
        No images found
      </div>
    )
  }
  const [main, ...rest] = images
  return (
    <div className="flex gap-2">
      {rest.length > 0 && (
        <div className="flex flex-col gap-2">
          {rest.slice(0, 5).map((src) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt="" className="h-14 w-11 flex-none border border-ink/10 object-cover" />
          ))}
        </div>
      )}
      <div className="aspect-[3/4] flex-1 overflow-hidden border border-ink/10 bg-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={main} alt={alt} className="h-full w-full object-cover" />
      </div>
    </div>
  )
}

// Ajio size tiles are informational only — the extractor never gives them
// a per-size URL (see extractors/ajio.ts), so there's nothing to re-fetch
// on click, unlike Amazon/Flipkart/Meesho/Myntra's picker.
function SizeRow({ dimension }: { dimension: NonNullable<ScrapeResult['variants']>[number] }) {
  return (
    <div className="mt-4">
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink/45">{dimension.dimension}</p>
      <div className="flex flex-wrap gap-2">
        {dimension.options.map((opt) => (
          <span
            key={opt.label}
            title={opt.outOfStock ? 'Out of stock' : undefined}
            className={`grid h-9 w-9 place-items-center rounded-full border text-xs font-bold ${
              opt.selected
                ? 'border-ink bg-ink text-white'
                : opt.outOfStock
                  ? 'border-ink/10 text-ink/25 line-through'
                  : 'border-ink/25 text-ink/70'
            }`}
          >
            {opt.label}
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * Ajio-styled qty/wishlist/cart/request block — same functional shape
 * as every other platform view's commerce actions (AmazonCommerceActions,
 * MyntraCommerceActions, etc.): qty stepper, wishlist heart, Add to
 * Cart, Get Quote, inline in one wrapping row. Replaces the old
 * permanently-disabled "Add to Bag" button labeled "QA tool — not a
 * real checkout" — a leftover from the demo scraper-QA client this
 * file was originally copied from, which meant no Ajio listing, in
 * stock or not, could actually be added to cart or requested.
 */
function AjioCommerceActions({
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
    <div className="mt-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-2">
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

          <RequestActionButton
            onClick={onAddToCart}
            disabled={!canAct}
            loading={loading}
            unavailable={result.unavailable}
            unavailableLabel="NOT AVAILABLE"
            icon={justAdded ? <Check size={16} className="text-teal-deep" /> : undefined}
            color="#2b2b2b"
            disabledColor="#c7c7c7"
            className="flex-1 whitespace-nowrap rounded-xl px-5 py-3 text-sm font-bold hover:brightness-95"
          >
            {justAdded ? 'ADDED' : 'ADD TO BAG'}
          </RequestActionButton>
        </div>

        <RequestActionButton
          onClick={onRequestReview}
          disabled={!canAct}
          loading={loading}
          unavailable={result.unavailable}
          unavailableLabel="NOT AVAILABLE"
          icon={<ShoppingCart size={16} />}
          color="#c9252b"
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

export default function AjioProductView({
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
  onSelectVariant: (url: string) => void
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
  const discount = discountPercent(result.price, result.mrp)
  const priceLabel = fmtPrice(result.price, result.currencyCode)
  const mrpLabel = fmtPrice(result.mrp, result.currencyCode)

  return (
    <div>
      {result.unavailable && (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3">
          <PackageX size={16} className="mt-0.5 flex-none text-gold-deep" strokeWidth={1.8} />
          <div>
            <p className="text-xs font-bold text-ink/80">Listing appears unavailable</p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink/60">
              No &quot;Add to Bag&quot; button was found and sold-out copy was detected on the page.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-8 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <ImageRail images={result.images ?? []} alt={result.title ?? 'Product image'} />

        <div>
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-ink/40">
            <Store size={12} strokeWidth={2} /> Ajio
          </div>

          <h2 className="mt-2 text-base font-semibold leading-snug text-ink sm:text-lg">
            {result.title ?? <span className="italic text-ink/35">No title found</span>}
          </h2>

          {result.rating && (
            <div className="mt-2">
              <RatingBadge rating={result.rating} count={result.review_count} />
            </div>
          )}

          <div className="mt-4 flex items-baseline gap-2">
            <p className="text-xl font-extrabold text-ink">
              {priceLabel ?? <span className="text-base font-semibold text-ink/35">No price found</span>}
            </p>
            {mrpLabel && mrpLabel !== priceLabel && (
              <p className="text-sm font-medium text-ink/40 line-through">{mrpLabel}</p>
            )}
            {discount != null && <p className="text-sm font-bold text-orange-600">({discount}% OFF)</p>}
          </div>
          <p className="mt-0.5 text-[10px] font-medium text-ink/35">Inclusive of all taxes</p>

          {result.options && Object.keys(result.options).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {Object.entries(result.options).map(([label, value]) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1 rounded-full bg-card px-2.5 py-1 text-[11px] font-semibold text-ink/60 ring-1 ring-inset ring-ink/10"
                >
                  <span className="text-ink/40">{label}:</span> {value}
                </span>
              ))}
            </div>
          )}

          {result.variants?.map((dim) => (
            <SizeRow key={dim.dimension} dimension={dim} />
          ))}

          {result.availability && (
            <p className="mt-4 inline-block rounded-md bg-card px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink/55 ring-1 ring-inset ring-ink/10">
              {result.availability}
            </p>
          )}

          <AjioCommerceActions
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

          {result.seller && <p className="mt-4 text-[11px] font-medium text-ink/45">Sold by {result.seller}</p>}

        </div>
      </div>
    </div>
  )
}