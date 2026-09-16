// lib/scrape/extractors/ajio.ts
import type { CheerioAPI } from 'cheerio'
import { cleanText, looksBlocked, looksLikeJsRequiredShell, readErrorBodySnippet } from '../shared'
import { fetchWithTlsFingerprintRetries } from '../tls-fetch'

// ---------------------------------------------------------------------
// Ajio (www.ajio.com) product-page extractor.
//
// FIVE tiers exist for this site now, tried in this priority order by
// parsers.ts's scrapeProduct():
//
//   1. Parse.bot hosted API (PARSE_BOT section below) — a real HTTP call
//      to a pre-built scraper that returns structured JSON directly.
//      Preferred whenever PARSE_API_KEY is configured: skips fetch,
//      headless-render, AND all fallback tiers entirely.
//   2. Direct fetch + headless-render (parseAjio/parseHtml below) — the
//      original scraping path. Ajio's plain server response is a normal
//      200 — never blocked, never caught by the generic
//      looksLikeJsRequiredShell() heuristic — but the actual product
//      markup (title, price, size/colour pickers) only exists once
//      client-side JS has hydrated the page. See RENDER_FALLBACK_HOSTS /
//      STATIC_CONTENT_SUFFICIENT in parsers.ts.
//   3a. Scrapingdog hosted API (SCRAPINGDOG section below) — real
//      headless-Chrome render done on Scrapingdog's own infra, from an
//      India-targeted IP via their `country` param. Added after
//      diagnosing that Ajio's block on this deployment is geographic
//      (Akamai edge routing + a residential IP outside India), not
//      fingerprint-based — a real Chromium instance from the wrong
//      country still got blocked, so what was actually needed was
//      "real browser rendering FROM AN INDIAN IP," which Scrapingdog's
//      dynamic=true + country=in gives in one hosted call.
//   3b. scrape.do hosted API (SCRAPE_DO section below) — same role as
//      3a (real headless render + India geo-targeting, done on THEIR
//      infra), just a different vendor with an equivalent render=true +
//      geoCode=in combination. Kept as an independently-configured
//      sibling tier rather than a replacement for Scrapingdog, so
//      whichever vendor has a valid credential set on a given
//      deployment is used — see the tier-ordering note in parsers.ts's
//      ajioFallbackTiers construction for which is attempted first.
//   4. Self-hosted TLS-fingerprint fetch (bottom of this file) — last
//      resort if all of the above fail. Kept as a final fallback for
//      cases where neither hosted-render vendor is available/configured,
//      though per its own doc comment it cannot solve a hydration
//      requirement on its own since it never executes JS.
//
// Ajio's hashed/generated CSS class names do churn between deploys, so
// every selector in the tier-2 path below is a fallback *chain* (try the
// most specific/confirmed selector first, fall back to looser ones)
// rather than a single bet. `prod-name` and `prod-sp` are the two classes
// parsers.ts already confirmed against a real captured, fully-rendered
// PDP — everything else here is best-effort and worth re-checking
// against a live page if a field starts coming back consistently null.
// ---------------------------------------------------------------------

export const SITE_ID = 'ajio' as const

// Ajio's size/colour picker is populated client-side after hydration —
// a plain static fetch (even once STATIC_CONTENT_SUFFICIENT passes for
// title/price) won't reliably expose the full swatch list, so callers
// that need `options`/`variants` should route through the render tier.
// (Not a concern for the Parse.bot tier — that returns variants directly
// in the JSON payload, see AjioParseBotParsed below.)
export const REQUIRES_RENDER_FOR_VARIANTS = true

// Single source of truth for "does this HTML actually contain Ajio's
// hydrated product markup" — used by parsers.ts's STATIC_CONTENT_SUFFICIENT
// (for the plain static-fetch tier), fetchAjioViaTlsFingerprint below
// (for the TLS-fingerprint last-resort tier), fetchAjioViaScrapingdog
// below (for the Scrapingdog tier), AND fetchAjioViaScrapeDo below (for
// the scrape.do tier) — so all four non-Parse.bot, non-headless-render
// tiers are held to the same "don't report a false success on an
// un-hydrated shell" standard.
//
// Previously only the static-fetch tier used this check; the
// TLS-fingerprint tier fell back to the generic looksLikeJsRequiredShell()
// heuristic, which — as the header comment above already notes — does
// NOT catch Ajio's shell (it's an ordinary 200 response, not a generic
// "please enable JavaScript" page). That gap let the TLS-fingerprint
// tier silently accept an un-hydrated shell as a "successful" fetch,
// producing exactly this symptom pattern: title/price selectors all
// miss, price falls back to meta-description text, and no variant data
// — a false partial success reported as `source: 'fingerprint_fetch'`
// instead of an honest failure that would let the caller know the real
// fix is on the render tier, not this one.
export function hasHydratedAjioMarkup(html: string): boolean {
  return html.includes('class="prod-sp"') || html.includes('class="prod-name"')
}

export type AjioParsed = {
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
  // Internal-only fields, stripped out by consumeAjioMeta() before the
  // result reaches the caller — same pattern as the other multi-field
  // extractors (meesho/myntra/ebay/jiomart/snapdeal) in parsers.ts.
  _ajioWarning?: string
  _ajioUnavailable?: boolean
}

// ---------- small local helpers ----------

/** Pulls the first run of digits (with optional decimal) out of a price
 * string like "₹1,499" or "Rs. 2,999.00", stripping currency symbols and
 * thousands separators. */
