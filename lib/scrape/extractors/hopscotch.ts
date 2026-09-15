// lib/scrape/extractors/hopscotch.ts
import * as cheerio from 'cheerio'
import type { CheerioAPI } from 'cheerio'
import { cleanText } from '../shared'

// ---------------------------------------------------------------------
// Hopscotch (www.hopscotch.in) product-page extractor.
//
// Deliberately NO paid/external service tier here — this is fetch +
// cheerio only, same shape as Ajio's tier-2 path, minus Ajio's tier-1
// (Parse.bot) and tier-3 (TLS-fingerprint proxy). If Hopscotch turns
// out to need a render/fingerprint tier later, wire it the same way
// Ajio's RENDER_FALLBACK_HOSTS / LAST_RESORT_FALLBACK entries in
// parsers.ts are wired — nothing here precludes adding one.
//
// UPDATE (confirmed against a real captured PDP, Sept 2026): title,
// price, mrp, availability, and images below are now tightened against
// an actual fetched product page (a girl's party-dress PDP), the same
// way Ajio's `prod-sp`/`prod-name` were once a real response was
// available. Two things about this site's markup that shaped the
// approach:
//   1. Every CSS class on the page is a CSS-module/emotion hash (e.g.
//      `css-15sf8uw`) — none of them are semantically named, so
//      class-based selectors are close to useless here. Text-content
//      matching (MRP label, "Best price ₹X", button labels) and the
//      one real, non-hashed anchor available (the image carousel's
//      `id="carousel-N"` attributes) are used instead where possible.
//   2. rating, review_count, and seller could NOT be confirmed — no
//      such widget appears anywhere on the captured page (either this
//      particular product has no reviews yet, or that section renders
//      lower on the page / client-side). Those three stay unconfirmed
//      guesses below.
//
// parsers.ts's generic JSON-LD / embedded-state / OG-meta fallback
// chain still runs underneath regardless (see withFallbacks() in
// parsers.ts), so a total selector miss here degrades gracefully to
// the same data Hopscotch was already getting from the OG-only path —
// this can only add precision on top, never regress it. Send a real
// captured PDP with a visible rating widget (view-source, or a saved
// fetch response) and rating/review_count/seller can be tightened the
// same way.
// ---------------------------------------------------------------------

export const SITE_ID = 'hopscotch' as const

// CONFIRMED against a real captured PDP: the static HTML shows only a
// "Select a size" placeholder button with no size list rendered — the
// actual size/color picker options only appear after client-side
// hydration. hasHydratedHopscotchMarkup() below is what actually
// decides the render-tier routing at runtime (by re-running the real
// extraction and checking if anything came back), rather than a
// hardcoded guess — treat this constant as just the label used for the
// variant-warning message in parsers.ts.
export const REQUIRES_RENDER_FOR_VARIANTS = true

export type HopscotchParsed = {
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
  // Internal-only, stripped by consumeHopscotchMeta() — same pattern as
  // every other extractor's _<site>Warning/_<site>Unavailable fields.
  _hopscotchWarning?: string
  _hopscotchUnavailable?: boolean
}

// ---------- small local helpers (same pattern as ajio.ts) ----------

function extractPriceNumber(text: string | null | undefined): string | null {
  if (!text) return null
  const cleaned = text.replace(/,/g, '')
  const match = cleaned.match(/\d+(?:\.\d+)?/)
  return match ? match[0] : null
}

function firstText($: CheerioAPI, selectors: string[]): string | null {
  for (const sel of selectors) {
    const text = cleanText($(sel).first())
    if (text) return text
  }
  return null
}

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

function firstUrlFromSrcset(srcset: string): string | null {
  const first = srcset.split(',')[0]?.trim().split(' ')[0]
  return first || null
}

// ---------- title / brand ----------
// Title chain confirmed working via the bare `h1` fallback (only one
// h1 appears on the captured PDP — the header/nav has none). Kept as a
// broad chain since class-based hooks can't be confirmed (hashed
// classes) and a page with multiple h1s elsewhere isn't ruled out.
// Brand remains an unconfirmed guess — no brand element was visible on
// the captured page (this product's brand block may be absent for
// house-label items, or render elsewhere).

