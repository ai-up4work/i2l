// components/platforms/AjioProductView.tsx
'use client'

import { useEffect, useState } from 'react'
import {
  Star,
  PackageX,
  Minus,
  Plus,
  Heart,
  ShoppingBag,
  ShoppingCart,
  Check,
  Tag,
  ChevronDown,
  Copy,
  CopyCheck,
  Ruler,
  X,
  Flame,
  Zap,
} from 'lucide-react'
import { formatPrice } from '@/lib/currency'
import type { ScrapeResult } from '@/lib/scrape/parsers'
import type { PlatformViewProps } from '@/lib/scrape/platform-view-props'
import ProductGallery from '@/components/stores/ProductGallery'
import RequestActionButton from '@/components/stores/RequestActionButton'
import Image from 'next/image'
import { SITE_LOGOS } from '@/lib/platform-logos'

/**
 * Renders a scrape result using the SAME structural layout as
 * AmazonProductView / FlipkartProductView / MyntraProductView /
 * NykaaProductView — gallery (shared ProductGallery component) + buy
 * box side by side (max-w-6xl), buy box ordered as
 * platform/rating -> brand + title -> seller -> price -> offers ->
 * option chips -> size row (+ size chart) -> stock -> urgency ->
 * AjioCommerceActions, then a bottom-most full-width ProductInfoTabs
 * section — but restyled with Ajio's own visual language:
 *   - slate-navy (#2C4152) primary CTA, rating pill and active tab
 *     indicator, matching the real ajio.com PDP
 *   - orange "(X% OFF)" discount tag next to a struck-through MRP,
 *     with "Inclusive of all taxes" under the price
 *   - brand rendered bold on its own line above the product name
 *     (Ajio's PDP convention), not inline in the title
 *   - round size bubbles (h-9 w-9); Color dimension renders as swatch
 *     thumbnails instead, matching ajio.com's own convention
 *
 * Ajio-specific extractor behavior preserved (see
 * lib/scrape/extractors/ajio.ts for the source of truth):
 *   - Size tiles never carry a per-size `url`, so they are
 *     informational only — there is nothing to re-scrape on click.
 *     Tiles only become clickable if an option DOES resolve a url.
 *   - `result.options` (flat label -> value pairs) is still shown as
 *     small chips under the price.
 *   - The "Listing appears unavailable" banner is kept above the grid.
 *
 * Now also surfaces fields the extractor returns but the view
 * previously dropped on the floor:
 *   - `offers` (coupon / payment offers) — collapsible strip under price
 *   - `legalInfo` — merged into the Details tab
 *   - `sizeChart` — "Size Chart" trigger opens a measurement table modal
 *   - `discountPercentage` — used as a fallback when price/mrp math
 *     can't produce a percentage itself
 *   - variant `image` (color swatches) — Color dimension renders
 *     thumbnails instead of text bubbles
 *   - `stockLevel` / `lowStock` per size option — low-stock dot + tooltip
 *   - `quantityAvailable` — shown as a small caption under stock status
 *   - `urgencyTag` — small badge next to stock status when present
 *
 * LAYOUT ON MOBILE (<sm): same grid-template-areas reflow as the other
 * views — info (badge/title) above gallery, above the rest of the buy
 * box (seller/price/options/sizes/stock/commerce actions).
 */

const AJIO_INK = '#2C4152'
const AJIO_ORANGE = '#E86B2D'

function fmt(amount: string | null | undefined, currency: string | null | undefined) {
  const n = amount != null ? Number(amount) : NaN
  if (Number.isNaN(n)) return null
  try {
    return formatPrice(n, currency ?? 'LKR')
  } catch {
    return `${currency ?? ''} ${n}`.trim()
  }
}

function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Ajio's rating pill — navy, white star + numeric rating + review count. */
function AjioRatingBadge({ rating, count }: { rating: string | null | undefined; count?: string | null }) {
  const value = rating ? parseFloat(rating) : NaN
  if (Number.isNaN(value)) return null
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-bold text-white"
      style={{ backgroundColor: AJIO_INK }}
    >
      {value.toFixed(1)}
      <Star size={10} className="fill-white text-white" strokeWidth={0} />
      {count && <span className="ml-0.5 font-normal text-white/80">| {count}</span>}
    </span>
  )
}

