// lib/store-providers/http.ts
//
// Drop-in replacement for `fetch` for every request made to a seller's
// store (WooCommerce / Shopify / jsonapi / scrapers).
//
// Why it exists: a seller's firewall (Cloudflare, Imunify360, Wordfence,
// Sucuri...) often returns 403 / a "Just a moment..." challenge to requests
// from Vercel's datacenter IPs even though the same request works from a
// home connection.
//
// Routing, per request:
//
//   A. FIRECRAWL (always)   host is listed in FIRECRAWL_HOSTS (or "*") and
//                           FIRECRAWL_API_KEY is set. Cached in Redis.
//   B. DIRECT / RELAY       everything else: browser headers, per-host
//                           throttling, retries (via STORE_PROXY_URL if the
//                           host is enabled for the relay).
//   C. AUTO FALLBACK        if (B) is answered by a firewall block
//                           (Cloudflare challenge, Sucuri, Imunify360, ...)
//                           and FIRECRAWL_API_KEY is set, the request is
//                           retried through Firecrawl automatically. The host
//                           is then remembered as "blocked" for a while so the
//                           next requests skip the doomed direct attempt.
//                           Credits are only spent when a block really
//                           happens. Turn off with FIRECRAWL_AUTO_FALLBACK=false.
//
// The first request to each host logs one "[storeFetch] route" line showing
// which route was chosen and whether the key / host list were seen, so a
// missing env var is visible straight away.
//
// IMPORTANT differences from a transparent proxy:
//   - Firecrawl does NOT return the seller's response headers. For list
//     requests with `per_page`, x-wp-total / x-wp-totalpages are rebuilt when
//     the page is shorter than per_page (exact for the last page). On a full
//     page they are unknown: paginate until a page is shorter than per_page.
//   - The seller's body comes back inside a JSON envelope. This helper
//     unwraps it and rebuilds a normal Response (status from
//     data.metadata.statusCode), so `res.ok` / `res.json()` keep working.
//
// Env (all optional except the key):
//   FIRECRAWL_API_KEY              Firecrawl API key (fc-...)
//   FIRECRAWL_HOSTS                hostnames to ALWAYS send through Firecrawl,
//                                  or "*". Tolerates https://, www., paths,
//                                  spaces and capitals. Optional now: with a
//                                  key set, blocked hosts fall back anyway.
//   FIRECRAWL_AUTO_FALLBACK        "false" to disable route C. Default on.
//   FIRECRAWL_PROXY                "basic" | "stealth" | "auto". Default "auto"
//                                  (basic first, stealth only if needed;
//                                  stealth costs more credits).
//   FIRECRAWL_MAX_PER_MINUTE       local cap on Firecrawl calls per minute, shared
//                                  across instances via Redis. Keep it a little
//                                  under your plan's limit (free plan: 20).
//                                  Default 15. Over the cap: serve a stale copy,
//                                  else a quick 429, instead of calling Firecrawl.
//   FIRECRAWL_CONCURRENCY          parallel Firecrawl requests per host per
//                                  instance. Default 2 (free plan).
//   FIRECRAWL_BLOCKED_MEMORY_SECONDS  how long a blocked host skips the direct
//                                  attempt. Default 600.
//
//   WISH_DROP_REDIS_URL            Redis connection string. When set, Firecrawl
//                                  responses are cached here. STRONGLY
//                                  recommended: without it every call spends
//                                  credits.
//   SCRAPEDO_CACHE_SECONDS         fresh time for lists/categories. Default 86400.
//   SCRAPEDO_SEARCH_CACHE_SECONDS  fresh time for search requests. Default 3600.
//   SCRAPEDO_STALE_SECONDS         how long an expired entry is kept so it can
//                                  be served if Firecrawl fails. Default 604800.
//                                  (SCRAPEDO_* names kept so existing config
//                                  keeps working)
//
//   STORE_PROXY_URL / STORE_PROXY_SECRET / STORE_PROXY_HOSTS   relay
//   STORE_DEBUG        "1" to log cache hits/misses and Firecrawl statuses.
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

