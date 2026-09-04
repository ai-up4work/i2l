import type { Cheerio } from 'cheerio'
import { load as cheerioLoad } from 'cheerio'

// lib/scrape/shared.ts
//
// Utilities shared across every site-specific extractor (lib/scrape/extractors/*)
// and the main parsers.ts pipeline. Pulled out into their own module — rather
// than living in parsers.ts and being imported back into extractors/amazon.ts
// — specifically so parsers.ts and the per-site extractor files don't end up
// importing each other in a circle.

// ---------- Text cleanup ----------

// cheerio's .text() walks every descendant text node, including any inline
// <style>/<script> tags nested inside the element (common with emotion/
// styled-components SSR — this is what produced a stray CSS fragment
// ("...css-1ctpgu6{font-size:16px;...}") spliced into a scraped title on
// one site). Strip those out of a clone before reading text so this can't
// happen for any site.
export function cleanText($el: Cheerio<any>): string | null {
  if (!$el || !$el.length) return null
  const t = $el.clone().find('style, script').remove().end().text().trim()
  return t && t.length ? t : null
}

// ---------- Currency handling ----------

// Domain-based currency defaults — known upfront from the URL, no parsing
// required. This is a much stronger signal than guessing from a symbol
// found in scraped text, so it takes priority over symbol-matching. It is
// NOT, however, stronger than an explicit ISO code stated directly in the
// scraped price text itself (see extractInlineCurrencyCode below) — Amazon
// in particular will geo-convert prices to the buyer's local currency (e.g.
// serving LKR prices on an amazon.com URL when the request looks like it's
// coming from Sri Lanka), and treating that as still-USD-because-.com was
// exactly what caused a real LKR price to get double-converted.
export const DOMAIN_CURRENCY: Record<string, string> = {
  'amazon.in': 'INR',
  'amazon.com': 'USD',
  'amazon.co.uk': 'GBP',
  'amazon.de': 'EUR',
  'amazon.fr': 'EUR',
  'amazon.it': 'EUR',
  'amazon.es': 'EUR',
  'amazon.ca': 'CAD',
  'amazon.com.au': 'AUD',
  'amazon.ae': 'AED',
  'amazon.sg': 'SGD',
  'amazon.co.jp': 'JPY',
  'flipkart.com': 'INR',
  'meesho.com': 'INR',
  'myntra.com': 'INR',
  'ajio.com': 'INR',
  'snapdeal.com': 'INR',
  'nykaa.com': 'INR',
  'nykaafashion.com': 'INR',
  'tatacliq.com': 'INR',
  'jiomart.com': 'INR',
  'ebay.com': 'USD',
  'ebay.co.uk': 'GBP',
  'ebay.de': 'EUR',
  'ebay.fr': 'EUR',
  'ebay.it': 'EUR',
  'ebay.es': 'EUR',
  'ebay.in': 'INR',
  'ebay.ca': 'CAD',
  'ebay.com.au': 'AUD',
}

export function domainCurrency(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
    for (const [domain, code] of Object.entries(DOMAIN_CURRENCY)) {
      if (host.endsWith(domain)) return code
    }
  } catch {
    // ignore malformed URL — caller already validated via detectSite
  }
  return null
}

// Symbol map is a last-resort guess, used only when neither the domain nor
// structured page data gives us an answer. Deliberately excludes '$' since
// it's ambiguous across USD/CAD/AUD/SGD/etc.
export const SYMBOL_TO_CODE: Record<string, string> = {
  '₹': 'INR',
  '£': 'GBP',
  '€': 'EUR',
}

// Explicit 3-letter ISO codes occasionally appear directly in scraped price
// text (e.g. Amazon geo-converting a buybox to "LKR3,594.33" for a buyer it
// thinks is in Sri Lanka, even on an amazon.com URL). When one of these
// shows up, it's a more authoritative signal than the domain default — it's
// literally what the page just told us — so it outranks domainHint in
// detectCurrencyAndClean below. Deliberately a small, known allowlist
// rather than "any 3 uppercase letters" so this can't misfire on an
// unrelated acronym sitting near a price.
const KNOWN_INLINE_ISO_CODES = ['USD', 'INR', 'GBP', 'EUR', 'CAD', 'AUD', 'AED', 'SGD', 'JPY', 'LKR']

