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
//   1. Firecrawl  (if FIRECRAWL_API_KEY is set and the host is enabled):
//        the request is made by Firecrawl's scrape API. Results are cached
//        in Redis (see below) because every request costs credits.
//   2. A relay    (if STORE_PROXY_URL is set and the host is enabled):
//        see relay/cloudflare-worker.js or your own home relay.
//   3. Direct     with full browser headers, per-host throttling and
//        retries for 403 / 429 / 5xx.
//
// On a final failure it logs WHO blocked you (server, cf-ray, body snippet).
//
// IMPORTANT differences from a transparent proxy (Scrape.do):
//   - Firecrawl does NOT return the seller's response headers, so
//     `x-wp-total` / `x-wp-totalpages` are NOT available on Firecrawl
//     responses. Paginate until a page comes back shorter than `per_page`.
//   - The seller's body comes back inside a JSON envelope. This helper
//     unwraps it and rebuilds a normal Response (status from
//     data.metadata.statusCode), so `res.ok` / `res.json()` keep working.
//
// Env (all optional):
//   FIRECRAWL_API_KEY       Firecrawl API key (fc-...)
//   FIRECRAWL_HOSTS         comma list of hostnames to send through Firecrawl,
//                           or "*" for all. Unset = Firecrawl is not used.
//                           Tip: list only the sellers that actually get blocked,
//                           every request through Firecrawl costs credits.
//   FIRECRAWL_PROXY         "basic" | "stealth" | "auto". Default "auto":
//                           tries basic first and retries with stealth only if
//                           needed (stealth costs more credits per request).
//   FIRECRAWL_CONCURRENCY   max parallel Firecrawl requests per host on one
//                           instance. Default 2 (the free plan's concurrency).
//
//   WISH_DROP_REDIS_URL           Redis connection string. When set, Firecrawl
//                                 responses are cached here. STRONGLY
//                                 recommended: without it nothing is cached
//                                 and every call spends credits.
//   SCRAPEDO_CACHE_SECONDS        fresh time for lists/categories. Default 86400 (1 day).
//   SCRAPEDO_SEARCH_CACHE_SECONDS fresh time for search requests. Default 3600 (1 hour).
//                                 (every distinct search term is its own entry)
//   SCRAPEDO_STALE_SECONDS        how long an expired entry is kept so it can be
//                                 served if Firecrawl fails. Default 604800 (7 days).
//                                 (the SCRAPEDO_* cache names are kept so your
//                                 existing env config keeps working)
//
//   STORE_PROXY_URL / STORE_PROXY_SECRET / STORE_PROXY_HOSTS   relay (see above)
//   STORE_DEBUG       "1" to log cache hits/misses and Firecrawl status codes.
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
const FIRECRAWL_ENDPOINT = 'https://api.firecrawl.dev/v2/scrape';

const DEBUG = () => process.env.STORE_DEBUG === '1';

// ── Per-host concurrency limiter ────────────────────────────────────────────
const active = new Map<string, number>();
const waiters = new Map<string, Array<() => void>>();

