// app/demo/scraper-qa/platforms/HopscotchProductView.tsx
'use client'

import { useEffect, useState } from 'react'
import {
  Star,
  ExternalLink,
  Minus,
  Plus,
  Heart,
  ShoppingBag,
  ShoppingCart,
  Check,
  ChevronDown,
  ChevronRight,
  Sparkles,
  AlertTriangle,
} from 'lucide-react'
import { formatPrice } from '@/lib/currency'
import type { ScrapeResult } from '@/lib/scrape/parsers'
import type { PlatformViewProps } from '@/lib/scrape/platform-view-props'
import ProductGallery from '@/components/stores/ProductGallery'
import RequestActionButton from '@/components/stores/RequestActionButton'
import Image from 'next/image'

/**
 * Hopscotch look-alike view, built at the same organizational depth as
 * AmazonProductView.tsx / FirstCryProductView.tsx: full `PlatformViewProps`
 * wiring (cart/wishlist/qty/quote), the shared `<ProductGallery>`, and a
 * structured bottom section for extra info.
 *
 * Unlike Amazon/FirstCry, Hopscotch's real PDP (see reference screenshot)
 * puts extra info in two collapsible accordions — "Item details" and
 * "More Info" — rather than a tab switcher, and its buy box is a plain
 * MRP price (Hopscotch rarely shows a struck-through price on this page),
 * a native "Select a size" dropdown instead of chips/pills, and a side-by-
 * side ADD TO CART (outline) / BUY NOW (solid) button pair. This view
 * mirrors that layout instead of reusing Amazon's tab pattern.
 *
 * Extractor-specific notes (from the sample scrape result this was built
 * against):
 *   - Hopscotch's "Size" variant options carry no `url` and no `image` —
 *     sizes are chosen from an in-page dropdown that doesn't navigate or
 *     swap the SKU via a link, so there's nothing to `onSelectVariant`
 *     into. Picking a size here is local UI state only (mirrors the
 *     result's own `selected`/`outOfStock` flags) and does not re-scrape.
 *   - `hasSizeChart: true` with `sizeChart: null` is a known Hopscotch
 *     extraction gap: the chart only renders into the DOM after the
 *     "View size chart" button is clicked client-side, so a plain fetch
 *     won't have captured it. When that combination occurs, this view
 *     surfaces `result.warning` instead of silently showing nothing.
 *   - `moreInfo` is a Hopscotch-specific free-text field (manufacturer/
 *     packer/country-of-origin block) — rendered in its own accordion,
 *     matching the real page's separate "More Info" section.
 */

function fmtPrice(amount: string | null | undefined, currency: string | null | undefined) {
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
        {count && <span className="font-normal text-ink/40"> ({count})</span>}
      </span>
    </span>
  )
}

/**
 * Price block — Hopscotch's PDP shows "MRP: ₹X / Inclusive of all
 * taxes" with no separate sale price most of the time. If the scrape
 * DOES find a distinct `mrp` above `price` (a real discount), that's
 * shown struck-through the same way the other platform views do; the
 * plain single-price MRP-only case (this sample result) matches the
 * screenshot exactly.
 */
function PriceBlock({ result }: { result: ScrapeResult }) {
  const price = fmtPrice(result.price, result.currencyCode)
  const mrp = result.mrp && result.mrp !== result.price ? fmtPrice(result.mrp, result.currencyCode) : null

  if (!price) {
    return <p className="text-base font-semibold text-ink/40">No price found</p>
  }

  if (mrp) {
    return (
      <div>
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-bold text-ink">{price}</p>
          <p className="text-sm font-semibold text-ink/40 line-through">{mrp}</p>
        </div>
        <p className="mt-1 text-xs text-ink/40">Inclusive of all taxes</p>
      </div>
    )
  }

  return (
    <div>
      <p className="text-2xl font-bold text-ink">
        <span className="text-sm font-semibold text-ink/50">MRP:</span> {price}
      </p>
      <p className="mt-1 text-xs text-ink/40">Inclusive of all taxes</p>
    </div>
  )
}

/**
 * Native-select size picker, matching the real "Select a size"
 * dropdown. Local UI state only — see file header on why Hopscotch
 * size options don't drive `onSelectVariant`.
 */
