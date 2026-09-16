// lib/scrape/parsers.ts
import * as cheerio from 'cheerio'
import type { CheerioAPI } from 'cheerio'
import { cleanText, detectCurrencyAndClean, domainCurrency, looksBlocked, looksLikeJsRequiredShell, looksLikeShopifyPasswordWall, readErrorBodySnippet } from './shared'
import { fetchRendered } from './browser-fetch'
import { parseAmazon, extractAmazonOptions } from './extractors/amazon'
import type { AmazonVariantDimension, AmazonSizeChartTable } from './extractors/amazon'
import { parseFlipkart } from './extractors/flipkart'
import {
  parseMeesho,
  SITE_ID as MEESHO_SITE_ID,
  REQUIRES_RENDER_FOR_VARIANTS as MEESHO_REQUIRES_RENDER_FOR_VARIANTS,
  SKIPS_GENERIC_STRUCTURED_FALLBACK as MEESHO_SKIPS_GENERIC_STRUCTURED_FALLBACK,
  SUPPORTS_SCRAPERAPI_FALLBACK as MEESHO_SUPPORTS_SCRAPERAPI_FALLBACK,
  meeshoScraperApiConfigured,
  fetchMeeshoViaScraperApi,
  consumeMeeshoMeta,
} from './extractors/meesho'
import {
  parseMyntra,
  SITE_ID as MYNTRA_SITE_ID,
  REQUIRES_RENDER_FOR_VARIANTS as MYNTRA_REQUIRES_RENDER_FOR_VARIANTS,
  consumeMyntraMeta,
} from './extractors/myntra'
import type { MyntraSizeChartTable } from './extractors/myntra'
import {
  parseAjio,
  extractAjioOptions,
  SITE_ID as AJIO_SITE_ID,
  REQUIRES_RENDER_FOR_VARIANTS as AJIO_REQUIRES_RENDER_FOR_VARIANTS,
  consumeAjioMeta,
  SUPPORTS_TLS_FINGERPRINT_FALLBACK as AJIO_SUPPORTS_TLS_FINGERPRINT_FALLBACK,
  ajioTlsFingerprintConfigured,
  fetchAjioViaTlsFingerprint,
  // Parse.bot tier — preferred path for Ajio when PARSE_API_KEY is set.
  // See extractors/ajio.ts's "TIER 1" header comment for the full
  // rationale/priority order across all three Ajio fetch tiers.
  ajioParseBotConfigured,
  fetchAjioViaParseBot,
  mapParseBotProductToAjio,
} from './extractors/ajio'
import {
  parseJioMart,
  extractJioMartOptions,
  SITE_ID as JIOMART_SITE_ID,
  REQUIRES_RENDER_FOR_VARIANTS as JIOMART_REQUIRES_RENDER_FOR_VARIANTS,
  consumeJioMartMeta,
} from './extractors/jiomart'
import {
  SITE_ID as HOPSCOTCH_SITE_ID,
  parseHopscotch,
  extractHopscotchOptions,
  REQUIRES_RENDER_FOR_VARIANTS as HOPSCOTCH_REQUIRES_RENDER_FOR_VARIANTS,
  consumeHopscotchMeta,
  hasHydratedHopscotchMarkup,
} from './extractors/hopscotch'
import {
  parseSnapdeal,
  SITE_ID as SNAPDEAL_SITE_ID,
  REQUIRES_RENDER_FOR_VARIANTS as SNAPDEAL_REQUIRES_RENDER_FOR_VARIANTS,
  consumeSnapdealMeta,
} from './extractors/snapdeal'
import { fetchShopifyProduct } from '@/lib/store-providers/shopify'
import { fetchWooCommerceProduct } from '@/lib/store-providers/woocommerce'
import {
  parseEbayItemUrl,
  fetchEbayItemByLegacyId,
  ebayCredentialsConfigured,
  ebayIsSandbox,
  parseEbay,
  extractEbayOptions,
  SITE_ID as EBAY_SITE_ID,
  REQUIRES_RENDER_FOR_VARIANTS as EBAY_REQUIRES_RENDER_FOR_VARIANTS,
  consumeEbayMeta,
} from '@/lib/scrape/extractors/ebay'
import { parseFirstCry, SITE_ID as FIRSTCRY_SITE_ID } from './extractors/firstcry'
// The five platforms below have no dedicated extractor — each is a thin
// wrapper around the shared OG-tag-only fallback path (see
// extractors/og-only.ts's doc comment for exactly what that does and
// doesn't cover). Build a real extractor for any of these the moment it
// needs variant pickers, MRP, or rating data that OG tags don't carry.
import { consumeFirstCryMeta } from './extractors/firstcry'
import { SITE_ID as NYKAA_SITE_ID, parseNykaa } from './extractors/nykaa'
import { SITE_ID as TATACLIQ_SITE_ID, parseTataCliq } from './extractors/tataCliq'
import { SITE_ID as ALIEXPRESS_SITE_ID, parseAliExpress } from './extractors/aliexpress'
import type { ShopifyProviderConfig, WooCommerceProviderConfig } from '@/lib/store-config'
import type { StoreProduct } from '@/lib/store.types'

export type ScrapeResult = {
  url: string
  site: SiteId | null
  title?: string | null
  brand?: string | null
  price?: string | null
  mrp?: string | null
  currencyCode?: string | null
  rating?: string | null
  review_count?: string | null
  availability?: string | null
  seller?: string | null
  images?: string[]
  options?: Record<string, string> | null
  variants?: AmazonVariantDimension[]
  sizeChart?: (AmazonSizeChartTable | MyntraSizeChartTable)[] | null
  error?: string
  warning?: string
  description?: string | null
  // 'fingerprint_fetch' and 'parsebot' sit alongside 'scraperapi' — all
  // are non-'direct' tiers reached only after (or instead of) the plain
  // fetch + headless-render pipeline. The label tells you which
  // mechanism actually produced the result:
  //   - 'scraperapi': paid residential-proxy API (Meesho)
  //   - 'fingerprint_fetch': self-hosted TLS-fingerprint-matching fetch (Ajio, last resort)
  //   - 'parsebot': Parse.bot hosted scraper API — a real HTTP call
  //     returning structured JSON, not HTML scraping (Ajio, preferred)
  source?: 'direct' | 'scraperapi' | 'fingerprint_fetch' | 'parsebot' | 'shopify_api' | 'woocommerce_api' | 'ebay_api'
  unavailable?: boolean
  /**
   * True when `site` is one of the OG-only platforms (see
   * extractors/og-only.ts) — meaning this result came ENTIRELY from the
   * generic embedded-state/JSON-LD/OG-meta fallback chain in
   * parseHtml() below, not from a real per-site extractor that
   * inspected this page's DOM. No `variants`, MRP, or rating data will
   * ever be present on a result with this flag set. Surfaced in the QA
   * tool's SpecRow so a reviewer isn't misled into thinking a missing
   * field is a bug rather than an expected limitation of this tier.
   */
  ogOnly?: boolean
  _priceSource?: 'meta_description'
  mpn?: string | null
  gtin?: string | null
  categoryPath?: string | null
  itemSpecifics?: { name: string; value: string }[] | null
  quantityAvailable?: number | null
  quantitySold?: number | null
  itemLocation?: string | null
  returnsAccepted?: boolean | null
  returnPeriodDays?: number | null
  paymentMethods?: string[] | null
  topRatedBuying?: boolean
  discountPercentage?: number | null
  bidCount?: number | null
  currentBidPrice?: string | null
  itemEndDate?: string | null
  variantsNote?: string | null
  internalRedirect?: string
}

export type SiteId =
  | 'amazon'
  | 'flipkart'
  | 'meesho'
  | 'ebay'
  | 'myntra'
  | 'ajio'
  | 'snapdeal'
  | 'jiomart'
  | 'firstcry'
  | 'nykaa'
  | 'hopscotch'
  | 'tatacliq'
  | 'tataCliq'
  | 'Aliexpress'
  | 'westside'
  | 'shopify'
  | 'woocommerce'
  | 'generic'

// ---------- Header profiles ----------

type HeaderProfile = Record<string, string>

const HEADER_PROFILES: HeaderProfile[] = [
  {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-IN,en-US;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Upgrade-Insecure-Requests': '1',
    'Referer': 'https://www.google.com/',
    'sec-ch-ua': '"Chromium";v="126", "Not-A.Brand";v="8", "Google Chrome";v="126"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'cross-site',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-User': '?1',
    'Connection': 'keep-alive',
  },
  {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-IN,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Upgrade-Insecure-Requests': '1',
    'Referer': 'https://www.google.com/',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'cross-site',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-User': '?1',
    'Connection': 'keep-alive',
  },
  {
    'User-Agent':
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-IN,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Upgrade-Insecure-Requests': '1',
    'Referer': 'https://www.google.com/',
    'sec-ch-ua': '"Chromium";v="126", "Not-A.Brand";v="8", "Google Chrome";v="126"',
    'sec-ch-ua-mobile': '?1',
    'sec-ch-ua-platform': '"Android"',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'cross-site',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-User': '?1',
    'Connection': 'keep-alive',
  },
  {
    'User-Agent':
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-IN,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Upgrade-Insecure-Requests': '1',
    'Referer': 'https://www.bing.com/',
    'sec-ch-ua': '"Chromium";v="126", "Not-A.Brand";v="8", "Google Chrome";v="126"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Linux"',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'cross-site',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-User': '?1',
    'Connection': 'keep-alive',
  },
]

function pickHeaderProfile(attempt: number): HeaderProfile {
  return { ...HEADER_PROFILES[attempt % HEADER_PROFILES.length] }
}

