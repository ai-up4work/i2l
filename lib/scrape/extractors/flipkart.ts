// lib/scrape/extractors/flipkart.ts
//
// Flipkart-specific scraping logic, split out into its own module the same
// way amazon.ts is. Two tiers live in this file:
//
//   TIER 1 — Parse.bot (preferred, used whenever PARSE_API_KEY +
//            PARSE_FLIPKART_SCRAPER_ID are set): a hosted scraper API
//            returns structured JSON, so none of Flipkart's markup
//            matters. See the "PARSE.BOT TIER" section at the bottom.
//            Added because the DOM selectors below fail in production —
//            Flipkart's CSS-in-JS build (hashed/atomic classes, odometer
//            price widget, plain-<div> buy buttons) keeps changing under
//            them.
//   TIER 2 — DOM extractors (parseFlipkart and friends), unchanged. Still
//            the fallback when Parse isn't configured or fails.
//
// ---------- History of the DOM extractor (kept for context) ----------
//   REWRITE 1: old hash-class selectors (Nx9bqj, _30jeq3...) no longer
//     match. Current build is CSS-in-JS (`css-g5y9jx`, `r-xxxxxxx`); price
//     can render as an animated odometer (no parseable text); Add to
//     cart / Buy now are plain <div>s (root cause of a false-positive
//     "unavailable" bug); rating is "4.2" followed by a green star <svg>.
//   REWRITE 2: swatch tiles are the label row's NEXT SIBLING, not inside
//     the label's parent; labels read "Select Size" / "Selected Color:",
//     not bare "Size"; color swatches have alt="Image" so labels fall
//     back to the image filename.
//   REWRITE 3: some pages render price/MRP as plain text — MRP marked only
//     by inline `text-decoration-line: line-through`, price in a sibling
//     cell — read directly by extractFlipkartPriceBlock(); odometer pages
//     still fall back to parseHtml()'s JSON-LD/embedded-state/og chain.
//   REWRITE 4: per-swatch "Out Of Stock" overlay badge → `outOfStock` on
//     each variant option, separate from the page-level buybox check.
//   TYPE-FIX: use `Cheerio<Element>` with `Element` imported from
//     'domhandler' (not re-exported from 'cheerio' in this version).
import type { CheerioAPI, Cheerio } from 'cheerio'
import type { Element } from 'domhandler'
import { cleanText, detectCurrencyAndClean, domainCurrency } from '../shared'
import type { AmazonVariantDimension, AmazonVariantOption } from './amazon'

export type FlipkartVariantOption = AmazonVariantOption
export type FlipkartVariantDimension = AmazonVariantDimension

// ======================================================================
// TIER 2 — DOM extractors (fallback)
// ======================================================================

// ---------- Title ----------
//
// Old hash-class attempts kept as free first tries (cheap, harmless if
// absent) but the real fallback that works today is the bare `h1` — the
// page has exactly one, and it holds the full product title as plain
// text with no animation/hydration tricks involved.
export function extractFlipkartTitle($: CheerioAPI): string | null {
  const titleEl = $('span.VU-ZEz').length
    ? $('span.VU-ZEz')
    : $('span.B_NuCI').length
      ? $('span.B_NuCI')
      : $('h1').first()
  return cleanText(titleEl)
}

// ---------- Own-text helper ----------
//
// Cheerio's .text() includes descendant text, which is exactly what
// causes false matches (a big wrapper div "containing" the phrase you're
// looking for somewhere deep inside it, mixed with unrelated content).
// This pulls only the direct text-node children of an element, trimmed
// and whitespace-collapsed, so matches are against what a human would
// actually read as "this element's label" rather than "this element and
// everything inside it."
function ownText($el: Cheerio<Element>): string {
  return $el
    .contents()
    .filter((_, node) => node.type === 'text')
    .text()
    .replace(/\s+/g, ' ')
    .trim()
}

// ---------- Price / MRP (strikethrough-based) ----------
//
// Matches purely on the inline `text-decoration-line: line-through`
// style rather than any class name, since the hashed classes aren't
// stable across builds/pages. MRP text has no currency symbol on this
// build ("3,999"); price does ("₹755") — detectCurrencyAndClean (called
// by parseFlipkart below) normalizes both regardless.
const LINE_THROUGH_RE = /text-decoration-line:\s*line-through/i
const CURRENCY_TEXT_RE = /^[₹$]?\s?[\d,]+(?:\.\d+)?$/