function extractTitle($: CheerioAPI): string | null {
  return firstText($, [
    'h1.product-name',
    'h1[class*="product-title"]',
    'h1[class*="pdp-title"]',
    '[class*="product-detail"] h1',
    'h1[class*="product"]',
    'h1',
  ])
}

function extractBrand($: CheerioAPI): string | null {
  return firstText($, [
    '[class*="brand-name"]',
    'a[href*="/brand/"]',
    '[class*="product-brand"]',
  ])
}

// ---------- price / mrp ----------
//
// CONFIRMED against a real captured PDP: the page exposes an "MRP:"
// label + adjacent value span, and — separately, in a promo block —
// a sentence like "Best price ₹1386. You save ₹59." for the actual
// discounted/selling price. There is no dedicated "selling price"
// element the way Ajio has `prod-sp`, and no class on the page is
// usable as a hook (every class here is a CSS-module hash), so both
// values are read by matching visible text instead of guessing at
// class names. IMPORTANT: earlier versions of this file used
// class-based guesses for both fields, which matched nothing on a real
// page and silently mislabeled the MRP value as the selling price —
// this text-based approach fixes that.

const BEST_PRICE_RE = /best\s*price\s*(?:is\s*)?₹?\s*([\d,]+(?:\.\d+)?)/i
const MRP_LABEL_RE = /^MRP\s*:?$/i

function extractMrpFromLabel($: CheerioAPI): string | null {
  let mrp: string | null = null
  $('span, div').each((_, el) => {
    if (mrp) return
    const text = cleanText($(el))
    if (text && MRP_LABEL_RE.test(text)) {
      const siblingText = cleanText($(el).next())
      const num = extractPriceNumber(siblingText)
      if (num) mrp = num
    }
  })
  return mrp
}

function extractBestPriceFromText($: CheerioAPI): string | null {
  const bodyText = $('body').text()
  const m = bodyText.match(BEST_PRICE_RE)
  return m ? m[1].replace(/,/g, '') : null
}

function extractPrice($: CheerioAPI): string | null {
  // Confirmed: the "Best price ₹X" promo text is the actual
  // discounted/selling price when present.
  const bestPrice = extractBestPriceFromText($)
  if (bestPrice) return bestPrice

  // Unconfirmed fallback guesses, kept in case a page variant (e.g. a
  // product with no active discount/offer) exposes an actual
  // dedicated selling-price element instead of the promo sentence.
  const raw = firstText($, [
    '[class*="selling-price"]',
    '[class*="final-price"]',
    '[class*="offer-price"]',
    '[class*="discounted-price"]',
    '[class*="price"][class*="value"]',
    '[class*="pdp-price"] [class*="price"]',
    '[class*="price"]',
  ])
  return extractPriceNumber(raw)
}

function extractMrp($: CheerioAPI): string | null {
  // Confirmed: "MRP:" label span + adjacent value span.
  const labeled = extractMrpFromLabel($)
  if (labeled) return labeled

  // Unconfirmed fallback guesses.
  const raw = firstText($, [
    '[class*="mrp"]',
    '[class*="strike-price"]',
    '[class*="original-price"]',
    'strike',
    'del',
  ])
  return extractPriceNumber(raw)
}

// ---------- rating / reviews ----------
//
// UNCONFIRMED — no rating/review widget appeared anywhere on the
// captured PDP. Left as broad class-based guesses; send a captured
// page for a product that actually has reviews to tighten these.

function extractRating($: CheerioAPI): string | null {
  const raw = firstText($, [
    '[class*="rating-value"]',
    '[class*="rating"] [class*="value"]',
    '[class*="star-rating"]',
    '[class*="avg-rating"]',
  ])
  if (!raw) return null
  const match = raw.match(/\d+(?:\.\d+)?/)
  return match ? match[0] : null
}

