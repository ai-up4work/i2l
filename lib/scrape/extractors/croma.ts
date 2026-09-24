// lib/scrape/extractors/croma.ts
import type { CheerioAPI, Cheerio } from 'cheerio'
import type { Element } from 'domhandler'
import { cleanText } from '../shared'
import type { AmazonVariantDimension } from './amazon'

// ---------------------------------------------------------------------
// Croma (www.croma.com) product-page extractor.
//
// CAPTURE SCOPE: two pages now.
//   1. /p/270772 (AGARO Regal Plus vacuum) — a markdown-converted text
//      view, no raw HTML, no variants on this product.
//   2. /p/316060 (32" LED TV) — a full raw HTML capture. This is what
//      confirmed the variant picker below, and also independently
//      confirmed several previously-"UNCONFIRMED" guesses were right:
//      #pdp-product-price and #old-price (with data-value="...") are
//      real ids, not guesses — see PRICE_SELECTORS/MRP_SELECTORS.
// Everything below is either:
//   CONFIRMED  — seen directly in one of these two captures
//   UNCONFIRMED — a best guess, marked as such, with a fallback behind it
//
// CONFIRMED from capture 1 (vacuum):
//   - Product id is the trailing /p/{id} in the URL (270772).
//   - Gallery <img alt> is "{full title}_{n}" (e.g. "..._1"), and the
//     first image src is media-ik.croma.com/.../{id}_0_{hash}.png.
//   - Gallery images 2..9 were `lazyLoading.gif` placeholders in the
//     static response — same shape of problem as Lenskart's swatches.
//     Real URLs are hash-suffixed, so they can't be derived from the id.
//   - Text "Rating: 4.3", CTAs "Buy Now" / "Add to Cart" (plain text).
//   - "Key Features" heading appears twice; the first is followed by
//     unrelated badges ("7 Days Brand Replacement"), the second by the
//     real feature list. Picked by "most list items".
//   - "Specifications": h3 group headings, h4 spec names, value text
//     right after each name. Rows include Brand, Model Number, Warranty,
//     Country of Origin, Manufacturer/Importer/Marketer ….
//   - Breadcrumb links have hrefs like /home-appliances/vacuum-cleaners/c/50
//     and appear twice (desktop + mobile lists).
//   - "Overview" heading + prose; a "User Manual" PDF link.
//
// CONFIRMED from capture 2 (TV), additionally:
//   - VARIANT PICKER: `li.variant-info-item` holds one dimension —
//     `p.variant-info-title` is the dimension name (e.g. "Screen Size in
//     Inches"), and `div.cp-radio` inside it holds one
//     `div.cp-radio-item.typ-label` per option: a bare `<input
//     type="radio">` immediately followed by its `<label>` (the option's
//     display text, e.g. "43", "32"). The currently-loaded product's own
//     size carries `checked=""` on its input. Multiple `variant-info-item`
//     rows would mean multiple dimensions (e.g. size AND color on some
//     other category) — this extractor doesn't assume there's only one.
//   - IMPORTANT GAP: the radio inputs carry no href/data-url. Selecting a
//     different size clearly re-navigates the page (via same-origin JS
//     Croma doesn't expose in static HTML) to a *different* product id's
//     own PDP — there's no `?size=` query param pattern to construct one
//     from, the way Shopify's `?variant=` works. So, like FirstCry's
//     colour swatches, these tiles are extracted as INFORMATIONAL ONLY:
//     `url` is always null. The UI still shows every size and which one
//     is selected; clicking a non-selected tile just can't re-fetch it.
//   - #pdp-product-price / #old-price (data-testid="new-price" /
//     "old-price", each with a numeric `data-value`/`value` attribute) —
//     confirms two of the PRICE_SELECTORS/MRP_SELECTORS guesses were
//     exactly right. Text scan remains as the fallback for pages where
//     they aren't present.
//
// !! HEAD-vs-BODY MISMATCH (important, capture 1) !!
// In the vacuum capture, <title>/og:title/meta-description described a
// DIFFERENT product ("ambrane MiniVac 01 …") while the body and og:image
// were the AGARO product. Could be a stale cached head, could be a
// fetcher artifact — unknown, and not reproduced in capture 2. Either
// way head-derived fields can't be trusted blindly here, so:
//   - Title comes from the body (h1, else gallery alt), never og:title.
//   - JSON-LD is only accepted if it matches this product (id or title).
//   - parsers.ts should list 'croma' in SKIP_STRUCTURED_FALLBACK so the
//     generic JSON-LD/OG merge can't write a wrong-product price/title.
//   - A warning is emitted when og:title disagrees with the body title.
//
// PRICE: order of attempts, unchanged in shape now that (2) is confirmed
// rather than guessed:
//   1. guarded JSON-LD Product.offers.price
//   2. confirmed selectors (#pdp-product-price, #old-price) — capture 2
//   3. heuristic scan for a leaf element whose whole text is "₹1,234",
//      skipping EMI/offer/carousel/compare ancestors; first non-strike
//      is the price, first strikethrough is the MRP.
// (3) still sets a warning so a reviewer knows the price was inferred,
// on pages that don't use the confirmed ids.
//
// STILL NOT HANDLED: per-tile stock (radios carry no visible OOS state
// in this capture), bank offers, delivery/pincode estimates. Currency is
// hardcoded INR.
// ---------------------------------------------------------------------

