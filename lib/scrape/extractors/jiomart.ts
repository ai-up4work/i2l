// lib/scrape/extractors/jiomart.ts
//
// ******************************************************************
// STATUS: scalar fields (title, brand, price, mrp, rating, review
// count, images, seller, availability, country of origin,
// manufacturer, article id, category path) are CONFIRMED — matched
// line-for-line against a real captured, fully-rendered JioMart PDP
// (Reconnect Dank Pro Wireless Neckband, slug ending
// "...-mfqic8-7622646", article id 494249502, captured 2026-09-04).
//
// Variant/option picker markup is UNCONFIRMED — the captured product
// is a single-SKU listing with no size/color picker at all, so there
// was nothing to verify a variant selector against. Two independent
// UNCONFIRMED paths are attempted below, in order:
//   1. extractJioMartVariantsFromEmbedded() — scans the page's
//      `window.__X__ = {...}` blobs (known to exist and carry real
//      structured data — see the SKIPS_GENERIC_STRUCTURED_FALLBACK
//      note below) for a product-shaped node with a child-SKU array,
//      using the same scoring approach as nykaa.ts's
//      findNykaaEmbeddedProduct(). This is the stronger candidate IF
//      JioMart's variant list is SSR'd into one of those blobs, which
//      is plausible for a React/Next storefront but not confirmed.
//   2. extractJioMartVariantsFromDom() — the original DOM-selector
//      placeholder, kept as a fallback for whichever case #1 is wrong.
// Both need correcting against a real multi-variant JioMart product
// (e.g. a clothing item with a size picker) before being trusted.
//
// KEY FINDING: a plain fetch() of this URL returns a near-empty
// pre-hydration shell (nav/footer boilerplate + a literal "Loading...”
// placeholder) — no product data at all in the static HTML. Every
// selector below only works against the RENDERED DOM (post client-side
// JS), which is why REQUIRES_RENDER_FOR_VARIANTS is true and parsers.ts
// routes 'jiomart' through the same headless-render tier as
// Meesho/Ajio (see RENDER_FALLBACK_HOSTS / RENDER_WAIT_SELECTOR there).
// The embedded-blob scan in path #1 runs against this SAME rendered
// DOM's HTML (via $.html()), not a separate pre-render fetch — by the
// time either variant path runs, hydration has already happened.
//
// The single most useful element on the page is `div.gtmEvents`: a
// GTM-tracking node carrying the product's title, brand, price, main
// image, seller, and full category path as plain `data-*` attributes
// in one place — e.g.:
//   data-name="Reconnect Dank Pro Wireless Neckband, ..."
//   data-manu="Reconnect"           data-price="299.00"
//   data-sellername="Reliance Retail"
//   data-image="https://cdn1.jiomartjcp.com/.../....jpeg"
//   data-slug="reconnect-dank-pro-wireless-neckband-...-mfqic8-7622646"
//   data-category-l1="ELECTRONICS" data-category-l2="Audio & Smart Home"
//   data-category-l3="Headphones & Earbuds" data-category-l4="Bluetooth Neckbands"
// This is used as the primary source for those fields, with dedicated
// DOM selectors (PriceContainer, rnr-avg-widget, the "Product
// Information" accordion table) filling in what gtmEvents doesn't carry
// (MRP, rating, review count, country of origin, manufacturer, return
// policy). Note gtmEvents describes only the CURRENTLY SELECTED SKU —
// it has no child-SKU list of its own, which is why variant discovery
// is a separate problem handled below rather than read off this node.
//
// TYPE-FIX NOTE: `Element` is a `domhandler` type — cheerio builds its
// DOM on top of domhandler nodes, but this cheerio version does not
// re-export `Element` from the 'cheerio' package itself. Importing it
// as `import type { Element } from 'cheerio'` fails with "Module
// '"cheerio"' has no exported member 'Element'". It must be imported
// from 'domhandler' directly instead.
// ******************************************************************

