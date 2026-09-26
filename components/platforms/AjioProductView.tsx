// components/platforms/AjioProductView.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
 * Renders a scrape result using the same structural layout as
 * AmazonProductView / FlipkartProductView / MyntraProductView /
 * NykaaProductView, restyled with Ajio's visual language (slate-navy
 * primary, orange discount tag, brand above title, round size bubbles,
 * color swatches).
 *
 * Size handling (this version):
 *   - Ajio's extractor never gives sizes a per-size `url`, but sizes are
 *     now SELECTABLE anyway. The variant identity is product url +
 *     selected options (e.g. { Size: 'M' }).
 *   - The selected size is appended to the title, exactly like ajio.com:
 *     "Off Men Brand Printed Regular Fit Sweatshirt | M".
 *   - The selection is reported to the parent through the optional
 *     `onSelectionChange` prop so the cart item / quote request can
 *     carry it. Add `onSelectionChange?: (s: Record<string, string>) => void`
 *     to PlatformViewProps.
 *   - When the product has a size dimension, ADD TO BAG / GET QUOTE
 *     require a size and show "Please select a size" otherwise.
 *   - If a re-scrape (e.g. color swatch with a url) brings new variants,
 *     the previous choice is kept when that label still exists and is in
 *     stock.
 *
 * Size chart modal (this revision):
 *   - Previously a bare, borderless <table> with no header shading and
 *     no link back to what the shopper actually has selected — it read
 *     like debug output, not a designed panel.
 *   - Now: a single bordered, rounded card holds the whole table (header
 *     + body share one outline instead of floating separately), the
 *     header row gets a tinted background and uppercase tracked labels,
 *     body rows get comfortable padding and a hairline divider instead
 *     of relying only on zebra tint, and the row matching the shopper's
 *     current size selection is picked out (tinted + a small check) so
 *     the chart doubles as a "here's where you are" reference, not just
 *     a static lookup table.
 *   - Always centered dead-center on screen (not a mobile bottom-sheet),
 *     with a stronger full-viewport dim/blur, and rendered through a
 *     React portal into document.body so a transformed/filtered/
 *     contained ancestor further up the tree can never shrink the
 *     `fixed inset-0` overlay down to that ancestor's box. Background
 *     scroll is locked for as long as the modal is open, and the modal
 *     body itself does not scroll vertically — it's sized to just fit
 *     its content (only a wide table gets horizontal scroll, since that
 *     reveals columns rather than scrolling the panel itself).
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

/** Round size bubble. Clickable whenever an onClick is supplied and the
 * size is in stock. Carries an optional low-stock dot fed by the option's
 * `lowStock` flag, with the exact `stockLevel` in the tooltip when known. */
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
 * option has no image. */
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

/** Size chart trigger + modal, fed by `result.sizeChart`. `selectedSize`
 * (optional) picks out the shopper's current size in the table so the
 * chart also reads as "here's where you are", not just a static lookup.
 *
 * Rendered via a portal into document.body: this is what makes the
 * `fixed inset-0` overlay cover the true browser viewport instead of
 * being clipped/scaled down to whatever ancestor box happens to
 * establish a containing block (a transformed, filtered, or
 * `will-change`d wrapper anywhere above this component in the tree).
 *
 * The modal body does not scroll vertically: it has no `overflow-y-auto`
 * and no `max-h` clamp on the content area, so the panel simply grows to
 * fit whatever the chart needs. Only the table wrapper keeps a horizontal
 * scroll, since that reveals extra columns rather than scrolling the
 * modal itself. */
