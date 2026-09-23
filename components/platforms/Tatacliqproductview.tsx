'use client'

import { useEffect, useState } from 'react'
import { Star, ExternalLink, Minus, Plus, Heart, ShoppingCart, Check } from 'lucide-react'
import { SITE_LOGOS } from '@/lib/platform-logos'
import { formatPrice } from '@/lib/currency'
import type { ScrapeResult } from '@/lib/scrape/parsers'
import RequestActionButton from '@/components/stores/RequestActionButton'

/**
 * Renders a scrape result to look like the real Tata CLiQ product page
 * (tatacliq.com). Matches the actual PDP's dark-navy brand color for
 * links/CTAs, the red "FLAT X% OFF" tag next to a struck-through MRP,
 * the "Sold by" seller line, and the plain grey pill size row — the
 * same landmarks a reviewer would check against the live site, same
 * convention as AmazonProductView/FlipkartProductView.
 *
 * result.site for this platform comes through as 'tataCliq' (see
 * scraperSite override on the tata-cliq entry in data/stores/data.ts —
 * the URL slug is 'tata-cliq' but the scraper literal differs).
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

function TataCliqRating({ rating, count }: { rating: string | null | undefined; count?: string | null }) {
  const value = rating ? parseFloat(rating) : NaN
  if (Number.isNaN(value)) return null
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center gap-0.5 rounded-sm bg-[#0B1E48] px-1.5 py-0.5 text-xs font-bold text-white">
        {value.toFixed(1)}
        <Star size={10} className="fill-white text-white" strokeWidth={0} />
      </span>
      {count && <span className="text-xs font-medium text-[#7a7a7a]">{count} Ratings</span>}
    </span>
  )
}

type VariantDimension = NonNullable<ScrapeResult['variants']>[number]

/** Color/style swatch strip — square thumbnails, selected tile gets the
 * navy CLiQ border, matches the real PDP's variant image row. */