function extractReviewCount($: CheerioAPI): string | null {
  const raw = firstText($, [
    '[class*="review-count"]',
    '[class*="rating-count"]',
    '[class*="reviewCount"]',
  ])
  if (!raw) return null
  const match = raw.replace(/,/g, '').match(/\d+/)
  return match ? match[0] : null
}

// ---------- availability ----------
//
// CONFIRMED against a real captured in-stock PDP: the add-to-cart /
// buy-now buttons have CSS-module hash classes (no stable class hook
// available), but their visible text — "ADD TO CART" / "BUY NOW" — is
// stable, so detection is text-based rather than class-based. The
// out-of-stock selectors below remain unconfirmed guesses; no OOS page
// was available to capture.

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

  const bodyText = $('body').text()
  if (OUT_OF_STOCK_PATTERNS.some((re) => re.test(bodyText.slice(0, 20000)))) {
    return { availability: 'Out of stock', unavailable: true }
  }

  // Confirmed: match by button text, not class, since classes are
  // hashed and unusable as a hook on this site.
  let hasAddToCartButton = false
  $('button').each((_, el) => {
    if (hasAddToCartButton) return
    const t = (cleanText($(el)) ?? '').toUpperCase()
    if (t === 'ADD TO CART' || t === 'BUY NOW') hasAddToCartButton = true
  })
  if (hasAddToCartButton) return { availability: 'In stock', unavailable: false }

  return { availability: null, unavailable: false }
}

// ---------- seller ----------
//
// UNCONFIRMED — no seller/sold-by element appeared on the captured
// page (Hopscotch is a D2C retailer rather than a marketplace, so this
// may simply not exist per-item). Left as a guess.

function extractSeller($: CheerioAPI): string | null {
  return firstText($, ['[class*="seller-name"]', '[class*="sold-by"]'])
}

// ---------- images ----------
//
// CONFIRMED against a real captured PDP: the main gallery is a
// keen-slider whose slide wrappers carry literal id="carousel-0",
// "carousel-1", ... — a real id attribute, not a CSS-module hash, so
// it's a far more durable anchor than any class-based guess on this
// site. Eager-loaded early slides have the real image URL directly in
// the visible <img>'s src/srcset; later, lazy-loaded slides only carry
// it inside a <noscript> fallback <img>, with the visible <img> itself
// holding a base64 blur placeholder — so both need checking.
//
// IMPORTANT: earlier versions of this file fell back to a bare
// `img[src*="hopscotch"]` scan. On a real captured page that also
// matches the unrelated "Similar Dresses" recommendation carousel
// further down the same page (which has real, non-placeholder image
// URLs from the same static.hopscotch.in domain), silently polluting
// the result with other products' photos. That catch-all has been
// removed; the id-scoped selector below is used instead, with a
// narrower (still class-based, still unconfirmed) fallback chain only
// for markup variants that lack the carousel-N id scheme.

function extractImages($: CheerioAPI): string[] {
  const urls = new Set<string>()

  $('[id^="carousel-"] img, [id^="carousel-"] noscript').each((_, el) => {
    if (el.tagName === 'noscript') {
      // cheerio doesn't parse <noscript> contents as DOM — read the
      // raw inner markup and pull the img attributes out by hand.
      const inner = $(el).html() || ''
      const srcsetMatch = inner.match(/\ssrcset="([^"]+)"/)
      const srcMatch = inner.match(/\ssrc="([^"]+)"/)
      if (srcsetMatch) {
        const url = firstUrlFromSrcset(srcsetMatch[1])
        if (url) urls.add(normalizeUrl(url))
      } else if (srcMatch && !srcMatch[1].startsWith('data:')) {
        urls.add(normalizeUrl(srcMatch[1]))
      }
      return
    }

    const $el = $(el)
    const src = $el.attr('src')
    if (src && !src.startsWith('data:')) {
      urls.add(normalizeUrl(src))
      return
    }
    const srcset = $el.attr('srcset')
    if (srcset) {
      const url = firstUrlFromSrcset(srcset)
      if (url) urls.add(normalizeUrl(url))
    }
  })

  if (urls.size) return [...urls]

  // Unconfirmed fallback for markup variants without the carousel-N id
  // scheme. Deliberately does NOT include a bare
  // img[src*="hopscotch"] scan — see the header comment above for why.
  const imgSelectors = [
    '[class*="product-gallery"] img',
    '[class*="pdp-image"] img',
    '[class*="image-gallery"] img',
    '[class*="thumbnail"] img',
  ]

  for (const sel of imgSelectors) {
    $(sel).each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-original')
      if (src && !src.startsWith('data:')) urls.add(normalizeUrl(src))
    })
  }

  return [...urls]
}

