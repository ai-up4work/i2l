// components/platforms/LenskartProductView.tsx
'use client'

import { useEffect, useState } from 'react'
import { Star, Minus, Plus, Heart, ShoppingBag, ShoppingCart, Check, Tag } from 'lucide-react'
import { formatPrice } from '@/lib/currency'
import type { ScrapeResult } from '@/lib/scrape/parsers'
import type { PlatformViewProps } from '@/lib/scrape/platform-view-props'
import ProductGallery from '@/components/stores/ProductGallery'
import RequestActionButton from '@/components/stores/RequestActionButton'
import Image from 'next/image'
import { SITE_LOGOS } from '@/lib/platform-logos'

/**
 * Lenskart look-alike view, same structural pattern as
 * FlipkartProductView / FirstCryProductView / HopscotchProductView:
 * [info / gallery / rest] grid shell, price -> variants -> stock ->
 * commerce actions inside "rest", the qty + wishlist + Add-to-Cart
 * atomic group with a separately-wrapping GET QUOTE button, and a
 * bottom-most full-width Description / Details / Shipping & Returns tab
 * switcher. Palette: navy (#000042) for price, selected pills, tab
 * indicator and GET QUOTE; dodger blue (#1E90FF) for Add to Cart, the
 * swatch selection ring, discount badge, stock text and hover accents.
 *
 * Extractor-specific behavior (see lib/scrape/extractors/lenskart.ts,
 * the source of truth — verified against two independent DevTools
 * captures of the same 15-color product, one with each color selected):
 *   - "Frame Color" and "Frame Size" options carry NO `url` — Lenskart
 *     swaps color via in-page onclick, not navigation, confirmed across
 *     both captures — so there is nothing to hand to `onSelectVariant`.
 *     Picking an option here is local UI state only (it never re-scrapes;
 *     `onSelectVariant` is intentionally unused). The choice IS reported
 *     upward through `onSelectionChange`, so the cart line carries e.g.
 *     { 'Frame Color': 'Black / Gold', 'Frame Size': 'M' }. Each option
 *     does carry a raw `variantId` off the tile's DOM id (e.g.
 *     "27481_27648") — not a URL, not yet used for anything; kept in the
 *     type for when/if a confirmed URL pattern shows up.
 *   - With 2+ color options the extractor cannot tell which one the
 *     page had selected from ARIA/class name alone — it uses a
 *     structural comparison across sibling tiles instead — so none
 *     starts highlighted until the shopper picks one IF that structural
 *     signal is ambiguous. A single option (colour or size) arrives
 *     already `selected` by elimination.
 *   - Color labels can be long: 2 segments on eyeglasses ("Black /
 *     Gold"), 5 on some sunglasses ("Black / Black / Amber Solid /
 *     Solid / Amber"). Swatches are therefore image-only with the full
 *     label in the tooltip/aria-label, and the selected label is
 *     printed on its own line under the row.
 *   - Swatch images are Lenskart's small round "bubble" PNGs. Many tiles
 *     arrive with NO image (lazy-loaded on Lenskart's side, confirmed
 *     reproducible across two captures — see the extractor header) and a
 *     derived URL can 404 — both cases fall back to a text pill carrying
 *     the color name, so a swatch is never blank.
 *   - `lowStock` can come from either a confirmed text ("Few Left" was
 *     actually present in the markup) or a structural guess (the text
 *     was blank everywhere, but one tile's flag-wrapper class was a
 *     minority among its siblings — see the extractor's
 *     detectMinorityFlag()). Both render identically here ("Few left")
 *     — the distinction matters for the extractor's confidence, not for
 *     what the shopper sees, so the view doesn't surface it.
 *   - The extractor also reports the default-selected color / size /
 *     Product Type (found structurally), size mm ranges as `subtitle`,
 *     `priceNote` ("with Free BLU lenses") and the coupon banner
 *     (`offerText`, e.g. "Use code SINGLE for this price"). The banner
 *     means the shown price may ASSUME that coupon, so it is displayed
 *     right under the price.
 *   - `brand` is frequently null — the title format it's derived from
 *     ("Hustlr - Dark Night") was NOT confirmed stable; the same product
 *     was later captured with title "Lenskart Hustlr" (no " - " at all).
 *     The Details tab simply omits the Brand row when it's null.
 *   - The result carries no description, returns policy or shipping
 *     info, so those tabs only show rows that actually have data
 *     (unlike the other views, "Returns" is NOT shown as "Not
 *     accepted" when the field is simply absent).
 */