function extractPriceNumber(text: string | null | undefined): string | null {
  if (!text) return null
  const cleaned = text.replace(/,/g, '')
  const match = cleaned.match(/\d+(?:\.\d+)?/)
  return match ? match[0] : null
}

/** Returns cleaned text from the first selector (in order) that matches
 * and yields non-empty text. */
function firstText($: CheerioAPI, selectors: string[]): string | null {
  for (const sel of selectors) {
    const text = cleanText($(sel).first())
    if (text) return text
  }
  return null
}

/** Returns the first non-empty attribute value across a list of
 * (selector, attribute) pairs — used for lazy-loaded images where the
 * real URL might be in data-src/data-original rather than src. */
function firstAttr($: CheerioAPI, pairs: Array<[string, string]>): string | null {
  for (const [sel, attr] of pairs) {
    const val = $(sel).first().attr(attr)
    if (val) return val.trim()
  }
  return null
}

function normalizeUrl(src: string): string {
  return src.startsWith('//') ? `https:${src}` : src
}

// ---------- title / brand ----------

function extractTitle($: CheerioAPI): string | null {
  return firstText($, [
    'h1.prod-name',
    '.prod-name',
    'h1[class*="prod-name"]',
    'h1',
  ])
}

function extractBrand($: CheerioAPI): string | null {
  const direct = firstText($, [
    '.prod-brand a',
    '.prod-brand',
    'h3.brand-name',
    '[class*="brand-name"]',
    'a[href*="/brands/"]',
  ])
  if (direct) return direct

  // Ajio often prefixes the <title>/h1 with the brand, e.g.
  // "Nike Running Shoes" — if we found a title but no dedicated brand
  // element, don't guess; better to leave brand null than fabricate one
  // by splitting on whitespace (brand names can be multi-word).
  return null
}

// ---------- price / mrp / discount ----------

function extractPrice($: CheerioAPI): string | null {
  const raw = firstText($, [
    '.prod-sp',
    '[class*="prod-sp"]',
    '.price-container .prod-sp',
    '[class*="selling-price"]',
    '[class*="sp-value"]',
  ])
  return extractPriceNumber(raw)
}

function extractMrp($: CheerioAPI): string | null {
  const raw = firstText($, [
    '.prod-cp',
    '[class*="prod-cp"]',
    'strike',
    'del',
    '[class*="mrp-value"]',
    '[class*="strike-price"]',
  ])
  return extractPriceNumber(raw)
}

// ---------- rating / reviews ----------

function extractRating($: CheerioAPI): string | null {
  const raw = firstText($, [
    '[class*="rating-value"]',
    '[class*="rating-strip"] [class*="value"]',
    '.rating-container .val',
    '[class*="ratingValue"]',
  ])
  if (!raw) return null
  const match = raw.match(/\d+(?:\.\d+)?/)
  return match ? match[0] : null
}

function extractReviewCount($: CheerioAPI): string | null {
  const raw = firstText($, [
    '[class*="rating-count"]',
    '[class*="rat-count"]',
    '[class*="reviewCount"]',
    '.rating-container .rat-count',
  ])
  if (!raw) return null
  const match = raw.replace(/,/g, '').match(/\d+/)
  return match ? match[0] : null
}

// ---------- availability ----------

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

  // Fallback: scan visible button/label text for OOS phrasing, in case
  // the class names above don't match this deploy's markup.
  const bodyText = $('body').text()
  if (OUT_OF_STOCK_PATTERNS.some((re) => re.test(bodyText.slice(0, 20000)))) {
    // Cap the scan length — a full-page regex scan on every request is
    // wasteful, and OOS messaging always appears near the top of the PDP
    // (buy box), not buried in footer/recommendation rails further down.
    return { availability: 'Out of stock', unavailable: true }
  }

  const addToBag = firstText($, ['button[class*="add-to-bag"]', 'button[class*="add-to-cart"]'])
  if (addToBag) return { availability: 'In stock', unavailable: false }

  // No explicit OOS signal and no confirmed add-to-bag button — don't
  // assert either way; let the generic "no availability found" warning
  // in parsers.ts surface instead of guessing.
  return { availability: null, unavailable: false }
}

// ---------- seller ----------

function extractSeller($: CheerioAPI): string | null {
  return firstText($, ['[class*="seller-name"]', '[class*="sold-by"] a', '[class*="sold-by"]'])
}

// ---------- images ----------

function extractImages($: CheerioAPI): string[] {
  const urls = new Set<string>()

  const imgSelectors = [
    '.prod-image-gallery img',
    '[class*="image-gallery"] img',
    '[class*="zoomWindowContainer"] img',
    '[class*="thumbnail"] img',
    'img[src*="assets.ajio.com"]',
    'img[data-src*="assets.ajio.com"]',
  ]

  for (const sel of imgSelectors) {
    $(sel).each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-original')
      if (src) urls.add(normalizeUrl(src))
    })
  }

  return [...urls]
}

// ---------- main parser (tier 2: static fetch / headless render) ----------

export function parseAjio($: CheerioAPI, _url: string): AjioParsed {
  const title = extractTitle($)
  const brand = extractBrand($)
  const price = extractPrice($)
  const mrp = extractMrp($)
  const rating = extractRating($)
  const review_count = extractReviewCount($)
  const { availability, unavailable } = extractAvailability($)
  const seller = extractSeller($)
  const images = extractImages($)

  const result: AjioParsed = {
    title,
    brand,
    price,
    mrp,
    // Ajio is India-only, so hardcoding here is safe and avoids relying
    // on the generic module's LKR default for a site that never sells in
    // that currency.
    currencyCode: 'INR',
    rating,
    review_count,
    availability,
    seller,
    images,
  }

  if (unavailable) {
    result._ajioUnavailable = true
  }

  if (!title && !price) {
    result._ajioWarning =
      'Neither title nor price matched any known Ajio selector — the page may not have finished hydrating, or Ajio has changed its markup since these selectors were last confirmed.'
  }

  return result
}

