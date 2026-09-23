// lib/scrape/extractors/ajio.ts
import type { CheerioAPI } from 'cheerio'
import { cleanText, looksBlocked, looksLikeJsRequiredShell, readErrorBodySnippet } from '../shared'
import { fetchWithTlsFingerprintRetries } from '../tls-fetch'

// ---------------------------------------------------------------------
// Ajio (www.ajio.com) product-page extractor.
//
// FIVE tiers exist for this site, tried in this priority order by
// parsers.ts's scrapeProduct():
//
//   1. Parse.bot hosted API (PARSE_BOT section below) — structured JSON
//      straight from Ajio's Hybris/OCC backend. Preferred whenever
//      PARSE_API_KEY is configured; skips every other tier.
//   2. Direct fetch + headless-render (parseAjio/parseHtml below) — the
//      original scraping path. Ajio's static response is a normal 200,
//      but the product markup only exists after client-side hydration.
//   3a. Scrapingdog hosted API — real headless render from an
//       India-targeted IP (Ajio's block is geographic, not fingerprint).
//   3b. scrape.do hosted API — same role as 3a, different vendor.
//   4. Self-hosted TLS-fingerprint fetch — last resort; never executes
//      JS so it cannot solve hydration on its own.
//
// Tier-2 selectors are fallback *chains* because Ajio's hashed class
// names churn. `prod-name` and `prod-sp` are the two classes confirmed
// against a real, fully-rendered PDP; everything else is best-effort.
// ---------------------------------------------------------------------

export const SITE_ID = 'ajio' as const

// Size/colour pickers are populated client-side after hydration, so
// callers needing `options`/`variants` on tiers 2-4 must use the render
// tier. (Parse.bot returns variants directly in JSON.)
export const REQUIRES_RENDER_FOR_VARIANTS = true

// Single source of truth for "does this HTML contain Ajio's hydrated
// product markup" — shared by the static-fetch tier (via parsers.ts's
// STATIC_CONTENT_SUFFICIENT), the TLS-fingerprint tier, Scrapingdog and
// scrape.do so none of them report a false success on an un-hydrated
// shell. The generic looksLikeJsRequiredShell() does NOT catch Ajio's
// shell (it's an ordinary 200).
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
  // Internal-only; stripped by consumeAjioMeta() before reaching callers.
  _ajioWarning?: string
  _ajioUnavailable?: boolean
}

// ---------- small local helpers ----------

/** Pulls the first run of digits (with optional decimal) out of a price
 * string like "₹1,499" or "Rs. 2,999.00". */
function extractPriceNumber(text: string | null | undefined): string | null {
  if (!text) return null
  const cleaned = text.replace(/,/g, '')
  const match = cleaned.match(/\d+(?:\.\d+)?/)
  return match ? match[0] : null
}

/** Cleaned text from the first selector (in order) that yields text. */
function firstText($: CheerioAPI, selectors: string[]): string | null {
  for (const sel of selectors) {
    const text = cleanText($(sel).first())
    if (text) return text
  }
  return null
}

/** First non-empty attribute value across (selector, attribute) pairs. */
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
  return firstText($, ['h1.prod-name', '.prod-name', 'h1[class*="prod-name"]', 'h1'])
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
  // Don't guess by splitting the title — brand names can be multi-word.
  return null
}

// ---------- price / mrp ----------

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

  // Cap the scan — OOS messaging is always near the top (buy box).
  const bodyText = $('body').text()
  if (OUT_OF_STOCK_PATTERNS.some((re) => re.test(bodyText.slice(0, 20000)))) {
    return { availability: 'Out of stock', unavailable: true }
  }

  const addToBag = firstText($, ['button[class*="add-to-bag"]', 'button[class*="add-to-cart"]'])
  if (addToBag) return { availability: 'In stock', unavailable: false }

  // No explicit signal either way — don't guess.
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
    // Ajio is India-only; avoids the generic module's LKR default.
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
 * PDP. Returns null when neither is found. Colour swatches on Ajio link
 * to a different PDP URL per colour, so "Colour" is whichever colour
 * this URL landed on.
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
    firstText($, ['[class*="colour-name"]', '[class*="color-name"]', '[class*="prod-color"]']) ||
    firstAttr($, [
      ['.colour-swatches .selected img', 'alt'],
      ['[class*="color-swatch"] [class*="selected"] img', 'alt'],
    ])
  if (selectedColour) {
    const cleaned = selectedColour.replace(/^colou?r\s*:\s*/i, '').trim()
    if (cleaned) options.Color = cleaned
  }

  return Object.keys(options).length ? options : null
}

