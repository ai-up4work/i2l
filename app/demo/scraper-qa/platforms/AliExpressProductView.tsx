// app/demo/scraper-qa/platforms/AliExpressProductView.tsx
//
// Look-alike layout for AliExpress results — red/orange accent. NOTE:
// `result.site` for this platform is 'Aliexpress' (capital A, matching
// the original preset link), not lowercase — see the `scraperSite`
// override on that store's entry in data/stores/data.ts. Keep the
// isAliExpressResult check in ScraperQaClient.tsx case-sensitive to match.

import { ExternalLink, Zap } from 'lucide-react'
import { ImageStrip, RatingStars, OptionsRow, SpecRow, VariantPicker, fmtPrice, type PlatformViewProps } from './shared'

export default function AliExpressProductView({ result, onSelectVariant }: PlatformViewProps) {
  return (
    <div className="grid gap-8 sm:grid-cols-2">
      <ImageStrip
        images={result.images ?? []}
        alt={result.title ?? 'Product image'}
        accentBorderClass="border-red-200"
      />

      <div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-ink/50">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2 py-0.5 text-red-600 ring-1 ring-inset ring-red-200">
            <Zap size={11} className="text-red-500" strokeWidth={2} />
            AliExpress
          </span>
          {result.rating && (
            <>
              <span className="text-ink/20">·</span>
              <RatingStars rating={result.rating} count={result.review_count} starClass="fill-orange-500 text-orange-500" />
            </>
          )}
        </div>

        <h2 className="mt-2 font-display text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
          {result.title ?? <span className="italic text-ink/35">No title found</span>}
        </h2>

        <SpecRow result={result} />
        <OptionsRow options={result.options} />

        <div className="mt-3 flex items-baseline gap-2">
          <p className="text-2xl font-bold text-red-600">
            {fmtPrice(result.price, result.currencyCode) ?? (
              <span className="text-base font-semibold text-ink/35">No price found</span>
            )}
          </p>
          {result.mrp && result.mrp !== result.price && (
            <p className="text-sm font-semibold text-ink/40 line-through">
              {fmtPrice(result.mrp, result.currencyCode)}
            </p>
          )}
        </div>

        {result.availability && (
          <p className="mt-2 inline-block rounded-md bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600 ring-1 ring-inset ring-red-200">
            {result.availability}
          </p>
        )}

        {result.variants && result.variants.length > 0 && (
          <VariantPicker
            variants={result.variants}
            onSelect={onSelectVariant}
            selectedBorderClass="border-red-400 bg-red-50"
            hoverBorderClass="hover:border-red-300"
            priceClass="text-red-600"
          />
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