// lib/scrape/extractors/meesho.ts
//
// Meesho-specific scraping logic, split out into its own module the same
// way amazon.ts and flipkart.ts are.
//
// UPDATE: a real captured Meesho PDP fragment has now confirmed several
// things this file previously only guessed at — title, price, rating,
// review count, seller name, and the (single-size) "Select Size" picker
// are all backed by real markup below, with the specific selectors that
// matched noted inline. What's still UNVERIFIED (no real example seen):
//   - A multi-option size picker (only a single "Free Size" chip has
//     been observed so far, so the "which chip is selected" and
//     "which chip is out of stock" logic below is still a best-effort
//     heuristic, same as before).
//   - Any out-of-stock/sold-out chip styling.
// If a real captured page contradicts either of those, treat them as
// the next thing to correct.
import type { Cheerio, CheerioAPI } from 'cheerio'
import { cleanText, detectCurrencyAndClean, domainCurrency } from '../shared'
import type { AmazonVariantDimension, AmazonVariantOption } from './amazon'

export type MeeshoVariantOption = AmazonVariantOption
export type MeeshoVariantDimension = AmazonVariantDimension

// ---------- Site config (consumed by parsers.ts) ----------

/** The SiteId literal for Meesho — imported instead of re-typing the
 * string 'meesho' at each call site in parsers.ts. */
export const SITE_ID = 'meesho' as const

/** Meesho's __NEXT_DATA__ blob (when present) usually carries enough
 * for price/title even on a direct fetch, but the size-button row has
 * not been verified to always be present pre-hydration. parsers.ts
 * uses this to flag (via a warning, since there's no render-capable
 * fetch tier anymore) when variant data was requested but never
 * appeared. */
export const REQUIRES_RENDER_FOR_VARIANTS = true

/** Meesho's og:meta price tags have historically been unreliable, so
 * its structured-data fallback chain intentionally stays JSON-only
 * (the __NEXT_DATA__ blob + the DOM-based fallbacks below) rather than
 * also trying the generic JSON-LD/og:meta pass parsers.ts runs for
 * most other sites — that risked silently overwriting a correct null
 * with a wrong number instead of leaving it null. */
export const SKIPS_GENERIC_STRUCTURED_FALLBACK = true

/** Pulls the internal `_meeshoWarning`/`_meeshoUnavailable` flags
 * (see isMeeshoUnavailable() below) off a parsed result and returns
 * them as plain metadata, deleting the internal keys in the process —
 * so parsers.ts never needs to know those keys exist by name. */
export function consumeMeeshoMeta(parsed: Record<string, any>): { warning?: string; unavailable?: boolean } {
  const warning = parsed._meeshoWarning as string | undefined
  const unavailable = parsed._meeshoUnavailable as boolean | undefined
  delete parsed._meeshoWarning
  delete parsed._meeshoUnavailable
  return { warning, unavailable }
}

// ---------- Own-text helper ----------
//
// Reads ONLY direct text-node children of an element, not text buried
// in nested tags. Good for a simple badge span whose entire content is
// a bare text node. Deliberately NOT used for buy-CTA buttons below —
// see BUY_CTA detection's own comment for why.
function ownText($el: Cheerio<any>): string {
  return $el
    .contents()
    .filter((_, node) => node.type === 'text')
    .text()
    .replace(/\s+/g, ' ')
    .trim()
}

// ---------- __NEXT_DATA__ blob ----------
//
// Meesho is a Next.js app; on a full page load the PDP embeds its
// initial props (including the product node) in
// `<script id="__NEXT_DATA__" type="application/json">`. Kept as the
// first-choice source when present, with DOM-based extraction (below)
// as the fallback for everything it doesn't cover or when it's absent
// entirely — a real captured fragment of this page had no such script
// tag in it at all, and every field below still needed to resolve from
// plain DOM.
const PRICE_KEYS = ['price', 'sellingPrice', 'finalPrice', 'discountedPrice', 'displayPrice']
const MRP_KEYS = ['mrp', 'listPrice', 'originalPrice', 'strikePrice']
const NAME_KEYS = ['name', 'title', 'productName', 'displayName']