function jitterDelay(min = 200, max = 700) {
  const ms = min + Math.random() * (max - min)
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// CHANGED: added ['westside', 'westside'] so a westside.com URL is
// recognized by hostname BEFORE the generic SHOPIFY_PRODUCT_PATH_RE
// fallback in detectSite() ever gets a chance to run. Previously there
// was no entry for Westside here, so any westside.com/products/{x} URL
// fell all the way through this loop, matched the generic
// "/products/{handle} path => 'shopify'" heuristic instead, and got
// permanently tagged site: 'shopify' — which is why ItemInfoModal
// rendered ShopifyProductView instead of WestsideProductView even
// though a dedicated 'westside' case already existed there. Westside
// genuinely IS built on Shopify's backend, so rather than just fixing
// the label, scrapeProduct() below still routes 'westside' through the
// real Shopify API (scrapeShopifyProduct) — see scrapeWestsideProduct —
// so the result keeps the high-fidelity variant/stock/price data while
// being honestly tagged as 'westside' for display purposes.
const SITE_HOST_MAP: Array<[string, SiteId]> = [
  ['amazon', 'amazon'],
  ['flipkart', 'flipkart'],
  [MEESHO_SITE_ID, MEESHO_SITE_ID],
  [MYNTRA_SITE_ID, MYNTRA_SITE_ID],
  [EBAY_SITE_ID, EBAY_SITE_ID],
  [AJIO_SITE_ID, AJIO_SITE_ID],
  [SNAPDEAL_SITE_ID, SNAPDEAL_SITE_ID],
  [JIOMART_SITE_ID, JIOMART_SITE_ID],
  // OG-only platforms — see extractors/og-only.ts. Needles are lowercase
  // substrings matched against the lowercased hostname (detectSite
  // below), independent of each SITE_ID constant's own casing.
  ['firstcry', FIRSTCRY_SITE_ID],
  ['nykaa', NYKAA_SITE_ID],
  ['hopscotch', HOPSCOTCH_SITE_ID],
  ['tatacliq', 'tatacliq'],
  ['aliexpress', ALIEXPRESS_SITE_ID],
  ['westside', 'westside'], // CHANGED: added — must be matched by hostname before the /products/ path-shape fallback below claims it as 'shopify'.
]

const SHOPIFY_PRODUCT_PATH_RE = /\/products\/([^/?#]+)/i

const WOOCOMMERCE_PRODUCT_PATH_RE = /\/product\/([^/?#]+)\/?$/i

export function detectSite(url: string): SiteId | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  const host = parsed.hostname.toLowerCase()
  for (const [needle, id] of SITE_HOST_MAP) {
    if (host.includes(needle)) return id
  }
  if (SHOPIFY_PRODUCT_PATH_RE.test(parsed.pathname)) return 'shopify'
  if (WOOCOMMERCE_PRODUCT_PATH_RE.test(parsed.pathname)) return 'woocommerce'
  return 'generic'
}

// ---------- Structured-data fallbacks (SEO metadata) ----------

type StructuredProduct = {
  title?: string | null
  price?: string | null
  mrp?: string | null
  currencyCode?: string | null
  rating?: string | null
  review_count?: string | null
  availability?: string | null
  images: string[]
}

// ---------- Embedded client-state scanner ----------

const PRICE_KEYS = ['price', 'sellingPrice', 'finalPrice', 'offerPrice', 'discountedPrice', 'salePrice', 'sp']
const MRP_KEYS = ['mrp', 'listPrice', 'originalPrice', 'strikePrice', 'maxRetailPrice']
const NAME_KEYS = ['name', 'title', 'productName', 'displayName', 'productDisplayName']
const IMAGE_KEYS = ['image', 'images', 'imageUrl', 'imageUrls', 'productImages', 'searchImage']

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

function collectEmbeddedJsonBlobs($: CheerioAPI, html: string): any[] {
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

  const assignRe = /window\.(__?[A-Za-z0-9_]+)\s*=\s*(\{)/g
  let m: RegExpExecArray | null
  let count = 0
  while ((m = assignRe.exec(html)) && count < 30) {
    count++
    const start = m.index + m[0].length - 1
    const objText = extractBalancedBraces(html, start)
    if (!objText) continue
    try {
      blobs.push(JSON.parse(objText))
    } catch {
      // Common cause: unquoted keys or embedded function refs — skip.
    }
  }

  return blobs
}

function scoreProductNode(node: Record<string, any>): number {
  let s = 0
  for (const k of PRICE_KEYS) if (node[k] != null) s++
  for (const k of NAME_KEYS) if (node[k] != null) s++
  if (node.currency || node.currencyCode) s += 0.5
  for (const k of IMAGE_KEYS) if (node[k] != null) s += 0.5
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

function findMrpNode(root: any, maxDepth = 14): Record<string, any> | null {
  const seen = new Set<any>()
  let found: Record<string, any> | null = null

  function walk(node: any, depth: number) {
    if (!node || typeof node !== 'object' || depth > maxDepth || seen.has(node) || found) return
    seen.add(node)
    if (!Array.isArray(node) && MRP_KEYS.some((k) => node[k] != null)) {
      found = node
      return
    }
    for (const val of Object.values(node)) {
      if (found) return
      if (val && typeof val === 'object') walk(val, depth + 1)
    }
  }

  walk(root, 0)
  return found
}

function structuredFromNode(node: Record<string, any> | null): StructuredProduct | null {
  if (!node) return null
  const priceKey = PRICE_KEYS.find((k) => node[k] != null)
  const mrpKey = MRP_KEYS.find((k) => node[k] != null)
  const nameKey = NAME_KEYS.find((k) => node[k] != null)
  if (!priceKey && !nameKey) return null

  let images: string[] = []
  for (const k of IMAGE_KEYS) {
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
    currencyCode: typeof node.currency === 'string' ? node.currency : typeof node.currencyCode === 'string' ? node.currencyCode : null,
    rating: node.rating != null ? String(node.rating) : node.avgRating != null ? String(node.avgRating) : null,
    review_count: node.reviewCount != null ? String(node.reviewCount) : node.ratingCount != null ? String(node.ratingCount) : null,
    availability: typeof node.availability === 'string' ? node.availability : null,
    images,
  }
}

function extractEmbeddedStateProduct($: CheerioAPI, html: string): StructuredProduct | null {
  const blobs = collectEmbeddedJsonBlobs($, html)

  if (process.env.DEBUG_SCRAPE) {
    console.log('[embedded-state debug] blob count:', blobs.length)
  }

  let bestNode: Record<string, any> | null = null
  let bestScore = 0
  for (const blob of blobs) {
    const node = findProductNode(blob)
    if (node) {
      const s = scoreProductNode(node)
      if (s > bestScore) {
        bestScore = s
        bestNode = node
      }
    }
  }

  let best = structuredFromNode(bestNode)

  if (best && best.mrp == null) {
    for (const blob of blobs) {
      const mrpNode = findMrpNode(blob)
      if (mrpNode) {
        const mrpKey = MRP_KEYS.find((k) => mrpNode[k] != null)!
        const mrpValue = extractNumeric(mrpNode[mrpKey])
        if (mrpValue != null) {
          best = { ...best, mrp: mrpValue }
          break
        }
      }
    }
  }

  return best
}

const IMAGE_BLOCKLIST_PATTERNS = [/logo/i, /sprite/i, /placeholder/i, /\bicon/i, /banner/i, /editor.?_?pick/i]

function normalizeImageUrl(src: string): string {
  return src.startsWith('//') ? `https:${src}` : src
}

function filterLikelyProductImages(images: string[] | undefined): string[] {
  if (!images || !images.length) return []
  const normalized = images.map(normalizeImageUrl)
  const filtered = normalized.filter((src) => !IMAGE_BLOCKLIST_PATTERNS.some((re) => re.test(src)))
  return filtered.length ? filtered : normalized
}

function extractJsonLdProduct($: CheerioAPI): StructuredProduct | null {
  let found: StructuredProduct | null = null

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
        found = {
          title: item.name ?? null,
          price: offers?.price ? String(offers.price) : null,
          currencyCode: offers?.priceCurrency ?? null,
          rating: item.aggregateRating?.ratingValue ? String(item.aggregateRating.ratingValue) : null,
          review_count: item.aggregateRating?.reviewCount ? String(item.aggregateRating.reviewCount) : null,
          availability: offers?.availability ? String(offers.availability).split('/').pop() ?? null : null,
          images: imgs.filter(Boolean),
        }
        break
      }
      if (found) break
    }
  })

  return found
}

function extractOgMeta($: CheerioAPI): StructuredProduct {
  const get = (prop: string) =>
    $(`meta[property="${prop}"]`).attr('content') || $(`meta[name="${prop}"]`).attr('content') || null

  const images = new Set<string>()
  $('meta[property="og:image"]').each((_, el) => {
    const c = $(el).attr('content')
    if (c) images.add(c)
  })

  const priceRaw = get('product:price:amount') || get('og:price:amount')
  return {
    title: get('og:title') || cleanText($('title')),
    price: priceRaw,
    currencyCode: get('product:price:currency') || get('og:price:currency'),
    rating: null,
    review_count: null,
    availability: get('product:availability'),
    images: [...images],
  }
}

function extractMetaDescriptionPrice($: CheerioAPI): { price: string | null; currencyCode: string | null } {
  const desc =
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="description"]').attr('content') ||
    ''
  if (!desc) return { price: null, currencyCode: null }

  const rsMatch = desc.match(/\bRs\.?\s?([\d,]+(?:\.\d+)?)/i)
  if (rsMatch) return { price: rsMatch[1].replace(/,/g, ''), currencyCode: 'INR' }

  const rupeeMatch = desc.match(/₹\s?([\d,]+(?:\.\d+)?)/)
  if (rupeeMatch) return { price: rupeeMatch[1].replace(/,/g, ''), currencyCode: 'INR' }

  const dollarMatch = desc.match(/\$\s?([\d,]+(?:\.\d+)?)/)
  if (dollarMatch) return { price: dollarMatch[1].replace(/,/g, ''), currencyCode: null }

  return { price: null, currencyCode: null }
}

function withFallbacks<T extends Record<string, any>>(primary: T, ...sourcesIn: (StructuredProduct | null)[]): T {
  const merged: any = { ...primary }
  const sources = sourcesIn.filter(Boolean) as StructuredProduct[]

  for (const src of sources) {
    if (merged.currencyCode != null && merged.currencyCode !== '') break
    if (src.currencyCode) {
      merged.currencyCode = src.currencyCode
      break
    }
  }

  for (const key of ['title', 'price', 'mrp', 'rating', 'review_count', 'availability'] as const) {
    if (merged[key] == null || merged[key] === '') {
      for (const src of sources) {
        if ((src as any)[key] != null && (src as any)[key] !== '') {
          merged[key] = (src as any)[key]
          break
        }
      }
    }
  }

  if (!merged.images || merged.images.length === 0) {
    for (const src of sources) {
      if (src.images.length) {
        merged.images = src.images
        break
      }
    }
  }

  return merged
}

const SITE_OPTIONS_EXTRACTORS: Partial<Record<SiteId, ($: CheerioAPI) => Record<string, string> | null>> = {
  amazon: extractAmazonOptions,
  [AJIO_SITE_ID]: extractAjioOptions,
  [JIOMART_SITE_ID]: extractJioMartOptions,
}

// ---------- Fetching (direct + headless-browser + last-resort fallback, cheerio-parsed) ----------

async function fetchDirectOnce(
  url: string,
  headers: HeaderProfile,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<{ html: string | null; error: string | null; status: number | null }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const onExternalAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', onExternalAbort)
  }
  try {
    const res = await fetch(url, {
      headers,
      signal: controller.signal,
      cache: 'no-store',
    })
    clearTimeout(timer)
    if (!res.ok) {
      const snippet = await readErrorBodySnippet(res)
      return { html: null, error: `HTTP ${res.status}${snippet ? `: ${snippet}` : ''}`, status: res.status }
    }
    const html = await res.text()
    if (looksBlocked(html)) return { html, error: `BLOCKED: CAPTCHA/robot-check page. ${describeBlockPage(html)}`, status: res.status }
    if (looksLikeJsRequiredShell(html)) return { html, error: 'JS_SHELL: page requires JavaScript rendering', status: res.status }
    return { html, error: null, status: res.status }
  } catch (e) {
    clearTimeout(timer)
    const cause = e && typeof e === 'object' && 'cause' in e ? (e as any).cause : undefined
    const causeMsg = cause instanceof Error ? cause.message : cause ? String(cause) : null
    const causeCode = cause && typeof cause === 'object' ? (cause as any).code : undefined
    const errCode = e && typeof e === 'object' ? (e as any).code : undefined
    const baseMsg = e instanceof Error ? e.message : String(e)
    const codeSuffix = errCode || causeCode ? ` [code: ${errCode ?? ''}${causeCode ? `/${causeCode}` : ''}]` : ''
    return {
      html: null,
      error: `Request failed: ${baseMsg}${causeMsg ? ` (cause: ${causeMsg})` : ''}${codeSuffix}`,
      status: null,
    }
  } finally {
    if (signal) signal.removeEventListener('abort', onExternalAbort)
  }
}