export const SITE_ID = 'croma' as const

// The confirmed variant picker (see header) is present in this same
// static/rendered HTML dump that already carries the hydrated price —
// Croma is already forced through the render tier for price reasons
// (see RENDER_FALLBACK_HOSTS/STATIC_CONTENT_SUFFICIENT in parsers.ts),
// so variant data rides along with that regardless of this flag's value.
export const REQUIRES_RENDER_FOR_VARIANTS = false

export type CromaSpec = { name: string; value: string }

export type CromaParsed = {
  title: string | null
  brand: string | null
  price: string | null
  mrp: string | null
  currencyCode: string
  rating: string | null
  review_count: string | null
  availability: string | null
  seller: string | null
  images: string[]
  description?: string | null
  keyFeatures?: string[] | null
  itemSpecifics?: CromaSpec[] | null
  categoryPath?: string | null
  mpn?: string | null
  discountPercentage?: number | null
  legalInfo?: CromaSpec[] | null
  manualUrl?: string | null
  /** Size/color/etc picker — see header's VARIANT PICKER note. Every
   * option's `url` is null (informational only); `selected` reflects the
   * radio's `checked` attribute. Undefined (not just empty) when the
   * page has no variant-info-item rows at all, matching how the other
   * optional array fields on this type behave. */
  variants?: AmazonVariantDimension[] | null
  _cromaWarning?: string
  _cromaUnavailable?: boolean
}

// ---------- small helpers ----------

function ownText($el: Cheerio<Element>): string {
  return $el
    .contents()
    .filter((_, node) => node.type === 'text')
    .text()
    .replace(/\s+/g, ' ')
    .trim()
}

function toNumberString(text: string | null | undefined): string | null {
  if (!text) return null
  const m = text.replace(/,/g, '').match(/\d+(?:\.\d+)?/)
  return m ? m[0] : null
}

function normalizeUrl(src: string): string {
  return src.startsWith('//') ? `https:${src}` : src
}

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
}

// True when the first two meaningful words of `a` (brand + line, e.g.
// "agaro regal") both fail to appear in `b`.
function headsDisagree(a: string, b: string): boolean {
  const bt = new Set(tokens(b))
  const head = tokens(a).slice(0, 2)
  return head.length > 0 && head.every((w) => !bt.has(w))
}

export function extractCromaProductId(url: string): string | null {
  try {
    const m = new URL(url).pathname.match(/\/p\/(\d+)/i)
    return m ? m[1] : null
  } catch {
    return null
  }
}

