// lib/scrape/extractors/tatacliq.ts
//
// ******************************************************************
// STATUS: built from ONE real captured TataCliq PDP (HOP Kids Girls by
// Westside Beige Sling-Bag Design Cotton A-Line Dress, product code
// MP000000031753767, captured 2026-09-15). Confidence varies by field
// — see inline notes. This is a genuine capture, not a speculative
// build like nykaa.ts, but it's still exactly ONE product on ONE
// category (kids' apparel), so:
//   - CONFIRMED means: this selector/attribute was actually present
//     and correctly read in the captured HTML.
//   - UNCONFIRMED means: no example existed in this capture to verify
//     against (e.g. a discounted price, an out-of-stock size, a
//     product with an actual star rating).
//
// RENDER REQUIREMENT: UNCONFIRMED. It's not known whether this markup
// is present in a plain fetch() or only after client-side hydration —
// the capture this file is built from didn't distinguish the two.
// REQUIRES_RENDER_FOR_VARIANTS defaults to `true` here as the safe
// choice (a page that renders fine statically just does one
// unnecessary render pass; a page that needs rendering and doesn't get
// it silently returns nothing). Test a plain fetch against a real
// tatacliq.com PDP and flip this to `false` if the title/price/variant
// markup below is already present in the static response.
//
// NO EMBEDDED JSON BLOB WAS FOUND. Unlike jiomart.ts/nykaa.ts, nothing
// in this capture resembles a `window.__X__ = {...}` assignment or a
// `#__NEXT_DATA__`/`application/json` script tag carrying a product
// record — everything here is plain DOM + schema.org microdata
// (itemprop attributes). Whether that's genuinely absent from the real
// page or just outside the captured fragment (the capture is the PDP's
// body content, not a full page including <head>/<script> tags) is
// itself unconfirmed. SKIPS_GENERIC_STRUCTURED_FALLBACK is left `false`
// (i.e. the generic embedded-state fallback in parsers.ts is allowed
// to run) since there's no evidence yet of it picking up noise the way
// it did on JioMart/Meesho — revisit if that turns out not to hold.
//
// DISCOUNT PRICING — UNCONFIRMED. The captured product has no active
// discount: the ENTIRE price block is one `<meta itemprop="lowPrice"
// content="499">` plus an `<h3>MRP:  ₹499</h3>` — genuinely just an
// MRP with nothing to discount from. extractTataCliqSellingPriceRaw()
// below probes a handful of likely class-name candidates for a
// discounted "you pay" price, but none of them have ever been seen to
// actually exist. Until a discounted-product capture confirms one,
// price and mrp will come out equal (and mrp is then dropped, same
// "don't report a fake discount" convention as nykaa.ts).
//
// COLOUR VARIANTS ARE SEPARATE PRODUCT PAGES, NOT IN-PAGE SWAPS —
// CONFIRMED, but the URL for a sibling colour can't safely be built.
// The captured PDP's own colour (Beige, product code
// MP000000031753767) sits alongside a Pink swatch whose thumbnail
// filename embeds product code MP000000031753766 — and that exact
// code appears elsewhere on the SAME page as the URL slug of a real
// sibling product ("HOP Kids Girls by Westside Pink Sling-Bag Detail
// Cotton A-Line Dress", /p-mp000000031753766). So colour variants
// genuinely are distinct products with sequential-ish codes, but
// there's no way to recover the correct SLUG TEXT for an arbitrary
// sibling from the swatch alone — TataCliq's URL format is
// `/{slug}/p-{code}`, and guessing the slug (or dropping it) is
// exactly the kind of fabricated link this codebase avoids elsewhere
// (see nykaa.ts's variantUrlFor() comment). So colour tiles come back
// with `url: null` — visible and correctly labeled, not clickable —
// even though we now know *why* a URL should exist for them.
//
// SIZE VARIANTS ARE IN-PAGE, NOT SEPARATE PAGES — CONFIRMED by the
// complete absence of any `href`/`<a>` on the size buttons; selecting
// a size updates the same page (a client-side call, most likely) with
// no separate URL to scrape. `url` is null for every size option, and
// unlike colour, this isn't a "couldn't resolve it" null — there is
// structurally nothing to resolve.
//
// OUT-OF-STOCK / SELECTED STATE FOR SIZES — UNCONFIRMED. All five size
// buttons on the captured PDP show `aria-checked="false"` (none
// pre-selected) and none carry any disabled/sold-out class — this
// product just hadn't had a size picked yet. `selected` reads
// `aria-checked="true"` (untested against a real true case);
// `outOfStock` probes a couple of likely class-name substrings
// (untested against a real out-of-stock size).
//
// RATING — the captured PDP shows literal text "Share your opinion" in
// place of a rating widget (`.ProductDetailsMainCard__noRatingText`) —
// i.e. this product has zero reviews, which is itself a confirmed,
// unambiguous "no rating" signal, read as such below. What a PDP WITH
// a rating actually renders in that same slot is unconfirmed — but the
// same page's "More From HOP" recommendation carousel does render real
// star ratings on OTHER products, using a `StarRatingV2__starRatingLow`
// / `StarRatingV2__ratingNum` component pair. That's confirmed markup,
// just not confirmed to be the PDP's own widget rather than a shared
// component reused there — used here as the best available guess for
// the PDP's rating slot when `noRatingText` isn't present.
//
// SIZE CHART — NOT implemented. "Size Guide" (`#size-guide-link`) is
// present but click-gated (its content isn't in the static/rendered
// capture at all), same situation as Hopscotch's chart — see that
// file's fetchHopscotchSizeChartTable() for the pattern to follow if
// this needs implementing later.
// ******************************************************************

