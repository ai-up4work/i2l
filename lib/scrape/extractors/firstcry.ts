// lib/scrape/extractors/firstcry.ts
//
// REWRITE NOTE (v2): Originally built against one Babyoye onesie PDP
// (product id 24045357) where selectors were confirmed against a fully
// SSR'd response. A later scrape of a DIFFERENT real product (Pine Kids
// co-ord night suit, product id 23918728) came back with title/price/mrp
// all null despite the selectors below being byte-for-byte correct
// against that second page's actual markup too.
//
// ROOT CAUSE (confirmed): this site is Angular Universal SSR
// (`<app-productdetail-rvp>` wrapper). When SSR succeeds, the fully
// rendered markup below is what a plain fetch() gets back. When SSR is
// skipped (bot suspicion, load-shedding, inconsistent — exact trigger
// unconfirmed), the response is just the bare
// `<app-productdetail-rvp></app-productdetail-rvp>` wrapper with nothing
// inside until client-side hydration runs. That shell is NOT a
// CAPTCHA/block page (won't trip looksBlocked()) and isn't obviously
// JS-required boilerplate either (won't trip looksLikeJsRequiredShell())
// — it's a silent miss. The fix lives in parsers.ts: FirstCry is now
// wired into the same STATIC_CONTENT_SUFFICIENT / RENDER_FALLBACK_HOSTS
// mechanism already used for Ajio's client-hydrated shell, using
// `span.h1-name` + `span.prod-price` presence as the confirmed-content
// check. See parsers.ts for that wiring — nothing below fixes that part
// on its own.
//
// CONFIRMED against TWO real captured PDPs now (24045357 and 23918728):
//   - Title: span.h1-name inside the h1 (brand + full product name as
//     plain text — no separate brand element needed for display).
//   - Price: span.prod-price carries the live selling price as a clean
//     decimal string in its own data-price attribute (e.g.
//     data-price="737.18") — no currency symbol/commas to strip, unlike
//     every other site in this codebase.
//   - MRP: a <del> tag inside the "MRP:" row (span.J14R_42.cl_75), plain
//     digits, no currency symbol either. Confirmed stable across both
//     captures despite J14R_42/cl_75 looking like build-hashed utility
//     classes — they are NOT hashed per-deploy, at least across these
//     two captures from the same session.
//   - Currency: always INR — FirstCry ships within India only.
//   - Rating/reviews: NOT rendered as visible DOM text in the star
//     widget on either captured page (both had zero/no ratings). Two
//     redundant sources exist and are both wired in below:
//       1. A top-of-page inline <script> with plain JS var assignments
//          — `avg_rating="0",totalrating="0",totalreview="0"` — on the
//          first captured page.
//       2. Hidden `#seorating`/`#seoreview` spans, confirmed present on
//          the second captured page (`<span id="seorating"><span
//          style="display:none;">NaN</span></span>` and `#seoreview`
//          similarly) — cheaper than a script scan and appears to be
//          this site's SEO-crawler-facing redundant copy of the same
//          data. Both "0" and "NaN" mean "no rating yet", not an
//          extraction failure.
//   - Availability: PInfo.Rqty inside the embedded ProductDetailJSON
//     blob is the real available-quantity signal. Falls back to
//     checking whether the page's "NOTIFY ME" (out-of-stock) section is
//     the one actually shown, if Rqty can't be parsed out.
//   - Images: swiper slides carry `src` (active slide only) or
//     `data-src` (lazy slides) in most cases — but on an SSR'd-but-not-
//     yet-interacted page, non-active slides in the MAIN swiper
//     (`#swiperSlider`, as opposed to the vertical thumbnail rail) were
//     observed carrying a THIRD form: `attr.data-src`. That is Angular's
//     property-binding syntax (`[attr.data-src]`) leaking through
//     verbatim in the SSR output before Angular has bound it to a real
//     attribute — confirmed on the second captured page, where every
//     slide but the active one had `attr.data-src` and no `data-src`.
//     All three attribute names are checked now.
//   - Color variants: CONFIRMED on the second captured page (the first
//     capture's product genuinely had no color axis, which is why the
//     original version of this file left color extraction unimplemented
//     rather than guessing). Each swatch is an
//     `<img data-color="{hex}">` inside `section[th-color]
//     .scrolling-wrapper`, with `onclick="colorclick(this, '{hex}')"`
//     driving an in-page AJAX swap rather than a page navigation — so,
//     unlike size tiles, there is no reconstructable per-color URL.
//     `alt` text is `"{full product title} - {Color name}"`; the color
//     label is taken as the text after the final " - ".
//   - Size variants: div.euro-size > div.prdSize tiles, each with
//     id="euroavail-{productId for THAT size}" and a
//     sizeClick(this, '{productId}', '{sizeCode}') onclick — confirms
//     FirstCry models every size as a DIFFERENT product id/PDP. The
//     currently-selected tile carries an extra "acivesizeBorder" class
//     (sic — that's FirstCry's actual typo'd class name).
//
// NOT CONFIRMED / OUT OF SCOPE for this pass:
//   - Per-tile price/stock for each size tile — DOM tiles still carry no
//     visible price/stock text of their own on either captured page.
//     PInfo.Rqty exists per size entry in the embedded JSON but wiring
//     that up is deferred.
//   - The exact trigger for when SSR gets skipped (bot detection vs.
//     load-based fallback vs. something else) is unconfirmed — treat the
//     render-tier fallback in parsers.ts as the mitigation, not a fix
//     for a root cause we don't actually understand yet.
//   - Whether `avg_rating`/`totalreview` script vars are present on
//     EVERY page or were specific to the first capture — the second
//     capture's provided snippet didn't include enough of the page to
//     confirm either way, hence keeping both the script-var path and
//     the #seorating/#seoreview DOM path as redundant fallbacks rather
//     than replacing one with the other.

