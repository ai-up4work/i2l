// lib/scrape/extractors/og-only.ts
//
// Shared parser factory for platforms that don't have a dedicated
// extractor yet — no site-specific selectors for price/variants/
// availability, no per-site edge-case handling. These sites are
// currently supported ONLY through the generic fallback chain already
// built into parseHtml() in parsers.ts: embedded client-state JSON,
// JSON-LD <script type="application/ld+json">, and <meta property="og:*">
// tags, in that priority order (see withFallbacks() in parsers.ts).
//
// A parser built here does the bare minimum a real extractor does — a
// currency hint, a seller/store name for SpecRow, and an <h1>-based
// title guess as a last-resort backstop if OG/JSON-LD are both missing —
// and tags its output with `_ogOnly: true`. scrapeProduct() in
// parsers.ts reads that flag and surfaces it as ScrapeResult.ogOnly, so
// the QA tool can honestly show "via Open Graph tags" instead of
// implying a real per-site extractor inspected this page's DOM.
//
// IMPORTANT — this is a floor, not a ceiling. It will NOT reliably find:
//   - variant/size/color pickers (no `variants` array is ever built here)
//   - MRP/strikethrough price (most sites don't put this in OG tags)
//   - rating/review count (almost never present in OG tags)
//   - availability with real granularity (OG's `product:availability`
//     is often absent or unreliable — see extractOgMeta in parsers.ts)
//
// If a platform needs any of that, it needs a real dedicated extractor
// (see amazon.ts, ebay.ts, etc. for the pattern) — resist the urge to
// keep patching this shared path with site-specific special cases; that
// defeats the point of it being the honest "we don't have a real
// extractor for this yet" path.

import type { CheerioAPI } from 'cheerio'
import { cleanText, domainCurrency } from '../shared'

export type OgOnlyOptions = {
  /** Shown in ScrapeResult.seller when OG data doesn't name a seller
   * (true for almost every marketplace product page). Defaults to the
   * site label passed to makeOgOnlyParser. */
  sellerName?: string
  /** ISO currency code to use when neither OG tags nor the domain-based
   * currency heuristic (domainCurrency, keyed off TLD) resolve one — for
   * a site that's reliably one currency regardless of what its domain
   * suggests. */
  currencyFallback?: string
}

export function makeOgOnlyParser(siteLabel: string, options: OgOnlyOptions = {}) {
  return function parse($: CheerioAPI, url: string): Record<string, any> {
    const domainHint = domainCurrency(url)
    return {
      // Best-effort title guess in case OG tags are missing entirely.
      // withFallbacks() in parsers.ts prefers extractOgMeta()'s og:title
      // over this when both exist, since extractOgMeta runs AFTER this
      // raw parse in the fallback chain — this is only a backstop.
      title: cleanText($('h1').first()) || null,
      price: null as string | null,
      mrp: null as string | null,
      currencyCode: domainHint ?? options.currencyFallback ?? null,
      rating: null,
      review_count: null,
      availability: null,
      seller: options.sellerName ?? siteLabel,
      images: [] as string[],
      _ogOnly: true,
    }
  }
}