// Ancestors whose class/id says "this is not THE product's own price".
const NOISE_ANCESTOR_RE =
  /(?:^|[\s_-])(?:emi|similar|recommend\w*|carousel|swiper\w*|compare|cashback|bank\w*|footer|minicart|mini-cart|sponsored)(?:[\s_-]|$)/i

function inNoiseScope($: CheerioAPI, $el: Cheerio<Element>): boolean {
  let noisy = false
  $el.parents().each((_, p) => {
    const sig = `${$(p).attr('class') || ''} ${$(p).attr('id') || ''}`
    if (NOISE_ANCESTOR_RE.test(sig)) {
      noisy = true
      return false
    }
  })
  return noisy
}

const STRIKE_CLASS_RE = /(?:^|[\s_-])(?:old|mrp|strike\w*|was)(?:[\s_-]|$)|oldprice|mrpprice/i

function isStrikethrough($: CheerioAPI, $el: Cheerio<Element>): boolean {
  const tag = String($el.prop('tagName') || '').toLowerCase()
  if (tag === 'del' || tag === 's' || tag === 'strike') return true
  if (/line-through/i.test($el.attr('style') || '')) return true
  if (STRIKE_CLASS_RE.test(`${$el.attr('class') || ''} ${$el.attr('id') || ''}`)) return true
  return $el.parents('del, s, strike').length > 0
}

// ---------- Title ----------

export function extractCromaTitle($: CheerioAPI): string | null {
  const h1 = cleanText($('h1').first())
  if (h1) return h1

  // CONFIRMED fallback: gallery <img alt="{title}_{n}">.
  const found: string[] = []
  $('img[alt]').each((_, el) => {
    if (found.length) return false
    const alt = ($(el).attr('alt') || '').trim()
    const m = alt.match(/^(.{15,}?)_\d+$/)
    if (m) found.push(m[1].trim())
  })
  return found[0] ?? null
}

// ---------- Section scoping ----------

// Walk up from a heading (max 4 levels) until the wrapper contains
// `contentSelector`. Bounded so it can't climb to <body> and swallow
// the whole page's <li>s.
function scopeFromHeading($h: Cheerio<Element>, contentSelector: string): Cheerio<Element> | null {
  let $scope = $h
  for (let i = 0; i < 4; i++) {
    const $parent = $scope.parent()
    if (!$parent.length) return null
    $scope = $parent as Cheerio<Element>
    if ($scope.find(contentSelector).length) return $scope
  }
  return null
}

function headingsMatching($: CheerioAPI, re: RegExp): Cheerio<Element>[] {
  const out: Cheerio<Element>[] = []
  $('h2, h3').each((_, el) => {
    if (re.test(cleanText($(el)) ?? '')) out.push($(el) as Cheerio<Element>)
  })
  return out
}

// ---------- Key features ----------

export function extractCromaKeyFeatures($: CheerioAPI): string[] {
  let best: string[] = []
  for (const $h of headingsMatching($, /^key features$/i)) {
    const $scope = scopeFromHeading($h, 'li')
    if (!$scope) continue
    const items: string[] = []
    $scope.find('li').each((_, li) => {
      const t = cleanText($(li))
      if (t && t.length >= 3 && t.length <= 200 && !items.includes(t)) items.push(t)
    })
    if (items.length > best.length) best = items
  }
  return best
}