const NAVY = '#000042'
const DODGER = '#1E90FF'

type Variants = NonNullable<ScrapeResult['variants']>
type Dimension = Variants[number]
type Option = Dimension['options'][number] & {
  lowStock?: boolean
  subtitle?: string | null
  imageIsDerived?: boolean
  // Raw DOM id off the tile, not a URL — see lenskart.ts's header.
  // Unused for now; kept so a future feature (once a real per-swatch
  // URL pattern is confirmed) doesn't need another extractor pass.
  variantId?: string | null
}
type LenskartResult = ScrapeResult & {
  styleDescription?: string | null
  priceNote?: string | null
  offerText?: string | null
  couponCode?: string | null
}

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
        {count && <span className="font-normal text-ink/40"> ({count} reviews)</span>}
      </span>
    </span>
  )
}

/** Round bubble swatch for the Frame Color dimension. Falls back to a
 * text pill with the color name when there is no image OR the image
 * fails to load (a derived URL can 404). The full label is always in the
 * tooltip/aria-label — it can be 5 segments long. */
function ColorSwatch({
  label,
  imageUrl,
  selected,
  outOfStock,
  lowStock,
  onClick,
}: {
  label: string
  imageUrl?: string | null
  selected: boolean
  outOfStock?: boolean
  lowStock?: boolean
  onClick?: () => void
}) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [imageUrl])

  const showImage = !!imageUrl && !failed
  const interactive = !!onClick && !outOfStock

  return (
    <span className="inline-flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={interactive ? onClick : undefined}
        title={outOfStock ? `${label} — out of stock` : label}
        aria-label={label}
        aria-pressed={selected}
        disabled={!interactive}
        className={
          'relative grid h-11 flex-none place-items-center overflow-hidden rounded-full border-2 bg-white shadow-sm transition-all ' +
          (showImage ? 'w-11 ' : 'min-w-11 px-3.5 ') +
          (selected
            ? 'border-[#000042] ring-2 ring-[#1E90FF] ring-offset-1 ring-offset-parchment'
            : outOfStock
              ? 'cursor-not-allowed border-white opacity-40 ring-1 ring-ink/10'
              : 'cursor-pointer border-white ring-1 ring-ink/15 hover:ring-ink/40')
        }
      >
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl!}
            alt=""
            loading="lazy"
            onError={() => setFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="max-w-[96px] truncate text-[11px] font-semibold text-ink/65">{label}</span>
        )}
      </button>
      {lowStock && !outOfStock && <span className="text-[9px] font-semibold text-amber-600">Few left</span>}
    </span>
  )
}

/** Text pill for Frame Size / Product Type. `subtitle` is the size's mm
 * range or the Product Type's descriptor. */
function VariantPill({
  label,
  subtitle,
  selected,
  outOfStock,
  lowStock,
  onClick,
}: {
  label: string
  subtitle?: string | null
  selected: boolean
  outOfStock?: boolean
  lowStock?: boolean
  onClick?: () => void
}) {
  const interactive = !!onClick && !outOfStock
  return (
    <button
      type="button"
      onClick={interactive ? onClick : undefined}
      title={outOfStock ? 'Out of stock' : subtitle ? `${label} — ${subtitle}` : undefined}
      aria-pressed={selected}
      disabled={!interactive}
      className={
        'flex flex-col items-center rounded-lg border-[1.5px] px-3.5 py-1.5 transition-colors ' +
        (selected
          ? 'border-[#000042] bg-[#000042] text-white'
          : outOfStock
            ? 'cursor-not-allowed border-ink/10 text-ink/30 line-through'
            : 'cursor-pointer border-ink/15 text-ink hover:border-[#1E90FF]')
      }
    >
      <span className="text-sm font-semibold leading-tight">{label}</span>
      {subtitle && (
        <span className={`text-[10px] font-medium leading-tight ${selected ? 'text-white/70' : 'text-ink/45'}`}>
          {subtitle}
        </span>
      )}
      {lowStock && !outOfStock && (
        <span className={`text-[9px] font-semibold leading-tight ${selected ? 'text-amber-300' : 'text-amber-600'}`}>
          Few left
        </span>
      )}
    </button>
  )
}

