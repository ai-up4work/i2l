// lib/scrape/parsers.ts
import * as cheerio from 'cheerio'
import type { CheerioAPI } from 'cheerio'
import { fetch as undiciFetch, ProxyAgent } from 'undici'
import { cleanText, detectCurrencyAndClean, domainCurrency } from './shared'
import { parseAmazon, extractAmazonOptions } from './extractors/amazon'
import type { AmazonVariantDimension, AmazonSizeChartTable } from './extractors/amazon'
import { parseFlipkart } from './extractors/flipkart'
import {
  parseMeesho,
  SITE_ID as MEESHO_SITE_ID,
  REQUIRES_RENDER_FOR_VARIANTS as MEESHO_REQUIRES_RENDER_FOR_VARIANTS,
  SKIPS_GENERIC_STRUCTURED_FALLBACK as MEESHO_SKIPS_GENERIC_STRUCTURED_FALLBACK,
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
} from './extractors/ajio'
import {
  parseJioMart,
  extractJioMartOptions,
  SITE_ID as JIOMART_SITE_ID,
  REQUIRES_RENDER_FOR_VARIANTS as JIOMART_REQUIRES_RENDER_FOR_VARIANTS,
  consumeJioMartMeta,
} from './extractors/jiomart'
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
  source?: 'direct' | 'scraperapi' | 'shopify_api' | 'woocommerce_api' | 'ebay_api'
  unavailable?: boolean
  _priceSource?: 'meta_description'
}

// Nykaa and TataCliq have been removed entirely (see ScraperQaClient's
// preset list and this module's site-handling below) — no host mapping,
// no parser, no dedicated view. Re-add here first if either comes back.
export type SiteId =
  | 'amazon'
  | 'flipkart'
  | 'meesho'
  | 'ebay'
  | 'myntra'
  | 'ajio'
  | 'snapdeal'
  | 'jiomart'
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

