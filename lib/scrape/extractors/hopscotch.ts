// lib/scrape/extractors/hopscotch.ts
import * as cheerio from 'cheerio'
import type { CheerioAPI } from 'cheerio'
import { cleanText } from '../shared'
// (fetchRendered is imported dynamically inside fetchHopscotchSizeChartTable
// below, not here — see that function's doc comment for why.)

// ---------------------------------------------------------------------
// Hopscotch (www.hopscotch.in) product-page extractor.
//
// Deliberately NO paid/external service tier here — this is fetch +
// cheerio only, same shape as Ajio's tier-2 path, minus Ajio's tier-1
// (Parse.bot) and tier-3 (TLS-fingerprint proxy).
//
// MAJOR UPDATE (confirmed against a real captured PDP, Sept 2026): this
// site is Next.js SSR, and every product page embeds a
// `<script id="__NEXT_DATA__" type="application/json">` tag containing
// the full server-rendered data the page was built from — including
// per-size stock counts, per-size pricing, a `soldOut` flag, brand, the
// complete image list, and (see UPDATE 2 below) the raw HTML behind the
// "Item details" and "More Info" accordions. This is the real backend
// product record, not a DOM guess, and it's present in the plain
// fetched HTML with no JS execution required. parseNextDataProduct()
// below reads it and is now the PRIMARY extraction path; the older
// DOM/text-based functions (extractTitle, extractPrice, etc.) are kept
// only as a fallback for the rare case this script tag is missing,
// malformed, or restructured by a future deploy.
//
// Two corrections from an earlier pass over this same captured page,
// worth flagging explicitly since they reverse prior assumptions:
//   1. Sizes do NOT require client-side hydration to obtain. The
//      visible "Select a size" dropdown only populates its option list
//      after a click, true — but the SAME data (every size, its stock
//      count, its price) is already sitting in __NEXT_DATA__ before any
//      JS runs. REQUIRES_RENDER_FOR_VARIANTS is therefore now `false`.
//   2. There is no genuine struck-through "MRP vs discounted price" on
//      this PDP. The visible "MRP: ₹1,445" label is literally the
//      actual sale price (`data.retailPrice`). The separate "Best price
//      ₹1386. You save ₹59." text is a CONDITIONAL bank-card offer —
//      it doesn't even appear anywhere in __NEXT_DATA__, meaning it's
//      computed by a separate offers widget, not the base checkout
//      price. An earlier version of this file used that promo text as
//      `price`, which was wrong for the same reason it would be wrong
//      to report Amazon's "extra 5% with ICICI card" banner as an
//      item's real price. `mrp` stays null here; see PRICE / MRP below.
//
// UPDATE 2 (this pass): the SAME captured page also carries
// `data.productDesc` and `data.moreInfo` — raw HTML strings that are
// the literal source for the "Item details" and "More Info" accordions
// rendered in the DOM. These were previously read nowhere in this file
// despite already being present in the JSON we were already parsing.
// htmlFragmentToText() below strips them down to plain text so they can
// ride through ScrapeResult the same way every other text field does.
//
// rating, review_count, and seller are STILL unconfirmed — neither the
// DOM nor __NEXT_DATA__ carried anything resembling them on this
// captured page.
//
// Size chart: `data.hasSizeChart` confirms whether one exists, but its
// actual row data (Size/Age/Chest/Length) is NOT included in this
// payload — no `imgurls[]` entry had `isSizeChart: true` here, and no
// key in the product node carries chart rows. On the captured page the
// chart only exists in the DOM, inside a modal that mounts after the
// "View size chart" button is clicked — i.e. it's genuine client-side
// state, not SSR'd content and not a JSON blob sitting somewhere
// unread. extractSizeChartFromDom() below will read that modal's table
// IF it's present in the HTML handed to parseHopscotch(), but a plain
// fetch() (and the current render-tier config, which skips itself
// whenever __NEXT_DATA__ already resolved — see
// hasHydratedHopscotchMarkup()'s doc comment below) will never actually
// produce HTML with that modal open. Getting real size-chart data
// requires a render step that clicks the "View size chart" trigger and
// waits for the modal's table selector before snapshotting the page —
// that's a change to lib/scrape/browser-fetch.ts, not to this file. See
// this file's bottom-of-file NOTE for the exact hook needed there.
// ---------------------------------------------------------------------

