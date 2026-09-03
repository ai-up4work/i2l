// lib/scrape/extractors/ebay.ts
//
// eBay-specific scraping logic.
//
// STRATEGY: eBay item pages embed a schema.org Product/Offer object in a
// <script type="application/ld+json"> tag. This is the most reliable
// source available without a browser — it's a documented, versioned spec
// eBay has to keep accurate for Google Shopping/rich-results, unlike
// their internal DOM class names which change frequently across item
// page redesigns (auction vs buy-it-now vs "new" 2023+ layout).
//
// This extractor tries JSON-LD FIRST and only falls back to CSS-selector
// DOM extraction for anything JSON-LD doesn't carry (item specifics,
// variation/dropdown state, breadcrumb category, etc).
//
// VERIFICATION STATUS (read before trusting this in production):
//   - JSON-LD parsing (title, price, currency, condition, availability,
//     brand, aggregateRating, image) — NOT yet verified against a live
//     captured eBay response in this codebase. schema.org Product/Offer
//     is a stable spec and eBay is known to emit it, but the exact key
//     names/nesting on eBay's current pages haven't been confirmed here.
//   - DOM selector fallback (title, price, seller, variations, item
//     specifics) — based on eBay's general current class-naming
//     conventions (the `x-item-title`, `x-price-primary`, `ux-*` prefix
//     families), NOT confirmed against a captured page.
//   - Variation/dropdown extraction — LEAST confident piece. eBay's
//     multi-SKU variation picker (color/size/style selects) has changed
//     shape across redesigns and may require a rendered page (dropdown
//     options can be present in the initial HTML as <option> elements,
//     or hydrated client-side depending on listing type) — unconfirmed
//     which is true for the pages you'll actually be hitting.
//
// Before relying on this: capture one real eBay item page response body,
// grep it for `application/ld+json` and `x-item-title`/`x-price-primary`,
// and diff against the selectors below the same way the Myntra extractor
// was verified against styleId 20359014. Update the "CONFIRMED" comments
// as you validate each piece — don't trust this file's comments as gospel
// until that's actually been done.

import type { CheerioAPI } from 'cheerio'

import { cleanText, detectCurrencyAndClean, domainCurrency } from '../shared'

export const SITE_ID = 'ebay' as const

export type EbayVariantOption = {
  label: string
  price: string | null
  currencyCode: string | null
  image: string | null
  url: string | null
  selected: boolean
  outOfStock?: boolean
}

export type EbayVariantDimension = {
  dimension: string
  options: EbayVariantOption[]
}

export type EbayItemSpecific = {
  name: string
  value: string
}

// eBay doesn't render a size-chart table the way Myntra does — this is
// kept only for the rare listing category (e.g. clothing) that embeds
// one as an image in the description, so downstream consumers of both
// extractors can share a shape if useful. Most eBay results will have
// this as null.
export type EbaySizeChartTable = {
  columns: string[]
  rows: Record<string, string>[]
  imageUrl?: string | null
  note?: string | null
}

// UNVERIFIED: set to true defensively. eBay's variation dropdowns are
// the piece most likely to require client-side hydration — flip to
// `false` only after confirming a captured raw HTML response actually
// contains populated <option> tags for a multi-variation listing.
export const REQUIRES_RENDER_FOR_VARIANTS = true

// ============================================================
// Helpers
// ============================================================

// eBay image CDN (i.ebayimg.com) URLs commonly carry a thumbnail size
// segment like `/s-l140.jpg` or `/s-l300.jpg`. Swap to a large size for
// a full-resolution image. Unlike Myntra's placeholder-token scheme,
// this is a straight string replace on a real (valid) thumbnail URL, so
// it degrades gracefully — if the pattern isn't present, the original
// URL is returned unchanged rather than broken.
const EBAY_THUMB_SIZE_RE = /\/s-l\d+(\.\w+)$/i

function resolveEbayImageUrl(src: string): string {
  const upgraded = EBAY_THUMB_SIZE_RE.test(src) ? src.replace(EBAY_THUMB_SIZE_RE, '/s-l1600$1') : src
  return upgraded.startsWith('http://') ? upgraded.replace('http://', 'https://') : upgraded
}