function extractNumeric(v: any): string | null {
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string') {
    const m = v.replace(/,/g, '').match(/[\d.]+/)
    return m ? m[0] : null
  }
  if (v && typeof v === 'object') {
    if (v.amount != null) return extractNumeric(v.amount)
    if (v.value != null) return extractNumeric(v.value)
  }
  return null
}

function scoreProductNode(node: Record<string, any>): number {
  let s = 0
  for (const k of PRICE_KEYS) if (node[k] != null) s++
  for (const k of NAME_KEYS) if (node[k] != null) s++
  if (node.rating != null || node.avgRating != null) s += 0.5
  return s
}

function findProductNode(root: any, maxDepth = 14): Record<string, any> | null {
  const seen = new Set<any>()
  let best: Record<string, any> | null = null
  let bestScore = 0

  function walk(node: any, depth: number) {
    if (!node || typeof node !== 'object' || depth > maxDepth || seen.has(node)) return
    seen.add(node)
    if (!Array.isArray(node)) {
      const s = scoreProductNode(node)
      if (s >= 2 && s > bestScore) {
        best = node
        bestScore = s
      }
    }
    for (const val of Object.values(node)) {
      if (val && typeof val === 'object') walk(val, depth + 1)
    }
  }

  walk(root, 0)
  return best
}

type MeeshoNextDataProduct = {
  title: string | null
  price: string | null
  mrp: string | null
  rating: string | null
  review_count: string | null
  images: string[]
}

function extractMeeshoNextData($: CheerioAPI): MeeshoNextDataProduct | null {
  const raw = $('script#__NEXT_DATA__').html()
  if (!raw) return null

  let data: any
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }

  const node = findProductNode(data)
  if (!node) return null

  const priceKey = PRICE_KEYS.find((k) => node[k] != null)
  const mrpKey = MRP_KEYS.find((k) => node[k] != null)
  const nameKey = NAME_KEYS.find((k) => node[k] != null)

  let images: string[] = []
  for (const k of ['image', 'images', 'imageUrl', 'imageUrls', 'productImages']) {
    const v = node[k]
    if (typeof v === 'string') {
      images = [v]
      break
    }
    if (Array.isArray(v) && v.length) {
      images = v.map((it) => (typeof it === 'string' ? it : it?.url || it?.src)).filter(Boolean)
      break
    }
  }

  return {
    title: nameKey ? String(node[nameKey]) : null,
    price: priceKey ? extractNumeric(node[priceKey]) : null,
    mrp: mrpKey ? extractNumeric(node[mrpKey]) : null,
    rating: node.rating != null ? String(node.rating) : node.avgRating != null ? String(node.avgRating) : null,
    review_count: node.reviewCount != null ? String(node.reviewCount) : node.ratingCount != null ? String(node.ratingCount) : null,
    images,
  }
}

// ---------- Title ----------
//
// Confirmed by a real captured page: the product title is a plain
// `<h1>` (e.g. `<h1 ... class="sc-dOfePm bIeHMb">Best silk printed
// Daily wear saree</h1>`), no special class needed.
export function extractMeeshoTitle($: CheerioAPI, nextData: MeeshoNextDataProduct | null): string | null {
  if (nextData?.title) return nextData.title
  return cleanText($('h1').first())
}

