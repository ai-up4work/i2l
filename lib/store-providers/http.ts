// lib/store-providers/http.ts
//
// Drop-in replacement for `fetch` for every request made to a seller's
// store (WooCommerce / Shopify / jsonapi / scrapers).
//
// Why it exists: a seller's firewall (Cloudflare, Imunify360, Wordfence,
// Sucuri...) often returns 403 / a "Just a moment..." challenge to requests
// from Vercel's datacenter IPs even though the same request works from a
// home connection. This helper tries, in order:
//
//   1. Scrape.do  (if SCRAPEDO_TOKEN is set and the host is enabled):
//        the request goes through their residential/mobile proxy network,
//        which is what gets past Cloudflare managed challenges. Results are
//        cached in Redis (see below) because every request costs credits.
//   2. A relay    (if STORE_PROXY_URL is set and the host is enabled):
//        see relay/cloudflare-worker.js or your own home relay.
//   3. Direct     with full browser headers, per-host throttling and
//        retries for 403 / 429 / 5xx.
//
// On a final failure it logs WHO blocked you (server, cf-ray, body snippet).
//
// Env (all optional):
//   SCRAPEDO_TOKEN    Scrape.do API token
//   SCRAPEDO_HOSTS    comma list of hostnames to send through Scrape.do,
//                     or "*" for all. Unset = Scrape.do is not used.
//                     Tip: list only the sellers that actually get blocked,
//                     every request through Scrape.do costs credits.
//   SCRAPEDO_SUPER    "false" to turn off residential/mobile IPs (cheaper,
//                     but usually NOT enough for a Cloudflare challenge).
//                     Default: on.
//
//   WISH_DROP_REDIS_URL           Redis connection string. When set, Scrape.do
//                                 responses are cached here. Unset = falls back
//                                 to Next's own fetch cache.
//   SCRAPEDO_CACHE_SECONDS        fresh time for lists/categories. Default 86400 (1 day).
//   SCRAPEDO_SEARCH_CACHE_SECONDS fresh time for search requests. Default 3600 (1 hour).
//                                 (every distinct search term is its own entry)
//   SCRAPEDO_STALE_SECONDS        how long an expired entry is kept so it can be
//                                 served if Scrape.do fails. Default 604800 (7 days).
//
//   STORE_PROXY_URL / STORE_PROXY_SECRET / STORE_PROXY_HOSTS   relay (see above)
//   STORE_DEBUG       "1" to log cache hits/misses and the response header
//                     names from Scrape.do (useful to confirm x-wp-total
//                     is passed through).
//
// Needs the Node.js runtime (not Edge) because of ioredis and node:zlib.
//   npm i ioredis
//
// Usage: in a provider file, replace the global fetch with this one:
//   import { storeFetch as fetch } from './http';

import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import Redis from 'ioredis';

type NextInit = RequestInit & { next?: { revalidate?: number | false; tags?: string[] } };

const RETRY_STATUSES = new Set([403, 429, 500, 502, 503, 504]);
const MAX_RETRIES = 2;
const MAX_CONCURRENT_PER_HOST = 4;

const DEBUG = () => process.env.STORE_DEBUG === '1';

// ── Per-host concurrency limiter ────────────────────────────────────────────
const active = new Map<string, number>();
const waiters = new Map<string, Array<() => void>>();

async function acquire(host: string): Promise<void> {
  const current = active.get(host) ?? 0;
  if (current < MAX_CONCURRENT_PER_HOST) {
    active.set(host, current + 1);
    return;
  }
  await new Promise<void>((resolve) => {
    const q = waiters.get(host) ?? [];
    q.push(resolve);
    waiters.set(host, q);
  });
}

function release(host: string): void {
  const q = waiters.get(host);
  const next = q?.shift();
  if (next) {
    next(); // hand the slot straight to the next waiter (count unchanged)
    return;
  }
  active.set(host, Math.max(0, (active.get(host) ?? 1) - 1));
}

// ── Headers ─────────────────────────────────────────────────────────────────
function browserHeaders(origin: string): Record<string, string> {
  return {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: `${origin}/`,
    Origin: origin,
    'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
  };
}