// ---------- Variant picker (CONFIRMED — capture 2, e.g. Screen Size) ----------
//
// Structure: li.variant-info-item > p.variant-info-title (dimension name)
// + div.cp-radio > div.cp-radio-item.typ-label per option, each holding a
// bare <input type="radio"> immediately followed by its <label> (option
// text). No href/data-url anywhere in this markup — see header's GAP
// note — so every option's `url` is deliberately always null.
export function extractCromaVariants($: CheerioAPI): AmazonVariantDimension[] {
  const dims: AmazonVariantDimension[] = []

  $('li.variant-info-item, li[class*="variant-info-item"]').each((_, li) => {
    const $li = $(li) as Cheerio<Element>
    const dimension = cleanText($li.find('.variant-info-title, p').first())
    if (!dimension) return

    const options: AmazonVariantDimension['options'] = []
    $li.find('input[type="radio"]').each((_, input) => {
      const $input = $(input) as Cheerio<Element>
      // Label is the input's own next sibling within the same
      // cp-radio-item wrapper — CONFIRMED shape, not id-selector-based,
      // so it doesn't care that some real ids contain spaces
      // (e.g. id="43Screen Size in Inches").
      let $label = $input.siblings('label').first()
      if (!$label.length) $label = $input.next('label')
      const label = cleanText($label.length ? $label : $input.parent())
      if (!label) return

      options.push({
        label,
        price: null,
        currencyCode: null,
        image: null,
        url: null,
        selected: $input.attr('checked') !== undefined,
        outOfStock: $input.attr('disabled') !== undefined,
      })
    })

    if (options.length) dims.push({ dimension, options })
  })

  return dims
}

// ---------- Specifications ----------

export function extractCromaSpecs($: CheerioAPI): CromaSpec[] {
  const [$h] = headingsMatching($, /^specifications$/i)
  if (!$h) return []
  const $scope = scopeFromHeading($h, 'h4')
  if (!$scope) return []

  const specs: CromaSpec[] = []
  const seenPair = new Set<string>()
  const nameToValue = new Map<string, string>()
  let group = ''

  $scope.find('h3, h4').each((_, el) => {
    const $el = $(el)
    const tag = String($el.prop('tagName') || '').toLowerCase()
    const label = cleanText($el)
    if (!label) return
    if (tag === 'h3') {
      group = label
      return
    }

    // Value: next sibling; else text in the same wrapper (only when this
    // wrapper holds a single h4); else the wrapper's next sibling, unless
    // that is itself another spec-name row. (UNCONFIRMED which is real.)
    let value = cleanText($el.next())
    if (!value) {
      const $wrap = $el.parent()
      if ($wrap.find('h4').length === 1) {
        const rest = (cleanText($wrap) ?? '').replace(label, '').trim()
        if (rest) value = rest
      }
    }
    if (!value) {
      const $sib = $el.parent().next()
      if (!$sib.find('h4').length && !$sib.is('h4')) value = cleanText($sib)
    }
    if (!value || value === label) return

    const pairKey = `${group}|${label}|${value}`
    if (seenPair.has(pairKey)) return
    seenPair.add(pairKey)

    // Same name, different value (e.g. "Others", "Generic Name") -> prefix group.
    let name = label
    if (nameToValue.has(label) && nameToValue.get(label) !== value && group) {
      name = `${group} – ${label}`
    }
    if (!nameToValue.has(label)) nameToValue.set(label, value)
    specs.push({ name, value })
  })

  return specs
}

function specValue(specs: CromaSpec[], nameRe: RegExp): string | null {
  return specs.find((s) => nameRe.test(s.name))?.value ?? null
}

const LEGAL_NAME_RE = /country of origin|country of brand origin|manufacturer|importer|marketer|net quantity|packed by/i

// ---------- Overview / manual ----------

export function extractCromaOverview($: CheerioAPI): string | null {
  const [$h] = headingsMatching($, /^overview$/i)
  if (!$h) return null
  const $scope = scopeFromHeading($h, 'p, strong, b')
  if (!$scope) return null
  const text = (cleanText($scope) ?? '')
    .replace(/^overview\s*/i, '')
    .replace(/\s*view more\s*$/i, '')
    .trim()
  return text ? text.slice(0, 2000) : null
}

export function extractCromaManualUrl($: CheerioAPI): string | null {
  let url: string | null = null
  $('a[href$=".pdf" i], a[href*=".pdf?" i]').each((_, el) => {
    if (url) return false
    if (/user manual/i.test(cleanText($(el)) ?? '')) url = normalizeUrl($(el).attr('href') || '')
  })
  return url
}