export const SITE_ID = 'hopscotch' as const

// CONFIRMED false: __NEXT_DATA__ carries full per-size stock and price
// data in the static HTML — no client-side hydration is needed to get
// real variant data on this site. See header comment.
export const REQUIRES_RENDER_FOR_VARIANTS = false

export type HopscotchVariantOption = {
  label: string
  price: string | null
  currencyCode: string | null
  image: string | null
  url: string | null
  selected: boolean
  outOfStock: boolean
}

export type HopscotchVariantDimension = {
  dimension: string
  options: HopscotchVariantOption[]
}

// New: a plain row/column table, same shape regardless of source
// (DOM-scraped modal today; could be re-sourced from a dedicated JSON
// endpoint later without changing this shape — see header comment on
// the "VIEW SIZE CHART" network request that isn't wired up yet).
export type HopscotchSizeChartTable = {
  title?: string | null
  headers: string[]
  rows: string[][]
}

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
  // New: sourced from __NEXT_DATA__'s simpleSkus when present. Shape
  // matches ScrapeResult's existing AmazonVariantDimension[] structurally
  // (dimension/options with label/price/currencyCode/image/url/selected/
  // outOfStock), so it passes straight through parsers.ts's `...parsed`
  // spread into ScrapeResult.variants without any extra wiring needed.
  variants?: HopscotchVariantDimension[]
  // New: true when __NEXT_DATA__ confirms a size chart exists for this
  // product — NOT the chart itself, see header comment.
  hasSizeChart?: boolean
  // New: only populated when hasSizeChart is true AND the size-chart
  // modal's table happened to already be present in the HTML handed to
  // parseHopscotch() (see extractSizeChartFromDom()'s doc comment for
  // why that won't be true from a plain fetch today). Deliberately a
  // distinct field from ScrapeResult.sizeChart's existing
  // Amazon/Myntra union — add HopscotchSizeChartTable to that union in
  // parsers.ts to surface this through the normal field instead of
  // leaving it Hopscotch-only.
  sizeChart?: HopscotchSizeChartTable[] | null
  // New: plain-text renditions of __NEXT_DATA__'s productDesc/moreInfo
  // HTML fields — the literal source of the "Item details" and
  // "More Info" accordions. See UPDATE 2 in the header comment.
  description?: string | null
  moreInfo?: string | null
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

function normalizeUrl(src: string): string {
  return src.startsWith('//') ? `https:${src}` : src
}

function firstUrlFromSrcset(srcset: string): string | null {
  const first = srcset.split(',')[0]?.trim().split(' ')[0]
  return first || null
}

// Strips a raw HTML fragment (e.g. __NEXT_DATA__'s productDesc/moreInfo
// strings, which are themselves HTML — <p>, <ul>, <b>, etc.) down to
// plain, whitespace-collapsed text. Loading into a fresh cheerio
// instance rather than regex-stripping tags, since these fragments can
// contain nested lists and bold labels we still want space-separated
// rather than jammed together.
function htmlFragmentToText(html: string | null | undefined): string | null {
  if (!html) return null
  const $$ = cheerio.load(`<div id="root">${html}</div>`)
  const text = $$('#root').text().replace(/\s+/g, ' ').trim()
  return text || null
}

// =======================================================================
// PRIMARY PATH: __NEXT_DATA__ JSON (confirmed against a real captured PDP)
// =======================================================================

type HopscotchSkuAttr = { name: string; value: string }

type HopscotchSku = {
  productName?: string
  skuId?: string
  retailPrice?: number
  regularPrice?: number
  availableQuantity?: number
  deliveryMsg?: string
  attrs?: HopscotchSkuAttr[]
}

type HopscotchImgUrl = {
  imgUrl?: string
  imgUrlLarge?: string
  imgUrlFull?: string
  isSizeChart?: boolean
}

