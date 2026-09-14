// lib/scrape/extractors/nykaa.ts
//
// Nykaa has no dedicated extractor — see og-only.ts's doc comment for
// exactly what that does and doesn't cover. Beauty/wellness product
// pages reliably set OG tags; pricing is always INR.

import { makeOgOnlyParser } from './og-only'

export const SITE_ID = 'nykaa' as const

export const parseNykaa = makeOgOnlyParser('Nykaa', { currencyFallback: 'INR' })