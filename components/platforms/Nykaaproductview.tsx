// app/demo/scraper-qa/platforms/NykaaProductView.tsx
'use client'

import { useEffect, useState } from 'react'
import { Star, Minus, Plus, Heart, ShoppingBag, ShoppingCart, Check } from 'lucide-react'
import { formatPrice } from '@/lib/currency'
import type { ScrapeResult } from '@/lib/scrape/parsers'
import type { PlatformViewProps } from '@/lib/scrape/platform-view-props'
import ProductGallery from '@/components/stores/ProductGallery'
import RequestActionButton from '@/components/stores/RequestActionButton'
import Image from 'next/image'

/**
 * Renders a scrape result using the SAME structural layout as
 * AmazonProductView / FlipkartProductView / EbayProductView /
 * HopscotchProductView — gallery (shared ProductGallery component) +
 * buy box side by side (max-w-6xl), buy box ordered as
 * platform/rating -> title -> seller -> price -> variants -> stock ->
 * NykaaCommerceActions, then a bottom-most full-width ProductInfoTabs
 * section — but restyled with Nykaa's own visual language:
 *   - magenta/pink (#FC2779) accents, rating pill, and primary CTA,
 *     matching the real nykaa.com PDP
 *   - "MRP Incl. of all taxes" note under the price (beauty listings
 *     in India show this explicitly, unlike most fashion PDPs)
 *   - shade/size variant picker rendered as small rounded pill chips
 *     with an inline swatch dot when the option has an image, rather
 *     than the larger square/circular swatches Amazon/Flipkart use —
 *     matches Nykaa's own compact chip row
 *
 * LAYOUT ON MOBILE (<sm): same grid-template-areas reflow as the other
 * views — info (badge/title) above gallery, above the rest of the buy
 * box (seller/price/variants/stock/commerce actions).
 */

const NYKAA_PINK = '#FC2779'

function fmt(amount: string | null | undefined, currency: string | null | undefined) {
  const n = amount != null ? Number(amount) : NaN
  if (Number.isNaN(n)) return null
  try {
    return formatPrice(n, currency ?? 'LKR')
  } catch {
    return `${currency ?? ''} ${n}`.trim()
  }
}

/** Nykaa's magenta rating pill — filled white star + numeric rating. */
function NykaaRatingPill({ rating, count }: { rating: string | null | undefined; count?: string | null }) {
  const value = rating ? parseFloat(rating) : NaN
  if (Number.isNaN(value)) return null
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-bold text-white"
        style={{ backgroundColor: NYKAA_PINK }}
      >
        {value.toFixed(1)}
        <Star size={10} className="fill-white text-white" strokeWidth={0} />
      </span>
      {count && <span className="text-xs font-medium text-[#767676]">{count} Reviews</span>}
    </span>
  )
}

/** Shade/size chip — small rounded pill, with a tiny swatch dot inline
 * when the option has an image, matching Nykaa's compact variant
 * picker (it never uses large square tiles the way Flipkart/Amazon do). */
function NykaaChip({
  label,
  imageUrl,
  selected,
  outOfStock,
  onClick,
  disabledTitle,
}: {
  label: string
  imageUrl?: string | null
  selected: boolean
  outOfStock?: boolean
  onClick?: () => void
  disabledTitle?: string
}) {
  const interactive = !!onClick && !outOfStock
  return (
    <button
      type="button"
      onClick={interactive ? onClick : undefined}
      title={outOfStock ? 'Out of stock' : disabledTitle}
      aria-pressed={selected}
      disabled={!interactive}
      className={`flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors ${
        selected
          ? 'text-white'
          : outOfStock
            ? 'cursor-not-allowed border-[#ececec] text-[#c7c7c7] line-through'
            : interactive
              ? 'border-[#dcdcdc] text-[#282828] hover:border-[#fc2779]/50 cursor-pointer'
              : 'cursor-not-allowed border-[#ececec] text-[#c7c7c7]'
      }`}
      style={selected ? { backgroundColor: NYKAA_PINK, borderColor: NYKAA_PINK } : undefined}
    >
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="h-4 w-4 flex-none rounded-full object-cover" />
      )}
      {label}
    </button>
  )
}