/** Round size bubble. Informational unless the option resolves a url
 * (Ajio's extractor doesn't give sizes one, so normally it isn't).
 * Carries an optional low-stock dot fed by the option's `lowStock`
 * flag, with the exact `stockLevel` in the tooltip when known. */
function AjioSizeBubble({
  label,
  selected,
  outOfStock,
  lowStock,
  stockLevel,
  onClick,
  disabledTitle,
}: {
  label: string
  selected: boolean
  outOfStock?: boolean
  lowStock?: boolean
  stockLevel?: number | null
  onClick?: () => void
  disabledTitle?: string
}) {
  const interactive = !!onClick && !outOfStock
  const title = outOfStock
    ? 'Out of stock'
    : lowStock
      ? `Low stock${stockLevel != null ? ` — ${stockLevel} left` : ''}`
      : disabledTitle

  return (
    <button
      type="button"
      onClick={interactive ? onClick : undefined}
      title={title}
      aria-pressed={selected}
      disabled={!interactive}
      className={`relative grid h-9 min-w-9 place-items-center rounded-full border px-2 text-xs font-bold transition-colors ${
        selected
          ? 'text-white'
          : outOfStock
            ? 'cursor-not-allowed border-[#e6e6e6] text-[#c7c7c7] line-through'
            : interactive
              ? 'cursor-pointer border-[#cfcfcf] text-[#2c4152] hover:border-[#2c4152]'
              : 'cursor-default border-[#cfcfcf] text-[#2c4152]/70'
      }`}
      style={selected ? { backgroundColor: AJIO_INK, borderColor: AJIO_INK } : undefined}
    >
      {label}
      {!outOfStock && lowStock && (
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border border-white"
          style={{ backgroundColor: AJIO_ORANGE }}
        />
      )}
    </button>
  )
}

/** Color swatch thumbnail — Ajio renders color options as small square
 * swatches rather than text bubbles. Falls back to a text bubble if the
 * option has no image (defensive; the extractor always supplies one). */