import type { CheerioAPI } from 'cheerio'
import { cleanText } from '../shared'

export const SITE_ID = 'firstcry' as const

export const REQUIRES_RENDER_FOR_VARIANTS = false

export type FirstCryVariantOption = {
  label: string
  price: string | null
  currencyCode: string | null
  image: string | null
  url: string | null
  selected: boolean
  outOfStock?: boolean
}

export type FirstCryVariantDimension = {
  dimension: string
  options: FirstCryVariantOption[]
}

// ---------- Title ----------

export function extractFirstCryTitle($: CheerioAPI): string | null {
  return cleanText($('span.h1-name').first()) || cleanText($('h1').first())
}

// ---------- Embedded ProductDetailJSON field scanner (shared fallback) ----------
//
// Deliberately NOT a full JSON.parse — this blob is not guaranteed to be
// strict JSON (JS-style object literal, unquoted keys observed
// elsewhere in it). Regex-scoped to inside a script tag that contains
// the "ProductDetailJSON" marker so it can't accidentally match an
// unrelated numeric/string field elsewhere on the page. Used as a
// same-response fallback when a DOM selector comes up empty — NOT a fix
// for the SSR-shell case (there is no ProductDetailJSON at all in that
// case either; see file header), just extra resilience against the DOM
// class names drifting independently of the JSON blob's key names.
function extractFirstCryProductDetailField($: CheerioAPI, keys: string[]): string | null {
  let value: string | null = null
  $('script').each((_, el) => {
    if (value != null) return
    const text = $(el).html()
    if (!text || !text.includes('ProductDetailJSON')) return
    for (const key of keys) {
      const m = text.match(new RegExp(`"${key}"\\s*:\\s*"?([^",}]+)"?`))
      if (m) {
        value = m[1].trim()
        break
      }
    }
  })
  return value
}

// ---------- Price / MRP ----------

export function extractFirstCryPriceRaw($: CheerioAPI): string | null {
  const domRaw = $('span.prod-price').first().attr('data-price')
  if (domRaw && domRaw.trim()) return domRaw.trim()

  // Key names ("SP" etc) are NOT confirmed against a real
  // ProductDetailJSON dump — only BN (brand) and Rqty are confirmed.
  // This is a best-effort fallback; verify against a raw blob dump
  // before relying on it.
  const scriptRaw = extractFirstCryProductDetailField($, ['SP', 'SellingPrice', 'Price'])
  if (!scriptRaw) return null
  const m = scriptRaw.replace(/,/g, '').match(/[\d.]+/)
  return m ? m[0] : null
}