const PRIME_HOSTS: Partial<Record<SiteId, string>> = {
  meesho: 'https://www.meesho.com/',
}

function mergeCookies(existing: string | undefined, incoming: string[]): string | undefined {
  if (!incoming.length) return existing
  const pairs = incoming.map((c) => c.split(';')[0].trim()).filter(Boolean)
  const merged = existing ? [existing, ...pairs] : pairs
  return merged.join('; ')
}

async function primeCookies(
  primeUrl: string,
  headers: HeaderProfile,
  timeoutMs: number
): Promise<string | undefined> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(primeUrl, { headers, signal: controller.signal, cache: 'no-store' })
    clearTimeout(timer)
    const setCookie: string[] =
      typeof (res.headers as any).getSetCookie === 'function'
        ? (res.headers as any).getSetCookie()
        : res.headers.get('set-cookie')
          ? [res.headers.get('set-cookie') as string]
          : []
    return mergeCookies(undefined, setCookie)
  } catch (e) {
    clearTimeout(timer)
    return undefined
  }
}

// Sites whose static HTML gets blocked/JS-shelled on a plain fetch(), or
// whose variant picker only exists after client-side hydration. Routed
// through a real headless Chromium instance via lib/scrape/browser-fetch.ts.
//
// IMPORTANT: this tier fixes "needs JS to render" problems. It does NOT
// reliably fix IP-reputation blocks — a sophisticated WAF can block
// datacenter/cloud egress IP ranges wholesale regardless of what browser
// is behind them. If a site in this set keeps coming back BLOCKED even
// via the headless tier, that's the likely explanation — see
// LAST_RESORT_FALLBACK below, which is the actual fix for that case
// (and, for Ajio specifically, only if TLS_FETCH_PROXIES is configured
// with IPs you control — see extractors/ajio.ts and lib/scrape/tls-fetch.ts).
//
// UPDATE: 'ajio' added — its static HTML is a normal 200 response, never
// blocked and never caught by the generic looksLikeJsRequiredShell()
// heuristic, but the real product markup (div.prod-sp, h1.prod-name, the
// size/color pickers) only exists after client-side hydration. See
// STATIC_CONTENT_SUFFICIENT below, which is what actually routes Ajio
// into this tier despite its static fetch technically "succeeding".
//
// NOTE: this whole tier (and the TLS-fingerprint tier below it) is now
// skipped entirely for Ajio whenever PARSE_API_KEY is set — see
// scrapeProduct()'s routing near the bottom of this file, which checks
// ajioParseBotConfigured() before ever reaching fetchDirectWithRetries.
const RENDER_FALLBACK_HOSTS = new Set<SiteId>(['meesho', 'ajio', FIRSTCRY_SITE_ID, HOPSCOTCH_SITE_ID])

// Optional per-site selector to wait for before grabbing page.content(),
// so the render tier doesn't snapshot the page before the bit we
// actually need (price/title block) has hydrated in.
const RENDER_WAIT_SELECTOR: Partial<Record<SiteId, string>> = {
  meesho: 'h1, [class*="PriceContainer"]',
  ajio: 'h1.prod-name, div.prod-sp',
  [FIRSTCRY_SITE_ID]: 'span.h1-name, span.prod-price',
  [HOPSCOTCH_SITE_ID]: 'h1, [class*="price"]',
}

// Per-site check for whether a successful (200 OK, not blocked, not
// flagged by the generic looksLikeJsRequiredShell() heuristic) static
// fetch actually contains the real product markup, or is a shell that
// only hydrates client-side. Distinct from looksLikeJsRequiredShell()
// (a generic, site-agnostic heuristic) — this is a site-specific,
// confirmed-selector check, needed because Ajio's shell doesn't trip
// the generic heuristic at all: it's an ordinary 200 response, just
// missing the product block until JS runs. Confirmed against a real
// captured, fully-rendered Ajio PDP (see extractors/ajio.ts's parseAjio
// doc comments) that these two class names are present once the page
// has actually hydrated.
const STATIC_CONTENT_SUFFICIENT: Partial<Record<SiteId, (html: string) => boolean>> = {
  [AJIO_SITE_ID]: (html) => html.includes('class="prod-sp"') || html.includes('class="prod-name"'),
  [FIRSTCRY_SITE_ID]: (html) => html.includes('class="h1-name"') && html.includes('prod-price'),
  [HOPSCOTCH_SITE_ID]: hasHydratedHopscotchMarkup,
}

// ---------- Per-site last-resort fallback registry ----------
//
// Last-resort tier for sites whose block survives even the headless
// tier above. Two mechanisms are registered here, each opted into by
// its own extractor module (same pattern as SITE_OPTIONS_EXTRACTORS
// above — parsers.ts stays generic, the site module owns the mechanics):
//
//   - Meesho: a residential-IP proxy pool (ScraperAPI's product) — the
//     actual fix for an IP-reputation block, not a "better" browser
//     fingerprint. Confirmed via real testing to be necessary for Meesho.
//   - Ajio: a self-hosted TLS-fingerprint-matching fetch (see
//     extractors/ajio.ts + lib/scrape/tls-fetch.ts) — fixes fingerprint-
//     only checks without a third-party API. IMPORTANT: on its own this
//     does NOT fix an IP-reputation block (same class of block Meesho
//     needed ScraperAPI for) — it only does so if TLS_FETCH_PROXIES is
//     configured with IPs you control. Without that env var, this tier
//     mainly helps by avoiding the blocked state in the first place on
//     runs where only fingerprinting (not IP reputation) was the issue.
//     NOTE: this tier is now only reached for Ajio when PARSE_API_KEY is
//     unset — see the routing note on RENDER_FALLBACK_HOSTS above.
//
// `fetch` accepts an optional AbortSignal so a client disconnect (or the
// caller's own overall deadline) can cancel an in-flight call instead of
// letting it run — and, for ScraperAPI, get billed — to completion with
// nobody left to receive the result.
const LAST_RESORT_FALLBACK: Partial<
  Record<
    SiteId,
    {
      configured: () => boolean
      fetch: (
        url: string,
        opts?: { signal?: AbortSignal }
      ) => Promise<{ html: string | null; error: string | null }>
      source: "scraperapi" | "fingerprint_fetch"
    }
  >
> = {}

if (MEESHO_SUPPORTS_SCRAPERAPI_FALLBACK) {
  LAST_RESORT_FALLBACK[MEESHO_SITE_ID] = {
    configured: meeshoScraperApiConfigured,
    fetch: fetchMeeshoViaScraperApi,
    source: "scraperapi",
  }
}

if (AJIO_SUPPORTS_TLS_FINGERPRINT_FALLBACK) {
  LAST_RESORT_FALLBACK[AJIO_SITE_ID] = {
    configured: ajioTlsFingerprintConfigured,
    fetch: fetchAjioViaTlsFingerprint,
    source: "fingerprint_fetch",
  }
}

// ---------------------------------------------------------------------
// Block-page fingerprinting — surfaces WHICH wall we hit, not just that
// we hit one. Both fetchDirectOnce's BLOCKED path and the render tier's
// BLOCKED path previously discarded the actual response HTML once
// looksBlocked() returned true, so every "BLOCKED" error looked
// identical regardless of what was actually served — a generic
// Cloudflare "checking your browser" page and a hard IP-ban page from a
// completely different vendor both just said "BLOCKED: CAPTCHA/robot-
// check page". That made "is this IP reputation or fingerprinting"
// genuinely unanswerable from the error text alone. This pulls the
// <title>, plus known vendor markers if any appear in the raw HTML,
// into the error message itself — the person debugging a failed scrape
// shouldn't need a second round-trip just to find out which WAF they're
// looking at.
const BLOCK_VENDOR_MARKERS: Array<[string, RegExp]> = [
  ['Akamai Bot Manager', /akamai|_abck|ak_bmsc|sensor_data/i],
  ['PerimeterX / HUMAN', /perimeterx|_px3|_pxhd|px-captcha/i],
  ['Cloudflare', /cf-browser-verification|cf_chl_|cloudflare/i],
  ['DataDome', /datadome|dd_cookie_test/i],
  ['Kasada', /kpsdk|x-kpsdk/i],
  ['Imperva / Incapsula', /incapsula|imperva/i],
  ['Google reCAPTCHA', /recaptcha/i],
  ['hCaptcha', /hcaptcha/i],
]