// Scans all `div`/`span` descendants of a cell for a currency-shaped,
// non-strikethrough own-text — used to find the price cell among the
// MRP cell's row-siblings without assuming an exact nesting depth.
function findCurrencyText($scope: Cheerio<Element>, $: CheerioAPI, exclude: string): string | null {
  let found: string | null = null
  $scope.find('div, span').each((_, node) => {
    if (found) return
    const $node = $(node)
    const style = $node.attr('style') || ''
    if (LINE_THROUGH_RE.test(style)) return
    const text = ownText($node)
    if (text && text !== exclude && CURRENCY_TEXT_RE.test(text)) found = text
  })
  return found
}

export function extractFlipkartPriceBlock($: CheerioAPI): { price: string | null; mrp: string | null } {
  let mrp: string | null = null
  let price: string | null = null

  $('div, span').each((_, el) => {
    if (mrp) return false // first strikethrough numeric wins — top-of-page price block
    const $el = $(el)
    const style = $el.attr('style') || ''
    if (!LINE_THROUGH_RE.test(style)) return

    const text = ownText($el)
    if (!CURRENCY_TEXT_RE.test(text)) return

    mrp = text

    // Price lives in a sibling cell under the same row wrapper — go up
    // to this element's own cell, then to that cell's parent (the row),
    // and check every OTHER cell in that row for a non-strikethrough
    // currency-shaped text.
    const ownCell = $el.parent()
    const row = ownCell.parent()
    row.children().each((_, cell) => {
      if (price) return
      const $cell = $(cell)
      if ($cell.is(ownCell)) return
      const found = findCurrencyText($cell, $, text)
      if (found) price = found
    })
  })

  return { price, mrp }
}

// ---------- Rating / review count ----------
//
// Real markup: a `.css-146c3p1` div with text like "4.2", immediately
// followed by a sibling `<svg>` whose `<path>` uses the star-icon green
// fill (#008042ff). The review count is a nearby sibling matching
// `| 236`. Matching on (numeric text + adjacent green star svg) avoids
// every other `.css-146c3p1` div on the page (discount percentages,
// prices, badge labels, etc. don't have that svg immediately after
// them).
const RATING_STAR_FILL = /#008042/i
const RATING_TEXT_RE = /^\d(\.\d)?$/

export function extractFlipkartRating($: CheerioAPI): { rating: string | null; review_count: string | null } {
  let rating: string | null = null
  let review_count: string | null = null

  $('div, span').each((_, el) => {
    if (rating) return // first match wins — top-of-page rating pill
    const $el = $(el)
    const text = ownText($el)
    if (!RATING_TEXT_RE.test(text)) return

    const $next = $el.next()
    if (!$next.is('svg')) return
    const fill = $next.find('path').attr('fill') || ''
    if (!RATING_STAR_FILL.test(fill)) return

    rating = text

    // Review count is typically a sibling further along, e.g. "| 236".
    const container = $el.parent()
    const containerText = cleanText(container)
    if (containerText) {
      const countMatch = containerText.match(/\|\s*([\d,]+)/)
      if (countMatch) review_count = countMatch[1]
    }
  })

  return { rating, review_count }
}

// ---------- Availability (page-level buybox/CTA) ----------
//
// Two independent, own-text-scoped signals, both required before calling
// a listing unavailable:
//   1. An element whose OWN text is exactly a sold-out/unavailable
//      phrase (not a substring of a longer sentence — reviews and
//      filter labels shouldn't trip this).
//   2. NO element anywhere on the page has own-text matching an
//      add-to-cart/buy-now/buy-at style CTA. This checks ALL elements by
//      own text, not just <button>/<a> — Flipkart's current buy button
//      is a plain styled <div>.
// Requiring both closes the false-positive where a sibling variant
// swatch showing "Out of stock" tripped the whole listing.
//
// NOTE: deliberately page-level only — it tells you whether the
// CURRENTLY SELECTED variant can be bought. Per-swatch stock is handled
// by isTileOutOfStock() below.
const SOLD_OUT_RE = /^(sold out|out of stock|currently unavailable)$/i
const BUY_CTA_RE = /^(add to cart|buy now|buy at\s*[₹$]?[\d,.]*)$/i

