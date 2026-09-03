// lib/scrape/extractors/snapdeal.ts
//
// Pulled out of parsers.ts's inline parseSnapdeal — brought up to the same
// module shape as amazon/flipkart/meesho/myntra/ebay/ajio/jiomart so
// Snapdeal is no longer the odd one out. No options extractor is exported
// here because Snapdeal's PDP doesn't expose a size/color picker worth
// scraping today; add extractSnapdealOptions() + wire it into
// SITE_OPTIONS_EXTRACTORS in parsers.ts if that changes.

import type { CheerioAPI } from 'cheerio'
import { cleanText, detectCurrencyAndClean, domainCurrency } from '../shared'

export const SITE_ID = 'snapdeal' as const

// Snapdeal's picker (on the rare listing that has one) is present in the
// static HTML already — no client-side hydration wait needed.
export const REQUIRES_RENDER_FOR_VARIANTS = false

const UNAVAILABLE_TEXT_PATTERNS = [/currently unavailable/i, /out of stock/i, /sold out/i]

const BUY_CONTROL_SELECTORS = '#buyNow, .buyNowButtonPDP, .cartBtnPDP, .buy-now-cta'

export function parseSnapdeal($: CheerioAPI, url: string) {
  const domainHint = domainCurrency(url)

  const priceRaw = cleanText($('span.payBlkBig'))
  const mrpRaw = cleanText($('span.pdp-mrp strike'))
  const { amount, code } = detectCurrencyAndClean(priceRaw, domainHint)
  const mrpAmount = detectCurrencyAndClean(mrpRaw, domainHint).amount

  const images = new Set<string>()
  $('div.cloudzoom-wrap img, div#bx-pager img').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-cloudzoom')
    if (src) images.add(src)
  })

  const bodyText = cleanText($('body')).toLowerCase()
  const hasBuyControl = $(BUY_CONTROL_SELECTORS).length > 0
  const looksUnavailable =
    !hasBuyControl && (UNAVAILABLE_TEXT_PATTERNS.some((re) => re.test(bodyText)) || (!amount && !priceRaw))

  const result: Record<string, any> = {
    title: cleanText($('h1.pdp-e-i-head')),
    price: amount,
    mrp: mrpAmount,
    currencyCode: code,
    rating: cleanText($('div.avrg-rating')),
    review_count: cleanText($('div.rating-count')),
    availability: looksUnavailable ? 'Out of stock' : null,
    seller: cleanText($('a.seller-name-link')),
    images: [...images],
  }

  if (looksUnavailable) {
    result._snapdealUnavailable = true
    result._snapdealWarning =
      'No active buy-now/add-to-cart control was found on this page — likely a genuinely unavailable or retired listing, not a scrape failure.'
  }

  return result
}

/** Pulls the internal _snapdeal* flags off `parsed` (mutating it) and
 * returns them in the {warning, unavailable} shape scrapeProduct() expects
 * — same contract as consumeMeeshoMeta / consumeMyntraMeta / etc. */
export function consumeSnapdealMeta(parsed: Record<string, any>): { warning?: string; unavailable?: boolean } {
  const warning = parsed._snapdealWarning
  const unavailable = parsed._snapdealUnavailable
  delete parsed._snapdealWarning
  delete parsed._snapdealUnavailable
  return { warning, unavailable }
}