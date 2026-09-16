// components/platforms/Westsideproductview.tsx
'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, Minus, Plus, Heart, ShoppingBag, ShoppingCart, Check } from 'lucide-react'
import { formatPrice } from '@/lib/currency'
import type { ScrapeResult } from '@/lib/scrape/parsers'
import type { PlatformViewProps } from '@/lib/scrape/platform-view-props'
import ProductGallery from '@/components/stores/ProductGallery'
import RequestActionButton from '@/components/stores/RequestActionButton'
import Image from 'next/image'

/**
 * Renders a scrape result using the SAME structural layout as
 * AmazonProductView / FlipkartProductView / EbayProductView /
 * FirstCryProductView — gallery (shared ProductGallery component) +
 * buy box side by side (max-w-6xl), buy box ordered as platform/brand
 * badge -> title -> seller -> price -> variants -> stock -> commerce
 * actions, then a bottom-most full-width ProductInfoTabs section —
 * but restyled with a palette of its own rather than reusing another
 * platform's accent color:
 *   - near-black ink (#1c1c1c) for text/primary CTA, matching
 *     Westside's own minimalist black-and-white in-store branding
 *   - warm brass/gold (#a9812f) for selected states, in-stock text,
 *     and discount badges — distinct from Amazon's teal, Flipkart's
 *     blue/green, eBay's blue, and FirstCry's pink
 *   - the primary cart CTA reads "ADD TO BAG", matching the copy
 *     Westside's own site uses, instead of "ADD TO CART"
 *
 * LAYOUT ON MOBILE (<sm): same grid-template-areas approach as the
 * other four views — the buy box's top segment (brand badge + title,
 * area "info") is reordered ABOVE the gallery (area "gallery"), which
 * sits above the rest of the buy box (area "rest"), collapsing back
 * into a 2-col/2-row layout at sm: (gallery spanning both rows on the
 * left, info/rest stacked on the right).
 *
 * DATA SOURCE NOTE: Westside results come from scrapeWestsideProduct
 * in lib/scrape/parsers.ts, which is a thin wrapper around the real
 * Shopify Storefront API (scrapeShopifyProduct) — Westside's
 * storefront genuinely runs on Shopify's backend — with `site`
 * relabeled 'westside' afterward so this view (rather than
 * ShopifyProductView) renders it. That means:
 *   - `rating`/`review_count` are ALWAYS null. scrapeShopifyProduct
 *     never populates them (Shopify's own product API carries no
 *     review data) — this view omits a rating row entirely rather
 *     than rendering an empty/misleading one, the same reasoning
 *     EbayProductView documents for why it labels its own rating
 *     field "Seller rating" instead of reusing a generic pill blindly.
 *   - A "Color" dimension will almost always resolve to a single
 *     swatch. Westside, like most fashion catalogs, models each color
 *     as a SEPARATE product (its own handle/URL), not as a variant
 *     within one product — so seeing only one color tile here is the
 *     common, correct case, not a bug. Still rendered (not hidden) in
 *     case a rarer multi-color product exists.
 *   - "Size" tiles carry REAL per-size URLs (`?variant=<id>`), built
 *     by buildShopifyVariantSelectUrl in parsers.ts — clicking an
 *     in-stock, non-selected size genuinely re-fetches that variant,
 *     unlike FirstCry's Color swatches (which are permanently
 *     informational-only because FirstCry swaps color via in-page
 *     AJAX with no resolvable URL at all — a different, unrelated
 *     limitation).
 *
 * Extra Shopify/Westside-specific fields ScrapeResult doesn't formally
 * declare (sku, productType, category, gender, weightKg) are read
 * defensively via `as any`, same pattern EbayProductView uses for its
 * own extra fields.
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

/** Small uppercase label pill for brand/gender/category context next
 * to the logo — Westside has no rating to show here, so this row
 * carries catalog context instead. */
function InfoPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-[#f4f1ea] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#6b6558]">
      {children}
    </span>
  )
}

/** Color/style swatch tile — square image chip. Matches Flipkart's
 * rounded-square treatment (fashion imagery reads better square than
 * as a small circle), recolored to the brass/gold accent. */