function VariantRow({
  dimension,
  selectedLabel,
  onChange,
}: {
  dimension: Dimension
  selectedLabel: string | null
  onChange: (label: string) => void
}) {
  const isColor = /colou?r/i.test(dimension.dimension)
  const options = dimension.options as Option[]

  return (
    <div className="min-w-0 max-w-full">
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-ink/45">{dimension.dimension}</p>

      <div className={isColor ? 'flex flex-wrap items-start gap-2.5' : 'flex flex-wrap gap-2'}>
        {options.map((opt, i) =>
          isColor ? (
            <ColorSwatch
              key={`${opt.label}-${i}`}
              label={opt.label}
              imageUrl={opt.image}
              selected={opt.label === selectedLabel}
              outOfStock={opt.outOfStock}
              lowStock={opt.lowStock}
              onClick={() => onChange(opt.label)}
            />
          ) : (
            <VariantPill
              key={`${opt.label}-${i}`}
              label={opt.label}
              subtitle={opt.subtitle}
              selected={opt.label === selectedLabel}
              outOfStock={opt.outOfStock}
              lowStock={opt.lowStock}
              onClick={() => onChange(opt.label)}
            />
          ),
        )}
      </div>

      {isColor && selectedLabel && (
        <p className="mt-1.5 break-words text-xs font-medium text-ink/55">{selectedLabel}</p>
      )}
    </div>
  )
}

/**
 * Lenskart-styled qty/wishlist/cart/request block — same shape and slot
 * as the other views' *CommerceActions: qty stepper + wishlist heart +
 * Add to Cart grouped as one flex-nowrap atomic unit, GET QUOTE as the
 * only item allowed to wrap onto its own line on mobile.
 */
function LenskartCommerceActions({
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
              className="grid h-7 w-7 place-items-center rounded-md border border-ink/15 text-ink/60 transition-colors hover:border-[#1E90FF]/50 hover:bg-[#1E90FF]/5 hover:text-[#1E90FF] active:scale-90"
            >
              <Minus size={15} />
            </button>
            <span className="min-w-[20px] text-center font-bold tabular-nums">{qty}</span>
            <button
              type="button"
              aria-label="Increase quantity"
              onClick={() => onQtyChange(qty + 1)}
              className="grid h-7 w-7 place-items-center rounded-md border border-ink/15 text-ink/60 transition-colors hover:border-[#1E90FF]/50 hover:bg-[#1E90FF]/5 hover:text-[#1E90FF] active:scale-90"
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
            color={DODGER}
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
          color={NAVY}
          disabledColor="#c7c7c7"
          className="grow basis-full whitespace-nowrap rounded-xl px-5 py-3 text-sm font-bold text-white hover:brightness-110 sm:grow-0 sm:basis-auto"
        >
          GET QUOTE
        </RequestActionButton>
      </div>

      <p className="text-xs text-ink/40">You will not be charged now. This is just a request.</p>
    </div>
  )
}

/* ---------------------------------------------------------------------
 * ProductInfoTabs — Description / Details / Shipping & Returns, navy
 * active indicator, bottom-most full-width section. Rows only render
 * when the scrape actually produced data for them.
 * ------------------------------------------------------------------- */

const INFO_TABS = ['Description', 'Details', 'Shipping & Returns'] as const
type InfoTab = (typeof INFO_TABS)[number]

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="flex-none font-semibold text-ink/70">{label}</dt>
      <dd className="text-right text-ink/55">{value}</dd>
    </div>
  )
}