// ---------- size / colour options (tier 2 only) ----------

/**
 * Reads the currently-selected size and/or colour off a hydrated Ajio
 * PDP. Returns null (rather than an empty object) when neither is found,
 * so callers can distinguish "no variant data on this page" from "found
 * an options object, it's just empty" — consistent with the other
 * SITE_OPTIONS_EXTRACTORS entries in parsers.ts.
 *
 * Note on scope: Ajio's colour swatches typically link out to a
 * *different* PDP URL per colour rather than swapping colour in place on
 * the same page (unlike size, which does swap in place). So "Colour"
 * here reflects whichever colour this specific URL landed on — there's
 * no in-page colour-swap event to observe a "selection" of.
 */
export function extractAjioOptions($: CheerioAPI): Record<string, string> | null {
  const options: Record<string, string> = {}

  const selectedSize = firstText($, [
    '.size-swatch li.selected',
    '[class*="size-swatch"] [class*="selected"]',
    '[class*="size-list"] [class*="active"]',
    '[class*="size"][class*="selected"]',
  ])
  if (selectedSize) options.Size = selectedSize

  const selectedColour =
    firstText($, [
      '[class*="colour-name"]',
      '[class*="color-name"]',
      '[class*="prod-color"]',
    ]) ||
    firstAttr($, [
      ['.colour-swatches .selected img', 'alt'],
      ['[class*="color-swatch"] [class*="selected"] img', 'alt'],
    ])
  if (selectedColour) {
    // Values like "Colour: Black" sometimes come through with the label
    // still attached — strip a leading "Colour:"/"Color:" prefix if
    // present so downstream consumers get just the value.
    const cleaned = selectedColour.replace(/^colou?r\s*:\s*/i, '').trim()
    if (cleaned) options.Color = cleaned
  }

  return Object.keys(options).length ? options : null
}

// ---------- internal-metadata consumption ----------

/**
 * Strips parseAjio's internal `_ajio*` fields off the (already
 * withFallbacks-merged) parsed object and returns them as a plain
 * {warning, unavailable} pair for scrapeProduct to fold into the final
 * ScrapeResult — mirrors consumeMeeshoMeta / consumeMyntraMeta / etc.
 * Also used by the Parse.bot tier below, since mapParseBotProductToAjio
 * sets the same `_ajio*` fields for consistency.
 */
export function consumeAjioMeta(parsed: Record<string, any>): {
  warning: string | null
  unavailable: boolean
} {
  const warning = typeof parsed._ajioWarning === 'string' ? parsed._ajioWarning : null
  const unavailable = !!parsed._ajioUnavailable

  delete parsed._ajioWarning
  delete parsed._ajioUnavailable

  return { warning, unavailable }
}

// ---------------------------------------------------------------------
// TIER 1: Parse.bot hosted API (real HTTP call, not scraping)
// ---------------------------------------------------------------------
// Preferred tier for Ajio when PARSE_API_KEY is set: calls a pre-built
// Parse.bot scraper (id below) that returns structured product JSON
// directly, bypassing fetch + headless-render + all fallback tiers
// entirely for this site — same idea as scrapeEbayProductViaApi /
// scrapeShopifyProduct in parsers.ts, just backed by a third-party
// hosted scraper instead of the platform's own public API.
//
// CONFIRMED response shape (from a real captured Parse.bot response for
// this scraper — get_product_detail on Ajio, a jeans PDP with 4 colour
// options and 4 sizes):
//   { status: "success", data: {
//       code: "{productCode}_{colorSlug}",       // currently-viewed option's code
//       name, brandName,
//       price: { value, currencyIso, displayformattedValue, discountPercent },
//       wasPriceData: { value, displayformattedValue },
//       images: [{ url, format, galleryIndex, imageType }],  // see note below
//       baseOptions: [{ options: [                // <- COLOUR variants
//         { code, color, modelImage: {url},
//           priceData: { value, currencyIso },
//           stock: { stockLevelStatus, stockLevel },
//           variantOptionQualifiers: [{ qualifier: "color", value, swatchImage: {url} }],
//           url }                                  // relative path, e.g. "/slug/p/{code}"
//       ]}],
//       selected: { ...same shape as one baseOptions[].options[] entry... },
//       variantOptions: [{ code, stock: {stockLevel, stockLevelStatus},
//         priceData: {value}, scDisplaySize }],    // <- SIZE variants
//       ratingsResponse: { aggregateRating: { averageRating, numUserRatings,
//         customerOpinionCount, ... } },
//       stock: { stockLevelStatus, stockLevel },   // top-level, for the CURRENT option
//   } }
//
// This is a standard SAP Hybris/Commerce Cloud (OCC) product API shape
// — Ajio runs on Hybris, so Parse.bot is very likely just calling
// Ajio's own backend with the right session/headers rather than
// scraping HTML at all.
//
// `images` note: every photo (identified by `galleryIndex`) repeats once
// per resolution tier (`cartIcon`/`thumbnail` ≈78x98 → `superZoomPdp`
// ≈1117x1400) AND once per `imageType` (PRIMARY duplicates GALLERY's
// galleryIndex-0 entries exactly). See pickBestAjioImages() below —
// without it you get every photo repeated ~5x at the SMALLEST
// resolution first (array order puts cartIcon/thumbnail before
// superZoomPdp), which is exactly the "low quality, duplicated images"
// symptom this was built to fix.
//
// `baseOptions` (colour variants): shape confirmed above and now wired
// into `result.variants` as a "Color" dimension — see
// buildAjioColorDimension() below. Each option's `url` is a relative
// path (no origin) — toAbsoluteAjioUrl() below prefixes it with
// https://www.ajio.com so it's directly usable by the QA tool's
// onSelectVariant re-fetch, the same way every other platform's variant
// tiles work.
//
// "selected" for SIZE is still not determinable from this schema (see
// mapParseBotProductToAjio below) — the request is keyed by colour+code,
// not by a specific size, and nothing in a real captured response marks
// one variantOptions entry as current. COLOUR's "selected", by
// contrast, *is* determinable: top-level `code` (or `selected.code`)
// tells you exactly which baseOptions entry is currently being viewed.