function SwatchRow({
  dim,
  onSelect,
}: {
  dim: VariantDimension
  onSelect: (url: string) => void
}) {
  const selectedOpt = dim.options.find((o) => o.selected)
  return (
    <div>
      <p className="text-[13px] text-[#3d3d3d]">
        <span className="font-semibold text-[#0B1E48]">{dim.dimension}:</span> {selectedOpt?.label ?? ''}
      </p>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        {dim.options.map((opt) => {
          const clickable = !!opt.url && !opt.selected && !opt.outOfStock
          return (
            <button
              key={opt.label}
              type="button"
              disabled={!clickable}
              onClick={() => opt.url && onSelect(opt.url)}
              title={opt.outOfStock ? 'Out of stock' : opt.url ? undefined : 'No direct link found for this option'}
              className={`relative h-16 w-16 flex-none overflow-hidden rounded-md border ${
                opt.selected
                  ? 'border-2 border-[#0B1E48]'
                  : opt.outOfStock
                    ? 'cursor-not-allowed border-[#eaeaea]'
                    : clickable
                      ? 'border-[#dcdcdc] hover:border-[#0B1E48]/50'
                      : 'cursor-not-allowed border-[#eaeaea] opacity-50'
              }`}
            >
              {opt.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={opt.image}
                  alt=""
                  className={`h-full w-full object-cover ${opt.outOfStock ? 'opacity-40 grayscale' : ''}`}
                />
              ) : (
                <div className="grid h-full w-full place-items-center bg-[#f7f7f7] text-[8px] text-[#a0a0a0]">
                  {opt.label}
                </div>
              )}
              {opt.outOfStock && (
                <span className="absolute inset-x-0 bottom-0 bg-black/70 py-0.5 text-center text-[7px] font-bold uppercase text-white">
                  Sold out
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Size row — plain grey outline pills, matching tatacliq.com's size
 * selector (no image, no brand-color fill even when selected — just a
 * bolder border, which is how the real PDP treats the selected size). */
function SizeRow({
  dim,
  onSelect,
}: {
  dim: VariantDimension
  onSelect: (url: string) => void
}) {
  return (
    <div>
      <p className="text-[13px] font-semibold text-[#0B1E48]">Select {dim.dimension}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {dim.options.map((opt) => {
          const clickable = !!opt.url && !opt.selected && !opt.outOfStock
          return (
            <button
              key={opt.label}
              type="button"
              disabled={!clickable}
              onClick={() => opt.url && onSelect(opt.url)}
              title={opt.outOfStock ? 'Out of stock' : opt.url ? undefined : 'No direct link found for this option'}
              className={`flex h-10 min-w-[46px] items-center justify-center rounded-md border px-3 text-[13px] font-medium ${
                opt.selected
                  ? 'border-2 border-[#0B1E48] text-[#0B1E48]'
                  : opt.outOfStock
                    ? 'cursor-not-allowed border-[#eaeaea] text-[#c7c7c7] line-through'
                    : clickable
                      ? 'border-[#dcdcdc] text-[#3d3d3d] hover:border-[#0B1E48]/50'
                      : 'cursor-not-allowed border-[#eaeaea] text-[#c7c7c7]'
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

/**
 * TataCliq-styled qty/wishlist/cart/request block — same functional
 * shape as every other platform view's commerce actions
 * (AmazonCommerceActions, MyntraCommerceActions, etc.): qty stepper,
 * wishlist heart, Add to Bag, Get Quote, inline in one wrapping row.
 * Replaces the old pair of permanently-disabled "ADD TO BAG"/"BUY NOW"
 * buttons labeled "Demo only — this QA tool does not place real
 * orders" — a leftover from the demo scraper-QA client this file was
 * originally copied from, which meant no TataCliq listing could
 * actually be added to cart or requested. Reuses the same navy/red
 * split the disabled buttons already established.
 */
function TataCliqCommerceActions({
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
    <div className="mt-4 flex flex-col gap-3 sm:max-w-[360px]">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-2">
          <div className="flex flex-none items-center gap-3.5 rounded-sm border border-[#dcdcdc] px-2.5 py-1.5">
            <button
              type="button"
              aria-label="Decrease quantity"
              onClick={() => onQtyChange(Math.max(1, qty - 1))}
              className="grid h-7 w-7 place-items-center rounded-sm border border-[#dcdcdc] text-[#3d3d3d] transition-colors hover:border-[#0B1E48]/40 hover:bg-[#0B1E48]/5 active:scale-90"
            >
              <Minus size={15} />
            </button>
            <span className="min-w-[20px] text-center font-bold tabular-nums text-[#0B1E48]">{qty}</span>
            <button
              type="button"
              aria-label="Increase quantity"
              onClick={() => onQtyChange(qty + 1)}
              className="grid h-7 w-7 place-items-center rounded-sm border border-[#dcdcdc] text-[#3d3d3d] transition-colors hover:border-[#0B1E48]/40 hover:bg-[#0B1E48]/5 active:scale-90"
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
            className="grid h-[42px] w-[42px] flex-none place-items-center rounded-sm border border-[#dcdcdc] text-[#7a7a7a] transition-all duration-200 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Heart size={17} fill={inWishlist ? 'currentColor' : 'none'} color={inWishlist ? '#e11d48' : 'currentColor'} />
          </button>

          <RequestActionButton
            onClick={onAddToCart}
            disabled={!canAct}
            loading={loading}
            unavailable={result.unavailable}
            unavailableLabel="OUT OF STOCK"
            icon={justAdded ? <Check size={16} /> : undefined}
            color="#0B1E48"
            disabledColor="#c7c7c7"
            className="flex-1 whitespace-nowrap rounded-sm px-5 py-3 text-sm font-bold hover:brightness-110"
          >
            {justAdded ? 'ADDED' : 'ADD TO BAG'}
          </RequestActionButton>
        </div>

        <RequestActionButton
          onClick={onRequestReview}
          disabled={!canAct}
          loading={loading}
          unavailable={result.unavailable}
          unavailableLabel="OUT OF STOCK"
          icon={<ShoppingCart size={16} />}
          color="#E33121"
          disabledColor="#c7c7c7"
          className="grow basis-full whitespace-nowrap rounded-sm px-5 py-3 text-sm font-bold hover:brightness-95 sm:grow-0 sm:basis-auto"
        >
          GET QUOTE
        </RequestActionButton>
      </div>

      <p className="text-xs text-[#9a9a9a]">You will not be charged now. This is just a request.</p>
    </div>
  )
}

export default function TataCliqProductView({
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
  const images = result.images ?? []
  const [mainImage, setMainImage] = useState(images[0] ?? null)

  useEffect(() => {
    setMainImage((result.images ?? [])[0] ?? null)
  }, [result.url, result.images])

  const price = fmt(result.price, result.currencyCode)
  const mrp = result.mrp && result.mrp !== result.price ? fmt(result.mrp, result.currencyCode) : null
  const pctOff =
    result.mrp && result.price && Number(result.mrp) > Number(result.price)
      ? Math.round((1 - Number(result.price) / Number(result.mrp)) * 100)
      : null

  const inStock = result.unavailable
    ? false
    : result.availability
      ? !/sold out|out of stock|unavailable/i.test(result.availability)
      : true

  const variants = result.variants ?? []
  const swatchDims = variants.filter((d) => d.options.some((o) => o.image))
  const pillDims = variants.filter((d) => !d.options.some((o) => o.image))

  return (
    <div className="rounded-2xl border border-[#e5e5e5] bg-white p-5 font-sans">
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
                    mainImage === src ? 'border-[#0B1E48] ring-1 ring-[#0B1E48]' : 'border-[#e5e5e5]'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-full w-full object-contain" />
                </button>
              ))}
            </div>
          )}
          <div className="aspect-square flex-1 overflow-hidden rounded-lg border border-[#f0f0f0]">
            {mainImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mainImage} alt={result.title ?? 'Product image'} className="h-full w-full object-contain" />
            ) : (
              <div className="grid h-full place-items-center text-xs text-[#9a9a9a]">No image found</div>
            )}
          </div>
        </div>

        {/* Buy box + details */}
        <div>
          {result.seller && (
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7a7a7a]">{result.seller}</p>
          )}
          <h1 className="mt-1 text-lg font-medium leading-snug text-[#3d3d3d]">
            {result.title ?? <span className="italic text-[#9a9a9a]">No title found</span>}
          </h1>

          {result.rating && (
            <div className="mt-2">
              <TataCliqRating rating={result.rating} count={result.review_count} />
            </div>
          )}

          <div className="mt-3 flex items-baseline gap-2.5">
            {price ? (
              <span className="text-2xl font-bold text-[#0B1E48]">{price}</span>
            ) : (
              <span className="text-base font-semibold text-[#9a9a9a]">No price found</span>
            )}
            {mrp && <span className="text-sm font-medium text-[#9a9a9a] line-through">{mrp}</span>}
            {mrp && pctOff !== null && (
              <span className="rounded-sm bg-[#E33121]/10 px-1.5 py-0.5 text-xs font-bold text-[#E33121]">
                FLAT {pctOff}% OFF
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-[#9a9a9a]">Inclusive of all taxes</p>

          <div className="mt-5 flex flex-col gap-4">
            {swatchDims.map((dim) => (
              <SwatchRow key={dim.dimension} dim={dim} onSelect={onSelectVariant} />
            ))}
            {pillDims.map((dim) => (
              <SizeRow key={dim.dimension} dim={dim} onSelect={onSelectVariant} />
            ))}
          </div>

          <p className="mt-4 text-sm font-semibold">
            {result.unavailable ? (
              <span className="text-[#E33121]">Out of Stock</span>
            ) : inStock ? (
              <span className="text-[#1E7E34]">In Stock</span>
            ) : (
              <span className="text-[#7a7a7a]">{result.availability}</span>
            )}
          </p>

          <TataCliqCommerceActions
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

          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#0B1E48] hover:underline"
          >
            Open original listing <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </div>
  )
}