// ---------- Breadcrumbs (CONFIRMED links; container class UNCONFIRMED) ----------

const CATEGORY_HREF_RE = /\/c\/\d+\/?$/i

export function extractCromaCategoryPath($: CheerioAPI): string | null {
  const collect = ($root: Cheerio<Element>): string[] => {
    const names: string[] = []
    $root.find('a[href*="/c/"]').each((_, a) => {
      const href = $(a).attr('href') || ''
      const text = cleanText($(a))
      if (text && CATEGORY_HREF_RE.test(href.split('?')[0]) && !names.includes(text)) names.push(text)
    })
    return names
  }

  // 1. A container that says "breadcrumb" in its class/aria-label.
  const $named = $('[class*="bread" i], [aria-label*="bread" i]').first()
  if ($named.length) {
    const names = collect($named as Cheerio<Element>)
    if (names.length) return names.join(' > ')
  }

  // 2. Structural fallback: the first short list where EVERY item is a
  // category link. A mega-menu has far more than 6 items, so it's skipped.
  let path: string | null = null
  $('ul, ol').each((_, list) => {
    if (path) return false
    const $items = $(list).children('li')
    if ($items.length < 2 || $items.length > 6) return
    const allLinks = $items.toArray().every((li) => $(li).find('a[href*="/c/"]').length > 0)
    if (!allLinks) return
    const names = collect($(list) as Cheerio<Element>)
    if (names.length) path = names.join(' > ')
  })
  return path
}

// ---------- Images ----------

const CROMA_IMG_HOST_RE = /media(?:-ik)?\.(?:tatacroma|croma)\.com/i
const PLACEHOLDER_RE = /lazyLoading|placeholder|\/UI%20Assets\/|\/UI Assets\//i

function firstUrlFromSrcset(srcset: string): string | null {
  return srcset.split(',')[0]?.trim().split(/\s+/)[0] || null
}

export function extractCromaImages($: CheerioAPI, productId: string | null): string[] {
  const seen = new Set<string>()
  const urls: string[] = []

  const add = (raw: string | undefined | null) => {
    if (!raw) return
    const url = normalizeUrl(raw.trim())
    if (!url || url.startsWith('data:') || url.startsWith('blob:')) return
    if (!CROMA_IMG_HOST_RE.test(url) || PLACEHOLDER_RE.test(url)) return
    // Product photos are named "{productId}_{n}_{hash}.ext" (CONFIRMED for
    // image 1). Requiring the id drops logos, the spec PDF icon, and
    // similar-product thumbnails.
    if (productId && !url.includes(`${productId}_`)) return
    const key = url.split('?')[0]
    if (seen.has(key)) return
    seen.add(key)
    urls.push(url)
  }

  $('img').each((_, el) => {
    const $img = $(el)
    for (const attr of ['src', 'data-src', 'data-lazy-src', 'data-original']) add($img.attr(attr))
    for (const attr of ['srcset', 'data-srcset']) {
      const s = $img.attr(attr)
      if (s) add(firstUrlFromSrcset(s))
    }
  })

  return urls
}

// ---------- Price / MRP / discount ----------

const RUPEE_TEXT_RE = /^(?:₹|rs\.?|inr)\s?\d[\d,]*(?:\.\d+)?$/i

// CONFIRMED by capture 2 (#pdp-product-price / #old-price); the rest stay
// as guesses tried first in case a different template uses them instead.
const PRICE_SELECTORS = ['#pdp-product-price', '[data-testid="pdp-price"]', '[data-testid="new-price"]', '.pdp-price .amount']
const MRP_SELECTORS = ['#old-price', '[data-testid="old-price"]', '.old-price', '.pdp-mrp']

type PriceBlock = {
  price: string | null
  mrp: string | null
  discountPercentage: number | null
  via: 'selector' | 'text_scan' | null
}

