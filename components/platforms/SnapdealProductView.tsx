'use client'

import { ExternalLink, Star, Minus, Plus, Heart, ShoppingCart, Check } from 'lucide-react'
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

function ImageGallery({ images, alt }: { images: string[]; alt: string }) {
  if (!images.length) {
    return (
      <div className="grid aspect-square place-items-center rounded-xl border border-dashed border-ink/15 bg-card text-xs font-medium text-ink/35">
        No images found
      </div>
    )
  }
  const [main, ...rest] = images
  return (
    <div className="flex gap-3">
      {rest.length > 0 && (
        <div className="flex flex-col gap-2">
          {rest.slice(0, 5).map((src) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={src}
              src={src}
              alt=""
              className="h-12 w-12 flex-none rounded-md border border-ink/10 bg-white object-contain"
            />
          ))}
        </div>
      )}
      <div className="aspect-square flex-1 overflow-hidden rounded-xl border border-ink/10 bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={main} alt={alt} className="h-full w-full object-contain" />
      </div>
    </div>
  )
}

function RatingBadge({ rating, count }: { rating: string | null | undefined; count?: string | null }) {
  const value = rating ? parseFloat(rating) : NaN
  if (Number.isNaN(value)) return null
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-bold text-white">
        {value.toFixed(1)}
        <Star size={10} className="fill-white" strokeWidth={0} />
      </span>
      {count && <span className="text-xs font-medium text-ink/45">{count} Ratings</span>}
    </span>
  )
}

/**
 * Snapdeal-styled qty/wishlist/cart/request block — same functional
 * shape as every other platform view's commerce actions
 * (AmazonCommerceActions, MyntraCommerceActions, etc.): qty stepper,
 * wishlist heart, Add to Cart, Get Quote, inline in one wrapping row.
 * This platform view previously had no commerce actions at all — not
 * even a disabled placeholder — so no Snapdeal listing could be added
 * to cart or requested; this brings it up to the same standard as
 * every other platform.
 */
function SnapdealCommerceActions({
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
    <div className="mt-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-2">
          <div className="flex flex-none items-center gap-3.5 rounded-xl border border-ink/15 px-2.5 py-1.5">
            <button
              type="button"
              aria-label="Decrease quantity"
              onClick={() => onQtyChange(Math.max(1, qty - 1))}
              className="grid h-7 w-7 place-items-center rounded-md border border-ink/15 text-ink/60 transition-colors hover:border-red-600/30 hover:bg-red-600/5 hover:text-red-600 active:scale-90"
            >
              <Minus size={15} />
            </button>
            <span className="min-w-[20px] text-center font-bold tabular-nums">{qty}</span>
            <button
              type="button"
              aria-label="Increase quantity"
              onClick={() => onQtyChange(qty + 1)}
              className="grid h-7 w-7 place-items-center rounded-md border border-ink/15 text-ink/60 transition-colors hover:border-red-600/30 hover:bg-red-600/5 hover:text-red-600 active:scale-90"
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
            icon={justAdded ? <Check size={16} /> : undefined}
            color="#dc2626"
            disabledColor="#c7c7c7"
            className="flex-1 whitespace-nowrap rounded-xl px-5 py-3 text-sm font-bold hover:brightness-95"
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
          color="#0f766e"
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

/** Snapdeal has no known size/color picker worth scraping today (see
 * extractors/snapdeal.ts), so `onSelectVariant` is accepted only to keep
 * this component's prop contract identical to every other platform view. */
export default function SnapdealProductView({
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
  const price = fmtPrice(result.price, result.currencyCode)
  const mrp = result.mrp && result.mrp !== result.price ? fmtPrice(result.mrp, result.currencyCode) : null
  const discountPct =
    result.price && result.mrp && Number(result.mrp) > Number(result.price)
      ? Math.round((1 - Number(result.price) / Number(result.mrp)) * 100)
      : null

  return (
    <div className="rounded-2xl border border-ink/10 bg-white p-5">
      <div className="grid gap-8 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <ImageGallery images={result.images ?? []} alt={result.title ?? 'Product image'} />

        <div>
          <span className="inline-flex items-center gap-1.5 rounded bg-red-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-red-600 ring-1 ring-inset ring-red-200">
            Snapdeal
          </span>

          <h2 className="mt-2 text-lg font-semibold leading-snug text-ink">
            {result.title ?? <span className="italic text-ink/35">No title found</span>}
          </h2>

          {result.rating && (
            <div className="mt-2">
              <RatingBadge rating={result.rating} count={result.review_count} />
            </div>
          )}

          <div className="mt-4 h-px w-full bg-ink/10" />

          <div className="mt-4 flex flex-wrap items-baseline gap-2">
            <p className="text-3xl font-bold text-red-600">
              {price ?? <span className="text-base font-semibold text-ink/35">No price found</span>}
            </p>
            {mrp && <p className="text-sm font-medium text-ink/40 line-through">{mrp}</p>}
            {discountPct != null && discountPct > 0 && (
              <span className="text-sm font-bold text-teal-deep">{discountPct}% off</span>
            )}
          </div>

          {result.availability && (
            <p className="mt-2 inline-block rounded-md bg-card px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink/55 ring-1 ring-inset ring-ink/10">
              {result.availability}
            </p>
          )}

          <SnapdealCommerceActions
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

          {result.seller && (
            <p className="mt-3 text-xs text-ink/50">
              Sold by <span className="font-semibold text-ink/70">{result.seller}</span>
            </p>
          )}

        </div>
      </div>
    </div>
  )
}