export function isFlipkartUnavailable($: CheerioAPI): boolean {
  let soldOutText = false
  let hasBuyButton = false

  $('div, span, button, a').each((_, el) => {
    if (soldOutText && hasBuyButton) return false // short-circuit
    const text = ownText($(el))
    if (!text) return
    if (!soldOutText && SOLD_OUT_RE.test(text)) soldOutText = true
    if (!hasBuyButton && BUY_CTA_RE.test(text)) hasBuyButton = true
  })

  return soldOutText && !hasBuyButton
}

// ---------- Per-tile out-of-stock flag ----------
//
// Real markup overlays an "Out Of Stock" text badge directly on the
// swatch tile's image for that specific option. A tile otherwise renders
// no readable text at all, so any tile whose full text matches this is
// unambiguously the overlay badge. Kept narrow to the phrasing seen on
// captured pages — widen if a page shows e.g. "Sold Out" on a tile.
const TILE_OUT_OF_STOCK_RE = /out\s*of\s*stock/i

function isTileOutOfStock($tile: Cheerio<Element>): boolean {
  const text = cleanText($tile)
  return !!text && TILE_OUT_OF_STOCK_RE.test(text)
}

// ---------- Selected-variant summary (Size/Color as currently shown) ----------
//
// Real Flipkart markup, confirmed against two captured pages:
//   - Color: the row literally states "Selected Color: Purple" as plain
//     text — read the value straight out of the label row's own text.
//   - Size: only a bare "Select Size" heading exists, so the selected
//     tile is spotted by its swatch border being the dark "selected"
//     color (rgb(31, 31, 31)) vs the default light gray.
//   - In both cases the swatch tiles live in the label row's NEXT
//     SIBLING — not inside the same element as the label.
const DIMENSION_LABEL_RE = /^(?:select(?:ed)?\s+)?(?:size|colou?r|style)s?\s*:?\s*$/i
const SELECTED_SWATCH_BORDER_RE = /rgb\(\s*31\s*,\s*31\s*,\s*31\s*\)/i

function normalizeDimensionLabel(rawLabel: string): string | null {
  const m = rawLabel.match(/(size|colou?r|style)/i)
  if (!m) return null
  const word = m[1].toLowerCase()
  return word === 'colour' ? 'Color' : word[0].toUpperCase() + word.slice(1)
}

// Flipkart gives every swatch <img> a generic alt="Image" with no other
// human-readable text nearby (especially color swatches). Falling back to
// cleanText()/alt alone collapses every tile in a color row to "Image",
// which breaks dedup/keying in the UI. As a last resort, derive a stable
// label from the image filename so tiles are at least uniquely
// identifiable.
function deriveTileLabel($tile: Cheerio<Element>): string | null {
  const text = cleanText($tile)
  if (text) return text

  const alt = $tile.find('img').attr('alt')
  if (alt && !/^image$/i.test(alt.trim())) return alt.trim()

  const src = $tile.find('img').attr('src') || $tile.find('img').attr('data-src')
  if (src) {
    const filename = src.split('/').pop()?.split('?')[0]?.split('.')[0]
    if (filename) return filename
  }

  return null
}

function isSelectedTile($tile: Cheerio<Element>): boolean {
  const cls = $tile.attr('class') || ''
  const style = $tile.attr('style') || ''
  const state = $tile.attr('aria-checked') || $tile.attr('aria-selected')
  return (
    state === 'true' ||
    /selected|active|checked/i.test(cls) ||
    SELECTED_SWATCH_BORDER_RE.test(style)
  )
}

export function extractFlipkartOptions($: CheerioAPI): Record<string, string> | null {
  const options: Record<string, string> = {}

  $('div, li, p, span').each((_, el) => {
    const $el = $(el)
    const label = cleanText($el)
    if (!label || !DIMENSION_LABEL_RE.test(label)) return
    const dimension = normalizeDimensionLabel(label)
    if (!dimension || options[dimension]) return

    // "Selected Color: Purple" states the value directly in the same
    // row's text — strip the label prefix and use what's left.
    if (/^selected\s+/i.test(label)) {
      const rowText = cleanText($el.parent()) || ''
      const value = rowText
        .replace(/^selected\s+(?:size|colou?r|style)s?\s*:?\s*/i, '')
        .trim()
      if (value) {
        options[dimension] = value
        return
      }
      // Fall through to swatch-based detection if the row had no
      // trailing value for some reason.
    }

    // "Select Size" (or any case without a stated value): swatches are
    // the label row's NEXT sibling, not a descendant of the label
    // itself or of the label's immediate parent.
    const swatchContainer = $el.parent().next()
    const candidates = swatchContainer.find('a, button, li, div[role="button"]')
    if (!candidates.length) return

    const selected = candidates.filter((_, opt) => isSelectedTile($(opt)))
    const value = deriveTileLabel(selected.first())
    if (value) options[dimension] = value
  })

  return Object.keys(options).length ? options : null
}

