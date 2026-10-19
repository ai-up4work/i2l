// components/platforms/SeleqtProductView.tsx
'use client'

import { useEffect, useState } from 'react'
import { Star, Minus, Plus, Heart, ShoppingBag, ShoppingCart, Check } from 'lucide-react'
import { formatPrice } from '@/lib/currency'
import type { PlatformViewProps } from '@/lib/scrape/platform-view-props'
import ProductGallery from '@/components/stores/ProductGallery'
import RequestActionButton from '@/components/stores/RequestActionButton'
import Image from 'next/image'
import { SITE_LOGOS } from '@/lib/platform-logos'
import { PDP_TITLE } from './pdp-styles'
import PdpInfoTabs from './PdpInfoTabs'

/**
 * Renders a Seleqt (seleqt.wishlink.com) scrape result — same structural
 * layout as WestsideProductView (gallery + buy box side by side, buy box
 * ordered brand/rating -> title -> price -> size -> commerce actions,
 * bottom-most full-width info tabs), recolored with Seleqt's own real
 * brand accent (#6D28D9, a deep violet-purple matched to the actual
 * "Seleqt / BY WISHLINK" wordmark logo) rather than reusing another
 * platform's palette. An earlier pass here picked #FF3185 instead — the
 * pink used on the real site's "Styled by Creators" badge, which turns
 * out not to be the brand's actual identity color once the real logo
 * asset was on hand to check against.
 *
 * DATA SOURCE NOTE: results come from parseSeleqt in
 * lib/scrape/extractors/seleqt.ts, confirmed against exactly one real
 * captured product page — see that file's own doc comments for what's
 * verified vs. assumed:
 *   - Only ever ONE variant dimension ("Size"), no color — matches the
 *     one page checked; a differently-structured listing (multiple
 *     colors, a bundle, no variants at all) hasn't been tested.
 *   - Every size option's `url` is always null — Seleqt's size buttons
 *     carry no per-size link in the DOM at all (unlike Westside's real
 *     `?variant=<id>` URLs), so picking a size here is DISPLAY ONLY,
 *     same "visual only" treatment WestsideProductView already gives an
 *     option with no resolvable url.
 *   - `seller`, `itemLocation`, `returnsAccepted`, `returnPeriodDays`,
 *     `availability` are never populated (nothing in the DOM this
 *     extractor reads maps to any of them) — the Shipping & Returns tab
 *     below reflects that with the same graceful empty-state Westside's
 *     version uses, not a bug.
 */

function fmt(amount: string | null | undefined, currency: string | null | undefined) {
  const n = amount != null ? Number(String(amount).replace(/[^0-9.]/g, '')) : NaN
  if (Number.isNaN(n)) return null
  try {
    return formatPrice(n, currency ?? 'INR')
  } catch {
    return `${currency ?? ''} ${n}`.trim()
  }
}

function RatingStars({ rating }: { rating: string | null | undefined }) {
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
            className={i < rounded ? 'fill-[#6D28D9] text-[#6D28D9]' : 'fill-transparent text-ink/20'}
            strokeWidth={1.5}
          />
        ))}
      </span>
      <span className="text-xs font-semibold text-ink/60">{value.toFixed(1)}</span>
    </span>
  )
}

/** Size pill — text-only, matching the real site's flat size-picker
 * row. Every option's `onClick` still fires (so the visual selection
 * updates), but never calls onSelectVariant since there's no url to
 * navigate to — see the file header's note on why that's expected here,
 * not a gap. */
function SizePill({
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
        'flex min-w-[2.75rem] flex-col items-center rounded-md border-[1.5px] px-2.5 py-1.5 text-xs font-semibold transition-colors ' +
        (selected
          ? 'border-[#6D28D9] bg-[#6D28D9] text-white'
          : outOfStock
            ? 'cursor-not-allowed border-ink/10 text-ink/25 line-through'
            : interactive
              ? 'border-ink/15 text-ink/70 hover:border-[#6D28D9] cursor-pointer'
              : 'cursor-not-allowed border-ink/10 text-ink/25')
      }
    >
      {label}
    </button>
  )
}

/** Qty/wishlist/cart/request block — same shape and slot as every other
 * platform's *CommerceActions, primary CTA reading "ADD TO BAG" to
 * match Seleqt/Wishlink's own site copy (seen on the real captured
 * page's cart action). */