export function extractCromaPriceBlock($: CheerioAPI): PriceBlock {
  const firstNumber = (selectors: string[]): string | null => {
    for (const sel of selectors) {
      const hits: string[] = []
      $(sel).each((_, el) => {
        if (hits.length) return false
        const $el = $(el) as Cheerio<Element>
        if (inNoiseScope($, $el)) return
        const n = toNumberString(cleanText($el))
        if (n) hits.push(n)
      })
      if (hits[0]) return hits[0]
    }
    return null
  }

  let price = firstNumber(PRICE_SELECTORS)
  let mrp = firstNumber(MRP_SELECTORS)
  let via: PriceBlock['via'] = price ? 'selector' : null

  if (!price || !mrp) {
    const candidates: { value: string; strike: boolean }[] = []
    $('span, div, p, strong, b, del, s, ins').each((_, el) => {
      if (candidates.length >= 12) return false
      const $el = $(el) as Cheerio<Element>
      const t = cleanText($el)
      if (!t || t.length > 20 || !RUPEE_TEXT_RE.test(t)) return
      if (inNoiseScope($, $el)) return
      const value = toNumberString(t)
      if (!value) return
      candidates.push({ value, strike: isStrikethrough($, $el) })
    })
    if (!price) {
      price = candidates.find((c) => !c.strike)?.value ?? null
      if (price) via = 'text_scan'
    }
    if (!mrp) mrp = candidates.find((c) => c.strike)?.value ?? null
  }

  // A markdown is only real if MRP > price.
  if (price && mrp && Number(mrp) <= Number(price)) mrp = null

  let discountPercentage: number | null = null
  $('span, div, p').each((_, el) => {
    if (discountPercentage != null) return false
    const t = ownText($(el) as Cheerio<Element>)
    const m = t.match(/^\(?\s*(\d{1,2}(?:\.\d+)?)\s*%\s*off\s*\)?$/i)
    if (m) discountPercentage = parseFloat(m[1])
  })

  return { price, mrp, discountPercentage, via }
}

// ---------- Guarded JSON-LD ----------

type CromaLd = {
  price: string | null
  currencyCode: string | null
  rating: string | null
  review_count: string | null
  availability: string | null
}

export function extractCromaJsonLd($: CheerioAPI, productId: string | null, title: string | null): CromaLd | null {
  let result: CromaLd | null = null

  $('script[type="application/ld+json"]').each((_, el) => {
    if (result) return false
    const raw = $(el).html()
    if (!raw) return
    let data: any
    try {
      data = JSON.parse(raw)
    } catch {
      return
    }
    const nodes = (Array.isArray(data) ? data : [data]).flatMap((n: any) => (n?.['@graph'] ? n['@graph'] : [n]))
    for (const item of nodes) {
      if (!item || item['@type'] !== 'Product') continue
      const offers = Array.isArray(item.offers) ? item.offers[0] : item.offers

      const idBlob = JSON.stringify([item.sku, item.productID, item.mpn, item.url, offers?.url])
      const idMatch = !!productId && idBlob.includes(productId)
      const nameMatch = !!title && typeof item.name === 'string' && !headsDisagree(title, item.name)
      if (!idMatch && !nameMatch) continue // wrong product's data — ignore

      const price = offers?.price ?? offers?.lowPrice ?? null
      result = {
        price: price != null ? toNumberString(String(price)) : null,
        currencyCode: offers?.priceCurrency ?? null,
        rating: item.aggregateRating?.ratingValue ? String(item.aggregateRating.ratingValue) : null,
        review_count: item.aggregateRating?.reviewCount ? String(item.aggregateRating.reviewCount) : null,
        availability: offers?.availability ? String(offers.availability).split('/').pop() ?? null : null,
      }
      break
    }
  })

  return result
}

// ---------- Rating ----------
//
// CONFIRMED (capture 1): plain text "Rating: 4.3". CONFIRMED (capture 2):
// a DIFFERENT shape — a bare "4.3" next to a star <img>, with the review
// count as a separate "(24 Ratings & 10 Reviews)" link nearby, not in the
// same wrapper as the score. Both patterns are matched.

