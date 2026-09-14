// lib/scrape/extractors/hopscotch.ts
//
// Hopscotch has no dedicated extractor — see og-only.ts's doc comment
// for exactly what that does and doesn't cover. Pricing is always INR.

import { makeOgOnlyParser } from './og-only'

export const SITE_ID = 'hopscotch' as const

export const parseHopscotch = makeOgOnlyParser('HopScotch', { currencyFallback: 'INR' })