function describeBlockPage(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i)
  const title = titleMatch ? titleMatch[1].trim().slice(0, 120) : null
  const matchedVendors = BLOCK_VENDOR_MARKERS.filter(([, re]) => re.test(html)).map(([name]) => name)

  const parts: string[] = []
  if (title) parts.push(`page title: "${title}"`)
  parts.push(
    matchedVendors.length
      ? `vendor markers found: ${matchedVendors.join(', ')}`
      : 'no recognized bot-mitigation vendor markers found in the HTML (may be a custom/in-house check, or a vendor not in this list)'
  )
  return parts.join(' — ')
}

const RETRYABLE_STATUSES = new Set([403, 429, 503])

async function fetchDirectWithRetries(
  url: string,
  site: SiteId,
  {
    timeoutMs = 15000,
    maxAttempts = 3,
    signal,
  }: { timeoutMs?: number; maxAttempts?: number; signal?: AbortSignal } = {}
): Promise<{ html: string | null; error: string | null; source: 'direct' | 'scraperapi' | 'fingerprint_fetch' }> {
  let lastError: string | null = null
  const primeUrl = PRIME_HOSTS[site]

  let primedCookie: string | undefined
  if (primeUrl) {
    primedCookie = await primeCookies(primeUrl, pickHeaderProfile(0), 5000)
    if (primedCookie) await jitterDelay(150, 400)
  }

  // Site-specific "does this static HTML actually have the real product
  // markup" check (currently only Ajio) — see STATIC_CONTENT_SUFFICIENT
  // above for why this exists separately from the generic
  // looksLikeJsRequiredShell() heuristic used inside fetchDirectOnce.
  const contentCheck = STATIC_CONTENT_SUFFICIENT[site]

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) {
      return { html: null, error: 'Client disconnected', source: 'direct' }
    }
    if (attempt > 0) await jitterDelay(300 + attempt * 200, 900 + attempt * 300)

    const headers = pickHeaderProfile(attempt)
    if (primedCookie) headers['Cookie'] = primedCookie

    const { html, error, status } = await fetchDirectOnce(url, headers, timeoutMs, signal)

    if (html && !error) {
      if (!contentCheck || contentCheck(html)) {
        return { html, error: null, source: 'direct' }
      }
      // Static fetch succeeded (200, not blocked, not a generic
      // JS-shell) but this site's confirmed content check says the real
      // product markup still isn't there — a client-hydrated shell the
      // generic heuristic doesn't catch. Don't keep retrying the same
      // static fetch (a different header profile won't change what's
      // server-rendered) — fall through to the render tier below.
      lastError = 'JS_SHELL: static HTML lacks confirmed product markup — page appears to hydrate client-side'
      break
    }
    if (html) return { html, error, source: 'direct' }

    lastError = error
    if (status != null && !RETRYABLE_STATUSES.has(status)) break
  }

  if (signal?.aborted) {
    return { html: null, error: 'Client disconnected', source: 'direct' }
  }

  // Tracks the render tier's own failure reason separately from
  // `lastError`, which the last-resort fallback below is otherwise free
  // to overwrite. Without this, a failure in the tier that's actually
  // capable of fixing a hydration problem (headless Chromium, real JS
  // execution) gets silently discarded in favor of the last-resort
  // tier's failure — which, for Ajio, is a raw HTTP client that never
  // executes JS and was never going to succeed on a hydration problem in
  // the first place (see fetchAjioViaTlsFingerprint's doc comments). The
  // render-tier reason is almost always the more actionable one to
  // surface to whoever's debugging a failed scrape.
  let renderTierError: string | null = null

  if (RENDER_FALLBACK_HOSTS.has(site)) {
    const rendered = await fetchRendered(url, {
      waitForSelector: RENDER_WAIT_SELECTOR[site],
    })

    if (rendered.html && looksBlocked(rendered.html)) {
      // The headless browser successfully rendered *something*, but
      // that something is itself a block/CAPTCHA wall. Deliberately NOT
      // asserting a cause here (earlier versions of this message
      // guessed "likely an IP-reputation block, not a fingerprint
      // check") — a real JS-executing Chromium getting walled off is
      // just as consistent with browser/behavioral fingerprinting
      // (navigator.webdriver, WebGL renderer, missing interaction
      // events — see browser-fetch.ts's stealth notes) as with IP
      // reputation, and asserting the wrong one sends debugging effort
      // in the wrong direction. If a plain non-JS fetch (e.g. the
      // TLS-fingerprint fallback below) succeeds with a clean response
      // from what's likely the same egress IP, that's actual evidence
      // *against* IP reputation and *for* something specific to the
      // browser tier — but this callsite doesn't have that information
      // yet, so it stays neutral and lets the caller correlate.
      renderTierError = `BLOCKED: CAPTCHA/robot-check page (via headless browser — cause not yet determined: could be IP reputation, or browser/behavioral fingerprinting specific to the headless tier). ${describeBlockPage(rendered.html)}`
      lastError = renderTierError
    } else if (rendered.html && looksLikeJsRequiredShell(rendered.html)) {
      renderTierError = 'JS_SHELL: page still requires JavaScript rendering even via headless browser'
      lastError = renderTierError
    } else if (rendered.html) {
      return { html: rendered.html, error: null, source: 'direct' }
    } else {
      renderTierError = rendered.error ?? lastError
      lastError = renderTierError
    }
  }

  if (signal?.aborted) {
    return { html: null, error: 'Client disconnected', source: 'direct' }
  }

  const lastResortFallback = LAST_RESORT_FALLBACK[site]
  if (lastResortFallback?.configured()) {
    const viaFallback = await lastResortFallback.fetch(url, { signal })
    if (viaFallback.html) {
      return { html: viaFallback.html, error: null, source: lastResortFallback.source }
    }

    // Combine rather than overwrite: the render tier's failure (when
    // there is one) is the actionable signal for what's actually wrong
    // with this scrape — the last-resort tier failing on top of that is
    // expected/secondary, not a replacement diagnosis. See
    // renderTierError's doc comment above.
    if (viaFallback.error) {
      lastError =
        renderTierError && renderTierError !== viaFallback.error
          ? `${renderTierError} | Fallback also failed: ${viaFallback.error}`
          : viaFallback.error
    }
  }

  return { html: null, error: lastError, source: 'direct' }
}

// ---------- Shopify (real API, no scraping) ----------

function extractShopifyHandle(url: string): { origin: string; handle: string } | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  const match = parsed.pathname.match(SHOPIFY_PRODUCT_PATH_RE)
  if (!match) return null
  return { origin: parsed.origin, handle: decodeURIComponent(match[1]) }
}

function buildAdHocShopifyConfig(origin: string, domainHint: string | null): ShopifyProviderConfig {
  return {
    type: 'shopify',
    baseUrl: origin,
    currency: domainHint ?? 'USD',
    headers: {},
  } as ShopifyProviderConfig
}

// Generic over StoreProduct — used by both Shopify and WooCommerce, since
// both providers normalize into the same StoreProduct/StoreProductOption
// shape.
//
// CHANGED: `url` used to always be hardcoded null on every tile ("both
// providers' single-product fetch already returns every variant's price/
// image/availability in the one call the caller already made, so tiles
// render as informational rather than clickable") — but that reasoning
// missed that ItemInfoModal's variant-select flow (onSelectVariant ->
// handleSelectVariant) is URL-driven: it re-calls scrapeProduct(url) with
// whatever url a tile carries, and does nothing at all when url is null.
// With every tile's url hardcoded to null, every size/color swatch was
// effectively disabled/"locked" in the UI — visible (price, stock,
// selected state) but not clickable, even for perfectly in-stock
// alternate sizes (see the Westside "Superstar..." jacket QA case: sizes
// M/L/XL are all in stock but were unselectable).
//
// `variantUrlFor` is an optional callback the caller supplies to turn a
// candidate variant into a real, re-fetchable URL (e.g. the current
// request URL with `?variant=<id>` set — see buildShopifyVariantSelectUrl
// below, used by scrapeShopifyProduct/scrapeWestsideProduct). When the
// caller doesn't supply one (still the case for scrapeWooCommerceProduct,
// which has no equivalent variant-select URL scheme wired up yet), tiles
// fall back to the previous informational-only behavior — this is an
// intentional, pre-existing gap for WooCommerce, not something this
// change tries to solve.
function buildStoreVariantDimensions(
  product: StoreProduct,
  current: NonNullable<StoreProduct['variants']>[number] | undefined = product.variants?.[0],
  variantUrlFor?: (variant: NonNullable<StoreProduct['variants']>[number]) => string | null
): AmazonVariantDimension[] {
  const options = product.options ?? []
  const variants = product.variants ?? []
  if (!options.length || variants.length <= 1 || !current) return []

  return options.map((opt, axisIndex) => {
    const byLabel = new Map<string, (typeof variants)[number]>()
    for (const v of variants) {
      const label = v.options[axisIndex]
      if (!label) continue
      const existing = byLabel.get(label)
      const matchesOtherAxes = v.options.every((val, i) => i === axisIndex || val === current.options[i])
      if (!existing || matchesOtherAxes) byLabel.set(label, v)
    }

    return {
      dimension: opt.name,
      options: opt.values.map((label) => {
        const v = byLabel.get(label)
        return {
          label,
          price: v ? String(v.price) : null,
          currencyCode: product.currency ?? null,
          image: v?.image ?? null,
          // CHANGED: was hardcoded `null`. Now asks the caller-supplied
          // variantUrlFor for a real selectable URL when available, and
          // only falls back to null (informational/non-clickable, the
          // old behavior) when no builder was passed in, or the variant
          // itself is unresolved (v undefined — a label with no matching
          // variant, which shouldn't normally happen but is handled
          // defensively the same way `price`/`image` already are above).
          url: v && variantUrlFor ? variantUrlFor(v) : null,
          selected: v ? v.id === current.id : false,
          outOfStock: v ? !v.available : true,
        }
      }),
    }
  })
}