type HopscotchNextDataProduct = {
  id?: number
  crmProductName?: string
  brandName?: string
  retailPrice?: number
  soldOut?: boolean
  hasSizeChart?: boolean
  imgurls?: HopscotchImgUrl[]
  simpleSkus?: HopscotchSku[]
  // New: raw HTML source for the "Item details" / "More Info"
  // accordions — see UPDATE 2 in the header comment.
  productDesc?: string
  moreInfo?: string
}

function skuAttrValue(sku: HopscotchSku, name: string): string | null {
  const attr = sku.attrs?.find((a) => a.name === name)
  return attr ? attr.value : null
}

// Locates and parses `#__NEXT_DATA__`, then walks
// props.pageProps.dehydratedState.queries[] looking for the entry whose
// cached data is the actual product record (identified by the
// presence of `simpleSkus`, rather than assuming a fixed queries[0]
// index — dehydratedState can carry more than one cached query).
function findHopscotchNextDataProduct($: CheerioAPI): HopscotchNextDataProduct | null {
  const raw = $('#__NEXT_DATA__').html()
  if (!raw) return null

  let parsed: any
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  const queries = parsed?.props?.pageProps?.dehydratedState?.queries
  if (!Array.isArray(queries)) return null

  for (const q of queries) {
    const data = q?.state?.data
    if (data && Array.isArray(data.simpleSkus) && data.simpleSkus.length) {
      return data as HopscotchNextDataProduct
    }
  }

  return null
}

function imagesFromNextData(product: HopscotchNextDataProduct): string[] {
  const imgs = product.imgurls
  if (!imgs || !imgs.length) return []
  return imgs
    .filter((i) => !i.isSizeChart)
    .map((i) => i.imgUrlFull || i.imgUrlLarge || i.imgUrl)
    .filter((u): u is string => !!u)
    .map(normalizeUrl)
}

// Builds a single "Size" dimension from simpleSkus. Each SKU already
// carries its own price (uniform across sizes on the captured page,
// but read per-SKU here rather than assumed, in case a future product
// genuinely does vary price by size) and stock count.
function variantsFromNextData(product: HopscotchNextDataProduct): HopscotchVariantDimension[] | null {
  const skus = product.simpleSkus
  if (!skus || !skus.length) return null

  const options: HopscotchVariantOption[] = skus.map((sku) => {
    const label = skuAttrValue(sku, 'Size') ?? sku.productName ?? 'Unknown'
    const outOfStock = (sku.availableQuantity ?? 0) <= 0
    return {
      label,
      price: sku.retailPrice != null ? String(sku.retailPrice) : null,
      currencyCode: 'INR',
      image: null,
      url: null,
      selected: false,
      outOfStock,
    }
  })

  return [{ dimension: 'Size', options }]
}

// =======================================================================
// SIZE CHART: best-effort DOM extraction (see header comment — this
// will only find anything if the size-chart modal is already present
// in the HTML handed in, which a plain static fetch will not produce).
// =======================================================================

// Finds the "SIZE CHART" modal heading, then walks a few ancestor
// levels up looking for the nearest <table> — matched by heading text
// rather than a class name, since this site's classes are CSS-module
// hashes (e.g. `css-qpdlxe`) that aren't stable hooks.
//
// Exported (not just used internally by parseHopscotch()) so
// fetchHopscotchSizeChartTable() below can re-run it against a SECOND,
// render-tier fetch whose HTML actually has the modal open — see that
// function's doc comment for why a first-pass static fetch never will.
export function extractSizeChartFromDom($: CheerioAPI): HopscotchSizeChartTable[] | null {
  let table: ReturnType<CheerioAPI> | null = null

  $('*').each((_, el) => {
    if (table) return
    const text = cleanText($(el))
    if (text && /^size\s*chart$/i.test(text)) {
      let ancestor = $(el).parent()
      for (let i = 0; i < 6 && ancestor.length && !table; i++) {
        const found = ancestor.find('table').first()
        if (found.length) table = found
        ancestor = ancestor.parent()
      }
    }
  })

  if (!table || !(table as ReturnType<CheerioAPI>).length) return null
  const $table = table as ReturnType<CheerioAPI>

  const headers: string[] = []
  const rows: string[][] = []
  $table.find('tr').each((rowIdx, tr) => {
    const cells: string[] = []
    $(tr)
      .find('td, th')
      .each((_, cell) => {
        cells.push(cleanText($(cell)) ?? '')
      })
    if (!cells.length) return
    if (rowIdx === 0 && !headers.length) headers.push(...cells)
    else rows.push(cells)
  })

  if (!headers.length && !rows.length) return null
  return [{ title: 'Size Chart', headers, rows }]
}