async function acquire(host: string, limit: number): Promise<void> {
  const current = active.get(host) ?? 0;
  if (current < limit) {
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

function shouldUseFirecrawl(host: string): boolean {
  return !!process.env.FIRECRAWL_API_KEY && hostEnabled(process.env.FIRECRAWL_HOSTS, host);
}

function shouldRelay(host: string): boolean {
  return !!process.env.STORE_PROXY_URL && hostEnabled(process.env.STORE_PROXY_HOSTS, host);
}

// ── Firecrawl ───────────────────────────────────────────────────────────────
// We only forward headers the seller actually needs: Authorization (wc/v3
// keys) and any x-* header (for example the x-wishdrop-key secret used by a
// Cloudflare skip rule). Firecrawl sends its own browser fingerprint, so our
// browser defaults are NOT forwarded.
function pickForwardHeaders(init: HeadersInit | undefined): Headers {
  const out = new Headers();
  if (!init) return out;
  new Headers(init).forEach((value, key) => {
    const k = key.toLowerCase();
    if (k === 'authorization' || k.startsWith('x-')) out.set(key, value);
  });
  return out;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&#x0*27;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&'); // must be last
}

// For a JSON endpoint, Firecrawl may hand back the bare JSON, or a browser
// "JSON viewer" page with the JSON inside <pre>. Return plain JSON in both
// cases; leave real HTML pages untouched.
function extractBody(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return trimmed;
  const m = trimmed.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  if (m) {
    const inner = decodeEntities(m[1]).trim();
    if (inner.startsWith('{') || inner.startsWith('[')) return inner;
  }
  return raw;
}

interface FirecrawlEnvelope {
  success?: boolean;
  error?: string;
  data?: {
    rawHtml?: string;
    html?: string;
    markdown?: string;
    metadata?: { statusCode?: number; error?: string };
  };
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function firecrawlScrape(target: URL, init: NextInit): Promise<Response> {
  const forward: Record<string, string> = {};
  pickForwardHeaders(init.headers).forEach((v, k) => {
    forward[k] = v;
  });

  const body: Record<string, unknown> = {
    url: target.toString(),
    formats: ['rawHtml'],
    proxy: process.env.FIRECRAWL_PROXY ?? 'auto',
  };
  if (Object.keys(forward).length) body.headers = forward;

  const res = await fetch(FIRECRAWL_ENDPOINT, {
    method: 'POST',
    cache: 'no-store',
    signal: init.signal,
    headers: {
      Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY ?? ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const env = (await res.json().catch(() => null)) as FirecrawlEnvelope | null;

  // Firecrawl itself refused / failed (bad key, out of credits, rate limit...)
  if (!res.ok || !env || env.success === false) {
    const status = res.ok ? 502 : res.status;
    if (status === 402) console.error('[storeFetch] Firecrawl: out of credits (402)');
    if (status === 401) console.error('[storeFetch] Firecrawl: invalid API key (401)');
    return jsonResponse({ error: env?.error ?? res.statusText ?? 'firecrawl error' }, status);
  }

  const data = env.data ?? {};
  const raw = data.rawHtml ?? data.html ?? data.markdown ?? '';
  const code = data.metadata?.statusCode;
  const status = Number.isInteger(code) && (code as number) >= 200 && (code as number) <= 599 ? (code as number) : 200;

  if (DEBUG()) console.log('[storeFetch] firecrawl ->', status, target.pathname + target.search);

  const text = extractBody(raw);
  const looksJson = text.startsWith('{') || text.startsWith('[');
  const noBody = status === 204 || status === 205 || status === 304;
  return new Response(noBody ? null : text, {
    status,
    headers: { 'content-type': looksJson ? 'application/json' : 'text/html; charset=utf-8' },
  });
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

// ── Redis cache (Firecrawl responses only) ──────────────────────────────────
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
  const noBody = entry.s === 204 || entry.s === 205 || entry.s === 304;
  return new Response(noBody ? null : body, { status: entry.s, headers: entry.h });
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

  const useFirecrawl = shouldUseFirecrawl(host);
  const useRelay = !useFirecrawl && shouldRelay(host);
  const via = useFirecrawl ? 'firecrawl' : useRelay ? 'relay' : 'direct';

  const redis = useFirecrawl ? getRedis() : null;

  let requestUrl = target.toString();
  let headers: Headers;
  let forward = new Headers();

  if (useFirecrawl) {
    forward = pickForwardHeaders(init.headers);
    headers = forward; // unused for the Firecrawl call itself
  } else {
    headers = mergeHeaders(target.origin, init.headers);
    if (useRelay) {
      requestUrl = `${process.env.STORE_PROXY_URL}?url=${encodeURIComponent(target.toString())}`;
      headers.set('x-proxy-secret', process.env.STORE_PROXY_SECRET ?? '');
    }
  }

  // Firecrawl bills per request, so don't multiply the cost by retrying on
  // our side.
  const maxRetries = useFirecrawl ? 0 : MAX_RETRIES;
  const concurrency = useFirecrawl
    ? Math.max(1, Math.floor(numEnv('FIRECRAWL_CONCURRENCY', 2)))
    : MAX_CONCURRENT_PER_HOST;

  // The actual network call (with throttling + retries). Returns the final
  // Response, which may be a failure that the caller still has to handle.
  const runRequest = async (): Promise<Response> => {
    await acquire(host, concurrency);
    try {
      let lastRes: Response | undefined;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const res = useFirecrawl
            ? await firecrawlScrape(target, init)
            : await fetch(requestUrl, { ...init, headers });
          if (!RETRY_STATUSES.has(res.status)) return res;
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
      return lastRes as Response;
    } finally {
      release(host);
    }
  };

  // No Redis (or not a Firecrawl request): plain path.
  if (!redis) {
    if (useFirecrawl) {
      console.warn('[storeFetch] Firecrawl without Redis: responses are NOT cached, every call spends credits');
    }
    return runRequest();
  }

  // ── Firecrawl + Redis ─────────────────────────────────────────────────────
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
        // Firecrawl/seller failed: prefer an expired copy over an error page.
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