export const PARSE_BOT_SCRAPER_ID = '403a6af9-bd94-47a3-a922-1ea3484b2be8'
const PARSE_BOT_SNAPSHOT_VERSION = '9'

export function ajioParseBotConfigured(): boolean {
  return Boolean(process.env.PARSE_API_KEY)
}

/**
 * Ajio PDP URLs are https://www.ajio.com/{slug}/p/{productCode}_{colorSlug}
 * — Parse.bot's product_id param wants exactly that trailing segment
 * (confirmed against Parse.bot's own docs example:
 * product_id=469544798_black).
 */
export function extractAjioParseBotProductId(url: string): string | null {
  const m = url.match(/\/p\/([A-Za-z0-9]+_[A-Za-z0-9-]+)(?:[/?#]|$)/)
  return m ? m[1] : null
}

export async function fetchAjioViaParseBot(
  url: string,
  opts: { signal?: AbortSignal } = {}
): Promise<{ data: Record<string, any> | null; error: string | null }> {
  const productId = extractAjioParseBotProductId(url)
  if (!productId) {
    return {
      data: null,
      error:
        "Couldn't find a /p/{productCode}_{colorSlug} segment in this Ajio URL — Parse.bot's product_id param needs exactly that.",
    }
  }

  const apiKey = process.env.PARSE_API_KEY
  if (!apiKey) {
    return { data: null, error: 'PARSE_API_KEY is not set.' }
  }

  const endpoint = `https://api.parse.bot/scraper/${PARSE_BOT_SCRAPER_ID}/get_product_detail?product_id=${encodeURIComponent(productId)}`

  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'X-API-Key': apiKey,
        'API-Snapshot-Version': PARSE_BOT_SNAPSHOT_VERSION,
      },
      signal: opts.signal,
    })

    if (!res.ok) {
      const snippet = await readErrorBodySnippet(res).catch(() => null)
      return {
        data: null,
        error: `Parse.bot returned HTTP ${res.status}${snippet ? `: ${snippet}` : ''}`,
      }
    }

    const json = await res.json()
    if (json?.status && json.status !== 'success') {
      return { data: null, error: `Parse.bot reported status "${json.status}" for product_id=${productId}` }
    }

    return { data: json, error: null }
  } catch (e) {
    return {
      data: null,
      error: `Parse.bot request failed: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
}

export type AjioVariantOption = {
  label: string
  price: string | null
  currencyCode: string | null
  image: string | null
  url: string | null
  selected: boolean
  outOfStock?: boolean
}

export type AjioVariantDimension = { dimension: string; options: AjioVariantOption[] }

export type AjioParseBotParsed = AjioParsed & { variants?: AjioVariantDimension[] }

const OOS_STOCK_STATUSES = new Set(['outofstock', 'notifyme', 'discontinued'])

function isVariantInStock(v: any): boolean {
  const level = v?.stock?.stockLevel
  const status = typeof v?.stock?.stockLevelStatus === 'string' ? v.stock.stockLevelStatus.toLowerCase() : null
  if (typeof level === 'number') return level > 0
  if (status) return !OOS_STOCK_STATUSES.has(status)
  // Unknown/missing stock shape — don't assume out-of-stock off a field
  // we can't actually read; let the top-level availability fall back to
  // whatever the aggregate check below decides instead.
  return true
}

// Ajio's PDP origin — every relative URL coming out of baseOptions[].
// options[].url (colour variants) needs this prefix to become something
// the QA tool's onSelectVariant re-fetch (and any real consumer) can
// actually navigate to.
const AJIO_ORIGIN = 'https://www.ajio.com'

function toAbsoluteAjioUrl(path: string | null | undefined): string | null {
  if (!path) return null
  if (/^https?:\/\//i.test(path)) return path
  return `${AJIO_ORIGIN}${path.startsWith('/') ? '' : '/'}${path}`
}

// Rank of each Parse.bot image `format` value by actual pixel
// resolution, confirmed against a real captured response:
//   cartIcon/thumbnail ≈ 78x98, mobileProductListingImage ≈ 288x360,
//   product ≈ 473x593, superZoomPdp ≈ 1117x1400 (the real full-res one).
// Any format not in this map (future/undocumented value) is treated as
// rank 1 — better than the two smallest known tiers, worse than the two
// largest, so a genuinely new format doesn't silently win over
// superZoomPdp nor silently lose to a thumbnail.
const AJIO_IMAGE_FORMAT_RANK: Record<string, number> = {
  cartIcon: 0,
  thumbnail: 0,
  mobileProductListingImage: 1,
  product: 2,
  superZoomPdp: 3,
}

/**
 * Ajio's Parse.bot `images` array repeats every photo once per
 * resolution tier AND once per `imageType` (PRIMARY duplicates
 * GALLERY's galleryIndex-0 entries exactly) — 15-20+ entries for what's
 * usually 4-5 actual photos. Group by `galleryIndex` (the actual photo
 * identity) and keep only the highest-resolution `format` per group, in
 * galleryIndex order. Entries with no `galleryIndex` at all are kept
 * as-is (deduped by exact URL) rather than dropped, since we can't tell
 * if they're a duplicate of anything.
 */
function pickBestAjioImages(rawImages: any[]): string[] {
  const bestByIndex = new Map<number, { url: string; rank: number }>()
  const noIndexUrls: string[] = []

  for (const img of rawImages) {
    const url = img?.url
    if (!url) continue
    const idx = typeof img?.galleryIndex === 'number' ? img.galleryIndex : null
    const rank = AJIO_IMAGE_FORMAT_RANK[img?.format as string] ?? 1

    if (idx == null) {
      if (!noIndexUrls.includes(url)) noIndexUrls.push(url)
      continue
    }

    const existing = bestByIndex.get(idx)
    if (!existing || rank > existing.rank) {
      bestByIndex.set(idx, { url, rank })
    }
  }

  return [
    ...Array.from(bestByIndex.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, v]) => v.url),
    ...noIndexUrls,
  ]
}

/**
 * Builds the "Color" variant dimension from Parse.bot's `baseOptions`
 * (see TIER 1 header comment for the confirmed shape). Returns null when
 * there's nothing to show — either no baseOptions at all, or only a
 * single color (nothing to actually pick between).
 *
 * `selectedCode` should be the top-level `code` (or `selected.code`,
 * same value) from the raw payload — that's what tells us which color
 * this specific URL/response is currently showing.
 */
function buildAjioColorDimension(
  node: Record<string, any>,
  fallbackCurrencyCode: string
): AjioVariantDimension | null {
  const baseOptionGroups: any[] = Array.isArray(node?.baseOptions) ? node.baseOptions : []
  const colorOptionsRaw: any[] = baseOptionGroups.flatMap((g) => (Array.isArray(g?.options) ? g.options : []))
  if (colorOptionsRaw.length < 2) return null // nothing to pick between

  const selectedCode: string | null = node?.selected?.code ?? node?.code ?? null

  return {
    dimension: 'Color',
    options: colorOptionsRaw.map((opt) => {
      // Prefer the dedicated colour swatch image over the full model
      // shot for the tile thumbnail — matches how a real colour swatch
      // tile should look, same idea as Amazon's swatch tiles.
      const colorQualifier = Array.isArray(opt?.variantOptionQualifiers)
        ? opt.variantOptionQualifiers.find((q: any) => q?.qualifier === 'color' && q?.swatchImage?.url)
        : null
      const image = colorQualifier?.swatchImage?.url ?? opt?.modelImage?.url ?? null

      const stockLevel = typeof opt?.stock?.stockLevel === 'number' ? opt.stock.stockLevel : null
      const stockStatus =
        typeof opt?.stock?.stockLevelStatus === 'string' ? opt.stock.stockLevelStatus.toLowerCase() : null
      const outOfStock =
        stockLevel != null ? stockLevel <= 0 : stockStatus ? OOS_STOCK_STATUSES.has(stockStatus) : false

      // `color` comes through ALL CAPS ("BLUE") — title-case it for
      // display ("Blue") rather than showing it shouty in the UI.
      const rawLabel: string = opt?.color ?? colorQualifier?.value ?? 'Unknown'
      const label = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1).toLowerCase()

      return {
        label,
        price: opt?.priceData?.value != null ? String(opt.priceData.value) : null,
        currencyCode: opt?.priceData?.currencyIso ?? fallbackCurrencyCode,
        image,
        url: toAbsoluteAjioUrl(opt?.url),
        selected: !!selectedCode && opt?.code === selectedCode,
        outOfStock,
      }
    }),
  }
}

/**
 * Maps Parse.bot's Hybris-shaped get_product_detail response into the
 * shared AjioParsed shape (plus a `variants` extension for Color and
 * Size). See the TIER 1 header comment above for the confirmed schema.
 */
export function mapParseBotProductToAjio(raw: Record<string, any>): AjioParseBotParsed {
  // Parse.bot wraps the real payload in {data: {...}, status: "success"}.
  const node = raw?.data ?? raw

  const title: string | null = node?.name ?? null
  const brand: string | null = node?.brandName ?? null

  const price = node?.price?.value != null ? String(node.price.value) : null
  const currencyCode: string = node?.price?.currencyIso ?? 'INR'
  const mrp = node?.wasPriceData?.value != null ? String(node.wasPriceData.value) : null

  const rating = node?.ratingsResponse?.aggregateRating?.averageRating
  // numUserRatings ("6.1K") is "how many people left a star rating" —
  // the right pairing for an average-rating badge like "3.0★ (6.1K)".
  // customerOpinionCount ("2509") is a different, smaller number: how
  // many left a full written review. Both are present in the raw
  // response; this keeps the star-rating pairing, not a bug fix, just
  // documenting the two numbers aren't interchangeable.
  const review_count = node?.ratingsResponse?.aggregateRating?.numUserRatings

  const images: string[] = Array.isArray(node?.images) ? pickBestAjioImages(node.images) : []

  const variantOptions: any[] = Array.isArray(node?.variantOptions) ? node.variantOptions : []
  let availability: string | null = null
  let unavailable = false
  if (variantOptions.length) {
    const anyInStock = variantOptions.some(isVariantInStock)
    availability = anyInStock ? 'In stock' : 'Out of stock'
    unavailable = !anyInStock
  } else if (node?.stock?.stockLevelStatus) {
    // No per-size stock list at all (shouldn't normally happen, but
    // don't leave availability null if the top-level stock object is
    // there) — falls back to the stock for the specific option this
    // response represents.
    const topStatus = String(node.stock.stockLevelStatus).toLowerCase()
    unavailable = OOS_STOCK_STATUSES.has(topStatus) || node.stock.stockLevel === 0
    availability = unavailable ? 'Out of stock' : 'In stock'
  }

  const result: AjioParseBotParsed = {
    title,
    brand,
    price,
    mrp,
    currencyCode,
    rating: rating != null ? String(rating) : null,
    review_count: review_count != null ? String(review_count) : null,
    availability,
    // Not present in this schema — Ajio is first-party retail, so a
    // missing "seller" field is expected rather than a parsing miss.
    seller: null,
    images,
  }

  const dimensions: AjioVariantDimension[] = []

  // Color first (matches the on-site left-to-right picker order: colour
  // swatches above size tiles on a real Ajio PDP).
  const colorDimension = buildAjioColorDimension(node, currencyCode)
  if (colorDimension) dimensions.push(colorDimension)

  if (variantOptions.length) {
    dimensions.push({
      dimension: 'Size',
      options: variantOptions.map((v) => ({
        label: v?.scDisplaySize ?? v?.code ?? 'Unknown',
        price: v?.priceData?.value != null ? String(v.priceData.value) : null,
        currencyCode,
        image: null,
        url: null, // size swap is in-page on Ajio, not a separate URL
        // Can't determine which size was "selected" from this payload
        // alone — the request is keyed by colour+code, not by size, and
        // nothing in a real captured response marks one variantOptions
        // entry as current (unlike colour, where top-level `code` tells
        // us exactly). See TIER 1 header comment.
        selected: false,
        outOfStock: !isVariantInStock(v),
      })),
    })
  }

  if (dimensions.length) {
    result.variants = dimensions
  }

  if (unavailable) {
    result._ajioUnavailable = true
  }

  if (!title && price == null) {
    result._ajioWarning = `Parse.bot returned a payload with neither name nor price for this product_id — check the id is valid and the response wasn't an error wrapped as HTTP 200.`
  }

  return result
}