import type { CheerioAPI } from 'cheerio'
import { cleanText, detectCurrencyAndClean, domainCurrency } from '../shared'

export const SITE_ID = 'tataCliq' as const

export type TataCliqVariantOption = {
  label: string
  price: string | null
  currencyCode: string | null
  image: string | null
  url: string | null
  selected: boolean
  outOfStock: boolean
}

export type TataCliqVariantDimension = {
  dimension: string
  options: TataCliqVariantOption[]
}

// UNCONFIRMED — see file header. Defaults to the safe choice.
export const REQUIRES_RENDER_FOR_VARIANTS = true

// See file header: no evidence yet either way for this site, so the
// generic embedded-state fallback in parsers.ts is left enabled.
export const SKIPS_GENERIC_STRUCTURED_FALLBACK = false

export type TataCliqParsed = {
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
  variants?: TataCliqVariantDimension[]
  description?: string | null
  productDetails?: Record<string, string> | null
  categoryPath?: string | null
  tataCliqProductCode?: string | null
  // Internal-only, stripped by consumeTataCliqMeta() — same pattern as
  // every other extractor's _<site>Warning/_<site>Unavailable fields.
  _tataCliqWarning?: string
  _tataCliqUnavailable?: boolean
}

// ---------- small local helpers ----------

function normalizeUrl(src: string): string {
  return src.startsWith('//') ? `https:${src}` : src
}

// ============================================================
// Title / Brand / canonical URL / product code
// ============================================================

// CONFIRMED: `h1.ProductDetailsMainCard__productName` inside an
// `[itemprop="name"]` wrapper.
export function extractTataCliqTitle($: CheerioAPI): string | null {
  return cleanText($('h1.ProductDetailsMainCard__productName').first()) || null
}

// CONFIRMED: `h2#pd-brand-name span[itemprop="name"]` (e.g. "HOP").
export function extractTataCliqBrand($: CheerioAPI): string | null {
  const fromMicrodata = cleanText($('h2#pd-brand-name span[itemprop="name"]').first())
  if (fromMicrodata) return fromMicrodata
  return cleanText($('h2.ProductDetailsMainCard__brandName').first())
}

// CONFIRMED: the PDP's own self-link carries the canonical URL as
// `itemprop="url"` — more reliable than trusting whatever URL the
// scrape request itself was given (which may include tracking params
// or a redirect hop).
export function extractTataCliqCanonicalUrl($: CheerioAPI): string | null {
  const href = $('a.ProductDetailsMainCard__linkName[itemprop="url"]').attr('href')
  return href || null
}

