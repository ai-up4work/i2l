// lib/scrape/extractors/lenskart.ts
import type { CheerioAPI } from 'cheerio'
import { cleanText } from '../shared'

// ---------------------------------------------------------------------
// Lenskart (www.lenskart.com) product-page extractor.
//
// CAPTURE SCOPE:
//   1. Vincent Chase half-rim rectangle EYEGLASSES ("VCE000714") — raw
//      HTML, 2 colors, 1 size.
//   2. Vincent Chase VC-S15801-C3 SUNGLASSES — 1 color, 1 size.
//   3. "Hustlr - Dark Night" EYEGLASSES, DevTools copy — 15 colors, 4
//      sizes, 4 Product Type chips, Dark Night selected, stock-flag text
//      blank on every tile.
//   4. Same product, DevTools copy with Jade Green selected instead —
//      confirms selection logic against a second color, and confirms the
//      text-based low-stock path (this time the "Few Left" text WAS
//      present).
//   5. A LIVE scrapeProduct() run against the real PDP
//      (lenskart-hustlr-la-e15417-c10-eyeglasses.html), source: 'direct'
//      — i.e. the actual static HTML the scraper's own fetch() receives,
//      not a DevTools copy of the hydrated page. Independently confirmed
//      by directly fetching the same URL a second time outside the
//      scraper entirely. BOTH show: title, price, MRP, discount, rating,
//      review count, brand (from real breadcrumbs this time — see (f)),
//      Product Type/Frame Size/Frame Color labels, selection state, and
//      low-stock flags all come through correctly. But EVERY Frame Color
//      option's `image` is null — not just the 7 tiles previously
//      confirmed to be genuine placeholders, but all 15, including the 8
//      that carried a real bubble <img src> in every DevTools capture.
//      CONCLUSION: swatch images are 100% client-hydrated and never
//      exist in Lenskart's server-rendered HTML — confirmed from two
//      independent fetches of the real page, not an inference from a
//      DevTools snapshot. See needsLenskartSwatchImageRetry /
//      mergeLenskartSwatchImages below and their usage in
//      scrapeProduct() (parsers.ts) for the fix: a narrow, non-fatal
//      render-tier retry that backfills ONLY the image field.
// Contact lenses and power-lens add-ons remain unchecked.
//
// WHAT CAPTURE 3 SHOWED (and what changed because of it):
//
//  a) SELECTED STATE HAS NO ARIA/CLASS NAME, BUT IT IS STRUCTURALLY
//     VISIBLE. Nothing carries aria-selected/aria-pressed. What differs
//     is the styled-components HASH class on each option's inner
//     element: in capture 3, 10 of 15 color tiles share `hTWNcN`, 3
//     share `dtTIRa`, and exactly ONE carries `eeoRwX` — and that one is
//     "Dark Night", the color the page title/h2 name. In capture 4 the
//     hashes are reused for DIFFERENT roles (`dtTIRa` is now the
//     10-tile majority, `hTWNcN` a 4-tile minority, `eeoRwX` is again
//     the lone selected tile — this time Jade Green) — CONFIRMING the
//     hashes are per-build/per-render assignments with no fixed meaning;
//     nothing here hardcodes one. oddOneOutIndex() only asks "does
//     exactly one option among 3+ have a class no other option shares?".
//     With 2 options (capture 1) both are unique -> ambiguous -> nothing
//     is selected rather than guessing. For colors it is cross-checked
//     against the h2 style line ("Jade Green Full Rim Square" starts
//     with the tile's first label segment); if the two signals disagree,
//     nothing is selected. Captures 3, 4 and the live scrape (5) all
//     have the two signals agree.
//
//  b) SIZE TILES CARRY MORE THAN THEIR LETTER. aria-label is
//     "M, 134mm to 137mm" -> label "M", subtitle "134mm to 137mm". The
//     old code used the tile's full text, which would have become
//     "S Few Left" the moment a size showed a stock flag. Label now comes
//     from aria-label. aria-disabled="true" is treated as out of stock
//     (UNCONFIRMED — every tile seen so far was "false"). Capture 4 also
//     showed a "Size has updated" banner sitting in the SAME widget
//     header as the size options — confirmed to sit outside the
//     size-option container itself, so it can't leak into a size's
//     label/stock text.
//
//  c) COLOR LABELS CAN REPEAT: aria-label "Navy_Navy" is the same value
//     twice, and rendered "Navy / Navy". A label whose segments are ALL
//     identical now collapses to one. Mixed labels (2-segment
//     "Black_Gold", 5-segment "Black_Black_Amber Solid_Solid_Amber") are
//     left as "A / B / C" — we don't know what the segments mean.
//
//  d) SWATCH IMAGES ARE LAZY — AND, PER THE LIVE SCRAPE (5), NEVER EXIST
//     IN STATIC HTML AT ALL. Every DevTools capture (3, 4) showed the
//     SAME 7 tiles (Navy, Frost, Dark Night, Blue sky, Sand Dune, Blaze,
//     Pink Crystal) rendering `<div id="IOElement"></div>` — an
//     IntersectionObserver slot — with the other 8 carrying a real <img
//     src>. The live scrape (5) showed ALL 15 with `image: null`,
//     proving those "other 8" only get their <img> tag AFTER client JS
//     runs; none of it is in the server response. Bubble filenames are
//     UUIDs (`1bb34720-...`), NOT the numeric product id seen on the
//     single-color sunglasses capture (`209536_bubble.png`), so:
//       - a tile with no <img> cannot be filled from static HTML, ever
//         (confirmed, not just suspected), and
//       - the "derive `{productId}_bubble.png`" fallback is valid only
//         for that one numeric single-color case; it can never work for
//         a UUID product. Still applied to single-color products
//         (flagged imageIsDerived) but the view must tolerate a 404.
//     needsLenskartSwatchImageRetry / mergeLenskartSwatchImages (below)
//     are the fix: scrapeProduct() retries through the render tier
//     specifically for this field when it's confirmed all-null, and
//     merges by variantId/label without touching anything else. Set
//     DEBUG_SCRAPE=1 for the tiles/withImage/placeholder counts on any
//     given run.
//
//  e) NEW FIELDS. `priceNote` ("with Free BLU lenses" — the <p> beside
//     the price), `offerText` + `couponCode` (the banner "Use code
//     SINGLE for this price"; seen in every capture, including the live
//     scrape, though offerText/couponCode came back null there —
//     UNCONFIRMED why; possibly this SKU's banner text didn't match the
//     extractor's container selector, or the banner wasn't present on
//     this particular load). A "Product Type" dimension (Powered
//     Eyeglass / Zero Power / Reading Glasses / Sunglass, each with a
//     subtitle) — identical text across every capture, always "Powered
//     Eyeglass" selected.
//
//  f) BRAND: capture 3/4 had no breadcrumbs in the DevTools copy, so
//     brand relied on the title's " - " split — unreliable, since the
//     SAME product was later captured with title "Lenskart Hustlr", no
//     " - " at all. The LIVE scrape (5), fetching the real page, DID
//     have real breadcrumbs ("Lenskart HUSTLR"), confirming
//     #pdp-breadcrumbs a genuinely exists on the real page and the
//     DevTools copies simply didn't include that part of the DOM in
//     their selection. The " - " split stays as a fallback for when
//     breadcrumbs are genuinely absent, but is now confirmed to be the
//     secondary path, not the primary one.
//
//  g) STOCK-FLAG TEXT CAN BE BLANK EVEN WHEN THE FLAG IS REAL, BUT ISN'T
//     ALWAYS. Capture 3's "Few Left" span (`data-cy="plpTitleTypography-
//     XS"`) was EMPTY on every tile, including the 4 tiles that were
//     visibly flagged in the screenshot. Capture 4, of the SAME product
//     with a different color selected, shows the SAME 4 tiles (Jade
//     Green, Flamingo, Flame, Sand Dune) with the text now PRESENT
//     ("Few Left"). The live scrape (5) confirms this again independently
//     — real text, same 4 tiles. Both paths are handled:
//     detectMinorityFlag() is the structural fallback used only when the
//     text is blank on every color tile in this scrape; when at least
//     one tile has real text, the text is trusted directly and the
//     structural path is skipped entirely. The structural fallback still
//     can't tell "few left" apart from "out of stock" by class alone (no
//     word to read), so a blank-text minority is reported as lowStock —
//     the safer assumption, since it doesn't block the click the way
//     outOfStock does.
//
// WHY data-cy AND NOT sc-* CLASSES (except the odd-one-out check above,
// which compares classes to each other, never to a known value):
// `sc-xxxxxxxx-N` classes are styled-components build hashes, reassigned
// per build/render (see (a)). Lenskart also ships `data-cy` QA hooks,
// which are the stable target.
//
// THE data-cy TRAP — SCOPE EVERYTHING:
// A `data-cy` value is a TYPOGRAPHY TOKEN ("plpTitleTypography-L"), not
// a field name, reused for unrelated content ("plpTitleTypography-S" is
// the discount badge AND a Product Type chip title AND the gallery
// rating badge). Every selector is anchored in a confirmed container.
//
// CONFIRMED (now including against a live, non-DevTools fetch):
//   - Title h1[data-cy="plpTitleTypography-XL"]; style line h2
//     [data-cy="plpBodyTypography-S"][title] -> `styleDescription`.
//   - Price / MRP / discount %: span[data-cy="plpTitleTypography-L"],
//     del[data-cy="plpStrikethroughTypography-S"] and a "(NN% OFF)" span,
//     inside [data-cy="plpClarityProductSummarySection"].
//   - Rating span[data-cy="plpHeadingTypography-M"]; review count from a
//     `title` like "6939 Reviews" / "44701 Reviews".
//   - Brand: #pdp-breadcrumbs a — genuinely present in the real page
//     (see (f)), not just a hoped-for fallback.
//   - Frame Color: div[role="group"][aria-label="Frame Color"] wrapping
//     div[data-cy^="color-option-"]; stock flag in
//     span[data-cy="plpTitleTypography-XS"] ("Few Left" seen, sometimes
//     with no text — see (g); the flag's class-based fallback lives on
//     that span's PARENT, the tile's 2nd child div).
//   - Frame Size: div[role="group"][aria-label="Frame Size"] >
//     [data-cy="size-options-container"] > [data-cy^="size-option-"].
//     Multi-size CONFIRMED by captures 3, 4, and the live scrape.
//   - Product Type: <h3>Product Type</h3>, then a sibling wrapper of
//     div[data-cy="chip-container"] (title span + subtitle <p>).
//   - Images: `img` in [role="region"][aria-label*="Product image
//     gallery"] (Next/Image, resolved src) — main gallery images ARE
//     present in static HTML (6/6 resolved in the live scrape); it's
//     only the swatch bubbles that are hydration-only. A stray
//     other-product image was seen once at the end of the sunglasses
//     gallery; not filtered.
//
// UNCONFIRMED / NOT HANDLED:
//   - Per-swatch navigable URL: each Frame Color / Frame Size tile is a
//     `div[role="button"]`, not an `<a href>` — there is NO link anywhere
//     in the DOM for switching color/size, confirmed across both
//     15-color captures AND the live scrape. The tile's `id` attribute
//     (e.g. "27481_27648") is captured as `variantId` in case it's useful
//     later (it looks like a productId_something pair, consistent with
//     each color being a distinct catalog product), but we do NOT
//     fabricate a URL from it — we have no confirmed evidence of what,
//     if anything, Lenskart's client does with it (in-page state swap vs.
//     an XHR vs. an actual route change). `url` stays null until a real
//     network capture (DevTools, clicking a swatch) confirms the pattern.
//   - Out-of-stock: never observed anywhere (color, size, or CTA) with
//     confirmed text; aria-disabled="true" is treated as out of stock
//     but that combination itself is UNCONFIRMED (every tile seen so far
//     was "false").
//   - Per-variant price: swaps are in-page, so `price` and `currencyCode`
//     on options are always null.
//   - Currency is hardcoded 'INR'.
//   - Not captured on purpose: delivery/pincode widget, "We Assure You"
//     banners, reviews list, FAQ/Product Details accordions (collapsed).
// ---------------------------------------------------------------------

