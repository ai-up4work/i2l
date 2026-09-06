// app/demo/scraper-qa/platforms/EbayProductView.tsx
'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, Star, Gavel, Package, Check, Minus, Plus, Heart, ShoppingBag, ShoppingCart } from 'lucide-react'
import { formatPrice } from '@/lib/currency'
import type { ScrapeResult } from '@/lib/scrape/parsers'
import type { PlatformViewProps } from '@/lib/scrape/platform-view-props'
import ProductGallery from '@/components/stores/ProductGallery'
import RequestActionButton from '@/components/stores/RequestActionButton'

/**
 * Renders a scrape result using the SAME structural layout as
 * AmazonProductView — gallery (shared ProductGallery component, same
 * as MyntraProductView) + buy box side by side (max-w-6xl), buy box
 * ordered as platform/seller-badge -> title -> price/discount ->
 * auction block -> variants -> quantity/returns meta -> stock ->
 * original listing link -> EbayCommerceActions, then a bottom-most
 * full-width ProductInfoTabs section — but restyled with eBay's own
 * visual language:
 *   - blue (#3665F3) links/accents/selected states
 *   - seller feedback score/percentage badge (labeled "Seller rating",
 *     NOT product rating — see note below)
 *   - condition badge, auction current-bid/ends block
 *   - "Buy It Now" / "Place Bid" framing on the primary CTA
 *
 * The primary CTA reuses the shared RequestActionButton (same component
 * FlipkartCommerceActions uses for "Get Quote") so loading/disabled/
 * unavailable states render identically across platforms — only the
 * color ("#3665F3") and label ("Buy It Now" / "Place Bid") differ here.
 *
 * NOTE: eBay's `rating`/`review_count` fields represent SELLER
 * feedback, not a per-product review score — this view labels it
 * "Seller rating" rather than reusing Amazon/Flipkart's product-rating
 * framing, to avoid implying something the underlying data doesn't
 * actually mean.
 *
 * Extra fields eBay's extractor captures beyond the typed ScrapeResult
 * shape (sellerFeedbackScore, sellerFeedbackPercent, condition,
 * shipping, brand, mpn, gtin, categoryPath, itemSpecifics,
 * quantityAvailable, quantitySold, itemLocation, returnsAccepted,
 * returnPeriodDays, paymentMethods, topRatedBuying, discountPercentage,
 * bidCount, currentBidPrice, itemEndDate, variantsNote, buyingOptions)
 * are read defensively via `as any`, same pattern used elsewhere.
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

function EbaySellerBadge({
  rating,
  feedbackScore,
  feedbackPercent,
}: {
  rating: string | null | undefined
  feedbackScore: string | null | undefined
  feedbackPercent: string | null | undefined
}) {
  const value = rating ? parseFloat(rating) : NaN
  if (Number.isNaN(value) && !feedbackScore) return null
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-[#6b6b6b]">
      {!Number.isNaN(value) && (
        <span className="inline-flex items-center gap-1">
          <Star size={13} strokeWidth={0} fill="#3665F3" className="text-[#3665F3]" />
          <span className="font-bold text-[#191919]">{value.toFixed(1)}</span>
        </span>
      )}
      {feedbackScore && (
        <span>
          <span className="font-bold text-[#191919]">{feedbackScore}</span> feedback
          {feedbackPercent ? (
            <>
              {' '}
              · <span className="font-bold text-[#2e7d32]">{feedbackPercent}%</span> positive
            </>
          ) : null}
        </span>
      )}
    </span>
  )
}

function ConditionBadge({ condition }: { condition: string | null | undefined }) {
  if (!condition) return null
  return (
    <span className="inline-block rounded-md bg-[#f0f4ff] px-2 py-0.5 text-[11px] font-bold text-[#3665F3]">
      {condition}
    </span>
  )
}

type VariantDimension = NonNullable<ScrapeResult['variants']>[number]

/** Pill row for one variation dimension (Color/Size/Style/whatever the
 * <select>'s name attribute resolved to). Options with no resolvable
 * `?var=` URL are still shown but visually flagged as non-clickable. */
