// lib/scrape/extractors/nykaa.ts
import * as cheerio from 'cheerio'
import type { CheerioAPI } from 'cheerio'
import { cleanText, looksBlocked } from '../shared'

// ---------------------------------------------------------------------
// Nykaa (www.nykaa.com / www.nykaafashion.com) product-page extractor.
//
// Replaces this site's previous wiring to makeOgOnlyParser() in
// extractors/og-only.ts. Same tier shape as hopscotch.ts — fetch +
// cheerio only, no paid/external service tier, no Parse.bot-style
// hosted API and no TLS-fingerprint proxy.
//
// !!! UNCONFIRMED AGAINST A REAL CAPTURED PDP !!!
// Every selector and JSON path below is a STRUCTURED GUESS. The
// hopscotch extractor this is modelled on was written against a real
// captured page, which is why its __NEXT_DATA__ path
// (props.pageProps.dehydratedState.queries[].state.data.simpleSkus) is
// asserted as fact. Nothing here has had that treatment yet. The
// tiering, the internal-meta pattern, the exported surface and the
// fallback ordering are all correct and match hopscotch.ts; the
// *addresses* the parsers read from are not yet verified. Capture one
// real Nykaa PDP's HTML and re-tighten:
//   1. findNykaaEmbeddedProduct() — confirm which embedded blob is
//      actually present, and the exact key path to the product record.
//   2. variantsFromEmbedded() — confirm the child-SKU array's key name
//      and which attribute carries the shade/size label.
//   3. extractPrice/extractMrp — confirm whether Nykaa shows a genuine
//      struck-through MRP (unlike Hopscotch, which does not; see that
//      file's header). Nykaa's PDP visibly renders both an MRP and a
//      discounted price, so a REAL mrp is expected here — but confirm
//      that the discount isn't a conditional offer-widget value the way
//      Hopscotch's "Best price" text was.
//
// Two things known to differ structurally from Hopscotch, and handled
// accordingly below:
//   - Nykaa's primary variant axis is usually Shade/Colour (beauty) or
//     Size/ml, not a single "Size" dimension. variantsFromEmbedded()
//     therefore derives the dimension NAME from the data rather than
//     hardcoding 'Size' the way hopscotch.ts legitimately can.
//   - Nykaa serves two distinct storefronts on adjacent hostnames
//     (nykaa.com for beauty, nykaafashion.com for apparel) with
//     different PDP templates. detectSite() in parsers.ts matches the
//     'nykaa' substring for both, so both land here. The apparel
//     storefront is the one that will have a size chart; the beauty one
//     will not. Neither is confirmed.
//
// Class names on this site are emotion/CSS-module hashes (e.g.
// `css-1jczs19`) and are NOT stable hooks across deploys — same problem
// hopscotch.ts documents. Every DOM-tier selector below is therefore
// either an attribute/substring match or a text match, never an exact
// generated class.
//
// rating, review_count and seller: Nykaa's PDP does visibly render a
// star rating and a review count (unlike Hopscotch, where both were
// unconfirmed in DOM *and* absent from the embedded JSON), so these are
// wired up optimistically at both the embedded and DOM tiers. Seller is
// expected to be absent — Nykaa is first-party retail for most SKUs.
//
// PER-VARIANT PRICE/STOCK/SELECTION — NOT A SEPARATE FETCH:
// variantsFromEmbedded() reads every shade/size's price and stock
// straight out of the SAME embedded blob the one page fetch already
// returned — there is no per-variant network call anywhere in this
// file. Two consequences worth knowing before trusting the picker:
//   - PRICE_KEYS/MRP_KEYS are only tried as top-level keys on each SKU
//     node. If Nykaa nests price under e.g. sku.price.final or
//     sku.mrpInfo.offerPrice, firstKeyValue() returns the nested OBJECT
//     (not a number), numericFrom() rejects it, and the tile silently
//     renders with no price. deepNumeric() below is the fallback for
//     that case — tried only after the flat read comes back empty, so
//     it costs nothing when the flat shape is right.
//   - `selected` used to compare a child SKU's id against the PARENT
//     product's id, which are different id spaces on most storefronts
//     and would never match. It's now resolved against the id/slug
//     segment actually present in the page URL when one is available,
//     with a same-price/only-option fallback — see selectedSkuMatches().
//   - `url` is populated from a genuine slug field on the SKU when the
//     payload has one, so a variant CAN be clicked to live re-fetch
//     that shade's own page — same as Amazon's swatches. If no slug
//     field is found, url stays null and the tile renders
//     visible-but-disabled (same treatment Shopify/WooCommerce tiles
//     get), rather than fabricating a URL from a guessed pattern.
// ---------------------------------------------------------------------

export const SITE_ID = 'nykaa' as const