function mergeHeaders(origin: string, extra?: HeadersInit): Headers {
  const h = new Headers(browserHeaders(origin));
  if (extra) new Headers(extra).forEach((value, key) => h.set(key, value)); // caller wins
  return h;
}

// ── Host lists ──────────────────────────────────────────────────────────────
function hostEnabled(listEnv: string | undefined, host: string): boolean {
  const list = (listEnv ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!list.length) return false;
  return list.includes('*') || list.includes(host);
}

function shouldUseScrapeDo(host: string): boolean {
  return !!process.env.SCRAPEDO_TOKEN && hostEnabled(process.env.SCRAPEDO_HOSTS, host);
}

function shouldRelay(host: string): boolean {
  return !!process.env.STORE_PROXY_URL && hostEnabled(process.env.STORE_PROXY_HOSTS, host);
}

// ── Scrape.do ───────────────────────────────────────────────────────────────
// Scrape.do sends its own realistic browser headers, so we do NOT forward our
// browser defaults (mismatched headers can hurt). We only forward headers the
// seller actually needs: Authorization (wc/v3 keys) and any x-* header (for
// example the x-wishdrop-key secret used by a Cloudflare skip rule). That
// needs `customHeaders=true`, which makes Scrape.do pass these through.
function pickForwardHeaders(init: HeadersInit | undefined): Headers {
  const out = new Headers();
  if (!init) return out;
  new Headers(init).forEach((value, key) => {
    const k = key.toLowerCase();
    if (k === 'authorization' || k.startsWith('x-')) out.set(key, value);
  });
  return out;
}

function buildScrapeDoRequest(target: URL, init: NextInit): { url: string; headers: Headers } {
  const qs = new URLSearchParams({
    token: process.env.SCRAPEDO_TOKEN ?? '',
    url: target.toString(),
    // Return the seller's real status code / headers instead of Scrape.do's
    // own wrapper, so existing `res.ok` / `x-wp-total` handling keeps working.
    transparentResponse: 'true',
  });
  if (process.env.SCRAPEDO_SUPER !== 'false') qs.set('super', 'true');

  const forward = pickForwardHeaders(init.headers);
  let headers = new Headers();
  if ([...forward.keys()].length) {
    qs.set('customHeaders', 'true');
    headers = forward;
  }
  return { url: `https://api.scrape.do/?${qs.toString()}`, headers };
}