/**
 * Nykaa-styled qty/wishlist/cart/request block — identical shape and
 * slot to AmazonCommerceActions/FlipkartCommerceActions/
 * EbayCommerceActions/HopscotchCommerceActions (qty stepper, wishlist
 * heart, Add to Bag, Get Quote, all inline in one wrapping row), just
 * in Nykaa's magenta color language and "ADD TO BAG" wording.
 */
function NykaaCommerceActions({
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
        {/* Atomic group: qty stepper + wishlist + Add to Bag. This
            never splits across lines — flex-nowrap keeps it as one
            unit for the outer row's wrap decision. */}
        <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-2">
          <div className="flex flex-none items-center gap-3.5 rounded-xl border border-[#dcdcdc] px-2.5 py-1.5">
            <button
              type="button"
              aria-label="Decrease quantity"
              onClick={() => onQtyChange(Math.max(1, qty - 1))}
              className="grid h-7 w-7 place-items-center rounded-md border border-[#dcdcdc] text-[#767676] transition-colors hover:border-[#fc2779]/40 hover:bg-[#fc2779]/5 hover:text-[#fc2779] active:scale-90"
            >
              <Minus size={15} />
            </button>
            <span className="min-w-[20px] text-center font-bold tabular-nums text-[#282828]">{qty}</span>
            <button
              type="button"
              aria-label="Increase quantity"
              onClick={() => onQtyChange(qty + 1)}
              className="grid h-7 w-7 place-items-center rounded-md border border-[#dcdcdc] text-[#767676] transition-colors hover:border-[#fc2779]/40 hover:bg-[#fc2779]/5 hover:text-[#fc2779] active:scale-90"
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
            className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl border border-[#dcdcdc] text-[#a3a3a3] transition-all duration-200 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
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
            color={NYKAA_PINK}
            disabledColor="#c7c7c7"
            className="flex-1 whitespace-nowrap rounded-xl px-5 py-3 text-sm font-bold text-white hover:brightness-95"
          >
            {justAdded ? 'ADDED' : 'ADD TO BAG'}
          </RequestActionButton>
        </div>

        {/* Get Quote:
            - Mobile (below sm): grow + basis-full → the only thing
              allowed to wrap, and when it does it takes the entire
              next line by itself.
            - Desktop (sm and up): sm:grow-0 + sm:basis-auto → fixed to
              its own natural content width. */}
        <RequestActionButton
          onClick={onRequestReview}
          disabled={!canAct}
          loading={loading}
          unavailable={result.unavailable}
          unavailableLabel="NOT AVAILABLE"
          icon={<ShoppingCart size={16} />}
          color="#282828"
          disabledColor="#c7c7c7"
          className="grow basis-full whitespace-nowrap rounded-xl border border-[#282828] px-5 py-3 text-sm font-bold text-[#282828] hover:bg-[#f5f5f5] sm:grow-0 sm:basis-auto"
        >
          GET QUOTE
        </RequestActionButton>
      </div>

      <p className="text-xs text-[#a3a3a3]">You will not be charged now. This is just a request.</p>
    </div>
  )
}

/* ---------------------------------------------------------------------
 * ProductInfoTabs — inlined, Nykaa-flavored (pink active indicator),
 * same Description / Details / Shipping & Returns structure and same
 * bottom-most full-width slot as the other platform views.
 * ------------------------------------------------------------------- */

const INFO_TABS = ['Description', 'Details', 'Shipping & Returns'] as const
type InfoTab = (typeof INFO_TABS)[number]

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="font-semibold text-[#282828]/80">{label}</dt>
      <dd className="text-right text-[#767676]">{value}</dd>
    </div>
  )
}

/**
 * Some scrapes (Amazon-style "A+ content" descriptions in particular)
 * leak the contents of a `<style>` block through as plain text — e.g.
 * ".aplus-container{width:100%;max-width:810px;margin:0 auto}..." —
 * with no surrounding tags to strip. This drops any explicit
 * <style>/<script> blocks and remaining HTML tags, then strips
 * anything that still looks like raw CSS rule text (a selector run
 * followed by a `{...}` declaration block). If what's left is empty or
 * still overwhelmingly punctuation-heavy (a sign it's leftover markup
 * noise rather than prose), this returns null so the caller can fall
 * back to a normal "no description" message instead of showing garbage.
 */
