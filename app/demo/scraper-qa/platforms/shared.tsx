// app/demo/scraper-qa/platforms/shared.tsx
//
// Small building blocks reused across every dedicated platform view in
// this folder (AmazonProductView, FlipkartProductView, ... and the newer
// FirstCryProductView, NykaaProductView, HopscotchProductView,
// TataCliqProductView, AliExpressProductView). Keeping these here means
// each platform file only has to carry ITS OWN layout/color identity,
// not re-implement image galleries or variant pickers from scratch.

import { formatPrice } from '@/lib/currency'
import { Star } from 'lucide-react'
import type { ScrapeResult } from '@/lib/scrape/parsers'

export function fmtPrice(amount: string | null | undefined, currency: string | null | undefined) {
  const n = amount != null ? Number(amount) : NaN
  if (Number.isNaN(n)) return null
  try {
    return formatPrice(n, currency ?? 'LKR')
  } catch {
    return `${currency ?? ''} ${n}`.trim()
  }
}

/** Simple thumbnail strip + main image. Accent color customizes the
 * border/ring so each platform view keeps its own identity. */
export function ImageStrip({
  images,
  alt,
  accentBorderClass = 'border-ink/10',
}: {
  images: string[]
  alt: string
  accentBorderClass?: string
}) {
  if (!images.length) {
    return (
      <div className="grid aspect-square place-items-center rounded-2xl border border-dashed border-ink/15 bg-card text-xs font-medium text-ink/35">
        No images found
      </div>
    )
  }
  const [main, ...rest] = images
  return (
    <div>
      <div className={`aspect-square overflow-hidden rounded-2xl border bg-card ${accentBorderClass}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={main} alt={alt} className="h-full w-full object-contain" />
      </div>
      {rest.length > 0 && (
        <div className="mt-2 grid grid-cols-5 gap-2">
          {rest.slice(0, 9).map((src) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={src}
              src={src}
              alt=""
              className="aspect-square rounded-lg border border-ink/10 bg-card object-contain"
            />
          ))}
        </div>
      )}
      <p className="mt-2 text-[10px] font-medium text-ink/35">
        {images.length} image{images.length === 1 ? '' : 's'} found
      </p>
    </div>
  )
}

/** Renders 1–5 filled/outline stars from the scraper's raw rating string. */
export function RatingStars({
  rating,
  count,
  starClass = 'fill-gold-deep text-gold-deep',
}: {
  rating: string | null | undefined
  count?: string | null
  starClass?: string
}) {
  const value = rating ? parseFloat(rating) : NaN
  if (Number.isNaN(value)) return null
  const rounded = Math.round(value)
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center gap-0.5" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            size={13}
            className={i < rounded ? starClass : 'fill-transparent text-ink/20'}
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

/** Small badge row for the currently-selected variant (Size, Color, ...). */
export function OptionsRow({ options }: { options: Record<string, string> | null | undefined }) {
  if (!options || !Object.keys(options).length) return null
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {Object.entries(options).map(([label, value]) => (
        <span
          key={label}
          className="inline-flex items-center gap-1 rounded-full bg-card px-2.5 py-1 text-[11px] font-semibold text-ink/60 ring-1 ring-inset ring-ink/10"
        >
          <span className="text-ink/40">{label}:</span> {value}
        </span>
      ))}
    </div>
  )
}

/** Small inline fact list — only renders what the scraper actually returned. */
export function SpecRow({ result }: { result: ScrapeResult }) {
  const specs: string[] = []
  if (result.site) specs.push(result.site)
  if (result.source) {
    specs.push(
      result.source === 'direct'
        ? 'fetched directly'
        : result.source === 'shopify_api'
          ? "via Shopify's product API"
          : result.source === 'woocommerce_api'
            ? "via WooCommerce's Store API"
            : 'via ScraperAPI'
    )
  }
  // No dedicated extractor for this platform — result came entirely from
  // the generic embedded-state/JSON-LD/OG-meta fallback chain. See
  // ScrapeResult.ogOnly's doc comment in parsers.ts.
  if (result.ogOnly) specs.push('parsed from Open Graph tags only — no dedicated extractor')
  if (result.seller) specs.push(`Sold by ${result.seller}`)
  if (!specs.length) return null

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-ink/45">
      {specs.map((s, i) => (
        <span key={s} className="inline-flex items-center gap-2.5">
          {i > 0 && <span className="text-ink/20">·</span>}
          {s}
        </span>
      ))}
    </div>
  )
}

/** Amazon-style clickable variant grid. Accent classes let each platform
 * view color the "selected" state to match its own brand. See the
 * doc comment on VariantPicker in the original ScraperQaClient for the
 * full explanation of clickable/disabled/out-of-stock tile states —
 * unchanged here, just parameterized on color. */
export function VariantPicker({
  variants,
  onSelect,
  selectedBorderClass = 'border-teal bg-teal/10',
  hoverBorderClass = 'hover:border-teal/50',
  priceClass = 'text-teal-deep',
}: {
  variants: NonNullable<ScrapeResult['variants']>
  onSelect: (url: string) => void
  selectedBorderClass?: string
  hoverBorderClass?: string
  priceClass?: string
}) {
  return (
    <div className="mt-4 flex flex-col gap-3">
      {variants.map((dim) => (
        <div key={dim.dimension}>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink/45">
            {dim.dimension}
          </p>
          <div className="flex flex-wrap gap-2">
            {dim.options.map((opt) => {
              const priceLabel = fmtPrice(opt.price, opt.currencyCode)
              const clickable = !!opt.url && !opt.selected && !opt.outOfStock
              return (
                <button
                  key={opt.label}
                  type="button"
                  disabled={!clickable}
                  onClick={() => opt.url && onSelect(opt.url)}
                  title={
                    opt.outOfStock
                      ? 'Out of stock'
                      : opt.url
                        ? undefined
                        : 'No direct link found for this option'
                  }
                  className={`flex flex-col items-center gap-1 rounded-xl border px-2.5 py-2 text-left transition-colors ${
                    opt.selected
                      ? selectedBorderClass
                      : opt.outOfStock
                        ? 'cursor-not-allowed border-ink/8 bg-card/50 opacity-40 grayscale'
                        : clickable
                          ? `border-ink/12 bg-card ${hoverBorderClass}`
                          : 'cursor-not-allowed border-ink/8 bg-card/50 opacity-50'
                  }`}
                >
                  {opt.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={opt.image} alt={opt.label} className="h-10 w-10 rounded-md object-contain" />
                  )}
                  <span className="max-w-[80px] truncate text-[11px] font-semibold text-ink/75">
                    {opt.label}
                  </span>
                  {opt.outOfStock ? (
                    <span className="text-[9px] font-bold uppercase text-red-500">Out of stock</span>
                  ) : (
                    priceLabel && <span className={`text-[10px] font-bold ${priceClass}`}>{priceLabel}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

export type PlatformViewProps = {
  result: ScrapeResult
  onSelectVariant: (url: string) => void
}