async function acquire(slot: string, limit: number): Promise<void> {
  const current = active.get(slot) ?? 0;
  if (current < limit) {
    active.set(slot, current + 1);
    return;
  }
  await new Promise<void>((resolve) => {
    const q = waiters.get(slot) ?? [];
    q.push(resolve);
    waiters.set(slot, q);
  });
}

function release(slot: string): void {
  const q = waiters.get(slot);
  const next = q?.shift();
  if (next) {
    next(); // hand the slot straight to the next waiter (count unchanged)
    return;
  }
  active.set(slot, Math.max(0, (active.get(slot) ?? 1) - 1));
}

// ── Headers ─────────────────────────────────────────────────────────────────
function browserHeaders(origin: string): Record<string, string> {
  return {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: `${origin}/`,
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

// ── Env helpers / host lists ────────────────────────────────────────────────
function numEnv(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** "https://www.Shop.com/path" -> "shop.com" ; used for BOTH list entries and request hosts */
function normaliseHost(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d+$/, '')
    .replace(/^www\./, '');
}

function hostEnabled(listEnv: string | undefined, host: string): boolean {
  const list = (listEnv ?? '')
    .split(/[,\s;]+/)
    .map(normaliseHost)
    .filter(Boolean);
  if (!list.length) return false;
  return list.includes('*') || list.includes(normaliseHost(host));
}

const firecrawlKey = () => (process.env.FIRECRAWL_API_KEY ?? '').trim();
const autoFallbackOn = () => !!firecrawlKey() && process.env.FIRECRAWL_AUTO_FALLBACK !== 'false';

function shouldRelay(host: string): boolean {
  return !!process.env.STORE_PROXY_URL && hostEnabled(process.env.STORE_PROXY_HOSTS, host);
}

// Hosts that recently got a firewall block on the direct route.
const blockedHosts = new Map<string, number>();
const isHostBlocked = (host: string) => (blockedHosts.get(host) ?? 0) > Date.now();
const markHostBlocked = (host: string) =>
  blockedHosts.set(host, Date.now() + numEnv('FIRECRAWL_BLOCKED_MEMORY_SECONDS', 600) * 1000);

// One log line per host per instance: which route, and what config was seen.
const routeLogged = new Set<string>();
function logRouteOnce(host: string, route: string): void {
  if (routeLogged.has(host)) return;
  routeLogged.add(host);
  console.log('[storeFetch] route', {
    host,
    route,
    firecrawlKeySet: !!firecrawlKey(),
    firecrawlHosts: process.env.FIRECRAWL_HOSTS ?? null,
    autoFallback: autoFallbackOn(),
    redis: !!process.env.WISH_DROP_REDIS_URL,
  });
}

// ── Block detection ─────────────────────────────────────────────────────────
// True only for a FIREWALL block (challenge / deny page). A genuine API error
// from the store (JSON body, e.g. WooCommerce "invalid key") is NOT a block,
// so it never spends Firecrawl credits.
const BLOCK_BODY = /just a moment|cf-chl|attention required|access denied|sucuri|imunify360|wordfence|you have been blocked|captcha/i;

async function looksLikeFirewallBlock(res: Response): Promise<boolean> {
  if (![403, 429, 503].includes(res.status)) return false;
  if (res.headers.get('cf-mitigated') || res.headers.get('x-sucuri-id')) return true;
  try {
    const body = (await res.clone().text()).trim().slice(0, 4000);
    if (body.startsWith('{') || body.startsWith('[')) return false; // real API error
    if (BLOCK_BODY.test(body)) return true;
  } catch {
    /* fall through */
  }
  const server = (res.headers.get('server') ?? '').toLowerCase();
  return /cloudflare|sucuri|imunify|akamai/.test(server) && res.status === 403;
}

async function isJsonBody(res: Response): Promise<boolean> {
  try {
    const body = (await res.clone().text()).trimStart();
    return body.startsWith('{') || body.startsWith('[');
  } catch {
    return false;
  }
}

// A WordPress REST endpoint that answers with HTML instead of JSON is almost
// always a firewall / security-plugin page (some return it with status 200, which
// looksLikeFirewallBlock() ignores). Treat it as a block so the fallback runs
// instead of res.json() throwing a SyntaxError in the provider.
async function looksLikeNonJsonApi(target: URL, res: Response): Promise<boolean> {
  if (!target.pathname.includes('/wp-json/')) return false;
  const okOrBlockStatus = (res.status >= 200 && res.status < 300) || [403, 429, 503].includes(res.status);
  if (!okOrBlockStatus) return false;
  if ((res.headers.get('content-type') ?? '').toLowerCase().includes('json')) return false;
  return !(await isJsonBody(res));
}

// ── Firecrawl ───────────────────────────────────────────────────────────────
// Only headers the seller needs are forwarded: Authorization (wc/v3 keys) and
// any x-* header (e.g. an x-wishdrop-key secret for a Cloudflare skip rule).
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

// For a JSON endpoint Firecrawl may return bare JSON, or a browser "JSON
// viewer" page with the JSON inside <pre>. Return plain JSON in both cases;
// leave real HTML pages untouched.
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

// Rebuild WooCommerce pagination headers when they can be known for sure:
// a page shorter than per_page is the last page.
function paginationHeaders(target: URL, text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const perRaw = target.searchParams.get('per_page');
  if (!perRaw || !text.startsWith('[')) return out;
  const per = Number(perRaw);
  const page = Math.max(1, Number(target.searchParams.get('page') ?? 1) || 1);
  if (!Number.isFinite(per) || per <= 0) return out;
  try {
    const arr = JSON.parse(text);
    if (Array.isArray(arr) && arr.length < per) {
      out['x-wp-total'] = String((page - 1) * per + arr.length);
      out['x-wp-totalpages'] = String(arr.length === 0 ? Math.max(1, page - 1) : page);
    }
  } catch {
    /* not JSON: no headers */
  }
  return out;
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
      Authorization: `Bearer ${firecrawlKey()}`,
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
  const status =
    Number.isInteger(code) && (code as number) >= 200 && (code as number) <= 599 ? (code as number) : 200;

  if (DEBUG()) console.log('[storeFetch] firecrawl ->', status, target.pathname + target.search);

  const text = extractBody(raw);
  const looksJson = text.startsWith('{') || text.startsWith('[');
  const noBody = status === 204 || status === 205 || status === 304;
  return new Response(noBody ? null : text, {
    status,
    headers: {
      'content-type': looksJson ? 'application/json' : 'text/html; charset=utf-8',
      ...(status < 300 ? paginationHeaders(target, text) : {}),
    },
  });
}

// ── Cache durations ─────────────────────────────────────────────────────────
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

async function cacheSet(
  redis: Redis,
  key: string,
  entry: CachedEntry,
  ttlSeconds: number = numEnv('SCRAPEDO_STALE_SECONDS', 604800),
): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(entry), 'EX', ttlSeconds);
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

// ── Firecrawl rate guard ────────────────────────────────────────────────────
// Firecrawl limits requests per minute per ACCOUNT, and every serverless
// instance shares that one limit, so the counter lives in Redis when it is
// available (in-memory per instance otherwise). A real 429 from Firecrawl also
// starts a shared cooldown so other requests stop hitting it until it resets.
const fcLocal = { minute: 0, count: 0, cooldownUntil: 0 };

async function firecrawlBudget(): Promise<{ ok: boolean; retryAfterSec: number }> {
  const limit = Math.floor(numEnv('FIRECRAWL_MAX_PER_MINUTE', 15));
  const now = Date.now();
  const minute = Math.floor(now / 60000);
  const secondsToNextMinute = Math.max(1, Math.ceil((minute + 1) * 60 - now / 1000));

  if (fcLocal.cooldownUntil > now) {
    return { ok: false, retryAfterSec: Math.ceil((fcLocal.cooldownUntil - now) / 1000) };
  }

  const redis = getRedis();
  if (redis) {
    try {
      const cooldown = Number(await redis.get('firecrawl:cooldown'));
      if (Number.isFinite(cooldown) && cooldown > now) {
        fcLocal.cooldownUntil = cooldown;
        return { ok: false, retryAfterSec: Math.ceil((cooldown - now) / 1000) };
      }
      const key = `firecrawl:rate:${minute}`;
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, 90);
      return count > limit ? { ok: false, retryAfterSec: secondsToNextMinute } : { ok: true, retryAfterSec: 0 };
    } catch {
      /* Redis trouble: fall through to the in-memory counter */
    }
  }

  if (fcLocal.minute !== minute) {
    fcLocal.minute = minute;
    fcLocal.count = 0;
  }
  fcLocal.count += 1;
  return fcLocal.count > limit ? { ok: false, retryAfterSec: secondsToNextMinute } : { ok: true, retryAfterSec: 0 };
}