function WestsideSwatch({
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
    <span className="inline-flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={interactive ? onClick : undefined}
        title={outOfStock ? 'Out of stock' : disabledTitle}
        aria-pressed={selected}
        aria-label={label}
        disabled={!interactive}
        className={
          'relative h-14 w-14 flex-none overflow-hidden rounded-lg border-[1.5px] bg-cover bg-center bg-[#f4f1ea] transition-all ' +
          (selected
            ? 'border-[#a9812f] ring-1 ring-[#a9812f]'
            : outOfStock
              ? 'cursor-not-allowed border-[#e5e1d6]'
              : interactive
                ? 'border-[#ddd8c9] hover:border-[#1c1c1c] cursor-pointer'
                : 'cursor-not-allowed border-[#e5e1d6] opacity-50')
        }
        style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined}
      >
        {!imageUrl && (
          <span className="grid h-full w-full place-items-center text-[9px] font-bold uppercase tracking-tight text-[#a39d8c]">
            {label.trim().slice(0, 2)}
          </span>
        )}
        {outOfStock && (
          <span className="absolute inset-x-0 bottom-0 bg-black/70 py-0.5 text-center text-[7px] font-bold uppercase tracking-wide text-white">
            Out of stock
          </span>
        )}
        {imageUrl && outOfStock && <span className="absolute inset-0 bg-white/40" />}
      </button>
      <span className={`text-[10px] font-medium ${selected ? 'text-[#a9812f]' : 'text-[#6b6558]'}`}>{label}</span>
    </span>
  )
}

/** Size pill — text-only, matching the real site's flat size-picker
 * row rather than a swatch treatment. */
function SizePill({
  label,
  selected,
  outOfStock,
  onClick,
  disabledTitle,
}: {
  label: string
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
      className={
        'flex min-w-[2.75rem] flex-col items-center rounded-md border-[1.5px] px-2.5 py-1.5 text-xs font-semibold transition-colors ' +
        (selected
          ? 'border-[#1c1c1c] bg-[#1c1c1c] text-white'
          : outOfStock
            ? 'cursor-not-allowed border-[#e5e1d6] text-[#c3bdac] line-through'
            : interactive
              ? 'border-[#ddd8c9] text-[#1c1c1c] hover:border-[#1c1c1c] cursor-pointer'
              : 'cursor-not-allowed border-[#e5e1d6] text-[#c3bdac]')
      }
    >
      {label}
    </button>
  )
}

/**
 * Westside-styled qty/wishlist/cart/request block — same shape and
 * slot as every other platform's *CommerceActions (qty stepper,
 * wishlist heart, primary cart CTA, "GET QUOTE" request CTA, all
 * inline in one wrapping row), with the primary CTA reading "ADD TO
 * BAG" to match Westside's own site copy.
 */
function WestsideCommerceActions({
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
            the outer row's wrap decision, same pattern as every other
            platform view's commerce-actions row. */}
        <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-2">
          <div className="flex flex-none items-center gap-3.5 rounded-xl border border-[#ddd8c9] px-2.5 py-1.5">
            <button
              type="button"
              aria-label="Decrease quantity"
              onClick={() => onQtyChange(Math.max(1, qty - 1))}
              className="grid h-7 w-7 place-items-center rounded-md border border-[#ddd8c9] text-[#6b6558] transition-colors hover:border-[#1c1c1c]/40 hover:bg-[#1c1c1c]/5 hover:text-[#1c1c1c] active:scale-90"
            >
              <Minus size={15} />
            </button>
            <span className="min-w-[20px] text-center font-bold tabular-nums text-[#1c1c1c]">{qty}</span>
            <button
              type="button"
              aria-label="Increase quantity"
              onClick={() => onQtyChange(qty + 1)}
              className="grid h-7 w-7 place-items-center rounded-md border border-[#ddd8c9] text-[#6b6558] transition-colors hover:border-[#1c1c1c]/40 hover:bg-[#1c1c1c]/5 hover:text-[#1c1c1c] active:scale-90"
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
            className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl border border-[#ddd8c9] text-[#6b6558] transition-all duration-200 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
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
            color="#1c1c1c"
            disabledColor="#c7c7c7"
            className="flex-1 whitespace-nowrap rounded-xl px-5 py-3 text-sm font-bold text-white hover:brightness-110"
          >
            {justAdded ? 'ADDED' : 'ADD TO BAG'}
          </RequestActionButton>
        </div>

        {/* Get Quote: mobile lets this wrap to its own full-width
            line (grow + basis-full); desktop pins it to its natural
            width (sm:grow-0 + sm:basis-auto) so it stops competing
            with the atomic group above for the row's free space —
            same pattern as every other platform view. */}
        <RequestActionButton
          onClick={onRequestReview}
          disabled={!canAct}
          loading={loading}
          unavailable={result.unavailable}
          unavailableLabel="NOT AVAILABLE"
          icon={<ShoppingCart size={16} />}
          color="#a9812f"
          disabledColor="#c7c7c7"
          className="grow basis-full whitespace-nowrap rounded-xl px-5 py-3 text-sm font-bold text-white hover:brightness-110 sm:grow-0 sm:basis-auto"
        >
          GET QUOTE
        </RequestActionButton>
      </div>

      <p className="text-xs text-[#8a8474]">You will not be charged now. This is just a request.</p>
    </div>
  )
}

/* ---------------------------------------------------------------------
 * ProductInfoTabs — same Description / Details / Shipping & Returns
 * structure as the other four views, recolored to the brass accent,
 * rendered as the bottom-most, full-width section of the whole view.
 * The Details tab surfaces the Shopify/Westside-specific fields
 * (sku, productType, category, gender, weightKg) that ScrapeResult
 * doesn't formally declare — read via `as any`, same pattern
 * EbayProductView uses for its own extra fields. Raw `tags` are
 * deliberately NOT surfaced here: Westside's tag array is an internal
 * merchandising/search field (size-chart flags like "S"/"M", pricing
 * bucket labels like "Rs. 501 - Rs. 1000", campaign codes like
 * "FL_27-Aug", "BDAY_DISC_ELIGIBLE") rather than customer-facing
 * attributes, so dumping it verbatim would confuse more than it helps.
 * ------------------------------------------------------------------- */

const INFO_TABS = ['Description', 'Details', 'Shipping & Returns'] as const
type InfoTab = (typeof INFO_TABS)[number]

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="font-semibold text-[#1c1c1c]/80">{label}</dt>
      <dd className="text-right text-[#8a8474]">{value}</dd>
    </div>
  )
}

