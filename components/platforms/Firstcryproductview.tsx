// app/demo/scraper-qa/platforms/FirstCryProductView.tsx
'use client'

import { ExternalLink, Star, Zap, PackageX, AlertTriangle, ShoppingBag } from 'lucide-react'
import type { ScrapeResult } from '@/lib/scrape/parsers'
import { formatPrice } from '@/lib/currency'

/**
 * FirstCry look-alike view for the scrape QA tool. Same props shape as
 * every other platform component already wired into ScraperQaClient.tsx
 * (`<XProductView result={result} onSelectVariant={(url) => runLookup(url)} />`).
 *
 * Reflects FirstCry's specific extractor behavior — see
 * lib/scrape/extractors/firstcry.ts's file-header comment for the full
 * detail, summarized here:
 *   - `variants` can contain a "Color" dimension whose tiles carry no
 *     `url` at all (FirstCry swaps color via an in-page AJAX call, not
 *     navigation) — those tiles render as informational only, never
 *     clickable, regardless of `selected`/`outOfStock`.
 *   - `variants` can also contain a "Size" dimension whose tiles ARE
 *     real per-size PDPs (`url` resolves to that size's own product id)
 *     — clicking a non-selected, in-stock size tile re-scrapes that URL,
 *     same click-to-refetch pattern the generic VariantPicker in
 *     ScraperQaClient.tsx uses for Amazon/Flipkart/etc.
 *   - `rating`/`review_count` are frequently both null — FirstCry ships
 *     "0"/"NaN" for unrated products, and the extractor already
 *     normalizes both of those down to null rather than a fake "0.0"
 *     star rating, so this view simply omits the rating row when absent.
 */

type FirstCryProductViewProps = {
  result: ScrapeResult
  onSelectVariant: (url: string) => void
}

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

function ImageGallery({ images, alt }: { images: string[]; alt: string }) {
  const [main, ...rest] = images
  if (!main) {
    return (
      <div className="grid aspect-square place-items-center rounded-2xl border border-dashed border-ink/15 bg-card text-ink/25">
        <ShoppingBag size={28} strokeWidth={1.2} />
      </div>
    )
  }
  return (
    <div>
      <div className="aspect-square overflow-hidden rounded-2xl border border-ink/10 bg-card">
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

function VariantSection({
  variants,
  onSelectVariant,
}: {
  variants: NonNullable<ScrapeResult['variants']>
  onSelectVariant: (url: string) => void
}) {
  return (
    <div className="mt-4 flex flex-col gap-3">
      {variants.map((dim) => {
        // Color tiles never carry a url (see file header) — always
        // shown as informational, never clickable, regardless of what
        // outOfStock/selected happen to say for that tile.
        const isColor = dim.dimension.toLowerCase() === 'color'
        return (
          <div key={dim.dimension}>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink/45">{dim.dimension}</p>
            <div className="flex flex-wrap gap-2">
              {dim.options.map((opt) => {
                const clickable = !isColor && !!opt.url && !opt.selected && !opt.outOfStock
                return (
                  <button
                    key={opt.label}
                    type="button"
                    disabled={!clickable}
                    onClick={() => clickable && opt.url && onSelectVariant(opt.url)}
                    title={
                      isColor
                        ? 'FirstCry swaps colors in-page — open the original listing to change color'
                        : opt.outOfStock
                          ? 'Out of stock'
                          : opt.url
                            ? undefined
                            : 'No direct link found for this size'
                    }
                    className={`flex flex-col items-center gap-1 rounded-xl border px-2.5 py-2 text-left transition-colors ${
                      opt.selected
                        ? 'border-teal bg-teal/10'
                        : opt.outOfStock
                          ? 'cursor-not-allowed border-ink/8 bg-card/50 opacity-40 grayscale'
                          : clickable
                            ? 'border-ink/12 bg-card hover:border-teal/50'
                            : 'cursor-not-allowed border-ink/8 bg-card/50 opacity-60'
                    }`}
                  >
                    {opt.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={opt.image} alt={opt.label} className="h-10 w-10 rounded-md object-contain" />
                    )}
                    <span className="max-w-[90px] truncate text-[11px] font-semibold text-ink/75">{opt.label}</span>
                    {opt.outOfStock && (
                      <span className="text-[9px] font-bold uppercase text-red-500">Out of stock</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function FirstCryProductView({ result, onSelectVariant }: FirstCryProductViewProps) {
  const images = result.images ?? []
  const price = fmtPrice(result.price, result.currencyCode)
  const mrp = fmtPrice(result.mrp, result.currencyCode)
  const priceNum = result.price != null ? Number(result.price) : NaN
  const mrpNum = result.mrp != null ? Number(result.mrp) : NaN
  const discountPct =
    Number.isFinite(priceNum) && Number.isFinite(mrpNum) && mrpNum > priceNum
      ? Math.round(((mrpNum - priceNum) / mrpNum) * 100)
      : null

  return (
    <div className="grid gap-8 sm:grid-cols-2">
      <ImageGallery images={images} alt={result.title ?? 'Product image'} />

      <div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-ink/50">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-2 py-0.5 ring-1 ring-inset ring-ink/10">
            <Zap size={11} className="text-teal-deep" strokeWidth={2} />
            FirstCry
          </span>
          {result.brand && (
            <>
              <span className="text-ink/20">·</span>
              <span>{result.brand}</span>
            </>
          )}
          {result.rating && (
            <>
              <span className="text-ink/20">·</span>
              <RatingStars rating={result.rating} count={result.review_count} />
            </>
          )}
        </div>

        <h2 className="mt-2 font-display text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
          {result.title ?? <span className="italic text-ink/35">No title found</span>}
        </h2>

        <div className="mt-3 flex items-baseline gap-2">
          <p className="text-2xl font-bold text-teal-deep">
            {price ?? <span className="text-base font-semibold text-ink/35">No price found</span>}
          </p>
          {mrp && mrp !== price && <p className="text-sm font-semibold text-ink/40 line-through">{mrp}</p>}
          {discountPct != null && discountPct > 0 && (
            <span className="rounded-md bg-gold/15 px-1.5 py-0.5 text-xs font-bold text-gold-deep">
              {discountPct}% off
            </span>
          )}
        </div>

        {result.availability && (
          <p className="mt-2 inline-block rounded-md bg-card px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink/55 ring-1 ring-inset ring-ink/10">
            {result.availability}
          </p>
        )}

        {result.unavailable && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-gold/40 bg-gold/10 px-3 py-2.5">
            <PackageX size={15} className="mt-0.5 flex-none text-gold-deep" strokeWidth={1.8} />
            <p className="text-xs leading-relaxed text-ink/70">
              This size/listing looks sold out — pick another size above if one&rsquo;s shown, or check back later.
            </p>
          </div>
        )}

        {result.warning && !result.unavailable && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-gold/40 bg-gold/10 px-3 py-2.5">
            <AlertTriangle size={14} className="mt-0.5 flex-none text-gold-deep" strokeWidth={1.8} />
            <p className="text-xs leading-relaxed text-ink/70">{result.warning}</p>
          </div>
        )}

        {result.variants && result.variants.length > 0 && (
          <VariantSection variants={result.variants} onSelectVariant={onSelectVariant} />
        )}

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
  )
}