const SITE_HOST_MAP: Array<[string, SiteId]> = [
  ['amazon', 'amazon'],
  ['flipkart', 'flipkart'],
  [MEESHO_SITE_ID, MEESHO_SITE_ID],
  [MYNTRA_SITE_ID, MYNTRA_SITE_ID],
  [EBAY_SITE_ID, EBAY_SITE_ID],
  [AJIO_SITE_ID, AJIO_SITE_ID],
  [SNAPDEAL_SITE_ID, SNAPDEAL_SITE_ID],
  [JIOMART_SITE_ID, JIOMART_SITE_ID],
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

// ---------- Fetching (direct + Apify Proxy fallback, cheerio-parsed) ----------

function looksBlocked(html: string): boolean {
  const sample = html.slice(0, 4000).toLowerCase()
  const blockPhrase =
    /(are you a human|verify you are a human|unusual traffic|robot check|access denied|automated (queries|requests|access)|complete the captcha|solve the captcha|pardon our interruption|permission to access)/.test(
      sample
    )
  if (blockPhrase && html.length < 8000) return true

  const maintenancePhrase =
    /(site maintenance|something went wrong|please contact your administrator|service (is )?(temporarily )?unavailable|we'll be back (soon|shortly))/.test(
      sample
    )
  return maintenancePhrase && html.length < 8000
}

function looksLikeJsRequiredShell(html: string): boolean {
  const sample = html.slice(0, 4000).toLowerCase()
  return /(you need to enable javascript to run this app|enable javascript to (shop|run|use) (on |this )?|javascript is not enabled in (your |the )?browser|please enable javascript)/.test(
    sample
  )
}

async function readErrorBodySnippet(res: Response, maxLen = 300): Promise<string> {
  try {
    const text = await res.text()

    const titleMatch = text.match(/<title[^>]*>([^<]*)<\/title>/i)
    const title = titleMatch?.[1]?.trim()

    if (title) {
      return title.slice(0, maxLen)
    }

    const trimmed = text.trim().replace(/\s+/g, ' ')
    return trimmed ? trimmed.slice(0, maxLen) : ''
  } catch {
    return ''
  }
}

async function fetchDirectOnce(
  url: string,
  headers: HeaderProfile,
  timeoutMs: number,
  dispatcher?: ProxyAgent
): Promise<{ html: string | null; error: string | null; status: number | null }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const fetchImpl = dispatcher ? undiciFetch : fetch
    const res = await fetchImpl(url, {
      headers,
      signal: controller.signal,
      cache: 'no-store',
      ...(dispatcher ? { dispatcher } : {}),
    } as any)
    clearTimeout(timer)
    if (!res.ok) {
      const snippet = await readErrorBodySnippet(res)
      return { html: null, error: `HTTP ${res.status}${snippet ? `: ${snippet}` : ''}`, status: res.status }
    }
    const html = await res.text()
    if (looksBlocked(html)) return { html, error: 'BLOCKED: CAPTCHA/robot-check page', status: res.status }
    if (looksLikeJsRequiredShell(html)) return { html, error: 'JS_SHELL: page requires JavaScript rendering', status: res.status }
    return { html, error: null, status: res.status }
  } catch (e) {
    clearTimeout(timer)
    const cause = e && typeof e === 'object' && 'cause' in e ? (e as any).cause : undefined
    const causeMsg = cause instanceof Error ? cause.message : cause ? String(cause) : null
    const baseMsg = e instanceof Error ? e.message : String(e)
    return {
      html: null,
      error: `Request failed: ${baseMsg}${causeMsg ? ` (cause: ${causeMsg})` : ''}`,
      status: null,
    }
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

const APIFY_PROXY_PASSWORD = process.env.APIFY_PROXY_PASSWORD
const APIFY_PROXY_GROUPS = process.env.APIFY_PROXY_GROUPS || 'RESIDENTIAL'
const APIFY_PROXY_COUNTRY = process.env.APIFY_PROXY_COUNTRY || 'IN'

const PROXY_FALLBACK_HOSTS = new Set<SiteId>(['meesho'])

function apifyProxyUrl(sessionId: string): string {
  const username = `groups-${APIFY_PROXY_GROUPS},country-${APIFY_PROXY_COUNTRY},session-${sessionId}`
  return `http://${username}:${APIFY_PROXY_PASSWORD}@proxy.apify.com:8000`
}

function buildApifyProxyDispatcher(sessionId: string): ProxyAgent | null {
  if (!APIFY_PROXY_PASSWORD) return null
  return new ProxyAgent(apifyProxyUrl(sessionId))
}

const RETRYABLE_STATUSES = new Set([403, 429, 503])

async function fetchDirectWithRetries(
  url: string,
  site: SiteId,
  { timeoutMs = 15000, maxAttempts = 3 }: { timeoutMs?: number; maxAttempts?: number } = {}
): Promise<{ html: string | null; error: string | null }> {
  let lastError: string | null = null
  const primeUrl = PRIME_HOSTS[site]

  let primedCookie: string | undefined
  if (primeUrl) {
    primedCookie = await primeCookies(primeUrl, pickHeaderProfile(0), 5000)
    if (primedCookie) await jitterDelay(150, 400)
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) await jitterDelay(300 + attempt * 200, 900 + attempt * 300)

    const headers = pickHeaderProfile(attempt)
    if (primedCookie) headers['Cookie'] = primedCookie

    const { html, error, status } = await fetchDirectOnce(url, headers, timeoutMs)

    if (html && !error) return { html, error: null }
    if (html) return { html, error }

    lastError = error
    if (status != null && !RETRYABLE_STATUSES.has(status)) break
  }

  if (PROXY_FALLBACK_HOSTS.has(site)) {
    if (!APIFY_PROXY_PASSWORD) {
      lastError = `${lastError ?? 'Fetch failed'} (Apify Proxy fallback skipped: APIFY_PROXY_PASSWORD not set)`
      return { html: null, error: lastError }
    }

    const PROXY_ATTEMPTS = 2
    for (let attempt = 0; attempt < PROXY_ATTEMPTS; attempt++) {
      const sessionId = `${Date.now()}_${attempt}_${Math.floor(Math.random() * 1e6)}`
      const dispatcher = buildApifyProxyDispatcher(sessionId)
      if (!dispatcher) break

      const headers = pickHeaderProfile(attempt)
      const outcome = await fetchDirectOnce(url, headers, timeoutMs, dispatcher)

      setTimeout(() => {
        dispatcher.close().catch(() => {})
      }, 250)

      const { html, error, status } = outcome
      if (html && !error) return { html, error: null }
      if (html) return { html, error: `${error} (via Apify Proxy)` }

      lastError = error ? `${error} (via Apify Proxy)` : lastError
      if (status != null && !RETRYABLE_STATUSES.has(status)) break
      if (attempt < PROXY_ATTEMPTS - 1) await jitterDelay(300, 800)
    }
  }

  return { html: null, error: lastError }
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
// shape. Every tile's `url` is deliberately left null: both providers'
// single-product fetch already returns every variant's price/image/
// availability in the one call the caller already made, so tiles render as
// informational (price/stock visible) rather than clickable.
function buildStoreVariantDimensions(
  product: StoreProduct,
  current: NonNullable<StoreProduct['variants']>[number] | undefined = product.variants?.[0]
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
          url: null,
          selected: v ? v.id === current.id : false,
          outOfStock: v ? !v.available : true,
        }
      }),
    }
  })
}