// ---------- Scrapingdog fallback (India geo-targeting, PLAIN mode) ----------
//
// WHY: production logs show a plain "HTTP 403: Access Denied" from the
// direct-fetch tier, retried across all 3 header profiles, every one still
// 403 — an IP-reputation/WAF block on the deployment's own egress IP
// (Vercel's, or Browserless's), not a CAPTCHA challenge or a rendering
// problem. Same root cause already fixed for Myntra (see that file's own
// tier comment) and Ajio — Nykaa just never got the equivalent tier.
//
// DELIBERATELY PLAIN, NOT dynamic=true: same reasoning as Myntra's tier —
// REQUIRES_RENDER_FOR_VARIANTS is false here too, so there's no client-
// side hydration to pay Scrapingdog's real-browser-render rate for. This
// is purely about getting past the IP block with a country=in fetch.
//
// Reuses the SAME SCRAPINGDOG_API_KEY/SCRAPINGDOG_COUNTRY/
// SCRAPINGDOG_USE_PREMIUM env vars Myntra's and Ajio's tiers already
// read — same account/credit pool, not a separate credential.

export const SUPPORTS_SCRAPINGDOG_FALLBACK = true

export function nykaaScrapingdogConfigured(): boolean {
  return Boolean(process.env.SCRAPINGDOG_API_KEY)
}

const NYKAA_SCRAPINGDOG_ENDPOINT = 'https://api.scrapingdog.com/scrape'
const NYKAA_SCRAPINGDOG_COUNTRY = process.env.SCRAPINGDOG_COUNTRY || 'in'
const NYKAA_SCRAPINGDOG_USE_PREMIUM = process.env.SCRAPINGDOG_USE_PREMIUM === 'true'
const NYKAA_SCRAPINGDOG_TIMEOUT_MS = Number(process.env.SCRAPINGDOG_TIMEOUT_MS) || 20000

export async function fetchNykaaViaScrapingdog(
  url: string,
  opts: { signal?: AbortSignal } = {}
): Promise<{ html: string | null; error: string | null }> {
  const apiKey = process.env.SCRAPINGDOG_API_KEY
  if (!apiKey) {
    return { html: null, error: 'SCRAPINGDOG_API_KEY is not set.' }
  }

  const params = new URLSearchParams({
    api_key: apiKey,
    url,
    country: NYKAA_SCRAPINGDOG_COUNTRY,
    ...(NYKAA_SCRAPINGDOG_USE_PREMIUM ? { premium: 'true' } : {}),
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), NYKAA_SCRAPINGDOG_TIMEOUT_MS)
  const onExternalAbort = () => controller.abort()
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort()
    else opts.signal.addEventListener('abort', onExternalAbort)
  }

  try {
    const res = await fetch(`${NYKAA_SCRAPINGDOG_ENDPOINT}?${params.toString()}`, {
      signal: controller.signal,
    })

    if (!res.ok) {
      const snippet = await res.text().catch(() => '')
      return {
        html: null,
        error: `Scrapingdog returned HTTP ${res.status}${snippet ? `: ${snippet.slice(0, 300)}` : ''}`,
      }
    }

    const html = await res.text()

    if (looksBlocked(html)) {
      return {
        html: null,
        error: `Scrapingdog fetch returned a CAPTCHA/robot-check page even with country=${NYKAA_SCRAPINGDOG_COUNTRY} — Nykaa may be blocking Scrapingdog's IP range specifically, or the block isn't purely geographic.`,
      }
    }

    return { html, error: null }
  } catch (e) {
    clearTimeout(timer)
    const externalAborted = opts.signal?.aborted ?? false
    const isAbortError = e instanceof Error && e.name === 'AbortError'
    return {
      html: null,
      error: externalAborted
        ? 'aborted — client disconnected'
        : isAbortError
          ? `Scrapingdog request timed out after ${NYKAA_SCRAPINGDOG_TIMEOUT_MS}ms`
          : e instanceof Error
            ? e.message
            : String(e),
    }
  } finally {
    clearTimeout(timer)
    if (opts.signal) opts.signal.removeEventListener('abort', onExternalAbort)
  }
}

// UNCONFIRMED. Set to `false` here on the assumption that Nykaa, like
// Hopscotch, SSRs its full product record (including the shade/size
// list) into the page — which is the common case for a Next.js
// storefront. If a captured PDP shows the variant list is genuinely
// client-only, flip this to `true` AND add SITE_ID to parsers.ts's
// RENDER_FALLBACK_HOSTS, or the variant picker will silently never
// appear rather than producing the "picker renders client-side"
// warning scrapeProduct() emits for render-requiring sites.
export const REQUIRES_RENDER_FOR_VARIANTS = false

export type NykaaVariantOption = {
  label: string
  price: string | null
  currencyCode: string | null
  image: string | null
  url: string | null
  selected: boolean
  outOfStock: boolean
}

export type NykaaVariantDimension = {
  dimension: string
  options: NykaaVariantOption[]
}

// Same shape as HopscotchSizeChartTable / the Amazon and Myntra chart
// types, so it can join ScrapeResult.sizeChart's union without any
// structural conversion.
export type NykaaSizeChartTable = {
  title?: string | null
  headers: string[]
  rows: string[][]
}