export function extractCromaRating($: CheerioAPI): { rating: string | null; review_count: string | null } {
  let rating: string | null = null
  let review_count: string | null = null

  // Pattern A (capture 1): "Rating: 4.3" as one element's whole text.
  $('div, span, p, li').each((_, el) => {
    if (rating) return false
    const $el = $(el) as Cheerio<Element>
    const t = cleanText($el)
    if (!t || t.length > 20) return
    const m = t.match(/^rating:?\s*(\d(?:\.\d)?)$/i)
    if (!m) return
    rating = m[1]
    const nearby = cleanText($el.parent()) ?? ''
    const c = nearby.length > 200 ? null : nearby.match(/([\d,]+)\s*(?:ratings?|reviews?)/i)
    if (c) review_count = c[1].replace(/,/g, '')
  })

  // Pattern B (capture 2): a leaf element starting with "N.N " followed
  // by a star image, e.g. <span>4.3 <img class="star-image" ...></span>.
  if (!rating) {
    $('span, div').each((_, el) => {
      if (rating) return false
      const $el = $(el) as Cheerio<Element>
      if (!$el.find('img.star-image, img[alt*="star" i]').length && !$el.find('img').length) return
      const own = ownText($el)
      const m = own.match(/^(\d(?:\.\d)?)$/)
      if (!m) return
      rating = m[1]
    })
  }

  if (!review_count) {
    $('a, span').each((_, el) => {
      if (review_count) return false
      const t = cleanText($(el))
      if (!t || t.length > 60) return
      const m = t.match(/([\d,]+)\s*ratings?(?:\s*&\s*[\d,]+\s*reviews?)?/i)
      if (m) review_count = m[1].replace(/,/g, '')
    })
  }

  return { rating, review_count }
}

// ---------- Availability ----------
//
// "Buy Now" / "Add to Cart" are plain text (CONFIRMED, both captures).
// Out-of-stock wording is still UNCONFIRMED — never seen on a real
// sold-out Croma page. Capture 2's disabled CTAs
// ("disableBuyNow"/"disableCartBtn" classes with plain "Buy Now"/"Add to
// Cart" text) are a pincode-serviceability gate, not a stock signal, so
// they're deliberately NOT treated as out-of-stock here.

const BUY_CTA_RE = /^(add to cart|buy now)$/i
const OOS_RE = /^(out of stock|sold out|currently unavailable|notify me|coming soon)$/i

export function extractCromaAvailability($: CheerioAPI): { availability: string | null; unavailable: boolean } {
  let hasBuy = false
  let hasOos = false

  $('button, a, div, span').each((_, el) => {
    if (hasBuy && hasOos) return false
    const t = ownText($(el) as Cheerio<Element>)
    if (!t) return
    if (!hasBuy && BUY_CTA_RE.test(t)) hasBuy = true
    if (!hasOos && OOS_RE.test(t)) hasOos = true
  })

  if (hasBuy) return { availability: 'In stock', unavailable: false }
  if (hasOos) return { availability: 'Out of stock', unavailable: true }
  return { availability: null, unavailable: false }
}