export function extractFirstCryMrpRaw($: CheerioAPI): string | null {
  const domText = cleanText($('span.J14R_42.cl_75 del').first())
  if (domText) {
    const m = domText.replace(/,/g, '').match(/[\d.]+/)
    if (m) return m[0]
  }

  // Same caveat as extractFirstCryPriceRaw — key names unconfirmed.
  const scriptRaw = extractFirstCryProductDetailField($, ['MRP', 'ListPrice'])
  if (!scriptRaw) return null
  const m = scriptRaw.replace(/,/g, '').match(/[\d.]+/)
  return m ? m[0] : null
}

// ---------- Images ----------
//
// Three attribute forms observed across the two captured pages: `src`
// (active slide), `data-src` (lazy slides, first capture), and
// `attr.data-src` (lazy slides in the main swiper, second capture —
// Angular's `[attr.data-src]` property-binding syntax leaking through
// verbatim pre-hydration). `583x720` is the confirmed full-size image
// path segment used by the zoom/main viewer.
export function extractFirstCryImages($: CheerioAPI): string[] {
  const images = new Set<string>()
  $('.swiper-slide img.prodbig-img').each((_, el) => {
    const $img = $(el)
    const src = $img.attr('src') || $img.attr('data-src') || $img.attr('attr.data-src')
    if (src) images.add(src.startsWith('//') ? `https:${src}` : src)
  })
  return [...images]
}

// ---------- Embedded script-var scanner (rating/review counts) ----------
//
// avg_rating / totalreview are plain JS var assignments inside an
// inline <script> near the top of the page (not JSON, not window.X —
// just `var ...,avg_rating="0",totalrating="0",totalreview="0",...`).
function extractFirstCryScriptVar($: CheerioAPI, varName: string): string | null {
  let value: string | null = null
  $('script').each((_, el) => {
    if (value != null) return
    const text = $(el).html()
    if (!text || !text.includes(varName)) return
    const re = new RegExp(`${varName}\\s*=\\s*"([^"]*)"`)
    const m = text.match(re)
    if (m) value = m[1]
  })
  return value
}

export function extractFirstCryRating($: CheerioAPI): string | null {
  const scriptRaw = extractFirstCryScriptVar($, 'avg_rating')
  // #seorating/#seoreview are hidden spans confirmed present on the
  // second captured page — a cheaper, more reliably-present fallback
  // than scanning script text. Values seen there: "NaN" for an unrated
  // product, mirroring the script var's "0" for the same case.
  const domRaw = cleanText($('#seorating span').first())
  const raw = scriptRaw ?? domRaw
  if (!raw) return null
  const n = parseFloat(raw)
  return Number.isFinite(n) && n > 0 ? String(n) : null
}

export function extractFirstCryReviewCount($: CheerioAPI): string | null {
  const scriptRaw = extractFirstCryScriptVar($, 'totalreview')
  const domRaw = cleanText($('#seoreview span').first())
  const raw = scriptRaw ?? domRaw
  if (!raw) return null
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? String(n) : null
}

// ---------- Availability ----------

function extractFirstCryRqty($: CheerioAPI): number | null {
  let rqty: number | null = null
  $('script').each((_, el) => {
    if (rqty != null) return
    const text = $(el).html()
    if (!text || !text.includes('ProductDetailJSON')) return
    const m = text.match(/"Rqty"\s*:\s*(\d+)/)
    if (m) rqty = parseInt(m[1], 10)
  })
  return rqty
}

export function isFirstCryUnavailable($: CheerioAPI): boolean {
  const rqty = extractFirstCryRqty($)
  if (rqty != null) return rqty <= 0

  const $notify = $('section.notifyMe').first()
  if ($notify.length) {
    const style = $notify.attr('style') || ''
    if (!/display\s*:\s*none/i.test(style)) return true
  }
  return false
}

// ---------- Brand ----------

export function extractFirstCryBrand($: CheerioAPI): string | null {
  let brand: string | null = null
  $('script').each((_, el) => {
    if (brand) return
    const text = $(el).html()
    if (!text || !text.includes('ProductDetailJSON')) return
    const m = text.match(/"BN"\s*:\s*"([^"]*)"/)
    if (m) brand = m[1]
  })
  return brand
}

// ---------- Color variants ----------
//
// Confirmed against the second captured page (colorsize product) — the
// first capture's product had no color axis. Each swatch has no
// per-color URL (onclick drives an in-page AJAX swap, not navigation),
// so `url` is intentionally always null here — informational only, same
// pattern buildStoreVariantDimensions uses for Shopify/WooCommerce
// read-only variant tiles in parsers.ts.
export type FirstCryColorOption = {
  label: string | null
  colorHex: string | null
  image: string | null
  selected: boolean
}