function resolveFlipkartUrl(href: string | undefined | null, pageUrl: string): string | null {
  if (!href) return null
  try {
    return new URL(href, pageUrl).toString()
  } catch {
    return null
  }
}

// ---------- All variants (full swatch/size picker) ----------
//
// Same swatch-container fix as extractFlipkartOptions() above: tiles are
// the label row's next sibling, found via `.parent().next()`.
// Price-per-tile extraction (`[class*="price" i]`) is a soft attempt and
// may come back null per tile on this build; the picker renders tiles
// without a price when none is found. Each tile is also checked for the
// per-tile "Out Of Stock" overlay badge — independent of
// isFlipkartUnavailable(), which only covers the selected variant.
export function extractFlipkartAllVariants($: CheerioAPI, pageUrl: string): FlipkartVariantDimension[] {
  const domainHint = domainCurrency(pageUrl)
  const dimensions: FlipkartVariantDimension[] = []
  const seenDimensions = new Set<string>()

  $('div, li, p, span').each((_, el) => {
    const $el = $(el)
    const label = cleanText($el)
    if (!label || !DIMENSION_LABEL_RE.test(label)) return
    const dimension = normalizeDimensionLabel(label)
    if (!dimension || seenDimensions.has(dimension)) return

    const swatchContainer = $el.parent().next()
    const $tiles = swatchContainer.find('a, button, li, div[role="button"]')
    if (!$tiles.length) return

    const options: FlipkartVariantOption[] = []
    $tiles.each((_, tileEl) => {
      const $tile = $(tileEl)
      const tileLabel = deriveTileLabel($tile)
      if (!tileLabel) return

      const priceRaw = cleanText($tile.find('[class*="price" i]').first())
      const { amount, code } = priceRaw ? detectCurrencyAndClean(priceRaw, domainHint) : { amount: null, code: null }

      const image = $tile.find('img').attr('src') || $tile.find('img').attr('data-src') || null
      const href = $tile.attr('href') || $tile.find('a').attr('href') || null

      options.push({
        label: tileLabel,
        price: amount,
        currencyCode: code,
        image,
        url: resolveFlipkartUrl(href, pageUrl),
        selected: isSelectedTile($tile),
        outOfStock: isTileOutOfStock($tile),
      })
    })

    if (options.length) {
      dimensions.push({ dimension, options })
      seenDimensions.add(dimension)
    }
  })

  return dimensions
}

// ---------- Composed DOM parser ----------

export function parseFlipkart($: CheerioAPI, url: string) {
  const domainHint = domainCurrency(url)

  // Try the direct DOM strikethrough-price block FIRST — cheap, and
  // correct whenever the page renders price as plain text. Falls through
  // to null/null on pages that still use the animated odometer widget, in
  // which case parseHtml()'s JSON-LD/embedded-state/og:meta fallback
  // chain (in parsers.ts) covers it.
  const { price: rawPrice, mrp: rawMrp } = extractFlipkartPriceBlock($)
  const { amount: price, code: priceCurrency } = detectCurrencyAndClean(rawPrice, domainHint)
  const { amount: mrp } = detectCurrencyAndClean(rawMrp, domainHint)

  const { rating, review_count } = extractFlipkartRating($)

  const images = new Set<string>()
  $('img.DByuf4, img._396cs4, img.q6DClP').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src')
    if (src) images.add(src)
  })
  $('img[data-src]').each((_, el) => {
    const src = $(el).attr('data-src')
    if (src && src.includes('rukminim')) images.add(src)
  })
  // Full-res product photos also come via <picture>/<source srcset>
  // without a data-src on the <img> itself — pick up the largest srcset
  // entry from rukminim <source> tags too.
  $('source[srcset]').each((_, el) => {
    const srcset = $(el).attr('srcset') || ''
    const first = srcset.split(',')[0]?.trim().split(' ')[0]
    if (first && first.includes('rukminim')) images.add(first)
  })

  const result: Record<string, any> = {
    title: extractFlipkartTitle($),
    price,
    mrp,
    currencyCode: priceCurrency,
    rating,
    review_count,
    availability: 'In Stock (assumed)',
    seller: null,
    images: [...images],
  }

  if (isFlipkartUnavailable($)) {
    result.availability = 'Unavailable'
    result._flipkartUnavailable = true
    result._flipkartWarning =
      'No add-to-cart/buy-now text found alongside sold-out/unavailable text — treating this as a genuinely unsellable listing rather than a scrape failure.'
  }

  const options = extractFlipkartOptions($)
  if (options) result.options = options

  const variants = extractFlipkartAllVariants($, url)
  if (variants.length) result.variants = variants

  return result
}