function SizeSelect({
  dimension,
  selectedLabel,
  onChange,
}: {
  dimension: NonNullable<ScrapeResult['variants']>[number]
  selectedLabel: string | null
  onChange: (label: string) => void
}) {
  return (
    <div className="mt-5">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-sm font-bold text-ink">{dimension.dimension}</p>
        <button type="button" className="flex items-center gap-0.5 text-xs font-bold text-purple-700 hover:underline">
          VIEW SIZE CHART <ChevronRight size={13} />
        </button>
      </div>
      <div className="relative">
        <select
          value={selectedLabel ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-xl border border-ink/15 bg-transparent px-4 py-3 text-sm font-medium text-ink outline-none focus:border-purple-400"
        >
          <option value="" disabled className="text-ink/35">
            Select a size
          </option>
          {dimension.options.map((opt) => (
            <option key={opt.label} value={opt.label} disabled={opt.outOfStock}>
              {opt.label}
              {opt.outOfStock ? ' — Out of stock' : ''}
            </option>
          ))}
        </select>
        <ChevronDown size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-ink/40" />
      </div>
    </div>
  )
}


/**
 * Add to Cart (outline) + Buy Now (solid) side by side, matching the
 * real button pair. `qty` still lives in a small stepper above the
 * pair — the real PDP doesn't expose quantity on this screen, but the
 * shared `PlatformViewProps` contract needs somewhere to surface it,
 * so it's kept compact and secondary rather than dropped.
 */
function HopscotchCommerceActions({
  result,
  qty,
  onQtyChange,
  onAddToCart,
  justAdded,
  onRequestReview,
  loading,
  canAct,
}: {
  result: ScrapeResult
  qty: number
  onQtyChange: (qty: number) => void
  onAddToCart: () => void
  justAdded: boolean
  onRequestReview: () => void
  loading?: boolean
  canAct: boolean
}) {
  return (
    <div className="mt-5 flex flex-col gap-3">
      <div className="flex items-center gap-2 self-start rounded-xl border border-ink/15 px-2.5 py-1.5">
        <span className="pl-0.5 text-[11px] font-bold uppercase tracking-wide text-ink/40">Qty</span>
        <button
          type="button"
          aria-label="Decrease quantity"
          onClick={() => onQtyChange(Math.max(1, qty - 1))}
          className="grid h-7 w-7 place-items-center rounded-md border border-ink/15 text-ink/60 transition-colors hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700 active:scale-90"
        >
          <Minus size={15} />
        </button>
        <span className="min-w-[20px] text-center font-bold tabular-nums">{qty}</span>
        <button
          type="button"
          aria-label="Increase quantity"
          onClick={() => onQtyChange(qty + 1)}
          className="grid h-7 w-7 place-items-center rounded-md border border-ink/15 text-ink/60 transition-colors hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700 active:scale-90"
        >
          <Plus size={15} />
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <RequestActionButton
          onClick={onAddToCart}
          disabled={!canAct}
          loading={loading}
          unavailable={result.unavailable}
          unavailableLabel="NOT AVAILABLE"
          icon={justAdded ? <Check size={16} className="text-purple-700" /> : <ShoppingBag size={16} />}
          color="#ffffff"
          disabledColor="#e5e5e5"
          className="flex-1 whitespace-nowrap rounded-xl border-2 border-purple-700 px-5 py-3 text-sm font-bold text-purple-700 hover:bg-purple-50"
        >
          {justAdded ? 'ADDED' : 'ADD TO CART'}
        </RequestActionButton>

        <RequestActionButton
          onClick={onRequestReview}
          disabled={!canAct}
          loading={loading}
          unavailable={result.unavailable}
          unavailableLabel="NOT AVAILABLE"
          icon={<ShoppingCart size={16} />}
          color="#6d28d9"
          disabledColor="#c7c7c7"
          className="flex-1 whitespace-nowrap rounded-xl px-5 py-3 text-sm font-bold text-white hover:brightness-95"
        >
          BUY NOW
        </RequestActionButton>
      </div>

      <p className="text-xs text-ink/40">You will not be charged now. This is just a request.</p>
    </div>
  )
}

/* ---------------------------------------------------------------------
 * Accordion sections — "Item details" / "More Info", matching the
 * real page's collapsible layout (rather than Amazon/FirstCry's tabs).
 * ------------------------------------------------------------------- */

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="font-semibold text-ink/70">{label}</dt>
      <dd className="text-right text-ink/55">{value}</dd>
    </div>
  )
}

