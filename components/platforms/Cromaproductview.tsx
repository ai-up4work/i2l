// components/platforms/Cromaproductview.tsx
'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { Star, Minus, Plus, Heart, ShoppingBag, ShoppingCart, Check, FileText } from 'lucide-react'
import { formatPrice } from '@/lib/currency'
import type { ScrapeResult } from '@/lib/scrape/parsers'
import type { PlatformViewProps } from '@/lib/scrape/platform-view-props'
import ProductGallery from '@/components/stores/ProductGallery'
import RequestActionButton from '@/components/stores/RequestActionButton'
import Image from 'next/image'
import { SITE_LOGOS } from '@/lib/platform-logos'

/**
 * Croma-styled product view. Follows the SAME structural skeleton as
 * AmazonProductView / FlipkartProductView / MyntraProductView /
 * FirstCryProductView — shared ProductGallery + buy box in a
 * grid-area layout (info/gallery/rest, reordered on mobile so info ->
 * gallery -> rest stacks, gallery spans both rows on sm+), *CommerceActions
 * row in the same qty-stepper -> wishlist -> Add to Cart -> Get Quote
 * shape, and a bottom-most full-width ProductInfoTabs section — just
 * restyled with Croma's own blue/orange brand language.
 *
 * Croma-specific extractor shape handled here (see the sample scrape
 * payload this view was built against):
 *   - `keyFeatures`: string[] — short bullet highlights, shown as a
 *     bulleted list at the top of the Description tab, above the
 *     free-text description.
 *   - `itemSpecifics`: {name, value}[] — Croma's long flat spec table
 *     (dimensions, warranty, country of origin, support contacts,
 *     etc). Rendered in the Details tab. Because Croma's extractor can
 *     emit duplicate `name` keys (see legalInfo overlap below), rows
 *     are keyed by index, not by name.
 *   - `legalInfo`: {name, value}[] — manufacturer/importer & country
 *     of origin subset, folded into the tail of the Details tab under
 *     its own "Legal & Compliance" heading rather than re-shown from
 *     itemSpecifics a second time.
 *   - `manualUrl`: a direct link to the product's user manual PDF —
 *     shown as a small link under the title when present.
 *   - `warning`: an extractor-only QA note (head/body metadata
 *     mismatch) — deliberately never rendered to end users.
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

function CromaRatingStars({ rating, count }: { rating: string | null | undefined; count?: string | null }) {
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
            className={i < rounded ? 'fill-[#F58220] text-[#F58220]' : 'fill-transparent text-ink/20'}
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

/** Square image tile for a variant option — Croma-blue selected ring.
 * Deliberately NON-INTERACTIVE: the extractor never has a per-option URL
 * for Croma (selecting a different size/finish re-navigates via
 * in-page JS this scrape can't see — see croma.ts's VARIANT PICKER
 * note), so rendering these as buttons that silently do nothing on
 * click would be misleading. They show what's available and which one
 * is currently loaded, nothing more. */
function CromaVariantTile({
  label,
  imageUrl,
  selected,
  outOfStock,
}: {
  label: string
  imageUrl?: string | null
  selected: boolean
  outOfStock?: boolean
}) {
  if (imageUrl) {
    return (
      <span className="inline-flex flex-col items-center gap-1" title={outOfStock ? `${label} — out of stock` : label}>
        <span
          className={
            'relative h-14 w-14 flex-none overflow-hidden rounded-xl border-[1.5px] bg-cover bg-center bg-[#f5f7fa] ' +
            (selected ? 'border-[#0056A4] ring-1 ring-[#0056A4]' : outOfStock ? 'border-ink/10 opacity-50' : 'border-ink/15')
          }
          style={{ backgroundImage: `url(${imageUrl})` }}
        >
          {outOfStock && (
            <span className="absolute inset-x-0 bottom-0 bg-black/70 py-0.5 text-center text-[7px] font-bold uppercase tracking-wide text-white">
              Out of stock
            </span>
          )}
        </span>
      </span>
    )
  }

  return (
    <span
      title={outOfStock ? `${label} — out of stock` : label}
      className={
        'flex items-center rounded-lg border-[1.5px] px-2.5 py-1.5 text-xs font-medium ' +
        (selected
          ? 'border-[#0056A4] bg-[#0056A4]/[0.06] text-ink'
          : outOfStock
            ? 'border-ink/10 text-ink/30 line-through'
            : 'border-ink/15 text-ink/70')
      }
    >
      {label}
    </span>
  )
}

