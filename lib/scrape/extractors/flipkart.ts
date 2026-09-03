// lib/scrape/extractors/flipkart.ts
//
// Flipkart-specific scraping logic, split out into its own module the same
// way amazon.ts is.
//
// REWRITE NOTE (see conversation): the previous version's selectors
// (Nx9bqj/CxhGGd, _30jeq3/_16Jk6d, etc.) target a hash-class build of
// Flipkart that no longer matches what the site actually serves. A real
// captured page showed the current build uses a CSS-in-JS engine
// (`css-g5y9jx`, `r-xxxxxxx` atomic classes) where:
//   - The visible price is NOT parseable text. It's rendered as a
//     character-column "odometer" widget (each digit in its own
//     absolutely-positioned div, mid-animation). There is no DOM text
//     node that just says "₹655" — so price/MRP extraction has been
//     REMOVED from this file entirely. parseHtml() in parsers.ts already
//     falls back to JSON-LD / embedded client-state / og:meta for any
//     site, so Flipkart price now comes from there.
//   - "Add to cart" / "Buy now" are plain `<div>` text, not <button>/<a>.
//     The old exact-tag-and-text-match check could never see them, which
//     was the root cause of the false-positive "unavailable" bug: a
//     sold-out sibling *variant swatch* elsewhere on the page (styled as
//     "Out of stock" text) got picked up by a whole-body text fallback,
//     while the real buy button was invisible to the button check.
//   - Rating is plain text ("4.2") immediately followed by a small green
//     star <svg> (fill #008042ff); review count is a sibling "| 236".
//
// SECOND REWRITE NOTE (options/variants extraction): the first pass at
// extractFlipkartOptions()/extractFlipkartAllVariants() below assumed the
// swatch tiles live INSIDE the same container as the "Selected Color:" /
// "Select Size" label text (`$(el).parent()`). Two real captured pages
// (a saree PDP with a size-less color swatch row, and a kurta-set PDP
// with both a "Selected Color: Purple" row and a "Select Size" row)
// showed this is wrong on both counts:
//   1. The label div and the swatch-tile div are SIBLINGS under a shared
//      wrapper, not parent/child — `$(el).parent()` lands on the row
//      that contains ONLY the label text, which has zero tiles in it.
//      The tiles are in that row's *next sibling*.
//   2. The old label regex required the cleaned text to be EXACTLY
//      "Size" / "Color" / "Style". Real Flipkart renders "Select Size"
//      and "Selected Color:" — neither ever matched, so the dimension
//      loop never fired at all on a real page, independent of bug #1.
// Both are fixed below. Color tiles also turned out to have no visible
// text or useful alt text (every swatch <img> uses alt="Image"), so
// deriveTileLabel() falls back to a slug derived from the image filename
// rather than leaving every color option's label collapsed to the
// literal string "Image".
//
// THIRD REWRITE NOTE (price/MRP — this is what was making `mrp` come
// back null on every Flipkart result): a real captured discount-price
// row shows that price/MRP are NOT always the animated "odometer" from
// the first rewrite note above. On (at least) this page's discount row,
// three sibling `css-g5y9jx` cells sit under one shared row wrapper:
//   1. a green discount-percent badge (down-arrow svg + "81%" text,
//      svg path using `stroke="#008042ff"` — note this is `stroke`, not
//      `fill`, so it doesn't collide with the rating star's `fill`
//      check above),
//   2. the MRP as plain, un-animated text ("3,999" — no ₹ symbol),
//      marked ONLY by an inline `text-decoration-line: line-through`
//      style — there's no stable class name to key off here since the
//      hashed classes (`v1zwn21o` etc.) aren't safe to rely on,
//   3. the selling price as plain text ("₹755"), a sibling cell with no
//      strikethrough.
// This is real, readable DOM text — not the odometer digit-widget the
// first rewrite note describes — so extractFlipkartPriceBlock() below
// reads it directly when present. It's tried FIRST in parseFlipkart();
// if a given page's build still uses the odometer instead (this
// function finds no strikethrough element and returns nulls), price/mrp
// stay null here exactly as before and parseHtml()'s existing
// JSON-LD/embedded-state/og:meta fallback chain in parsers.ts still
// covers it, unchanged.
//
// FOURTH REWRITE NOTE (per-tile "Out Of Stock" — see conversation): a
// real captured saree PDP shows an individual color swatch can be
// unavailable while the rest of the listing (and other swatches) are
// perfectly buyable. Flipkart renders this as an "Out Of Stock" text
// badge overlaid directly on THAT swatch tile's <picture>/<img>. This is
// completely separate from isFlipkartUnavailable() below, which only
// looks at the page-level buybox/CTA for the *currently selected*
// variant — it says nothing about sibling swatches. Previously,
// extractFlipkartAllVariants() had no way to represent "this specific
// tile is dead," so a reviewer (and the UI) had no signal that a given
// swatch shouldn't be clickable. isTileOutOfStock() below reads the same
// tile the loop already visits and flags it via the new `outOfStock`
// field on FlipkartVariantOption (see AmazonVariantOption in amazon.ts,
// which this type aliases) — the picker UI is responsible for actually
// disabling the button.
import type { CheerioAPI, Cheerio } from 'cheerio'
import { cleanText, detectCurrencyAndClean, domainCurrency } from '../shared'
import type { AmazonVariantDimension, AmazonVariantOption } from './amazon'