// If Scrape.do prefixes the seller's headers, copy WooCommerce's pagination
// headers back to their plain names so `res.headers.get('x-wp-total')` works.
function normaliseScrapeDoResponse(res: Response): Response {
  const headers = new Headers(res.headers);
  res.headers.forEach((value, key) => {
    const m = key.toLowerCase().match(/(x-wp-total(?:pages)?)$/);
    if (m && !headers.has(m[1])) headers.set(m[1], value);
  });
  if (DEBUG()) {
    const names: string[] = [];
    res.headers.forEach((_v, k) => names.push(k));
    console.log('[storeFetch] scrape.do response headers:', names.join(', '));
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

// ── Cache durations ─────────────────────────────────────────────────────────
function numEnv(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function freshSeconds(target: URL): number {
  const isSearch = target.searchParams.has('search') || target.searchParams.has('q');
  return isSearch
    ? numEnv('SCRAPEDO_SEARCH_CACHE_SECONDS', 3600)
    : numEnv('SCRAPEDO_CACHE_SECONDS', 86400);
}

// ── Redis cache (Scrape.do responses only) ──────────────────────────────────
// A Redis failure must NEVER break a request: every call below is wrapped and
// falls through to a normal fetch.
interface CachedEntry {
  /** HTTP status of the seller's response */
  s: number;
  /** the few response headers callers rely on */
  h: Record<string, string>;
  /** gzip + base64 of the response body */
  b: string;
  /** saved-at, ms epoch */
  t: number;
}

const KEPT_HEADERS = ['content-type', 'x-wp-total', 'x-wp-totalpages'];

const globalForRedis = globalThis as unknown as { __storeRedis?: Redis | null };
let redisErrorLogged = false;

function getRedis(): Redis | null {
  const url = process.env.WISH_DROP_REDIS_URL;
  if (!url) return null;
  if (globalForRedis.__storeRedis !== undefined) return globalForRedis.__storeRedis;
  try {
    const client = new Redis(url, {
      lazyConnect: true,
      connectTimeout: 2000,
      commandTimeout: 2000,
      maxRetriesPerRequest: 1,
    });
    client.on('error', (e) => {
      if (redisErrorLogged) return; // don't spam the logs
      redisErrorLogged = true;
      console.error('[storeFetch] redis error (cache disabled until it recovers):', e.message);
    });
    client.on('ready', () => {
      redisErrorLogged = false;
    });
    client.connect().catch(() => {
      /* handled by the 'error' listener */
    });
    globalForRedis.__storeRedis = client;
    return client;
  } catch {
    globalForRedis.__storeRedis = null;
    return null;
  }
}

function cacheKey(target: URL, forward: Headers): string {
  const fwd = [...forward.entries()]
    .map(([k, v]) => `${k.toLowerCase()}=${v}`)
    .sort()
    .join('&');
  const hash = createHash('sha256').update(`${target.toString()}|${fwd}`).digest('hex');
  return `storefetch:v1:${target.hostname}:${hash}`;
}

async function cacheGet(redis: Redis, key: string): Promise<CachedEntry | null> {
  try {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as CachedEntry) : null;
  } catch {
    return null;
  }
}

async function cacheSet(redis: Redis, key: string, entry: CachedEntry): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(entry), 'EX', numEnv('SCRAPEDO_STALE_SECONDS', 604800));
  } catch {
    /* cache write failures are non-fatal */
  }
}

async function responseToEntry(res: Response): Promise<CachedEntry> {
  const body = await res.text();
  const h: Record<string, string> = {};
  for (const name of KEPT_HEADERS) {
    const v = res.headers.get(name);
    if (v != null) h[name] = v;
  }
  return { s: res.status, h, b: gzipSync(Buffer.from(body, 'utf8')).toString('base64'), t: Date.now() };
}

function entryToResponse(entry: CachedEntry): Response {
  const body = gunzipSync(Buffer.from(entry.b, 'base64')).toString('utf8');
  return new Response(body, { status: entry.s, headers: entry.h });
}

// Concurrent identical requests on one instance share a single upstream call,
// so a cold cache + a burst of visitors doesn't burn credits N times.
const inflight = new Map<string, Promise<CachedEntry>>();

// ── Utilities ───────────────────────────────────────────────────────────────
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function retryDelayMs(attempt: number, res?: Response): number {
  const retryAfter = res?.headers.get('retry-after');
  if (retryAfter) {
    const secs = Number(retryAfter);
    if (Number.isFinite(secs)) return Math.min(secs * 1000, 5000);
  }
  return 400 * 2 ** attempt + Math.floor(Math.random() * 250); // 400ms, 800ms (+ jitter)
}

async function logBlocked(url: string, res: Response, via: string) {
  try {
    const body = (await res.clone().text()).replace(/\s+/g, ' ').slice(0, 300);
    console.error('[storeFetch] blocked', {
      url,
      status: res.status,
      via,
      server: res.headers.get('server'),
      cfRay: res.headers.get('cf-ray'),
      sucuri: res.headers.get('x-sucuri-id'),
      denyReason: res.headers.get('x-deny-reason'),
      body,
    });
  } catch {
    /* logging must never throw */
  }
}

