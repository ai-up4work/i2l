import type { CheerioAPI } from 'cheerio'
import { cleanText, looksBlocked, looksLikeJsRequiredShell, readErrorBodySnippet } from '../shared'
import { fetchWithTlsFingerprintRetries } from '../tls-fetch'

// ---------------------------------------------------------------------
// Ajio (www.ajio.com) product-page extractor.
//
// IMPORTANT CONTEXT (see parsers.ts's RENDER_FALLBACK_HOSTS /
// STATIC_CONTENT_SUFFICIENT comments): Ajio's plain server response is a
// normal 200 — never blocked, never caught by the generic
// looksLikeJsRequiredShell() heuristic — but the actual product markup
// (title, price, size/colour pickers) only exists once client-side JS has
// hydrated the page. Because of that, `parseAjio` below will almost always
// be handed HTML that already went through the headless-render fallback
// tier (see RENDER_WAIT_SELECTOR.ajio = 'h1.prod-name, div.prod-sp' in
// parsers.ts), not a raw fetch() response. Selectors here are written
// against that fully-hydrated DOM.
//
// Ajio's hashed/generated CSS class names do churn between deploys, so
// every selector below is a fallback *chain* (try the most specific/
// confirmed selector first, fall back to looser ones) rather than a single
// bet. `prod-name` and `prod-sp` are the two classes parsers.ts already
// confirmed against a real captured, fully-rendered PDP — everything else
// here is best-effort and worth re-checking against a live page if a
// field starts coming back consistently null.
// ---------------------------------------------------------------------

export const SITE_ID = 'ajio' as const

// Ajio's size/colour picker is populated client-side after hydration —
// a plain static fetch (even once STATIC_CONTENT_SUFFICIENT passes for
// title/price) won't reliably expose the full swatch list, so callers
// that need `options`/`variants` should route through the render tier.
export const REQUIRES_RENDER_FOR_VARIANTS = true

// Single source of truth for "does this HTML actually contain Ajio's
// hydrated product markup" — used by BOTH parsers.ts's
// STATIC_CONTENT_SUFFICIENT (for the plain static-fetch tier) and
// fetchAjioViaTlsFingerprint below (for the TLS-fingerprint last-resort
// tier).
//
// Previously only the static-fetch tier used this check; the
// TLS-fingerprint tier fell back to the generic looksLikeJsRequiredShell()
// heuristic, which — as the header comment above already notes — does
// NOT catch Ajio's shell (it's an ordinary 200 response, not a generic
// "please enable JavaScript" page). That gap let the TLS-fingerprint
// tier silently accept an un-hydrated shell as a "successful" fetch,
// producing exactly this symptom pattern: title/price selectors all
// miss, price falls back to meta-description text, and no variant data
// — a false partial success reported as `source: 'fingerprint_fetch'`
// instead of an honest failure that would let the caller know the real
// fix is on the render tier, not this one.
export function hasHydratedAjioMarkup(html: string): boolean {
  return html.includes('class="prod-sp"') || html.includes('class="prod-name"')
}

export type AjioParsed = {
  title: string | null
  brand: string | null
  price: string | null
  mrp: string | null
  currencyCode: string | null
  rating: string | null
  review_count: string | null
  availability: string | null
  seller: string | null
  images: string[]
  // Internal-only fields, stripped out by consumeAjioMeta() before the
  // result reaches the caller — same pattern as the other multi-field
  // extractors (meesho/myntra/ebay/jiomart/snapdeal) in parsers.ts.
  _ajioWarning?: string
  _ajioUnavailable?: boolean
}

// ---------- small local helpers ----------

/** Pulls the first run of digits (with optional decimal) out of a price
 * string like "₹1,499" or "Rs. 2,999.00", stripping currency symbols and
 * thousands separators. */
function extractPriceNumber(text: string | null | undefined): string | null {
  if (!text) return null
  const cleaned = text.replace(/,/g, '')
  const match = cleaned.match(/\d+(?:\.\d+)?/)
  return match ? match[0] : null
}