export const SITE_ID = 'lenskart' as const

// CONFIRMED false via a live scrape: title, price, MRP, discount,
// rating, review count, brand, and every variant LABEL/selection/lowStock
// flag are present and correct in the plain static response. Only
// swatch IMAGES need a render tier — handled by a narrow post-parse
// retry in scrapeProduct() (parsers.ts), not by flipping this flag,
// which would pay the render-tier cost on every scrape for one field.
export const REQUIRES_RENDER_FOR_VARIANTS = false

export type LenskartVariantOption = {
  label: string
  price: string | null
  currencyCode: string | null
  image: string | null
  url: string | null
  selected: boolean
  outOfStock: boolean
  lowStock?: boolean
  // Secondary line: a size's mm range ("134mm to 137mm"), a Product Type
  // chip's descriptor ("With Power").
  subtitle?: string | null
  // True when `image` was built from the gallery's product id instead of
  // read off the tile — see (d). May 404 for UUID-named products.
  imageIsDerived?: boolean
  // Raw id captured off the tile's own `id` attribute (color/size tiles
  // only), e.g. "27481_27648". NOT a URL and NOT confirmed to map to one
  // — see the UNCONFIRMED note above. Used internally by
  // mergeLenskartSwatchImages to match a rendered-tier option back to
  // its static-parse counterpart.
  variantId?: string | null
}