function SizeChart({ chart }: { chart: NonNullable<ScrapeResult['sizeChart']> }) {
  return (
    <div className="flex flex-col gap-3">
      {chart.map((table, i) => (
        <div key={i}>
          {'title' in table && table.title && (
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[#a39d8c]">{table.title}</p>
          )}
          <table className="w-full border-collapse text-left text-[12px] text-[#1c1c1c]">
            <thead>
              <tr className="border-b border-[#e5e1d6]">
                {table.columns.map((col) => (
                  <th key={col} className="py-1 pr-4 font-semibold">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, r) => (
                <tr key={r} className="border-b border-[#f0ede4] last:border-0">
                  {table.columns.map((col) => (
                    <td key={col} className="py-1 pr-4">
                      {row[col]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

function ProductInfoTabs({ result }: { result: ScrapeResult }) {
  const [activeTab, setActiveTab] = useState<InfoTab>('Description')
  const hasRealSizeChart = !!result.sizeChart && result.sizeChart.length > 0

  const sku = (result as any).sku as string | null | undefined
  const productType = (result as any).productType as string | null | undefined
  const category = (result as any).category as string | null | undefined
  const gender = (result as any).gender as string | null | undefined
  const weightKg = (result as any).weightKg as number | null | undefined

  const hasDetails = !!(result.brand || sku || category || productType || gender || weightKg != null || hasRealSizeChart)

  return (
    <div className="mt-8 border-t border-[#e5e1d6] pt-6">
      <div className="flex gap-5 border-b border-[#e5e1d6]">
        {INFO_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`-mb-px border-b-2 pb-2.5 text-sm font-semibold transition-colors ${
              activeTab === tab
                ? 'border-[#a9812f] text-[#1c1c1c]'
                : 'border-transparent text-[#8a8474] hover:text-[#1c1c1c]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
      <div
        key={activeTab}
        className="min-h-[96px] pb-2 pt-4 text-sm leading-relaxed text-[#4a4638] motion-safe:[animation:tabFadeIn_0.18s_ease-out_both]"
      >
        {activeTab === 'Description' &&
          ((result as ScrapeResult & { description?: string }).description ? (
            <p>{(result as ScrapeResult & { description?: string }).description}</p>
          ) : (
            <p className="text-[#a39d8c]">
              We don&apos;t have a description for this listing. Here&apos;s the title instead:{' '}
              {result.title ?? 'no title available.'}
            </p>
          ))}
        {activeTab === 'Details' && (
          <div className="flex flex-col gap-4">
            <dl className="flex flex-col gap-1.5 text-xs">
              {result.brand && <DetailRow label="Brand" value={result.brand} />}
              {sku && <DetailRow label="SKU" value={sku} />}
              {(category || productType) && <DetailRow label="Category" value={category ?? productType!} />}
              {gender && <DetailRow label="Gender" value={gender.charAt(0).toUpperCase() + gender.slice(1)} />}
              {weightKg != null && <DetailRow label="Weight" value={`${weightKg} kg`} />}
              {!hasDetails && <p className="text-[#a39d8c]">We don&apos;t have any additional details for this listing.</p>}
            </dl>

            {hasRealSizeChart && (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[#a39d8c]">Size chart</p>
                <div className="rounded-lg border border-[#e5e1d6] bg-[#faf8f2] p-3">
                  <SizeChart chart={result.sizeChart!} />
                </div>
              </div>
            )}
          </div>
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
                <p className="mt-1 text-[#a39d8c]">
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

export default function WestsideProductView({
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
  const pctOff =
    result.mrp && result.price && Number(result.mrp) > Number(result.price)
      ? Math.round((1 - Number(result.price) / Number(result.mrp)) * 100)
      : null

  const gender = (result as any).gender as string | null | undefined

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
        {/* Top of buy box: platform logo + brand/gender context pills,
            then title. Mobile: first (area "info"). Desktop:
            top-right column. No rating row — Shopify-sourced results
            never carry one (see file header). */}
        <div className="min-w-0 [grid-area:info]">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
            <a href={result.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center">
              <Image src="/logos/westside.png" alt="Westside" width={84} height={16} />
            </a>
            {result.brand && <InfoPill>{result.brand}</InfoPill>}
            {gender && <InfoPill>{gender}</InfoPill>}
          </div>

          <h1 className="mt-2 text-2xl font-medium leading-snug tracking-tight text-[#1c1c1c] sm:text-3xl">
            {result.title ?? <span className="italic text-[#a39d8c]">No title found</span>}
          </h1>
        </div>

        {/* Image gallery — shared component, Westside theme.
            Mobile: second (area "gallery"). Desktop: left column,
            spanning both rows since "gallery" repeats in both area rows. */}
        <div className="min-w-0 [grid-area:gallery]">
          <ProductGallery
            images={images}
            title={result.title}
            resetKey={result.url}
            theme={{
              frameBorder: 'border-[#e5e1d6]',
              activeThumb: 'border-[#a9812f] ring-1 ring-[#a9812f]',
              restingThumb: 'border-[#e5e1d6]',
              placeholderText: 'text-[#a39d8c]',
            }}
          />
        </div>

        {/* Rest of buy box: seller -> price -> variants -> stock ->
            commerce actions. Mobile: third (area "rest"). Desktop:
            bottom-right column. */}
        <div className="min-w-0 [grid-area:rest]">
          {result.seller && <p className="text-xs font-medium text-[#8a8474]">Sold by {result.seller}</p>}

          <div className="mt-2 flex flex-wrap items-baseline gap-2.5">
            {price ? (
              <p className="text-3xl font-bold text-[#1c1c1c]">{price}</p>
            ) : (
              <p className="text-base font-semibold text-[#a39d8c]">No price found</p>
            )}
            {mrp && <p className="text-base font-semibold text-[#a39d8c] line-through">{mrp}</p>}
            {pctOff !== null && (
              <span className="rounded bg-[#a9812f] px-2 py-0.5 text-[10px] font-bold text-white">{pctOff}% off</span>
            )}
          </div>

          {!!result.variants?.length && (
            <div className="mt-4 flex flex-wrap gap-6">
              {result.variants.map((dim) => {
                const isColor = dim.dimension.toLowerCase() === 'color'
                const selectedLabel = selectedByDimension[dim.dimension] ?? null

                return (
                  <div key={dim.dimension}>
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-[#a39d8c]">
                      {dim.dimension}
                    </p>
                    <div className={isColor ? 'flex flex-wrap gap-3' : 'flex flex-wrap gap-1.5'}>
                      {dim.options.map((opt, i) => {
                        const selected = opt.label === selectedLabel
                        const disabledTitle = opt.url
                          ? undefined
                          : `${opt.label} — no direct link found, selection is visual only`
                        const onPick = () => pickOption(dim.dimension, opt.label, opt.url)

                        return isColor ? (
                          <WestsideSwatch
                            key={`${opt.label}-${i}`}
                            label={opt.label}
                            imageUrl={opt.image}
                            selected={selected}
                            outOfStock={opt.outOfStock}
                            onClick={onPick}
                            disabledTitle={disabledTitle}
                          />
                        ) : (
                          <SizePill
                            key={opt.label}
                            label={opt.label}
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
              <span className="text-[#c9330c]">Sold Out</span>
            ) : inStock ? (
              <span className="text-[#a9812f]">In stock</span>
            ) : (
              <span className="text-[#8a8474]">{result.availability}</span>
            )}
          </p>

          <WestsideCommerceActions
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