// ---------- Price / MRP ----------
//
// Confirmed by a real captured page: the live price sits in an <h4>
// inside a wrapper whose class contains "PriceContainer" (seen as
// ShippingInfoMobilestyles__PriceContainer), rendered as
// "₹<!--comment-->252" — cheerio's .text() drops the HTML comment, so
// this reads cleanly as "₹252". A body-wide ₹-regex is kept as a
// second fallback for pages where that wrapper's class name differs.
// No MRP/strikethrough element was present in the captured example
// (this particular listing has no discount to show), so the MRP
// selector below is a best-effort guess, not confirmed against a real
// discounted listing yet.
export function extractMeeshoPriceBlock(
  $: CheerioAPI,
  nextData: MeeshoNextDataProduct | null,
  domainHint: string | null
): { price: string | null; mrp: string | null } {
  let priceRaw = nextData?.price ?? null
  let mrpRaw = nextData?.mrp ?? null

  if (!priceRaw) {
    const priceText = cleanText($('[class*="PriceContainer"] h4, [class*="PriceRow"] h4').first())
    if (priceText) priceRaw = priceText
  }
  if (!priceRaw) {
    const bodyText = $('body').text()
    const priceMatch = bodyText.match(/₹\s?[\d,]+/)
    priceRaw = priceMatch ? priceMatch[0] : null
  }

  if (!mrpRaw) {
    // UNVERIFIED: no real discounted listing captured yet — guessing at
    // a struck-through element near the price block.
    const mrpText = cleanText(
      $('[class*="PriceRow"] s, [class*="PriceRow"] strike, [class*="PriceContainer"] s, [class*="PriceContainer"] strike').first()
    )
    if (mrpText) mrpRaw = mrpText
  }

  const { amount: price } = detectCurrencyAndClean(priceRaw, domainHint)
  const { amount: mrp } = detectCurrencyAndClean(mrpRaw, domainHint)
  return { price, mrp }
}

// ---------- Rating / review count ----------
//
// Confirmed by a real captured page: the product's own rating badge is
// a `<span label="3.9">` inside a wrapper whose class contains
// "RatingSection" (ShippingInfo__RatingSection), immediately followed
// by a sibling span reading "70801  Ratings, 19093  Reviews". Scoped
// to that wrapper specifically, since `[label]` spans also appear
// elsewhere on the same page (the shop's own rating badge, and each
// individual review's star rating) — grabbing the page-wide first
// match would risk picking up the wrong one.
function extractMeeshoRatingFromDom($: CheerioAPI): { rating: string | null; review_count: string | null } {
  const section = $('[class*="RatingSection"]').first()
  const scope = section.length ? section : $('body')

  const ratingAttr = scope.find('span[label]').first().attr('label')
  const rating = ratingAttr ? ratingAttr.trim() : null

  let review_count: string | null = null
  scope.find('span, div').each((_, el) => {
    if (review_count) return false
    const text = cleanText($(el))
    if (!text) return
    const m = text.match(/([\d,]+)\s*Ratings?/i)
    if (m) review_count = m[1].replace(/,/g, '')
  })

  return { rating, review_count }
}

// ---------- Seller ----------
//
// Confirmed by a real captured page: the "Sold By" card renders the
// shop name in a span whose class contains "ShopName"
// (ShopCardstyled__ShopName), e.g. "JIHANA FAB".
function extractMeeshoSeller($: CheerioAPI): string | null {
  return cleanText($('[class*="ShopName"]').first())
}

// ---------- Images ----------
//
// Confirmed by a real captured page: the actual product photos (both
// the small thumbnail rail and the large desktop image) carry
// `data-testid="product-images"`, or sit inside a wrapper whose class
// contains "ProductDesktopImage". Scoping to these specifically is
// necessary, not cosmetic — a plain "any <img> whose src contains
// 'meesho'" scan (the old approach) also picks up similar-product
// thumbnails, review photos, the shop's profile picture, and
// marketing/value-prop icons, since all of those are served from the
// same images.meesho.com host too.
function extractMeeshoImages($: CheerioAPI): string[] {
  const images = new Set<string>()
  $('img[data-testid="product-images"], [class*="ProductDesktopImage"] img').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src')
    if (src) images.add(src)
  })
  return [...images]
}