function ProductInfoTabs({
  result,
  selectedByDimension,
}: {
  result: LenskartResult
  selectedByDimension: Record<string, string>
}) {
  const [activeTab, setActiveTab] = useState<InfoTab>('Description')

  const description = result.description?.trim() || null
  const style = result.styleDescription?.trim() || null
  const chosenVariantRows = (result.variants ?? [])
    .map((dim) => {
      const chosen = selectedByDimension[dim.dimension]
      const opt = (dim.options as Option[]).find((o) => o.label === chosen)
      return { name: dim.dimension, value: chosen ? (opt?.subtitle ? `${chosen} (${opt.subtitle})` : chosen) : '' }
    })
    .filter((r) => !!r.value)

  const hasDetails =
    !!result.brand || !!style || !!result.mpn || !!result.categoryPath || !!result.itemSpecifics?.length || chosenVariantRows.length > 0

  const hasReturns = result.returnsAccepted != null

  return (
    <div className="mt-8 border-t border-ink/10 pt-6">
      <div className="flex gap-5 border-b border-ink/10">
        {INFO_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`-mb-px border-b-2 pb-2.5 text-sm font-semibold transition-colors ${
              activeTab === tab ? 'border-[#000042] text-ink' : 'border-transparent text-ink/40 hover:text-ink/70'
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
          (description ? (
            <p>{description}</p>
          ) : style ? (
            <p>
              {[result.brand, style].filter(Boolean).join(' — ')}
              <span className="mt-2 block text-ink/45">Lenskart doesn&apos;t provide a longer description for this listing.</span>
            </p>
          ) : (
            <p className="text-ink/45">
              We don&apos;t have a description for this listing. Here&apos;s the title instead:{' '}
              {result.title ?? 'no title available.'}
            </p>
          ))}

        {activeTab === 'Details' &&
          (hasDetails ? (
            <dl className="flex flex-col gap-1.5 text-xs">
              {result.brand && <DetailRow label="Brand" value={result.brand} />}
              {style && <DetailRow label="Style" value={style} />}
              {chosenVariantRows.map((row) => (
                <DetailRow key={row.name} label={row.name} value={row.value} />
              ))}
              {result.mpn && <DetailRow label="Model" value={result.mpn} />}
              {result.categoryPath && <DetailRow label="Category" value={result.categoryPath} />}
              {result.itemSpecifics?.map((spec) => (
                <DetailRow key={spec.name} label={spec.name} value={spec.value} />
              ))}
            </dl>
          ) : (
            <p className="text-ink/45">We don&apos;t have any additional details for this listing.</p>
          ))}

        {activeTab === 'Shipping & Returns' &&
          (result.itemLocation || hasReturns || result.availability ? (
            <dl className="flex flex-col gap-1.5 text-xs">
              {result.itemLocation && <DetailRow label="Ships from" value={result.itemLocation} />}
              {hasReturns && (
                <DetailRow
                  label="Returns"
                  value={
                    result.returnsAccepted
                      ? `Accepted${result.returnPeriodDays ? ` within ${result.returnPeriodDays} days` : ''}`
                      : 'Not accepted'
                  }
                />
              )}
              {result.availability && <DetailRow label="Availability" value={result.availability} />}
            </dl>
          ) : (
            <p className="text-ink/45">We don&apos;t have shipping or return details for this listing.</p>
          ))}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------
 * Main component
 * ------------------------------------------------------------------- */

export default function LenskartProductView({
  result: baseResult,
  // Lenskart options have no url — picking one is local UI state only,
  // so there is nothing to re-scrape. See the file header.
  onSelectVariant: _onSelectVariant,
  onSelectionChange,
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
  const result = baseResult as LenskartResult
  const images = result.images ?? []
  const variants = result.variants ?? []

  const [selectedByDimension, setSelectedByDimension] = useState<Record<string, string>>({})

  useEffect(() => {
    const initial: Record<string, string> = {}
    for (const dim of result.variants ?? []) {
      const selectedOpt = dim.options.find((o) => o.selected)
      if (selectedOpt) initial[dim.dimension] = selectedOpt.label
    }
    setSelectedByDimension(initial)
  }, [result.url, result.variants])

  // Report the shopper's choice upward so the cart line / quote header
  // carry it. Skipped while nothing is selected (2+ colors, none picked).
  // Deliberately keyed on the selection only — `onSelectionChange` is a
  // fresh function every parent render and would re-fire this endlessly.
  useEffect(() => {
    if (Object.keys(selectedByDimension).length) onSelectionChange?.(selectedByDimension)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedByDimension])

  function pickOption(dimension: string, label: string) {
    setSelectedByDimension((prev) => ({ ...prev, [dimension]: label }))
  }

  const price = fmt(result.price, result.currencyCode)
  const mrp = result.mrp && result.mrp !== result.price ? fmt(result.mrp, result.currencyCode) : null

  // Prefer the page's own "(NN% OFF)" figure; fall back to computing it.
  const computedPct =
    result.mrp && result.price && Number(result.mrp) > Number(result.price)
      ? Math.round((1 - Number(result.price) / Number(result.mrp)) * 100)
      : null
  const pctOff = mrp ? (result.discountPercentage ?? computedPct) : null

  const inStock = result.unavailable
    ? false
    : result.availability
      ? !/sold out|out of stock|unavailable/i.test(result.availability)
      : true

  const logo = SITE_LOGOS['lenskart']
  const styleDescription = result.styleDescription?.trim() || null

  return (
    <div className="mx-auto max-w-6xl px-6 lg:px-10">
      <div className="grid gap-8 [grid-template-areas:'info'_'gallery'_'rest'] sm:grid-cols-2 sm:[grid-template-areas:'gallery_info'_'gallery_rest']">
        {/* Top of buy box: logo + brand + rating, then title + style.
            Mobile: first (area "info"). Desktop: top-right column. */}
        <div className="min-w-0 [grid-area:info]">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-ink/50">
            <a href={result.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center">
              {logo ? (
                <Image src={logo} alt="Lenskart" width={80} height={16} />
              ) : (
                <span className="text-sm font-extrabold tracking-tight text-[#000042]">lenskart</span>
              )}
            </a>
            {result.rating && (
              <>
                <span className="text-ink/20">·</span>
                <RatingStars rating={result.rating} count={result.review_count} />
              </>
            )}
          </div>

          <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
            {result.title ?? <span className="italic text-ink/40">No title found</span>}
          </h1>
          {/* Lenskart's h1 is often just the brand ("Lenskart Hustlr");
              the colour + shape line under it is what tells products apart. */}
          {styleDescription && <p className="mt-1 text-sm font-medium text-ink/55">{styleDescription}</p>}
        </div>

        {/* Image gallery — shared component, Lenskart theme.
            Mobile: second (area "gallery"). Desktop: left column,
            spanning both rows. */}
        <div className="min-w-0 [grid-area:gallery]">
          <ProductGallery
            images={images}
            title={result.title}
            resetKey={result.url}
            theme={{
              frameBorder: 'border-ink/10',
              activeThumb: 'border-[#000042] ring-1 ring-[#000042]',
              restingThumb: 'border-ink/10',
              placeholderText: 'text-ink/40',
            }}
          />
        </div>

        {/* Rest of buy box: price -> variants -> stock -> commerce
            actions. Mobile: third (area "rest"). Desktop: bottom-right. */}
        <div className="min-w-0 [grid-area:rest]">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            {price ? (
              <p className="text-3xl font-bold text-[#000042]">{price}</p>
            ) : (
              <p className="text-base font-semibold text-ink/40">No price found</p>
            )}
            {mrp && <p className="text-base font-semibold text-ink/40 line-through">{mrp}</p>}
            {mrp && pctOff != null && (
              <span className="rounded bg-[#1E90FF]/10 px-1.5 py-0.5 text-xs font-bold text-[#1E90FF]">{pctOff}% OFF</span>
            )}
          </div>
          {result.priceNote && <p className="mt-0.5 text-xs font-medium text-ink/50">{result.priceNote}</p>}

          {result.offerText && (
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-[#1E90FF]/[0.07] px-3 py-2 text-sm font-medium text-[#000042] ring-1 ring-inset ring-[#1E90FF]/20">
              <Tag size={14} className="mt-0.5 flex-none text-[#1E90FF]" />
              <span>{result.offerText}</span>
            </div>
          )}

          {!!variants.length && (
            <div className="mt-4 flex flex-wrap gap-x-8 gap-y-5">
              {variants.map((dim) => (
                <VariantRow
                  key={dim.dimension}
                  dimension={dim}
                  selectedLabel={selectedByDimension[dim.dimension] ?? null}
                  onChange={(label) => pickOption(dim.dimension, label)}
                />
              ))}
            </div>
          )}

          <p className="mt-5 text-sm font-semibold">
            {result.unavailable ? (
              <span className="text-ink/45">Currently unavailable</span>
            ) : inStock ? (
              <span className="text-[#1E90FF]">In stock</span>
            ) : (
              <span className="text-ink/45">{result.availability}</span>
            )}
          </p>

          <LenskartCommerceActions
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
      <ProductInfoTabs result={result} selectedByDimension={selectedByDimension} />
    </div>
  )
}