/** Returns cleaned text from the first selector (in order) that matches
 * and yields non-empty text. */
function firstText($: CheerioAPI, selectors: string[]): string | null {
  for (const sel of selectors) {
    const text = cleanText($(sel).first())
    if (text) return text
  }
  return null
}

/** Returns the first non-empty attribute value across a list of
 * (selector, attribute) pairs — used for lazy-loaded images where the
 * real URL might be in data-src/data-original rather than src. */
function firstAttr($: CheerioAPI, pairs: Array<[string, string]>): string | null {
  for (const [sel, attr] of pairs) {
    const val = $(sel).first().attr(attr)
    if (val) return val.trim()
  }
  return null
}

function normalizeUrl(src: string): string {
  return src.startsWith('//') ? `https:${src}` : src
}

// ---------- title / brand ----------

function extractTitle($: CheerioAPI): string | null {
  return firstText($, [
    'h1.prod-name',
    '.prod-name',
    'h1[class*="prod-name"]',
    'h1',
  ])
}

function extractBrand($: CheerioAPI): string | null {
  const direct = firstText($, [
    '.prod-brand a',
    '.prod-brand',
    'h3.brand-name',
    '[class*="brand-name"]',
    'a[href*="/brands/"]',
  ])
  if (direct) return direct

  // Ajio often prefixes the <title>/h1 with the brand, e.g.
  // "Nike Running Shoes" — if we found a title but no dedicated brand
  // element, don't guess; better to leave brand null than fabricate one
  // by splitting on whitespace (brand names can be multi-word).
  return null
}

// ---------- price / mrp / discount ----------

function extractPrice($: CheerioAPI): string | null {
  const raw = firstText($, [
    '.prod-sp',
    '[class*="prod-sp"]',
    '.price-container .prod-sp',
    '[class*="selling-price"]',
    '[class*="sp-value"]',
  ])
  return extractPriceNumber(raw)
}

function extractMrp($: CheerioAPI): string | null {
  const raw = firstText($, [
    '.prod-cp',
    '[class*="prod-cp"]',
    'strike',
    'del',
    '[class*="mrp-value"]',
    '[class*="strike-price"]',
  ])
  return extractPriceNumber(raw)
}

// ---------- rating / reviews ----------

function extractRating($: CheerioAPI): string | null {
  const raw = firstText($, [
    '[class*="rating-value"]',
    '[class*="rating-strip"] [class*="value"]',
    '.rating-container .val',
    '[class*="ratingValue"]',
  ])
  if (!raw) return null
  const match = raw.match(/\d+(?:\.\d+)?/)
  return match ? match[0] : null
}

function extractReviewCount($: CheerioAPI): string | null {
  const raw = firstText($, [
    '[class*="rating-count"]',
    '[class*="rat-count"]',
    '[class*="reviewCount"]',
    '.rating-container .rat-count',
  ])
  if (!raw) return null
  const match = raw.replace(/,/g, '').match(/\d+/)
  return match ? match[0] : null
}

// ---------- availability ----------

const OUT_OF_STOCK_PATTERNS = [/out\s*of\s*stock/i, /sold\s*out/i, /notify\s*me/i, /currently\s*unavailable/i]

