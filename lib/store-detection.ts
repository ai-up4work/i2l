// lib/store-detection.ts
//
// Given a store's URL, works out whether it's running on Shopify,
// WooCommerce, or neither — so a non-technical admin can paste a URL and
// have the right extractor picked for them, instead of hand-picking
// "Shopify" vs "WooCommerce" vs "Custom JSON" off a menu they don't
// understand.
//
// Server-side only. Import this from a route handler, not a client
// component — most storefronts don't send CORS headers that would let a
// browser fetch these endpoints directly, and requests to an arbitrary
// third-party domain shouldn't originate from the admin's browser anyway.
//
// Detection is signal-based rather than a single yes/no check, because
// either platform can be customized enough that any one signal alone can
// mislead: a Shopify store on a fully custom theme might not expose
// `Shopify.shop` in its markup, and a WooCommerce store can disable or
// restrict its REST API. Combining a couple of independent signals per
// platform and preferring the higher-confidence match is more reliable
// than trusting the first thing that happens to respond.

export type DetectedProviderType = 'shopify' | 'woocommerce' | 'none'

export interface StoreDetectionResult {
  type: DetectedProviderType
  baseUrl: string
  confidence: 'high' | 'medium' | 'low'
  /** Human-readable reasons behind the verdict — shown to the admin so a
   * wrong guess is easy to understand and correct rather than a black box. */
  signals: string[]
  storeName?: string
  currency?: string
  /** Only set when type is 'none' — why detection came up empty. */
  reason?: string
}

const FETCH_TIMEOUT_MS = 6000

export function normalizeBaseUrl(input: string): string {
  let url = input.trim()
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  return url.replace(/\/+$/, '')
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      // A default browser-like UA — some storefronts return a stripped-down
      // or blocked response to obviously bot-like clients.
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StoreDetectorBot/1.0)', ...init?.headers },
    })
  } finally {
    clearTimeout(timeout)
  }
}