import type { CheerioAPI } from 'cheerio'
import type { Element } from 'domhandler'

import { cleanText, detectCurrencyAndClean, domainCurrency } from '../shared'

export const SITE_ID = 'jiomart' as const

export type JioMartVariantOption = {
  label: string
  price: string | null
  currencyCode: string | null
  image: string | null
  url: string | null
  selected: boolean
  outOfStock?: boolean
  stock?: number
}

export type JioMartVariantDimension = {
  dimension: string
  options: JioMartVariantOption[]
}

// CONFIRMED — see file header. The static shell has none of this data;
// only the rendered DOM does.
export const REQUIRES_RENDER_FOR_VARIANTS = true

// CONFIRMED — with no real product data in the static shell,
// parsers.ts's generic extractEmbeddedStateProduct() fallback (which
// scans every window.__X = {...} blob on the page for anything
// price/rating-shaped) was observed merging in noise from unrelated
// blobs — concretely, a spurious "0.0★" rating badge on a shell page
// where our own extractor correctly found nothing. Meesho hit the same
// problem and opted out via this flag; parsers.ts's
// SKIP_STRUCTURED_FALLBACK now includes jiomart too. Kept on even now
// that our own extractor pulls real data, since the generic scanner
// only fills fields we leave null and there's no upside to letting it
// run against this page template.
//
// Note this does NOT block extractJioMartVariantsFromEmbedded() below
// from scanning the same blobs itself — the difference is that our own
// scanner only accepts a node that scores as a plausible PRODUCT with a
// child-SKU array (see scoreJioMartVariantNode()), rather than grabbing
// the first price/rating-shaped fragment it trips over the way the
// generic fallback does.
export const SKIPS_GENERIC_STRUCTURED_FALLBACK = true

// ============================================================
// gtmEvents — the single richest structured-data source on the page
// ============================================================

/** Reads every data-* attribute off the first `div.gtmEvents` node.
 * CONFIRMED present and populated on the captured PDP. Returns null
 * only if the element itself is missing (e.g. page hasn't hydrated). */
function extractJioMartGtmData($: CheerioAPI): Record<string, string> | null {
  const el = $('div.gtmEvents').first().get(0) as Element | undefined
  if (!el || !el.attribs) return null
  return el.attribs
}

function gtm(attrs: Record<string, string> | null, key: string): string | null {
  const v = attrs?.[key]
  return v != null && v !== '' ? v : null
}

// ============================================================
// Title / Brand
// ============================================================

// CONFIRMED: the outer PDP container itself carries the full title as
// a `data-pdp-product-name` attribute — the single cleanest source,
// pre-decoded and not dependent on any inner text-node structure.
// Falls back to gtmEvents' `data-name` (identical value on the
// captured page), then to the visible title block's text.
export function extractJioMartTitle($: CheerioAPI, gtmAttrs?: Record<string, string> | null): string | null {
  const fromContainer = $('.product-description__productDescriptionPdpContainer').attr('data-pdp-product-name')
  if (fromContainer) return fromContainer.trim()

  const fromGtm = gtm(gtmAttrs ?? extractJioMartGtmData($), 'data-name')
  if (fromGtm) return fromGtm.trim()

  return cleanText($('.product-description__productTitle').first()) || null
}

// CONFIRMED: `.product-description__brands a.product-description__brandName`
// (e.g. "Reconnect"). Falls back to gtmEvents' `data-manu`.
export function extractJioMartBrand($: CheerioAPI, gtmAttrs?: Record<string, string> | null): string | null {
  const fromDom = cleanText($('a.product-description__brandName').first())
  if (fromDom) return fromDom

  return gtm(gtmAttrs ?? extractJioMartGtmData($), 'data-manu')
}

// ============================================================
// Price / MRP
// ============================================================

