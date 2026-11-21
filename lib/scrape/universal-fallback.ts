// lib/scrape/universal-fallback.ts
//
// SERVER-ONLY. The very last resort when our own scraper can't read a link —
// it ran past the lookup deadline (60 s) or failed outright. Sends the link to
// an external "universal" product-enrichment API and maps whatever it returns
// into a ScrapeResult.
//
// API spec (from kkEnrichQuote.postman_collection.json):
//   POST {UNIVERSAL_SCRAPER_BASE_URL}/api/apps/{UNIVERSAL_SCRAPER_APP_ID}/functions/kkEnrichQuote
//   Authorization: Bearer {UNIVERSAL_SCRAPER_TOKEN}
//   x-app-id: {UNIVERSAL_SCRAPER_APP_ID}
//   body: { "source": "from_url", "product_url": "<link>" }
//
// ENV (all server-side; nothing here ever reaches the browser):
//   UNIVERSAL_SCRAPER_BASE_URL   e.g. https://goknock.lk
//   UNIVERSAL_SCRAPER_APP_ID     the app id in the path / x-app-id header
//   UNIVERSAL_SCRAPER_TOKEN      bearer token (never logged, never in errors)
//   UNIVERSAL_SCRAPER_ORIGIN     optional; Origin/Referer the API expects.
//                                Defaults to BASE_URL.
//   UNIVERSAL_SCRAPER_TIMEOUT_MS optional; default 15000
//   UNIVERSAL_SCRAPER_TRUST_PRICE=1  optional; see "Trust" below
//   UNIVERSAL_SCRAPER_DEBUG=1    optional; logs the response's key names
//                                (never values) to help tune the mapper
//
// Trust: this is third-party data, so by default the result is marked
// `ogOnly` — the item screen shows it as a listing preview with "we'll
// confirm the price with you", checkout never prices off it, and it is never
// stored as a price observation. Set UNIVERSAL_SCRAPER_TRUST_PRICE=1 only if
// you decide its price can be shown as a full priced listing.
//
// The response shape isn't documented in the collection, so the mapper below
// is deliberately tolerant (common key names, nested `data` / `product` /
// `result` wrappers, price as number | string | { amount, currency }).

import { withScrapeCache } from '@/lib/scrape/result-cache'
import type { ScrapeResult } from '@/lib/scrape/parsers'

const DEFAULT_TIMEOUT_MS = 15_000
const MAX_RESPONSE_CHARS = 1_500_000

export const universalFallbackConfigured = () =>
  !!(process.env.UNIVERSAL_SCRAPER_BASE_URL && process.env.UNIVERSAL_SCRAPER_APP_ID && process.env.UNIVERSAL_SCRAPER_TOKEN)

/** Errors where asking another scraper can't help (bad link, merchant's own
 *  password wall, client hung up). */
export function fallbackWorthTrying(result: Pick<ScrapeResult, 'site' | 'error'>): boolean {
  if (!result.error) return false
  if (result.site === null) return false
  if (/password\/"coming soon" wall|Invalid URL|Client disconnected/i.test(result.error)) return false
  return true
}

// ── response mapping ──────────────────────────────────────────────────────

type Json = Record<string, unknown>
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v)

/** The object that actually holds the product: unwraps data / product / result / item. */
function unwrap(root: unknown): Json {
  let cur: unknown = root
  for (let i = 0; i < 4; i++) {
    if (!isObj(cur)) break
    const next = ['data', 'product', 'result', 'item', 'quote', 'enriched'].map((k) => cur && (cur as Json)[k]).find(isObj)
    if (!next) break
    cur = next
  }
  return isObj(cur) ? cur : isObj(root) ? root : {}
}

function pick(o: Json, keys: string[]): unknown {
  for (const k of keys) {
    const hit = Object.keys(o).find((x) => x.toLowerCase() === k.toLowerCase())
    if (hit && o[hit] != null && o[hit] !== '') return o[hit]
  }
  return undefined
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null)

function money(v: unknown): { amount: string | null; currency: string | null } {
  if (isObj(v)) {
    return { amount: money(pick(v, ['amount', 'value', 'price'])).amount, currency: str(pick(v, ['currency', 'currencyCode', 'currency_code'])) }
  }
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return { amount: String(v), currency: null }
  if (typeof v === 'string') {
    const m = v.replace(/,/g, '').match(/\d+(?:\.\d+)?/)
    return { amount: m ? m[0] : null, currency: v.match(/\b(INR|USD|LKR|GBP|EUR|AED|SGD|AUD|CAD)\b/)?.[1] ?? (v.includes('₹') ? 'INR' : null) }
  }
  return { amount: null, currency: null }
}