// Real eBay item pages are /itm/<numeric item id> (optionally preceded
// by a slug, optionally followed by query params). Mirrors the same
// "only return a URL that actually looks like the real product page
// shape" defensiveness as the Myntra extractor's resolveMyntraUrl —
// variation swatches/links on eBay can carry tracking-only hrefs
// ("#", "javascript:void(0)") for the currently-selected option.
const EBAY_HOST_RE = /(^|\.)ebay\.[a-z.]+$/i
const EBAY_ITEM_PATH_RE = /\/itm\/(?:[^/]+\/)?\d+/i

function looksLikeRealEbayItemUrl(u: URL): boolean {
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
  if (!EBAY_HOST_RE.test(u.hostname)) return false
  return EBAY_ITEM_PATH_RE.test(u.pathname)
}

function resolveEbayUrl(href: string | undefined | null, pageUrl: string): string | null {
  if (!href) return null

  const trimmed = href.trim()
  if (!trimmed || trimmed === '#' || /^javascript:/i.test(trimmed)) return null

  try {
    const resolved = new URL(trimmed, pageUrl)
    if (!looksLikeRealEbayItemUrl(resolved)) return null
    return resolved.toString()
  } catch {
    return null
  }
}

// ============================================================
// JSON-LD extraction
// ============================================================

// eBay item pages typically emit ONE <script type="application/ld+json">
// containing a schema.org Product. Some pages nest it inside an @graph
// array alongside Breadcrumb/Organization entries instead of at the top
// level — handle both shapes rather than assuming one.
export function extractEbayJsonLd($: CheerioAPI): Record<string, any> | null {
  let result: Record<string, any> | null = null

  $('script[type="application/ld+json"]').each((_, el) => {
    if (result) return

    const text = $(el).html()
    if (!text) return

    let parsed: any
    try {
      parsed = JSON.parse(text)
    } catch {
      return
    }

    const candidates = Array.isArray(parsed) ? parsed : parsed['@graph'] ? parsed['@graph'] : [parsed]

    for (const candidate of candidates) {
      const type = candidate?.['@type']
      const isProduct = type === 'Product' || (Array.isArray(type) && type.includes('Product'))
      if (isProduct) {
        result = candidate
        return
      }
    }
  })

  return result
}

function firstOffer(jsonLd: Record<string, any>): Record<string, any> | null {
  const offers = jsonLd.offers
  if (!offers) return null
  if (Array.isArray(offers)) return offers[0] ?? null
  return offers
}

// schema.org availability is a URL like
// "https://schema.org/InStock" / ".../OutOfStock" — normalize to just
// the trailing segment.
function normalizeAvailability(raw: string | null | undefined): string | null {
  if (!raw) return null
  const match = raw.match(/schema\.org\/(\w+)/i)
  return match ? match[1] : raw
}

// ============================================================
// Title / Brand
// ============================================================

// UNVERIFIED selector — current eBay "new" item page layout as of last
// training data; item pages have been redesigned multiple times, so
// confirm this against a live page before relying on it.
export function extractEbayTitleFromDom($: CheerioAPI): string | null {
  return (
    cleanText($('h1.x-item-title__mainTitle span.ux-textspans').first()) ||
    cleanText($('h1.x-item-title__mainTitle').first()) ||
    cleanText($('#itemTitle'))?.replace(/^Details about\s+/i, '') ||
    null
  )
}

export function extractEbayBrandFromDom($: CheerioAPI): string | null {
  // Brand is usually only visible inside the item-specifics table, not
  // as a standalone element — see extractEbayItemSpecifics below and
  // look up "Brand" from that list as a fallback if JSON-LD lacks it.
  return null
}

// ============================================================
// Price
// ============================================================

// UNVERIFIED selector.
export function extractEbayPriceRaw($: CheerioAPI): string | null {
  return (
    cleanText($('div.x-price-primary span.ux-textspans').first()) ||
    cleanText($('span#prcIsum')) ||
    cleanText($('span#mm-saleDscPrc')) ||
    null
  )
}