// =======================================================================
// FALLBACK PATH: DOM / text-based extraction (used only if __NEXT_DATA__
// is missing or unparseable). CONFIRMED against the same captured page
// for what's actually reachable this way — mainly title and the single
// displayed price. See header comment for why price here maps to the
// "MRP:" labeled value rather than the "Best price ₹X" promo text.
// =======================================================================

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

const MRP_LABEL_RE = /^MRP\s*:?$/i

// Finds the "MRP:" label span and reads its adjacent value span. On
// this site that value is the actual sale price (see header comment),
// so this feeds extractPrice(), not extractMrp().
function extractLabeledPrice($: CheerioAPI): string | null {
  let value: string | null = null
  $('span, div').each((_, el) => {
    if (value) return
    const text = cleanText($(el))
    if (text && MRP_LABEL_RE.test(text)) {
      const siblingText = cleanText($(el).next())
      const num = extractPriceNumber(siblingText)
      if (num) value = num
    }
  })
  return value
}

function extractPrice($: CheerioAPI): string | null {
  const labeled = extractLabeledPrice($)
  if (labeled) return labeled

  // Unconfirmed fallback guesses, kept in case a page variant exposes
  // an actual dedicated selling-price element instead of the MRP-
  // labeled value.
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
  // UNCONFIRMED — no genuine struck-through original price was found
  // on the captured page; the "MRP:" label there is the sale price
  // itself (see extractPrice/extractLabeledPrice). Left as guesses for
  // product pages that may show a real markdown.
  const raw = firstText($, [
    '[class*="mrp"]',
    '[class*="strike-price"]',
    '[class*="original-price"]',
    'strike',
    'del',
  ])
  return extractPriceNumber(raw)
}

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
  // CSS-module hashes and unusable as a hook on this site.
  let hasAddToCartButton = false
  $('button').each((_, el) => {
    if (hasAddToCartButton) return
    const t = (cleanText($(el)) ?? '').toUpperCase()
    if (t === 'ADD TO CART' || t === 'BUY NOW') hasAddToCartButton = true
  })
  if (hasAddToCartButton) return { availability: 'In stock', unavailable: false }

  return { availability: null, unavailable: false }
}

function extractSeller($: CheerioAPI): string | null {
  return firstText($, ['[class*="seller-name"]', '[class*="sold-by"]'])
}