// ---------- main parser ----------

export function parseHopscotch($: CheerioAPI, _url: string): HopscotchParsed {
  const title = extractTitle($)
  const brand = extractBrand($)
  const price = extractPrice($)
  const mrp = extractMrp($)
  const rating = extractRating($)
  const review_count = extractReviewCount($)
  const { availability, unavailable } = extractAvailability($)
  const seller = extractSeller($)
  const images = extractImages($)

  const result: HopscotchParsed = {
    title,
    brand,
    price,
    mrp,
    currencyCode: 'INR', // Hopscotch is India-only, same reasoning as Ajio
    rating,
    review_count,
    availability,
    seller,
    images,
  }

  if (unavailable) {
    result._hopscotchUnavailable = true
  }

  if (!title && !price) {
    result._hopscotchWarning =
      'Neither title nor price matched any known Hopscotch selector — these are best-effort guesses (no confirmed live page yet), or the page requires client-side hydration. Send a real captured PDP to tighten these selectors.'
  }

  return result
}

// ---------- size / color options ----------
//
// UNCONFIRMED — the captured PDP's size picker only shows a "Select a
// size" placeholder with no options in static HTML (see
// REQUIRES_RENDER_FOR_VARIANTS above), so none of this could be
// verified against real markup. Left as class-based guesses for
// whenever the render tier is wired up for this site.

export function extractHopscotchOptions($: CheerioAPI): Record<string, string> | null {
  const options: Record<string, string> = {}

  const selectedSize = firstText($, [
    '[class*="size-selector"] [class*="selected"]',
    '[class*="size-list"] [class*="active"]',
    '[class*="size"][class*="selected"]',
  ])
  if (selectedSize) options.Size = selectedSize

  const selectedColor =
    firstText($, ['[class*="color-name"]', '[class*="selected-color"]']) ||
    firstAttr($, [['[class*="color-swatch"] [class*="selected"] img', 'alt']])
  if (selectedColor) {
    const cleaned = selectedColor.replace(/^colou?r\s*:\s*/i, '').trim()
    if (cleaned) options.Color = cleaned
  }

  return Object.keys(options).length ? options : null
}

// ---------- internal-metadata consumption ----------

export function consumeHopscotchMeta(parsed: Record<string, any>): {
  warning: string | null
  unavailable: boolean
} {
  const warning = typeof parsed._hopscotchWarning === 'string' ? parsed._hopscotchWarning : null
  const unavailable = !!parsed._hopscotchUnavailable

  delete parsed._hopscotchWarning
  delete parsed._hopscotchUnavailable

  return { warning, unavailable }
}

// ---------- hydration check ----------
//
// Used by parsers.ts's STATIC_CONTENT_SUFFICIENT. Unlike Ajio's
// hasHydratedAjioMarkup (a hardcoded class-name string check, confirmed
// against a real captured page), this re-runs the actual title/price
// extraction against the raw HTML and treats "found either one" as
// sufficient. Confirmed against a real captured PDP that title and
// price (via the text-based "Best price ₹X" / MRP-label matching
// above) are both present in the static, pre-hydration HTML — so this
// signal is reliable for at least the title/price fields, even though
// size/color options genuinely are NOT present until hydration (see
// REQUIRES_RENDER_FOR_VARIANTS). It errs toward NOT escalating to the
// (slower, and here still self-hosted/free, but not "no cost") render
// tier unless both title and price are genuinely absent.
export function hasHydratedHopscotchMarkup(html: string): boolean {
  const $ = cheerio.load(html)
  return !!(extractTitle($) || extractPrice($))
}