// ---------------------------------------------------------------------
// TIER 3a: Scrapingdog hosted API (real headless-Chrome render, from a
// country-targeted IP, done on THEIR infra)
// ---------------------------------------------------------------------
// Why this sits between the site's own headless-render tier (tier 2,
// in parsers.ts's RENDER_FALLBACK_HOSTS path) and the self-hosted
// TLS-fingerprint tier (tier 4, below): diagnostic logging on this
// deployment's own headless-render tier (real Chromium, real JS
// execution, real browser fingerprint) still got a 403 "Access Denied"
// from Akamai — but critically, the response was routed through
// Akamai's SINGAPORE edge node while the underlying residential IP was
// in Sri Lanka, not India. Ajio is an India-only retailer. That pattern
// — immediate 403, no CAPTCHA challenge offered, from a real browser,
// correlated with a non-Indian edge routing — is a signature of
// geographic blocking, not fingerprint-based bot detection. A real
// Chromium from the wrong country still fails; what's actually missing
// is "real browser rendering FROM AN INDIAN IP," which this deployment's
// own infrastructure can't easily provide without a proxy subscription.
//
// Scrapingdog's dynamic=true + country=in gives exactly that combination
// in one hosted call: their own headless Chrome (solves hydration, same
// as tier 2) from an India-targeted IP (solves the geo-block tier 2's
// own egress IP can't solve on its own).
//
// Cost note (from Scrapingdog's docs): dynamic=true alone is 5 credits;
// dynamic=true + premium=true (residential proxy) together is 25
// credits. country=in does NOT require premium=true — geotargeting
// works on the standard rotating proxy pool too — so this defaults to
// dynamic=true + country=in WITHOUT premium, to stay at 5 credits/call
// rather than 25. Set SCRAPINGDOG_USE_PREMIUM=true if the standard
// pool's Indian IPs are themselves found to be blocked and Scrapingdog's
// residential pool specifically is needed instead.

