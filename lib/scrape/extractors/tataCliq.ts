// lib/scrape/extractors/tataCliq.ts
//
// Tata CLiQ has no dedicated extractor — see og-only.ts's doc comment
// for exactly what that does and doesn't cover. Pricing is always INR.
//
// NOTE ON CASING: SITE_ID is 'tataCliq' (camelCase) rather than the
// affiliatedStores platform slug 'tata-cliq' — matches the
// `scraperSite: 'tataCliq'` override on that store's entry in
// data/stores/data.ts, and the `isTataCliqResult` check in
// ScraperQaClient.tsx. Keep all three in sync if this ever changes.

import { makeOgOnlyParser } from './og-only'

export const SITE_ID = 'tataCliq' as const

export const parseTataCliq = makeOgOnlyParser('Tata CLiQ', { currencyFallback: 'INR' })