export type NykaaParsed = {
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
  variants?: NykaaVariantDimension[]
  sizeChart?: NykaaSizeChartTable[] | null
  description?: string | null
  moreInfo?: string | null
  // Internal-only, stripped by consumeNykaaMeta() — same pattern as
  // every other extractor's _<site>Warning/_<site>Unavailable fields.
  _nykaaWarning?: string
  _nykaaUnavailable?: boolean
}

// ---------- small local helpers (same pattern as hopscotch.ts) ----------

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

// Identical in purpose to hopscotch.ts's htmlFragmentToText(): the
// embedded product record's description fields are themselves HTML
// strings (<p>, <ul>, <b>), and these are the literal source of the
// PDP's "Product Details" / "How To Use" / "Ingredients" accordions.
// Loaded into a fresh cheerio instance rather than regex-stripped so
// nested lists stay space-separated instead of jammed together.
function htmlFragmentToText(html: string | null | undefined): string | null {
  if (!html) return null
  const $$ = cheerio.load(`<div id="root">${html}</div>`)
  const text = $$('#root').text().replace(/\s+/g, ' ').trim()
  return text || null
}

function numericFrom(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  if (typeof v === 'string') return extractPriceNumber(v)
  return null
}

// Fallback for when a SKU nests its price under a sub-object instead of
// a flat key (e.g. sku.price.final, sku.mrpInfo.offerPrice) — the shape
// firstKeyValue()+numericFrom() can't read, since firstKeyValue() would
// hand back the nested object itself rather than a number. Only ever
// called after the flat read has already come back empty, so a payload
// that DOES use flat keys pays nothing extra. Depth-bounded and doesn't
// recurse into arrays, since price/mrp values are never array-nested in
// any storefront shape seen so far.
function deepNumeric(node: any, keys: string[], depth = 0): string | null {
  if (!node || typeof node !== 'object' || depth > 3) return null
  const direct = numericFrom(firstKeyValue(node, keys))
  if (direct) return direct
  for (const val of Object.values(node)) {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const found = deepNumeric(val, keys, depth + 1)
      if (found) return found
    }
  }
  return null
}

// =======================================================================
// PRIMARY PATH: embedded server-rendered state
//
// UNCONFIRMED WHICH BLOB. Unlike Hopscotch — where the payload location
// is known exactly — Nykaa may serve its product record via
// #__NEXT_DATA__, via a `window.__PRELOADED_STATE__` / `__INITIAL_STATE__`
// assignment, or via a plain application/json script tag. All three are
// probed here and the best-scoring product node across them wins, which
// is deliberately more defensive than hopscotch.ts needs to be. Once a
// real capture confirms the actual location, collapse this down to a
// direct key-path read the way findHopscotchNextDataProduct() does —
// a confirmed path is both faster and far less likely to latch onto a
// "recommended products" node by mistake.
// =======================================================================

type NykaaEmbeddedSku = Record<string, any>

type NykaaEmbeddedProduct = Record<string, any>

// Key names probed when scoring a candidate node. Ordered by
// confidence, not alphabetically — the first match wins in the
// single-value readers below.
const NAME_KEYS = ['name', 'title', 'productName', 'displayName']
const PRICE_KEYS = ['finalPrice', 'offerPrice', 'sellingPrice', 'discountedPrice', 'price']
const MRP_KEYS = ['mrp', 'listPrice', 'originalPrice', 'strikePrice', 'maxRetailPrice']
const CHILD_SKU_KEYS = ['childProducts', 'variants', 'skus', 'simpleSkus', 'options', 'shades']
const IMAGE_LIST_KEYS = ['images', 'imageUrls', 'media', 'galleryImages', 'productImages']
const DESC_KEYS = ['description', 'productDescription', 'longDescription', 'detail']
const MORE_INFO_KEYS = ['howToUse', 'ingredients', 'moreInfo', 'additionalInfo', 'expertAdvice']
// Candidate keys for a per-SKU page slug/URL. Tried only to build a
// clickable variant link — see the header note on why url stays null
// rather than being guessed when none of these are present.
const SLUG_KEYS = ['slug', 'url', 'productUrl', 'pageUrl', 'permalink']

function firstKeyValue(node: Record<string, any>, keys: string[]): any {
  for (const k of keys) {
    if (node[k] != null && node[k] !== '') return node[k]
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

function collectCandidateBlobs($: CheerioAPI, html: string): any[] {
  const blobs: any[] = []

  const nextData = $('#__NEXT_DATA__').html()
  if (nextData) {
    try {
      blobs.push(JSON.parse(nextData))
    } catch {
      // malformed — fall through to the other sources
    }
  }

  $('script[type="application/json"]').each((_, el) => {
    const raw = $(el).html()
    if (!raw) return
    try {
      blobs.push(JSON.parse(raw))
    } catch {
      // not valid JSON — skip
    }
  })

  // `window.__PRELOADED_STATE__ = {...}` style assignments. Bounded
  // scan so a pathological page can't turn this into a hot loop.
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
      // Unquoted keys or embedded function refs — skip.
    }
  }

  return blobs
}