function AjioColorSwatch({
  label,
  image,
  selected,
  outOfStock,
  onClick,
  disabledTitle,
}: {
  label: string
  image?: string | null
  selected: boolean
  outOfStock?: boolean
  onClick?: () => void
  disabledTitle?: string
}) {
  const interactive = !!onClick && !outOfStock

  if (!image) {
    return (
      <AjioSizeBubble
        label={label}
        selected={selected}
        outOfStock={outOfStock}
        onClick={onClick}
        disabledTitle={disabledTitle}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={interactive ? onClick : undefined}
      title={outOfStock ? `${label} — out of stock` : disabledTitle ?? label}
      aria-pressed={selected}
      disabled={!interactive}
      className={`group grid place-items-center rounded-full p-0.5 transition-colors ${
        selected ? 'ring-2' : 'ring-1 ring-[#e6e6e6] hover:ring-[#2c4152]/60'
      } ${outOfStock ? 'cursor-not-allowed opacity-40' : interactive ? 'cursor-pointer' : 'cursor-default'}`}
      style={selected ? ({ '--tw-ring-color': AJIO_INK } as React.CSSProperties) : undefined}
    >
      <span className="relative block h-8 w-8 overflow-hidden rounded-full border border-[#e6e6e6] bg-[#fafafa]">
        <Image src={image} alt={label} fill sizes="32px" className="object-cover" />
        {outOfStock && <span className="absolute inset-0 rotate-45 border-t border-[#c7c7c7]" aria-hidden />}
      </span>
    </button>
  )
}

/** Collapsible "Offers" strip fed by `result.offers` (coupon + payment
 * offers). Closed by default; opens to a scoped list with a copy
 * affordance on coupon codes. */
function AjioOffers({ offers }: { offers: ScrapeResult['offers'] }) {
  const [open, setOpen] = useState(false)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  if (!offers || offers.length === 0) return null

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedCode(code)
      setTimeout(() => setCopiedCode((c) => (c === code ? null : c)), 1500)
    } catch {
      // Clipboard API unavailable — silently ignore, code is still visible to copy by hand.
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-[#e6e6e6]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left"
      >
        <span className="inline-flex items-center gap-2 text-[13px] font-bold text-[#2c4152]">
          <Tag size={14} style={{ color: AJIO_ORANGE }} />
          {offers.length} offer{offers.length === 1 ? '' : 's'} available
        </span>
        <ChevronDown
          size={16}
          className={`flex-none text-[#8a8a8a] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <ul className="flex flex-col gap-2.5 border-t border-[#e6e6e6] px-3.5 py-3">
          {offers.map((offer, i) => {
            const endsAt = fmtDate(offer.endsAt)
            return (
              <li key={`${offer.code ?? offer.description}-${i}`} className="flex items-start gap-2.5 text-xs">
                <Tag size={13} className="mt-0.5 flex-none" style={{ color: AJIO_ORANGE }} />
                <div className="min-w-0">
                  <p className="text-[#484848]">{offer.description}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-[#8a8a8a]">
                    {offer.code && (
                      <button
                        type="button"
                        onClick={() => copyCode(offer.code!)}
                        className="inline-flex items-center gap-1 rounded border border-dashed border-[#cfcfcf] px-1.5 py-0.5 font-mono font-semibold text-[#2c4152] hover:border-[#2c4152]"
                      >
                        {offer.code}
                        {copiedCode === offer.code ? (
                          <CopyCheck size={11} className="text-[#1E7E34]" />
                        ) : (
                          <Copy size={11} />
                        )}
                      </button>
                    )}
                    {offer.minOrder != null && <span>· Min order ₹{offer.minOrder}</span>}
                    {offer.maxSaving != null && <span>· Save up to ₹{offer.maxSaving}</span>}
                    {offer.newUsersOnly && <span>· New users only</span>}
                    {endsAt && <span>· Ends {endsAt}</span>}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** Size chart trigger + modal, fed by `result.sizeChart`. Renders each
 * chart's own header/row grid as a scrollable table. */
function AjioSizeChart({ sizeChart }: { sizeChart: ScrapeResult['sizeChart'] }) {
  const [open, setOpen] = useState(false)

  if (!sizeChart || sizeChart.length === 0) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide underline underline-offset-2"
        style={{ color: AJIO_INK }}
      >
        <Ruler size={12} />
        Size Chart
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#2c4152]">Size Chart</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close size chart"
                className="grid h-7 w-7 place-items-center rounded-full text-[#8a8a8a] hover:bg-[#fafafa] hover:text-[#2c4152]"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-5">
              {sizeChart.map((chart, ci) => (
                <div
                  key={`${'title' in chart ? chart.title : undefined}-${ci}`}
                  className="overflow-x-auto"
                >
                  {'title' in chart && chart.title && (
                    <p className="mb-2 text-xs font-semibold text-[#767676]">{chart.title}</p>
                  )}
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr>
                        {'headers' in chart && chart.headers.map((h) => (
                          <th
                            key={h}
                            className="whitespace-nowrap border-b border-[#e6e6e6] px-2 py-1.5 text-left font-bold text-[#2c4152]"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {chart.rows.map((row, ri) => (
                        <tr key={ri} className={ri % 2 === 1 ? 'bg-[#fafafa]' : undefined}>
                          {(Array.isArray(row) ? row : [row]).map((cell, cellI) => (
                            <td key={cellI} className="whitespace-nowrap px-2 py-1.5 text-[#484848]">
                              {cell != null && typeof cell === 'object'
                                ? Object.values(cell).map(String).join(' / ')
                                : cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/**
 * Ajio-styled qty/wishlist/cart/request block — identical shape and
 * slot to AmazonCommerceActions/MyntraCommerceActions/
 * NykaaCommerceActions (qty stepper, wishlist heart, Add to Bag, Get
 * Quote, all inline in one wrapping row), in Ajio's navy/red palette.
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
    <div className="mt-6 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Atomic group: qty stepper + wishlist + Add to Bag. Never
            splits across lines — flex-nowrap keeps it as one unit for
            the outer row's wrap decision. */}
        <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-2">
          <div className="flex flex-none items-center gap-3.5 rounded-xl border border-[#cfcfcf] px-2.5 py-1.5">
            <button
              type="button"
              aria-label="Decrease quantity"
              onClick={() => onQtyChange(Math.max(1, qty - 1))}
              className="grid h-7 w-7 place-items-center rounded-md border border-[#cfcfcf] text-[#8a8a8a] transition-colors hover:border-[#2c4152]/40 hover:bg-[#2c4152]/5 hover:text-[#2c4152] active:scale-90"
            >
              <Minus size={15} />
            </button>
            <span className="min-w-[20px] text-center font-bold tabular-nums text-[#2c4152]">{qty}</span>
            <button
              type="button"
              aria-label="Increase quantity"
              onClick={() => onQtyChange(qty + 1)}
              className="grid h-7 w-7 place-items-center rounded-md border border-[#cfcfcf] text-[#8a8a8a] transition-colors hover:border-[#2c4152]/40 hover:bg-[#2c4152]/5 hover:text-[#2c4152] active:scale-90"
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
            className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl border border-[#cfcfcf] text-[#8a8a8a] transition-all duration-200 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
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
            color={AJIO_INK}
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
          color="#c9252b"
          disabledColor="#c7c7c7"
          className="grow basis-full whitespace-nowrap rounded-xl px-5 py-3 text-sm font-bold text-white hover:brightness-95 sm:grow-0 sm:basis-auto"
        >
          GET QUOTE
        </RequestActionButton>
      </div>

      <p className="text-xs text-[#8a8a8a]">You will not be charged now. This is just a request.</p>
    </div>
  )
}

/* ---------------------------------------------------------------------
 * ProductInfoTabs — inlined, Ajio-flavored (navy active indicator),
 * same Description / Details / Shipping & Returns structure and same
 * bottom-most full-width slot as the other platform views.
 * ------------------------------------------------------------------- */

const INFO_TABS = ['Description', 'Details', 'Shipping & Returns'] as const
type InfoTab = (typeof INFO_TABS)[number]

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="font-semibold text-[#2c4152]/80">{label}</dt>
      <dd className="text-right text-[#767676]">{value}</dd>
    </div>
  )
}

/** Drops leaked <style>/<script> blocks, tags and raw CSS rule text from
 * scraped descriptions; returns null if what's left is empty or still
 * markup-noise-heavy so the caller can show the "no description"
 * fallback. Same helper as NykaaProductView. */
function sanitizeDescription(raw: string | null | undefined): string | null {
  if (!raw) return null
  let text = raw
  text = text.replace(/<style[\s\S]*?<\/style>/gi, ' ')
  text = text.replace(/<script[\s\S]*?<\/script>/gi, ' ')
  text = text.replace(/<[^>]+>/g, ' ')
  text = text.replace(/[.#]?[a-zA-Z0-9_\-.,#:>~ \[\]="'%]+\{[^{}]*\}/g, ' ')
  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
  text = text.replace(/\s+/g, ' ').trim()

  if (!text) return null
  const noiseChars = (text.match(/[{};]/g) ?? []).length
  if (noiseChars > text.length * 0.02) return null

  return text
}

function ProductInfoTabs({ result }: { result: ScrapeResult }) {
  const [activeTab, setActiveTab] = useState<InfoTab>('Description')
  const optionEntries = Object.entries(result.options ?? {})
  const legalInfo = result.legalInfo ?? []

  return (
    <div className="mt-8 border-t border-[#e6e6e6] pt-6">
      <div className="flex gap-5 border-b border-[#e6e6e6]">
        {INFO_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`-mb-px border-b-2 pb-2.5 text-sm font-semibold transition-colors ${
              activeTab === tab ? 'text-[#2c4152]' : 'border-transparent text-[#8a8a8a] hover:text-[#2c4152]'
            }`}
            style={activeTab === tab ? { borderColor: AJIO_INK } : undefined}
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
              <p className="text-[#8a8a8a]">
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
            {optionEntries.map(([label, value]) => (
              <DetailRow key={label} label={label} value={String(value)} />
            ))}
            {result.itemSpecifics?.map((spec) => (
              <DetailRow key={spec.name} label={spec.name} value={spec.value} />
            ))}
            {legalInfo.map((info) => (
              <DetailRow key={info.name} label={info.name} value={info.value} />
            ))}
            {!result.brand &&
              !result.mpn &&
              !result.categoryPath &&
              !optionEntries.length &&
              !result.itemSpecifics?.length &&
              !legalInfo.length && (
                <p className="text-[#8a8a8a]">We don&apos;t have any additional details for this listing.</p>
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
                <p className="mt-1 text-[#8a8a8a]">
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

export default function AjioProductView({
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

  function pickOption(dimension: string, label: string, url: string | null) {
    setSelectedByDimension((prev) => ({ ...prev, [dimension]: label }))
    if (url) onSelectVariant(url)
  }

  const price = fmt(result.price, result.currencyCode)
  const mrp = result.mrp && result.mrp !== result.price ? fmt(result.mrp, result.currencyCode) : null

  // Prefer computing the live percentage off the currently selected
  // variant's price/mrp; fall back to the extractor-provided
  // `discountPercentage` only when that math isn't available (e.g. mrp
  // missing but the scraper still captured a discount elsewhere on the
  // page).
  const computedPctOff =
    result.mrp && result.price && Number(result.mrp) > Number(result.price)
      ? Math.round((1 - Number(result.price) / Number(result.mrp)) * 100)
      : null
  const pctOff = computedPctOff ?? (mrp && result.discountPercentage != null ? result.discountPercentage : null)

  const brand = result.brand ?? null
  const name =
    brand && result.title?.startsWith(brand) ? result.title.slice(brand.length).trim() : (result.title ?? null)

  const optionEntries = Object.entries(result.options ?? {})

  const inStock = result.unavailable
    ? false
    : result.availability
      ? !/sold out|out of stock|unavailable/i.test(result.availability)
      : true

  const sizeDimension = result.variants?.find((d) => d.dimension.toLowerCase() === 'size')

  return (
    <div className="mx-auto max-w-6xl px-6 lg:px-10 font-sans">
      {result.unavailable && (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-[#e6e6e6] bg-[#fafafa] px-4 py-3">
          <PackageX size={16} className="mt-0.5 flex-none" style={{ color: AJIO_ORANGE }} strokeWidth={1.8} />
          <div>
            <p className="text-xs font-bold text-[#2c4152]">Listing appears unavailable</p>
            <p className="mt-0.5 text-xs leading-relaxed text-[#767676]">
              No &quot;Add to Bag&quot; button was found and sold-out copy was detected on the page.
            </p>
          </div>
        </div>
      )}

      <div
        className="grid gap-8 [grid-template-areas:'info'_'gallery'_'rest'] sm:grid-cols-2 sm:[grid-template-areas:'gallery_info'_'gallery_rest']"
      >
        {/* Top of buy box: platform logo + rating, then brand + name.
            Mobile: first (area "info"). Desktop: top-right column. */}
        <div className="min-w-0 [grid-area:info]">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-[#767676]">
            <a href={result.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center">
              <Image src={SITE_LOGOS.ajio!} alt="Ajio" width={50} height={14} />
            </a>
            {result.rating && (
              <>
                <span className="text-[#cfcfcf]">·</span>
                <AjioRatingBadge rating={result.rating} count={result.review_count} />
              </>
            )}
          </div>

          {brand && <p className="mt-2 text-lg font-bold leading-tight text-[#2c4152]">{brand}</p>}

          <h1
            className={`${brand ? 'mt-0.5' : 'mt-2'} text-base font-normal leading-snug text-[#767676] sm:text-lg`}
          >
            {name ?? <span className="italic text-[#8a8a8a]">No title found</span>}
          </h1>
        </div>

        {/* Image gallery — shared component, Ajio theme.
            Mobile: second (area "gallery"). Desktop: left column,
            spanning both rows since "gallery" repeats in both area rows.
            Guarded against an empty `images` array so the grid cell
            doesn't collapse to zero size. */}
        <div className="min-w-0 [grid-area:gallery]">
          {images.length > 0 ? (
            <ProductGallery
              images={images}
              title={result.title}
              resetKey={result.url}
              theme={{
                frameBorder: 'border-[#e6e6e6]',
                activeThumb: 'border-[#2C4152] ring-1 ring-[#2C4152]',
                restingThumb: 'border-[#e6e6e6]',
                placeholderText: 'text-[#8a8a8a]',
              }}
            />
          ) : (
            <div className="flex aspect-[3/4] items-center justify-center rounded-lg border border-dashed border-[#cfcfcf] bg-[#fafafa] text-xs font-medium text-[#8a8a8a]">
              No images found
            </div>
          )}
        </div>

        {/* Rest of buy box: seller -> price -> offers -> option chips ->
            sizes -> stock -> urgency -> commerce actions. Mobile: third
            (area "rest"). Desktop: bottom-right column. */}
        <div className="min-w-0 [grid-area:rest]">
          {result.seller && <p className="text-[13px] font-medium text-[#767676]">Sold by {result.seller}</p>}

          <div className={`${result.seller ? 'mt-2' : ''} flex flex-wrap items-baseline gap-2.5`}>
            {price ? (
              <p className="text-3xl font-bold text-[#2c4152]">{price}</p>
            ) : (
              <p className="text-base font-semibold text-[#8a8a8a]">No price found</p>
            )}
            {mrp && <p className="text-base font-medium text-[#8a8a8a] line-through">{mrp}</p>}
            {mrp && pctOff !== null && (
              <span className="text-sm font-bold" style={{ color: AJIO_ORANGE }}>
                ({pctOff}% OFF)
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-[#8a8a8a]">Inclusive of all taxes</p>

          {optionEntries.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {optionEntries.map(([label, value]) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1 rounded-full border border-[#e6e6e6] bg-[#fafafa] px-2.5 py-1 text-[11px] font-semibold text-[#2c4152]"
                >
                  <span className="font-medium text-[#8a8a8a]">{label}:</span> {String(value)}
                </span>
              ))}
            </div>
          )}

          {!!result.variants?.length && (
            <div className="mt-4 flex flex-col gap-4">
              {result.variants.map((dim) => {
                const selectedLabel = selectedByDimension[dim.dimension] ?? null
                const isColor = dim.dimension.toLowerCase() === 'color'
                const isSize = dim === sizeDimension

                return (
                  <div key={dim.dimension}>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <p className="text-[13px] text-[#2c4152]">
                        <span className="font-semibold">{dim.dimension}</span>
                        {selectedLabel && <span className="text-[#767676]"> — {selectedLabel}</span>}
                      </p>
                      {isSize && <AjioSizeChart sizeChart={result.sizeChart} />}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {dim.options.map((opt, i) => {
                        const selected = opt.label === selectedLabel
                        const clickable = !!opt.url && !selected && !opt.outOfStock
                        const disabledTitle = opt.url ? undefined : `${opt.label} — informational only, no per-size link`
                        return isColor ? (
                          <AjioColorSwatch
                            key={`${opt.label}-${i}`}
                            label={opt.label}
                            image={opt.image}
                            selected={selected}
                            outOfStock={opt.outOfStock}
                            disabledTitle={disabledTitle}
                            onClick={clickable ? () => pickOption(dim.dimension, opt.label, opt.url) : undefined}
                          />
                        ) : (
                          <AjioSizeBubble
                            key={`${opt.label}-${i}`}
                            label={opt.label}
                            selected={selected}
                            outOfStock={opt.outOfStock}
                            lowStock={'lowStock' in opt && typeof opt.lowStock === 'boolean' ? opt.lowStock : undefined}
                            stockLevel={'stockLevel' in opt && (typeof opt.stockLevel === 'number' || opt.stockLevel === null) ? opt.stockLevel : undefined}
                            disabledTitle={disabledTitle}
                            onClick={clickable ? () => pickOption(dim.dimension, opt.label, opt.url) : undefined}
                          />
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">
              {result.unavailable ? (
                <span className="text-[#c9252b]">Out of Stock</span>
              ) : inStock ? (
                <span className="text-[#1E7E34]">In Stock</span>
              ) : (
                <span className="text-[#767676]">{result.availability}</span>
              )}
            </p>
            {result.urgencyTag && (
              <span
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-bold text-white"
                style={{ backgroundColor: AJIO_ORANGE }}
              >
                <Flame size={11} className="fill-white" strokeWidth={0} />
                {result.urgencyTag}
              </span>
            )}
          </div>
          {!result.unavailable && inStock && result.quantityAvailable != null && (
            <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-[#8a8a8a]">
              <Zap size={10} />
              {result.quantityAvailable.toLocaleString()} units available
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
        </div>
      </div>

      {/* Description/Details/Shipping & Returns — bottom-most,
          full-width section of the entire component. */}
      <ProductInfoTabs result={result} />
    </div>
  )
}