/**
 * Resolves which variant a scrape request is actually asking for.
 *
 * Storefronts encode the selected variant in a product URL two
 * different ways:
 *   1. Shopify's own numeric variant id — `?variant=41234567890123`
 *   2. Human-readable option query params — `?Color=Brown&Size=S`
 *      (common on headless/custom-frontend stores, e.g. westside.com)
 *
 * Previously this only checked (1), so any URL using form (2) silently
 * fell through to `variants[0]` — an arbitrary "whatever the API
 * happened to return first" variant, which may be out of stock even
 * when the variant the URL actually names is available. That produced
 * false "unavailable" results for in-stock products (see the Westside
 * "Superstar Dark Brown Heart-Detail Hooded Cotton Jacket" QA case:
 * ?Color=Brown&Size=S was resolving to Brown/XS — out of stock —
 * instead of Brown/S, which is in stock).
 */
function findRequestedVariant(
  url: string,
  product: StoreProduct
): NonNullable<StoreProduct['variants']>[number] | undefined {
  const parsedUrl = new URL(url)
  const variants = product.variants
  if (!variants?.length) return undefined

  // 1. Shopify's own numeric variant id, when present — most authoritative.
  const requestedVariantId = parsedUrl.searchParams.get('variant')
  if (requestedVariantId) {
    const byId = variants.find((v) => v.id === requestedVariantId)
    if (byId) return byId
  }

  // 2. Fall back to matching option name=value query params (e.g.
  // Color=Brown&Size=S) against product.options, case-insensitively —
  // how storefronts encode the selected variant when they don't use
  // Shopify's numeric id in the URL.
  if (product.options?.length) {
    const requested: Record<string, string> = {}
    for (const opt of product.options) {
      for (const [key, value] of parsedUrl.searchParams.entries()) {
        if (key.toLowerCase() === opt.name.toLowerCase()) {
          requested[opt.name] = value
          break
        }
      }
    }
    if (Object.keys(requested).length) {
      const matched = variants.find((v) =>
        product.options!.every((opt, i) => {
          const want = requested[opt.name]
          return want == null || v.options[i]?.toLowerCase() === want.toLowerCase()
        })
      )
      if (matched) return matched
    }
  }

  // 3. Nothing in the URL told us which variant was intended — first
  // variant is the least-bad default, same as the old behavior.
  return variants[0]
}

// ---------- Shopify theme-embedded product JSON (fallback when REST + Plus discovery both fail) ----------
//
// Most Shopify themes (the Dawn family especially, which the large
// majority of stores are built on or derived from) embed the FULL
// product object — every variant, real prices, compare-at price, every
// image — directly in the server-rendered HTML, as
// <script type="application/json" id="ProductJson-...">, purely so the
// theme's own client-side JS (variant picker, cart) can read it without
// an extra API call. This is genuinely the SAME data REST's
// /products/{handle}.js would return, just already sitting in the page
// — so a store that's blocked the live .js endpoint (Gymshark's case:
// server-rendered theme, not headless, REST locked down) can often
// still be read at FULL fidelity this way, not just the title/price/
// one-image ceiling the generic OG/JSON-LD fallback is stuck with.
//
// Distinct from extractEmbeddedStateProduct() above: that's a generic
// tree-walking scanner that scores ANY json blob against generic
// PRICE_KEYS/NAME_KEYS heuristics and has no idea prices here are in
// CENTS — Shopify's own convention, not a general one. Picking this up
// through the generic path would silently produce a price 100x too
// high. This extractor specifically recognizes Shopify's product JSON
// shape (variants[].price + .available + .id, a numeric handle-bearing
// product) and handles the cents conversion correctly, the same way
// normaliseShopifyJsProduct in shopify.ts already does for REST's own
// .js response — because structurally this IS that same response
// shape, just delivered a different way.
interface ShopifyThemeJsonVariant {
  id: number | string
  title?: string
  price: number // cents
  compare_at_price?: number | null
  available: boolean
  option1?: string | null
  option2?: string | null
  option3?: string | null
}
interface ShopifyThemeJsonProduct {
  title: string
  vendor?: string
  images?: (string | { src: string })[]
  featured_image?: string
  variants: ShopifyThemeJsonVariant[]
  options?: (string | { name: string; values?: string[] })[]
}

function looksLikeShopifyThemeProduct(node: any): node is ShopifyThemeJsonProduct {
  return (
    node &&
    typeof node === 'object' &&
    typeof node.title === 'string' &&
    Array.isArray(node.variants) &&
    node.variants.length > 0 &&
    node.variants.every((v: any) => v && typeof v.price === 'number' && typeof v.available === 'boolean')
  )
}

function extractShopifyThemeEmbeddedProduct($: CheerioAPI, html: string): ShopifyThemeJsonProduct | null {
  // Tier 1: the id-tagged convention almost every Dawn-family theme
  // uses — highest confidence, since the id itself names the intent.
  let found: ShopifyThemeJsonProduct | null = null
  $('script[type="application/json"]').each((_, el) => {
    if (found) return
    const id = $(el).attr('id') || ''
    if (!/productjson|product-json/i.test(id)) return
    const raw = $(el).html()
    if (!raw) return
    try {
      const parsed = JSON.parse(raw)
      if (looksLikeShopifyThemeProduct(parsed)) found = parsed
    } catch {
      // not valid JSON — skip
    }
  })
  if (found) return found

  // Tier 2: no id-tagged script found — fall back to scanning every
  // embedded JSON blob (same collector the generic path uses) for
  // anything matching Shopify's specific product shape, in case this
  // theme embeds it under a different tag/variable name.
  const blobs = collectEmbeddedJsonBlobs($, html)
  for (const blob of blobs) {
    if (looksLikeShopifyThemeProduct(blob)) return blob
    // Some themes nest it one level deep, e.g. {product: {...}}.
    if (blob && typeof blob === 'object' && looksLikeShopifyThemeProduct((blob as any).product)) {
      return (blob as any).product
    }
  }
  return null
}

function normaliseShopifyThemeJsonProduct(p: ShopifyThemeJsonProduct, url: string): ScrapeResult {
  const variant = p.variants[0]
  const images = (p.images ?? [])
    .map((img) => (typeof img === 'string' ? img : img.src))
    .filter(Boolean)
    .map(normalizeImageUrl)
  const fallbackImage = p.featured_image ? normalizeImageUrl(p.featured_image) : null

  const optionNames = (p.options ?? []).map((o) => (typeof o === 'string' ? o : o.name))
  const options: Record<string, string> | null =
    optionNames.length && variant
      ? Object.fromEntries(
          optionNames
            .map((name, i) => [name, [variant.option1, variant.option2, variant.option3][i] ?? ''] as const)
            .filter(([, v]) => v)
        )
      : null

  return {
    url,
    site: 'shopify',
    source: 'shopify_api',
    title: p.title,
    price: String(variant.price / 100),
    mrp: variant.compare_at_price != null ? String(variant.compare_at_price / 100) : null,
    // Neither the theme JSON nor REST's own .js response ever carries a
    // currency field (see fetchShopifyShopCurrency's doc comment in
    // shopify.ts for why) — domainCurrency is the same best-effort
    // fallback used everywhere else in this file for an unrecognized
    // host, and stays honestly null rather than guessing when even that
    // gives no signal. Downstream (applyScrapeResultToDraft in
    // DashboardContext.tsx) already refuses to auto-price a customer
    // order off a null currencyCode — that safety net is what actually
    // protects against a wrong guess here, not this function pretending
    // to know.
    currencyCode: domainCurrency(url),
    rating: null,
    review_count: null,
    availability: p.variants.some((v) => v.available) ? 'In stock' : 'Out of stock',
    seller: null,
    brand: p.vendor ?? null,
    images: images.length ? images : fallbackImage ? [fallbackImage] : [],
    options,
    unavailable: !p.variants.some((v) => v.available),
  }
}

// CHANGED: new helper. Turns a candidate variant into a URL the modal can
// actually re-fetch to select it — findRequestedVariant (above) already
// checks a `?variant=<id>` query param FIRST, before falling back to
// Color=/Size= matching, so setting that param here works universally for
// any Shopify-backed store's product page, regardless of what query
// format the *original* incoming URL happened to use (Shopify's plain
// numeric ?variant=, or a headless/custom-frontend convention like
// westside.com's ?Color=Brown&Size=S). Shopify's own /products/{handle}.js
// endpoint ignores the query string entirely and always returns the full
// product with every variant — the query param is only ever read by OUR
// OWN findRequestedVariant, so overwriting it here is safe and doesn't
// change what data comes back, only which variant scrapeProduct treats as
// "current" once it does.
function buildShopifyVariantSelectUrl(baseUrl: string, variantId: string): string | null {
  try {
    const u = new URL(baseUrl)
    u.searchParams.set('variant', variantId)
    return u.toString()
  } catch {
    // Malformed baseUrl shouldn't be possible this deep in the pipeline
    // (scrapeProduct already parsed it via `new URL(url)` earlier), but
    // fail safe to the old informational-only behavior rather than
    // throwing and losing the whole scrape over a cosmetic URL feature.
    return null
  }
}