// ======================================================================
// TIER 1 — PARSE.BOT TIER (preferred when configured)
// ======================================================================
//
// Same shape as Ajio's Parse.bot tier (ajioParseBotConfigured /
// fetchAjioViaParseBot / mapParseBotProductTo*), so parsers.ts wires it
// the same way:
//   flipkartParseBotConfigured()          → env check
//   fetchFlipkartViaParseBot(url)         → { data, error }, never throws
//   mapParseBotProductToFlipkart(data)    → same result shape as parseFlipkart()
//
// SERVER-ONLY (API key). Env vars:
//   PARSE_API_KEY                pmx_...   (shared with Ajio)
//   PARSE_FLIPKART_SCRAPER_ID    scraper_id of the Flipkart API built in the Parse dashboard
//   PARSE_FLIPKART_ENDPOINT      endpoint name              (default: get_product)
//   PARSE_FLIPKART_URL_PARAM     name of the URL body param (default: url)
//
//   POST https://api.parse.bot/scraper/{scraper_id}/{endpoint}
//   headers: X-API-Key, Content-Type: application/json
//   body:    { "<url param>": "<flipkart product url>" }
//
// Response shape mapped below (confirmed from a real call):
//   { status: "success", data: {
//       product_id, listing_id, title, brand, category_path: string[],
//       price: { final_price, mrp, discount_percent, bank_offer_price, is_special_price },
//       availability: { in_stock, status, cod_available, return_policy },
//       rating: { average, total_ratings, total_reviews, breakdown },
//       seller: { name, rating },
//       images: string[], videos: [{ video_url, thumbnail_url }],
//       highlights: string[]  ("Key: Value"), description, specifications: [] } }
//
// `variants` (Color/Size rows) is NOT in that response yet. If the endpoint
// is revised to return it (see PARSE_VARIANTS_REVISION_PROMPT) it's mapped
// too; until then products with swatches come back without a picker.

const PARSE_BASE = 'https://api.parse.bot'
const PARSE_TIMEOUT_MS = 30_000
const PARSE_CACHE_TTL_MS = 10 * 60_000 // every call costs credits; don't re-pay for the same URL within 10 min

/** Paste into Parse's "revise" box to add per-swatch variants to the existing endpoint. */
export const PARSE_VARIANTS_REVISION_PROMPT = `
Add a "variants" field to the Flipkart product response: one entry per option row on the page (Color, Size, Style...).
"variants": [
  { "dimension": "Color",
    "options": [
      { "label": "Purple", "price": 755, "image": "https://...", "url": "https://www.flipkart.com/...",
        "selected": true, "out_of_stock": false }
    ] }
]
"url" must be the product URL that selects that option, "selected" marks the currently chosen one, and
"out_of_stock" is per option (separate from availability.in_stock). Return [] when the product has no options.
`.trim()

export function flipkartParseBotConfigured(): boolean {
  return Boolean(process.env.PARSE_API_KEY && process.env.PARSE_FLIPKART_SCRAPER_ID)
}

// ---------- coercion helpers ----------

type ParseRaw = Record<string, unknown>

const isObj = (v: unknown): v is ParseRaw => !!v && typeof v === 'object' && !Array.isArray(v)

const pick = (o: ParseRaw | null | undefined, ...keys: string[]): unknown => {
  if (!o) return undefined
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]
  return undefined
}

function toNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  const n = Number(v.replace(/[^0-9.\-]/g, ''))
  return v.trim() && Number.isFinite(n) ? n : null
}