// ---------- Availability ----------
//
// Requires BOTH a sold-out/unavailable phrase somewhere on the page
// AND the absence of any add-to-cart/buy CTA, so a single sold-out
// size chip can't false-positive the whole listing as dead.
//
// IMPORTANT FIX: a real captured page shows the Add to Cart / Buy Now
// buttons render their label as a *nested* <span> inside an inner
// <div> (icon + label wrapper) — never as a direct text child of the
// <button> itself. The previous version checked the button's ownText()
// (direct text nodes only), which would NEVER match "Add to Cart" on
// this markup and could misidentify a perfectly buyable listing as
// unavailable if a sold-out phrase appeared anywhere else on the page.
// Buy-CTA detection now reads the button/link's full text via
// cleanText() instead. Sold-out phrase detection stays on ownText()
// over div/span, since those badges are typically a bare text node.
const SOLD_OUT_RE = /^(sold out|out of stock|currently unavailable|product unavailable)$/i
const BUY_CTA_RE = /^(add to cart|buy now|continue|proceed to buy)$/i

export function isMeeshoUnavailable($: CheerioAPI): boolean {
  let soldOutText = false
  $('div, span').each((_, el) => {
    if (soldOutText) return false
    const text = ownText($(el))
    if (text && SOLD_OUT_RE.test(text)) soldOutText = true
  })

  let hasBuyButton = false
  $('button, a').each((_, el) => {
    if (hasBuyButton) return false
    const text = cleanText($(el))
    if (text && BUY_CTA_RE.test(text)) hasBuyButton = true
  })

  return soldOutText && !hasBuyButton
}

// ---------- Size picker (chips) ----------
//
// FIX: a real captured page shows Meesho's size picker is a "Select
// Size" heading (matched fine before) followed by chip elements that
// are plain `<span class="SingleChip__StyledChip-sc-...">`, NOT
// `<button>` or `[role="button"]` elements as previously assumed —
// that selector would have matched zero chips against this markup.
// Chips are now matched by a class name containing "StyledChip"
// (deliberately NOT matching the *container* div, whose class contains
// "...ChipsStyled..." — note the different word order, "Chips-Styled"
// vs "Styled-Chip", so the two don't collide) in addition to keeping
// the old button/role selectors in case another Meesho surface (or a
// future markup change) uses real buttons instead.
const SIZE_HEADING_RE = /select size/i
const SIZE_CHIP_SELECTOR = 'button, [role="button"], span[class*="StyledChip"]'

function isSelectedSizeChip($chip: Cheerio<any>): boolean {
  const cls = $chip.attr('class') || ''
  const pressed = $chip.attr('aria-pressed') || $chip.attr('aria-selected')
  // UNVERIFIED: no multi-option example captured yet, so there's no
  // confirmed "selected" class/attribute to match against — this is
  // still a best-effort guess pending a real example.
  return pressed === 'true' || /selected|active|checked/i.test(cls)
}

export function extractMeeshoOptions($: CheerioAPI): Record<string, string> | null {
  const options: Record<string, string> = {}

  $('h4, h5, h6').each((_, el) => {
    const heading = cleanText($(el))
    if (!heading || !SIZE_HEADING_RE.test(heading)) return
    const container = $(el).parent()
    const chips = container.find(SIZE_CHIP_SELECTOR)
    const labels: string[] = []
    chips.each((_, chip) => {
      const t = cleanText($(chip))
      if (t) labels.push(t)
    })
    if (!labels.length) return
    if (labels.length === 1) {
      options['Size'] = labels[0]
      return
    }
    const selectedChip = chips.filter((_, chip) => isSelectedSizeChip($(chip))).first()
    const selectedText = cleanText(selectedChip)
    options['Size'] = selectedText || labels.join(' / ')
  })

  return Object.keys(options).length ? options : null
}

// ---------- Per-chip out-of-stock flag ----------
//
// UNVERIFIED — no real sold-out chip has been captured yet. Kept as a
// best-effort heuristic (disabled attribute / sold-out-sounding class /
// a trailing "(Out of Stock)" annotation baked into the chip's own
// text) pending a real example to correct it against.
const TILE_OUT_OF_STOCK_CLASS_RE = /disabled|sold-?out|out-?of-?stock|unavailable/i
const TILE_OUT_OF_STOCK_TEXT_RE = /\(\s*(?:out of stock|sold out|unavailable)\s*\)\s*$/i

