// lib/scrape/result-cache.ts
//
// SERVER-ONLY. One-hour cache for product lookups (scrapeProduct in
// parsers.ts), so the same link pasted again — by the same person or
// anyone else — doesn't hit the store, the headless browser, Parse.bot or a
// paid scraping service a second time.
//
//   • Successful results only, for 1 hour. Failures are never cached, so a
//     temporary block doesn't stick and "Retry" really retries.
//   • Shared by every server through Redis (WISH_DROP_REDIS_URL); falls back
//     to an in-memory cache per server when Redis isn't set or is down.
//   • The same link at the same moment runs ONE lookup; everyone waiting
//     gets its result.
//   • Tracking bits (utm_*, fbclid, gclid…) and #fragments are ignored, so
//     two copies of the same product link share one entry.
//   • A lookup that asked for variants also answers a later one that didn't.
//   • Callers that must see the live page (the scraper QA tool) pass
//     `fresh: true` to skip the cache (the fresh result still refreshes it).

import { createHash } from 'node:crypto'
import { sharedRedis } from '@/lib/rate-limit'

export const SCRAPE_CACHE_TTL_SECONDS = Number(process.env.SCRAPE_CACHE_TTL_SECONDS) || 60 * 60

const VERSION = 'v1' // bump to drop every cached result after a parser change
const MEMORY_MAX = 500

// Query keys that never change which product a link points to.
const TRACKING_PARAM = /^(utm_[a-z_]+|fbclid|gclid|gbraid|wbraid|dclid|msclkid|igshid|igsh|mc_cid|mc_eid|_branch_match_id|_branch_referrer|srsltid|si|ref_src|share_source|shareid|affid|affExtParam1|affExtParam2|cmpid|campaign_id|trk|trkid|_gl)$/i

/** The link as a stable cache key: lower-case host, no fragment, no
 *  tracking params, remaining params sorted. */
export function normalizeProductUrl(raw: string): string {
  try {
    const u = new URL(raw.trim())
    u.hash = ''
    u.hostname = u.hostname.toLowerCase()
    const kept = [...u.searchParams.entries()].filter(([k]) => !TRACKING_PARAM.test(k))
    kept.sort(([a], [b]) => a.localeCompare(b))
    u.search = ''
    for (const [k, v] of kept) u.searchParams.append(k, v)
    let s = u.toString()
    if (s.endsWith('/') && u.pathname !== '/') s = s.slice(0, -1)
    return s
  } catch {
    return raw.trim()
  }
}

function cacheKey(url: string, needVariants: boolean, kind = 'scrape'): string {
  const h = createHash('sha256').update(normalizeProductUrl(url)).digest('hex').slice(0, 32)
  return `wd:${kind}:${VERSION}:${needVariants ? 'v' : 'b'}:${h}`
}

// ── Storage ────────────────────────────────────────────────────────────────

const memory = new Map<string, { expires: number; value: string }>()

function memoryGet(key: string): string | null {
  const hit = memory.get(key)
  if (!hit) return null
  if (hit.expires <= Date.now()) {
    memory.delete(key)
    return null
  }
  // refresh LRU position
  memory.delete(key)
  memory.set(key, hit)
  return hit.value
}

function memorySet(key: string, value: string, ttlSeconds: number) {
  memory.set(key, { expires: Date.now() + ttlSeconds * 1000, value })
  while (memory.size > MEMORY_MAX) {
    const oldest = memory.keys().next().value
    if (oldest === undefined) break
    memory.delete(oldest)
  }
}

async function read(key: string): Promise<string | null> {
  const r = sharedRedis()
  if (r) {
    try {
      const v = await r.get(key)
      if (v) return v
    } catch {
      // fall back to memory
    }
  }
  return memoryGet(key)
}

async function write(key: string, value: string, ttlSeconds: number) {
  memorySet(key, value, ttlSeconds)
  const r = sharedRedis()
  if (!r) return
  try {
    await r.set(key, value, 'EX', ttlSeconds)
  } catch {
    // memory still has it
  }
}

// ── Public ─────────────────────────────────────────────────────────────────

type Cacheable = { error?: string | null; cachedAt?: string }

type CacheOptions<T> = {
  needVariants?: boolean
  fresh?: boolean
  signal?: AbortSignal
  /** Separate key space for other lookups that reuse this cache (e.g. 'og'). */
  kind?: string
  /** What counts as worth caching. Default: no `error`. */
  isSuccess?: (result: T) => boolean
}

const inFlight = new Map<string, Promise<unknown>>()

/**
 * Returns a cached result for this link when there is one, otherwise runs
 * `lookup` (once, even if several callers ask at the same moment) and
 * caches it if it succeeded.
 */
export async function withScrapeCache<T extends Cacheable>(
  url: string,
  opts: CacheOptions<T>,
  lookup: () => Promise<T>,
): Promise<T> {
  const needVariants = !!opts.needVariants
  const kind = opts.kind ?? 'scrape'
  const isSuccess = opts.isSuccess ?? ((r: T) => !r?.error)
  const key = cacheKey(url, needVariants, kind)

  if (!opts.fresh) {
    // A cached result with variants answers a request without them too.
    const keys = needVariants ? [key] : [cacheKey(url, true, kind), key]
    for (const k of keys) {
      const hit = await read(k)
      if (hit) {
        try {
          return JSON.parse(hit) as T
        } catch {
          // corrupted entry — ignore
        }
      }
    }

    const pending = inFlight.get(key) as Promise<T> | undefined
    if (pending) {
      const shared = await pending
      // The first caller disconnected mid-lookup: run our own.
      if (shared?.error === 'Client disconnected' && !opts.signal?.aborted) return lookup()
      return shared
    }
  }

  const run: Promise<T> = (async () => {
    const result = await lookup()
    if (result && isSuccess(result)) {
      const stamped = { ...result, cachedAt: new Date().toISOString() }
      try {
        await write(key, JSON.stringify(stamped), SCRAPE_CACHE_TTL_SECONDS)
      } catch {
        // a result that can't be stored is still returned
      }
    }
    return result
  })()

  inFlight.set(key, run)
  try {
    return await run
  } finally {
    if (inFlight.get(key) === run) inFlight.delete(key)
  }
}