// CONFIRMED shape: TataCliq product codes look like MP000000031753767
// and appear in the canonical URL as the trailing `/p-{code}` segment
// (lowercase in the URL, uppercase everywhere else — e.g. image
// filenames). Falls back to the request URL if the canonical link
// wasn't found.
export function extractTataCliqProductCode(canonicalUrl: string | null, requestUrl: string): string | null {
  const source = canonicalUrl || requestUrl
  const m = source.match(/\/p-(mp\d+)/i)
  return m ? m[1].toUpperCase() : null
}

// ============================================================
// Price / MRP
// ============================================================

// CONFIRMED: `meta[itemprop="lowPrice"]` inside the
// `itemprop="offers"` AggregateOffer block (e.g. content="499"), paired
// with `meta[itemprop="priceCurrency"]` (e.g. content="₹"). This is the
// value the page itself labels "MRP" (see the `<h3>MRP: ₹499</h3>`
// next to it) — i.e. it's confirmed to be the BASE price, not
// necessarily the final selling price. See extractTataCliqSellingPriceRaw()
// for the (unconfirmed) discounted-price probe.
export function extractTataCliqMrpRaw($: CheerioAPI): { amount: string | null; symbol: string | null } {
  const section = $('div.ProductDetailsMainCard__productPriceSection').first()
  const amount = section.find('meta[itemprop="lowPrice"]').attr('content') || null
  const symbol = section.find('meta[itemprop="priceCurrency"]').attr('content') || null
  return { amount, symbol }
}

// UNCONFIRMED — no discounted product was in the capture this file is
// built from, so none of these candidate selectors have been verified
// against a real "you pay X, MRP Y" layout. Kept narrow (scoped inside
// the same price section) rather than searching the whole page, so a
// miss fails safely (returns null) instead of grabbing an unrelated
// price-shaped number from elsewhere on the PDP.
export function extractTataCliqSellingPriceRaw($: CheerioAPI): string | null {
  const section = $('div.ProductDetailsMainCard__productPriceSection, div.ProductDetailsMainCard__priceAndDiscountSection')
  const candidates = [
    '[class*="youPay"]',
    '[class*="sellingPrice"]',
    '[class*="finalPrice"]',
    '[class*="offerPrice"]',
    '[class*="discountedPrice"]',
  ]
  for (const sel of candidates) {
    const text = cleanText(section.find(sel).first())
    if (text) return text
  }
  return null
}

// ============================================================
// Images
// ============================================================

// CONFIRMED: `.ProductGalleryDesktopUpdated__images` — protocol-
// relative src (`//img.tatacliq.com/...`), normalized to https.
export function extractTataCliqImages($: CheerioAPI): string[] {
  const urls = new Set<string>()
  $('.ProductGalleryDesktopUpdated__images').each((_, el) => {
    const src = $(el).attr('src')
    if (src) urls.add(normalizeUrl(src))
  })
  return [...urls]
}

// ============================================================
// Rating / Reviews
// ============================================================

// See file header: `noRatingText` is a confirmed positive "zero
// reviews" signal, read first and short-circuits to null/null without
// guessing further. Otherwise falls back to the StarRatingV2 pair
// confirmed elsewhere on this same page template (carousel cards),
// unconfirmed as the PDP's own widget specifically.
export function extractTataCliqRating($: CheerioAPI): { rating: string | null; reviewCount: string | null } {
  if ($('.ProductDetailsMainCard__noRatingText').length) {
    return { rating: null, reviewCount: null }
  }

  const card = $('#BPDT, .ProductDetailsMainCard__base').first()
  const ratingRaw = cleanText(card.find('.StarRatingV2__starRatingLow').first())
  const countRaw = cleanText(card.find('.StarRatingV2__ratingNum').first())

  const rating = ratingRaw ? ratingRaw.match(/\d+(?:\.\d+)?/)?.[0] ?? null : null
  const reviewCount = countRaw ? countRaw.replace(/[()]/g, '').trim() || null : null

  return { rating, reviewCount }
}

// ============================================================
// Seller
// ============================================================