export function extractFirstCryColorVariants($: CheerioAPI): FirstCryColorOption[] {
  const options: FirstCryColorOption[] = []

  $('section[th-color] .scrolling-wrapper img[data-color]').each((_, el) => {
    const $img = $(el)
    const alt = $img.attr('alt') || ''
    // alt format: "{full product title} - {Color name}" — take the
    // trailing segment after the final " - " as the color label.
    const label = alt.includes(' - ') ? alt.split(' - ').pop()!.trim() : null
    const src = $img.attr('src')

    options.push({
      label,
      colorHex: $img.attr('data-color') || null,
      image: src ? (src.startsWith('//') ? `https:${src}` : src) : null,
      selected: /\bactive\b/.test($img.attr('class') || ''),
    })
  })

  return options
}

// ---------- Size variants ----------
//
// Each tile is its own PDP (different product id), so the "URL" for a
// non-selected size tile is reconstructed by substituting that tile's
// product id into the current page URL's trailing
// /<id>/product-detail segment, not read from an href (the tile itself
// has no <a>, just an onclick).
const FIRSTCRY_PRODUCT_ID_RE = /\/(\d+)\/product-detail(?:[/?#]|$)/i

function resolveFirstCrySizeUrl(pageUrl: string, tileProductId: string): string | null {
  if (!FIRSTCRY_PRODUCT_ID_RE.test(pageUrl)) return null
  try {
    const resolved = pageUrl.replace(FIRSTCRY_PRODUCT_ID_RE, `/${tileProductId}/product-detail`)
    return new URL(resolved).toString()
  } catch {
    return null
  }
}

export function extractFirstCrySizeVariants($: CheerioAPI, pageUrl: string): FirstCryVariantOption[] {
  const options: FirstCryVariantOption[] = []

  $('div.euro-size div.prdSize').each((_, el) => {
    const $tile = $(el)
    const label = cleanText($tile.find('span.sizetxt').first()) || cleanText($tile)
    if (!label) return

    const idAttr = $tile.attr('id') || ''
    const tileProductId = idAttr.replace(/^euroavail-/, '')
    const selected = /\bacivesizeBorder\b/.test($tile.attr('class') || '')

    options.push({
      label,
      price: null,
      currencyCode: null,
      image: null,
      url: tileProductId ? resolveFirstCrySizeUrl(pageUrl, tileProductId) : null,
      selected,
    })
  })

  return options
}

export function extractFirstCryAllVariants($: CheerioAPI, pageUrl: string): FirstCryVariantDimension[] {
  const dims: FirstCryVariantDimension[] = []

  const colors = extractFirstCryColorVariants($)
  if (colors.length) {
    dims.push({
      dimension: 'Color',
      options: colors.map((c) => ({
        label: c.label ?? c.colorHex ?? 'Unknown',
        price: null,
        currencyCode: null,
        image: c.image,
        url: null, // no per-color URL — see extractFirstCryColorVariants
        selected: c.selected,
      })),
    })
  }

  const sizes = extractFirstCrySizeVariants($, pageUrl)
  if (sizes.length) dims.push({ dimension: 'Size', options: sizes })

  return dims
}

// ---------- Composed parser ----------

export function parseFirstCry($: CheerioAPI, url: string) {
  const priceRaw = extractFirstCryPriceRaw($)
  const mrpRaw = extractFirstCryMrpRaw($)

  const result: Record<string, any> = {
    title: extractFirstCryTitle($),
    brand: extractFirstCryBrand($),
    price: priceRaw,
    mrp: mrpRaw,
    currencyCode: 'INR',
    rating: extractFirstCryRating($),
    review_count: extractFirstCryReviewCount($),
    availability: null,
    seller: null,
    images: extractFirstCryImages($),
  }

  if (isFirstCryUnavailable($)) {
    result.availability = 'Out of stock'
    result._firstCryUnavailable = true
  }

  const variants = extractFirstCryAllVariants($, url)
  if (variants.length) result.variants = variants

  return result
}

// ---------- Consume FirstCry metadata ----------

export function consumeFirstCryMeta(parsed: Record<string, any>): { warning?: string; unavailable?: boolean } {
  const unavailable = parsed._firstCryUnavailable as boolean | undefined
  delete parsed._firstCryUnavailable
  return { unavailable }
}