// CONFIRMED: `.PriceContainer__currentPrice` (e.g. "₹299"). gtmEvents'
// `data-price` (e.g. "299.00") is a clean numeric fallback with no
// currency symbol to strip, so it's tried first when present.
export function extractJioMartPriceRaw($: CheerioAPI, gtmAttrs?: Record<string, string> | null): string | null {
  const fromGtm = gtm(gtmAttrs ?? extractJioMartGtmData($), 'data-price')
  if (fromGtm) return fromGtm

  return cleanText($('.PriceContainer__currentPrice').first()) || null
}

// CONFIRMED: `.PriceContainer__originalPrice` (e.g. "₹1,499"). No
// gtmEvents equivalent was present on the captured page (it only
// carries the selling price), so this is DOM-only.
export function extractJioMartMrpRaw($: CheerioAPI): string | null {
  return cleanText($('.PriceContainer__originalPrice').first()) || null
}

// ============================================================
// Images
// ============================================================

// CONFIRMED: full-size gallery images live in
// `.product-description__slideItem picture img`, thumbnails (same
// images, smaller) in `.product-description__thumbnailContainer img`.
// gtmEvents' `data-image` supplies a reliable single primary image
// even before/without the gallery, so it's unioned in first.
export function extractJioMartImages($: CheerioAPI, gtmAttrs?: Record<string, string> | null): string[] {
  const images = new Set<string>()

  const primary = gtm(gtmAttrs ?? extractJioMartGtmData($), 'data-image')
  if (primary) images.add(primary)

  $('.product-description__slideItem img, .product-description__thumbnailContainer img').each((_, el) => {
    const src = $(el).attr('src')
    if (src) images.add(src.startsWith('//') ? `https:${src}` : src)
  })

  return [...images]
}

// ============================================================
// Rating / Reviews
// ============================================================

// CONFIRMED: the small rating widget directly under the title
// (`#rnr-avg-widget`) carries the average as plain text (e.g. "3.5")
// and the count in parens right after it (e.g. "(866)"). The larger
// "Ratings & Reviews" section further down repeats the same average in
// a bigger font — same value, so the compact widget is preferred as
// the single, unambiguous match.
export function extractJioMartRating($: CheerioAPI): string | null {
  return cleanText($('#rnr-avg-widget .fe-text-primary-grey-100').first()) || null
}

export function extractJioMartReviewCount($: CheerioAPI): string | null {
  const raw = cleanText($('#rnr-avg-widget .fe-text-primary-grey-80').first())
  return raw ? raw.replace(/[()]/g, '').trim() || null : null
}

// ============================================================
// "Product Information" accordion table — Sold By, Country of Origin,
// Manufacturer, Article ID, etc.
// ============================================================

// CONFIRMED: a plain 2-column `<table>` inside
// `.product-description__productInfoContent`, one label/value pair per
// row (Brand, Sold By, Country of Origin, Manufacturer Name,
// Manufacturer Address, Article ID, Products Inside Kit — the exact
// row set varies by product/category, so this is read generically by
// label text rather than assuming a fixed row order or count).
function extractJioMartProductDetailsTable($: CheerioAPI): Record<string, string> {
  const details: Record<string, string> = {}

  $('.product-description__productInfoContent table tbody tr').each((_, tr) => {
    const cells = $(tr).find('td')
    if (cells.length < 2) return
    const label = cleanText(cells.eq(0))
    const value = cleanText(cells.eq(1))
    if (label) details[label] = value ?? ''
  })

  return details
}

// CONFIRMED: "Sold By" row in the details table (e.g. "Reliance Retail
// Limited") is the accurate seller name; gtmEvents' `data-sellername`
// is a shorter version of the same thing ("Reliance Retail") used as a
// fallback when the table row is absent.
export function extractJioMartSeller(
  $: CheerioAPI,
  details?: Record<string, string>,
  gtmAttrs?: Record<string, string> | null
): string | null {
  const table = details ?? extractJioMartProductDetailsTable($)
  return table['Sold By'] || gtm(gtmAttrs ?? extractJioMartGtmData($), 'data-sellername')
}