export type LenskartVariantDimension = {
  dimension: string
  options: LenskartVariantOption[]
}

export type LenskartParsed = {
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
  variants?: LenskartVariantDimension[]
  discountPercentage?: number | null
  // The color/shape line under the title, e.g. "Dark Night Full Rim Square".
  styleDescription?: string | null
  // Small text beside the price, e.g. "with Free BLU lenses".
  priceNote?: string | null
  // Coupon banner text, e.g. "Use code SINGLE for this price", and the
  // code parsed out of it. Confirmed to sometimes come back null even
  // when earlier captures showed a banner — see (e).
  offerText?: string | null
  couponCode?: string | null
  _lenskartWarning?: string
  _lenskartUnavailable?: boolean
}

// ---------- small local helpers ----------

function extractPriceNumber(text: string | null | undefined): string | null {
  if (!text) return null
  const cleaned = text.replace(/,/g, '')
  const match = cleaned.match(/\d+(?:\.\d+)?/)
  return match ? match[0] : null
}

function normalizeUrl(src: string): string {
  return src.startsWith('//') ? `https:${src}` : src
}

// ---------- structural "which option is selected" helpers (see (a)) ----------

// An element's class list minus styled-components' stable `sc-…` component
// ids, leaving only the volatile per-style hash(es). Used ONLY to compare
// siblings against each other.
function styleSignature($el: { attr(name: string): string | undefined }): string {
  return ($el.attr('class') || '')
    .split(/\s+/)
    .filter((c) => c && !c.startsWith('sc-'))
    .join(' ')
}

// Index of the one option whose signature no other option shares — but
// only when there are 3+ options and EXACTLY one such option exists.
// Anything murkier (2 options, several unique states, all identical)
// returns -1: unknown beats a wrong guess.
function oddOneOutIndex(signatures: string[]): number {
  if (signatures.length < 3) return -1
  const counts = new Map<string, number>()
  for (const s of signatures) counts.set(s, (counts.get(s) ?? 0) + 1)
  const unique: number[] = []
  signatures.forEach((s, i) => {
    if (s && counts.get(s) === 1) unique.push(i)
  })
  return unique.length === 1 ? unique[0] : -1
}

// Index of the tile whose first label segment the style line starts with
// ("Jade Green" for "Jade Green Full Rim Square"). Longest match wins;
// a tie for longest is ambiguous -> -1.
function matchStyleDescription(firstSegments: string[], styleDescription: string): number {
  const desc = styleDescription.toLowerCase().trim()
  let bestLen = 0
  let best: number[] = []
  firstSegments.forEach((seg, i) => {
    const s = seg.toLowerCase().trim()
    if (!s) return
    if (desc === s || desc.startsWith(`${s} `)) {
      if (s.length > bestLen) {
        bestLen = s.length
        best = [i]
      } else if (s.length === bestLen) {
        best.push(i)
      }
    }
  })
  return best.length === 1 ? best[0] : -1
}