function images(o: Json): string[] {
  const raw = pick(o, ['images', 'image_urls', 'imageUrls', 'gallery', 'photos', 'image', 'image_url', 'imageUrl', 'thumbnail', 'main_image'])
  const list = Array.isArray(raw) ? raw : raw != null ? [raw] : []
  const out: string[] = []
  for (const item of list) {
    const u = isObj(item) ? str(pick(item, ['url', 'src', 'image'])) : str(item)
    if (u && /^https?:\/\//i.test(u) && !out.includes(u)) out.push(u)
  }
  return out
}

export function mapUniversalResponse(body: unknown, url: string, site: ScrapeResult['site']): ScrapeResult {
  const o = unwrap(body)
  const title = str(pick(o, ['title', 'product_name', 'productName', 'name', 'product_title']))
  const priceField = pick(o, ['price', 'selling_price', 'sellingPrice', 'sale_price', 'salePrice', 'final_price', 'current_price', 'price_inr'])
  const p = money(priceField)
  const mrp = money(pick(o, ['mrp', 'original_price', 'originalPrice', 'list_price', 'compare_at_price', 'strike_price'])).amount
  const currency =
    str(pick(o, ['currency', 'currencyCode', 'currency_code', 'price_currency'])) ?? p.currency ?? null
  const imgs = images(o)

  if (!title && !p.amount && !imgs.length) {
    return { url, site, error: 'Universal scraper returned no usable product data' }
  }

  const trust = process.env.UNIVERSAL_SCRAPER_TRUST_PRICE === '1'
  const inStockRaw = pick(o, ['in_stock', 'inStock', 'available', 'availability'])
  const unavailable = inStockRaw === false || (typeof inStockRaw === 'string' && /out of stock|unavailable|sold out/i.test(inStockRaw))

  const result: ScrapeResult = {
    url,
    site,
    source: 'universal_fallback',
    title,
    brand: str(pick(o, ['brand', 'vendor', 'manufacturer'])),
    price: p.amount,
    mrp,
    currencyCode: currency ? currency.toUpperCase() : null,
    rating: str(pick(o, ['rating', 'average_rating', 'averageRating'])),
    review_count: str(pick(o, ['review_count', 'reviewCount', 'reviews_count', 'ratings_count'])),
    seller: str(pick(o, ['seller', 'store', 'store_name', 'site_name'])),
    description: str(pick(o, ['description', 'short_description', 'summary'])),
    images: imgs,
    ...(unavailable ? { unavailable: true } : {}),
    ...(trust ? {} : { ogOnly: true }),
    warning: "We couldn't read this listing directly — details come from a backup source, so we'll confirm the price and options with you.",
  }
  return result
}

// ── the call ──────────────────────────────────────────────────────────────

async function callUniversal(url: string, site: ScrapeResult['site'], signal?: AbortSignal): Promise<ScrapeResult> {
  const base = (process.env.UNIVERSAL_SCRAPER_BASE_URL ?? '').replace(/\/+$/, '')
  const appId = process.env.UNIVERSAL_SCRAPER_APP_ID ?? ''
  const token = process.env.UNIVERSAL_SCRAPER_TOKEN ?? ''
  if (!base || !appId || !token) return { url, site, error: 'Universal scraper is not configured' }

  const origin = (process.env.UNIVERSAL_SCRAPER_ORIGIN || base).replace(/\/+$/, '')
  const timeoutMs = Number(process.env.UNIVERSAL_SCRAPER_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const onAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', onAbort)
  }

  try {
    const res = await fetch(`${base}/api/apps/${encodeURIComponent(appId)}/functions/kkEnrichQuote`, {
      method: 'POST',
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-app-id': appId,
        'base44-functions-version': 'prod',
        'x-origin-url': origin,
        Origin: origin,
        Referer: origin,
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify({ source: 'from_url', product_url: url }),
    })

    if (!res.ok) {
      // 401/403 = the token expired or was revoked — say so plainly.
      const hint = res.status === 401 || res.status === 403 ? ' (token rejected — it may have expired)' : ''
      return { url, site, error: `Universal scraper responded HTTP ${res.status}${hint}` }
    }

    const text = (await res.text()).slice(0, MAX_RESPONSE_CHARS)
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      return { url, site, error: 'Universal scraper returned a non-JSON response' }
    }

    if (process.env.UNIVERSAL_SCRAPER_DEBUG === '1') {
      const o = unwrap(json)
      console.log('[universal-scraper] response keys', { top: isObj(json) ? Object.keys(json) : typeof json, product: Object.keys(o) })
    }

    // An API-level error carried in a 200 body.
    if (isObj(json) && (json.error || json.success === false)) {
      return { url, site, error: `Universal scraper error: ${String(json.error ?? json.message ?? 'unknown').slice(0, 200)}` }
    }

    return mapUniversalResponse(json, url, site)
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError'
    if (aborted && signal?.aborted) return { url, site, error: 'Client disconnected' }
    return {
      url,
      site,
      error: aborted ? `Universal scraper timed out after ${Math.round(timeoutMs / 1000)}s` : 'Universal scraper request failed',
    }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

/**
 * Last-resort read of `url` through the universal scraper. Successful reads
 * are cached for an hour (separate key space) so repeat pastes don't hit the
 * external API again. Never throws.
 */
export async function scrapeViaUniversalFallback(
  url: string,
  site: ScrapeResult['site'],
  opts: { signal?: AbortSignal } = {},
): Promise<ScrapeResult> {
  if (!universalFallbackConfigured()) return { url, site, error: 'Universal scraper is not configured' }
  try {
    return await withScrapeCache<ScrapeResult>(url, { kind: 'universal', signal: opts.signal }, () => callUniversal(url, site, opts.signal))
  } catch {
    return { url, site, error: 'Universal scraper request failed' }
  }
}