function isChipOutOfStock($chip: Cheerio<any>): boolean {
  if ($chip.is('[disabled]')) return true
  if (($chip.attr('aria-disabled') || '').toLowerCase() === 'true') return true
  const cls = $chip.attr('class') || ''
  if (TILE_OUT_OF_STOCK_CLASS_RE.test(cls)) return true
  const text = cleanText($chip)
  if (text && TILE_OUT_OF_STOCK_TEXT_RE.test(text)) return true
  return false
}

function cleanSizeLabel($chip: Cheerio<any>): string | null {
  const text = cleanText($chip)
  if (!text) return null
  return text.replace(TILE_OUT_OF_STOCK_TEXT_RE, '').trim() || text
}

function resolveMeeshoUrl(href: string | undefined | null, pageUrl: string): string | null {
  if (!href) return null
  try {
    return new URL(href, pageUrl).toString()
  } catch {
    return null
  }
}

// ---------- All variants (full size picker) ----------
export function extractMeeshoAllVariants($: CheerioAPI, pageUrl: string): MeeshoVariantDimension[] {
  const dimensions: MeeshoVariantDimension[] = []

  $('h4, h5, h6').each((_, el) => {
    const heading = cleanText($(el))
    if (!heading || !SIZE_HEADING_RE.test(heading)) return

    const container = $(el).parent()
    const $chips = container.find(SIZE_CHIP_SELECTOR)
    if (!$chips.length) return

    const options: MeeshoVariantOption[] = []
    $chips.each((_, chipEl) => {
      const $chip = $(chipEl)
      const label = cleanSizeLabel($chip)
      if (!label) return

      // Plain spans (the confirmed real case) never carry a real link —
      // that only exists on markup with an actual <a>/href, which has
      // not been observed. A null url leaves this chip correctly
      // rendered-but-disabled in the UI rather than silently omitted.
      const href = $chip.attr('href') || $chip.find('a').attr('href') || null

      options.push({
        label,
        price: null,
        currencyCode: null,
        image: null,
        url: resolveMeeshoUrl(href, pageUrl),
        selected: isSelectedSizeChip($chip),
        outOfStock: isChipOutOfStock($chip),
      })
    })

    // Confirmed real case: a single-size listing ("Free Size") has
    // nothing to pick and is implicitly selected, same shortcut used
    // in extractMeeshoOptions() above.
    if (options.length === 1) options[0].selected = true

    if (options.length) dimensions.push({ dimension: 'Size', options })
  })

  return dimensions
}

// ---------- Composed parser ----------

export function parseMeesho($: CheerioAPI, url: string) {
  const domainHint = domainCurrency(url)
  const nextData = extractMeeshoNextData($)

  const { price, mrp } = extractMeeshoPriceBlock($, nextData, domainHint)
  const domRating = extractMeeshoRatingFromDom($)

  const images = new Set<string>()
  for (const src of nextData?.images ?? []) images.add(src)
  for (const src of extractMeeshoImages($)) images.add(src)

  const result: Record<string, any> = {
    title: extractMeeshoTitle($, nextData),
    price,
    mrp,
    currencyCode: domainHint,
    rating: nextData?.rating ?? domRating.rating,
    review_count: nextData?.review_count ?? domRating.review_count,
    availability: 'In Stock (assumed)',
    seller: extractMeeshoSeller($),
    images: [...images],
  }

  if (isMeeshoUnavailable($)) {
    result.availability = 'Unavailable'
    result._meeshoUnavailable = true
    result._meeshoWarning =
      'No add-to-cart/buy text found alongside sold-out/unavailable text — treating this as a genuinely unsellable listing rather than a scrape failure.'
  }

  const options = extractMeeshoOptions($)
  if (options) result.options = options

  const variants = extractMeeshoAllVariants($, url)
  if (variants.length) result.variants = variants

  return result
}