// lib/scrape/parsers.ts

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

  // Respect a ?variant=<id> query param on the pasted URL, same as a real
  // Shopify storefront would pre-select that variant on page load. Falls
  // back to the first variant in the response when absent or unmatched —
  // same default as before.
  const requestedVariantId = new URL(url).searchParams.get('variant')
  const currentVariant =
    (requestedVariantId && product.variants?.find((v) => v.id === requestedVariantId)) ||
    product.variants?.[0]

  const currentOptions: Record<string, string> | null =
    product.options && currentVariant
      ? Object.fromEntries(
          product.options
            .map((opt, i) => [opt.name, currentVariant.options[i] ?? ''] as const)
            .filter(([, v]) => v)
        )
      : null

  const variants = buildStoreVariantDimensions(product, currentVariant)

  const result: ScrapeResult = {
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
    seller: product.vendor ?? null,
    images: product.images?.length ? product.images : product.image ? [product.image] : [],
    options: currentOptions,
    variants: variants.length ? variants : undefined,
  }

  if (!(currentVariant ? currentVariant.available : product.inStock)) result.unavailable = true

  return result
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
    shipping: item.shipping,
  }

  if (item.ended || item.availability === 'Out of stock') {
    result.unavailable = true
  }
  if (!item.buyingOptions.includes('FIXED_PRICE') && item.buyingOptions.includes('AUCTION')) {
    result.warning = 'This listing is an auction — price shown is the current bid, not a fixed Buy It Now price.'
  }

  return result
}

// ---------- Site-specific parsers ----------
//
// Amazon, Flipkart, Meesho, Myntra, eBay, Ajio, JioMart, and Snapdeal each
// have their own dedicated extractor module (./extractors/*.ts) — split
// out because each has enough site-specific logic (variant swatches,
// availability detection, grid-layout edge cases) to be worth testing in
// isolation. (Nykaa and TataCliq have been removed entirely.)
//
// eBay's entry here (parseEbay/SITE_PARSERS.ebay) is now the FALLBACK
// path only — used when EBAY_APP_ID/EBAY_CERT_ID aren't configured. See
// scrapeEbayProductViaApi above and scrapeProduct's routing below for the
// preferred, credentialed path via eBay's real Browse API.

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
}

const VARIANT_REQUIRES_RENDER = new Set<SiteId>([
  'flipkart',
  ...(MEESHO_REQUIRES_RENDER_FOR_VARIANTS ? [MEESHO_SITE_ID] : []),
  ...(MYNTRA_REQUIRES_RENDER_FOR_VARIANTS ? [MYNTRA_SITE_ID] : []),
  ...(AJIO_REQUIRES_RENDER_FOR_VARIANTS ? [AJIO_SITE_ID] : []),
  ...(JIOMART_REQUIRES_RENDER_FOR_VARIANTS ? [JIOMART_SITE_ID] : []),
  ...(SNAPDEAL_REQUIRES_RENDER_FOR_VARIANTS ? [SNAPDEAL_SITE_ID] : []),
  
])

function hasVariantData(parsed: Record<string, any>): boolean {
  return !!parsed.options || (Array.isArray(parsed.variants) && parsed.variants.length > 0)
}

export async function scrapeProduct(url: string, options: ScrapeProductOptions = {}): Promise<ScrapeResult> {
  const { needVariants = false } = options

  const site = detectSite(url)
  if (!site) {
    return { url, site: null, error: 'Invalid URL' }
  }

  if (site === 'shopify') {
    return await scrapeShopifyProduct(url)
  }

  if (site === 'woocommerce') {
    return await scrapeWooCommerceProduct(url)
  }

  // Prefer the real eBay Browse API whenever credentials are configured —
  // it's authoritative data straight from eBay, not a DOM/JSON-LD guess.
  // Falls through to the legacy scraper below only if EBAY_APP_ID /
  // EBAY_CERT_ID aren't set, so this stays a zero-config upgrade.
  if (site === 'ebay' && ebayCredentialsConfigured()) {
    return await scrapeEbayProductViaApi(url)
  }

  const { html, error } = await fetchDirectWithRetries(url, site)

  if (!html) {
    return { url, site, error: error ?? 'Fetch failed' }
  }

  if (error && error.startsWith('BLOCKED')) {
    return { url, site, error }
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
  const meeshoMeta = consumeMeeshoMeta(parsed)
  const myntraMeta = consumeMyntraMeta(parsed)
  const ebayMeta = consumeEbayMeta(parsed)
  const ajioMeta = consumeAjioMeta(parsed)
  const jiomartMeta = consumeJioMartMeta(parsed)
  const snapdealMeta = consumeSnapdealMeta(parsed)

  const result: ScrapeResult = { url, site, source: 'direct', ...parsed }
  if (error) result.warning = error

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
  if (snapdealMeta.warning) {
    result.warning = (result.warning ? result.warning + ' | ' : '') + snapdealMeta.warning
  }
  if (snapdealMeta.unavailable) {
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