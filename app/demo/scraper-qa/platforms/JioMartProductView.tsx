'use client'

import { ExternalLink, Star, PackageX, ShoppingBag } from 'lucide-react'
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

function discountPercent(price: string | null | undefined, mrp: string | null | undefined): number | null {
  const p = price != null ? Number(price) : NaN
  const m = mrp != null ? Number(mrp) : NaN
  if (Number.isNaN(p) || Number.isNaN(m) || m <= p || m <= 0) return null
  return Math.round(((m - p) / m) * 100)
}

function RatingBadge({ rating, count }: { rating: string | null | undefined; count?: string | null }) {
  const value = rating ? parseFloat(rating) : NaN
  if (Number.isNaN(value)) return null
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-2 py-1 text-xs font-bold text-white">
      {value.toFixed(1)}
      <Star size={11} className="fill-white text-white" strokeWidth={0} />
      {count && <span className="ml-1 font-normal text-white/80">| {count}</span>}
    </span>
  )
}

function ImageStrip({ images, alt }: { images: string[]; alt: string }) {
  if (!images.length) {
    return (
      <div className="grid aspect-square place-items-center rounded-lg border border-dashed border-ink/15 bg-card text-xs font-medium text-ink/35">
        No images found
      </div>
    )
  }
  const [main, ...rest] = images
  return (
    <div>
      <div className="aspect-square overflow-hidden rounded-lg border border-ink/10 bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={main} alt={alt} className="h-full w-full object-contain" />
      </div>
      {rest.length > 0 && (
        <div className="mt-2 grid grid-cols-5 gap-2">
          {rest.slice(0, 5).map((src) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt="" className="aspect-square rounded-md border border-ink/10 bg-white object-contain" />
          ))}
        </div>
      )}
    </div>
  )
}

// JioMart's pack-size/size pills are informational only — the extractor
// never gives them a per-option URL (see extractors/jiomart.ts), so
// there's nothing to re-fetch on click, unlike Amazon/Flipkart/Meesho/
// Myntra's picker.
function OptionRow({ dimension }: { dimension: NonNullable<ScrapeResult['variants']>[number] }) {
  return (
    <div className="mt-4">
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink/45">{dimension.dimension}</p>
      <div className="flex flex-wrap gap-2">
        {dimension.options.map((opt) => (
          <span
            key={opt.label}
            title={opt.outOfStock ? 'Out of stock' : undefined}
            className={`rounded-md border px-2.5 py-1.5 text-xs font-bold ${
              opt.selected
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : opt.outOfStock
                  ? 'border-ink/10 text-ink/25 line-through'
                  : 'border-ink/20 text-ink/70'
            }`}
          >
            {opt.label}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function JioMartProductView({
  result,
}: {
  result: ScrapeResult
  onSelectVariant: (url: string) => void
}) {
  const discount = discountPercent(result.price, result.mrp)
  const priceLabel = fmtPrice(result.price, result.currencyCode)
  const mrpLabel = fmtPrice(result.mrp, result.currencyCode)

  return (
    <div>
      {result.unavailable && (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3">
          <PackageX size={16} className="mt-0.5 flex-none text-gold-deep" strokeWidth={1.8} />
          <div>
            <p className="text-xs font-bold text-ink/80">Listing appears unavailable</p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink/60">
              No &quot;Add to Cart&quot; button was found and sold-out copy was detected on the page.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-8 sm:grid-cols-2">
        <ImageStrip images={result.images ?? []} alt={result.title ?? 'Product image'} />

        <div>
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-ink/40">
            <ShoppingBag size={12} strokeWidth={2} /> JioMart
          </div>

          <h2 className="mt-2 text-base font-semibold leading-snug text-ink sm:text-lg">
            {result.title ?? <span className="italic text-ink/35">No title found</span>}
          </h2>

          {result.rating && (
            <div className="mt-2">
              <RatingBadge rating={result.rating} count={result.review_count} />
            </div>
          )}

          <div className="mt-4 flex items-baseline gap-2">
            <p className="text-xl font-extrabold text-ink">
              {priceLabel ?? <span className="text-base font-semibold text-ink/35">No price found</span>}
            </p>
            {mrpLabel && mrpLabel !== priceLabel && (
              <p className="text-sm font-medium text-ink/40 line-through">MRP {mrpLabel}</p>
            )}
            {discount != null && <p className="text-sm font-bold text-green-700">{discount}% off</p>}
          </div>
          <p className="mt-0.5 text-[10px] font-medium text-ink/35">Inclusive of all taxes</p>

          {result.options && Object.keys(result.options).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {Object.entries(result.options).map(([label, value]) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1 rounded-full bg-card px-2.5 py-1 text-[11px] font-semibold text-ink/60 ring-1 ring-inset ring-ink/10"
                >
                  <span className="text-ink/40">{label}:</span> {value}
                </span>
              ))}
            </div>
          )}

          {result.variants?.map((dim) => (
            <OptionRow key={dim.dimension} dimension={dim} />
          ))}

          {result.availability && (
            <p className="mt-4 inline-block rounded-md bg-card px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink/55 ring-1 ring-inset ring-ink/10">
              {result.availability}
            </p>
          )}

          <button
            type="button"
            disabled
            title="QA tool — not a real checkout"
            className="mt-5 w-full cursor-not-allowed rounded-lg bg-blue-600/80 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-white opacity-60 sm:max-w-[240px]"
          >
            Add to Cart
          </button>

          {result.seller && <p className="mt-4 text-[11px] font-medium text-ink/45">Sold by {result.seller}</p>}

          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-ink/45 transition-colors hover:text-ink"
          >
            Open original listing <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </div>
  )
}