// Called when Firecrawl itself answers 429 (not when the seller's site does).
async function noteFirecrawlRateLimit(res: Response): Promise<void> {
  try {
    const body = (await res.clone().text()).slice(0, 1000);
    if (!/rate limit exceeded|firecrawl\.dev\/pricing/i.test(body)) return; // the seller's 429, not ours
    const m = body.match(/retry after (\d+)\s*s/i);
    const seconds = Math.min(120, Math.max(5, m ? Number(m[1]) : Number(res.headers.get('retry-after')) || 30));
    const until = Date.now() + seconds * 1000;
    fcLocal.cooldownUntil = until;
    console.warn(`[storeFetch] Firecrawl rate limit hit: pausing Firecrawl calls for ${seconds}s`);
    const redis = getRedis();
    if (redis) await redis.set('firecrawl:cooldown', String(until), 'EX', seconds).catch(() => undefined);
  } catch {
    /* never throw from bookkeeping */
  }
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

// ── Route B: direct / relay ─────────────────────────────────────────────────
async function directRequest(
  target: URL,
  init: NextInit,
  via: 'direct' | 'relay',
  failFastOnBlock: boolean,
): Promise<Response> {
  const host = target.hostname;
  let requestUrl = target.toString();
  const headers = mergeHeaders(target.origin, init.headers);
  if (via === 'relay') {
    requestUrl = `${process.env.STORE_PROXY_URL}?url=${encodeURIComponent(target.toString())}`;
    headers.set('x-proxy-secret', process.env.STORE_PROXY_SECRET ?? '');
  }

  await acquire(host, MAX_CONCURRENT_PER_HOST);
  try {
    let lastRes: Response | undefined;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(requestUrl, { ...init, headers });
        if (!RETRY_STATUSES.has(res.status)) return res;
        lastRes = res;
        // A Cloudflare managed challenge can't be passed by retrying, and
        // retrying only makes the traffic look more like a bot. Fail fast.
        if (res.headers.get('cf-mitigated') === 'challenge') break;
        if (failFastOnBlock && (await looksLikeFirewallBlock(res))) break;
        // A real API error (JSON body, e.g. bad wc/v3 key): retrying can't fix it.
        if (res.status === 403 && (await isJsonBody(res))) break;
        if (attempt < MAX_RETRIES) await sleep(retryDelayMs(attempt, res));
      } catch (err) {
        if (attempt === MAX_RETRIES) throw err;
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
}

// ── Route A: Firecrawl (+ Redis cache) ──────────────────────────────────────
async function firecrawlRequest(target: URL, init: NextInit): Promise<Response> {
  const host = target.hostname;
  const slot = `fc:${host}`;
  const limit = Math.max(1, Math.floor(numEnv('FIRECRAWL_CONCURRENCY', 2)));

  // Firecrawl bills per request: no automatic retries on our side.
  const runRequest = async (): Promise<Response> => {
    await acquire(slot, limit);
    try {
      const budget = await firecrawlBudget();
      if (!budget.ok) {
        console.warn(`[storeFetch] Firecrawl guard: not calling Firecrawl for ${budget.retryAfterSec}s`, target.pathname);
        return new Response(JSON.stringify({ error: 'Firecrawl rate-limit guard: try again shortly' }), {
          status: 429,
          headers: { 'content-type': 'application/json', 'retry-after': String(budget.retryAfterSec) },
        });
      }
      const res = await firecrawlScrape(target, init);
      if (res.status === 429) await noteFirecrawlRateLimit(res);
      if (RETRY_STATUSES.has(res.status)) await logBlocked(target.toString(), res, 'firecrawl');
      return res;
    } finally {
      release(slot);
    }
  };

  const redis = getRedis();
  if (!redis) {
    console.warn('[storeFetch] Firecrawl without Redis: responses are NOT cached, every call spends credits');
    return runRequest();
  }

  const key = cacheKey(target, pickForwardHeaders(init.headers));
  const ttlMs = freshSeconds(target) * 1000;

  // Short negative cache: a URL that keeps failing must not spend a Firecrawl
  // credit on every visitor. Kept brief so recovery is quick.
  const negKey = `${key}:neg`;
  const negMs = numEnv('FIRECRAWL_NEGATIVE_CACHE_SECONDS', 90) * 1000;
  const neg = await cacheGet(redis, negKey);
  if (neg && Date.now() - neg.t < negMs) {
    if (DEBUG()) console.log('[storeFetch] negative cache HIT', target.pathname + target.search);
    const stale = await cacheGet(redis, key); // prefer an old good copy over the cached error
    return entryToResponse(stale ?? neg);
  }

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
        // 401 (bad key), 402 (out of credits) and 429 (rate limit, which the
        // guard/cooldown already handles) are not cached, so recovery takes
        // effect immediately.
        if (entry.s !== 401 && entry.s !== 402 && entry.s !== 429) {
          await cacheSet(redis, negKey, entry, Math.ceil(negMs / 1000));
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

// ── Public API ──────────────────────────────────────────────────────────────
export async function storeFetch(input: string | URL, init: NextInit = {}): Promise<Response> {
  const target = new URL(typeof input === 'string' ? input : input.toString());
  const host = target.hostname;

  const key = firecrawlKey();
  const listed = !!key && hostEnabled(process.env.FIRECRAWL_HOSTS, host);
  const fallback = autoFallbackOn();
  const baseVia: 'direct' | 'relay' = shouldRelay(host) ? 'relay' : 'direct';

  // A. always through Firecrawl
  if (listed) {
    logRouteOnce(host, 'firecrawl');
    return firecrawlRequest(target, init);
  }

  // C (memory). this host was just blocked: skip the doomed direct attempt
  if (fallback && isHostBlocked(host)) {
    logRouteOnce(host, 'firecrawl (blocked-host memory)');
    return firecrawlRequest(target, init);
  }

  // B. direct / relay
  logRouteOnce(host, fallback ? `${baseVia} + firecrawl fallback` : baseVia);
  const res = await directRequest(target, init, baseVia, fallback);

  // C. blocked by a firewall -> retry through Firecrawl
  if (fallback && ((await looksLikeFirewallBlock(res)) || (await looksLikeNonJsonApi(target, res)))) {
    markHostBlocked(host);
    console.warn('[storeFetch] direct request blocked, falling back to Firecrawl:', host);
    return firecrawlRequest(target, init);
  }

  return res;
}