// Two independent signals when both exist; if they disagree, neither is
// trusted.
function resolveSelectedIndex(signatures: string[], nameIdx: number): number {
  const oddIdx = oddOneOutIndex(signatures)
  if (nameIdx >= 0 && oddIdx >= 0) return nameIdx === oddIdx ? nameIdx : -1
  return nameIdx >= 0 ? nameIdx : oddIdx
}

// ---------- structural stock-flag fallback (see (g)) ----------
//
// When every candidate's stock-flag text comes back blank, fall back to:
// is this option's flag-wrapper class a minority among its siblings? A
// clean 2-way split (e.g. 11 "unflagged" vs 4 "flagged") is treated as a
// real signal; anything murkier (fewer than 3 options, or every option
// sharing one class) returns all-false rather than guessing. Can't tell
// "few left" apart from "out of stock" this way — callers treat a
// structural-only hit as lowStock, not outOfStock (see rationale above).
function detectMinorityFlag(signatures: string[]): boolean[] {
  if (signatures.length < 3) return signatures.map(() => false)
  const counts = new Map<string, number>()
  for (const s of signatures) counts.set(s, (counts.get(s) ?? 0) + 1)
  if (counts.size < 2) return signatures.map(() => false)
  let majority = ''
  let majorityCount = -1
  for (const [s, n] of counts) {
    if (n > majorityCount) {
      majority = s
      majorityCount = n
    }
  }
  return signatures.map((s) => s !== majority)
}

// ---------- Title / style subtitle ----------

export function extractLenskartTitle($: CheerioAPI): string | null {
  return cleanText($('h1[data-cy="plpTitleTypography-XL"]').first()) || cleanText($('h1').first())
}

export function extractLenskartStyleDescription($: CheerioAPI): string | null {
  const $el = $('h2[data-cy="plpBodyTypography-S"]').first()
  if (!$el.length) return null
  const attr = $el.attr('title')
  if (attr && attr.trim()) return attr.trim()
  return cleanText($el)
}

// ---------- Brand ----------

export function extractLenskartBrand($: CheerioAPI, title: string | null = null): string | null {
  const links = $('#pdp-breadcrumbs a')
  if (links.length) return cleanText(links.last())

  // Confirmed fallback path only — breadcrumbs ARE present on the real
  // page (see (f)); this only fires when they genuinely aren't in the
  // fetched HTML for some reason. Titles like "Hustlr - Dark Night" are
  // "{brand} - {color}" — but the same product was also captured with
  // title "Lenskart Hustlr", no " - " at all, so this split legitimately
  // returns null often.
  if (title && title.includes(' - ')) {
    const head = title.split(' - ')[0].trim()
    if (head) return head
  }
  return null
}

// ---------- Price / MRP / discount / notes / offer ----------

const SUMMARY_SCOPE = '[data-cy="plpClarityProductSummarySection"]'

export function extractLenskartPriceRaw($: CheerioAPI): string | null {
  const raw = cleanText($(`${SUMMARY_SCOPE} span[data-cy="plpTitleTypography-L"]`).first())
  return extractPriceNumber(raw)
}

export function extractLenskartMrpRaw($: CheerioAPI): string | null {
  const raw = cleanText($(`${SUMMARY_SCOPE} del[data-cy="plpStrikethroughTypography-S"]`).first())
  return extractPriceNumber(raw)
}

export function extractLenskartDiscountPercentage($: CheerioAPI): number | null {
  let pct: number | null = null
  $(`${SUMMARY_SCOPE} span[data-cy="plpTitleTypography-S"]`).each((_, el) => {
    if (pct != null) return
    const text = cleanText($(el))
    if (!text) return
    const m = text.match(/\(?\s*(\d+(?:\.\d+)?)\s*%\s*off\s*\)?/i)
    if (m) pct = parseFloat(m[1])
  })
  return pct
}

// The <p> that sits right beside the price span ("with Free BLU lenses",
// "100% UV Protection").
export function extractLenskartPriceNote($: CheerioAPI): string | null {
  const $price = $(`${SUMMARY_SCOPE} span[data-cy="plpTitleTypography-L"]`).first()
  if (!$price.length) return null
  const $p = $price.parent().find('p[data-cy="plpBodyTypography-S"]').first()
  if (!$p.length) return null
  const text = ($p.attr('title') || cleanText($p) || '').trim()
  return text || null
}

// The coupon banner ("Use code SINGLE for this price"). Not inside the
// summary section, so it has its own data-cy root.
export function extractLenskartOffer($: CheerioAPI): { offerText: string | null; couponCode: string | null } {
  const $root = $('[data-cy="combo-offers-root"]').first()
  if (!$root.length) return { offerText: null, couponCode: null }

  const texts: string[] = []
  $root.find('[data-cy^="combo-offers-offer-container-"] p').each((_, el) => {
    const t = ($(el).attr('title') || cleanText($(el)) || '').trim()
    if (t && !texts.includes(t)) texts.push(t)
  })
  if (!texts.length) {
    const alt = ($root.find('img[data-cy="combo-offers-banner-image"]').attr('alt') || '').trim()
    if (alt) texts.push(alt)
  }

  const offerText = texts.length ? texts.join(' · ') : null
  const code = offerText ? offerText.match(/\bcode\s+([A-Za-z0-9]+)/i) : null
  return { offerText, couponCode: code ? code[1] : null }
}