// CONFIRMED text pattern: `.ProductDescriptionPage__soldByText`
// contains "Sold By {name}" (e.g. "Sold By 1 Trent Limited" — the
// captured leading "1" may be a stray adjacent element merged into the
// text rather than part of the seller's actual name; not stripped
// here since that's unconfirmed, just documented).
export function extractTataCliqSeller($: CheerioAPI): string | null {
  const raw = cleanText($('.ProductDescriptionPage__soldByText').first())
  if (!raw) return null
  return raw.replace(/^Sold\s*By\s*/i, '').trim() || null
}

// ============================================================
// Availability
// ============================================================

// CONFIRMED present-and-enabled on the captured (in-stock) PDP:
// `.ProductDescriptionPage__pdpBuyNow` and
// `.ProductDescriptionPage__addToBagPDP`. No disabled/sold-out example
// existed to confirm what that state looks like, so — same as
// jiomart.ts's isJioMartAvailable() — this only asserts "available"
// when it finds a genuinely enabled button, and returns false rather
// than guessing when neither button is found at all.
export function isTataCliqAvailable($: CheerioAPI): boolean {
  const buttons = $('button.ProductDescriptionPage__pdpBuyNow, button.ProductDescriptionPage__addToBagPDP')
  if (!buttons.length) return false
  return buttons.toArray().some((el) => $(el).attr('disabled') == null && $(el).attr('aria-disabled') !== 'true')
}

const OUT_OF_STOCK_PATTERNS = [/out\s*of\s*stock/i, /sold\s*out/i, /currently\s*unavailable/i, /notify\s*me/i]

function applyUnavailableFlags($: CheerioAPI, result: Record<string, any>) {
  // Same reasoning as jiomart.ts: don't trust the availability check at
  // all if we don't even have a title, since that likely means we're
  // looking at a pre-hydration shell rather than real content.
  if (!result.title) return

  const buttons = $('button.ProductDescriptionPage__pdpBuyNow, button.ProductDescriptionPage__addToBagPDP')
  const bodyTextSample = $('body').text().slice(0, 20000)
  const oosTextMatch = OUT_OF_STOCK_PATTERNS.some((re) => re.test(bodyTextSample))

  if (buttons.length && !isTataCliqAvailable($)) {
    result.availability = result.availability || 'Out of stock'
    result._tataCliqUnavailable = true
    result._tataCliqWarning =
      'No enabled Buy Now/Add To Bag button was found — likely a genuinely unavailable product, not a scraper error. The disabled/sold-out markup itself is UNCONFIRMED, so this is inferred from absence rather than a matched sold-out class.'
  } else if (!buttons.length && oosTextMatch) {
    result.availability = 'Out of stock'
    result._tataCliqUnavailable = true
    result._tataCliqWarning =
      'No Buy Now/Add To Bag button was found at all, and out-of-stock-shaped text was present on the page — treated as unavailable, but this pattern match is UNCONFIRMED against a real TataCliq sold-out PDP.'
  }
}

// ============================================================
// Description / product details table / category path
// ============================================================

// CONFIRMED: `[itemprop="description"]` holds the full description
// text, but it also CONTAINS the nested spec table
// (`.ProductDescriptionPage__productDetailsPDP`) as child markup — the
// clone-and-strip here removes that nested block before reading text,
// so the description doesn't end up with "Package Content 1 Dress
// Pattern Striped..." run into the prose.
export function extractTataCliqDescription($: CheerioAPI): string | null {
  const node = $('[itemprop="description"]').first()
  if (!node.length) return null
  const clone = node.clone()
  clone.find('.ProductDescriptionPage__productDetailsPDP').remove()
  const text = clone.text().replace(/\s+/g, ' ').trim()
  return text || null
}

// CONFIRMED: the same nested block stripped out above is itself a
// clean set of label/value pairs (Package Content, Pattern, Fabric
// Composition, Closure, Color, Garment Length, Wash Care, Neck,
// Sleeve, Net Quantity on the captured product — row set expected to
// vary by category, so read generically by label rather than assuming
// a fixed set).
export function extractTataCliqProductDetails($: CheerioAPI): Record<string, string> {
  const details: Record<string, string> = {}
  $('.ProductDescriptionPage__productDetailsPDP .ProductDescriptionPage__contentDetailsPDP').each((_, el) => {
    const $el = $(el)
    const label = cleanText($el.find('.ProductDescriptionPage__headerDetailsPDP').first())
    const value = cleanText($el.find('.ProductDescriptionPage__headerDetailsValuePDP').first())
    if (label) details[label] = value ?? ''
  })
  return details
}

