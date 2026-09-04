// app/demo/scraper-qa/platforms/ShopifyProductView.tsx
'use client'

import { useEffect, useState } from 'react'
import { BadgeCheck, ExternalLink, Star } from 'lucide-react'
import { formatPrice } from '@/lib/currency'
import type { ScrapeResult } from '@/lib/scrape/parsers'

/**
 * Renders a Shopify scrape result (source: 'shopify_api') using the
 * app's own design tokens rather than imitating a fake "Shopify look" —
 * unlike Amazon/Flipkart/etc., Shopify stores have no single canonical
 * storefront skin to match, since every merchant re-themes their own
 * store completely. What IS consistent and worth surfacing is that this
 * data came straight from Shopify's own product API (see
 * scrapeShopifyProduct in parsers.ts), not a DOM/JSON-LD guess — hence
 * the "Verified via Shopify's Product API" badge below.
 *
 * VARIANT TILES ARE NEVER CLICKABLE, BY DESIGN: buildStoreVariantDimensions()
 * in parsers.ts always sets `url: null` on every option — the one API
 * call already returned every variant's price/image/availability, so
 * there's nothing left to re-fetch by "selecting" a tile the way Amazon's
 * swatches do. `onSelectVariant` is still accepted here (for interface
 * parity with the other platform views) but will never actually fire.
 * Tiles just update local `selectedByDimension` state so the buy box
 * below reflects whichever combination the shopper is looking at.
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

function Stars({ rating, count }: { rating: string | null | undefined; count?: string | null }) {
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

/** One variant dimension (Size, Color, ...) as a row of informational
 * chips — never clickable, since every tile's url is always null (see
 * doc comment above). Selecting one only updates local display state. */
function VariantRow({
  dim,
  selectedLabel,
  onPick,
}: {
  dim: NonNullable<ScrapeResult['variants']>[number]
  selectedLabel: string | null
  onPick: (label: string) => void
}) {
  const hasImages = dim.options.some((o) => !!o.image)
  return (
    <div>
      <p className="text-[13px] font-semibold text-ink">
        {dim.dimension}: <span className="font-normal text-ink/60">{selectedLabel ?? '—'}</span>
      </p>
      <div className={`mt-1.5 flex flex-wrap gap-2 ${hasImages ? '' : ''}`}>
        {dim.options.map((opt) => {
          const isSelected = opt.label === selectedLabel
          const price = fmt(opt.price, opt.currencyCode)
          return (
            <button
              key={opt.label}
              type="button"
              onClick={() => onPick(opt.label)}
              disabled={opt.outOfStock}
              title={opt.outOfStock ? 'Out of stock' : undefined}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors ${
                isSelected
                  ? 'border-teal bg-teal/10'
                  : opt.outOfStock
                    ? 'cursor-not-allowed border-ink/8 bg-card/50 opacity-40 grayscale'
                    : 'border-ink/12 bg-card hover:border-teal/50'
              }`}
            >
              {opt.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={opt.image} alt={opt.label} className="h-8 w-8 flex-none rounded-md object-contain" />
              )}
              <span className="flex flex-col">
                <span className="text-[12px] font-semibold text-ink/80">{opt.label}</span>
                {opt.outOfStock ? (
                  <span className="text-[10px] font-bold uppercase text-indigo-deep">Out of stock</span>
                ) : (
                  price && <span className="text-[10px] font-bold text-teal-deep">{price}</span>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function ShopifyProductView({
  result,
  onSelectVariant,
}: {
  result: ScrapeResult
  onSelectVariant: (url: string) => void
}) {
  const images = result.images ?? []
  const [mainImage, setMainImage] = useState(images[0] ?? null)

  // Local per-dimension selection, purely for display — see doc comment
  // above on why these tiles never trigger onSelectVariant.
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

  const price = fmt(result.price, result.currencyCode)
  const mrp = result.mrp && result.mrp !== result.price ? fmt(result.mrp, result.currencyCode) : null
  const pctOff =
    result.mrp && result.price && Number(result.mrp) > Number(result.price)
      ? Math.round((1 - Number(result.price) / Number(result.mrp)) * 100)
      : null

  const inStock = !result.unavailable

  // onSelectVariant intentionally unused in the handler body — kept as a
  // prop only for interface parity with the other platform views (see
  // doc comment above). Referencing it here avoids an unused-var lint
  // warning without pretending it does something it can't.
  void onSelectVariant

  return (
    <div className="rounded-2xl border border-ink/10 bg-white p-5">
      <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-teal/10 px-2.5 py-1 text-[11px] font-bold text-teal-deep ring-1 ring-inset ring-teal/20">
        <BadgeCheck size={13} strokeWidth={2} />
        Verified via Shopify&apos;s Product API
      </div>

      <div className="grid gap-8 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="flex gap-3">
          {images.length > 1 && (
            <div className="flex flex-col gap-2">
              {images.slice(0, 8).map((src) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setMainImage(src)}
                  className={`h-12 w-12 flex-none overflow-hidden rounded-lg border ${
                    mainImage === src ? 'border-teal ring-1 ring-teal' : 'border-ink/10'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-full w-full object-contain" />
                </button>
              ))}
            </div>
          )}
          <div className="aspect-square flex-1 overflow-hidden rounded-2xl border border-ink/10 bg-card">
            {mainImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mainImage} alt={result.title ?? 'Product image'} className="h-full w-full object-contain" />
            ) : (
              <div className="grid h-full place-items-center text-xs text-ink/35">No image found</div>
            )}
          </div>
        </div>

        <div>
          <h2 className="font-display text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
            {result.title ?? <span className="italic text-ink/35">No title found</span>}
          </h2>

          {result.seller && <p className="mt-1 text-xs font-semibold text-ink/45">by {result.seller}</p>}

          {result.rating && (
            <div className="mt-1.5">
              <Stars rating={result.rating} count={result.review_count} />
            </div>
          )}

          <div className="mt-3 flex items-baseline gap-2">
            {pctOff !== null && <span className="text-sm font-bold text-indigo-deep">-{pctOff}%</span>}
            {price ? (
              <span className="text-2xl font-bold text-teal-deep">{price}</span>
            ) : (
              <span className="text-base font-semibold text-ink/35">No price found</span>
            )}
            {mrp && <span className="text-sm font-semibold text-ink/40 line-through">{mrp}</span>}
          </div>

          <p className="mt-2 inline-block rounded-md bg-card px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink/55 ring-1 ring-inset ring-ink/10">
            {inStock ? 'In stock' : 'Out of stock'}
          </p>

          {result.variants && result.variants.length > 0 && (
            <div className="mt-4 flex flex-col gap-4">
              {result.variants.map((dim) => (
                <VariantRow
                  key={dim.dimension}
                  dim={dim}
                  selectedLabel={selectedByDimension[dim.dimension] ?? null}
                  onPick={(label) =>
                    setSelectedByDimension((prev) => ({ ...prev, [dim.dimension]: label }))
                  }
                />
              ))}
            </div>
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