/** Size chart trigger + a simple full-screen overlay. */
function AjioSizeChart({
  sizeChart,
  selectedSize,
}: {
  sizeChart: ScrapeResult['sizeChart']
  selectedSize?: string | null
}) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!sizeChart || sizeChart.length === 0) return null

  const overlay = (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 999,
        backgroundColor: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          padding: '20px',
          maxWidth: '90vw',
        }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-[#2c4152]">Size Chart</h3>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close size chart">
            <X size={18} style={{ color: '#8a8a8a' }} />
          </button>
        </div>

        {sizeChart.map((chart, ci) => (
          <div key={ci} className="mb-4">
            {'title' in chart && chart.title && (
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#8a8a8a]">{chart.title}</p>
            )}
            <table className="border-collapse text-xs">
              <thead>
                <tr style={{ backgroundColor: `${AJIO_INK}0a` }}>
                  {'headers' in chart &&
                    chart.headers.map((h) => (
                      <th
                        key={h}
                        className="whitespace-nowrap px-3.5 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide"
                        style={{ color: AJIO_INK }}
                      >
                        {h}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {chart.rows.map((row, ri) => {
                  const cells = Array.isArray(row) ? row : [row]
                  const rowLabel = String(cells[0] ?? '')
                  const isSelectedRow =
                    !!selectedSize && rowLabel.trim().toLowerCase() === selectedSize.trim().toLowerCase()
                  return (
                    <tr key={ri} style={isSelectedRow ? { backgroundColor: `${AJIO_INK}0d` } : undefined}>
                      {cells.map((cell, cellI) => (
                        <td
                          key={cellI}
                          className={`whitespace-nowrap px-3.5 py-2.5 ${isSelectedRow ? 'font-bold' : 'font-medium'}`}
                          style={{ color: isSelectedRow ? AJIO_INK : '#484848' }}
                        >
                          {cell != null && typeof cell === 'object' ? Object.values(cell).map(String).join(' / ') : cell}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  )

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

      {mounted && open ? createPortal(overlay, document.body) : null}
    </>
  )
}

/**
 * Ajio-styled qty/wishlist/cart/request block — same shape and slot as
 * the other platforms' CommerceActions (qty stepper, wishlist heart,
 * Add to Bag, Get Quote).
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
            splits across lines. */}
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

        {/* Get Quote: mobile takes the whole next line; desktop sits at
            its natural width. */}
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
 * ProductInfoTabs — Description / Details / Shipping & Returns
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
 * markup-noise-heavy. */
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
  const images = result.images ?? []
  const [selectedByDimension, setSelectedByDimension] = useState<Record<string, string>>({})
  const [showSizeError, setShowSizeError] = useState(false)
  // Always-current copy of the selection so pickOption and the re-scrape
  // effect never work from a stale closure.
  const selectionRef = useRef<Record<string, string>>({})

  // Build the selection whenever the scrape result changes. Keep the
  // user's previous choice per dimension if that label still exists and
  // is in stock; otherwise fall back to what the extractor marked selected.
  useEffect(() => {
    const prev = selectionRef.current
    const next: Record<string, string> = {}
    for (const dim of result.variants ?? []) {
      const prevLabel = prev[dim.dimension]
      const prevStillValid =
        prevLabel != null && dim.options.some((o) => o.label === prevLabel && !o.outOfStock)
      if (prevStillValid) {
        next[dim.dimension] = prevLabel
      } else {
        const selectedOpt = dim.options.find((o) => o.selected)
        if (selectedOpt) next[dim.dimension] = selectedOpt.label
      }
    }
    selectionRef.current = next
    setSelectedByDimension(next)
    onSelectionChange?.(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.url, result.variants])

  function pickOption(dimension: string, label: string, url: string | null) {
    const next = { ...selectionRef.current, [dimension]: label }
    selectionRef.current = next
    setSelectedByDimension(next)
    onSelectionChange?.(next)
    setShowSizeError(false)
    if (url) onSelectVariant(url)
  }

  const price = fmt(result.price, result.currencyCode)
  const mrp = result.mrp && result.mrp !== result.price ? fmt(result.mrp, result.currencyCode) : null

  // Prefer computing the live percentage off price/mrp; fall back to the
  // extractor-provided `discountPercentage`.
  const computedPctOff =
    result.mrp && result.price && Number(result.mrp) > Number(result.price)
      ? Math.round((1 - Number(result.price) / Number(result.mrp)) * 100)
      : null
  const pctOff = computedPctOff ?? (mrp && result.discountPercentage != null ? result.discountPercentage : null)

  const brand = result.brand ?? null
  const rawName =
    brand && result.title?.startsWith(brand) ? result.title.slice(brand.length).trim() : (result.title ?? null)

  const optionEntries = Object.entries(result.options ?? {})

  const inStock = result.unavailable
    ? false
    : result.availability
      ? !/sold out|out of stock|unavailable/i.test(result.availability)
      : true

  const sizeDimension = result.variants?.find((d) => d.dimension.toLowerCase() === 'size')
  const selectedSize = sizeDimension ? (selectedByDimension[sizeDimension.dimension] ?? null) : null
  const missingSize = !!sizeDimension && !selectedSize

  // The scraped title may already end with " | <size>" (e.g. when the
  // page was opened on a specific size). Strip any trailing size label so
  // it isn't doubled, then append the live selection like ajio.com does.
  const name = (() => {
    if (!rawName) return null
    if (!sizeDimension) return rawName
    for (const opt of sizeDimension.options) {
      const suffix = new RegExp(`\\s*\\|\\s*${opt.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i')
      if (suffix.test(rawName)) return rawName.replace(suffix, '').trim()
    }
    return rawName
  })()

  function requireSize(action: () => void) {
    return () => {
      if (missingSize) {
        setShowSizeError(true)
        return
      }
      action()
    }
  }

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
            {name ? (
              <>
                {name}
                {selectedSize && (
                  <span className="font-semibold text-[#2c4152]"> | {selectedSize}</span>
                )}
              </>
            ) : (
              <span className="italic text-[#8a8a8a]">No title found</span>
            )}
          </h1>
        </div>

        {/* Image gallery — shared component, Ajio theme. */}
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
            variants -> stock -> urgency -> commerce actions. */}
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
                      {isSize && <AjioSizeChart sizeChart={result.sizeChart} selectedSize={selectedSize} />}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {dim.options.map((opt, i) => {
                        const selected = opt.label === selectedLabel
                        // Selectable even without a per-option url: the
                        // variant is identified by product url + label.
                        const clickable = !selected && !opt.outOfStock
                        const onPick = clickable ? () => pickOption(dim.dimension, opt.label, opt.url) : undefined
                        return isColor ? (
                          <AjioColorSwatch
                            key={`${opt.label}-${i}`}
                            label={opt.label}
                            image={opt.image}
                            selected={selected}
                            outOfStock={opt.outOfStock}
                            onClick={onPick}
                          />
                        ) : (
                          <AjioSizeBubble
                            key={`${opt.label}-${i}`}
                            label={opt.label}
                            selected={selected}
                            outOfStock={opt.outOfStock}
                            lowStock={'lowStock' in opt && typeof opt.lowStock === 'boolean' ? opt.lowStock : undefined}
                            stockLevel={'stockLevel' in opt && (typeof opt.stockLevel === 'number' || opt.stockLevel === null) ? opt.stockLevel : undefined}
                            onClick={onPick}
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

          {showSizeError && missingSize && (
            <p role="alert" className="mt-4 text-xs font-semibold text-[#c9252b]">
              Please select a size
            </p>
          )}

          <AjioCommerceActions
            result={result}
            qty={qty}
            onQtyChange={onQtyChange}
            inWishlist={inWishlist}
            onToggleWishlist={onToggleWishlist}
            onAddToCart={requireSize(onAddToCart)}
            justAdded={justAdded}
            onRequestReview={requireSize(onRequestReview)}
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