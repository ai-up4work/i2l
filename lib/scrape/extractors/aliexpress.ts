// lib/scrape/extractors/aliexpress.ts
//
// AliExpress has no dedicated extractor — see og-only.ts's doc comment
// for exactly what that does and doesn't cover. Unlike the other four
// OG-only platforms, AliExpress pricing is NOT reliably one currency —
// it varies by shipping destination/account locale — so no
// currencyFallback is set here; whatever domainCurrency() or the page's
// own OG/JSON-LD tags resolve is used as-is, and it may come back null.
//
// NOTE ON CASING: SITE_ID is 'Aliexpress' (capital A) rather than
// lowercase — matches the `scraperSite: 'Aliexpress'` override on that
// store's entry in data/stores/data.ts (itself preserving the casing
// from the original hardcoded PRESET_LINKS array), and the
// `isAliExpressResult` check in ScraperQaClient.tsx. Keep all three in
// sync if this ever changes.

import { makeOgOnlyParser } from './og-only'

export const SITE_ID = 'Aliexpress' as const

export const parseAliExpress = makeOgOnlyParser('AliExpress')