export const SUPPORTS_SCRAPINGDOG_FALLBACK = true

export function ajioScrapingdogConfigured(): boolean {
  return Boolean(process.env.SCRAPINGDOG_API_KEY)
}

const SCRAPINGDOG_ENDPOINT = 'https://api.scrapingdog.com/scrape'
const SCRAPINGDOG_COUNTRY = process.env.SCRAPINGDOG_COUNTRY || 'in'
const SCRAPINGDOG_USE_PREMIUM = process.env.SCRAPINGDOG_USE_PREMIUM === 'true'
// How long to let Scrapingdog's own headless-render + wait cycle run
// before giving up — separate from this deployment's own fetch
// timeouts, since their `wait` param (below) adds real time on top of
// normal request latency. 35000ms is the documented max for their
// `wait` param itself; give the overall request some headroom above
// that so a slow-but-legitimate render isn't cut off mid-flight.
const SCRAPINGDOG_TIMEOUT_MS = Number(process.env.SCRAPINGDOG_TIMEOUT_MS) || 40000
// Milliseconds Scrapingdog's headless browser waits after page load
// before capturing HTML — needs to be long enough for Ajio's
// client-side hydration (title/price/variant swatches) to finish. Same
// role as RENDER_WAIT_SELECTOR in parsers.ts, but Scrapingdog's API
// takes a flat wait duration rather than a CSS selector to wait for.
const SCRAPINGDOG_WAIT_MS = Number(process.env.SCRAPINGDOG_WAIT_MS) || 6000