/**
 * Croma-styled qty/wishlist/cart/request block — same shape and slot
 * as the sibling *CommerceActions components (qty stepper + wishlist +
 * Add to Cart as one atomic flex-nowrap group, Get Quote the only
 * thing allowed to wrap onto its own line on mobile).
 */
function CromaCommerceActions({
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
          <div className="flex flex-none items-center gap-3.5 rounded-xl border border-ink/15 px-2.5 py-1.5">
            <button
              type="button"
              aria-label="Decrease quantity"
              onClick={() => onQtyChange(Math.max(1, qty - 1))}
              className="grid h-7 w-7 place-items-center rounded-md border border-ink/15 text-ink/60 transition-colors hover:border-[#0056A4]/40 hover:bg-[#0056A4]/5 hover:text-[#0056A4] active:scale-90"
            >
              <Minus size={15} />
            </button>
            <span className="min-w-[20px] text-center font-bold tabular-nums">{qty}</span>
            <button
              type="button"
              aria-label="Increase quantity"
              onClick={() => onQtyChange(qty + 1)}
              className="grid h-7 w-7 place-items-center rounded-md border border-ink/15 text-ink/60 transition-colors hover:border-[#0056A4]/40 hover:bg-[#0056A4]/5 hover:text-[#0056A4] active:scale-90"
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
            color="#0056A4"
            disabledColor="#c7c7c7"
            className="flex-1 whitespace-nowrap rounded-xl px-5 py-3 text-sm font-bold text-white hover:brightness-95"
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
          color="#F58220"
          disabledColor="#c7c7c7"
          className="grow basis-full whitespace-nowrap rounded-xl px-5 py-3 text-sm font-bold text-white hover:brightness-95 sm:grow-0 sm:basis-auto"
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
 * tab-switcher shape as the sibling views, recolored Croma-blue, plus
 * Croma's keyFeatures bullets (Description tab) and itemSpecifics +
 * legalInfo (Details tab), which the other platforms don't carry.
 * ------------------------------------------------------------------- */

const INFO_TABS = ['Description', 'Details', 'Shipping & Returns'] as const
type InfoTab = (typeof INFO_TABS)[number]

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 rounded-lg px-2 py-1.5 transition-colors hover:bg-ink/[0.03]">
      <dt className="text-ink/50">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  )
}

// Croma's own extractor is prone to repeating the same fact under two
// spec names (e.g. "Brand" AND "Brand" again a few rows down, "Model
// Number" duplicating "Model Series"/"MPN"). Rather than trust the raw
// list, this folds duplicates by normalized label — first occurrence
// wins — and also drops any spec whose label already has its own row
// above (Brand/Model/Category), so nothing repeats in the panel.
function dedupeSpecs(
  specs: { name: string; value: string }[],
  alreadyShown: string[]
): { name: string; value: string }[] {
  const seen = new Set(alreadyShown.map((s) => s.trim().toLowerCase()))
  const out: { name: string; value: string }[] = []
  for (const spec of specs) {
    const key = spec.name.trim().toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(spec)
  }
  return out
}

// Sliding pill indicator behind the active tab, measured from the real
// button rects so it stays exact regardless of label width.
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

