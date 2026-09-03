// app/demo/scraper-qa/platforms/ShopifyProductView.tsx
'use client'

import { useState } from 'react'
import { ExternalLink, ShoppingBag, Star } from 'lucide-react'
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
    <div>
      <div className="aspect-square overflow-hidden rounded-xl border border-ink/10 bg-white">
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
              className="aspect-square rounded-lg border border-ink/10 bg-white object-contain"
            />
          ))}
        </div>
      )}
    </div>
  )
}

function RatingStars({ rating, count }: { rating: string | null | undefined; count?: string | null }) {
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

/** Options row for the currently-selected variant, e.g. Size, Color. */
function OptionsRow({ options }: { options: Record<string, string> | null | undefined }) {
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

/** Clickable variant grid — Shopify's product API already returns every
 * variant's price/image/stock in the one call that loaded this page, so
 * clicking a tile is purely a local highlight (useState), never a
 * network request. No re-fetch, no `url` needed on the option itself. */
function ShopifyVariantGrid({ variants }: { variants: NonNullable<ScrapeResult['variants']> }) {
  // One selected label per dimension, keyed by dimension name. Seeded
  // from whichever option the scraper marked `selected`.
  const [selected, setSelected] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const dim of variants) {
      const preselected = dim.options.find((o) => o.selected)
      if (preselected) initial[dim.dimension] = preselected.label
    }
    return initial
  })

  return (
    <div className="mt-4 flex flex-col gap-3">
      {variants.map((dim) => (
        <div key={dim.dimension}>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink/45">{dim.dimension}</p>
          <div className="flex flex-wrap gap-2">
            {dim.options.map((opt) => {
              const priceLabel = fmtPrice(opt.price, opt.currencyCode)
              const isSelected = selected[dim.dimension] === opt.label
              return (
                <button
                  key={opt.label}
                  type="button"
                  disabled={opt.outOfStock}
                  onClick={() =>
                    setSelected((prev) => ({ ...prev, [dim.dimension]: opt.label }))
                  }
                  title={opt.outOfStock ? 'Out of stock' : undefined}
                  className={[
                    'flex flex-col items-center gap-1 rounded-xl border px-2.5 py-2 text-left',
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200'
                      : opt.outOfStock
                        ? 'cursor-not-allowed border-ink/8 bg-card/50 opacity-40 grayscale'
                        : 'border-ink/12 bg-card hover:border-emerald-400 cursor-pointer',
                  ].join(' ')}
                >
                  {opt.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={opt.image} alt={opt.label} className="h-10 w-10 rounded-md object-contain" />
                  )}
                  <span className="max-w-[80px] truncate text-[11px] font-semibold text-ink/75">{opt.label}</span>
                  {opt.outOfStock ? (
                    <span className="text-[9px] font-bold uppercase text-red-500">Out of stock</span>
                  ) : (
                    priceLabel && <span className="text-[10px] font-bold text-emerald-700">{priceLabel}</span>
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

/** Dedicated view for Shopify results. `onSelectVariant` is accepted only
 * to keep this component's prop contract identical to every other
 * platform view — it's never called, since Shopify's variant tiles never
 * need a re-fetch (see ShopifyVariantGrid above). */
export default function ShopifyProductView({
  result,
}: {
  result: ScrapeResult
  onSelectVariant: (url: string) => void
}) {
  const price = fmtPrice(result.price, result.currencyCode)
  const mrp = result.mrp && result.mrp !== result.price ? fmtPrice(result.mrp, result.currencyCode) : null

  return (
    <div className="rounded-2xl border border-ink/10 bg-white p-5">
      <div className="grid gap-8 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <ImageGallery images={result.images ?? []} alt={result.title ?? 'Product image'} />

        <div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-700 ring-1 ring-inset ring-emerald-200">
              <ShoppingBag size={11} strokeWidth={2.2} /> Shopify
            </span>
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

          <p className="mt-1.5 text-xs text-ink/45">Fetched via Shopify&rsquo;s product API — not scraped HTML</p>

          <OptionsRow options={result.options} />

          <div className="mt-3 flex items-baseline gap-2">
            <p className="text-2xl font-bold text-teal-deep">
              {price ?? <span className="text-base font-semibold text-ink/35">No price found</span>}
            </p>
            {mrp && <p className="text-sm font-semibold text-ink/40 line-through">{mrp}</p>}
          </div>

          {result.availability && (
            <p className="mt-2 inline-block rounded-md bg-card px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink/55 ring-1 ring-inset ring-ink/10">
              {result.availability}
            </p>
          )}

          {result.seller && <p className="mt-2 text-xs text-ink/50">Vendor: {result.seller}</p>}

          {result.variants && result.variants.length > 0 && <ShopifyVariantGrid variants={result.variants} />}

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