export async function fetchAjioViaScrapingdog(
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
    dynamic: 'true',
    country: SCRAPINGDOG_COUNTRY,
    wait: String(SCRAPINGDOG_WAIT_MS),
    ...(SCRAPINGDOG_USE_PREMIUM ? { premium: 'true' } : {}),
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SCRAPINGDOG_TIMEOUT_MS)
  const onExternalAbort = () => controller.abort()
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort()
    else opts.signal.addEventListener('abort', onExternalAbort)
  }

  try {
    const res = await fetch(`${SCRAPINGDOG_ENDPOINT}?${params.toString()}`, {
      signal: controller.signal,
    })

    if (!res.ok) {
      // Scrapingdog returns plain-text error bodies on failure (rate
      // limit, invalid key, target site unreachable even for them,
      // etc.) — surface a snippet so it's clear whether this is a
      // Scrapingdog-side problem (auth/quota) vs. them also getting
      // blocked by Ajio.
      const snippet = await res.text().catch(() => '')
      return {
        html: null,
        error: `Scrapingdog returned HTTP ${res.status}${snippet ? `: ${snippet.slice(0, 300)}` : ''}`,
      }
    }

    const html = await res.text()

    // Same hydration check used by every other Ajio tier — Scrapingdog
    // rendering successfully does NOT guarantee Ajio's specific
    // client-side product markup finished mounting in the time we
    // waited. Reusing hasHydratedAjioMarkup here means this tier is
    // held to the same honesty standard as tiers 2 and 4 rather than
    // reporting a false success on an unhydrated shell.
    if (looksBlocked(html)) {
      return {
        html: null,
        error: `Scrapingdog fetch returned a CAPTCHA/robot-check page even with dynamic=true + country=${SCRAPINGDOG_COUNTRY} — Ajio may be blocking Scrapingdog's IP range specifically, or the block isn't purely geographic/fingerprint-based.`,
      }
    }
    if (!hasHydratedAjioMarkup(html)) {
      return {
        html: null,
        error: `Scrapingdog rendered the page (no block detected) but Ajio's hydrated product markup still isn't present after a ${SCRAPINGDOG_WAIT_MS}ms wait — try raising SCRAPINGDOG_WAIT_MS, or this page may need a real user interaction Scrapingdog's basic dynamic=true doesn't perform.`,
      }
    }

    return { html, error: null }
  } catch (e) {
    return {
      html: null,
      error: `Scrapingdog request failed: ${e instanceof Error ? e.message : String(e)}`,
    }
  } finally {
    clearTimeout(timer)
    if (opts.signal) opts.signal.removeEventListener('abort', onExternalAbort)
  }
}

// ---------------------------------------------------------------------
// TIER 3b: scrape.do hosted API (real headless-Chrome render, from a
// country-targeted IP, done on THEIR infra)
// ---------------------------------------------------------------------
// Same role as the Scrapingdog tier above — render=true gives real JS
// execution (fixes hydration), geoCode=in routes through an Indian exit
// node (fixes the Akamai geo-block diagnosed via the egress-IP/edge-
// routing mismatch found in browser-fetch.ts's diagnostics: a Sri Lanka
// Telecom IP got routed through Akamai's Singapore edge and rejected
// with an immediate 403, no CAPTCHA). Kept as a separate,
// independently-configured tier rather than replacing Scrapingdog
// outright, so either vendor's credentials being valid is enough to
// unblock this site — see the ordering note in parsers.ts's
// ajioFallbackTiers construction for which is tried first.
//
// scrape.do's `super=true` (residential/mobile proxy pool) is their
// equivalent of Scrapingdog's `premium=true` — costs more credits, only
// needed if the standard rotating pool's Indian IPs are themselves found
// to be blocked. Defaulted off for the same reason SCRAPINGDOG_USE_PREMIUM
// defaults off: geoCode alone should already solve a purely geographic
// block without paying for residential IPs on top of it.
//
// NOTE: scrape.do's render tier is synchronous — there's no separate
// "wait N ms after load" param the way Scrapingdog has `wait`. If Ajio's
// hydration turns out to need more settle time than scrape.do's default
// render cycle gives it, the real lever is their `playWithBrowser` action
// list (explicit wait/scroll/click actions), not a flat timeout knob —
// not implemented here since the plain render=true tier is the simpler
// first attempt; revisit if hasHydratedAjioMarkup keeps failing on
// otherwise-clean (non-blocked) responses from this tier specifically.

export const SUPPORTS_SCRAPE_DO_FALLBACK = true

export function ajioScrapeDoConfigured(): boolean {
  return Boolean(process.env.SCRAPE_DO_API_KEY)
}

const SCRAPE_DO_ENDPOINT = 'https://api.scrape.do/'
const SCRAPE_DO_GEO_CODE = process.env.SCRAPE_DO_GEO_CODE || 'in'
const SCRAPE_DO_USE_SUPER = process.env.SCRAPE_DO_USE_SUPER === 'true'
// scrape.do's render tier can legitimately take longer than a plain
// fetch (real headless Chrome render on their end) — separate from this
// deployment's normal fetch timeouts, same role as SCRAPINGDOG_TIMEOUT_MS
// above.
const SCRAPE_DO_TIMEOUT_MS = Number(process.env.SCRAPE_DO_TIMEOUT_MS) || 40000