// ---------- hydration check (for STATIC_CONTENT_SUFFICIENT in parsers.ts) ----------
//
// True only when the static HTML already shows a rupee amount in the
// visible markup (scripts/styles stripped, so a "₹" inside a JSON blob or
// a stale-head JSON-LD doesn't count).
export function hasHydratedCromaMarkup(html: string): boolean {
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  return /(?:₹|&#8377;|&#x20b9;)\s?\d[\d,]{2,}/i.test(body)
}

// ---------- main parser ----------

export function parseCroma($: CheerioAPI, url: string): CromaParsed {
  const productId = extractCromaProductId(url)
  const title = extractCromaTitle($)
  const specs = extractCromaSpecs($)
  const ld = extractCromaJsonLd($, productId, title)
  const block = extractCromaPriceBlock($)
  const domRating = extractCromaRating($)
  const { availability: ctaAvailability, unavailable } = extractCromaAvailability($)
  const images = extractCromaImages($, productId)
  const variants = extractCromaVariants($)
  if (!images.length && productId) {
    // og:image was the RIGHT product even when og:title was wrong (see
    // header) — accept it only when its filename carries this product id.
    const og = $('meta[property="og:image"]').attr('content')
    if (og && og.includes(`${productId}_`)) images.push(normalizeUrl(og))
  }

  const warnings: string[] = []

  // Head-vs-body mismatch (see header).
  const ogTitle = $('meta[property="og:title"]').attr('content') || cleanText($('title')) || ''
  if (title && ogTitle && headsDisagree(title, ogTitle)) {
    warnings.push(
      `Page <head> metadata ("${ogTitle.slice(0, 80)}") describes a different product than the page body — head-derived fields (og:*, unmatched JSON-LD) were ignored.`,
    )
  }

  const price = ld?.price ?? block.price
  if (ld?.price && block.price && ld.price !== block.price) {
    warnings.push(`JSON-LD price (${ld.price}) differs from the price scraped from the page (${block.price}) — using JSON-LD.`)
  } else if (!ld?.price && block.via === 'text_scan') {
    warnings.push('Price was inferred by scanning for a ₹ amount, not read from a confirmed price element — double-check it.')
  }
  if (price == null) {
    warnings.push(
      'No price found — Croma appears to hydrate price client-side; make sure the render tier is enabled for this site.',
    )
  }

  if (productId && !images.length) {
    warnings.push('No product images matched this product id — gallery may be lazy-loaded (needs a scrolled render).')
  } else if (images.length === 1) {
    warnings.push('Only one gallery image found — the remaining slides are lazy-loaded placeholders in static HTML.')
  }

  if (variants.length) {
    warnings.push(
      `Found a "${variants[0].dimension}" picker, but Croma's markup carries no per-option link — tiles show the available options and which is selected, but can't be clicked to switch products.`,
    )
  }

  const result: CromaParsed = {
    title,
    brand: specValue(specs, /^brand$/i) ?? (title ? title.split(/\s+/)[0] : null),
    price,
    mrp: block.mrp,
    currencyCode: ld?.currencyCode || 'INR',
    rating: domRating.rating ?? ld?.rating ?? null,
    review_count: domRating.review_count ?? ld?.review_count ?? null,
    availability: ctaAvailability ?? ld?.availability ?? null,
    seller: null, // first-party retail (Croma); marketplace sellers unconfirmed
    images,
    description: extractCromaOverview($),
    keyFeatures: (() => {
      const f = extractCromaKeyFeatures($)
      return f.length ? f : null
    })(),
    itemSpecifics: specs.length ? specs : null,
    categoryPath: extractCromaCategoryPath($),
    mpn: specValue(specs, /^model number$/i),
    discountPercentage: block.discountPercentage,
    legalInfo: (() => {
      const l = specs.filter((s) => LEGAL_NAME_RE.test(s.name))
      return l.length ? l : null
    })(),
    manualUrl: extractCromaManualUrl($),
    variants: variants.length ? variants : null,
  }

  if (unavailable) {
    result._cromaUnavailable = true
    if (!result.availability) result.availability = 'Out of stock'
  }
  if (warnings.length) result._cromaWarning = warnings.join(' | ')

  return result
}

// ---------- internal-metadata consumption ----------

export function consumeCromaMeta(parsed: Record<string, any>): {
  warning: string | null
  unavailable: boolean
} {
  const warning = typeof parsed._cromaWarning === 'string' ? parsed._cromaWarning : null
  const unavailable = !!parsed._cromaUnavailable

  delete parsed._cromaWarning
  delete parsed._cromaUnavailable

  return { warning, unavailable }
}