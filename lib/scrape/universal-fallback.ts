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
// SETTINGS: saved by a Super Admin at /admin/super-admin/settings/integrations
// and kept in Redis (lib/scrape/universal-settings.ts); the old
// UNIVERSAL_SCRAPER_* environment variables still work as a fallback.
// Nothing here ever reaches the browser. Optional env:
//   UNIVERSAL_SCRAPER_DEBUG=1    logs the response's key names (never values)
//
// Response (confirmed from real calls): { success, action, isCart, products: [{
//   product_name, product_image_url, product_store, brand, product_url,
//   unit_price_inr, original_price_inr, rating, review_count, seller,
//   selected_size, selected_colour, available_sizes[], available_colours[],
//   ...weight / category / pipeline_debug (not used — our own weight
//   categories price the freight) }] }. Prices are always rupees.
//
// Trust: a result with a price is shown as a normal priced listing (store
// price + delivered-price breakdown, ItemInfoModal's universal view). It is
// still third-party data, so it is NEVER stored as a price observation and
// checkout never prices off it — checkout re-reads the link itself and flags
// the order for staff when it can't confirm. Turn "trust price" off in the
// settings page to show backup results as a preview ("we'll confirm the
// price") instead.

import { withScrapeCache } from '@/lib/scrape/result-cache'
import type { ScrapeResult } from '@/lib/scrape/parsers'
import { getStoreIdentity } from '@/lib/scrape/store-identity'
import { isComplete, loadUniversalSettings, type UniversalSettings } from '@/lib/scrape/universal-settings'

const MAX_RESPONSE_CHARS = 1_500_000

/** True when the backup is switched on and fully set up (Redis, else env). */
export async function universalFallbackConfigured(): Promise<boolean> {
  return isComplete((await loadUniversalSettings()).settings)
}

/** Errors where asking another scraper can't help (bad link, merchant's own
 *  password wall, client hung up). */
export function fallbackWorthTrying(result: Pick<ScrapeResult, 'site' | 'error'>): boolean {
  if (!result.error) return false
  if (result.site === null) return false
  if (/password\/"coming soon" wall|Invalid URL|Client disconnected/i.test(result.error)) return false
  return true
}

/** Our scraper "succeeded" but only with a generic Open-Graph-level read (an
 *  unrecognised store: no variants, price unconfirmed) — worth asking the
 *  universal scraper for a better one. */
export function isWeakRead(result: ScrapeResult): boolean {
  if (result.error || result.site === null) return false
  return (result.site === 'generic' || !!result.ogOnly) && !result.variants?.length
}

/** Combine a weak read of our own with the universal scraper's: its price,
 *  currency, sizes and colours win; our own title, description and photos
 *  stay when we have them (usually richer). */
export function mergeWeakRead(ours: ScrapeResult, backup: ScrapeResult): ScrapeResult {
  return {
    ...backup,
    title: ours.title || backup.title,
    description: ours.description || backup.description,
    images: (ours.images?.length ?? 0) >= (backup.images?.length ?? 0) ? ours.images : backup.images,
    brand: backup.brand ?? ours.brand,
  }
}

// ── response mapping ──────────────────────────────────────────────────────

type Json = Record<string, unknown>
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v)

/** The object that actually holds the product: unwraps data / product / result / item. */
function unwrap(root: unknown): Json {
  // { products: [ {...} ] } — the real response shape.
  if (isObj(root) && Array.isArray(root.products)) {
    const first = root.products.find(isObj)
    if (first) return first
  }
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
  const raw = pick(o, ['images', 'product_image_url', 'image_urls', 'imageUrls', 'gallery', 'photos', 'image', 'image_url', 'imageUrl', 'thumbnail', 'main_image'])
  const list = Array.isArray(raw) ? raw : raw != null ? [raw] : []
  const out: string[] = []
  for (const item of list) {
    const u = isObj(item) ? str(pick(item, ['url', 'src', 'image'])) : str(item)
    if (u && /^https?:\/\//i.test(u) && !out.includes(u)) out.push(u)
  }
  return out
}

function strList(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const x of v) {
    const t = str(x)
    if (t && !out.includes(t)) out.push(t)
  }
  return out
}