// CONFIRMED: `.BreadcrumbsNavigation__breadcrumbs li a` — the final
// breadcrumb `<li>` (the current page / product title itself) has no
// `<a>` and is naturally excluded by this selector.
export function extractTataCliqCategoryPath($: CheerioAPI): string | null {
  const parts: string[] = []
  $('.BreadcrumbsNavigation__breadcrumbs li a').each((_, el) => {
    const t = cleanText($(el))
    if (t) parts.push(t)
  })
  return parts.length ? parts.join(' > ') : null
}

// ============================================================
// Variant dimensions
// ============================================================

// CONFIRMED structure, UNCONFIRMED url/outOfStock — see file header
// for the product-code finding and why url stays null anyway.
function extractTataCliqColourVariants($: CheerioAPI): TataCliqVariantDimension | null {
  const options: TataCliqVariantOption[] = []

  $('.ColourSelector__colour .ColourSelect__base').each((_, el) => {
    const $el = $(el)
    const idAttr = $el.attr('id') || '' // e.g. "pdp-color-Beige"
    const idLabel = idAttr.replace(/^pdp-color-/i, '').trim()

    const srOnly = cleanText($el.find('.ColourSelect__srOnly').first())
    const srLabel = srOnly ? srOnly.replace(/\s*colou?r$/i, '').trim() : ''

    const label = idLabel || srLabel || 'Unknown'

    const img = $el.find('.ColourSelect__content img').first()
    const imgSrc = img.attr('src')
    // CONFIRMED signal: the currently-selected colour's swatch image
    // carries an extra "textHolderActive" class.
    const selected = (img.attr('class') || '').includes('textHolderActive')

    options.push({
      label,
      price: null,
      currencyCode: null,
      image: imgSrc ? normalizeUrl(imgSrc) : null,
      // See file header: a genuine URL should exist (colour = separate
      // product) but can't be safely constructed from what's in this
      // markup alone — never fabricated.
      url: null,
      selected,
      // UNCONFIRMED: no disabled/sold-out colour swatch was present to
      // verify a class name against.
      outOfStock: false,
    })
  })

  if (!options.length) return null
  return { dimension: 'Colour', options }
}

// CONFIRMED structure, UNCONFIRMED selected/outOfStock signals for any
// case other than "nothing picked yet" — see file header.
function extractTataCliqSizeVariants($: CheerioAPI): TataCliqVariantDimension | null {
  const options: TataCliqVariantOption[] = []

  $('#sizeContainer .SizeSelectorNewPdp__boxPdp .SizeSelectNewPdp__base').each((_, el) => {
    const $el = $(el)
    const label =
      cleanText($el.find('.SizeSelectNewPdp__sizeTexts').first()) ||
      ($el.attr('id') || '').replace(/^pdpSize-/i, '').trim() ||
      'Unknown'

    const selected = $el.attr('aria-checked') === 'true'
    const classAttr = $el.attr('class') || ''
    const outOfStock = /disabled|soldout|sold-out|outofstock|out-of-stock/i.test(classAttr)

    options.push({
      label,
      price: null,
      currencyCode: null,
      image: null,
      // CONFIRMED absent by structure — size selection is in-page, no
      // href exists on these buttons at all.
      url: null,
      selected,
      outOfStock,
    })
  })

  if (!options.length) return null
  return { dimension: 'Size', options }
}

function extractTataCliqVariants($: CheerioAPI): TataCliqVariantDimension[] {
  const dims: TataCliqVariantDimension[] = []
  const colour = extractTataCliqColourVariants($)
  const size = extractTataCliqSizeVariants($)
  if (colour) dims.push(colour)
  if (size) dims.push(size)
  return dims
}

// UNCONFIRMED — matches the SITE_OPTIONS_EXTRACTORS call pattern used
// elsewhere (the currently-*selected* option per dimension).
export function extractTataCliqOptions(
  $: CheerioAPI,
  variants?: TataCliqVariantDimension[]
): Record<string, string> | null {
  const dims = variants ?? extractTataCliqVariants($)
  const options: Record<string, string> = {}
  for (const dim of dims) {
    const sel = dim.options.find((o) => o.selected)
    if (sel) options[dim.dimension] = sel.label
  }
  return Object.keys(options).length ? options : null
}