export type FlipkartVariantOption = AmazonVariantOption
export type FlipkartVariantDimension = AmazonVariantDimension

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
function ownText($el: cheerio.Cheerio): string {
  return $el
    .contents()
    .filter((_, node) => node.type === 'text')
    .text()
    .replace(/\s+/g, ' ')
    .trim()
}

// ---------- Price / MRP (strikethrough-based, see THIRD REWRITE NOTE) ----------
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
function findCurrencyText($scope: cheerio.Cheerio, $: CheerioAPI, exclude: string): string | null {
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
//      add-to-cart/buy-now/buy-at style CTA. Unlike the old version,
//      this checks ALL elements by own text, not just <button>/<a> —
//      Flipkart's current buy button is a plain styled <div>.
// Requiring both closes the false-positive this bug produced: a sibling
// variant swatch showing "Out of stock" no longer matters once the real
// buy button is correctly detected as present.
//
// NOTE: this is deliberately page-level only — it tells you whether the
// CURRENTLY SELECTED variant can be bought. It says nothing about
// whether an individual, non-selected swatch tile is itself sold out;
// that's handled per-tile by isTileOutOfStock() below.
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

// ---------- Per-tile out-of-stock flag (see FOURTH REWRITE NOTE) ----------
//
// Real markup overlays an "Out Of Stock" text badge directly on the
// swatch tile's image for that specific option. A tile otherwise renders
// no readable text at all (the <img> only carries a generic alt="Image",
// which cleanText() does pick up as element text via alt-text fallback
// in some Cheerio setups, but never matches this phrase), so any tile
// whose full text matches this is unambiguously the overlay badge, not
// unrelated copy. Kept intentionally narrow to the exact phrasing seen
// on captured pages — widen if a page shows different wording (e.g.
// "Sold Out") on a swatch tile.
const TILE_OUT_OF_STOCK_RE = /out\s*of\s*stock/i

function isTileOutOfStock($tile: cheerio.Cheerio): boolean {
  const text = cleanText($tile)
  return !!text && TILE_OUT_OF_STOCK_RE.test(text)
}

// ---------- Selected-variant summary (Size/Color as currently shown) ----------
//
// Real Flipkart markup, confirmed against two captured pages:
//   - Color: the row literally states "Selected Color: Purple" as plain
//     text — when the label starts with "Selected", read the value
//     straight out of the label row's own text instead of hunting for a
//     "selected" swatch tile.
//   - Size: only a bare "Select Size" heading exists on the page (no
//     "Selected Size: X" sentence), so for that case we still need to
//     find the currently-selected tile — spotted by its swatch border
//     being rendered in the dark "selected" color (rgb(31, 31, 31))
//     versus the default light gray (rgb(214, 214, 214)) every
//     unselected tile uses.
//   - In both cases, the label sits in its own row div, and the actual
//     swatch tiles live in that row's NEXT SIBLING — not inside the same
//     element as the label. `label.parent()` (the old code) is the row
//     that holds only the label text and finds zero tiles; you have to
//     go one level up and then to the next sibling.
const DIMENSION_LABEL_RE = /^(?:select(?:ed)?\s+)?(?:size|colou?r|style)s?\s*:?\s*$/i
const SELECTED_SWATCH_BORDER_RE = /rgb\(\s*31\s*,\s*31\s*,\s*31\s*\)/i

function normalizeDimensionLabel(rawLabel: string): string | null {
  const m = rawLabel.match(/(size|colou?r|style)/i)
  if (!m) return null
  const word = m[1].toLowerCase()
  return word === 'colour' ? 'Color' : word[0].toUpperCase() + word.slice(1)
}

// Flipkart gives every swatch <img> a generic alt="Image" with no other
// human-readable text nearby (this is especially true for color
// swatches — there's no "Purple"/"Gold" text anywhere in the tile
// itself). Falling back to cleanText()/alt alone means every tile in a
// color row collapses to the same label ("Image"), which breaks
// dedup/keying in the UI. As a last resort, derive a stable label from
// the image filename so tiles are at least uniquely identifiable, even
// though it won't be a pretty color name.
function deriveTileLabel($tile: cheerio.Cheerio): string | null {
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

function isSelectedTile($tile: cheerio.Cheerio): boolean {
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
      const rowText = cleanText($el.parent())
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
// the label row's next sibling, found via `.parent().next()`, not via
// `.parent().find(...)`. Price-per-tile extraction here
// (`[class*="price" i]`) is a soft attempt and may simply come back null
// per tile on this build; that's fine, VariantPicker/FlipkartProductView
// already render tiles without a price when none is found. Each tile is
// also checked for the per-tile "Out Of Stock" overlay badge (see
// FOURTH REWRITE NOTE) — this is independent of isFlipkartUnavailable(),
// which only covers the currently-selected variant's own buybox.
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

// ---------- Composed parser ----------

export function parseFlipkart($: CheerioAPI, url: string) {
  const domainHint = domainCurrency(url)

  // Try the direct DOM strikethrough-price block FIRST (see THIRD
  // REWRITE NOTE) — cheap, and correct whenever the page renders price
  // as plain text like this. Falls through to null/null on pages that
  // still use the animated odometer widget, in which case parseHtml()'s
  // JSON-LD/embedded-state/og:meta fallback chain (in parsers.ts) covers
  // it exactly as before.
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
  // The sample page also serves full-res product photos via <picture>/
  // <source srcset> without a data-src on the <img> itself — pick up the
  // largest srcset entry from rukminim <source> tags too.
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