function sanitizeDescription(raw: string | null | undefined): string | null {
  if (!raw) return null
  let text = raw
  text = text.replace(/<style[\s\S]*?<\/style>/gi, ' ')
  text = text.replace(/<script[\s\S]*?<\/script>/gi, ' ')
  text = text.replace(/<[^>]+>/g, ' ')
  // Strip leaked raw CSS rule blocks: a run of selector-ish characters
  // immediately followed by a brace-delimited declaration list.
  text = text.replace(/[.#]?[a-zA-Z0-9_\-.,#:>~ \[\]="'%]+\{[^{}]*\}/g, ' ')
  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
  text = text.replace(/\s+/g, ' ').trim()

  if (!text) return null
  // Leftover markup/CSS noise is dense with { } ; — real prose isn't.
  const noiseChars = (text.match(/[{};]/g) ?? []).length
  if (noiseChars > text.length * 0.02) return null

  return text
}

function ProductInfoTabs({ result }: { result: ScrapeResult }) {
  const [activeTab, setActiveTab] = useState<InfoTab>('Description')

  return (
    <div className="mt-8 border-t border-[#ececec] pt-6">
      <div className="flex gap-5 border-b border-[#ececec]">
        {INFO_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`-mb-px border-b-2 pb-2.5 text-sm font-semibold transition-colors ${
              activeTab === tab
                ? 'text-[#282828]'
                : 'border-transparent text-[#a3a3a3] hover:text-[#282828]'
            }`}
            style={activeTab === tab ? { borderColor: NYKAA_PINK } : undefined}
          >
            {tab}
          </button>
        ))}
      </div>
      <div
        key={activeTab}
        className="min-h-[96px] pb-2 pt-4 text-sm leading-relaxed text-[#484848] motion-safe:[animation:tabFadeIn_0.18s_ease-out_both]"
      >
        {activeTab === 'Description' &&
          (() => {
            const cleaned = sanitizeDescription((result as ScrapeResult & { description?: string }).description)
            return cleaned ? (
              <p>{cleaned}</p>
            ) : (
              <p className="text-[#a3a3a3]">
                We don&apos;t have a description for this listing. Here&apos;s the title instead:{' '}
                {result.title ?? 'no title available.'}
              </p>
            )
          })()}
        {activeTab === 'Details' && (
          <dl className="flex flex-col gap-1.5 text-xs">
            {result.brand && <DetailRow label="Brand" value={result.brand} />}
            {result.mpn && <DetailRow label="Model" value={result.mpn} />}
            {result.categoryPath && <DetailRow label="Category" value={result.categoryPath} />}
            {result.itemSpecifics?.map((spec) => (
              <DetailRow key={spec.name} label={spec.name} value={spec.value} />
            ))}
            {!result.brand && !result.mpn && !result.itemSpecifics?.length && (
              <p className="text-[#a3a3a3]">We don&apos;t have any additional details for this listing.</p>
            )}
          </dl>
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
                <p className="mt-1 text-[#a3a3a3]">
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

export default function NykaaProductView({
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
      // Some scrapes mark more than one option `selected: true` at
      // once (a data-quality issue in the source page's markup, not
      // something we control). When that happens, prefer whichever
      // selected option's own price actually matches the top-level
      // `result.price`/`result.mrp` being shown above the chips —
      // otherwise the chip highlighted as "selected" can silently
      // disagree with the price the buy box is actually displaying.
      // Falls back to the last selected flag, then the first, when no
      // price match is available.
      const candidates = dim.options.filter((o) => o.selected)
      const priceMatch = candidates.find(
        (o) => (result.price != null && o.price === result.price) || (result.mrp != null && o.mrp === result.mrp)
      )
      const chosen = priceMatch ?? candidates[candidates.length - 1] ?? candidates[0]
      if (chosen) initial[dim.dimension] = chosen.label
    }
    setSelectedByDimension(initial)
  }, [result.url, result.variants, result.price, result.mrp])

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

  const inStock = result.unavailable
    ? false
    : result.availability
      ? !/sold out|out of stock|unavailable/i.test(result.availability)
      : true

  return (
    <div className="mx-auto max-w-6xl px-6 lg:px-10 font-sans">
      <div
        className="grid gap-8 [grid-template-areas:'info'_'gallery'_'rest'] sm:grid-cols-2 sm:[grid-template-areas:'gallery_info'_'gallery_rest']"
      >
        {/* Top of buy box: platform/rating badge, then title.
            Mobile: first (area "info"). Desktop: top-right column. */}
        <div className="min-w-0 [grid-area:info]">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-[#767676]">
            <a href={result.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center">
              <Image src="/logos/nykaa.png" alt="Nykaa" width={70} height={16} />
            </a>
            {result.rating && (
              <>
                <span className="text-[#dcdcdc]">·</span>
                <NykaaRatingPill rating={result.rating} count={result.review_count} />
              </>
            )}
          </div>

          {result.seller && <p className="mt-2 text-[13px] font-semibold text-[#282828]">{result.seller}</p>}

          <h1 className="mt-1 text-base font-normal leading-snug text-[#767676] sm:text-lg">
            {result.title ?? <span className="italic text-[#a3a3a3]">No title found</span>}
          </h1>
        </div>

        {/* Image gallery — shared component, Nykaa theme.
            Mobile: second (area "gallery"). Desktop: left column,
            spanning both rows since "gallery" repeats in both area rows.
            Guarded against an empty `images` array: ProductGallery
            renders nothing for zero images, which otherwise collapses
            this entire grid cell to zero size (no box, no placeholder
            text, nothing) — so a dedicated placeholder box is rendered
            here instead when there's nothing to show. */}
        <div className="min-w-0 [grid-area:gallery]">
          {images.length > 0 ? (
            <ProductGallery
              images={images}
              title={result.title}
              resetKey={result.url}
              theme={{
                frameBorder: 'border-[#f5f5f5]',
                activeThumb: 'border-[#FC2779] ring-1 ring-[#FC2779]',
                restingThumb: 'border-[#ececec]',
                placeholderText: 'text-[#a3a3a3]',
              }}
            />
          ) : (
            <div className="flex aspect-square items-center justify-center rounded-lg border border-[#ececec] bg-[#fafafa] text-xs text-[#a3a3a3]">
              No image found
            </div>
          )}
        </div>

        {/* Rest of buy box: price -> variants -> stock -> commerce
            actions. Mobile: third (area "rest"). Desktop: bottom-right
            column. */}
        <div className="min-w-0 [grid-area:rest]">
          <div className="flex flex-wrap items-baseline gap-2.5">
            {price ? (
              <p className="text-3xl font-bold text-[#282828]">{price}</p>
            ) : (
              <p className="text-base font-semibold text-[#a3a3a3]">No price found</p>
            )}
            {mrp && <p className="text-base font-semibold text-[#a3a3a3] line-through">{mrp}</p>}
            {mrp && pctOff !== null && (
              <span className="text-sm font-bold" style={{ color: NYKAA_PINK }}>
                ({pctOff}% Off)
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-[#a3a3a3]">MRP Incl. of all taxes</p>

          {!!result.variants?.length && (
            <div className="mt-4 flex flex-col gap-4">
              {result.variants.map((dim) => {
                const selectedLabel = selectedByDimension[dim.dimension] ?? null

                return (
                  <div key={dim.dimension}>
                    <p className="mb-1.5 text-[13px] text-[#282828]">
                      <span className="font-semibold">{dim.dimension}:</span> {selectedLabel ?? ''}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {dim.options.map((opt) => {
                        const selected = opt.label === selectedLabel
                        const disabledTitle = opt.url ? undefined : `${opt.label} — no direct link found, selection is visual only`
                        const onPick = () => pickOption(dim.dimension, opt.label, opt.url)
                        return (
                          <NykaaChip
                            key={opt.label}
                            label={opt.label}
                            imageUrl={opt.image}
                            selected={selected}
                            outOfStock={opt.outOfStock}
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
              <span style={{ color: NYKAA_PINK }}>Out of Stock</span>
            ) : inStock ? (
              <span className="text-[#1E7E34]">In Stock</span>
            ) : (
              <span className="text-[#767676]">{result.availability}</span>
            )}
          </p>

          <NykaaCommerceActions
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