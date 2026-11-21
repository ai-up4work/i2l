// lib/scrape/merge-weak-read.ts
//
// Pure helpers (no server imports), shared by the route and the browser hook.
import type { ScrapeResult } from '@/lib/scrape/parsers'

/** Our scraper "succeeded" but only with a generic Open-Graph-level read (an
 *  unrecognised store: no variants, price unconfirmed) — worth asking the
 *  universal scraper for a better one. */
export function isWeakRead(result: ScrapeResult): boolean {
  if (result.error || result.site === null) return false
  return (result.site === 'generic' || !!result.ogOnly) && !result.variants?.length
}

/** Combine a weak read of our own with the universal scraper's: its price,
 *  currency, sizes and colours win; our own title, description and photos
 *  stay when we have them (usually richer). */
export function mergeWeakRead(ours: ScrapeResult, backup: ScrapeResult): ScrapeResult {
  return {
    ...backup,
    upgradePending: undefined,
    title: ours.title || backup.title,
    description: ours.description || backup.description,
    images: (ours.images?.length ?? 0) >= (backup.images?.length ?? 0) ? ours.images : backup.images,
    brand: backup.brand ?? ours.brand,
  }
}