// ============================================================
// Build result
// ============================================================

function buildResult($: CheerioAPI, url: string): TataCliqParsed {
  const title = extractTataCliqTitle($)
  const brand = extractTataCliqBrand($)
  const canonicalUrl = extractTataCliqCanonicalUrl($)
  const productCode = extractTataCliqProductCode(canonicalUrl, url)

  const { amount: mrpRaw, symbol } = extractTataCliqMrpRaw($)
  const sellingRaw = extractTataCliqSellingPriceRaw($)

  const domainHint = domainCurrency(url)
  // Combine the bare numeric MRP with its currency symbol so
  // detectCurrencyAndClean (shared across every extractor) can do its
  // usual symbol-to-code resolution rather than reimplementing that
  // mapping locally.
  const mrpText = mrpRaw != null ? `${symbol ?? ''}${mrpRaw}`.trim() : null
  const { amount: mrpAmount, code: mrpCode } = detectCurrencyAndClean(mrpText, domainHint)
  const { amount: sellingAmount, code: sellingCode } = detectCurrencyAndClean(sellingRaw, domainHint)

  // See file header: no confirmed example of an actual discount, so
  // when no separate selling price was found, price and mrp both come
  // from the same MRP value and mrp is then dropped — same "don't
  // report a discount that isn't real" convention as nykaa.ts.
  const price = sellingAmount ?? mrpAmount
  const mrp = sellingAmount != null && mrpAmount != null && Number(mrpAmount) > Number(sellingAmount) ? mrpAmount : null
  const currencyCode = sellingCode ?? mrpCode ?? 'INR'

  const { rating, reviewCount } = extractTataCliqRating($)
  const variants = extractTataCliqVariants($)
  const productDetails = extractTataCliqProductDetails($)
  const categoryPath = extractTataCliqCategoryPath($)

  const result: TataCliqParsed = {
    title,
    brand,
    price,
    mrp,
    currencyCode,
    rating,
    review_count: reviewCount,
    availability: null,
    seller: extractTataCliqSeller($),
    images: extractTataCliqImages($),
    description: extractTataCliqDescription($),
  }

  if (variants.length) result.variants = variants
  if (Object.keys(productDetails).length) result.productDetails = productDetails
  if (categoryPath) result.categoryPath = categoryPath
  if (productCode) result.tataCliqProductCode = productCode

  applyUnavailableFlags($, result)

  if (!title && !price) {
    result._tataCliqWarning =
      'Neither a title nor a price matched any known TataCliq selector — the page structure may have changed, or this is still the pre-hydration shell (see the file header note on REQUIRES_RENDER_FOR_VARIANTS being unconfirmed). Send a fresh captured PDP to re-check.'
  }

  return result
}

// ============================================================
// Entry point
// ============================================================

export function parseTataCliq($: CheerioAPI, url: string): TataCliqParsed {
  const result = buildResult($, url)
  const options = extractTataCliqOptions($, result.variants)
  if (options) (result as Record<string, any>).options = options
  return result
}

// ============================================================
// Consume TataCliq metadata
// ============================================================

export function consumeTataCliqMeta(parsed: Record<string, any>): { warning?: string; unavailable?: boolean } {
  const warning = parsed._tataCliqWarning as string | undefined
  const unavailable = parsed._tataCliqUnavailable as boolean | undefined

  delete parsed._tataCliqWarning
  delete parsed._tataCliqUnavailable

  return { warning, unavailable }
}

// ============================================================
// Hydration check — for parsers.ts's STATIC_CONTENT_SUFFICIENT, IF
// this site is registered there. Not wired in by default given the
// render requirement is itself unconfirmed (see file header) — add
// SITE_ID to RENDER_FALLBACK_HOSTS and STATIC_CONTENT_SUFFICIENT
// together once a plain-fetch test settles the question either way.
// ============================================================

export function hasHydratedTataCliqMarkup(html: string): boolean {
  return /ProductDetailsMainCard__productName|itemprop="lowPrice"/i.test(html)
}