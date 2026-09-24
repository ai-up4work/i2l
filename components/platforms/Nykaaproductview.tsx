// app/demo/scraper-qa/platforms/NykaaProductView.tsx
'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Star, Minus, Plus, Heart, ShoppingBag, ShoppingCart, Check } from 'lucide-react'
import { formatPrice } from '@/lib/currency'
import type { ScrapeResult } from '@/lib/scrape/parsers'
import type { PlatformViewProps } from '@/lib/scrape/platform-view-props'
import ProductGallery from '@/components/stores/ProductGallery'
import RequestActionButton from '@/components/stores/RequestActionButton'
import Image from 'next/image'
import { SITE_LOGOS } from '@/lib/platform-logos'

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
 *
 * ProductInfoTabs below carries the same treatment as the other
 * platform views' updated tab panels: a pill rail with a real sliding
 * indicator (measured off the active button's rect) instead of a flat
 * underline, and the tab content sitting inside a bordered card with
 * detail rows capped to a readable column instead of a bare
 * `justify-between` stretched across the full 6xl-wide panel.
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
 * ProductInfoTabs — pill rail with a sliding indicator + a contained
 * card panel, same treatment now shared across the platform views.
 * ------------------------------------------------------------------- */

const INFO_TABS = ['Description', 'Details', 'Shipping & Returns'] as const
type InfoTab = (typeof INFO_TABS)[number]

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 rounded-lg px-2 py-1.5 transition-colors hover:bg-[#fc2779]/[0.04]">
      <dt className="text-[#767676]">{label}</dt>
      <dd className="text-right font-medium text-[#282828]">{value}</dd>
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
  // Strip leaked at-rule blocks (@media, @font-face, @supports, ...) —
  // these don't match the selector-run pattern below because they
  // start with '@' and often wrap their condition in parens, e.g.
  // "@media (min-width:769px){ }". Handled separately, before the
  // general selector stripper, and tolerant of one level of nested
  // braces (a @media block wrapping an actual rule).
  text = text.replace(/@[a-zA-Z-]+[^{}]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, ' ')
  // Strip leaked raw CSS rule blocks: a run of selector-ish characters
  // immediately followed by a brace-delimited declaration list.
  text = text.replace(/[.#]?[a-zA-Z0-9_\-.,#:>~ \[\]="'%]+\{[^{}]*\}/g, ' ')
  // Any bare/empty brace pair left over once the above have run.
  text = text.replace(/\{\s*\}/g, ' ')
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

type ComboItem = { name: string; mrp: string | null; qty: string | null }

// Combo/kit listings on Nykaa (and similar sites) often flatten their
// contents into the description as repeated
// "<Product name>: (MRP: 600.00/-) | Quantity: 1 |" runs rather than a
// real structured field. Left as plain prose this reads as one
// unbroken wall of pipes and parentheses. This pulls each run out into
// a proper item, and returns what's left over (the actual intro
// sentence, e.g. "Explore the entire range...") separately so it can
// still be shown as normal prose above the list. Returns null when the
// text doesn't contain this pattern at all, so normal single-product
// descriptions are untouched.
function extractComboItems(text: string): { items: ComboItem[]; remainder: string } | null {
  const itemRegex = /([^|]+?):\s*\(\s*MRP:\s*([\d,]+(?:\.\d+)?)\s*\/-\s*\)\s*\|\s*Quantity:\s*(\d+)\s*\|/gi
  const items: ComboItem[] = []
  let match: RegExpExecArray | null
  while ((match = itemRegex.exec(text))) {
    items.push({ name: match[1].trim().replace(/^[:\-–]\s*/, ''), mrp: match[2], qty: match[3] })
  }
  if (!items.length) return null

  const remainder = text.replace(itemRegex, ' ').replace(/\s+/g, ' ').trim()
  return { items, remainder }
}

// Sliding pink pill indicator behind the active tab, measured from the
// real button rects so it stays exact regardless of label width.
function useSlidingIndicator(activeTab: InfoTab) {
  const railRef = useRef<HTMLDivElement | null>(null)
  const btnRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const [style, setStyle] = useState<{ left: number; width: number } | null>(null)

  useLayoutEffect(() => {
    const rail = railRef.current
    const btn = btnRefs.current.get(activeTab)
    if (!rail || !btn) return
    const railRect = rail.getBoundingClientRect()
    const btnRect = btn.getBoundingClientRect()
    setStyle({ left: btnRect.left - railRect.left + rail.scrollLeft, width: btnRect.width })
  }, [activeTab])

  return { railRef, btnRefs, style }
}

function ProductInfoTabs({ result }: { result: ScrapeResult }) {
  const [activeTab, setActiveTab] = useState<InfoTab>('Description')
  const { railRef, btnRefs, style: indicatorStyle } = useSlidingIndicator(activeTab)

  const hasSpecifics = !!(result.brand || result.mpn || result.categoryPath || result.itemSpecifics?.length)

  return (
    <div className="mt-8 border-t border-[#ececec] pt-6">
      <div
        ref={railRef}
        className="relative inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-[#fc2779]/[0.04] p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {indicatorStyle && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-1 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08)] ring-1 ring-inset ring-[#282828]/[0.06] transition-[transform,width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{ width: indicatorStyle.width, transform: `translateX(${indicatorStyle.left}px)` }}
          />
        )}
        {INFO_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            ref={(el) => {
              if (el) btnRefs.current.set(tab, el)
              else btnRefs.current.delete(tab)
            }}
            onClick={() => setActiveTab(tab)}
            aria-pressed={activeTab === tab}
            className={`relative z-10 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors duration-200 ${
              activeTab === tab ? 'text-[#282828]' : 'text-[#a3a3a3] hover:text-[#282828]/70'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div
        key={activeTab}
        className="mt-4 min-h-[96px] rounded-2xl border border-[#282828]/[0.06] bg-[#fafafa] p-4 text-sm leading-relaxed text-[#484848] motion-safe:[animation:tabFadeIn_0.18s_ease-out_both] sm:p-5"
      >
        {activeTab === 'Description' &&
          (() => {
            const cleaned = sanitizeDescription((result as ScrapeResult & { description?: string }).description)
            if (!cleaned) {
              return (
                <p className="text-[#a3a3a3]">
                  We don&apos;t have a description for this listing. Here&apos;s the title instead:{' '}
                  {result.title ?? 'no title available.'}
                </p>
              )
            }

            const combo = extractComboItems(cleaned)
            if (!combo) return <p>{cleaned}</p>

            return (
              <div className="flex flex-col gap-4">
                {combo.remainder && <p>{combo.remainder}</p>}
                <div>
                  <p className="mb-2 text-[11px] font-semibold text-[#282828]/60">
                    What&apos;s in this combo ({combo.items.length} {combo.items.length === 1 ? 'item' : 'items'})
                  </p>
                  <ul className="flex flex-col divide-y divide-[#282828]/[0.06] overflow-hidden rounded-xl border border-[#282828]/[0.06] bg-white">
                    {combo.items.map((item, i) => (
                      <li key={i} className="flex items-center justify-between gap-4 px-3 py-2.5">
                        <span className="min-w-0 flex-1 text-[13px] font-medium text-[#282828]">{item.name}</span>
                        <span className="flex flex-none items-center gap-3 text-xs text-[#767676]">
                          {item.qty && <span>Qty {item.qty}</span>}
                          {item.mrp && (
                            <span className="font-semibold" style={{ color: NYKAA_PINK }}>
                              {fmt(item.mrp, result.currencyCode) ?? `₹${item.mrp}`}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )
          })()}

        {activeTab === 'Details' && (
          <dl className="mx-auto flex w-full max-w-xl flex-col divide-y divide-[#282828]/[0.06] text-xs">
            {result.brand && <DetailRow label="Brand" value={result.brand} />}
            {result.mpn && <DetailRow label="Model" value={result.mpn} />}
            {result.categoryPath && <DetailRow label="Category" value={result.categoryPath} />}
            {result.itemSpecifics?.map((spec) => (
              <DetailRow key={spec.name} label={spec.name} value={spec.value} />
            ))}
            {!hasSpecifics && <p className="text-[#a3a3a3]">We don&apos;t have any additional details for this listing.</p>}
          </dl>
        )}

        {activeTab === 'Shipping & Returns' && (
          <dl className="mx-auto flex w-full max-w-xl flex-col divide-y divide-[#282828]/[0.06] text-xs">
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
              <Image src={SITE_LOGOS.nykaa!} alt="Nykaa" width={70} height={16} />
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