function SeleqtCommerceActions({
  qty,
  onQtyChange,
  inWishlist,
  onToggleWishlist,
  onAddToCart,
  justAdded,
  onRequestReview,
  loading,
  canAct,
  unavailable,
}: {
  qty: number
  onQtyChange: (qty: number) => void
  inWishlist: boolean
  onToggleWishlist: () => void
  onAddToCart: () => void
  justAdded: boolean
  onRequestReview: () => void
  loading?: boolean
  canAct: boolean
  unavailable?: boolean
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
              className="grid h-7 w-7 place-items-center rounded-md border border-ink/15 text-ink/60 transition-colors hover:border-[#6D28D9]/40 hover:bg-[#6D28D9]/5 hover:text-[#6D28D9] active:scale-90"
            >
              <Minus size={15} />
            </button>
            <span className="min-w-[20px] text-center font-bold tabular-nums text-ink">{qty}</span>
            <button
              type="button"
              aria-label="Increase quantity"
              onClick={() => onQtyChange(qty + 1)}
              className="grid h-7 w-7 place-items-center rounded-md border border-ink/15 text-ink/60 transition-colors hover:border-[#6D28D9]/40 hover:bg-[#6D28D9]/5 hover:text-[#6D28D9] active:scale-90"
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
            className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl border border-ink/15 text-ink/60 transition-all duration-200 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Heart size={17} fill={inWishlist ? 'currentColor' : 'none'} color={inWishlist ? '#e11d48' : 'currentColor'} />
          </button>

          <RequestActionButton
            onClick={onAddToCart}
            disabled={!canAct}
            loading={loading}
            unavailable={unavailable}
            unavailableLabel="NOT AVAILABLE"
            icon={justAdded ? <Check size={16} className="text-white" /> : <ShoppingBag size={16} />}
            color="#6D28D9"
            disabledColor="#c7c7c7"
            className="min-w-0 flex-1 whitespace-nowrap rounded-xl px-3 py-3 text-sm font-bold sm:px-5 text-white hover:brightness-110"
          >
            {justAdded ? 'ADDED' : 'ADD TO BAG'}
          </RequestActionButton>
        </div>

        <RequestActionButton
          onClick={onRequestReview}
          disabled={!canAct}
          loading={loading}
          unavailable={unavailable}
          unavailableLabel="NOT AVAILABLE"
          icon={<ShoppingCart size={16} />}
          color="#4C1D95"
          disabledColor="#c7c7c7"
          className="grow basis-full whitespace-nowrap rounded-xl px-5 py-3 text-sm font-bold text-white hover:brightness-110 sm:grow-0 sm:basis-auto"
        >
          GET QUOTE
        </RequestActionButton>
      </div>

      <p className="text-xs text-ink/45">You will not be charged now. This is just a request.</p>
    </div>
  )
}


function ProductInfoTabs({ result }: { result: PlatformViewProps['result'] }) {
  return <PdpInfoTabs result={result} accent="#6D28D9" />
}

/* ---------------------------------------------------------------------
 * Main component
 * ------------------------------------------------------------------- */

export default function SeleqtProductView({
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

  // See the file header's note on why opt.url is always null here —
  // this still updates the visual selection, it just never triggers a
  // re-scrape the way Westside's real per-size URLs do.
  function pickOption(dimension: string, label: string, url: string | null) {
    setSelectedByDimension((prev) => ({ ...prev, [dimension]: label }))
    if (url) onSelectVariant(url)
  }

  const price = fmt(result.price, result.currencyCode)
  const mrp = result.mrp && result.mrp !== result.price ? fmt(result.mrp, result.currencyCode) : null
  const pctOff =
    result.mrp && result.price && Number(result.mrp.replace(/[^0-9.]/g, '')) > Number(result.price.replace(/[^0-9.]/g, ''))
      ? Math.round(
          (1 -
            Number(result.price.replace(/[^0-9.]/g, '')) / Number(result.mrp.replace(/[^0-9.]/g, ''))) *
            100,
        )
      : null

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl sm:px-6 lg:px-10 font-sans">
      <div
        className="grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-6 [grid-template-areas:'info'_'gallery'_'rest'] sm:grid-cols-2 sm:grid-rows-[auto_1fr] sm:gap-y-5 sm:[grid-template-areas:'gallery_info'_'gallery_rest']"
      >
        <div className="min-w-0 [grid-area:info]">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
           <a href={result.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center">
            <Image src={SITE_LOGOS.seleqt!} alt="seleqt" width={60} height={12} />
           </a>
            {result.rating && (
              <>
                <span className="text-ink/20">·</span>
                <RatingStars rating={result.rating} />
              </>
            )}
          </div>

          <h1 className={PDP_TITLE}>
            {result.title ?? <span className="italic text-ink/35">No title found</span>}
          </h1>
        </div>

        <div className="min-w-0 [grid-area:gallery]">
          <ProductGallery
            images={images}
            title={result.title}
            resetKey={result.url}
            theme={{
              frameBorder: 'border-ink/10',
              activeThumb: 'border-[#6D28D9] ring-1 ring-[#6D28D9]',
              restingThumb: 'border-ink/10',
              placeholderText: 'text-ink/35',
            }}
          />
        </div>

        <div className="min-w-0 [grid-area:rest]">
          <div className="flex flex-wrap items-baseline gap-2.5">
            {price ? (
              <p className="text-3xl font-bold text-ink">{price}</p>
            ) : (
              <p className="text-base font-semibold text-ink/35">No price found</p>
            )}
            {mrp && <p className="text-base font-semibold text-ink/35 line-through">{mrp}</p>}
            {pctOff !== null && (
              <span className="rounded bg-[#6D28D9] px-2 py-0.5 text-[10px] font-bold text-white">{pctOff}% off</span>
            )}
          </div>

          {!!result.variants?.length && (
            <div className="mt-4 flex flex-col gap-4">
              {result.variants.map((dim) => {
                const selectedLabel = selectedByDimension[dim.dimension] ?? null
                return (
                  <div key={dim.dimension}>
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-ink/40">{dim.dimension}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {dim.options.map((opt) => (
                        <SizePill
                          key={opt.label}
                          label={opt.label}
                          selected={opt.label === selectedLabel}
                          outOfStock={opt.outOfStock}
                          onClick={() => pickOption(dim.dimension, opt.label, opt.url)}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <SeleqtCommerceActions
            qty={qty}
            onQtyChange={onQtyChange}
            inWishlist={inWishlist}
            onToggleWishlist={onToggleWishlist}
            onAddToCart={onAddToCart}
            justAdded={justAdded}
            onRequestReview={onRequestReview}
            loading={loading}
            canAct={canAct}
            unavailable={result.unavailable}
          />
        </div>
      </div>

      <ProductInfoTabs result={result} />
    </div>
  )
}