function extractImages($: CheerioAPI): string[] {
  const urls = new Set<string>()

  $('[id^="carousel-"] img, [id^="carousel-"] noscript').each((_, el) => {
    if (el.tagName === 'noscript') {
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

// UNCONFIRMED — kept for parsers.ts's SITE_OPTIONS_EXTRACTORS-style call
// pattern (a currently-*selected* option, not the full list). This site
// has no default size selection until the user picks one, so this
// legitimately returns null on a fresh PDP load; the full pickable list
// with stock is now available via variantsFromNextData() instead.
export function extractHopscotchOptions($: CheerioAPI): Record<string, string> | null {
  const options: Record<string, string> = {}

  const selectedSize = firstText($, [
    '[class*="size-selector"] [class*="selected"]',
    '[class*="size-list"] [class*="active"]',
    '[class*="size"][class*="selected"]',
  ])
  if (selectedSize) options.Size = selectedSize

  return Object.keys(options).length ? options : null
}

// ---------- main parser ----------

export function parseHopscotch($: CheerioAPI, _url: string): HopscotchParsed {
  const nextDataProduct = findHopscotchNextDataProduct($)

  // Attempted regardless of which path (NEXT_DATA vs fallback) supplies
  // the rest of the fields — the size-chart modal, if present at all in
  // this HTML, is DOM-only and unrelated to __NEXT_DATA__'s presence.
  // See extractSizeChartFromDom()'s doc comment for why this is usually
  // null from a plain static fetch.
  const domSizeChart = extractSizeChartFromDom($)

  if (nextDataProduct) {
    const title = nextDataProduct.simpleSkus?.[0]?.productName ?? nextDataProduct.crmProductName ?? null
    const brand = nextDataProduct.brandName ?? null
    const price = nextDataProduct.retailPrice != null ? String(nextDataProduct.retailPrice) : null
    const images = imagesFromNextData(nextDataProduct)
    const variants = variantsFromNextData(nextDataProduct) ?? undefined
    const availability =
      nextDataProduct.soldOut === true ? 'Out of stock' : nextDataProduct.soldOut === false ? 'In stock' : null
    const hasSizeChart = nextDataProduct.hasSizeChart === true
    const description = htmlFragmentToText(nextDataProduct.productDesc)
    const moreInfo = htmlFragmentToText(nextDataProduct.moreInfo)

    const result: HopscotchParsed = {
      title,
      brand,
      // No genuine MRP on this PDP — see header comment. `price` is
      // the real sale price straight from the backend record.
      price,
      mrp: null,
      currencyCode: 'INR',
      // Not present in __NEXT_DATA__ either — still DOM guesses.
      rating: extractRating($),
      review_count: extractReviewCount($),
      availability,
      seller: extractSeller($),
      images: images.length ? images : extractImages($),
      variants,
      hasSizeChart,
      sizeChart: hasSizeChart ? domSizeChart : null,
      description,
      moreInfo,
    }

    if (nextDataProduct.soldOut === true) {
      result._hopscotchUnavailable = true
    }
    if (!title && !price) {
      result._hopscotchWarning =
        '__NEXT_DATA__ was found and parsed but neither a product name nor a retail price was present in it — the page may be a non-product page, or Hopscotch may have restructured this payload.'
    } else if (hasSizeChart && !domSizeChart) {
      // Informational, not a data-quality problem with this parse —
      // just tells a QA reviewer why sizeChart is null despite
      // hasSizeChart being true. See header comment: this needs a
      // render step that clicks "View size chart" before it can ever
      // be non-null from this extractor.
      result._hopscotchWarning =
        'hasSizeChart is true but no size-chart table was found in the fetched HTML — this site only renders the chart into the DOM after the "View size chart" button is clicked client-side, so a plain fetch (or a render pass that doesn\'t perform that click) will not have it.'
    }

    return result
  }

  // Fallback: __NEXT_DATA__ missing or unparseable — DOM/text guesses.
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
    currencyCode: 'INR',
    rating,
    review_count,
    availability,
    seller,
    images,
    sizeChart: domSizeChart,
  }

  if (unavailable) {
    result._hopscotchUnavailable = true
  }

  if (!title && !price) {
    result._hopscotchWarning =
      '__NEXT_DATA__ was not found or could not be parsed, and neither title nor price matched any known Hopscotch DOM selector either — the page structure may have changed, or the request was blocked/captcha\'d. Send a fresh captured PDP to re-tighten these selectors.'
  }

  return result
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
// Used by parsers.ts's STATIC_CONTENT_SUFFICIENT. Now checks for
// __NEXT_DATA__ with a usable product record first (the strong,
// confirmed signal), falling back to the older title-or-price DOM
// check only if that's absent. In practice this should almost always
// return true for genuine PDPs, since __NEXT_DATA__ carries everything
// needed for price/title/variants without any client-side hydration.
//
// IMPORTANT CAVEAT (new): this function answers "is there enough here
// to skip straight to the direct-fetch tier", which is exactly right
// for price/title/variants but WRONG for the size-chart modal — that
// modal is never in __NEXT_DATA__ and never in a plain fetch's HTML
// regardless of hydration state (see extractSizeChartFromDom()'s doc
// comment). Returning true here means parsers.ts's
// fetchDirectWithRetries() never even attempts the render tier for
// Hopscotch today, so a click-and-wait step added to
// lib/scrape/browser-fetch.ts (see this file's bottom-of-file NOTE)
// would currently never fire. If/when that render step exists, either
// gate this function's true-on-NEXT_DATA shortcut behind a "size chart
// not required" flag, or have parsers.ts call the render tier
// unconditionally for Hopscotch when hasSizeChart is true regardless of
// what this function returns.
export function hasHydratedHopscotchMarkup(html: string): boolean {
  const $ = cheerio.load(html)
  if (findHopscotchNextDataProduct($)) return true
  return !!(extractTitle($) || extractPrice($))
}

// =======================================================================
// SIZE CHART: click-and-refetch tier
//
// This is the actual fix for sizeChart coming back null. It's a SECOND,
// separate render-tier fetch — issued by parsers.ts only after the
// normal (fast, cheap) direct fetch has already run and confirmed
// hasSizeChart is true but sizeChart is still null — not a change to
// the main fetch pipeline. Every other Hopscotch field (price, title,
// variants, description, moreInfo) is already fully available from the
// cheap static fetch; only the chart table needs this expensive path,
// so it's kept opt-in and conditional rather than folded into the
// normal RENDER_FALLBACK_HOSTS flow that runs unconditionally for
// every request to this site.
// =======================================================================

// Minimal structural type for the one Playwright Page method this hook
// needs. Deliberately NOT importing `Page` from 'playwright-core' here
// — this module is otherwise a pure cheerio/HTML parser with no browser
// dependency, and pulling in playwright-core's types (and, transitively,
// making this module harder to bundle into environments that don't want
// a browser-automation dependency at all) for one method call isn't
// worth it. Playwright's real Page satisfies this structurally.
type MinimalPage = {
  getByText: (
    text: string | RegExp,
    options?: { exact?: boolean }
  ) => {
    first: () => {
      count: () => Promise<number>
      click: (opts?: { timeout?: number }) => Promise<void>
    }
  }
  waitForSelector: (selector: string, opts?: { timeout?: number }) => Promise<unknown>
}

// The postNavigate hook itself — passed to fetchRendered() by
// fetchHopscotchSizeChartTable() below. Clicks the "View size chart"
// trigger (matched by text, not class — same reasoning as
// extractAvailability()'s button-text match: this site's classes are
// CSS-module hashes) and waits for the resulting modal's <table> to
// mount before the caller snapshots page.content().
//
// Every failure mode here is intentionally swallowed rather than
// thrown: fetchRendered() already treats a postNavigate throw as
// non-fatal and logs it, but there's no reason to log a *normal*
// "this product genuinely doesn't have a chart trigger visible" case
// as a warning — extractSizeChartFromDom() finding nothing afterward
// is a perfectly adequate, quiet signal for that.
export async function openHopscotchSizeChartModal(page: MinimalPage): Promise<void> {
  const trigger = page.getByText('View size chart', { exact: false }).first()
  const count = await trigger.count().catch(() => 0)
  if (count > 0) {
    await trigger.click({ timeout: 3000 }).catch(() => {})
    await page.waitForSelector('table', { timeout: 5000 }).catch(() => {})
  }
}

/**
 * Issues a second, render-tier fetch of `url` specifically to obtain
 * the size-chart modal's table, and returns just that table (or null).
 * Does NOT re-parse price/title/etc — the caller already has those from
 * the cheap static fetch and should keep them; this function's only
 * job is the one field that fetch structurally cannot provide.
 *
 * Dynamically imports fetchRendered from browser-fetch.ts rather than a
 * static top-level import, so that simply importing this extractor
 * module (e.g. for its types, or in a context that only ever hits the
 * static-fetch path) doesn't unconditionally pull in Playwright.
 *
 * Returns null (never throws) on any failure — a missing size chart
 * after this second attempt is a normal, already-warned-about outcome,
 * not a hard error worth failing the whole scrape over.
 */
export async function fetchHopscotchSizeChartTable(
  url: string,
  opts: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<HopscotchSizeChartTable[] | null> {
  try {
    const { fetchRendered } = await import('../browser-fetch')
    const rendered = await fetchRendered(url, {
      timeoutMs: opts.timeoutMs ?? 25000,
      waitForSelector: 'h1, [class*="price"]',
      postNavigate: openHopscotchSizeChartModal as any,
    })
    if (opts.signal?.aborted) return null
    if (!rendered.html) return null

    const $ = cheerio.load(rendered.html)
    return extractSizeChartFromDom($)
  } catch {
    return null
  }
}