// ---------- internal-metadata consumption ----------

/**
 * Strips parseAjio's internal `_ajio*` fields off the parsed object and
 * returns them as {warning, unavailable} for scrapeProduct to fold into
 * the final ScrapeResult. Also used by the Parse.bot tier.
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
// CONFIRMED response shape (get_product_detail on Ajio):
//   { status: "success", data: {
//       code: "{productCode}_{colorSlug}",
//       name, brandName, description, summary,
//       price: { value, currencyIso, discountPercent, discountValue },
//       wasPriceData: { value },
//       images: [{ url, format, galleryIndex, imageType }],
//       baseOptions: [{ options: [ ...colour variants... ] }],
//       selected: { ...one baseOptions[].options[] entry... },
//       variantOptions: [{ code, scDisplaySize, stock: {stockLevel,
//         stockLevelStatus}, priceData }],            // SIZE variants
//       featureData: [{ name, featureValues: [{value}] }],   // Fit, Fabric...
//       rilfnlBreadCrumbList: { rilfnlBreadCrumb: [{name, url, linkClass?}] },
//       fnlColorVariantData: { sizeGuideDesktop: "<JSON STRING>", ... },
//       potentialPromotions: [{ code, description(HTML), maxSavingPrice,
//         restrictedToNewUser, endTime }],
//       prepaidOffers: [{ description, thresholdAmount, priority,
//         offerCode, endDate(ms) }],
//       mandatoryInfo: [{ key, title }],
//       isReturnable, tagResponse.tag.categoryTags[], ratingsResponse,
//       stock: { stockLevelStatus, stockLevel },      // capped at maxQuantity
//   } }
//
// `images`: every photo repeats once per resolution tier AND per
// imageType — see pickBestAjioImages().
// SIZE "selected" isn't determinable from this payload; COLOUR's is
// (top-level `code`).

export const PARSE_BOT_SCRAPER_ID = '403a6af9-bd94-47a3-a922-1ea3484b2be8'
const PARSE_BOT_SNAPSHOT_VERSION = '9'

export function ajioParseBotConfigured(): boolean {
  return Boolean(process.env.PARSE_API_KEY)
}

/**
 * Ajio PDP URLs are https://www.ajio.com/{slug}/p/{productCode}_{colorSlug}
 * — Parse.bot's product_id wants exactly that trailing segment. Query
 * strings (itm_source=...) are ignored by the regex.
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

// ---------- Parse.bot output types ----------

export type AjioVariantOption = {
  label: string
  price: string | null
  currencyCode: string | null
  image: string | null
  url: string | null
  selected: boolean
  outOfStock?: boolean
  /** Units left for this option (sizes only). */
  stockLevel?: number | null
  /** True when Ajio flags the option as "lowStock". */
  lowStock?: boolean
}

export type AjioVariantDimension = { dimension: string; options: AjioVariantOption[] }

export type AjioSizeChartTable = { title: string; headers: string[]; rows: string[][] }

export type AjioOffer = {
  kind: 'coupon' | 'payment'
  code: string | null
  description: string
  maxSaving: number | null
  minOrder: number | null
  newUsersOnly: boolean
  endsAt: string | null
}

export type AjioParseBotParsed = AjioParsed & {
  variants?: AjioVariantDimension[]
  description?: string | null
  discountPercentage?: number | null
  categoryPath?: string | null
  itemSpecifics?: { name: string; value: string }[] | null
  quantityAvailable?: number | null
  returnsAccepted?: boolean | null
  returnPeriodDays?: number | null
  sizeChart?: AjioSizeChartTable[] | null
  offers?: AjioOffer[] | null
  legalInfo?: { name: string; value: string }[] | null
  urgencyTag?: string | null
}

// ---------- Parse.bot helpers ----------

const OOS_STOCK_STATUSES = new Set(['outofstock', 'notifyme', 'discontinued'])