function extractAvailability($: CheerioAPI): { availability: string | null; unavailable: boolean } {
  const oosSelectors = [
    '[class*="out-of-stock"]',
    '[class*="oos"]',
    '[class*="notify-me"]',
    'button[class*="notify"]',
  ]

  for (const sel of oosSelectors) {
    const el = $(sel).first()
    if (el.length && cleanText(el)) {
      return { availability: 'Out of stock', unavailable: true }
    }
  }

  // Fallback: scan visible button/label text for OOS phrasing, in case
  // the class names above don't match this deploy's markup.
  const bodyText = $('body').text()
  if (OUT_OF_STOCK_PATTERNS.some((re) => re.test(bodyText.slice(0, 20000)))) {
    // Cap the scan length — a full-page regex scan on every request is
    // wasteful, and OOS messaging always appears near the top of the PDP
    // (buy box), not buried in footer/recommendation rails further down.
    return { availability: 'Out of stock', unavailable: true }
  }

  const addToBag = firstText($, ['button[class*="add-to-bag"]', 'button[class*="add-to-cart"]'])
  if (addToBag) return { availability: 'In stock', unavailable: false }

  // No explicit OOS signal and no confirmed add-to-bag button — don't
  // assert either way; let the generic "no availability found" warning
  // in parsers.ts surface instead of guessing.
  return { availability: null, unavailable: false }
}

// ---------- seller ----------

function extractSeller($: CheerioAPI): string | null {
  return firstText($, ['[class*="seller-name"]', '[class*="sold-by"] a', '[class*="sold-by"]'])
}

// ---------- images ----------

function extractImages($: CheerioAPI): string[] {
  const urls = new Set<string>()

  const imgSelectors = [
    '.prod-image-gallery img',
    '[class*="image-gallery"] img',
    '[class*="zoomWindowContainer"] img',
    '[class*="thumbnail"] img',
    'img[src*="assets.ajio.com"]',
    'img[data-src*="assets.ajio.com"]',
  ]

  for (const sel of imgSelectors) {
    $(sel).each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-original')
      if (src) urls.add(normalizeUrl(src))
    })
  }

  return [...urls]
}

// ---------- main parser ----------

export function parseAjio($: CheerioAPI, _url: string): AjioParsed {
  const title = extractTitle($)
  const brand = extractBrand($)
  const price = extractPrice($)
  const mrp = extractMrp($)
  const rating = extractRating($)
  const review_count = extractReviewCount($)
  const { availability, unavailable } = extractAvailability($)
  const seller = extractSeller($)
  const images = extractImages($)

  const result: AjioParsed = {
    title,
    brand,
    price,
    mrp,
    // Ajio is India-only, so hardcoding here is safe and avoids relying
    // on the generic module's LKR default for a site that never sells in
    // that currency.
    currencyCode: 'INR',
    rating,
    review_count,
    availability,
    seller,
    images,
  }

  if (unavailable) {
    result._ajioUnavailable = true
  }

  if (!title && !price) {
    result._ajioWarning =
      'Neither title nor price matched any known Ajio selector — the page may not have finished hydrating, or Ajio has changed its markup since these selectors were last confirmed.'
  }

  return result
}

// ---------- size / colour options ----------

/**
 * Reads the currently-selected size and/or colour off a hydrated Ajio
 * PDP. Returns null (rather than an empty object) when neither is found,
 * so callers can distinguish "no variant data on this page" from "found
 * an options object, it's just empty" — consistent with the other
 * SITE_OPTIONS_EXTRACTORS entries in parsers.ts.
 *
 * Note on scope: Ajio's colour swatches typically link out to a
 * *different* PDP URL per colour rather than swapping colour in place on
 * the same page (unlike size, which does swap in place). So "Colour"
 * here reflects whichever colour this specific URL landed on — there's
 * no in-page colour-swap event to observe a "selection" of.
 */
export function extractAjioOptions($: CheerioAPI): Record<string, string> | null {
  const options: Record<string, string> = {}

  const selectedSize = firstText($, [
    '.size-swatch li.selected',
    '[class*="size-swatch"] [class*="selected"]',
    '[class*="size-list"] [class*="active"]',
    '[class*="size"][class*="selected"]',
  ])
  if (selectedSize) options.Size = selectedSize

  const selectedColour =
    firstText($, [
      '[class*="colour-name"]',
      '[class*="color-name"]',
      '[class*="prod-color"]',
    ]) ||
    firstAttr($, [
      ['.colour-swatches .selected img', 'alt'],
      ['[class*="color-swatch"] [class*="selected"] img', 'alt'],
    ])
  if (selectedColour) {
    // Values like "Colour: Black" sometimes come through with the label
    // still attached — strip a leading "Colour:"/"Color:" prefix if
    // present so downstream consumers get just the value.
    const cleaned = selectedColour.replace(/^colou?r\s*:\s*/i, '').trim()
    if (cleaned) options.Color = cleaned
  }

  return Object.keys(options).length ? options : null
}