async function scrapeShopifyProduct(url: string): Promise<ScrapeResult> {
  const parsedHandle = extractShopifyHandle(url)
  if (!parsedHandle) {
    return {
      url,
      site: 'shopify',
      error:
        "Couldn't find a /products/{handle} path in this URL — Shopify's public product API is keyed off that path segment.",
    }
  }
  const { origin, handle } = parsedHandle
  const domainHint = domainCurrency(url)
  const config = buildAdHocShopifyConfig(origin, domainHint)

  let product: StoreProduct | null
  try {
    product = await fetchShopifyProduct('shopify', config, new URL(origin).hostname, handle)
  } catch (e) {
    return { url, site: 'shopify', error: e instanceof Error ? e.message : 'Shopify product fetch failed' }
  }

  if (!product) {
    return {
      url,
      site: 'shopify',
      error: `No product found at /products/${handle} — a 404 from Shopify's own .js endpoint, most likely a bad or retired handle.`,
    }
  }

  const currentVariant = findRequestedVariant(url, product)

  const currentOptions: Record<string, string> | null =
    product.options && currentVariant
      ? Object.fromEntries(
          product.options
            .map((opt, i) => [opt.name, currentVariant.options[i] ?? ''] as const)
            .filter(([, v]) => v)
        )
      : null

  // CHANGED: was `buildStoreVariantDimensions(product, currentVariant)` —
  // no url builder, so every tile's url came out null (locked/
  // non-clickable). Now passes buildShopifyVariantSelectUrl so each
  // in-stock size/color tile gets a real `?variant=<id>` URL the modal
  // can re-fetch through onSelectVariant.
  const variants = buildStoreVariantDimensions(product, currentVariant, (v) =>
    buildShopifyVariantSelectUrl(url, v.id)
  )

  // Extra fields ScrapeResult doesn't formally declare yet, carried through
  // the same way scrapeEbayProductViaApi does — so nothing StoreProduct
  // actually returned gets thrown away just because the base ScrapeResult
  // type hasn't caught up to modeling it.
  const result: ScrapeResult & Record<string, any> = {
    url,
    site: 'shopify',
    source: 'shopify_api',
    title: product.name,
    price: currentVariant ? String(currentVariant.price) : String(product.price),
    mrp:
      currentVariant?.compareAtPrice != null
        ? String(currentVariant.compareAtPrice)
        : product.compareAtPrice != null
          ? String(product.compareAtPrice)
          : null,
    currencyCode: product.currency,
    rating: null,
    review_count: null,
    availability: (currentVariant ? currentVariant.available : product.inStock) ? 'In stock' : 'Out of stock',
    // BUGFIX: was `product.vendor` (the manufacturer) — mislabeled AND it
    // silently discarded the real seller/store name. `product.seller` is
    // the field WooCommerce's scraper already reads correctly.
    seller: product.seller ?? null,
    // `vendor` now goes where ScrapeResult already has a dedicated slot
    // for it (same field eBay populates), instead of being discarded.
    brand: product.vendor ?? null,
    images: product.images?.length ? product.images : product.image ? [product.image] : [],
    options: currentOptions,
    variants: variants.length ? variants : undefined,
    // Previously dropped entirely.
    sku: product.sku ?? null,
    description: product.description || null,
    fullDescription: product.fullDescription || null,
    productType: product.productType ?? null,
    category: product.category ?? null,
    tags: product.tags?.length ? product.tags : null,
    sizes: product.sizes?.length ? product.sizes : null,
    colors: product.colors?.length ? product.colors : null,
    gender: product.gender ?? null,
    weightKg: product.weightKg ?? null,
    handle: product.handle,
  }

  if (!(currentVariant ? currentVariant.available : product.inStock)) result.unavailable = true

  return result
}

// CHANGED: new wrapper. Westside's storefront genuinely runs on
// Shopify's backend (its URLs match /products/{handle} just like any
// other Shopify store), so rather than giving Westside its own scraping
// pipeline, this reuses the real, authoritative Shopify API path
// (scrapeShopifyProduct) — full variant/stock/price/currency data,
// findRequestedVariant's Color/Size query-param resolution, etc. — and
// then just relabels the result's `site` back to 'westside' so
// ItemInfoModal's dedicated `case 'westside'` branch (WestsideProductView)
// picks it up instead of the generic ShopifyProductView. Keeps the
// higher-fidelity data source while fixing the mislabeled UI.
//
// On failure (scrapeShopifyProduct returning an `error`), this
// deliberately does NOT relabel — scrapeProduct()'s caller checks
// `result.error` and, on a Shopify-path failure, falls back to the
// generic HTML-scrape pipeline the same way it already does for a
// generic Shopify/WooCommerce detection failure (see
// `fellBackFromStorePlatform` below). Leaving `site: 'shopify'` on the
// error result there is harmless — it's discarded immediately, never
// returned to a caller — and keeps this function a thin, honest pass-
// through rather than duplicating scrapeShopifyProduct's error shape.
async function scrapeWestsideProduct(url: string): Promise<ScrapeResult> {
  const result = await scrapeShopifyProduct(url)
  if (result.error) return result
  return { ...result, site: 'westside' }
}

// ---------- WooCommerce (real API, no scraping) ----------

function extractWooCommerceHandle(url: string): { origin: string; handle: string } | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  const match = parsed.pathname.match(WOOCOMMERCE_PRODUCT_PATH_RE)
  if (!match) return null
  return { origin: parsed.origin, handle: decodeURIComponent(match[1]) }
}

function buildAdHocWooCommerceConfig(origin: string, domainHint: string | null): WooCommerceProviderConfig {
  return {
    type: 'woocommerce',
    baseUrl: origin,
    currency: domainHint ?? 'USD',
    apiMode: 'store_v1',
    headers: {},
  } as WooCommerceProviderConfig
}

async function scrapeWooCommerceProduct(url: string): Promise<ScrapeResult> {
  const parsedHandle = extractWooCommerceHandle(url)
  if (!parsedHandle) {
    return {
      url,
      site: 'woocommerce',
      error:
        "Couldn't find a /product/{slug} path in this URL — that's WooCommerce's default permalink structure. A site using a custom product-base permalink won't be detectable this way.",
    }
  }
  const { origin, handle } = parsedHandle
  const domainHint = domainCurrency(url)
  const config = buildAdHocWooCommerceConfig(origin, domainHint)

  let product: StoreProduct | null
  try {
    product = await fetchWooCommerceProduct('woocommerce', config, handle)
  } catch (e) {
    return {
      url,
      site: 'woocommerce',
      error: e instanceof Error ? e.message : 'WooCommerce product fetch failed',
    }
  }

  if (!product) {
    return {
      url,
      site: 'woocommerce',
      error: `No product found at /product/${handle} via this store's public Store API (/wp-json/wc/store/v1/products) — the site may not run WooCommerce, may use a non-default permalink structure, or may block the public Store API.`,
    }
  }

  const currentVariant = product.variants?.[0]
  const currentOptions: Record<string, string> | null =
    product.options && currentVariant
      ? Object.fromEntries(
          product.options
            .map((opt, i) => [opt.name, currentVariant.options[i] ?? ''] as const)
            .filter(([, v]) => v)
        )
      : null

  const variants = buildStoreVariantDimensions(product)

  const result: ScrapeResult = {
    url,
    site: 'woocommerce',
    source: 'woocommerce_api',
    title: product.name,
    price: String(product.price),
    mrp: product.compareAtPrice != null ? String(product.compareAtPrice) : null,
    currencyCode: product.currency,
    rating: product.averageRating != null ? String(product.averageRating) : null,
    review_count: product.reviewCount != null ? String(product.reviewCount) : null,
    availability: product.inStock ? 'In stock' : 'Out of stock',
    seller: product.seller ?? null,
    images: product.images?.length ? product.images : product.image ? [product.image] : [],
    options: currentOptions,
    variants: variants.length ? variants : undefined,
  }

  if (!product.inStock) result.unavailable = true

  return result
}

// ---------- eBay (real Browse API, no scraping) ----------
//
// Preferred path for eBay whenever EBAY_APP_ID/EBAY_CERT_ID are configured
// (see lib/store-providers/ebay.ts) — this calls eBay's own Browse API
// (getItemByLegacyId) instead of scraping the item page's JSON-LD/DOM.
// scrapeProduct() only falls through to the legacy scraper-based
// SITE_PARSERS.ebay path (parseEbay, below) when those env vars are unset.
//
// SCOPE NOTE: getItemByLegacyId returns full detail for the ONE item/
// variation requested, not a browsable sibling-variant list — so
// `variants` here is read-only info (color/size/etc from
// localizedAspects), not a clickable re-fetching picker like the other
// platform views. See buildVariantDimensions in ebay.ts.
async function scrapeEbayProductViaApi(url: string): Promise<ScrapeResult> {
  const parsedId = parseEbayItemUrl(url)
  if (!parsedId) {
    return {
      url,
      site: 'ebay',
      error:
        "Couldn't find an /itm/<item id> path in this URL — eBay's Browse API is keyed off the numeric legacy item id.",
    }
  }

  let item
  try {
    item = await fetchEbayItemByLegacyId(parsedId.legacyItemId, parsedId.legacyVariationId)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'eBay Browse API request failed'
    return {
      url,
      site: 'ebay',
      error: ebayIsSandbox()
        ? `${msg} — using Sandbox credentials (EBAY_ENV=sandbox / EBAY_CERT_ID starts with SBX-); real item ids won't resolve there. Use Production keys for real listings.`
        : msg,
    }
  }

  // Extra fields EbayProductView.tsx reads defensively via `as any`
  // (sellerFeedbackScore, sellerFeedbackPercent, condition, shipping) —
  // same key names as the old scraper output, now sourced from the API.
  const result: ScrapeResult & Record<string, any> = {
    url,
    site: 'ebay',
    source: 'ebay_api',
    title: item.title,
    price: item.price,
    mrp: item.originalPrice,
    currencyCode: item.currencyCode,
    rating: null,
    review_count: null,
    availability: item.availability,
    seller: item.seller,
    images: item.images,
    variants: item.variants.length ? item.variants : undefined,
    sellerFeedbackScore: item.sellerFeedbackScore != null ? String(item.sellerFeedbackScore) : null,
    sellerFeedbackPercent: item.sellerFeedbackPercent,
    condition: item.condition,
    conditionDescription: item.conditionDescription,
    shipping: item.shipping,
    brand: item.brand,
    mpn: item.mpn,
    gtin: item.gtin,
    categoryPath: item.categoryPath,
    itemSpecifics: item.itemSpecifics.length ? item.itemSpecifics : null,
    quantityAvailable: item.quantityAvailable,
    quantitySold: item.quantitySold,
    itemLocation: item.itemLocation,
    returnsAccepted: item.returnsAccepted,
    returnPeriodDays: item.returnPeriodDays,
    paymentMethods: item.paymentMethods.length ? item.paymentMethods : null,
    topRatedBuying: item.topRatedBuying,
    discountPercentage: item.discountPercentage,
    bidCount: item.bidCount,
    currentBidPrice: item.currentBidPrice,
    itemEndDate: item.itemEndDate,
    variantsNote: item.variantsNote,
  }

  if (item.ended || item.availability === 'Out of stock') {
    result.unavailable = true
  }
  if (!item.buyingOptions.includes('FIXED_PRICE') && item.buyingOptions.includes('AUCTION')) {
    result.warning = 'This listing is an auction — price shown is the current bid, not a fixed Buy It Now price.'
  }

  return result
}