function ProductInfoTabs({
  result,
  keyFeatures,
  itemSpecifics,
  legalInfo,
}: {
  result: ScrapeResult
  keyFeatures?: string[] | null
  itemSpecifics?: { name: string; value: string }[] | null
  legalInfo?: { name: string; value: string }[] | null
}) {
  const [activeTab, setActiveTab] = useState<InfoTab>('Description')
  const { railRef, btnRefs, style: indicatorStyle } = useSlidingIndicator(activeTab)

  const description = (result as ScrapeResult & { description?: string }).description
  const manualRows = [result.brand && 'Brand', result.mpn && 'Model', result.categoryPath && 'Category'].filter(
    Boolean
  ) as string[]
  const specs = dedupeSpecs(itemSpecifics ?? [], manualRows)
  const hasSpecifics = specs.length > 0
  const hasLegal = !!legalInfo?.length

  return (
    <div className="mt-8 border-t border-ink/10 pt-6">
      <div
        ref={railRef}
        className="relative inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-ink/[0.035] p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {indicatorStyle && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-1 rounded-full bg-parchment shadow-[0_1px_2px_rgba(0,0,0,0.08)] ring-1 ring-inset ring-ink/[0.06] transition-[transform,width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
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
              activeTab === tab ? 'text-ink' : 'text-ink/45 hover:text-ink/70'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div
        key={activeTab}
        className="mt-4 min-h-[96px] rounded-2xl border border-ink/[0.06] bg-ink/[0.015] p-4 text-sm leading-relaxed text-ink/70 motion-safe:[animation:tabFadeIn_0.18s_ease-out_both] sm:p-5"
      >
        {activeTab === 'Description' && (
          <div className="flex flex-col gap-4">
            {!!keyFeatures?.length && (
              <ul className="flex flex-col gap-1.5">
                {keyFeatures.map((feat, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px]">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-[#0056A4]" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            )}
            {description ? (
              <p>{description}</p>
            ) : (
              !keyFeatures?.length && (
                <p className="text-ink/45">
                  We don&apos;t have a description for this listing. Here&apos;s the title instead:{' '}
                  {result.title ?? 'no title available.'}
                </p>
              )
            )}
          </div>
        )}

        {activeTab === 'Details' && (
          <div className="flex flex-col gap-5">
            {/* Capped to a readable column instead of stretching label
                and value across the whole panel width on wide screens. */}
            <dl className="mx-auto flex w-full max-w-xl flex-col divide-y divide-ink/[0.06] text-xs">
              {result.brand && <DetailRow label="Brand" value={result.brand} />}
              {result.mpn && <DetailRow label="Model" value={result.mpn} />}
              {result.categoryPath && <DetailRow label="Category" value={result.categoryPath} />}
              {hasSpecifics && specs.map((spec, i) => <DetailRow key={`${spec.name}-${i}`} label={spec.name} value={spec.value} />)}
              {!result.brand && !result.mpn && !hasSpecifics && (
                <p className="text-ink/45">We don&apos;t have any additional details for this listing.</p>
              )}
            </dl>

            {hasLegal && (
              <div className="mx-auto w-full max-w-xl">
                <p className="mb-2 text-[11px] font-semibold text-ink/45">Legal &amp; compliance</p>
                <dl className="flex flex-col divide-y divide-ink/[0.06] rounded-xl border border-ink/[0.06] bg-parchment px-1 text-xs">
                  {legalInfo!.map((row, i) => (
                    <DetailRow key={`${row.name}-${i}`} label={row.name} value={row.value} />
                  ))}
                </dl>
              </div>
            )}
          </div>
        )}

        {activeTab === 'Shipping & Returns' && (
          <dl className="mx-auto flex w-full max-w-xl flex-col divide-y divide-ink/[0.06] text-xs">
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
                <p className="mt-1 text-ink/45">We don&apos;t have shipping details from the seller for this listing.</p>
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

export default function CromaProductView({
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
}: PlatformViewProps) {
  const images = result.images ?? []

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

  // Croma-only extractor fields, not part of the shared ScrapeResult
  // shape the other platforms rely on.
  const keyFeatures = (result as any).keyFeatures as string[] | null | undefined
  const itemSpecifics = (result as any).itemSpecifics as { name: string; value: string }[] | null | undefined
  const legalInfo = (result as any).legalInfo as { name: string; value: string }[] | null | undefined
  const manualUrl = (result as any).manualUrl as string | null | undefined

  const cromaLogo = SITE_LOGOS.croma

  return (
    <div className="mx-auto max-w-6xl px-6 lg:px-10">
      <div
        className="grid gap-8 [grid-template-areas:'info'_'gallery'_'rest'] sm:grid-cols-2 sm:[grid-template-areas:'gallery_info'_'gallery_rest']"
      >
        {/* Top of buy box: logo + rating, then title + manual link.
            Mobile: first (area "info"). Desktop: top-right column. */}
        <div className="min-w-0 [grid-area:info]">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-ink/50">
            <a href={result.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center">
              {cromaLogo ? (
                <Image src={cromaLogo} alt="Croma" width={70} height={16} />
              ) : (
                <span className="rounded-full bg-card px-2 py-0.5 text-[#0056A4] ring-1 ring-inset ring-ink/10">Croma</span>
              )}
            </a>
            {result.rating && (
              <>
                <span className="text-ink/20">·</span>
                <CromaRatingStars rating={result.rating} count={result.review_count} />
              </>
            )}
          </div>

          <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
            {result.title ?? <span className="italic text-ink/40">No title found</span>}
          </h1>

          {manualUrl && (
            <a
              href={manualUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-[#0056A4] hover:underline"
            >
              <FileText size={12} />
              View user manual
            </a>
          )}
        </div>

        {/* Image gallery — shared component, Croma theme.
            Mobile: second (area "gallery"). Desktop: left column,
            spanning both rows since "gallery" repeats in both area rows. */}
        <div className="min-w-0 [grid-area:gallery]">
          <ProductGallery
            images={images}
            title={result.title}
            resetKey={result.url}
            theme={{
              frameBorder: 'border-ink/10',
              activeThumb: 'border-[#0056A4] ring-1 ring-[#0056A4]',
              restingThumb: 'border-ink/10',
              placeholderText: 'text-ink/40',
            }}
          />
        </div>

        {/* Rest of buy box: price -> variants -> stock -> commerce
            actions. Mobile: third (area "rest"). Desktop: bottom-right
            column. */}
        <div className="min-w-0 [grid-area:rest]">
          <div className="flex flex-wrap items-baseline gap-2.5">
            {price ? (
              <p className="text-3xl font-bold text-ink">{price}</p>
            ) : (
              <p className="text-base font-semibold text-ink/40">No price found</p>
            )}
            {mrp && <p className="text-base font-semibold text-ink/40 line-through">{mrp}</p>}
            {pctOff !== null && <span className="text-sm font-bold text-[#F58220]">{pctOff}% off</span>}
          </div>

          {!!result.variants?.length && (
            <div className="mt-4 flex flex-col gap-4">
              {result.variants.map((dim) => (
                <div key={dim.dimension}>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-ink/45">{dim.dimension}</p>
                  <div className={dim.options.some((o) => !!o.image) ? 'flex flex-wrap gap-3' : 'flex flex-wrap gap-1.5'}>
                    {dim.options.map((opt, i) => (
                      <CromaVariantTile
                        key={`${opt.label}-${i}`}
                        label={opt.label}
                        imageUrl={opt.image}
                        selected={!!opt.selected}
                        outOfStock={!!opt.outOfStock}
                      />
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11px] text-ink/40">Shown for reference — open the listing on Croma to switch.</p>
                </div>
              ))}
            </div>
          )}

          <p className="mt-5 text-sm font-semibold">
            {result.unavailable ? (
              <span className="text-rose-600">Sold Out</span>
            ) : inStock ? (
              <span className="text-emerald-600">In stock</span>
            ) : (
              <span className="text-ink/45">{result.availability}</span>
            )}
          </p>

          <CromaCommerceActions
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
      <ProductInfoTabs result={result} keyFeatures={keyFeatures} itemSpecifics={itemSpecifics} legalInfo={legalInfo} />
    </div>
  )
}