function isVariantInStock(v: any): boolean {
  const level = v?.stock?.stockLevel
  const status = typeof v?.stock?.stockLevelStatus === 'string' ? v.stock.stockLevelStatus.toLowerCase() : null
  if (typeof level === 'number') return level > 0
  if (status) return !OOS_STOCK_STATUSES.has(status)
  // Unknown stock shape — don't assume out-of-stock.
  return true
}

const AJIO_ORIGIN = 'https://www.ajio.com'

function toAbsoluteAjioUrl(path: string | null | undefined): string | null {
  if (!path) return null
  if (/^https?:\/\//i.test(path)) return path
  return `${AJIO_ORIGIN}${path.startsWith('/') ? '' : '/'}${path}`
}

/** Strips HTML (and "View All Products>" style anchors) to plain text. */
function stripHtml(s: unknown): string {
  return typeof s === 'string'
    ? s
        .replace(/<a\b[^>]*>.*?<\/a>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    : ''
}

// Pixel-resolution rank of each Parse.bot image `format`:
//   cartIcon/thumbnail ≈ 78x98, mobileProductListingImage ≈ 288x360,
//   product ≈ 473x593, superZoomPdp ≈ 1117x1400.
// Unknown formats rank 1: above the two smallest, below the two largest.
const AJIO_IMAGE_FORMAT_RANK: Record<string, number> = {
  cartIcon: 0,
  thumbnail: 0,
  mobileProductListingImage: 1,
  product: 2,
  superZoomPdp: 3,
}

/**
 * Groups by `galleryIndex` (the photo's identity) and keeps only the
 * highest-resolution `format` per group, in galleryIndex order. Entries
 * with no galleryIndex are kept (deduped by URL).
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
 * "Color" variant dimension from `baseOptions`. Null when there's
 * nothing to pick between (0 or 1 colours). Selected colour comes from
 * `selected.code` / top-level `code`.
 */
function buildAjioColorDimension(
  node: Record<string, any>,
  fallbackCurrencyCode: string
): AjioVariantDimension | null {
  const baseOptionGroups: any[] = Array.isArray(node?.baseOptions) ? node.baseOptions : []
  const colorOptionsRaw: any[] = baseOptionGroups.flatMap((g) => (Array.isArray(g?.options) ? g.options : []))
  if (colorOptionsRaw.length < 2) return null

  const selectedCode: string | null = node?.selected?.code ?? node?.code ?? null

  return {
    dimension: 'Color',
    options: colorOptionsRaw.map((opt) => {
      const colorQualifier = Array.isArray(opt?.variantOptionQualifiers)
        ? opt.variantOptionQualifiers.find((q: any) => q?.qualifier === 'color' && q?.swatchImage?.url)
        : null
      const image = colorQualifier?.swatchImage?.url ?? opt?.modelImage?.url ?? null

      const stockLevel = typeof opt?.stock?.stockLevel === 'number' ? opt.stock.stockLevel : null
      const stockStatus =
        typeof opt?.stock?.stockLevelStatus === 'string' ? opt.stock.stockLevelStatus.toLowerCase() : null
      const outOfStock =
        stockLevel != null ? stockLevel <= 0 : stockStatus ? OOS_STOCK_STATUSES.has(stockStatus) : false

      // `color` comes through ALL CAPS ("OFF WHITE") — title-case it.
      const rawLabel: string = opt?.color ?? colorQualifier?.value ?? 'Unknown'
      const label = rawLabel
        .toLowerCase()
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')

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
 * Size chart from `fnlColorVariantData.sizeGuideDesktop` — a JSON
 * *string*, so it needs JSON.parse. Bookkeeping columns (Universal/Brand
 * Size + Format) are dropped; each measurement shows inches and cm.
 */
function buildAjioSizeChart(node: Record<string, any>): AjioSizeChartTable[] | null {
  const raw = node?.fnlColorVariantData?.sizeGuideDesktop
  if (typeof raw !== 'string' || !raw.trim()) return null

  let guide: any
  try {
    guide = JSON.parse(raw)
  } catch {
    return null
  }

  const tables: AjioSizeChartTable[] = []
  for (const chart of Array.isArray(guide?.sizechart) ? guide.sizechart : []) {
    const sizes: any[] = Array.isArray(chart?.brickBrandSizes) ? chart.brickBrandSizes : []
    if (!sizes.length) continue

    const cols: string[] = (sizes[0]?.sizeChartAttributes ?? [])
      .map((a: any) => String(a?.attributeName ?? ''))
      .filter((n: string) => n && !/^(universal|brand) size/i.test(n))
    if (!cols.length) continue

    tables.push({
      title: chart?.measurementType ?? 'Size chart',
      headers: ['Size', ...cols.map((c) => c.replace(/_attribute$/, ''))],
      rows: sizes.map((s) => [
        String(s?.sizeName ?? ''),
        ...cols.map((c) => {
          const a = (s?.sizeChartAttributes ?? []).find((x: any) => x?.attributeName === c)
          if (!a) return '—'
          const cm = Number(a.convertedAttributeValue)
          return Number.isFinite(cm) ? `${a.attributeValue}" / ${cm.toFixed(1)} cm` : String(a.attributeValue)
        }),
      ]),
    })
  }

  return tables.length ? tables : null
}

/**
 * Coupons (`potentialPromotions`) + bank/UPI offers (`prepaidOffers`).
 * `offerAmount` is ambiguous (₹150 vs 10%, `absolute` unreliable), so
 * payment offers keep only their description text + min-order threshold,
 * top 5 by Ajio's own priority.
 */
function buildAjioOffers(node: Record<string, any>): AjioOffer[] | null {
  const coupons: AjioOffer[] = (Array.isArray(node?.potentialPromotions) ? node.potentialPromotions : []).map(
    (p: any): AjioOffer => ({
      kind: 'coupon',
      code: p?.code ?? null,
      description: stripHtml(p?.description),
      maxSaving: typeof p?.maxSavingPrice === 'number' ? p.maxSavingPrice : null,
      minOrder: null,
      newUsersOnly: !!p?.restrictedToNewUser,
      endsAt: typeof p?.endTime === 'string' ? p.endTime : null,
    })
  )

  const payment: AjioOffer[] = [...(Array.isArray(node?.prepaidOffers) ? node.prepaidOffers : [])]
    .sort((a, b) => (b?.priority ?? 0) - (a?.priority ?? 0))
    .slice(0, 5)
    .map(
      (o: any): AjioOffer => ({
        kind: 'payment',
        code: o?.offerCode ?? null,
        description: stripHtml(o?.description),
        maxSaving: null,
        minOrder: typeof o?.thresholdAmount === 'number' ? o.thresholdAmount : null,
        newUsersOnly: false,
        endsAt: typeof o?.endDate === 'number' ? new Date(o.endDate).toISOString() : null,
      })
    )

  const all = [...coupons, ...payment].filter((o) => o.description)
  return all.length ? all : null
}

/** `featureData` (Fit, Fabric, Neckline, Wash Care...) → itemSpecifics. */
function buildAjioItemSpecifics(node: Record<string, any>): { name: string; value: string }[] | null {
  const features: any[] = Array.isArray(node?.featureData) ? node.featureData : []
  const out = features
    .map((f) => ({
      name: String(f?.name ?? '').trim(),
      value: (Array.isArray(f?.featureValues) ? f.featureValues : [])
        .map((fv: any) => String(fv?.value ?? '').trim())
        .filter(Boolean)
        .join(', '),
    }))
    .filter((f) => f.name && f.value)
  return out.length ? out : null
}

/** Breadcrumb → "Men > Western Wear > Sweatshirt & Hoodies" (drops the
 * trailing entry for the product itself, which carries linkClass "active"). */
function buildAjioCategoryPath(node: Record<string, any>): string | null {
  const crumbs: any[] = Array.isArray(node?.rilfnlBreadCrumbList?.rilfnlBreadCrumb)
    ? node.rilfnlBreadCrumbList.rilfnlBreadCrumb
    : []
  const names = crumbs
    .filter((c) => c?.linkClass !== 'active')
    .map((c) => String(c?.name ?? '').trim())
    .filter(Boolean)
  return names.length ? names.join(' > ') : null
}

/** `mandatoryInfo` (Marketed By, Country Of Origin, Net Qty...). */
function buildAjioLegalInfo(node: Record<string, any>): { name: string; value: string }[] | null {
  const info: any[] = Array.isArray(node?.mandatoryInfo) ? node.mandatoryInfo : []
  const out = info
    .map((i) => ({ name: String(i?.key ?? '').trim(), value: String(i?.title ?? '').trim() }))
    .filter((i) => i.name && i.value)
  return out.length ? out : null
}

/** First URGENCY tag, e.g. "Selling Fast". */
function buildAjioUrgencyTag(node: Record<string, any>): string | null {
  const tags: any[] = Array.isArray(node?.tagResponse?.tag?.categoryTags) ? node.tagResponse.tag.categoryTags : []
  const urgency = tags.find((t) => t?.category === 'URGENCY' && t?.primary?.value)
  return urgency?.primary?.value ?? null
}

/**
 * Maps Parse.bot's Hybris-shaped get_product_detail response into the
 * AjioParseBotParsed shape (base fields + variants, size chart, offers,
 * specifics, return policy, etc.).
 */
export function mapParseBotProductToAjio(raw: Record<string, any>): AjioParseBotParsed {
  // Parse.bot wraps the payload in {data: {...}, status: "success"}.
  const node = raw?.data ?? raw

  const title: string | null = node?.name ?? null
  const brand: string | null = node?.brandName ?? null

  const price = node?.price?.value != null ? String(node.price.value) : null
  const currencyCode: string = node?.price?.currencyIso ?? 'INR'
  const mrp = node?.wasPriceData?.value != null ? String(node.wasPriceData.value) : null

  const discountValue = node?.price?.discountValue
  const discountPercentage: number | null =
    typeof discountValue === 'number' && discountValue > 0
      ? discountValue
      : price != null && mrp != null && Number(mrp) > Number(price)
        ? Math.round((1 - Number(price) / Number(mrp)) * 100)
        : null

  const rating = node?.ratingsResponse?.aggregateRating?.averageRating
  // numUserRatings = star-rating count (pairs with the average);
  // customerOpinionCount = written reviews — a different, smaller number.
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
    const topStatus = String(node.stock.stockLevelStatus).toLowerCase()
    unavailable = OOS_STOCK_STATUSES.has(topStatus) || node.stock.stockLevel === 0
    availability = unavailable ? 'Out of stock' : 'In stock'
  }

  // Total units across all sizes. (The top-level `stock.stockLevel` is
  // capped at maxQuantity, e.g. 10, so it understates real stock.)
  const sizeStockLevels = variantOptions
    .map((v) => v?.stock?.stockLevel)
    .filter((n): n is number => typeof n === 'number')
  const quantityAvailable: number | null = sizeStockLevels.length
    ? sizeStockLevels.reduce((a, b) => a + b, 0)
    : typeof node?.stock?.stockLevel === 'number'
      ? node.stock.stockLevel
      : null

  const rawReturnable = node?.isReturnable ?? node?.selected?.isReturnable
  const returnsAccepted: boolean | null =
    typeof rawReturnable === 'boolean'
      ? rawReturnable
      : typeof rawReturnable === 'string'
        ? rawReturnable.toLowerCase() === 'true'
        : null
  const rawWindow = node?.selected?.returnWindow ?? node?.fnlProductData?.returnWindow
  const returnPeriodDays: number | null = typeof rawWindow === 'number' ? rawWindow : null

  const description = stripHtml(node?.description) || stripHtml(node?.summary) || null

  const result: AjioParseBotParsed = {
    title,
    brand,
    price,
    mrp,
    currencyCode,
    rating: rating != null ? String(rating) : null,
    review_count: review_count != null ? String(review_count) : null,
    availability,
    // Ajio is first-party retail; a missing "seller" is expected.
    seller: null,
    images,
    description,
    discountPercentage,
    categoryPath: buildAjioCategoryPath(node),
    itemSpecifics: buildAjioItemSpecifics(node),
    quantityAvailable,
    returnsAccepted,
    returnPeriodDays,
    sizeChart: buildAjioSizeChart(node),
    offers: buildAjioOffers(node),
    legalInfo: buildAjioLegalInfo(node),
    urgencyTag: buildAjioUrgencyTag(node),
  }

  const dimensions: AjioVariantDimension[] = []

  // Color first (matches on-site order: swatches above size tiles).
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
        // Can't tell which size is "current" from this payload alone.
        selected: false,
        outOfStock: !isVariantInStock(v),
        stockLevel: typeof v?.stock?.stockLevel === 'number' ? v.stock.stockLevel : null,
        lowStock: v?.stock?.stockLevelStatus === 'lowStock',
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
// Diagnostics showed the deployment's own headless tier getting an
// immediate 403 from Akamai's Singapore edge with a Sri Lanka IP — a
// signature of geographic blocking. Scrapingdog's dynamic=true +
// country=in gives a real browser render FROM an Indian IP in one call.
//
// Cost: dynamic=true alone is 5 credits; +premium=true is 25.
// country=in works on the standard pool, so premium defaults OFF; set
// SCRAPINGDOG_USE_PREMIUM=true only if the standard pool is blocked.

export const SUPPORTS_SCRAPINGDOG_FALLBACK = true

export function ajioScrapingdogConfigured(): boolean {
  return Boolean(process.env.SCRAPINGDOG_API_KEY)
}

const SCRAPINGDOG_ENDPOINT = 'https://api.scrapingdog.com/scrape'
const SCRAPINGDOG_COUNTRY = process.env.SCRAPINGDOG_COUNTRY || 'in'
const SCRAPINGDOG_USE_PREMIUM = process.env.SCRAPINGDOG_USE_PREMIUM === 'true'
// Their `wait` param maxes at 35000ms; leave headroom above it.
const SCRAPINGDOG_TIMEOUT_MS = Number(process.env.SCRAPINGDOG_TIMEOUT_MS) || 40000
// Wait after page load so Ajio's client-side hydration can finish.
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
      // Plain-text error bodies — surface a snippet so it's clear whether
      // this is auth/quota on Scrapingdog's side vs. Ajio blocking them.
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
        error: `Scrapingdog fetch returned a CAPTCHA/robot-check page even with dynamic=true + country=${SCRAPINGDOG_COUNTRY} — Ajio may be blocking Scrapingdog's IP range specifically, or the block isn't purely geographic/fingerprint-based.`,
      }
    }
    // A successful render does NOT guarantee Ajio's markup mounted in time.
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
// Same role as Scrapingdog: render=true fixes hydration, geoCode=in
// fixes the geo-block. Kept as an independently-configured sibling so
// whichever vendor has a valid credential is used (ordering lives in
// parsers.ts's ajioFallbackTiers).
//
// `super=true` (residential/mobile pool) is off by default, same reason
// as SCRAPINGDOG_USE_PREMIUM. scrape.do has no flat "wait N ms" param;
// if hydration needs more settle time, the lever is their
// `playWithBrowser` action list — not implemented here.

export const SUPPORTS_SCRAPE_DO_FALLBACK = true

export function ajioScrapeDoConfigured(): boolean {
  return Boolean(process.env.SCRAPE_DO_API_KEY)
}

const SCRAPE_DO_ENDPOINT = 'https://api.scrape.do/'
const SCRAPE_DO_GEO_CODE = process.env.SCRAPE_DO_GEO_CODE || 'in'
const SCRAPE_DO_USE_SUPER = process.env.SCRAPE_DO_USE_SUPER === 'true'
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
      const snippet = await res.text().catch(() => '')
      return {
        html: null,
        error: `scrape.do returned HTTP ${res.status}${snippet ? `: ${snippet.slice(0, 300)}` : ''}`,
      }
    }

    const html = await res.text()

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
// Reached only after direct fetch, headless render, and both hosted
// tiers fail — and only if PARSE_API_KEY isn't set.
//
// HONEST SCOPE NOTE: this fixes "Node's TLS fingerprint looks
// non-browser". It does NOT fix IP-reputation or geographic blocks, and
// it never executes JS — so for Ajio (product markup exists only after
// hydration) it can only succeed if the server-rendered response already
// contains what's needed, which it usually doesn't. Realistic job now:
// a cheap final attempt when no hosted vendor is configured.

export const SUPPORTS_TLS_FINGERPRINT_FALLBACK = true

export function ajioTlsFingerprintConfigured(): boolean {
  // Always "configured" — tls-fetch.ts lazy-loads `impit` and errors at
  // call time if missing. To make this opt-in, gate on an env var:
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
    // Generic looksLikeJsRequiredShell() alone doesn't catch Ajio's
    // shell (see hasHydratedAjioMarkup) — combine both checks.
    isJsShell: (html) => looksLikeJsRequiredShell(html) || !hasHydratedAjioMarkup(html),
  })

  return { html: result.html, error: result.error }
}