// A node is a plausible product record if it has a name AND a price.
// The child-SKU array and an explicit id are strong additional signals
// and are weighted to outrank the "recommended products" / "recently
// viewed" nodes that live in the same payload and would otherwise tie.
function scoreProductNode(node: Record<string, any>): number {
  let s = 0
  if (firstKeyValue(node, NAME_KEYS) != null) s += 1
  if (firstKeyValue(node, PRICE_KEYS) != null) s += 1
  if (firstKeyValue(node, MRP_KEYS) != null) s += 0.5
  if (node.productId != null || node.sku != null || node.id != null) s += 0.5
  const children = firstKeyValue(node, CHILD_SKU_KEYS)
  if (Array.isArray(children) && children.length) s += 2
  if (firstKeyValue(node, DESC_KEYS) != null) s += 0.5
  return s
}

function findNykaaEmbeddedProduct($: CheerioAPI, html: string): NykaaEmbeddedProduct | null {
  const blobs = collectCandidateBlobs($, html)
  const seen = new Set<any>()
  let best: NykaaEmbeddedProduct | null = null
  let bestScore = 0

  function walk(node: any, depth: number) {
    if (!node || typeof node !== 'object' || depth > 14 || seen.has(node)) return
    seen.add(node)
    if (!Array.isArray(node)) {
      const s = scoreProductNode(node)
      // Threshold of 2 means name+price alone is enough, but a node
      // carrying a child-SKU array will always beat one that doesn't.
      if (s >= 2 && s > bestScore) {
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

function imagesFromEmbedded(product: NykaaEmbeddedProduct): string[] {
  const raw = firstKeyValue(product, IMAGE_LIST_KEYS)
  const out: string[] = []

  if (typeof raw === 'string') out.push(raw)
  else if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (typeof entry === 'string') out.push(entry)
      else if (entry && typeof entry === 'object') {
        const u = entry.url || entry.imageUrl || entry.src || entry.large || entry.zoom
        if (typeof u === 'string') out.push(u)
      }
    }
  }

  const single = product.image || product.imageUrl
  if (!out.length && typeof single === 'string') out.push(single)

  return [...new Set(out.filter(Boolean).map(normalizeUrl))]
}

// Derives the dimension NAME from the data rather than hardcoding it —
// see the header comment on why Nykaa can't assume 'Size' the way
// hopscotch.ts can. Falls back to 'Shade' only when nothing in the
// payload names the axis, since shade is the dominant case on the
// beauty storefront.
function dimensionNameFor(children: NykaaEmbeddedSku[], product: NykaaEmbeddedProduct): string {
  const declared =
    (typeof product.variantType === 'string' && product.variantType) ||
    (typeof product.optionName === 'string' && product.optionName) ||
    (typeof product.variantAxis === 'string' && product.variantAxis) ||
    null
  if (declared) return declared

  const sample = children[0]
  if (sample) {
    for (const k of ['shade', 'shadeName', 'colour', 'color']) {
      if (sample[k] != null) return 'Shade'
    }
    for (const k of ['size', 'sizeName', 'weight', 'volume', 'quantity']) {
      if (sample[k] != null) return 'Size'
    }
  }
  return 'Shade'
}

function variantLabelFor(sku: NykaaEmbeddedSku): string | null {
  for (const k of [
    'shadeName',
    'shade',
    'colourName',
    'colour',
    'color',
    'sizeName',
    'size',
    'variantName',
    'optionValue',
    'label',
    'name',
    'title',
  ]) {
    const v = sku[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

// A genuine page slug/URL for this SKU, only if the payload actually
// has one — never fabricated from a guessed pattern (site + id). This
// is deliberately the only thing that turns a tile clickable; if this
// returns null the tile stays visible-but-disabled, which is an honest
// reflection of "the extractor found the option but not a link for it".
function variantUrlFor(sku: NykaaEmbeddedSku): string | null {
  const raw = firstKeyValue(sku, SLUG_KEYS)
  if (typeof raw !== 'string' || !raw.trim()) return null
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
  if (raw.startsWith('//')) return normalizeUrl(raw)
  // Relative path/slug. Nykaa serves both storefronts on adjacent
  // hostnames (see header) — default to nykaa.com since that's the
  // more common case, but this only matters if a capture confirms the
  // key exists at all.
  return `https://www.nykaa.com${raw.startsWith('/') ? '' : '/'}${raw}`
}

// Resolves which SKU is "selected" without assuming the parent
// product's id lives in the same id-space as a child SKU's id (it
// usually doesn't — see header note). Preference order:
//   1. The id/slug segment actually present in the current page URL,
//      if the SKU carries a comparable id or slug field.
//   2. If nothing in the URL matches any SKU, and there's exactly one
//      SKU, treat it as selected by elimination.
//   3. Otherwise none are marked selected — an honest "unknown" rather
//      than a guessed match.
function selectedSkuMatches(
  sku: NykaaEmbeddedSku,
  children: NykaaEmbeddedSku[],
  pageUrl: string
): boolean {
  const candidates = [sku.productId, sku.sku, sku.id, sku.slug, sku.url, sku.productUrl].filter(
    (v) => v != null && v !== ''
  )
  for (const c of candidates) {
    if (pageUrl.includes(String(c))) return true
  }
  return children.length === 1
}

// Reads price and stock PER SKU rather than assuming they're uniform
// across the axis — same reasoning as hopscotch.ts's
// variantsFromNextData(): shades on Nykaa genuinely can differ in price
// and very often differ in stock.
function variantsFromEmbedded(
  product: NykaaEmbeddedProduct,
  currencyCode: string,
  pageUrl: string
): NykaaVariantDimension[] | null {
  const children = firstKeyValue(product, CHILD_SKU_KEYS)
  if (!Array.isArray(children) || !children.length) return null

  const options: NykaaVariantOption[] = children
    .filter((c) => c && typeof c === 'object')
    .map((sku: NykaaEmbeddedSku) => {
      const label = variantLabelFor(sku) ?? 'Unknown'

      // Flat key first (cheap, matches the common case); only recurse
      // into nested sub-objects if the flat read finds nothing.
      const price = numericFrom(firstKeyValue(sku, PRICE_KEYS)) ?? deepNumeric(sku, PRICE_KEYS)

      // Stock: prefer an explicit boolean, then a quantity, then an
      // explicit out-of-stock flag. Defaults to in-stock rather than
      // out-of-stock when nothing says either way, so an unrecognised
      // payload shape doesn't render every shade as unavailable.
      let outOfStock = false
      if (typeof sku.inStock === 'boolean') outOfStock = !sku.inStock
      else if (typeof sku.available === 'boolean') outOfStock = !sku.available
      else if (typeof sku.outOfStock === 'boolean') outOfStock = sku.outOfStock
      else if (typeof sku.availableQuantity === 'number') outOfStock = sku.availableQuantity <= 0
      else if (typeof sku.quantity === 'number') outOfStock = sku.quantity <= 0

      const img = sku.image || sku.imageUrl || sku.shadeImage || null

      return {
        label,
        price,
        currencyCode,
        image: typeof img === 'string' ? normalizeUrl(img) : null,
        // Populated only when the SKU carries a genuine slug/URL field
        // — see variantUrlFor()'s comment. Null means "found the option,
        // no link for it", not "this site never links variants".
        url: variantUrlFor(sku),
        selected: selectedSkuMatches(sku, children, pageUrl),
        outOfStock,
      }
    })

  if (!options.length) return null
  return [{ dimension: dimensionNameFor(children, product), options }]
}

// =======================================================================
// SECONDARY PATH: JSON-LD Product
//
// Nykaa emits a schema.org Product block on its PDPs. parseHtml() in
// parsers.ts already runs a generic JSON-LD pass and merges it via
// withFallbacks(), so this tier exists mainly so that THIS extractor
// returns a coherent result on its own (and so rating/review_count,
// which the generic pass does read, aren't the only fields this site
// ever gets). Kept narrow on purpose — no duplication of the generic
// pass's image or availability handling.
// =======================================================================

type NykaaJsonLd = {
  title: string | null
  brand: string | null
  price: string | null
  mrp: string | null
  currencyCode: string | null
  rating: string | null
  review_count: string | null
  availability: string | null
  images: string[]
}

function extractJsonLdProduct($: CheerioAPI): NykaaJsonLd | null {
  let found: NykaaJsonLd | null = null

  $('script[type="application/ld+json"]').each((_, el) => {
    if (found) return
    const raw = $(el).html()
    if (!raw) return
    let data: any
    try {
      data = JSON.parse(raw)
    } catch {
      return
    }
    const candidates = Array.isArray(data) ? data : [data]
    for (const node of candidates) {
      const graph = node?.['@graph'] ? node['@graph'] : [node]
      for (const item of graph) {
        if (!item || item['@type'] !== 'Product') continue
        const offers = Array.isArray(item.offers) ? item.offers[0] : item.offers
        const imgs = Array.isArray(item.image) ? item.image : item.image ? [item.image] : []
        const brandRaw = item.brand
        found = {
          title: typeof item.name === 'string' ? item.name : null,
          brand:
            typeof brandRaw === 'string'
              ? brandRaw
              : brandRaw && typeof brandRaw.name === 'string'
                ? brandRaw.name
                : null,
          price: numericFrom(offers?.price),
          mrp: numericFrom(offers?.priceSpecification?.price ?? offers?.highPrice),
          currencyCode: typeof offers?.priceCurrency === 'string' ? offers.priceCurrency : null,
          rating: numericFrom(item.aggregateRating?.ratingValue),
          review_count: numericFrom(item.aggregateRating?.reviewCount ?? item.aggregateRating?.ratingCount),
          availability: offers?.availability ? String(offers.availability).split('/').pop() ?? null : null,
          images: imgs.filter((i: unknown): i is string => typeof i === 'string').map(normalizeUrl),
        }
        break
      }
      if (found) break
    }
  })

  return found
}

// =======================================================================
// FALLBACK PATH: DOM / text-based extraction
//
// Used only when neither the embedded state nor JSON-LD yields a
// usable record. ALL UNCONFIRMED — attribute and text matches only, no
// exact generated class names, for the reason in the header comment.
// =======================================================================

function extractTitle($: CheerioAPI): string | null {
  return firstText($, [
    'h1[class*="product-title"]',
    'h1[class*="pdp-title"]',
    '[class*="product-detail"] h1',
    '[data-test*="product-title"]',
    'h1',
  ])
}

function extractBrand($: CheerioAPI): string | null {
  return firstText($, [
    'a[href*="/brands/"]',
    'a[href*="/brand/"]',
    '[class*="brand-name"]',
    '[class*="product-brand"]',
  ])
}

// Nykaa's PDP renders an MRP and a discounted price adjacently, so
// unlike Hopscotch a genuine struck-through original IS expected here.
// The struck-through element is read as `mrp`, the non-struck one as
// `price` — and CONFIRM against a real capture that the non-struck
// figure is the base checkout price and not a conditional bank-offer
// value (the exact mistake hopscotch.ts documents in its header).
function extractPrice($: CheerioAPI): string | null {
  const raw = firstText($, [
    '[class*="post-card__content-price-offer"]',
    '[class*="discounted-price"]',
    '[class*="selling-price"]',
    '[class*="final-price"]',
    '[class*="offer-price"]',
    '[data-test*="price"]',
    '[class*="price"]:not([class*="mrp"]):not([class*="strike"])',
  ])
  return extractPriceNumber(raw)
}

function extractMrp($: CheerioAPI): string | null {
  const raw = firstText($, [
    '[class*="mrp"]',
    '[class*="strike-price"]',
    '[class*="original-price"]',
    'strike',
    'del',
    's',
  ])
  return extractPriceNumber(raw)
}

function extractRating($: CheerioAPI): string | null {
  const raw = firstText($, [
    '[class*="rating-value"]',
    '[class*="avg-rating"]',
    '[class*="star-rating"]',
    '[class*="rating"] [class*="value"]',
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
    'a[href*="#reviews"]',
  ])
  if (!raw) return null
  const match = raw.replace(/,/g, '').match(/\d+/)
  return match ? match[0] : null
}

const OUT_OF_STOCK_PATTERNS = [
  /out\s*of\s*stock/i,
  /sold\s*out/i,
  /notify\s*me/i,
  /currently\s*unavailable/i,
]

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

  // Matched by button TEXT, not class — same reasoning as
  // hopscotch.ts's extractAvailability().
  let hasAddToBagButton = false
  $('button').each((_, el) => {
    if (hasAddToBagButton) return
    const t = (cleanText($(el)) ?? '').toUpperCase()
    if (t === 'ADD TO BAG' || t === 'ADD TO CART' || t === 'BUY NOW') hasAddToBagButton = true
  })
  if (hasAddToBagButton) return { availability: 'In stock', unavailable: false }

  return { availability: null, unavailable: false }
}

// Expected to be null for most SKUs — Nykaa is first-party retail for
// the bulk of its catalogue. Kept so third-party/marketplace listings
// aren't silently dropped.
function extractSeller($: CheerioAPI): string | null {
  return firstText($, ['[class*="seller-name"]', '[class*="sold-by"]', '[class*="shipped-by"]'])
}

function extractImages($: CheerioAPI): string[] {
  const urls = new Set<string>()

  const imgSelectors = [
    '[class*="product-gallery"] img',
    '[class*="pdp-image"] img',
    '[class*="image-gallery"] img',
    '[class*="product-image"] img',
    '[class*="thumbnail"] img',
  ]

  for (const sel of imgSelectors) {
    $(sel).each((_, el) => {
      const $el = $(el)
      const src = $el.attr('src') || $el.attr('data-src') || $el.attr('data-original')
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
  }

  return [...urls]
}

function extractDescription($: CheerioAPI): string | null {
  return firstText($, [
    '[class*="product-description"]',
    '[class*="pdp-description"]',
    '[id*="description"]',
  ])
}

// =======================================================================
// SIZE CHART: best-effort DOM extraction
//
// Only relevant on the nykaafashion.com apparel storefront — beauty
// SKUs have no chart. Lifted from hopscotch.ts's
// extractSizeChartFromDom() and matched by heading TEXT rather than
// class, for the same reason. Also subject to the same limitation: if
// Nykaa mounts the chart into a modal only on click, a plain static
// fetch will never contain it, and getting real rows would need the
// same click-and-refetch second pass hopscotch.ts implements in
// fetchHopscotchSizeChartTable(). NOT implemented here — add it only
// once a capture confirms the chart is genuinely click-gated rather
// than SSR'd, so we don't pay for a render tier this site may not need.
// =======================================================================

const SIZE_CHART_HEADING_RE = /^size\s*(chart|guide)$/i

export function extractSizeChartFromDom($: CheerioAPI): NykaaSizeChartTable[] | null {
  let table: ReturnType<CheerioAPI> | null = null

  $('*').each((_, el) => {
    if (table) return
    const text = cleanText($(el))
    if (text && SIZE_CHART_HEADING_RE.test(text)) {
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

// UNCONFIRMED — matches the SITE_OPTIONS_EXTRACTORS call pattern in
// parsers.ts (the currently-*selected* option, not the full list).
// Nykaa does default-select the first shade on load, so unlike
// Hopscotch this should usually return something. The full pickable
// list with per-shade stock comes from variantsFromEmbedded() instead.
export function extractNykaaOptions($: CheerioAPI): Record<string, string> | null {
  const options: Record<string, string> = {}

  const selectedShade = firstText($, [
    '[class*="shade-selector"] [class*="selected"]',
    '[class*="shade"][class*="selected"]',
    '[class*="variant"][class*="selected"]',
    '[class*="swatch"][class*="active"]',
  ])
  if (selectedShade) options.Shade = selectedShade

  const selectedSize = firstText($, [
    '[class*="size-selector"] [class*="selected"]',
    '[class*="size-list"] [class*="active"]',
    '[class*="size"][class*="selected"]',
  ])
  if (selectedSize) options.Size = selectedSize

  return Object.keys(options).length ? options : null
}

// ---------- main parser ----------

export function parseNykaa($: CheerioAPI, _url: string): NykaaParsed {
  // parseHopscotch() gets `html` for free because __NEXT_DATA__ lives
  // in a script tag cheerio can address directly. Nykaa may instead use
  // a `window.__X__ =` assignment, which needs the raw HTML string —
  // recovered from the cheerio instance here rather than changing
  // SITE_PARSERS' ($, url) signature in parsers.ts for one site.
  const html = $.html()

  const embedded = findNykaaEmbeddedProduct($, html)
  const jsonLd = extractJsonLdProduct($)

  // Attempted regardless of which tier supplies the rest — the chart,
  // if present in this HTML at all, is DOM-only.
  const domSizeChart = extractSizeChartFromDom($)

  if (embedded) {
    const currencyCode =
      (typeof embedded.currency === 'string' && embedded.currency) ||
      (typeof embedded.currencyCode === 'string' && embedded.currencyCode) ||
      jsonLd?.currencyCode ||
      'INR'

    const title = (firstKeyValue(embedded, NAME_KEYS) as string | null) ?? jsonLd?.title ?? null
    const brandRaw = embedded.brandName ?? embedded.brand ?? null
    const brand =
      typeof brandRaw === 'string'
        ? brandRaw
        : brandRaw && typeof brandRaw.name === 'string'
          ? brandRaw.name
          : (jsonLd?.brand ?? null)

    const price =
      numericFrom(firstKeyValue(embedded, PRICE_KEYS)) ??
      deepNumeric(embedded, PRICE_KEYS) ??
      jsonLd?.price ??
      null
    const mrpRaw =
      numericFrom(firstKeyValue(embedded, MRP_KEYS)) ??
      deepNumeric(embedded, MRP_KEYS) ??
      jsonLd?.mrp ??
      null

    // Drop a "discount" that isn't one. An MRP equal to (or below) the
    // selling price is the shape Hopscotch's PDP turned out to have —
    // reporting it would imply a markdown that doesn't exist.
    const mrp =
      mrpRaw != null && price != null && Number(mrpRaw) <= Number(price) ? null : mrpRaw

    const embeddedImages = imagesFromEmbedded(embedded)
    const variants = variantsFromEmbedded(embedded, currencyCode, _url) ?? undefined

    let availability: string | null = null
    let unavailable = false
    if (typeof embedded.inStock === 'boolean') {
      availability = embedded.inStock ? 'In stock' : 'Out of stock'
      unavailable = !embedded.inStock
    } else if (typeof embedded.outOfStock === 'boolean') {
      availability = embedded.outOfStock ? 'Out of stock' : 'In stock'
      unavailable = embedded.outOfStock
    } else if (jsonLd?.availability) {
      availability = /InStock/i.test(jsonLd.availability) ? 'In stock' : 'Out of stock'
      unavailable = !/InStock/i.test(jsonLd.availability)
    } else {
      const domAvail = extractAvailability($)
      availability = domAvail.availability
      unavailable = domAvail.unavailable
    }

    const result: NykaaParsed = {
      title,
      brand,
      price,
      mrp,
      currencyCode,
      rating: numericFrom(embedded.rating ?? embedded.avgRating) ?? jsonLd?.rating ?? extractRating($),
      review_count:
        numericFrom(embedded.reviewCount ?? embedded.ratingCount) ??
        jsonLd?.review_count ??
        extractReviewCount($),
      availability,
      seller: (typeof embedded.seller === 'string' ? embedded.seller : null) ?? extractSeller($),
      images: embeddedImages.length ? embeddedImages : (jsonLd?.images.length ? jsonLd.images : extractImages($)),
      variants,
      sizeChart: domSizeChart,
      description: htmlFragmentToText(firstKeyValue(embedded, DESC_KEYS)) ?? extractDescription($),
      moreInfo: htmlFragmentToText(firstKeyValue(embedded, MORE_INFO_KEYS)),
    }

    if (unavailable) result._nykaaUnavailable = true

    if (!title && !price) {
      result._nykaaWarning =
        'An embedded product-state node was located and parsed, but neither a name nor a price was present in it — the scorer may have latched onto a recommendations/recently-viewed node rather than the real product record. Send a captured PDP so findNykaaEmbeddedProduct() can be collapsed to a confirmed key path.'
    } else if (!variants) {
      result._nykaaWarning =
        'No child-SKU array was found in the embedded product node, so no shade/size picker could be built. Either this product genuinely has a single variant, or the child array uses a key name not in CHILD_SKU_KEYS — confirm against a captured PDP.'
    }

    return result
  }

  if (jsonLd) {
    const domAvail = extractAvailability($)
    const mrp = jsonLd.mrp != null && jsonLd.price != null && Number(jsonLd.mrp) <= Number(jsonLd.price) ? null : jsonLd.mrp

    const result: NykaaParsed = {
      title: jsonLd.title ?? extractTitle($),
      brand: jsonLd.brand ?? extractBrand($),
      price: jsonLd.price ?? extractPrice($),
      mrp: mrp ?? extractMrp($),
      currencyCode: jsonLd.currencyCode ?? 'INR',
      rating: jsonLd.rating ?? extractRating($),
      review_count: jsonLd.review_count ?? extractReviewCount($),
      availability: jsonLd.availability
        ? /InStock/i.test(jsonLd.availability)
          ? 'In stock'
          : 'Out of stock'
        : domAvail.availability,
      seller: extractSeller($),
      images: jsonLd.images.length ? jsonLd.images : extractImages($),
      sizeChart: domSizeChart,
      description: extractDescription($),
      moreInfo: null,
    }

    const jsonLdOos = jsonLd.availability ? !/InStock/i.test(jsonLd.availability) : domAvail.unavailable
    if (jsonLdOos) result._nykaaUnavailable = true

    result._nykaaWarning =
      'No embedded product-state node was found — this result came from the JSON-LD Product block plus DOM selectors, so no shade/size picker or per-variant stock is available. Confirm whether this PDP genuinely omits embedded state or whether the blob location changed.'

    return result
  }

  // Fallback: neither embedded state nor JSON-LD — DOM/text guesses.
  const title = extractTitle($)
  const price = extractPrice($)
  const mrpRaw = extractMrp($)
  const { availability, unavailable } = extractAvailability($)

  const result: NykaaParsed = {
    title,
    brand: extractBrand($),
    price,
    mrp: mrpRaw != null && price != null && Number(mrpRaw) <= Number(price) ? null : mrpRaw,
    currencyCode: 'INR',
    rating: extractRating($),
    review_count: extractReviewCount($),
    availability,
    seller: extractSeller($),
    images: extractImages($),
    sizeChart: domSizeChart,
    description: extractDescription($),
    moreInfo: null,
  }

  if (unavailable) result._nykaaUnavailable = true

  if (!title && !price) {
    result._nykaaWarning =
      'No embedded product state, no JSON-LD Product block, and neither title nor price matched any known Nykaa DOM selector — the page structure may have changed, or the request was blocked/captcha\'d. Send a fresh captured PDP to re-tighten these selectors.'
  } else {
    result._nykaaWarning =
      'Fell all the way through to DOM/text selectors (no embedded state, no JSON-LD). Every selector on this tier is UNCONFIRMED against a real Nykaa PDP — treat these values as low-confidence.'
  }

  return result
}

// ---------- internal-metadata consumption ----------

export function consumeNykaaMeta(parsed: Record<string, any>): {
  warning: string | null
  unavailable: boolean
} {
  const warning = typeof parsed._nykaaWarning === 'string' ? parsed._nykaaWarning : null
  const unavailable = !!parsed._nykaaUnavailable

  delete parsed._nykaaWarning
  delete parsed._nykaaUnavailable

  return { warning, unavailable }
}

// ---------- hydration check ----------
//
// For parsers.ts's STATIC_CONTENT_SUFFICIENT. Returns true when there's
// enough in the static HTML to skip the render tier: a usable embedded
// product node (strong signal), else a JSON-LD Product block, else a
// title-or-price DOM match.
//
// Register this in STATIC_CONTENT_SUFFICIENT **only if** you also add
// SITE_ID to RENDER_FALLBACK_HOSTS — the entry is what routes a
// content-poor static fetch INTO the render tier, and without a render
// tier registered for this site it just turns a usable-but-thin result
// into a hard failure. See hopscotch.ts's equivalent caveat.
export function hasHydratedNykaaMarkup(html: string): boolean {
  const $ = cheerio.load(html)
  if (findNykaaEmbeddedProduct($, html)) return true
  if (extractJsonLdProduct($)) return true
  return !!(extractTitle($) || extractPrice($))
}