// ---------- Rating / review count ----------

export function extractLenskartRating($: CheerioAPI): string | null {
  const primary = cleanText($('span[data-cy="plpHeadingTypography-M"]').first())
  const primaryNum = primary ? primary.match(/\d+(?:\.\d+)?/) : null
  if (primaryNum) return primaryNum[0]

  let fallback: string | null = null
  $('span[data-cy="plpTitleTypography-S"]').each((_, el) => {
    if (fallback != null) return
    const text = cleanText($(el))
    const m = text ? text.match(/^\d(?:\.\d)?$/) : null
    if (m) fallback = m[0]
  })
  return fallback
}

export function extractLenskartReviewCount($: CheerioAPI): string | null {
  let count: string | null = null
  $('[title]').each((_, el) => {
    if (count != null) return
    const title = $(el).attr('title')
    if (!title) return
    const m = title.match(/^(\d+)\s*reviews?$/i)
    if (m) count = m[1]
  })
  return count
}

// ---------- Images ----------

export function extractLenskartImages($: CheerioAPI): string[] {
  const urls = new Set<string>()

  const $gallery = $('[role="region"][aria-label*="Product image gallery"]').first()
  const $imgs = $gallery.length ? $gallery.find('img') : $('img')

  $imgs.each((_, el) => {
    const $img = $(el)
    const src = $img.attr('src')
    if (src && !src.startsWith('data:') && !src.startsWith('blob:')) {
      urls.add(normalizeUrl(src))
    }
  })

  return [...urls]
}

// ---------- Swatch image lookup ----------
//
// Tried in order, first hit wins. On a STATIC fetch this now always
// falls through to null for every Frame Color tile — confirmed via a
// live scrape (see (d)) — but is kept as-is because it's exactly what's
// re-run against RENDERED HTML by the retry in scrapeProduct(), where it
// does find real images (see mergeLenskartSwatchImages below).

const BUBBLE_DIR = 'product_color_bubble_images'
const BUBBLE_URL_SOURCE = `(?:https?:)?//[^"'\\s)<>\\\\]*${BUBBLE_DIR}/[^"'\\s)<>\\\\]+`
const BUBBLE_URL_RE = new RegExp(BUBBLE_URL_SOURCE, 'i')

function isRealUrl(v: string | undefined): v is string {
  if (!v) return false
  const t = v.trim()
  return !!t && !t.startsWith('data:') && !t.startsWith('blob:')
}

function firstUrlFromSrcset(srcset: string): string | null {
  const first = srcset.split(',')[0]?.trim().split(/\s+/)[0]
  return first || null
}