// ============================================================
// Availability
// ============================================================

// CONFIRMED: an enabled `button.product-description__addToCartButton`
// (there are two on the page — one inline, one in the sticky bottom
// bar) is present whenever the item can be bought. No disabled/sold-out
// state was present on the captured page to confirm what that looks
// like, so this only asserts "available" when it finds a genuinely
// enabled button, and stays silent (no unavailable flag) rather than
// guessing at an unconfirmed sold-out marker.
export function isJioMartAvailable($: CheerioAPI): boolean {
  const buttons = $('button.product-description__addToCartButton')
  if (!buttons.length) return false
  return buttons.toArray().some((el) => $(el).attr('disabled') == null && $(el).attr('aria-disabled') !== 'true')
}

function applyUnavailableFlags($: CheerioAPI, result: Record<string, any>) {
  // Don't trust the availability check at all when we don't even have a
  // title — that means this is (most likely) still the pre-hydration
  // shell, not a page we've actually parsed real product content from.
  if (!result.title) return

  const buttons = $('button.product-description__addToCartButton')
  if (!buttons.length) return // no signal either way — don't guess

  if (!isJioMartAvailable($)) {
    result.availability = result.availability || 'Out of stock'
    result._jiomartUnavailable = true
    result._jiomartWarning =
      'No enabled Add to Cart button was found — likely a genuinely unavailable product, not a scraper error.'
  }
}

// ============================================================
// Selected option summary (used by SITE_OPTIONS_EXTRACTORS in
// parsers.ts — kept intentionally lightweight, same role as
// extractMyntraOptions/extractAmazonOptions)
// ============================================================

// UNCONFIRMED — placeholder selector, see variant-picker note below.
// Prefers whatever the embedded-blob path (if it ran) marked selected,
// since that's keyed off the actual SKU id rather than a CSS class that
// may not survive a template change; falls back to the DOM guess.
export function extractJioMartOptions(
  $: CheerioAPI,
  variants?: JioMartVariantDimension[]
): Record<string, string> | null {
  if (variants?.length) {
    const options: Record<string, string> = {}
    for (const dim of variants) {
      const sel = dim.options.find((o) => o.selected)
      if (sel) options[dim.dimension] = sel.label
    }
    if (Object.keys(options).length) return options
  }

  const selected = cleanText(
    $('button[class*="variant"][class*="selected"], div[class*="Pack"] button[aria-selected="true"]').first()
  )
  return selected ? { Variant: selected } : null
}

// ============================================================
// Variant dimensions — UNCONFIRMED (see file header: the captured
// product was single-SKU with no picker at all). Two independent
// paths, tried in order; the first one that yields anything wins.
// ============================================================

// ---- Path 1: embedded window.__X__ blob scan --------------------------
//
// Modeled on nykaa.ts's findNykaaEmbeddedProduct()/scoreProductNode():
// collect every `window.__SOMETHING__ = {...}` assignment and every
// `<script type="application/json">` blob on the (already-rendered)
// page, then walk them looking for a node that scores as a plausible
// product record WITH a child-SKU array. This is deliberately more
// conservative than parsers.ts's generic embedded-state fallback (see
// the SKIPS_GENERIC_STRUCTURED_FALLBACK note above on why that scanner
// isn't trusted here) — a node only counts if it has a name/price-ish
// field AND an array of child options, not just anything price-shaped.

type JioMartEmbeddedNode = Record<string, any>

const VARIANT_NAME_KEYS = ['name', 'title', 'productName', 'displayName']
const VARIANT_PRICE_KEYS = ['price', 'sellingPrice', 'finalPrice', 'offerPrice']
const VARIANT_CHILD_KEYS = ['variants', 'variantList', 'skus', 'childProducts', 'options', 'variantOptions']
const VARIANT_LABEL_KEYS = ['variantName', 'optionValue', 'size', 'sizeName', 'color', 'colour', 'label', 'name', 'title']
const VARIANT_SLUG_KEYS = ['slug', 'url', 'productUrl', 'permalink']
const VARIANT_ID_KEYS = ['id', 'skuId', 'productId', 'sku']