export async function fetchAjioViaScrapeDo(
  url: string,
  opts: { signal?: AbortSignal } = {}
): Promise<{ html: string | null; error: string | null }> {
  const apiKey = process.env.SCRAPE_DO_API_KEY
  if (!apiKey) {
    return { html: null, error: 'SCRAPE_DO_API_KEY is not set.' }
  }

  const params = new URLSearchParams({
    token: apiKey,
    url,
    render: 'true',
    geoCode: SCRAPE_DO_GEO_CODE,
    ...(SCRAPE_DO_USE_SUPER ? { super: 'true' } : {}),
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SCRAPE_DO_TIMEOUT_MS)
  const onExternalAbort = () => controller.abort()
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort()
    else opts.signal.addEventListener('abort', onExternalAbort)
  }

  try {
    const res = await fetch(`${SCRAPE_DO_ENDPOINT}?${params.toString()}`, {
      signal: controller.signal,
    })

    if (!res.ok) {
      // scrape.do returns a plain-text or JSON error body on failure
      // (bad token, quota exhausted, target unreachable even for them,
      // etc.) — surface a snippet so it's clear whether this is a
      // scrape.do-side problem (auth/quota) vs. them also getting
      // blocked by Ajio.
      const snippet = await res.text().catch(() => '')
      return {
        html: null,
        error: `scrape.do returned HTTP ${res.status}${snippet ? `: ${snippet.slice(0, 300)}` : ''}`,
      }
    }

    const html = await res.text()

    // Same hydration check used by every other Ajio tier — a
    // successful render on scrape.do's end does NOT guarantee Ajio's
    // specific client-side product markup finished mounting by the
    // time their render cycle captured the page.
    if (looksBlocked(html)) {
      return {
        html: null,
        error: `scrape.do fetch returned a CAPTCHA/robot-check page even with render=true + geoCode=${SCRAPE_DO_GEO_CODE} — Ajio may be blocking scrape.do's IP range specifically, or the block isn't purely geographic/fingerprint-based.`,
      }
    }
    if (!hasHydratedAjioMarkup(html)) {
      return {
        html: null,
        error: `scrape.do rendered the page (no block detected) but Ajio's hydrated product markup still isn't present — this page may need explicit wait/scroll actions via scrape.do's playWithBrowser feature that a plain render=true doesn't perform.`,
      }
    }

    return { html, error: null }
  } catch (e) {
    return {
      html: null,
      error: `scrape.do request failed: ${e instanceof Error ? e.message : String(e)}`,
    }
  } finally {
    clearTimeout(timer)
    if (opts.signal) opts.signal.removeEventListener('abort', onExternalAbort)
  }
}

// ---------------------------------------------------------------------
// TIER 4 (final last resort): self-hosted TLS-fingerprint fallback
// ---------------------------------------------------------------------
// Reached only after the direct static fetch, the shared headless-
// browser render tier (parsers.ts's RENDER_FALLBACK_HOSTS), AND both
// hosted-render tiers above (Scrapingdog, scrape.do) have all failed to
// produce usable HTML — and only if PARSE_API_KEY isn't set, since tier
// 1 (Parse.bot) is checked first in parsers.ts.
//
// HONEST SCOPE NOTE: per tls-fetch.ts's own header comment, this fixes
// "Node's HTTP client has a detectably non-browser TLS fingerprint" —
// it does NOT fix an IP-reputation OR geographic block on its own, AND
// (like every client this tier could plausibly use — tls-client, impit,
// or anything else that isn't an actual browser) it does NOT execute
// JavaScript. For Ajio specifically, that second point matters a lot:
// since the real product markup only exists post-hydration, this tier
// can only ever return a genuinely correct result if fingerprint-vs-
// content was the entire problem AND Ajio's server-rendered response
// (before any client JS runs) happens to already contain what's
// needed — which, per parseAjio's header comment, it usually doesn't.
// Given the Scrapingdog/scrape.do tiers above now cover both the
// hydration requirement AND the geo-targeting requirement in one hosted
// call, this tier's realistic remaining job is mainly "cheap final
// attempt when neither hosted vendor is available" rather than a
// primary fix.

export const SUPPORTS_TLS_FINGERPRINT_FALLBACK = true

export function ajioTlsFingerprintConfigured(): boolean {
  // Always "configured" — tls-fetch.ts lazy-loads the optional `impit`
  // dependency and returns a clear error at call time if it's missing,
  // rather than requiring an env var just to attempt it. If you'd rather
  // this tier be opt-in, gate it on an env var here instead, e.g.:
  //   return process.env.ENABLE_TLS_FINGERPRINT_FETCH === 'true'
  return true
}

export async function fetchAjioViaTlsFingerprint(
  url: string,
  opts: { signal?: AbortSignal } = {}
): Promise<{ html: string | null; error: string | null }> {
  const result = await fetchWithTlsFingerprintRetries(url, {
    signal: opts.signal,
    isBlocked: looksBlocked,
    // Generic looksLikeJsRequiredShell() alone is NOT enough here — see
    // hasHydratedAjioMarkup's doc comment above for why. Combining both
    // means: fail the attempt if it's either a CAPTCHA-style shell OR
    // specifically missing Ajio's confirmed hydrated markup, instead of
    // silently accepting an un-hydrated 200 as a "successful" fetch.
    isJsShell: (html) => looksLikeJsRequiredShell(html) || !hasHydratedAjioMarkup(html),
  })

  return { html: result.html, error: result.error }
}