// "Was" / strikethrough price, if the listing has one.
export function extractEbayWasPriceRaw($: CheerioAPI): string | null {
  return (
    cleanText($('div.x-additional-info__strikethrough span.ux-textspans').first()) ||
    cleanText($('span#orgPrc')) ||
    null
  )
}

// ============================================================
// Images
// ============================================================

// UNVERIFIED selector — eBay's image gallery/carousel markup.
export function extractEbayImages($: CheerioAPI): string[] {
  const images = new Set<string>()

  $('div.ux-image-carousel-item img, div.ux-image-grid-item img').each((_, el) => {
    const src =
      $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-zoom-src') || $(el).attr('data-image-src')
    if (src) images.add(resolveEbayImageUrl(src))
  })

  // Legacy/simpler layout fallback.
  if (!images.size) {
    $('#icImg').each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src')
      if (src) images.add(resolveEbayImageUrl(src))
    })
  }

  return [...images]
}

function extractImagesFromJsonLd(jsonLd: Record<string, any>): string[] {
  const raw = jsonLd.image
  if (!raw) return []
  const list = Array.isArray(raw) ? raw : [raw]
  return list.filter((s): s is string => typeof s === 'string' && s.length > 0).map(resolveEbayImageUrl)
}

// ============================================================
// Rating / Reviews / Seller
// ============================================================

function extractRatingFromJsonLd(jsonLd: Record<string, any>): { rating: string | null; reviewCount: string | null } {
  const agg = jsonLd.aggregateRating
  if (!agg || typeof agg !== 'object') return { rating: null, reviewCount: null }
  return {
    rating: agg.ratingValue != null ? String(agg.ratingValue) : null,
    reviewCount: agg.reviewCount != null ? String(agg.reviewCount) : agg.ratingCount != null ? String(agg.ratingCount) : null,
  }
}

// UNVERIFIED selector — seller name + feedback score block.
export function extractEbaySeller($: CheerioAPI): string | null {
  return (
    cleanText($('div.x-sellercard-atf__info__about-seller span.ux-textspans').first()) ||
    cleanText($('span.mbg-nw')) ||
    null
  )
}

export function extractEbaySellerFeedbackPercent($: CheerioAPI): string | null {
  const text = cleanText($('div.x-sellercard-atf__data-item span.ux-textspans--SECONDARY').first())
  const match = text?.match(/([\d.]+)%/)
  return match ? match[1] : null
}

// ============================================================
// Condition
// ============================================================

// eBay's condition field ("New", "Used", "For parts or not working",
// etc) is one of the most load-bearing fields for a buyer and is
// present both in JSON-LD (itemCondition, as a schema.org URL like
// ".../NewCondition") and in the DOM.
const CONDITION_URL_RE = /schema\.org\/(\w+)Condition/i

function normalizeCondition(raw: string | null | undefined): string | null {
  if (!raw) return null
  const match = raw.match(CONDITION_URL_RE)
  if (match) {
    // "New" / "Used" / "Refurbished" / etc — split CamelCase.
    return match[1].replace(/([a-z])([A-Z])/g, '$1 $2')
  }
  return raw
}

// UNVERIFIED selector.
export function extractEbayConditionFromDom($: CheerioAPI): string | null {
  return cleanText($('div.x-item-condition-text span.ux-textspans').first()) || cleanText($('#vi-itm-cond')) || null
}

// ============================================================
// Availability / Stock
// ============================================================

// UNVERIFIED — eBay shows remaining-quantity text like "3 available" /
// "Last one" / "More than 10 available" for buy-it-now listings, and
// "Ended"/bidding info for auctions. This only handles the buy-it-now
// quantity-left case; auction state isn't modeled here.
const QUANTITY_LEFT_RE = /(\d+)\s+available/i

export function extractEbayQuantityAvailable($: CheerioAPI): number | null {
  const text = cleanText($('div.x-quantity__availability span.ux-textspans').first()) || ''
  const match = text.match(QUANTITY_LEFT_RE)
  if (match) return Number(match[1])
  if (/last one/i.test(text)) return 1
  return null
}