// ---------- internal-metadata consumption ----------

/**
 * Strips parseAjio's internal `_ajio*` fields off the (already
 * withFallbacks-merged) parsed object and returns them as a plain
 * {warning, unavailable} pair for scrapeProduct to fold into the final
 * ScrapeResult — mirrors consumeMeeshoMeta / consumeMyntraMeta / etc.
 */
export function consumeAjioMeta(parsed: Record<string, any>): {
  warning: string | null
  unavailable: boolean
} {
  const warning = typeof parsed._ajioWarning === 'string' ? parsed._ajioWarning : null
  const unavailable = !!parsed._ajioUnavailable

  delete parsed._ajioWarning
  delete parsed._ajioUnavailable

  return { warning, unavailable }
}

// ---------------------------------------------------------------------
// Self-hosted TLS-fingerprint fallback (no third-party scraping API)
// ---------------------------------------------------------------------
// Last-resort tier, reached only after both the direct static fetch AND
// the shared headless-browser render tier (parsers.ts's
// RENDER_FALLBACK_HOSTS) have failed to produce usable HTML.
//
// HONEST SCOPE NOTE: per tls-fetch.ts's own header comment, this fixes
// "Node's HTTP client has a detectably non-browser TLS fingerprint" —
// it does NOT fix an IP-reputation block on its own, AND (like every
// client this tier could plausibly use — tls-client, impit, or anything
// else that isn't an actual browser) it does NOT execute JavaScript. For
// Ajio specifically, that second point matters a lot: since the real
// product markup only exists post-hydration, this tier can only ever
// return a genuinely correct result if TLS-fingerprint-vs-content was
// the entire problem AND Ajio's server-rendered response (before any
// client JS runs) happens to already contain what's needed — which,
// per parseAjio's header comment, it usually doesn't. In practice this
// tier's realistic job for Ajio is less "solve the hydration problem"
// and more "rule out fingerprinting as a cause, and fail honestly (via
// hasHydratedAjioMarkup below) when it isn't." If Ajio scrapes keep
// landing here instead of succeeding via the headless-render tier
// above, the render tier itself is where to look next.

export const SUPPORTS_TLS_FINGERPRINT_FALLBACK = true

export function ajioTlsFingerprintConfigured(): boolean {
  // Always "configured" — tls-fetch.ts lazy-loads the optional `impit`
  // dependency and returns a clear error at call time if it's missing,
  // rather than requiring an env var just to attempt it. If you'd rather
  // this tier be opt-in, gate it on an env var here instead, e.g.:
  //   return process.env.ENABLE_TLS_FINGERPRINT_FETCH === 'true'
  return true
}

export async function fetchAjioViaTlsFingerprint(
  url: string,
  opts: { signal?: AbortSignal } = {}
): Promise<{ html: string | null; error: string | null }> {
  const result = await fetchWithTlsFingerprintRetries(url, {
    signal: opts.signal,
    isBlocked: looksBlocked,
    // Generic looksLikeJsRequiredShell() alone is NOT enough here — see
    // hasHydratedAjioMarkup's doc comment above for why. Combining both
    // means: fail the attempt if it's either a CAPTCHA-style shell OR
    // specifically missing Ajio's confirmed hydrated markup, instead of
    // silently accepting an un-hydrated 200 as a "successful" fetch.
    isJsShell: (html) => looksLikeJsRequiredShell(html) || !hasHydratedAjioMarkup(html),
  })

  return { html: result.html, error: result.error }
}