// ---------- Ajio via Parse.bot (real hosted-API call, no scraping) ----------
//
// Preferred path for Ajio whenever PARSE_API_KEY is configured (see
// extractors/ajio.ts's "TIER 1" header comment). Bypasses fetch +
// headless-render + TLS-fingerprint entirely: a single HTTP call to
// Parse.bot returns structured product JSON directly, sourced from
// Ajio's own Hybris/OCC backend rather than scraped HTML.
async function scrapeAjioProductViaParseBot(url: string): Promise<ScrapeResult> {
  const { data, error } = await fetchAjioViaParseBot(url)
  if (!data) {
    return { url, site: AJIO_SITE_ID, error: error ?? 'Parse.bot request failed' }
  }

  const parsed = mapParseBotProductToAjio(data)
  const meta = consumeAjioMeta(parsed as unknown as Record<string, any>)

  const result: ScrapeResult = {
    url,
    site: AJIO_SITE_ID,
    source: 'parsebot',
    ...parsed,
  }
  if (meta.warning) result.warning = meta.warning
  if (meta.unavailable) result.unavailable = true

  return result
}

// ---------- Site-specific parsers ----------
//
// Amazon, Flipkart, Meesho, Myntra, eBay, Ajio, JioMart, and Snapdeal each
// have their own dedicated extractor module (./extractors/*.ts) — split
// out because each has enough site-specific logic (variant swatches,
// availability detection, grid-layout edge cases) to be worth testing in
// isolation.
//
// FirstCry, Nykaa, Hopscotch, Tata CLiQ, and AliExpress do NOT have a
// dedicated extractor — each is wired to the shared makeOgOnlyParser()
// factory in extractors/og-only.ts, which relies entirely on the generic
// embedded-state/JSON-LD/OG-meta fallback chain in parseHtml() below (no
// site-specific DOM selectors). See that file's doc comment for exactly
// what that does and doesn't cover, and ScrapeResult.ogOnly above for how
// this gets surfaced to the QA tool.
//
// Westside is likewise handled without its own dedicated DOM extractor —
// but unlike the OG-only five above, it doesn't fall back to generic
// OG/JSON-LD scraping at all in the normal case: scrapeProduct() routes
// it straight through the real Shopify API (see scrapeWestsideProduct
// above). `parseGeneric` below is registered here only as the SECONDARY
// fallback used if that Shopify-API call itself fails (see
// `fellBackFromStorePlatform` in scrapeProduct()) — same role parseGeneric
// already plays for a plain 'shopify'/'woocommerce' detection that fails.
//
// eBay's entry here (parseEbay/SITE_PARSERS.ebay) is now the FALLBACK
// path only — used when EBAY_APP_ID/EBAY_CERT_ID aren't configured. See
// scrapeEbayProductViaApi above and scrapeProduct's routing below for the
// preferred, credentialed path via eBay's real Browse API.
//
// Ajio's entry here (parseAjio/SITE_PARSERS.ajio) is similarly now the
// FALLBACK path — used when PARSE_API_KEY isn't configured. See
// scrapeAjioProductViaParseBot above and scrapeProduct's routing below
// for the preferred Parse.bot path.

function parseGeneric($: CheerioAPI, url: string) {
  const domainHint = domainCurrency(url)
  return {
    title: cleanText($('h1').first()) || cleanText($('title')),
    price: null as string | null,
    mrp: null as string | null,
    currencyCode: domainHint,
    rating: null,
    review_count: null,
    availability: null,
    seller: null,
    images: [] as string[],
  }
}

const SITE_PARSERS: Record<Exclude<SiteId, 'generic' | 'shopify' | 'woocommerce'>, (($: CheerioAPI, url: string) => Record<string, any>)> = {
  amazon: parseAmazon,
  flipkart: parseFlipkart,
  [MEESHO_SITE_ID]: parseMeesho,
  [MYNTRA_SITE_ID]: parseMyntra,
  [EBAY_SITE_ID]: parseEbay,
  [AJIO_SITE_ID]: parseAjio,
  [JIOMART_SITE_ID]: parseJioMart,
  [SNAPDEAL_SITE_ID]: parseSnapdeal,
  [FIRSTCRY_SITE_ID]: parseFirstCry,
  [NYKAA_SITE_ID]: parseNykaa,
  [HOPSCOTCH_SITE_ID]: parseHopscotch,
  tatacliq: parseTataCliq,
  tataCliq: parseTataCliq,
  [ALIEXPRESS_SITE_ID]: parseAliExpress,
  westside: parseGeneric,
  
}

const SKIP_STRUCTURED_FALLBACK = new Set<SiteId>(
  MEESHO_SKIPS_GENERIC_STRUCTURED_FALLBACK ? [MEESHO_SITE_ID] : []
)

function parseHtml(html: string, url: string, site: Exclude<SiteId, 'shopify' | 'woocommerce'>): Record<string, any> {
  const $ = cheerio.load(html)
  const rawParsed = site === 'generic' ? parseGeneric($, url) : SITE_PARSERS[site]($, url)

  const embedded = extractEmbeddedStateProduct($, html)

  const parsed: Record<string, any> & { options?: Record<string, string> | null } = SKIP_STRUCTURED_FALLBACK.has(site)
    ? withFallbacks(rawParsed, embedded)
    : withFallbacks(rawParsed, embedded, extractJsonLdProduct($), extractOgMeta($))

  let usedMetaDescriptionPrice = false
  if (parsed.price == null) {
    const metaPrice = extractMetaDescriptionPrice($)
    if (metaPrice.price != null) {
      parsed.price = metaPrice.price
      if (!parsed.currencyCode && metaPrice.currencyCode) parsed.currencyCode = metaPrice.currencyCode
      usedMetaDescriptionPrice = true
    }
  }

  parsed.images = filterLikelyProductImages(parsed.images)

  const optionsExtractor = SITE_OPTIONS_EXTRACTORS[site]
  if (optionsExtractor) {
    const opts = optionsExtractor($)
    if (opts) parsed.options = opts
  }

  if (parsed.price == null && parsed.mrp != null) {
    parsed.price = parsed.mrp
  }

  if (!parsed.currencyCode) {
    parsed.currencyCode = 'LKR'
  }

  if (usedMetaDescriptionPrice) {
    parsed._priceSource = 'meta_description'
  }

  return parsed
}

// ---------- Entry point ----------

export type ScrapeProductOptions = {
  needVariants?: boolean
  /** Propagated from the incoming HTTP request (e.g. Next.js's
   * `request.signal`) all the way down through fetchDirectWithRetries
   * and into whichever last-resort fetcher is registered — so a client
   * disconnecting stops in-flight upstream calls (including a paid
   * ScraperAPI request) instead of them running — and being billed —
   * to completion with nobody left to receive the result. */
  signal?: AbortSignal
}

const VARIANT_REQUIRES_RENDER = new Set<SiteId>([
  'flipkart',
  ...(MEESHO_REQUIRES_RENDER_FOR_VARIANTS ? [MEESHO_SITE_ID] : []),
  ...(MYNTRA_REQUIRES_RENDER_FOR_VARIANTS ? [MYNTRA_SITE_ID] : []),
  ...(AJIO_REQUIRES_RENDER_FOR_VARIANTS ? [AJIO_SITE_ID] : []),
  ...(JIOMART_REQUIRES_RENDER_FOR_VARIANTS ? [JIOMART_SITE_ID] : []),
  ...(SNAPDEAL_REQUIRES_RENDER_FOR_VARIANTS ? [SNAPDEAL_SITE_ID] : []),
  ...(HOPSCOTCH_REQUIRES_RENDER_FOR_VARIANTS ? [HOPSCOTCH_SITE_ID] : []),
])

function hasVariantData(parsed: Record<string, any>): boolean {
  return !!parsed.options || (Array.isArray(parsed.variants) && parsed.variants.length > 0)
}