export function isEbayListingEnded($: CheerioAPI): boolean {
  const bodyText = $('body').text()
  return /this listing (has ended|was ended)/i.test(bodyText) || $('.msgTextAlign').text().toLowerCase().includes('this listing was ended')
}

// ============================================================
// Item specifics ("About this item" table)
// ============================================================

// UNVERIFIED selector — eBay's item-specifics panel, usually a definition
// list or two-column table of label/value pairs (Brand, Model, Color,
// Material, MPN, etc). This is the richest source of structured
// attributes on an eBay listing and is worth getting right, but the
// exact container/row class names should be confirmed against a live
// page — this tries the two layouts most commonly seen.
export function extractEbayItemSpecifics($: CheerioAPI): EbayItemSpecific[] {
  const specifics: EbayItemSpecific[] = []
  const seen = new Set<string>()

  function addSpecific(name: string | null | undefined, value: string | null | undefined) {
    const cleanName = name?.trim()
    const cleanValue = value?.trim()
    if (!cleanName || !cleanValue) return
    const key = cleanName.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    specifics.push({ name: cleanName, value: cleanValue })
  }

  // Layout A: dl-based "About this item" panel.
  $('div.ux-layout-section--features dl.ux-labels-values').each((_, el) => {
    const $row = $(el)
    const name = cleanText($row.find('.ux-labels-values__labels').first())
    const value = cleanText($row.find('.ux-labels-values__values').first())
    addSpecific(name, value)
  })

  // Layout B: legacy two-column item-specifics table.
  $('div#viTabs_0_is table tr, table.itemAttr tr').each((_, tr) => {
    const cells = $(tr).find('td, th')
    if (cells.length < 2) return
    const name = cleanText(cells.eq(0))?.replace(/:$/, '') ?? null
    const value = cleanText(cells.eq(1))
    addSpecific(name, value)
  })

  return specifics
}

function findBrandFromSpecifics(specifics: EbayItemSpecific[]): string | null {
  return specifics.find((s) => s.name.toLowerCase() === 'brand')?.value ?? null
}

// ============================================================
// Variations (color / size / style dropdowns)
// ============================================================

// LEAST CONFIDENT part of this extractor — see the top-of-file
// verification-status note. eBay multi-variation listings render one
// <select> (or a swatch-button group for the primary visual dimension,
// e.g. color) per variation dimension. This only handles the <select>
// case, which is the more common one for text dimensions like Size.
//
// If REQUIRES_RENDER_FOR_VARIANTS ends up true for the pages you're
// hitting (i.e. <option> tags come back empty/unpopulated from a bare
// HTTP fetch), this DOM-only approach won't find anything and you'll
// need a render step, same tradeoff discussed for Myntra's size chart.
export function extractEbayVariants($: CheerioAPI, pageUrl: string): EbayVariantDimension[] {
  const dimensions: EbayVariantDimension[] = []

  $('select[id^="msku-sel-"], select.msku-sel').each((_, selectEl) => {
    const $select = $(selectEl)

    // Dimension name usually lives in a sibling label, e.g.
    // <div class="msku-label">Size</div> just before the select.
    const dimensionName =
      cleanText($select.closest('.x-msku__select-box').find('.ux-textspans--BOLD').first()) ||
      cleanText($select.prevAll('label, .msku-label').first()) ||
      'Option'

    const options: EbayVariantOption[] = []

    $select.find('option').each((_, optEl) => {
      const $opt = $(optEl)
      const label = cleanText($opt)
      if (!label || /select/i.test(label)) return // skip "-- Select --" placeholder

      options.push({
        label,
        price: null,
        currencyCode: null,
        image: null,
        url: null,
        selected: $opt.is(':selected') || $opt.attr('selected') != null,
        outOfStock: /sold out|out of stock/i.test(label),
      })
    })

    if (options.length) dimensions.push({ dimension: dimensionName, options })
  })

  // Swatch-button style dimension (commonly used for Color), separate
  // from the <select> case above.
  $('div.x-msku__select-box--swatch a[title], div.vim.x-msku-swatch a[title]').each((_, el) => {
    const $a = $(el)
    const label = $a.attr('title')?.trim()
    if (!label) return

    const image = $a.find('img').attr('src') || $a.find('img').attr('data-src') || null
    const href = $a.attr('href') || null
    const selected = $a.hasClass('selected') || $a.attr('aria-selected') === 'true'

    let colorDim = dimensions.find((d) => d.dimension.toLowerCase() === 'color')
    if (!colorDim) {
      colorDim = { dimension: 'Color', options: [] }
      dimensions.push(colorDim)
    }

    colorDim.options.push({
      label,
      price: null,
      currencyCode: null,
      image: image ? resolveEbayImageUrl(image) : null,
      url: resolveEbayUrl(href, pageUrl),
      selected,
    })
  })

  return dimensions
}