// ScrapeResult carries prices as strings ("755"), same as every other site.
function toNumStr(v: unknown): string | null {
  const n = toNum(v)
  return n == null ? null : String(n)
}

function toStr(v: unknown): string | null {
  if (v == null || typeof v === 'object') return null
  const s = String(v).trim()
  return s || null
}

function toBool(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (['true', 'yes', '1', 'in stock', 'in_stock', 'available'].includes(s)) return true
    if (['false', 'no', '0', 'out of stock', 'out_of_stock', 'sold out', 'unavailable'].includes(s)) return false
  }
  return undefined
}

// ---------- mapping ----------

function mapParseSpecs(highlights: unknown, specifications: unknown): { name: string; value: string }[] {
  const out: { name: string; value: string }[] = []
  const seen = new Set<string>()
  const push = (name: string | null, value: string | null) => {
    if (!name || !value) return
    const key = `${name}::${value}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ name, value })
  }

  // highlights: ["Display Type: Analog", "Diameter: 50 mm"]
  if (Array.isArray(highlights)) {
    for (const h of highlights) {
      const s = toStr(h)
      if (!s) continue
      const i = s.indexOf(':')
      if (i > 0) push(s.slice(0, i).trim(), s.slice(i + 1).trim())
    }
  }

  // specifications: [{name,value}] or grouped [{title, items:[{name,value}]}]
  const walk = (list: unknown) => {
    if (!Array.isArray(list)) return
    for (const s of list) {
      if (!isObj(s)) continue
      const name = toStr(pick(s, 'name', 'key', 'label'))
      const value = toStr(pick(s, 'value', 'val'))
      if (name && value) push(name, value)
      else walk(pick(s, 'items', 'specs', 'specifications', 'values'))
    }
  }
  walk(specifications)
  return out
}

function mapParseVariants(raw: unknown, currencyCode: string): FlipkartVariantDimension[] {
  if (!Array.isArray(raw)) return []
  const out: FlipkartVariantDimension[] = []

  for (const d of raw) {
    if (!isObj(d)) continue
    const dimension = toStr(pick(d, 'dimension', 'name', 'type'))
    const rawOptions = pick(d, 'options', 'values')
    if (!dimension || !Array.isArray(rawOptions)) continue

    const options: FlipkartVariantOption[] = []
    for (const o of rawOptions) {
      const opt: ParseRaw = isObj(o) ? o : { label: o }
      const label = toStr(pick(opt, 'label', 'name', 'value'))
      if (!label) continue
      options.push({
        label,
        price: toNumStr(opt.price),
        currencyCode,
        image: toStr(pick(opt, 'image', 'image_url', 'img')),
        url: toStr(pick(opt, 'url', 'link', 'href')),
        selected: toBool(opt.selected) ?? false,
        outOfStock: toBool(pick(opt, 'out_of_stock', 'outOfStock', 'sold_out')) ?? false,
      } as FlipkartVariantOption)
    }
    if (options.length) out.push({ dimension, options })
  }
  return out
}

/** Same result shape as parseFlipkart() (plus a few richer fields). */
export function mapParseBotProductToFlipkart(payload: Record<string, unknown>): Record<string, any> {
  const r: ParseRaw = isObj(payload.data) ? payload.data : isObj(payload.result) ? payload.result : payload

  const priceObj = isObj(r.price) ? r.price : null
  const availObj = isObj(r.availability) ? r.availability : null
  const ratingObj = isObj(r.rating) ? r.rating : null
  const sellerObj = isObj(r.seller) ? r.seller : null

  // Flipkart prices are always INR; the feed carries no currency field.
  const currencyCode = toStr(pick(r, 'currency', 'currency_code')) ?? 'INR'

  const price = toNumStr(priceObj ? pick(priceObj, 'final_price', 'selling_price', 'price') : pick(r, 'price', 'selling_price'))
  const mrp = toNumStr(priceObj ? pick(priceObj, 'mrp', 'original_price') : pick(r, 'mrp', 'original_price'))

  const images = Array.isArray(r.images)
    ? r.images.map((x) => toStr(x)).filter((x): x is string => !!x)
    : []

  const variants = mapParseVariants(r.variants, currencyCode)
  const options: Record<string, string> = {}
  for (const d of variants) {
    const sel = d.options.find((o) => o.selected)
    if (sel) options[d.dimension] = sel.label
  }

  const inStock = toBool(availObj ? pick(availObj, 'in_stock', 'inStock') : pick(r, 'in_stock', 'inStock'))
  const statusText = toStr(availObj ? availObj.status : r.availability)

  const categoryPath = Array.isArray(r.category_path)
    ? r.category_path.map((x) => toStr(x)).filter(Boolean).join(' > ')
    : toStr(r.category_path)

  const itemSpecifics = mapParseSpecs(r.highlights, r.specifications)

  const result: Record<string, any> = {
    title: toStr(r.title ?? r.name),
    price,
    mrp,
    currencyCode,
    rating: toStr(ratingObj ? pick(ratingObj, 'average', 'value') : r.rating),
    // Flipkart's "| 306" next to the stars is the ratings count, same as the DOM parser reads.
    review_count: toStr(ratingObj ? pick(ratingObj, 'total_ratings', 'total_reviews') : pick(r, 'review_count')),
    availability: inStock === undefined ? statusText ?? 'In Stock (assumed)' : inStock ? 'In Stock' : 'Unavailable',
    seller: toStr(sellerObj ? sellerObj.name : r.seller),
    images,
    brand: toStr(r.brand),
    description: toStr(r.description),
    categoryPath: categoryPath || null,
    itemSpecifics: itemSpecifics.length ? itemSpecifics : null,
    discountPercentage: toNum(priceObj ? priceObj.discount_percent : r.discount_percent),
    // Extras not declared on ScrapeResult (carried through like eBay's extras).
    productId: toStr(r.product_id),
    bankOfferPrice: toNumStr(priceObj ? priceObj.bank_offer_price : undefined),
    codAvailable: availObj ? toBool(availObj.cod_available) ?? null : null,
  }

  if (inStock === false) {
    result._flipkartUnavailable = true
    result._flipkartWarning = 'Parse reported this listing as not buyable (availability.in_stock = false).'
  }
  if (Object.keys(options).length) result.options = options
  if (variants.length) result.variants = variants
  return result
}

// ---------- call ----------

const parseCache = new Map<string, { at: number; payload: ParseRaw }>()

/**
 * Calls the Flipkart endpoint on Parse. Never throws — returns
 * { data: null, error } on any failure so the caller can fall back to the
 * DOM pipeline (same contract as fetchAjioViaParseBot).
 */
export async function fetchFlipkartViaParseBot(
  url: string,
  opts: { signal?: AbortSignal } = {}
): Promise<{ data: Record<string, unknown> | null; error: string | null }> {
  const key = process.env.PARSE_API_KEY
  const scraperId = process.env.PARSE_FLIPKART_SCRAPER_ID
  const endpoint = process.env.PARSE_FLIPKART_ENDPOINT || 'get_product'
  const urlParam = process.env.PARSE_FLIPKART_URL_PARAM || 'url'
  if (!key || !scraperId) {
    return { data: null, error: 'Parse is not configured (PARSE_API_KEY / PARSE_FLIPKART_SCRAPER_ID).' }
  }

  const hit = parseCache.get(url)
  if (hit && Date.now() - hit.at < PARSE_CACHE_TTL_MS) return { data: structuredClone(hit.payload), error: null }

  try {
    const timeout = AbortSignal.timeout(PARSE_TIMEOUT_MS)
    const res = await fetch(`${PARSE_BASE}/scraper/${encodeURIComponent(scraperId)}/${encodeURIComponent(endpoint)}`, {
      method: 'POST',
      headers: { 'X-API-Key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ [urlParam]: url }),
      signal: opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout,
      cache: 'no-store',
    })

    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 200)
      return { data: null, error: `Parse returned ${res.status}${detail ? `: ${detail}` : ''}` }
    }

    const payload = (await res.json()) as ParseRaw
    if (typeof payload.status === 'string' && payload.status !== 'success') {
      return {
        data: null,
        error: `Parse returned status "${payload.status}"${payload.error ? `: ${String(payload.error).slice(0, 200)}` : ''}`,
      }
    }
    if (!isObj(payload.data ?? payload.result) || !toStr((payload.data as ParseRaw | undefined)?.title ?? (payload.result as ParseRaw | undefined)?.title)) {
      return { data: null, error: 'Parse response had no product title — endpoint output does not match the expected shape.' }
    }

    parseCache.set(url, { at: Date.now(), payload })
    return { data: structuredClone(payload), error: null }
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Parse request failed' }
  }
}