function extractSwatchImage($: CheerioAPI, $tile: ReturnType<CheerioAPI>): string | null {
  // 1. <img>: try EVERY candidate attribute, skipping data:/blob: placeholders.
  const $img = $tile.find('img').first()
  if ($img.length) {
    for (const attr of ['src', 'data-src', 'data-original', 'data-lazy-src']) {
      const v = $img.attr(attr)
      if (isRealUrl(v)) return normalizeUrl(v.trim())
    }
    for (const attr of ['srcset', 'data-srcset']) {
      const s = $img.attr(attr)
      const u = s ? firstUrlFromSrcset(s) : null
      if (isRealUrl(u ?? undefined)) return normalizeUrl(u!)
    }
  }

  // 2. <picture><source srcset>
  const sourceSrcset = $tile.find('source[srcset]').first().attr('srcset')
  const fromSource = sourceSrcset ? firstUrlFromSrcset(sourceSrcset) : null
  if (isRealUrl(fromSource ?? undefined)) return normalizeUrl(fromSource!)

  // 3. CSS background-image on the tile or any descendant.
  let bgUrl: string | null = null
  $tile.add($tile.find('*')).each((_, el) => {
    if (bgUrl) return
    const style = $(el).attr('style') || ''
    const m = style.match(/background-image\s*:\s*url\((['"]?)([^'")]+)\1\)/i)
    if (m && isRealUrl(m[2])) bgUrl = normalizeUrl(m[2])
  })
  if (bgUrl) return bgUrl

  // 4. Raw-markup scan for the bubble CDN path (<noscript> copy, data-*
  //    attribute, JSON-ish attribute value).
  const m = $.html($tile).replace(/&amp;/g, '&').match(BUBBLE_URL_RE)
  if (m) return normalizeUrl(m[0])

  return null
}

// ---------- Product id + derived bubble URL (single-color products only) ----------
//
// Gallery filenames end `_{productId}_{index}_{DD}_{MM}_{YYYY}.ext`, e.g.
// `..._209536_1_20_03_2025.png`. Older files carry a 4-digit
// `g_8599_16_08_2023.jpg` token that is NOT the id (5-8 digits required).
// Most frequent match wins.

const PRODUCT_ID_IN_IMAGE_RE = /_(\d{5,8})_\d{1,2}_\d{2}_\d{2}_\d{4}\.(?:png|jpe?g|webp)/i

export function extractLenskartProductId(images: string[]): string | null {
  const counts = new Map<string, number>()
  for (const url of images) {
    const m = url.match(PRODUCT_ID_IN_IMAGE_RE)
    if (m) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1)
  }
  let best: string | null = null
  let bestCount = 0
  for (const [id, n] of counts) {
    if (n > bestCount) {
      best = id
      bestCount = n
    }
  }
  return best
}

export function buildLenskartBubbleUrl(productId: string): string {
  return `https://ds-static.lenskart.com/${BUBBLE_DIR}/${productId}_bubble.png`
}

// ---------- Product Type chips ----------

export function extractLenskartProductTypeVariants($: CheerioAPI): LenskartVariantOption[] {
  const options: LenskartVariantOption[] = []

  const $header = $('h3')
    .filter((_, el) => /^product type$/i.test(cleanText($(el)) ?? ''))
    .first()
  if (!$header.length) return options

  // The chips live in the sibling wrapper right after the header's
  // padding-wrapper. Deliberately NOT a page-wide chip-container scan.
  const $chips = $header
    .closest('[data-cy="padding-wrapper"]')
    .nextAll()
    .first()
    .find('[data-cy="chip-container"]')

  const signatures: string[] = []
  $chips.each((_, el) => {
    const $chip = $(el)
    const label = cleanText($chip.find('[data-cy="plpTitleTypography-S"]').first())
    if (!label) return
    const $sub = $chip.find('p[data-cy="plpBodyTypography-XS"]').first()
    const subtitle = ($sub.attr('title') || cleanText($sub) || '').trim() || null

    signatures.push(styleSignature($chip))
    options.push({
      label,
      subtitle,
      price: null,
      currencyCode: null,
      image: null,
      url: null,
      selected: false,
      outOfStock: false,
    })
  })

  if (options.length === 1) options[0].selected = true
  else {
    const idx = oddOneOutIndex(signatures)
    if (idx >= 0) options[idx].selected = true
  }

  return options
}

// ---------- Frame Color variants ----------

// "Navy_Navy" -> "Navy"; "Black_Gold" -> "Black / Gold"; see (c).
function colorLabelFromAria(aria: string): string {
  const parts = aria
    .split('_')
    .map((p) => p.trim())
    .filter(Boolean)
  if (!parts.length) return 'Unknown'
  if (parts.every((p) => p.toLowerCase() === parts[0].toLowerCase())) return parts[0]
  return parts.join(' / ')
}

export function extractLenskartColorVariants(
  $: CheerioAPI,
  styleDescription: string | null = null,
): LenskartVariantOption[] {
  const options: LenskartVariantOption[] = []
  const signatures: string[] = []
  const firstSegments: string[] = []
  // Stock-flag inputs, collected per-tile then resolved after the loop —
  // see detectMinorityFlag() / (g).
  const rawStockTexts: string[] = []
  const labelSignatures: string[] = []

  $('div[role="group"][aria-label="Frame Color"] [data-cy^="color-option-"]').each((_, el) => {
    const $tile = $(el)
    const ariaLabel = $tile.attr('aria-label') || ''
    const label = colorLabelFromAria(ariaLabel)
    const variantId = $tile.attr('id')?.trim() || null

    const image = extractSwatchImage($, $tile)

    if (!image && process.env.DEBUG_SCRAPE) {
      console.log('[lenskart swatch miss]', label, '\n', $.html($tile).slice(0, 600))
    }

    // Text-based signal (may be blank pre-hydration — see (g)); the
    // flag-wrapper's OWN class (the tile's 2nd child, which wraps the
    // stock-flag span) is kept separately as the structural fallback.
    const $labelWrapper = $tile.children().eq(1)
    const stockText = cleanText($labelWrapper.find('[data-cy="plpTitleTypography-XS"]').first()) || ''
    rawStockTexts.push(stockText)
    labelSignatures.push(styleSignature($labelWrapper))

    const outOfStock = /out of stock|sold out|unavailable/i.test(stockText)

    signatures.push(styleSignature($tile.children().first()))
    firstSegments.push(ariaLabel.split('_')[0] ?? '')

    options.push({
      label,
      price: null,
      currencyCode: null,
      image,
      url: null, // swaps happen via in-page onclick, not navigation — see UNCONFIRMED note above
      variantId,
      selected: false,
      outOfStock,
    })
  })

  // Text told us nothing on ANY tile -> fall back to the structural
  // minority-class signal for the whole set. If even ONE tile had real
  // text, trust the text signals as-is rather than mixing sources.
  const anyTextPresent = rawStockTexts.some((t) => t.trim().length > 0)
  const structuralFlags = anyTextPresent ? labelSignatures.map(() => false) : detectMinorityFlag(labelSignatures)

  options.forEach((opt, i) => {
    if (opt.outOfStock) return // already the stronger state, don't downgrade
    const textLowStock = /few left|low stock|limited/i.test(rawStockTexts[i])
    if (textLowStock || structuralFlags[i]) opt.lowStock = true
  })

  if (options.length === 1) {
    options[0].selected = true
  } else if (options.length > 1) {
    const nameIdx = styleDescription ? matchStyleDescription(firstSegments, styleDescription) : -1
    const idx = resolveSelectedIndex(signatures, nameIdx)
    if (idx >= 0) options[idx].selected = true
  }

  return options
}

// Last-resort image for the ONE case where a product id maps
// unambiguously to a tile: exactly one color option with no image. See (d).
function fillSingleSwatchFromProductId(colors: LenskartVariantOption[], images: string[]): void {
  if (colors.length !== 1 || colors[0].image) return
  const pid = extractLenskartProductId(images)
  if (!pid) return
  colors[0].image = buildLenskartBubbleUrl(pid)
  colors[0].imageIsDerived = true
}

// ---------- Frame Size variants ----------

export function extractLenskartSizeVariants($: CheerioAPI): LenskartVariantOption[] {
  const options: LenskartVariantOption[] = []
  const $container = $('[data-cy="size-options-container"]').first()
  if (!$container.length) return options

  const signatures: string[] = []
  const rawStockTexts: string[] = []
  const labelSignatures: string[] = []

  $container.children().each((_, el) => {
    const $opt = $(el)

    // aria-label is "M, 134mm to 137mm". Read the label from there (or the
    // first child) — NOT the tile's whole text, which would swallow a
    // stock flag ("S Few Left").
    const aria = ($opt.attr('aria-label') || '').trim()
    const commaAt = aria.indexOf(',')
    const ariaLabel = commaAt === -1 ? aria : aria.slice(0, commaAt).trim()
    const subtitle = commaAt === -1 ? null : aria.slice(commaAt + 1).trim() || null
    const label = ariaLabel || cleanText($opt.children().first())
    if (!label) return

    const variantId = $opt.attr('id')?.trim() || null

    const $flagSpan = $opt.find('[data-cy="plpTitleTypography-XS"]').first()
    const stockText = cleanText($flagSpan) || ''
    rawStockTexts.push(stockText)
    // Sizes render the flag span directly (no extra wrapper div in any
    // capture seen so far), so the "label wrapper" signature here is the
    // span's own parent — same idea as colors, kept generic in case a
    // future capture nests it the same way.
    labelSignatures.push(styleSignature($flagSpan.parent()))

    const outOfStock = $opt.attr('aria-disabled') === 'true' || /out of stock|sold out|unavailable/i.test(stockText)

    signatures.push(styleSignature($opt.children().first()))
    options.push({
      label,
      subtitle,
      price: null,
      currencyCode: null,
      image: null,
      url: null,
      variantId,
      selected: false,
      outOfStock,
    })
  })

  const anyTextPresent = rawStockTexts.some((t) => t.trim().length > 0)
  const structuralFlags = anyTextPresent ? labelSignatures.map(() => false) : detectMinorityFlag(labelSignatures)

  options.forEach((opt, i) => {
    if (opt.outOfStock) return
    const textLowStock = /few left|low stock|limited/i.test(rawStockTexts[i])
    if (textLowStock || structuralFlags[i]) opt.lowStock = true
  })

  if (options.length === 1) options[0].selected = true
  else {
    const idx = oddOneOutIndex(signatures)
    if (idx >= 0) options[idx].selected = true
  }

  return options
}

export function extractLenskartAllVariants(
  $: CheerioAPI,
  images: string[] = [],
  styleDescription: string | null = null,
): LenskartVariantDimension[] {
  const dims: LenskartVariantDimension[] = []

  const types = extractLenskartProductTypeVariants($)
  if (types.length) dims.push({ dimension: 'Product Type', options: types })

  const colors = extractLenskartColorVariants($, styleDescription)
  fillSingleSwatchFromProductId(colors, images)
  if (colors.length) dims.push({ dimension: 'Frame Color', options: colors })

  const sizes = extractLenskartSizeVariants($)
  if (sizes.length) dims.push({ dimension: 'Frame Size', options: sizes })

  return dims
}

// ---------- Swatch-image enrichment (see parsers.ts's post-parse retry) ----------
//
// CONFIRMED via a live scrape (source: 'direct') AND an independent
// direct fetch of the same URL: the raw server-rendered HTML contains
// ZERO images for ANY Frame Color option — not just the 7 tiles already
// known to be genuine IOElement placeholders, but all 15, including the
// 8 that carried a real bubble <img src> in every DevTools capture of
// the hydrated page. Swatch images are entirely client-side: populated
// after JS runs, consistent with the IOElement / IntersectionObserver
// placeholders seen everywhere. A second static fetch (even from a
// different IP/fetcher) will never recover them — only a real headless
// render can.
//
// This does NOT mean REQUIRES_RENDER_FOR_VARIANTS should flip to true:
// labels, selection state, low-stock flags, sizes, and Product Type all
// came through correctly from the plain static fetch in that same live
// scrape. Only images need the render tier, so this is wired as a
// narrow, non-fatal ENRICHMENT step in scrapeProduct() (parsers.ts), not
// a change to the primary fetch path — if the retry fails or the
// render tier still can't produce images, the original result (still
// correct on everything except images) is returned as-is.

export function needsLenskartSwatchImageRetry(variants: LenskartVariantDimension[] | undefined): boolean {
  const colors = variants?.find((d) => d.dimension === 'Frame Color')?.options
  return !!colors && colors.length > 1 && colors.every((o) => !o.image)
}

// Fills `image` (and imageIsDerived) ONLY where the ORIGINAL option's
// image is null, matching by variantId first (the DOM tile id — more
// reliable than a label, since labels can repeat across colors that
// share a name segment), falling back to label. Never touches
// selected/outOfStock/lowStock/subtitle — those already came from the
// trusted primary (static) parse and shouldn't be overwritten by a
// second, less-trusted render pass. Returns whether anything was
// actually filled, so the caller can decide whether the retry was worth
// it (e.g. for logging).
export function mergeLenskartSwatchImages(
  original: LenskartVariantDimension[] | undefined,
  rendered: LenskartVariantOption[],
): boolean {
  const colors = original?.find((d) => d.dimension === 'Frame Color')?.options
  if (!colors || !rendered.length) return false

  const byVariantId = new Map(rendered.filter((r) => r.variantId).map((r) => [r.variantId, r]))
  const byLabel = new Map(rendered.map((r) => [r.label, r]))

  let filled = 0
  for (const opt of colors) {
    if (opt.image) continue
    const match = (opt.variantId && byVariantId.get(opt.variantId)) || byLabel.get(opt.label)
    if (match?.image) {
      opt.image = match.image
      if (match.imageIsDerived) opt.imageIsDerived = true
      filled++
    }
  }
  return filled > 0
}

// ---------- Availability ----------
//
// UNCONFIRMED against a real sold-out Lenskart PDP. NOTE the pincode
// "Check" button shares data-cy="Clarity-Box-Button" with the main CTA
// ("Select Lenses"), so ctaText holds both.

const OUT_OF_STOCK_PATTERNS = [/out\s*of\s*stock/i, /sold\s*out/i, /notify\s*me/i, /currently\s*unavailable/i]

const IN_STOCK_CTA_PATTERNS = [/select\s*lenses/i, /add\s*to\s*cart/i, /buy\s*now/i, /proceed/i]

export function extractLenskartAvailability($: CheerioAPI): { availability: string | null; unavailable: boolean } {
  let ctaText = ''
  $('[data-cy="Clarity-Box-Button"]').each((_, el) => {
    const t = cleanText($(el))
    if (t) ctaText += ` ${t}`
  })

  if (OUT_OF_STOCK_PATTERNS.some((re) => re.test(ctaText))) {
    return { availability: 'Out of stock', unavailable: true }
  }
  if (IN_STOCK_CTA_PATTERNS.some((re) => re.test(ctaText))) {
    return { availability: 'In stock', unavailable: false }
  }

  const bodyText = $('body').text()
  if (OUT_OF_STOCK_PATTERNS.some((re) => re.test(bodyText.slice(0, 20000)))) {
    return { availability: 'Out of stock', unavailable: true }
  }

  return { availability: null, unavailable: false }
}

// ---------- hydration check ----------
//
// For parsers.ts's STATIC_CONTENT_SUFFICIENT, IF this site is ever
// registered there. Not wired automatically — see REQUIRES_RENDER_FOR_VARIANTS
// and RENDER_FALLBACK_HOSTS's comment in parsers.ts for why Lenskart is
// deliberately NOT in that set despite needing a render tier for images.
export function hasHydratedLenskartMarkup(html: string): boolean {
  return html.includes('data-cy="plpTitleTypography-XL"') && html.includes('plpClarityProductSummarySection')
}

// ---------- DEBUG_SCRAPE diagnostics for the lazy-swatch question, see (d) ----------

function logSwatchDiagnostics($: CheerioAPI, colors: LenskartVariantOption[]): void {
  const docBubbleUrls = new Set($.html().match(new RegExp(BUBBLE_URL_SOURCE, 'gi')) ?? [])
  const placeholders = $('div[role="group"][aria-label="Frame Color"] #IOElement').length
  console.log(
    `[lenskart swatches] tiles=${colors.length} withImage=${colors.filter((c) => c.image).length} ` +
      `ioPlaceholders=${placeholders} bubbleUrlsAnywhereInDocument=${docBubbleUrls.size}`,
  )
}

// ---------- main parser ----------

export function parseLenskart($: CheerioAPI, _url: string): LenskartParsed {
  const title = extractLenskartTitle($)
  const price = extractLenskartPriceRaw($)
  const mrpRaw = extractLenskartMrpRaw($)
  const { availability, unavailable } = extractLenskartAvailability($)
  const images = extractLenskartImages($)
  const styleDescription = extractLenskartStyleDescription($)
  const variants = extractLenskartAllVariants($, images, styleDescription)
  const { offerText, couponCode } = extractLenskartOffer($)

  if (process.env.DEBUG_SCRAPE) {
    const colors = variants.find((d) => d.dimension === 'Frame Color')?.options ?? []
    if (colors.length) logSwatchDiagnostics($, colors)
  }

  // Don't report a fake discount: an MRP at or below the selling price
  // implies no real markdown.
  const mrp = mrpRaw != null && price != null && Number(mrpRaw) <= Number(price) ? null : mrpRaw

  const result: LenskartParsed = {
    title,
    brand: extractLenskartBrand($, title),
    price,
    mrp,
    currencyCode: 'INR',
    rating: extractLenskartRating($),
    review_count: extractLenskartReviewCount($),
    availability,
    seller: null, // first-party retail
    images,
    variants: variants.length ? variants : undefined,
    discountPercentage: extractLenskartDiscountPercentage($),
    styleDescription,
    priceNote: extractLenskartPriceNote($),
    offerText,
    couponCode,
  }

  if (unavailable) result._lenskartUnavailable = true

  if (!title && !price) {
    result._lenskartWarning =
      "Neither a title nor a price matched any known Lenskart selector — the page structure may have changed, this may not be an eyeglasses/sunglasses PDP (contact-lens templates are unconfirmed), or the request was blocked/captcha'd."
  } else if (!variants.length) {
    result._lenskartWarning =
      'No Frame Color or Frame Size widget was found — either this product genuinely has no variant axis (e.g. a contact-lens or accessory listing), or the widget uses a page structure not covered here.'
  }

  return result
}

// ---------- internal-metadata consumption ----------

export function consumeLenskartMeta(parsed: Record<string, any>): {
  warning: string | null
  unavailable: boolean
} {
  const warning = typeof parsed._lenskartWarning === 'string' ? parsed._lenskartWarning : null
  const unavailable = !!parsed._lenskartUnavailable

  delete parsed._lenskartWarning
  delete parsed._lenskartUnavailable

  return { warning, unavailable }
}