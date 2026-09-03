// app/demo/scraper-qa/platforms/EbayProductView.tsx
'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, Star, ShieldCheck, Truck, MapPin, Gavel, AlertTriangle, Package } from 'lucide-react'
import { formatPrice } from '@/lib/currency'
import type { ScrapeResult } from '@/lib/scrape/parsers'

/**
 * Renders a scrape result to look like a real eBay item page — blue
 * price block, "Buy It Now" button, seller feedback score/percentage,
 * condition badge, variation dropdowns rendered as pill rows (eBay
 * itself uses native <select> elements; this view flattens each
 * dimension into clickable pills, same convention already used for
 * Myntra's size row).
 *
 * Purely presentational / read-only, same as every other platform view
 * in this QA tool — the Buy It Now button is disabled.
 *
 * NOTE: unlike MyntraProductView, eBay's `rating`/`review_count` fields
 * (per extractEbayRating/extractEbayReviewCount in ebay.ts) represent
 * SELLER feedback rating, not a per-product review score — this view
 * labels it "Seller rating" rather than reusing Amazon/Myntra's
 * product-rating framing, to avoid implying something the underlying
 * data doesn't actually mean.
 *
 * Extra fields eBay's extractor captures beyond the typed ScrapeResult
 * shape (sellerFeedbackScore, sellerFeedbackPercent, condition,
 * shipping, brand, mpn, gtin, categoryPath, itemSpecifics,
 * quantityAvailable, quantitySold, itemLocation, returnsAccepted,
 * returnPeriodDays, paymentMethods, topRatedBuying, discountPercentage,
 * bidCount, currentBidPrice, itemEndDate, variantsNote) are read
 * defensively via `as any`, same pattern already used for Myntra's
 * countryOfOrigin/manufacturer/myntraStyleId.
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
    <div className="flex items-center gap-1.5 text-xs text-[#535353]">
      {!Number.isNaN(value) && (
        <span className="inline-flex items-center gap-0.5">
          <Star size={12} strokeWidth={0} fill="#3665F3" className="text-[#3665F3]" />
          <span className="font-semibold">{value.toFixed(1)}</span>
        </span>
      )}
      {feedbackScore && (
        <span>
          {feedbackScore} feedback{feedbackPercent ? ` · ${feedbackPercent}% positive` : ''}
        </span>
      )}
    </div>
  )
}

type VariantDimension = NonNullable<ScrapeResult['variants']>[number]

/** Pill row for one variation dimension (Color/Size/Style/whatever the
 * <select>'s name attribute resolved to). Options with no resolvable
 * `?var=` URL are still shown (matches the "visible but not necessarily
 * actionable" convention used across every other platform view in this
 * tool) but visually flagged as non-clickable. */
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
      <p className="text-xs font-bold uppercase tracking-wide text-[#767676]">
        {dim.dimension}
        {selectedLabel && <span className="normal-case text-[#191919]"> — {selectedLabel}</span>}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
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
              className={`flex min-h-9 flex-col items-center justify-center rounded-md border px-3 py-1.5 text-[13px] font-medium leading-tight ${
                opt.outOfStock
                  ? 'cursor-not-allowed border-[#e5e5e5] text-[#c7c7c7] line-through'
                  : isSelected
                    ? 'border-[#3665F3] bg-[#eef2ff] text-[#3665F3]'
                    : clickable
                      ? 'border-[#c7c7c7] text-[#191919] hover:border-[#3665F3]'
                      : 'cursor-default border-dashed border-[#d8d8d8] text-[#767676]'
              }`}
            >
              <span>{opt.label}</span>
              {priceLabel && (
                <span className="text-[10px] font-bold text-[#2e7d32]">{priceLabel}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** "Item specifics" table — eBay's own name for this block (Brand,
 * MPN, Color, Material, ...). Sourced from `itemSpecifics`
 * (localizedAspects off the Browse API item), which is a superset of
 * whatever subset happens to vary across sibling variants — so this is
 * the only place a reviewer sees e.g. "Material: Cotton" when every
 * sibling shares that value and it therefore never became a variant
 * dimension. */
function ItemSpecifics({ specs }: { specs: { name: string; value: string }[] | null | undefined }) {
  if (!specs || !specs.length) return null
  return (
    <div className="mt-5 rounded-lg border border-[#e5e5e5]">
      <p className="border-b border-[#e5e5e5] bg-[#f7f7f7] px-3 py-2 text-xs font-bold uppercase tracking-wide text-[#535353]">
        Item specifics
      </p>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1.5 px-3 py-2.5 text-[13px]">
        {specs.map((spec) => (
          <div key={spec.name} className="contents">
            <dt className="text-[#767676]">{spec.name}</dt>
            <dd className="text-[#191919]">{spec.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** Auction-specific block — current bid, bid count, and time-remaining
 * text. Only rendered when `buyingOptions` includes AUCTION; a
 * Buy-It-Now-only listing never shows this. Uses `currentBidPrice`
 * (falls back to `price`, since the Browse API's top-level `price` on
 * an active auction already reflects the current high bid) and
 * `itemEndDate` for a plain relative-time string — no live countdown,
 * since this is a read-only QA snapshot, not the real listing page. */
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
      endsLabel = ended
        ? `Ended ${end.toLocaleString()}`
        : `Ends ${end.toLocaleString()}`
    }
  }
  if (!bidLabel && bidCount == null && !endsLabel) return null

  return (
    <div className="mt-3 flex items-start gap-2 rounded-lg border border-[#e5e5e5] bg-[#fafafa] px-3 py-2.5">
      <Gavel size={15} strokeWidth={2} className="mt-0.5 flex-none text-[#535353]" />
      <div className="text-[13px] text-[#535353]">
        {bidLabel && (
          <p>
            Current bid: <span className="font-bold text-[#191919]">{bidLabel}</span>
            {bidCount != null && <span> · {bidCount} bid{bidCount === 1 ? '' : 's'}</span>}
          </p>
        )}
        {endsLabel && <p className={ended ? 'text-[#c9330c]' : ''}>{endsLabel}</p>}
      </div>
    </div>
  )
}

export default function EbayProductView({
  result,
  onSelectVariant,
}: {
  result: ScrapeResult
  onSelectVariant: (url: string) => void
}) {
  const images = result.images ?? []
  const [mainImage, setMainImage] = useState(images[0] ?? null)

  const [selectedByDimension, setSelectedByDimension] = useState<Record<string, string>>({})

  useEffect(() => {
    setMainImage((result.images ?? [])[0] ?? null)

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
  const shipping = (result as any).shipping as string | null | undefined
  const brand = (result as any).brand as string | null | undefined
  const mpn = (result as any).mpn as string | null | undefined
  const gtin = (result as any).gtin as string | null | undefined
  const categoryPath = (result as any).categoryPath as string | null | undefined
  const itemSpecifics = (result as any).itemSpecifics as { name: string; value: string }[] | null | undefined
  const quantityAvailable = (result as any).quantityAvailable as number | null | undefined
  const quantitySold = (result as any).quantitySold as number | null | undefined
  const itemLocation = (result as any).itemLocation as string | null | undefined
  const returnsAccepted = (result as any).returnsAccepted as boolean | null | undefined
  const returnPeriodDays = (result as any).returnPeriodDays as number | null | undefined
  const paymentMethods = (result as any).paymentMethods as string[] | null | undefined
  const topRatedBuying = (result as any).topRatedBuying as boolean | undefined
  const discountPercentage = (result as any).discountPercentage as number | null | undefined
  const bidCount = (result as any).bidCount as number | null | undefined
  const currentBidPrice = (result as any).currentBidPrice as string | null | undefined
  const itemEndDate = (result as any).itemEndDate as string | null | undefined
  const variantsNote = (result as any).variantsNote as string | null | undefined
  const buyingOptions = (result.warning ?? '').includes('auction')
    ? ['AUCTION']
    : (Array.isArray((result as any).buyingOptions) ? (result as any).buyingOptions : [])
  const isAuction = buyingOptions.includes('AUCTION')

  // Prepend brand/MPN/GTIN onto the itemSpecifics table when the API
  // surfaced them as their own top-level fields rather than as an aspect
  // in localizedAspects — avoids duplicate rows if they're already
  // present in itemSpecifics.
  const specsNames = new Set((itemSpecifics ?? []).map((s) => s.name.toLowerCase()))
  const derivedSpecs: { name: string; value: string }[] = []
  if (brand && !specsNames.has('brand')) derivedSpecs.push({ name: 'Brand', value: brand })
  if (mpn && !specsNames.has('mpn')) derivedSpecs.push({ name: 'MPN', value: mpn })
  if (gtin && !specsNames.has('gtin') && !specsNames.has('upc') && !specsNames.has('ean')) {
    derivedSpecs.push({ name: 'GTIN', value: gtin })
  }
  const allSpecs = [...derivedSpecs, ...(itemSpecifics ?? [])]

  return (
    <div className="rounded-2xl border border-[#e5e5e5] bg-white p-5 font-sans">
      <div className="grid gap-8 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* Image gallery */}
        <div className="flex gap-3">
          {images.length > 1 && (
            <div className="flex flex-col gap-2">
              {images.slice(0, 8).map((src) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setMainImage(src)}
                  className={`h-12 w-12 flex-none overflow-hidden rounded border ${
                    mainImage === src ? 'border-[#3665F3] ring-1 ring-[#3665F3]' : 'border-[#e5e5e5]'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-full w-full object-contain" />
                </button>
              ))}
            </div>
          )}
          <div className="aspect-square flex-1 overflow-hidden rounded-lg border border-[#e5e5e5]">
            {mainImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mainImage} alt={result.title ?? 'Product image'} className="h-full w-full object-contain" />
            ) : (
              <div className="grid h-full place-items-center text-xs text-[#767676]">No image found</div>
            )}
          </div>
        </div>

        {/* Buy box + details */}
        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            {condition && (
              <span className="inline-block rounded bg-[#f5f5f5] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#535353]">
                {condition}
              </span>
            )}
            {topRatedBuying && (
              <span className="inline-flex items-center gap-1 rounded bg-[#fff4e5] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#9a6700]">
                Top Rated Plus
              </span>
            )}
          </div>
          {conditionDescription && (
            <p className="mt-1 text-xs text-[#767676]">{conditionDescription}</p>
          )}

          {categoryPath && (
            <p className="mt-1.5 truncate text-[11px] text-[#8e8e8e]">{categoryPath}</p>
          )}

          <h2 className="mt-1.5 text-[17px] font-semibold leading-snug text-[#191919]">
            {result.title ?? <span className="italic text-[#767676]">No title found</span>}
          </h2>

          <div className="mt-2">
            <EbaySellerBadge
              rating={result.rating}
              feedbackScore={sellerFeedbackScore}
              feedbackPercent={sellerFeedbackPercent}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-baseline gap-2">
            {price ? (
              <span className="text-2xl font-bold text-[#191919]">{price}</span>
            ) : (
              <span className="text-base font-semibold text-[#767676]">No price found</span>
            )}
            {mrp && <span className="text-sm font-medium text-[#767676] line-through">{mrp}</span>}
            {(pctOff !== null || discountPercentage != null) && (
              <span className="text-sm font-bold text-[#c9330c]">
                ({pctOff ?? discountPercentage}% off)
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

          {(quantityAvailable != null || quantitySold != null) && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-[#535353]">
              <Package size={13} strokeWidth={2} />
              {quantityAvailable != null && <span>{quantityAvailable} available</span>}
              {quantityAvailable != null && quantitySold != null && <span> · </span>}
              {quantitySold != null && <span>{quantitySold} sold</span>}
            </p>
          )}

          {shipping && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-[#535353]">
              <Truck size={13} strokeWidth={2} /> {shipping}
            </p>
          )}

          {itemLocation && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-[#535353]">
              <MapPin size={13} strokeWidth={2} /> Located in {itemLocation}
            </p>
          )}

          {returnsAccepted != null && (
            <p className="mt-1.5 text-xs text-[#535353]">
              {returnsAccepted
                ? `Returns accepted${returnPeriodDays ? ` within ${returnPeriodDays} days` : ''}`
                : 'Returns not accepted'}
            </p>
          )}

          {paymentMethods && paymentMethods.length > 0 && (
            <p className="mt-1.5 text-xs text-[#767676]">
              Payment: {paymentMethods.join(', ')}
            </p>
          )}

          <div className="mt-5 flex flex-col gap-4">
            {(result.variants ?? []).map((dim) => (
              <VariantRow
                key={dim.dimension}
                dim={dim}
                selectedLabel={selectedByDimension[dim.dimension] ?? null}
                onPick={(label, url) => pickOption(dim.dimension, label, url)}
              />
            ))}
          </div>

          {/* Legacy scraper fallback path (no EBAY_APP_ID/EBAY_CERT_ID
              configured): extractEbayOptions() in ebay.ts only reads the
              currently-SELECTED value out of each <select> — it has no
              way to see the other options, since those aren't in the
              static HTML for a native <select>. So there's no clickable
              picker to offer here, just the selected values as static
              badges (same convention as OptionsRow in ScraperQaClient's
              generic layout) so a reviewer can at least confirm Size/
              Color were detected at all. Only shown when the Browse API
              path didn't already give us a real `variants` picker. */}
          {/* Legacy scraper fallback path (no EBAY_APP_ID/EBAY_CERT_ID
              configured): extractEbayVariantDimensions() in ebay.ts now
              builds a real dimension/option picker from the static
              page's own <select> elements or label/value blocks — same
              VariantRow above renders it, just without per-option price
              or image (static HTML doesn't carry those; see the
              variantsNote banner below for why). This "Selected
              options" block only shows up in the rare case NEITHER a
              <select> nor a label/value block was found at all, so at
              minimum the page's single currently-selected value (if
              any) is still visible instead of nothing. */}
          {(!result.variants || result.variants.length === 0) &&
            result.options &&
            Object.keys(result.options).length > 0 && (
              <div className="mt-5">
                <p className="text-xs font-bold uppercase tracking-wide text-[#767676]">
                  Selected options
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Object.entries(result.options).map(([label, value]) => (
                    <span
                      key={label}
                      className="inline-flex items-center gap-1 rounded-full bg-[#f5f5f5] px-2.5 py-1 text-[11px] font-semibold text-[#535353]"
                    >
                      <span className="text-[#8e8e8e]">{label}:</span> {value}
                    </span>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-[#a8a8a8]">
                  No dimension/option picker (&lt;select&gt; or label/value block) was
                  found on the static page — showing only the currently selected value.
                </p>
              </div>
            )}

          <ItemSpecifics specs={allSpecs} />

          <p className="mt-4 text-sm font-semibold">
            {result.unavailable ? (
              <span className="text-[#c9330c]">Listing unavailable</span>
            ) : result.availability ? (
              <span className="text-[#535353]">{result.availability}</span>
            ) : (
              <span className="text-[#2e7d32]">Available</span>
            )}
          </p>

          <div className="mt-4 flex gap-3 sm:max-w-[280px]">
            <button
              type="button"
              disabled
              title="Demo only — this QA tool does not place real orders"
              className="flex flex-1 cursor-not-allowed items-center justify-center rounded-full bg-[#3665F3] px-4 py-2.5 text-sm font-bold text-white opacity-70"
            >
              {isAuction ? 'Place Bid' : 'Buy It Now'}
            </button>
          </div>

          <div className="mt-4 flex items-center gap-1.5 text-[11px] text-[#767676]">
            <ShieldCheck size={13} strokeWidth={2} />
            eBay Money Back Guarantee
          </div>

          <div className="mt-3 space-y-1 text-[13px] text-[#535353]">
            {result.seller && <p>Sold by {result.seller}</p>}
            <p className="text-[#767676]">source: {result.source === 'direct' ? 'fetched directly' : 'via ScraperAPI'}</p>
          </div>

          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#3665F3] hover:underline"
          >
            Open original listing <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </div>
  )
}