/** Size / colour tiles (informational — the universal API gives labels only). */
function buildVariants(o: Json, currency: string | null): NonNullable<ScrapeResult['variants']> {
  const dims: NonNullable<ScrapeResult['variants']> = []
  const add = (dimension: string, labels: string[], selected: string | null) => {
    if (!labels.length) return
    dims.push({
      dimension,
      options: labels.map((label) => ({
        label,
        price: null,
        currencyCode: currency,
        image: null,
        url: null,
        selected: !!selected && label.toLowerCase() === selected.toLowerCase(),
      })),
    })
  }
  add('Size', strList(pick(o, ['available_sizes', 'sizes'])), str(pick(o, ['selected_size'])))
  add('Color', strList(pick(o, ['available_colours', 'available_colors', 'colours', 'colors'])), str(pick(o, ['selected_colour', 'selected_color'])))
  return dims
}

export function mapUniversalResponse(body: unknown, url: string, site: ScrapeResult['site'], trustPrice = true): ScrapeResult {
  const o = unwrap(body)
  const title = str(pick(o, ['product_name', 'title', 'productName', 'name', 'product_title']))
  const priceField = pick(o, ['unit_price_inr', 'price', 'selling_price', 'sellingPrice', 'sale_price', 'salePrice', 'final_price', 'current_price', 'price_inr'])
  const p = money(priceField)
  const mrp = money(pick(o, ['original_price_inr', 'mrp', 'original_price', 'originalPrice', 'list_price', 'compare_at_price', 'strike_price'])).amount
  const inrField = pick(o, ['unit_price_inr']) != null
  const currency =
    str(pick(o, ['currency', 'currencyCode', 'currency_code', 'price_currency'])) ?? p.currency ?? (inrField ? 'INR' : null)
  const imgs = images(o)

  if (!title && !p.amount && !imgs.length) {
    return { url, site, error: 'Universal scraper returned no usable product data' }
  }

  const trust = trustPrice && !!p.amount && !!currency
  const variants = buildVariants(o, currency ? currency.toUpperCase() : null)
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
    storeName: str(pick(o, ['product_store', 'store_name', 'site_name'])),
    ...(variants.length ? { variants } : {}),
    description: str(pick(o, ['description', 'short_description', 'summary'])),
    images: imgs,
    ...(unavailable ? { unavailable: true } : {}),
    ...(trust ? {} : { ogOnly: true }),
    warning: trust
      ? 'Price read from a backup source — our team double-checks it before anything is charged.'
      : "We couldn't read this listing directly — details come from a backup source, so we'll confirm the price and options with you.",
  }
  return result
}

// ── the call ──────────────────────────────────────────────────────────────

async function callUniversal(
  url: string,
  site: ScrapeResult['site'],
  cfg: UniversalSettings,
  signal?: AbortSignal,
  opts: { skipIdentity?: boolean } = {},
): Promise<ScrapeResult> {
  const base = cfg.baseUrl.replace(/\/+$/, '')
  const appId = cfg.appId
  const token = cfg.token
  if (!base || !appId || !token) return { url, site, error: 'Universal scraper is not configured' }

  const origin = (cfg.origin || base).replace(/\/+$/, '')
  const timeoutMs = cfg.timeoutMs

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

    const mapped = mapUniversalResponse(json, url, site, cfg.trustPrice)
    if (opts.skipIdentity) return mapped
    if (mapped.error) return mapped

    // The store's own favicon (and a name when the API gave none) for the
    // item screen's header badge — same helper the Shopify/WooCommerce views use.
    const host = (() => {
      try {
        return new URL(url).hostname.replace(/^www\./, '')
      } catch {
        return null
      }
    })()
    try {
      const identity = await getStoreIdentity(new URL(url).origin, signal)
      mapped.storeFavicon = identity.favicon
      mapped.storeName = mapped.storeName || identity.name || host
    } catch {
      mapped.storeName = mapped.storeName || host
    }
    return mapped
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
  try {
    const cfg = (await loadUniversalSettings()).settings
    if (!isComplete(cfg)) return { url, site, error: 'Universal scraper is not configured' }
    return await withScrapeCache<ScrapeResult>(url, { kind: 'universal', signal: opts.signal }, () => callUniversal(url, site, cfg, opts.signal))
  } catch {
    return { url, site, error: 'Universal scraper request failed' }
  }
}

/**
 * Admin "Test connection": one uncached call with exactly these settings
 * (possibly not yet saved). Returns what the API said, including the HTTP
 * status — only ever shown to a Super Admin.
 */
export async function testUniversalConnection(cfg: UniversalSettings, url: string): Promise<ScrapeResult> {
  try {
    return await callUniversal(url, null, { ...cfg, enabled: true }, undefined, { skipIdentity: true })
  } catch {
    return { url, site: null, error: 'Universal scraper request failed' }
  }
}