function AccordionSection({
  title,
  defaultOpen,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(!!defaultOpen)
  return (
    <div className="border-b border-ink/10">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between py-4 text-left text-sm font-bold text-ink"
      >
        {title}
        <ChevronDown size={16} className={`text-ink/40 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="pb-4 text-sm leading-relaxed text-ink/65">{children}</div>}
    </div>
  )
}

function ItemDetailsBody({ result }: { result: ScrapeResult }) {
  const hasSpecifics = !!result.brand || !!result.mpn || !!result.categoryPath || !!result.itemSpecifics?.length
  return (
    <div className="flex flex-col gap-4">
      {result.description && <p>{result.description}</p>}

      {hasSpecifics && (
        <dl className="flex flex-col gap-1.5 text-xs">
          {result.brand && <DetailRow label="Brand" value={result.brand} />}
          {result.mpn && <DetailRow label="Model" value={result.mpn} />}
          {result.categoryPath && <DetailRow label="Category" value={result.categoryPath} />}
          {result.itemSpecifics?.map((spec) => (
            <DetailRow key={spec.name} label={spec.name} value={spec.value} />
          ))}
        </dl>
      )}

      {!result.description && !hasSpecifics && (
        <p className="text-ink/45">We don&apos;t have any item details for this listing.</p>
      )}

      {result.sizeChart === null && result.warning && (
        <div className="flex items-start gap-2 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2.5 text-xs text-purple-800">
          <AlertTriangle size={14} className="mt-0.5 flex-none" strokeWidth={1.8} />
          <span>{result.warning}</span>
        </div>
      )}

      {result.sizeChart && result.sizeChart.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink/45">Size chart</p>
          <div className="rounded-lg border border-ink/10 bg-card p-3">
            {result.sizeChart.map((table, i) => (
              <table key={i} className="w-full border-collapse text-left text-[12px] text-ink">
                <thead>
                  <tr className="border-b border-ink/10">
                    {table.columns.map((col) => (
                      <th key={col} className="py-1 pr-4 font-semibold">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row, r) => (
                    <tr key={r} className="border-b border-ink/5 last:border-0">
                      {table.columns.map((col) => (
                        <td key={col} className="py-1 pr-4">
                          {row[col]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MoreInfoBody({ result }: { result: ScrapeResult & { moreInfo?: string | null } }) {
  if (!result.moreInfo) {
    return <p className="text-ink/45">We don&apos;t have any additional info for this listing.</p>
  }
  // moreInfo arrives as one unbroken string like "Label: value Label: value ...";
  // split on the pattern "Word(s):" to lay it out as label/value rows instead
  // of one dense run-on paragraph.
  const parts = result.moreInfo.split(/(?=[A-Z][a-zA-Z ]+:)/g).filter(Boolean)
  return (
    <dl className="flex flex-col gap-1.5 text-xs">
      {parts.map((part, i) => {
        const idx = part.indexOf(':')
        if (idx === -1) return <p key={i}>{part}</p>
        const label = part.slice(0, idx).trim()
        const value = part.slice(idx + 1).trim()
        return <DetailRow key={i} label={label} value={value} />
      })}
    </dl>
  )
}

/* ---------------------------------------------------------------------
 * Main component
 * ------------------------------------------------------------------- */

export default function HopscotchProductView({
  result,
  onSelectVariant: _onSelectVariant,
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
  const sizeDimension = result.variants?.find((v) => v.dimension.toLowerCase() === 'size') ?? result.variants?.[0]
  const [selectedSize, setSelectedSize] = useState<string | null>(null)

  useEffect(() => {
    const initial = sizeDimension?.options.find((o) => o.selected)?.label ?? null
    setSelectedSize(initial)
  }, [result.url, sizeDimension])

  return (
    <div className="mx-auto max-w-6xl px-6 lg:px-10">
      <div
        className="grid gap-8 [grid-template-areas:'info'_'gallery'_'rest'] sm:grid-cols-2 sm:[grid-template-areas:'gallery_info'_'gallery_rest']"
      >
        <div className="min-w-0 [grid-area:info]">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-ink/50">
            <a href={result.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center">
              <Image src="/logos/hopscotch.png" alt="Hopscotch" width={90} height={18} />
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
        </div>

        <div className="relative min-w-0 [grid-area:gallery]">
          <ProductGallery
            images={images}
            title={result.title}
            resetKey={result.url}
            theme={{
              frameBorder: 'border-ink/10',
              activeThumb: 'border-purple-600 ring-1 ring-purple-600',
              restingThumb: 'border-ink/10',
              placeholderText: 'text-ink/40',
            }}
          />
        </div>

        <div className="min-w-0 [grid-area:rest]">
          <PriceBlock result={result} />

          {result.unavailable && (
            <p className="mt-4 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-800">
              This item looks sold out right now.
            </p>
          )}

          {sizeDimension && (
            <SizeSelect dimension={sizeDimension} selectedLabel={selectedSize} onChange={setSelectedSize} />
          )}

          <HopscotchCommerceActions
            result={result}
            qty={qty}
            onQtyChange={onQtyChange}
            onAddToCart={onAddToCart}
            justAdded={justAdded}
            onRequestReview={onRequestReview}
            loading={loading}
            canAct={canAct}
          />
        </div>
      </div>

      {/* Item details / More Info — collapsible, matching the real
          page, rendered full-width below the buy-box grid. */}
      <div className="mt-8 border-t border-ink/10">
        <AccordionSection title="Item details" defaultOpen>
          <ItemDetailsBody result={result} />
        </AccordionSection>
        <AccordionSection title="More Info">
          <MoreInfoBody result={result as ScrapeResult & { moreInfo?: string | null }} />
        </AccordionSection>
      </div>
    </div>
  )
}