// ============================================================
// Build result
// ============================================================

function applyEndedFlag(result: Record<string, any>, $: CheerioAPI) {
  if (isEbayListingEnded($)) {
    result.availability = result.availability || 'Ended'
    result._ebayUnavailable = true
    result._ebayWarning = 'Listing appears to have ended (no active bidding/buy-it-now state found).'
  }
}

export function parseEbay($: CheerioAPI, url: string) {
  const domainHint = domainCurrency(url)

  const jsonLd = extractEbayJsonLd($)
  const offer = jsonLd ? firstOffer(jsonLd) : null

  const domTitle = extractEbayTitleFromDom($)
  const domPriceRaw = extractEbayPriceRaw($)
  const { amount: domPriceAmount, code: domCurrencyCode } = detectCurrencyAndClean(domPriceRaw, domainHint)

  const specifics = extractEbayItemSpecifics($)
  const variants = extractEbayVariants($, url)

  console.log('[eBay] JSON-LD found:', !!jsonLd)
  console.log('[eBay] Item specifics found:', specifics.length)
  console.log('[eBay] Variant dimensions found:', variants.length)

  const { rating, reviewCount } = jsonLd ? extractRatingFromJsonLd(jsonLd) : { rating: null, reviewCount: null }

  const price =
    offer?.price != null ? String(offer.price) : domPriceAmount != null ? String(domPriceAmount) : null
  const currencyCode = offer?.priceCurrency || domCurrencyCode || domainHint || 'USD'

  const jsonImages = jsonLd ? extractImagesFromJsonLd(jsonLd) : []
  const images = jsonImages.length ? jsonImages : extractEbayImages($)

  const availability = normalizeAvailability(offer?.availability) || null
  const condition = normalizeCondition(jsonLd?.itemCondition) || extractEbayConditionFromDom($)

  const brand =
    (typeof jsonLd?.brand === 'object' && jsonLd?.brand !== null ? jsonLd.brand.name : jsonLd?.brand) ||
    findBrandFromSpecifics(specifics) ||
    null

  const result: Record<string, any> = {
    title: jsonLd?.name || domTitle || null,
    brand,
    price,
    wasPrice: extractEbayWasPriceRaw($),
    currencyCode,
    condition,
    rating,
    review_count: reviewCount,
    availability,
    quantityAvailable: extractEbayQuantityAvailable($),
    seller: extractEbaySeller($),
    sellerFeedbackPercent: extractEbaySellerFeedbackPercent($),
    images,
    itemSpecifics: specifics,
    ebayItemId: jsonLd?.sku || jsonLd?.productID || null,
  }

  if (variants.length) result.variants = variants

  applyEndedFlag(result, $)

  return result
}

// ============================================================
// Consume eBay metadata
// ============================================================

export function consumeEbayMeta(parsed: Record<string, any>): { warning?: string; unavailable?: boolean } {
  const warning = parsed._ebayWarning as string | undefined
  const unavailable = parsed._ebayUnavailable as boolean | undefined

  delete parsed._ebayWarning
  delete parsed._ebayUnavailable

  return { warning, unavailable }
}