export async function scrapeProduct(url: string, options: ScrapeProductOptions = {}): Promise<ScrapeResult> {
  const { needVariants = false, signal } = options

  let site = detectSite(url)
  if (!site) {
    return { url, site: null, error: 'Invalid URL' }
  }

  // detectSite's 'shopify'/'woocommerce' classification for an
  // unrecognized host is a URL-SHAPE GUESS ONLY (any /products/{x} path
  // -> 'shopify', any /product/{x} path -> 'woocommerce' — see
  // SHOPIFY_PRODUCT_PATH_RE / WOOCOMMERCE_PRODUCT_PATH_RE above), not a
  // confirmed fact about the site's actual platform. Plenty of
  // non-Shopify/non-WooCommerce stores use the exact same URL
  // convention — and even a CONFIRMED real Shopify store might be a
  // headless Shopify Plus setup (Hydrogen/Oxygen), which
  // scrapeShopifyProduct() -> fetchShopifyProduct() already tries via
  // REST first and the Storefront GraphQL discovery tier second (see
  // lib/store-providers/shopify-plus.ts) — so a Shopify failure at this
  // point has already exhausted both of Shopify's own tiers, not just
  // the basic one. What it HASN'T tried is the possibility that this
  // isn't a Shopify store at all, which the generic HTML-scraping
  // pipeline below can often still read something out of (title/image
  // at minimum, same as any other 'generic' site — see og-only.ts). A
  // failed attempt now falls through into that generic pipeline instead
  // of giving up, with `site` reassigned to 'generic' so the result
  // honestly reflects what actually happened rather than still claiming
  // 'shopify'.
  //
  // CHANGED: 'westside' now gets the exact same treatment as 'shopify'
  // (real API first, generic-fallback-on-failure second) — see the
  // dedicated `else if (site === 'westside')` branch below and
  // scrapeWestsideProduct's doc comment above for why this is routed
  // through the real Shopify API rather than getting its own scraping
  // pipeline.
  //
  // Tracked separately from `site` (which gets reassigned to 'generic'
  // below) so the result can still be honestly marked ogOnly even
  // though it didn't go through makeOgOnlyParser()/the SITE_HOST_MAP
  // og-only registration — it has the exact same limitations (no
  // variants, no MRP, no rating, often only one image), so it should
  // read that way to anyone consuming the result, not look like richer
  // data than it actually is just because the URL happened to guess
  // 'shopify' first.
  let fellBackFromStorePlatform = false

  if (site === 'shopify') {
    const shopifyResult = await scrapeShopifyProduct(url)
    if (!shopifyResult.error) return shopifyResult
    site = 'generic'
    fellBackFromStorePlatform = true
  } else if (site === 'westside') {
    // CHANGED: new branch. Westside is a Shopify-backed storefront, so
    // this hits the real Shopify API first via scrapeWestsideProduct
    // (which internally calls scrapeShopifyProduct and just relabels
    // `site` back to 'westside' on success) — same real variant/stock/
    // price data a plain Shopify URL would get, but correctly tagged so
    // ItemInfoModal renders WestsideProductView instead of
    // ShopifyProductView. On failure, falls through to the generic
    // HTML-scrape pipeline below (parseGeneric, registered for
    // 'westside' in SITE_PARSERS), exactly like the 'shopify' branch
    // above does for its own failures.
    const westsideResult = await scrapeWestsideProduct(url)
    if (!westsideResult.error) return westsideResult
    site = 'generic'
    fellBackFromStorePlatform = true
  } else if (site === 'woocommerce') {
    const wooResult = await scrapeWooCommerceProduct(url)
    if (!wooResult.error) return wooResult
    site = 'generic'
    fellBackFromStorePlatform = true
  } else {
    // Prefer the real eBay Browse API whenever credentials are configured —
    // it's authoritative data straight from eBay, not a DOM/JSON-LD guess.
    // Falls through to the legacy scraper below only if EBAY_APP_ID /
    // EBAY_CERT_ID aren't set, so this stays a zero-config upgrade.
    if (site === 'ebay' && ebayCredentialsConfigured()) {
      return await scrapeEbayProductViaApi(url)
    }

    // Prefer Parse.bot's hosted Ajio scraper whenever PARSE_API_KEY is
    // configured — real structured JSON from Ajio's own backend, skipping
    // fetch + headless-render + TLS-fingerprint entirely for this site.
    // Falls through to the legacy scraping pipeline below only if
    // PARSE_API_KEY is unset, so this is a zero-config upgrade just like
    // the eBay branch above.
    if (site === AJIO_SITE_ID && ajioParseBotConfigured()) {
      return await scrapeAjioProductViaParseBot(url)
    }
  }

  const { html, error, source } = await fetchDirectWithRetries(url, site, { signal })

  if (!html) {
    return { url, site, error: error ?? 'Fetch failed' }
  }

  if (error && error.startsWith('BLOCKED')) {
    return { url, site, error }
  }

  // This HTML was only fetched because REST + Plus discovery both
  // failed (fellBackFromStorePlatform) — before trying to extract
  // anything from it, rule out the one case where there's genuinely
  // nothing to extract: the store itself is gated behind Shopify's own
  // password/"coming soon" wall. This is a MERCHANT choice, not a bot
  // block — no fetch tier can or should get past it (see
  // looksLikeShopifyPasswordWall's doc comment) — so this returns a
  // clear, specific error instead of letting it fall through to the
  // theme-JSON/generic parsers, which would otherwise either find
  // nothing and report a confusing generic "no title/price found", or
  // worse, misparse the password page's own form/copy as if it were
  // product content.
  if (fellBackFromStorePlatform && looksLikeShopifyPasswordWall(html)) {
    return {
      url,
      site,
      error:
        "This store is behind Shopify's password/\"coming soon\" wall — it hasn't launched publicly yet, or access is deliberately restricted. No scraping method can or should get past that; this isn't something to retry.",
    }
  }

  // This HTML was only fetched because REST + Plus discovery both
  // failed (fellBackFromStorePlatform) — before giving up to the fully
  // generic OG/JSON-LD parse below, check whether the theme itself
  // embedded the real product JSON (see extractShopifyThemeEmbeddedProduct's
  // doc comment above). When it's there, this is strictly better data
  // — real per-variant prices/stock/images, not a title+one-image
  // ceiling — for the exact same page load, no extra request needed.
  if (fellBackFromStorePlatform) {
    try {
      const $ = cheerio.load(html)
      const themeProduct = extractShopifyThemeEmbeddedProduct($, html)
      if (themeProduct) return normaliseShopifyThemeJsonProduct(themeProduct, url)
    } catch {
      // Fall through to the generic parse below — a malformed/unexpected
      // theme JSON shape shouldn't take down the one fallback tier that
      // was already working before this was added.
    }
  }

  let parsed: Record<string, any>
  try {
    parsed = parseHtml(html, url, site)
  } catch (e) {
    return { url, site, error: `Parsing failed: ${e instanceof Error ? e.message : String(e)}` }
  }

  const priceSource = parsed._priceSource
  delete parsed._priceSource
  const amazonGridWarning = (parsed as any)._amazonGridWarning
  delete (parsed as any)._amazonGridWarning
  const amazonUnavailable = (parsed as any)._amazonUnavailable
  delete (parsed as any)._amazonUnavailable
  const flipkartWarning = (parsed as any)._flipkartWarning
  delete (parsed as any)._flipkartWarning
  const flipkartUnavailable = (parsed as any)._flipkartUnavailable
  delete (parsed as any)._flipkartUnavailable
  // Consumed the same way as the per-site *Warning/*Unavailable flags
  // above — set by makeOgOnlyParser() in extractors/og-only.ts for the
  // five OG-only platforms, and surfaced as ScrapeResult.ogOnly.
  const ogOnly = (parsed as any)._ogOnly
  delete (parsed as any)._ogOnly
  const meeshoMeta = consumeMeeshoMeta(parsed)
  const myntraMeta = consumeMyntraMeta(parsed)
  const ebayMeta = consumeEbayMeta(parsed)
  const ajioMeta = consumeAjioMeta(parsed)
  const jiomartMeta = consumeJioMartMeta(parsed)
  const firstCryMeta = consumeFirstCryMeta(parsed)
  const hopscotchMeta = consumeHopscotchMeta(parsed)
  const result: ScrapeResult = { url, site, source, ...parsed }
  if (error) result.warning = error
  if (ogOnly) result.ogOnly = true
  if (fellBackFromStorePlatform) {
    result.ogOnly = true
    result.warning =
      (result.warning ? result.warning + ' | ' : '') +
      "Detected as Shopify/WooCommerce by URL shape, but neither the store's public API nor headless-store discovery worked — this data came from the page's own JSON-LD/OG tags only, same limitations as any generic site (no variants, MRP, or rating)."
  }

  if (priceSource === 'meta_description') {
    result.warning = (result.warning ? result.warning + ' | ' : '') +
      'Price was inferred from page metadata text, not the live price element — double-check it.'
  }
  if (amazonGridWarning) {
    result.warning = (result.warning ? result.warning + ' | ' : '') + amazonGridWarning
  }
  
  if (amazonUnavailable) {
    result.unavailable = true
  }
  if (flipkartWarning) {
    result.warning = (result.warning ? result.warning + ' | ' : '') + flipkartWarning
  }
  if (flipkartUnavailable) {
    result.unavailable = true
  }
  if (meeshoMeta.warning) {
    result.warning = (result.warning ? result.warning + ' | ' : '') + meeshoMeta.warning
  }
  if (meeshoMeta.unavailable) {
    result.unavailable = true
  }
  if (myntraMeta.warning) {
    result.warning = (result.warning ? result.warning + ' | ' : '') + myntraMeta.warning
  }
  if (myntraMeta.unavailable) {
    result.unavailable = true
  }
  if (ebayMeta.warning) {
    result.warning = (result.warning ? result.warning + ' | ' : '') + ebayMeta.warning
  }
  if (ebayMeta.unavailable) {
    result.unavailable = true
  }
  if (ajioMeta.warning) {
    result.warning = (result.warning ? result.warning + ' | ' : '') + ajioMeta.warning
  }
  if (ajioMeta.unavailable) {
    result.unavailable = true
  }
  if (jiomartMeta.warning) {
    result.warning = (result.warning ? result.warning + ' | ' : '') + jiomartMeta.warning
  }
  if (jiomartMeta.unavailable) {
    result.unavailable = true
  }
  if (firstCryMeta.warning) {
    result.warning = (result.warning ? result.warning + ' | ' : '') + firstCryMeta.warning
  }
  if (firstCryMeta.unavailable) {
    result.unavailable = true
  }
  
  if (hopscotchMeta.warning) {
    result.warning = (result.warning ? result.warning + ' | ' : '') + hopscotchMeta.warning
  }
  if (hopscotchMeta.unavailable) {
    result.unavailable = true
  }
  

  if (!result.title) {
    result.warning =
      (result.warning ? result.warning + ' | ' : '') +
      "Could not find a title — page structure may have changed, or the request was blocked/captcha'd."
  }
  if (result.price == null) {
    result.warning =
      (result.warning ? result.warning + ' | ' : '') +
      'No price found in the fetched HTML — the page may genuinely omit price, its layout changed, or the price only appears after client-side JS runs.'
  }
  if (needVariants && VARIANT_REQUIRES_RENDER.has(site) && !hasVariantData(result)) {
    result.warning =
      (result.warning ? result.warning + ' | ' : '') +
      "Variant data (size/color picker) was requested, but this site's picker is known to render client-side and no JS-rendering fetch tier is configured — it will not appear from a static HTML fetch."
  }

  return result
}