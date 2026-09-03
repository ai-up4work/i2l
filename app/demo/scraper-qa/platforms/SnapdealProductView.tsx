// app/demo/scraper-qa/platforms/SnapdealProductView.tsx
'use client'

import { ExternalLink, Star } from 'lucide-react'
import { formatPrice } from '@/lib/currency'
import type { ScrapeResult } from '@/lib/scrape/parsers'

function fmtPrice(amount: string | null | undefined, currency: string | null | undefined) {
  const n = amount != null ? Number(amount) : NaN
  if (Number.isNaN(n)) return null
  try {
    return formatPrice(n, currency ?? 'LKR')
  } catch {
    return `${currency ?? ''} ${n}`.trim()
  }
}

function ImageGallery({ images, alt }: { images: string[]; alt: string }) {
  if (!images.length) {
    return (
      <div className="grid aspect-square place-items-center rounded-xl border border-dashed border-ink/15 bg-card text-xs font-medium text-ink/35">
        No images found
      </div>
    )
  }
  const [main, ...rest] = images
  return (
    <div className="flex gap-3">
      {rest.length > 0 && (
        <div className="flex flex-col gap-2">
          {rest.slice(0, 5).map((src) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={src}
              src={src}
              alt=""
              className="h-12 w-12 flex-none rounded-md border border-ink/10 bg-white object-contain"
            />
          ))}
        </div>
      )}
      <div className="aspect-square flex-1 overflow-hidden rounded-xl border border-ink/10 bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={main} alt={alt} className="h-full w-full object-contain" />
      </div>
    </div>
  )
}

function RatingBadge({ rating, count }: { rating: string | null | undefined; count?: string | null }) {
  const value = rating ? parseFloat(rating) : NaN
  if (Number.isNaN(value)) return null
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-bold text-white">
        {value.toFixed(1)}
        <Star size={10} className="fill-white" strokeWidth={0} />
      </span>
      {count && <span className="text-xs font-medium text-ink/45">{count} Ratings</span>}
    </span>
  )
}

/** Snapdeal has no known size/color picker worth scraping today (see
 * extractors/snapdeal.ts), so `onSelectVariant` is accepted only to keep
 * this component's prop contract identical to every other platform view —
 * ScraperQaClient wires all of them up the same way regardless of whether
 * a given site actually has variants to click. */
export default function SnapdealProductView({
  result,
}: {
  result: ScrapeResult
  onSelectVariant: (url: string) => void
}) {
  const price = fmtPrice(result.price, result.currencyCode)
  const mrp = result.mrp && result.mrp !== result.price ? fmtPrice(result.mrp, result.currencyCode) : null
  const discountPct =
    result.price && result.mrp && Number(result.mrp) > Number(result.price)
      ? Math.round((1 - Number(result.price) / Number(result.mrp)) * 100)
      : null

  return (
    <div className="rounded-2xl border border-ink/10 bg-white p-5">
      <div className="grid gap-8 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <ImageGallery images={result.images ?? []} alt={result.title ?? 'Product image'} />

        <div>
          <span className="inline-flex items-center gap-1.5 rounded bg-red-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-red-600 ring-1 ring-inset ring-red-200">
            Snapdeal
          </span>

          <h2 className="mt-2 text-lg font-semibold leading-snug text-ink">
            {result.title ?? <span className="italic text-ink/35">No title found</span>}
          </h2>

          {result.rating && (
            <div className="mt-2">
              <RatingBadge rating={result.rating} count={result.review_count} />
            </div>
          )}

          <div className="mt-4 h-px w-full bg-ink/10" />

          <div className="mt-4 flex flex-wrap items-baseline gap-2">
            <p className="text-3xl font-bold text-red-600">
              {price ?? <span className="text-base font-semibold text-ink/35">No price found</span>}
            </p>
            {mrp && <p className="text-sm font-medium text-ink/40 line-through">{mrp}</p>}
            {discountPct != null && discountPct > 0 && (
              <span className="text-sm font-bold text-teal-deep">{discountPct}% off</span>
            )}
          </div>

          {result.availability && (
            <p className="mt-2 inline-block rounded-md bg-card px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink/55 ring-1 ring-inset ring-ink/10">
              {result.availability}
            </p>
          )}

          {result.seller && (
            <p className="mt-3 text-xs text-ink/50">
              Sold by <span className="font-semibold text-ink/70">{result.seller}</span>
            </p>
          )}

          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-ink/45 transition-colors hover:text-ink"
          >
            Open original listing <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </div>
  )
}