function firstKeyValue(node: Record<string, any>, keys: string[]): any {
  for (const k of keys) {
    if (node[k] != null && node[k] !== '') return node[k]
  }
  return null
}

function numericFrom(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  if (typeof v === 'string') {
    const m = v.replace(/,/g, '').match(/\d+(?:\.\d+)?/)
    return m ? m[0] : null
  }
  return null
}

function extractBalancedBraces(text: string, startIdx: number): string | null {
  let depth = 0
  const limit = Math.min(text.length, startIdx + 3_000_000)
  for (let i = startIdx; i < limit; i++) {
    const ch = text[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(startIdx, i + 1)
    }
  }
  return null
}

function collectJioMartCandidateBlobs($: CheerioAPI, html: string): any[] {
  const blobs: any[] = []

  $('script[type="application/json"]').each((_, el) => {
    const raw = $(el).html()
    if (!raw) return
    try {
      blobs.push(JSON.parse(raw))
    } catch {
      // not valid JSON — skip
    }
  })

  const assignRe = /window\.(__[A-Za-z0-9_]+__?)\s*=\s*\{/g
  let m: RegExpExecArray | null
  let count = 0
  while ((m = assignRe.exec(html)) && count < 10) {
    count++
    const start = m.index + m[0].length - 1
    const objText = extractBalancedBraces(html, start)
    if (!objText) continue
    try {
      blobs.push(JSON.parse(objText))
    } catch {
      // unquoted keys / embedded function refs — skip
    }
  }

  return blobs
}

// A node only counts as a product-with-variants if it has a
// name-or-price signal AND a non-empty child-option array — the child
// array is required (not just weighted), unlike nykaa.ts's scorer,
// specifically so this can't win against noise the way the generic
// fallback did (see file header). If nothing on the page has this
// shape, this path correctly returns nothing and DOM fallback takes over.
function scoreJioMartVariantNode(node: Record<string, any>): number {
  const children = firstKeyValue(node, VARIANT_CHILD_KEYS)
  if (!Array.isArray(children) || children.length < 2) return 0
  let s = 2
  if (firstKeyValue(node, VARIANT_NAME_KEYS) != null) s += 1
  if (firstKeyValue(node, VARIANT_PRICE_KEYS) != null) s += 1
  return s
}

function findJioMartVariantNode($: CheerioAPI, html: string): JioMartEmbeddedNode | null {
  const blobs = collectJioMartCandidateBlobs($, html)
  const seen = new Set<any>()
  let best: JioMartEmbeddedNode | null = null
  let bestScore = 0

  function walk(node: any, depth: number) {
    if (!node || typeof node !== 'object' || depth > 14 || seen.has(node)) return
    seen.add(node)
    if (!Array.isArray(node)) {
      const s = scoreJioMartVariantNode(node)
      if (s > bestScore) {
        best = node
        bestScore = s
      }
    }
    for (const val of Object.values(node)) {
      if (val && typeof val === 'object') walk(val, depth + 1)
    }
  }

  for (const blob of blobs) walk(blob, 0)
  return best
}

function jioMartVariantDimensionName(children: JioMartEmbeddedNode[], node: JioMartEmbeddedNode): string {
  const declared =
    (typeof node.variantType === 'string' && node.variantType) ||
    (typeof node.optionName === 'string' && node.optionName) ||
    null
  if (declared) return declared

  const sample = children[0]
  if (sample) {
    for (const k of ['size', 'sizeName']) if (sample[k] != null) return 'Size'
    for (const k of ['color', 'colour']) if (sample[k] != null) return 'Color'
  }
  return 'Options'
}

function jioMartVariantUrl(child: JioMartEmbeddedNode): string | null {
  const raw = firstKeyValue(child, VARIANT_SLUG_KEYS)
  if (typeof raw !== 'string' || !raw.trim()) return null
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
  if (raw.startsWith('//')) return `https:${raw}`
  return `https://www.jiomart.com${raw.startsWith('/') ? '' : '/'}${raw}`
}

// Matches by whichever id/slug field the current page URL actually
// contains, same reasoning as nykaa.ts's selectedSkuMatches() — a
// child SKU's own id is not assumed to equal the parent node's id
// without checking, since those are frequently different id spaces.
function jioMartVariantSelected(child: JioMartEmbeddedNode, siblings: JioMartEmbeddedNode[], pageUrl: string): boolean {
  const candidates = VARIANT_ID_KEYS.map((k) => child[k])
    .concat(VARIANT_SLUG_KEYS.map((k) => child[k]))
    .filter((v) => v != null && v !== '')
  for (const c of candidates) {
    if (pageUrl.includes(String(c))) return true
  }
  return siblings.length === 1
}

function extractJioMartVariantsFromEmbedded($: CheerioAPI, url: string): JioMartVariantDimension[] {
  const html = $.html()
  const node = findJioMartVariantNode($, html)
  if (!node) return []

  const children = firstKeyValue(node, VARIANT_CHILD_KEYS)
  if (!Array.isArray(children) || !children.length) return []

  const currencyCode = (typeof node.currencyCode === 'string' && node.currencyCode) || 'INR'

  const options: JioMartVariantOption[] = children
    .filter((c: any) => c && typeof c === 'object')
    .map((child: JioMartEmbeddedNode) => {
      const label = (firstKeyValue(child, VARIANT_LABEL_KEYS) as string | null) ?? 'Unknown'
      const price = numericFrom(firstKeyValue(child, VARIANT_PRICE_KEYS))

      let outOfStock = false
      if (typeof child.inStock === 'boolean') outOfStock = !child.inStock
      else if (typeof child.available === 'boolean') outOfStock = !child.available
      else if (typeof child.outOfStock === 'boolean') outOfStock = child.outOfStock
      else if (typeof child.stock === 'number') outOfStock = child.stock <= 0

      const img = child.image || child.imageUrl || null

      return {
        label: typeof label === 'string' ? label : String(label),
        price,
        currencyCode,
        image: typeof img === 'string' ? (img.startsWith('//') ? `https:${img}` : img) : null,
        url: jioMartVariantUrl(child),
        selected: jioMartVariantSelected(child, children, url),
        outOfStock,
        stock: typeof child.stock === 'number' ? child.stock : undefined,
      }
    })

  if (!options.length) return []
  return [{ dimension: jioMartVariantDimensionName(children, node), options }]
}

// ---- Path 2: DOM selector placeholder (original, unchanged) ----------
//
// Kept as-is: a best-effort placeholder using the same
// `.product-description__` class prefix convention confirmed
// everywhere else on this page template. Runs only when path 1 finds
// nothing (either because the embedded blob genuinely doesn't carry
// variants, or because it uses key names not yet in the VARIANT_*_KEYS
// lists above).

function extractJioMartVariantsFromDom($: CheerioAPI): JioMartVariantDimension[] {
  const dimensions: JioMartVariantDimension[] = []

  $('div[class*="variant-group"], div[class*="VariantGroup"]').each((_, groupEl) => {
    const $group = $(groupEl)
    const dimensionName =
      cleanText($group.find('p[class*="variant-label"], span[class*="VariantLabel"]').first()) || 'Options'

    const options: JioMartVariantOption[] = []

    $group.find('button, a').each((_, el) => {
      const $el = $(el)
      const label = cleanText($el)
      if (!label) return

      const selected =
        $el.hasClass('selected') || $el.hasClass('active') || $el.attr('aria-selected') === 'true'
      const outOfStock = $el.hasClass('disabled') || $el.attr('disabled') != null

      options.push({
        label,
        price: null,
        currencyCode: null,
        image: null,
        url: null, // UNCONFIRMED: no reliable per-variant href pattern known yet
        selected,
        outOfStock,
      })
    })

    if (options.length) dimensions.push({ dimension: dimensionName, options })
  })

  return dimensions
}

function extractJioMartAllVariants($: CheerioAPI, url: string): JioMartVariantDimension[] {
  const embedded = extractJioMartVariantsFromEmbedded($, url)
  if (embedded.length) return embedded
  return extractJioMartVariantsFromDom($)
}

// ============================================================
// Build result
// ============================================================

function buildResult(
  $: CheerioAPI,
  url: string,
  domainHint: string | null
): Record<string, any> {
  const gtmAttrs = extractJioMartGtmData($)
  const details = extractJioMartProductDetailsTable($)

  const title = extractJioMartTitle($, gtmAttrs)
  const brand = extractJioMartBrand($, gtmAttrs)

  const priceRaw = extractJioMartPriceRaw($, gtmAttrs)
  const { amount, code } = detectCurrencyAndClean(priceRaw, domainHint)

  const mrpRaw = extractJioMartMrpRaw($)
  const { amount: mrpAmount } = detectCurrencyAndClean(mrpRaw, domainHint)

  const variants = extractJioMartAllVariants($, url)

  const result: Record<string, any> = {
    title,
    brand,
    price: amount,
    mrp: mrpAmount,
    currencyCode: code,
    rating: extractJioMartRating($),
    review_count: extractJioMartReviewCount($),
    availability: null,
    seller: extractJioMartSeller($, details, gtmAttrs),
    images: extractJioMartImages($, gtmAttrs),
  }

  // CONFIRMED extra fields — same "surface what the extractor already
  // has but the UI never showed" philosophy as Myntra's
  // countryOfOrigin/manufacturer/myntraStyleId fields.
  const countryOfOrigin = details['Country of Origin'] || null
  const manufacturer = details['Manufacturer Name']
    ? details['Manufacturer Address']
      ? `${details['Manufacturer Name']}, ${details['Manufacturer Address']}`
      : details['Manufacturer Name']
    : null
  const articleId = details['Article ID'] || gtm(gtmAttrs, 'data-id') || null
  const categoryPath = [
    gtm(gtmAttrs, 'data-category-l1'),
    gtm(gtmAttrs, 'data-category-l2'),
    gtm(gtmAttrs, 'data-category-l3'),
    gtm(gtmAttrs, 'data-category-l4'),
  ]
    .filter(Boolean)
    .join(' > ')

  if (countryOfOrigin) result.countryOfOrigin = countryOfOrigin
  if (manufacturer) result.manufacturer = manufacturer
  if (articleId) result.jiomartArticleId = articleId
  if (categoryPath) result.categoryPath = categoryPath

  const returnPolicy = cleanText($('.product-description__returnPolicyTitle').first())
  if (returnPolicy) result.jiomartReturnPolicy = returnPolicy

  const options = extractJioMartOptions($, variants)
  if (options) result.options = options
  if (variants.length) result.variants = variants

  applyUnavailableFlags($, result)

  return result
}

// ============================================================
// Entry point
// ============================================================

export function parseJioMart($: CheerioAPI, url: string) {
  const domainHint = domainCurrency(url)
  return buildResult($, url, domainHint)
}

// ============================================================
// Consume JioMart metadata
// ============================================================

export function consumeJioMartMeta(parsed: Record<string, any>): { warning?: string; unavailable?: boolean } {
  const warning = parsed._jiomartWarning as string | undefined
  const unavailable = parsed._jiomartUnavailable as boolean | undefined

  delete parsed._jiomartWarning
  delete parsed._jiomartUnavailable

  return { warning, unavailable }
}