function extractInlineCurrencyCode(raw: string): string | null {
  // Left boundary only — NOT a trailing \b. Amazon (and others) very
  // commonly render the code glued directly to the digits with no space
  // at all: "LKR3,594.33". \b treats digits and letters as the same "word"
  // character class, so a trailing \b never matches between "R" and "3" —
  // the old /\b([A-Z]{3})\b/ pattern silently failed on exactly this shape,
  // fell through to the domain-hint guess (USD for amazon.com), and let an
  // already-converted LKR price get converted a SECOND time downstream.
  // Requiring only a non-letter (or start-of-string) before the code, and
  // an optional single space before a digit/decimal after it, fixes that
  // while still not matching a 3-letter code embedded inside an unrelated
  // word.
  const m = raw.match(/(?:^|[^A-Za-z])([A-Z]{3})\s?(?=[\d.])/)
  return m && KNOWN_INLINE_ISO_CODES.includes(m[1]) ? m[1] : null
}

// Locale-aware number parsing. EUR-style locales write "1.234,56" (dot as
// thousands separator, comma as decimal); everything else we handle here
// ("1,234.56", "1234") uses the reverse convention.
export function parseAmount(raw: string, currencyHint: string | null): string | null {
  const cleaned = raw.replace(/\u00a0/g, ' ')
  const match = cleaned.match(/[\d.,]+/)
  if (!match) return null
  let num = match[0]

  const euroStyle = currencyHint === 'EUR'
  if (euroStyle && num.includes(',') && num.includes('.')) {
    num = num.replace(/\./g, '').replace(',', '.')
  } else if (euroStyle && num.includes(',') && !num.includes('.')) {
    // "1234,56" -> "1234.56"
    num = num.replace(',', '.')
  } else {
    num = num.replace(/,/g, '')
  }
  return num
}

// Priority: explicit inline ISO code (stated directly in the scraped text)
// > domain default > recognized symbol. Structured data (JSON-LD/OG) is
// applied afterward in parsers.ts' withFallbacks and outranks all of these,
// since it's an explicit ISO code straight from the page's own schema —
// but only when this function didn't already resolve one.
export function detectCurrencyAndClean(
  raw: string | null,
  domainHint: string | null
): { amount: string | null; code: string | null } {
  const inlineCode = raw ? extractInlineCurrencyCode(raw) : null
  const symbolMatch = raw ? raw.match(/[₹$£€]/) : null
  const symbolCode = symbolMatch ? SYMBOL_TO_CODE[symbolMatch[0]] ?? null : null
  const code = inlineCode ?? domainHint ?? symbolCode
  return {
    amount: raw ? parseAmount(raw, code) : null,
    code,
  }
}

// ---------- Block/CAPTCHA detection ----------
//
// Checks <title> and the first <h1> specifically, parsed via cheerio
// rather than raw-HTML regex — a raw regex on `<h1>` stops at the first
// nested tag or HTML comment, which real WAF block pages can contain
// (e.g. Meesho's own markup splices comments into text nodes elsewhere
// on the site), silently letting the block phrase slip through
// undetected. cheerio's .text() concatenates through both.
export function extractBlockSignalText(html: string): string {
  try {
    const $ = cheerioLoad(html)
    const title = $('title').first().text() || ''
    const h1 = $('h1').first().text() || ''
    return `${title} ${h1}`.toLowerCase()
  } catch {
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i)
    const h1Match = html.match(/<h1[^>]*>([^<]*)<\/h1>/i)
    return `${titleMatch?.[1] ?? ''} ${h1Match?.[1] ?? ''}`.toLowerCase()
  }
}

export const BLOCK_PHRASE_RE =
  /(are you a human|verify you are a human|unusual traffic|robot check|access denied|automated (queries|requests|access)|complete the captcha|solve the captcha|pardon our interruption|permission to access|request blocked|forbidden)/

export function looksBlocked(html: string): boolean {
  if (BLOCK_PHRASE_RE.test(extractBlockSignalText(html))) return true

  const sample = html.slice(0, 4000).toLowerCase()
  const blockPhrase = BLOCK_PHRASE_RE.test(sample)
  if (blockPhrase && html.length < 8000) return true

  const maintenancePhrase =
    /(site maintenance|something went wrong|please contact your administrator|service (is )?(temporarily )?unavailable|we'll be back (soon|shortly))/.test(
      sample
    )
  return maintenancePhrase && html.length < 8000
}

export function looksLikeJsRequiredShell(html: string): boolean {
  const sample = html.slice(0, 4000).toLowerCase()
  return /(you need to enable javascript to run this app|enable javascript to (shop|run|use) (on |this )?|javascript is not enabled in (your |the )?browser|please enable javascript)/.test(
    sample
  )
}

export async function readErrorBodySnippet(res: Response, maxLen = 300): Promise<string> {
  try {
    const text = await res.text()
    const titleMatch = text.match(/<title[^>]*>([^<]*)<\/title>/i)
    const title = titleMatch?.[1]?.trim()
    if (title) return title.slice(0, maxLen)
    const trimmed = text.trim().replace(/\s+/g, ' ')
    return trimmed ? trimmed.slice(0, maxLen) : ''
  } catch {
    return ''
  }
}