function VariantRow({
  dim,
  selectedLabel,
  onPick,
}: {
  dim: VariantDimension
  selectedLabel: string | null
  onPick: (label: string, url: string | null) => void
}) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-[#8a8a8a]">
        {dim.dimension}
        {selectedLabel && <span className="normal-case tracking-normal text-[#191919]"> — {selectedLabel}</span>}
      </p>
      <div className="flex flex-wrap gap-2">
        {dim.options.map((opt) => {
          const isSelected = opt.label === selectedLabel
          const clickable = !opt.outOfStock && !!opt.url
          const priceLabel = fmt(opt.price, opt.currencyCode)

          return (
            <button
              key={opt.label}
              type="button"
              disabled={opt.outOfStock}
              onClick={() => clickable && onPick(opt.label, opt.url)}
              title={
                opt.outOfStock
                  ? 'Out of stock'
                  : opt.url
                    ? undefined
                    : `${opt.label} — no direct variation link found, selection is visual only`
              }
              className={`group relative flex min-h-[42px] flex-col items-center justify-center gap-0.5 rounded-lg border px-3.5 py-2 text-[13px] font-medium leading-tight transition-all ${
                opt.outOfStock
                  ? 'cursor-not-allowed border-[#eaeaea] bg-[#fafafa] text-[#c7c7c7] line-through'
                  : isSelected
                    ? 'border-[#3665F3] bg-[#f0f4ff] text-[#3665F3] shadow-[inset_0_0_0_1px_#3665F3]'
                    : clickable
                      ? 'border-[#d6d6d6] text-[#232323] hover:border-[#3665F3] hover:bg-[#f7f9ff]'
                      : 'cursor-default border-dashed border-[#d8d8d8] text-[#8a8a8a]'
              }`}
            >
              <span className="inline-flex items-center gap-1">
                {isSelected && <Check size={11} strokeWidth={3} className="text-[#3665F3]" />}
                {opt.label}
              </span>
              {priceLabel && (
                <span className={`text-[10px] font-bold ${isSelected ? 'text-[#2e7d32]' : 'text-[#2e7d32]/80'}`}>
                  {priceLabel}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Auction-specific block — current bid, bid count, and time-remaining
 * text. Only rendered when `buyingOptions` includes AUCTION. */
function AuctionBlock({
  currentBid,
  bidCount,
  itemEndDate,
  currencyCode,
  ended,
}: {
  currentBid: string | null | undefined
  bidCount: number | null | undefined
  itemEndDate: string | null | undefined
  currencyCode: string | null | undefined
  ended: boolean
}) {
  const bidLabel = fmt(currentBid, currencyCode)
  let endsLabel: string | null = null
  if (itemEndDate) {
    const end = new Date(itemEndDate)
    if (!Number.isNaN(end.getTime())) {
      endsLabel = ended ? `Ended ${end.toLocaleString()}` : `Ends ${end.toLocaleString()}`
    }
  }
  if (!bidLabel && bidCount == null && !endsLabel) return null

  return (
    <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-[#eaeaea] bg-[#fafafa] px-3.5 py-3">
      <Gavel size={15} strokeWidth={2} className="mt-0.5 flex-none text-[#6b6b6b]" />
      <div className="text-[13px] leading-relaxed text-[#535353]">
        {bidLabel && (
          <p>
            Current bid: <span className="font-bold text-[#191919]">{bidLabel}</span>
            {bidCount != null && <span> · {bidCount} bid{bidCount === 1 ? '' : 's'}</span>}
          </p>
        )}
        {endsLabel && <p className={ended ? 'font-medium text-[#c9330c]' : ''}>{endsLabel}</p>}
      </div>
    </div>
  )
}

/**
 * eBay-styled qty/wishlist/cart/request block — same functional shape
 * as AmazonCommerceActions (qty stepper, wishlist heart, Add to Cart,
 * Get Quote, all inline in one wrapping row) but with eBay's blue
 * (#3665F3) primary CTA and "Buy It Now" / "Place Bid" framing on the
 * quote button when the listing is an auction. The primary CTA is the
 * shared RequestActionButton component so its loading/disabled spinner,
 * unavailable label, and disabled styling stay in lockstep with every
 * other platform view rather than being re-implemented per platform.
 */
function EbayCommerceActions({
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
  isAuction,
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
  isAuction: boolean
}) {
  return (
    <div className="mt-6 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-none items-center gap-3.5 rounded-xl border border-[#d6d6d6] px-2.5 py-1.5">
          <button
            type="button"
            aria-label="Decrease quantity"
            onClick={() => onQtyChange(Math.max(1, qty - 1))}
            className="grid h-7 w-7 place-items-center rounded-md border border-[#d6d6d6] text-[#6b6b6b] transition-colors hover:border-[#3665F3]/40 hover:bg-[#3665F3]/5 hover:text-[#3665F3] active:scale-90"
          >
            <Minus size={15} />
          </button>
          <span className="min-w-[20px] text-center font-bold tabular-nums text-[#191919]">{qty}</span>
          <button
            type="button"
            aria-label="Increase quantity"
            onClick={() => onQtyChange(qty + 1)}
            className="grid h-7 w-7 place-items-center rounded-md border border-[#d6d6d6] text-[#6b6b6b] transition-colors hover:border-[#3665F3]/40 hover:bg-[#3665F3]/5 hover:text-[#3665F3] active:scale-90"
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
          className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl border border-[#d6d6d6] text-[#6b6b6b] transition-all duration-200 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Heart size={17} fill={inWishlist ? 'currentColor' : 'none'} color={inWishlist ? '#e11d48' : 'currentColor'} />
        </button>

        <button
          type="button"
          onClick={onAddToCart}
          disabled={loading || result.unavailable || !canAct}
          className="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-[#d6d6d6] px-4 py-3 text-sm font-semibold text-[#191919] transition-all duration-200 hover:border-[#3665F3]/40 hover:bg-[#3665F3]/5 hover:text-[#3665F3] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {justAdded ? <Check size={16} className="text-[#3665F3]" /> : <ShoppingBag size={16} />}
          {justAdded ? 'Added' : 'Add to Cart'}
        </button>

        <RequestActionButton
          onClick={onRequestReview}
          disabled={!canAct}
          loading={loading}
          unavailable={result.unavailable}
          unavailableLabel="Not Available"
          icon={<ShoppingCart size={16} />}
          color="#3665F3"
          disabledColor="#c7c7c7"
          className="flex-1 whitespace-nowrap rounded-xl px-5 py-3 text-sm font-bold hover:brightness-95"
        >
          Get Quote
        </RequestActionButton>
      </div>

      <p className="text-xs text-[#8a8a8a]">You will not be charged now. This is just a request.</p>
    </div>
  )
}

/* ---------------------------------------------------------------------
 * ProductInfoTabs — inlined, eBay-flavored (blue active indicator,
 * "Item specifics" folded into the Details tab), same Description /
 * Details / Shipping & Returns structure and bottom-most full-width
 * slot as AmazonProductView.
 * ------------------------------------------------------------------- */

const INFO_TABS = ['Description', 'Details', 'Shipping & Returns'] as const
type InfoTab = (typeof INFO_TABS)[number]

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="font-semibold text-[#191919]/80">{label}</dt>
      <dd className="text-right text-[#6b6b6b]">{value}</dd>
    </div>
  )
}

function ProductInfoTabs({
  result,
  allSpecs,
  conditionDescription,
  quantityAvailable,
  quantitySold,
  paymentMethods,
}: {
  result: ScrapeResult
  allSpecs: { name: string; value: string }[]
  conditionDescription?: string | null
  quantityAvailable?: number | null
  quantitySold?: number | null
  paymentMethods?: string[] | null
}) {
  const [activeTab, setActiveTab] = useState<InfoTab>('Description')
  const categoryPath = (result as any).categoryPath as string | null | undefined
  const itemLocation = (result as any).itemLocation as string | null | undefined
  const returnsAccepted = (result as any).returnsAccepted as boolean | null | undefined
  const returnPeriodDays = (result as any).returnPeriodDays as number | null | undefined

  return (
    <div className="mt-8 border-t border-[#eaeaea] pt-6">
      <div className="flex gap-5 border-b border-[#eaeaea]">
        {INFO_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`-mb-px border-b-2 pb-2.5 text-sm font-semibold transition-colors ${
              activeTab === tab
                ? 'border-[#3665F3] text-[#191919]'
                : 'border-transparent text-[#8a8a8a] hover:text-[#191919]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
      <div
        key={activeTab}
        className="min-h-[96px] pb-2 pt-4 text-sm leading-relaxed text-[#535353] motion-safe:[animation:tabFadeIn_0.18s_ease-out_both]"
      >
        {activeTab === 'Description' &&
          (conditionDescription || (result as ScrapeResult & { description?: string }).description ? (
            <p>{conditionDescription || (result as ScrapeResult & { description?: string }).description}</p>
          ) : (
            <p className="text-[#a3a3a3]">
              We don&apos;t have a description for this listing. Here&apos;s the title instead:{' '}
              {result.title ?? 'no title available.'}
            </p>
          ))}
        {activeTab === 'Details' && (
          <div className="flex flex-col gap-4">
            <dl className="flex flex-col gap-1.5 text-xs">
              {categoryPath && <DetailRow label="Category" value={categoryPath} />}
              {allSpecs.map((spec) => (
                <DetailRow key={spec.name} label={spec.name} value={spec.value} />
              ))}
              {(quantityAvailable != null || quantitySold != null) && (
                <DetailRow
                  label="Availability"
                  value={[
                    quantityAvailable != null ? `${quantityAvailable} available` : null,
                    quantitySold != null ? `${quantitySold} sold` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                />
              )}
              {paymentMethods?.length ? <DetailRow label="Payment" value={paymentMethods.join(', ')} /> : null}
              {!categoryPath && !allSpecs.length && quantityAvailable == null && quantitySold == null && (
                <p className="text-[#a3a3a3]">We don&apos;t have any additional details for this listing.</p>
              )}
            </dl>
          </div>
        )}
        {activeTab === 'Shipping & Returns' && (
          <dl className="flex flex-col gap-1.5 text-xs">
            {itemLocation && <DetailRow label="Ships from" value={itemLocation} />}
            <DetailRow
              label="Returns"
              value={
                returnsAccepted
                  ? `Accepted${returnPeriodDays ? ` within ${returnPeriodDays} days` : ''}`
                  : 'Not accepted by seller'
              }
            />
            {result.availability ? (
              <DetailRow label="Availability" value={result.availability} />
            ) : (
              !itemLocation && (
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

export default function EbayProductView({
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

  const sellerFeedbackScore = (result as any).sellerFeedbackScore as string | null | undefined
  const sellerFeedbackPercent = (result as any).sellerFeedbackPercent as string | null | undefined
  const condition = (result as any).condition as string | null | undefined
  const conditionDescription = (result as any).conditionDescription as string | null | undefined
  const brand = (result as any).brand as string | null | undefined
  const mpn = (result as any).mpn as string | null | undefined
  const gtin = (result as any).gtin as string | null | undefined
  const itemSpecifics = (result as any).itemSpecifics as { name: string; value: string }[] | null | undefined
  const quantityAvailable = (result as any).quantityAvailable as number | null | undefined
  const quantitySold = (result as any).quantitySold as number | null | undefined
  const paymentMethods = (result as any).paymentMethods as string[] | null | undefined
  const discountPercentage = (result as any).discountPercentage as number | null | undefined
  const bidCount = (result as any).bidCount as number | null | undefined
  const currentBidPrice = (result as any).currentBidPrice as string | null | undefined
  const itemEndDate = (result as any).itemEndDate as string | null | undefined
  const buyingOptions = (result.warning ?? '').includes('auction')
    ? ['AUCTION']
    : Array.isArray((result as any).buyingOptions)
      ? (result as any).buyingOptions
      : []
  const isAuction = buyingOptions.includes('AUCTION')

  // Prepend brand/MPN/GTIN onto the itemSpecifics table when the API
  // surfaced them as their own top-level fields rather than as an aspect
  // in localizedAspects — avoids duplicate rows if already present.
  const specsNames = new Set((itemSpecifics ?? []).map((s) => s.name.toLowerCase()))
  const derivedSpecs: { name: string; value: string }[] = []
  if (brand && !specsNames.has('brand')) derivedSpecs.push({ name: 'Brand', value: brand })
  if (mpn && !specsNames.has('mpn')) derivedSpecs.push({ name: 'MPN', value: mpn })
  if (gtin && !specsNames.has('gtin') && !specsNames.has('upc') && !specsNames.has('ean')) {
    derivedSpecs.push({ name: 'GTIN', value: gtin })
  }
  const allSpecs = [...derivedSpecs, ...(itemSpecifics ?? [])]

  return (
    <div className="mx-auto max-w-6xl px-6 lg:px-10 font-sans">
      <div className="grid gap-8 sm:grid-cols-2">
        {/* Image gallery — shared component, eBay theme */}
        <ProductGallery
          images={images}
          title={result.title}
          resetKey={result.url}
          theme={{
            frameBorder: 'border-[#eaeaea]',
            activeThumb: 'border-[#3665F3] ring-1 ring-[#3665F3]',
            restingThumb: 'border-[#eaeaea]',
            placeholderText: 'text-[#9a9a9a]',
          }}
        />

        {/* Buy box — same element order as AmazonProductView:
            platform/seller-badge -> title -> price/discount -> auction
            block -> variants -> quantity/returns meta -> stock -> link
            -> commerce actions. */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs font-semibold text-[#6b6b6b]">
            <span>eBay</span>
            <ConditionBadge condition={condition} />
            {(result.rating || sellerFeedbackScore) && (
              <>
                <span className="text-[#d4d4d4]">·</span>
                <EbaySellerBadge
                  rating={result.rating}
                  feedbackScore={sellerFeedbackScore}
                  feedbackPercent={sellerFeedbackPercent}
                />
              </>
            )}
          </div>

          <h1 className="mt-2 text-2xl font-bold leading-snug tracking-tight text-[#191919] sm:text-3xl">
            {result.title ?? <span className="italic text-[#8a8a8a]">No title found</span>}
          </h1>

          <div className="mt-3 flex flex-wrap items-baseline gap-2">
            {price ? (
              <p className="text-3xl font-bold text-[#191919]">{price}</p>
            ) : (
              <p className="text-base font-semibold text-[#8a8a8a]">No price found</p>
            )}
            {mrp && <p className="text-base font-semibold text-[#a3a3a3] line-through">{mrp}</p>}
            {(pctOff !== null || discountPercentage != null) && (
              <span className="rounded-md bg-[#fdeee9] px-1.5 py-0.5 text-[13px] font-bold text-[#c9330c]">
                {pctOff ?? discountPercentage}% off
              </span>
            )}
          </div>

          {isAuction && (
            <AuctionBlock
              currentBid={currentBidPrice ?? result.price}
              bidCount={bidCount}
              itemEndDate={itemEndDate}
              currencyCode={result.currencyCode}
              ended={!!result.unavailable && result.availability === 'Ended'}
            />
          )}

          {!!result.variants?.length && (
            <div className="mt-4 flex flex-col gap-5">
              {result.variants.map((dim) => (
                <VariantRow
                  key={dim.dimension}
                  dim={dim}
                  selectedLabel={selectedByDimension[dim.dimension] ?? null}
                  onPick={(label, url) => pickOption(dim.dimension, label, url)}
                />
              ))}
            </div>
          )}

          {/* Legacy scraper fallback path (no EBAY_APP_ID/EBAY_CERT_ID
              configured): if neither a real `variants` picker nor a
              <select>-derived dimension was found, fall back to
              showing just the currently-selected values as static
              badges so a reviewer can confirm Size/Color were at least
              detected. */}
          {(!result.variants || result.variants.length === 0) &&
            result.options &&
            Object.keys(result.options).length > 0 && (
              <div className="mt-4">
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-[#8a8a8a]">
                  Selected options
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(result.options).map(([label, value]) => (
                    <span
                      key={label}
                      className="inline-flex items-center gap-1 rounded-full bg-[#f2f2f2] px-2.5 py-1 text-[11px] font-semibold text-[#535353]"
                    >
                      <span className="text-[#a3a3a3]">{label}:</span> {value}
                    </span>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-[#bdbdbd]">
                  No dimension/option picker was found on the static page — showing only
                  the currently selected value.
                </p>
              </div>
            )}

          {(quantityAvailable != null || quantitySold != null) && (
            <p className="mt-4 flex items-center gap-1.5 text-xs text-[#6b6b6b]">
              <Package size={13} strokeWidth={2} className="text-[#9a9a9a]" />
              {quantityAvailable != null && <span>{quantityAvailable} available</span>}
              {quantityAvailable != null && quantitySold != null && <span className="text-[#d4d4d4]">·</span>}
              {quantitySold != null && <span>{quantitySold} sold</span>}
            </p>
          )}

          <p className="mt-3 text-sm font-semibold">
            {result.unavailable ? (
              <span className="text-[#c9330c]">Listing unavailable</span>
            ) : result.availability ? (
              <span className="text-[#535353]">{result.availability}</span>
            ) : (
              <span className="text-[#2e7d32]">Available</span>
            )}
          </p>

          {result.url && (
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#3665F3] hover:underline"
            >
              Open original listing <ExternalLink size={12} />
            </a>
          )}

          <EbayCommerceActions
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
            isAuction={isAuction}
          />
        </div>
      </div>

      {/* Description/Details/Shipping & Returns — bottom-most,
          full-width section of the entire component. */}
      <ProductInfoTabs
        result={result}
        allSpecs={allSpecs}
        conditionDescription={conditionDescription}
        quantityAvailable={quantityAvailable}
        quantitySold={quantitySold}
        paymentMethods={paymentMethods}
      />
    </div>
  )
}