// ── Public API ──────────────────────────────────────────────────────────────
export async function storeFetch(input: string | URL, init: NextInit = {}): Promise<Response> {
  const target = new URL(typeof input === 'string' ? input : input.toString());
  const host = target.hostname;

  const useScrapeDo = shouldUseScrapeDo(host);
  const useRelay = !useScrapeDo && shouldRelay(host);
  const via = useScrapeDo ? 'scrape.do' : useRelay ? 'relay' : 'direct';

  const redis = useScrapeDo ? getRedis() : null;

  let requestUrl = target.toString();
  let headers: Headers;
  let forward = new Headers();

  if (useScrapeDo) {
    const req = buildScrapeDoRequest(target, init);
    requestUrl = req.url;
    headers = req.headers;
    forward = req.headers;
  } else {
    headers = mergeHeaders(target.origin, init.headers);
    if (useRelay) {
      requestUrl = `${process.env.STORE_PROXY_URL}?url=${encodeURIComponent(target.toString())}`;
      headers.set('x-proxy-secret', process.env.STORE_PROXY_SECRET ?? '');
    }
  }

  // Scrape.do already retries internally and bills per request, so don't
  // multiply the cost by retrying on our side.
  const maxRetries = useScrapeDo ? 0 : MAX_RETRIES;

  // When Redis is our cache, bypass Next's fetch cache for the Scrape.do call
  // (otherwise the same response would be cached twice, with two lifetimes).
  // Without Redis, fall back to Next's cache using the long Scrape.do lifetime.
  let fetchInit: NextInit = init;
  if (useScrapeDo) {
    if (redis) {
      const { next: _next, ...rest } = init;
      fetchInit = { ...rest, cache: 'no-store' };
    } else {
      fetchInit = { ...init, next: { ...init.next, revalidate: freshSeconds(target) } };
    }
  }

  // The actual network call (with throttling + retries). Returns the final
  // Response, which may be a failure that the caller still has to handle.
  const runRequest = async (): Promise<Response> => {
    await acquire(host);
    try {
      let lastRes: Response | undefined;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const res = await fetch(requestUrl, { ...fetchInit, headers });
          if (!RETRY_STATUSES.has(res.status)) return useScrapeDo ? normaliseScrapeDoResponse(res) : res;
          lastRes = res;
          // A Cloudflare managed challenge ("Just a moment...") can't be
          // passed by retrying, and retrying only makes the traffic look
          // more like a bot. Fail fast; the seller must exempt this traffic.
          if (res.headers.get('cf-mitigated') === 'challenge') break;
          if (attempt < maxRetries) await sleep(retryDelayMs(attempt, res));
        } catch (err) {
          if (attempt === maxRetries) throw err;
          await sleep(retryDelayMs(attempt));
        }
      }
      // Out of retries: log who is blocking, then hand the response back so
      // callers keep their existing `if (!res.ok)` handling.
      if (lastRes) await logBlocked(target.toString(), lastRes, via);
      return (useScrapeDo && lastRes ? normaliseScrapeDoResponse(lastRes) : lastRes) as Response;
    } finally {
      release(host);
    }
  };

  // No Redis (or not a Scrape.do request): plain path.
  if (!redis) return runRequest();

  // ── Scrape.do + Redis ─────────────────────────────────────────────────────
  const key = cacheKey(target, forward);
  const ttlMs = freshSeconds(target) * 1000;

  const cached = await cacheGet(redis, key);
  if (cached && Date.now() - cached.t < ttlMs) {
    if (DEBUG()) console.log('[storeFetch] cache HIT', target.pathname + target.search);
    return entryToResponse(cached);
  }

  let pending = inflight.get(key);
  if (!pending) {
    pending = (async () => {
      if (DEBUG()) console.log('[storeFetch] cache MISS', target.pathname + target.search);
      try {
        const res = await runRequest();
        const entry = await responseToEntry(res);
        if (entry.s >= 200 && entry.s < 300) {
          await cacheSet(redis, key, entry); // only successes are cached
          return entry;
        }
        // Scrape.do/seller failed: prefer an expired copy over an error page.
        if (cached) {
          console.warn('[storeFetch] serving STALE copy after status', entry.s, target.pathname);
          return cached;
        }
        return entry;
      } catch (err) {
        if (cached) {
          console.warn('[storeFetch] serving STALE copy after error', (err as Error).message);
          return cached;
        }
        throw err;
      }
    })().finally(() => {
      inflight.delete(key);
    });
    inflight.set(key, pending);
  }

  return entryToResponse(await pending);
}