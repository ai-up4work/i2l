// app/demo/scraper-qa/platforms/EbayProductView.tsx
'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, Star, ShieldCheck, Truck } from 'lucide-react'
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
 * shipping) are read defensively via `as any`, same pattern already
 * used for Myntra's countryOfOrigin/manufacturer/myntraStyleId.
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
              className={`flex min-h-9 items-center rounded-md border px-3 py-1.5 text-[13px] font-medium ${
                opt.outOfStock
                  ? 'cursor-not-allowed border-[#e5e5e5] text-[#c7c7c7] line-through'
                  : isSelected
                    ? 'border-[#3665F3] bg-[#eef2ff] text-[#3665F3]'
                    : clickable
                      ? 'border-[#c7c7c7] text-[#191919] hover:border-[#3665F3]'
                      : 'cursor-default border-dashed border-[#d8d8d8] text-[#767676]'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
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
  const shipping = (result as any).shipping as string | null | undefined

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
          {condition && (
            <span className="inline-block rounded bg-[#f5f5f5] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#535353]">
              {condition}
            </span>
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
            {pctOff !== null && <span className="text-sm font-bold text-[#c9330c]">({pctOff}% off)</span>}
          </div>

          {shipping && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-[#535353]">
              <Truck size={13} strokeWidth={2} /> {shipping}
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
              Buy It Now
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