async function tryJson<T = unknown>(url: string): Promise<T | null> {
  try {
    const res = await fetchWithTimeout(url)
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('json')) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

async function tryText(url: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(url)
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

function extractSiteName(html: string): string | undefined {
  const og = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)
  if (og?.[1]) return og[1].trim()
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  if (title?.[1]) return title[1].split(/[|\u2013\u2014-]/)[0].trim()
  return undefined
}

interface PlatformSignal {
  matched: boolean
  confidence: 'high' | 'medium'
  signals: string[]
  storeName?: string
  currency?: string
}

// ---------------------------------------------------------------------------
// Shopify
// ---------------------------------------------------------------------------

interface ShopifyProductsResponse {
  products?: Array<{ id: number; title: string; variants?: Array<{ price: string }> }>
}

interface ShopifyCartResponse {
  currency?: string
  item_count?: number
}

async function checkShopify(baseUrl: string): Promise<PlatformSignal> {
  const signals: string[] = []
  let matched = false
  let confidence: 'high' | 'medium' = 'medium'
  let storeName: string | undefined
  let currency: string | undefined

  // Strong signal: /products.json is Shopify's standard public storefront
  // feed. Practically every Shopify store serves it — custom theme or not
  // — and the shape (id/title/variants) is distinctive.
  const products = await tryJson<ShopifyProductsResponse>(`${baseUrl}/products.json?limit=1`)
  if (products?.products && Array.isArray(products.products) && products.products.length > 0) {
    matched = true
    confidence = 'high'
    signals.push('products.json returned Shopify-shaped product data')
  }

  // Currency + a second confirmation: /cart.js is Shopify's public cart
  // endpoint and reliably reports the store's active currency, even on a
  // heavily re-themed storefront.
  const cart = await tryJson<ShopifyCartResponse>(`${baseUrl}/cart.js`)
  if (cart && typeof cart.item_count === 'number') {
    matched = true
    signals.push('cart.js responded with a Shopify-shaped cart')
    if (cart.currency) currency = cart.currency
  }

  // Best-effort name + a third confirmation: homepage markup usually
  // references Shopify's CDN or embeds `Shopify.shop`.
  const html = await tryText(baseUrl)
  if (html) {
    if (/cdn\.shopify\.com|Shopify\.shop|window\.Shopify/i.test(html)) {
      matched = true
      signals.push('homepage markup references Shopify')
    }
    storeName = extractSiteName(html)
  }

  return { matched, confidence, signals, storeName, currency }
}

// ---------------------------------------------------------------------------
// WooCommerce
// ---------------------------------------------------------------------------

interface WpRestRoot {
  name?: string
  namespaces?: string[]
}

interface WcStoreProduct {
  prices?: { currency_code?: string }
}

async function checkWooCommerce(baseUrl: string): Promise<PlatformSignal> {
  const signals: string[] = []
  let matched = false
  let confidence: 'high' | 'medium' = 'medium'
  let storeName: string | undefined
  let currency: string | undefined

  // Strong signal + gives us the store name for free: the WordPress REST
  // API root is public by default and lists which namespaces are active.
  // `wc/store` or `wc/v3` being present confirms WooCommerce specifically,
  // not just "this happens to be a WordPress site". `name` is the site
  // title, which for a storefront is usually the store's display name.
  const root = await tryJson<WpRestRoot>(`${baseUrl}/wp-json/`)
  if (root) {
    const namespaces = root.namespaces ?? []
    if (namespaces.some((ns) => ns.startsWith('wc/'))) {
      matched = true
      confidence = 'high'
      signals.push('wp-json root lists an active WooCommerce namespace')
    }
    if (root.name) storeName = root.name
  }

  // Currency + a second confirmation: the public Store API lists products
  // with a currency code on every item.
  const products = await tryJson<WcStoreProduct[]>(`${baseUrl}/wp-json/wc/store/v1/products?per_page=1`)
  if (Array.isArray(products) && products.length > 0) {
    matched = true
    signals.push('WooCommerce Store API returned product data')
    const code = products[0]?.prices?.currency_code
    if (code) currency = code
  }

  // Best-effort fallback for stores that lock the REST API down.
  if (!matched) {
    const html = await tryText(baseUrl)
    if (html && /woocommerce/i.test(html)) {
      matched = true
      signals.push('homepage markup references WooCommerce')
    }
    if (html && !storeName) storeName = extractSiteName(html)
  }

  return { matched, confidence, signals, storeName, currency }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function detectStoreProvider(rawUrl: string): Promise<StoreDetectionResult> {
  const baseUrl = normalizeBaseUrl(rawUrl)

  const [shopify, woocommerce] = await Promise.all([checkShopify(baseUrl), checkWooCommerce(baseUrl)])

  if (shopify.matched && !woocommerce.matched) {
    return {
      type: 'shopify',
      baseUrl,
      confidence: shopify.confidence,
      signals: shopify.signals,
      storeName: shopify.storeName,
      currency: shopify.currency,
    }
  }

  if (woocommerce.matched && !shopify.matched) {
    return {
      type: 'woocommerce',
      baseUrl,
      confidence: woocommerce.confidence,
      signals: woocommerce.signals,
      storeName: woocommerce.storeName,
      currency: woocommerce.currency,
    }
  }

  if (shopify.matched && woocommerce.matched) {
    // Vanishingly unlikely in practice — but if both somehow fire, trust
    // whichever produced the stronger signal rather than silently guessing.
    const shopifyWins = shopify.confidence === 'high' && woocommerce.confidence !== 'high'
    const winner = shopifyWins ? shopify : woocommerce
    return {
      type: shopifyWins ? 'shopify' : 'woocommerce',
      baseUrl,
      confidence: 'low',
      signals: [
        ...shopify.signals,
        ...woocommerce.signals,
        'Both platforms showed signals \u2014 picked the stronger match, worth confirming manually.',
      ],
      storeName: winner.storeName,
      currency: winner.currency,
    }
  }

  return {
    type: 'none',
    baseUrl,
    confidence: 'low',
    signals: [],
    reason:
      'Neither a Shopify nor a WooCommerce feed responded \u2014 this may be a custom-built store, or the URL may be unreachable.',
  }
}