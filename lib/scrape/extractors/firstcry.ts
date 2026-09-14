// lib/scrape/extractors/firstcry.ts
//
// FirstCry has no dedicated extractor — see og-only.ts's doc comment for
// exactly what that does and doesn't cover. FirstCry product pages
// reliably set og:title / og:image / product:price:amount, and pricing
// is always INR.

import { makeOgOnlyParser } from './og-only'

export const SITE_ID = 'firstcry' as const

export const parseFirstCry = makeOgOnlyParser('FirstCry', { currencyFallback: 'INR' })