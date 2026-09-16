// app/demo/scraper-qa/platforms/TataCliqProductView.tsx
//
// Look-alike layout for Tata CLiQ results — dark navy premium-marketplace
// accent. NOTE: `result.site` for this platform is 'tataCliq' (camelCase),
// not the affiliatedStores slug 'tata-cliq' — see the `scraperSite`
// override on that store's entry in data/stores/data.ts.

import { ExternalLink, Zap } from 'lucide-react'
import { ImageStrip, RatingStars, OptionsRow, VariantPicker, fmtPrice, type PlatformViewProps } from './shared'

export default function TataCliqProductView({ result, onSelectVariant }: PlatformViewProps) {
  return (
    <div className="grid gap-8 sm:grid-cols-2">
      <ImageStrip
        images={result.images ?? []}
        alt={result.title ?? 'Product image'}
        accentBorderClass="border-slate-300"
      />

      <div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-ink/50">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-2 py-0.5 text-white ring-1 ring-inset ring-slate-900">
            <Zap size={11} className="text-amber-400" strokeWidth={2} />
            Tata CLiQ
          </span>
          {result.rating && (
            <>
              <span className="text-ink/20">·</span>
              <RatingStars rating={result.rating} count={result.review_count} starClass="fill-amber-500 text-amber-500" />
            </>
          )}
        </div>

        <h2 className="mt-2 font-display text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
          {result.title ?? <span className="italic text-ink/35">No title found</span>}
        </h2>

        <OptionsRow options={result.options} />

        <div className="mt-3 flex items-baseline gap-2">
          <p className="text-2xl font-bold text-slate-900">
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
          <p className="mt-2 inline-block rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700 ring-1 ring-inset ring-slate-300">
            {result.availability}
          </p>
        )}

        {result.variants && result.variants.length > 0 && (
          <VariantPicker
            variants={result.variants}
            onSelect={onSelectVariant}
            selectedBorderClass="border-slate-800 bg-slate-100"
            hoverBorderClass="hover:border-slate-500"
            priceClass="text-slate-900"
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