// lib/store-providers/http.ts
//
// Drop-in replacement for `fetch` for every request made to a seller's
// store (WooCommerce / Shopify / jsonapi / scrapers).
//
// Why it exists: a seller's firewall (Imunify360, Cloudflare, Wordfence,
// Sucuri...) often returns 403 to requests from Vercel's datacenter IPs
// even though the same request works from a home connection. This helper:
//
//   1. Sends a complete, consistent set of browser headers (not just a UA).
//   2. Limits concurrent requests per host so fan-out loops (per-collection
//      counts, paged scrapes) don't trip rate limits.
//   3. Retries 403 / 429 / 5xx a couple of times with backoff + jitter,
//      honouring Retry-After.
//   4. Optionally sends the request through a relay (see
//      relay/cloudflare-worker.js) when STORE_PROXY_URL is set.
//   5. Logs WHO blocked you (server, cf-ray, body snippet) on final failure,
//      so the Vercel logs tell you which firewall it is.
//
// Env (all optional):
//   STORE_PROXY_URL     e.g. https://store-relay.yourname.workers.dev
//   STORE_PROXY_SECRET  shared secret the relay checks
//   STORE_PROXY_HOSTS   comma list of hostnames to relay, or "*" for all.
//                       Unset = relay nothing (direct requests only).
//
// Usage: in a provider file, replace the global fetch with this one:
//   import { storeFetch as fetch } from './http';

type NextInit = RequestInit & { next?: { revalidate?: number | false; tags?: string[] } };

const RETRY_STATUSES = new Set([403, 429, 500, 502, 503, 504]);
const MAX_RETRIES = 2;
const MAX_CONCURRENT_PER_HOST = 4;

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

// ── Relay routing ───────────────────────────────────────────────────────────
function shouldRelay(host: string): boolean {
  if (!process.env.STORE_PROXY_URL) return false;
  const list = (process.env.STORE_PROXY_HOSTS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!list.length) return false;
  return list.includes('*') || list.includes(host);
}

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

async function logBlocked(url: string, res: Response, viaRelay: boolean) {
  try {
    const body = (await res.clone().text()).replace(/\s+/g, ' ').slice(0, 300);
    console.error('[storeFetch] blocked', {
      url,
      status: res.status,
      viaRelay,
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
  const viaRelay = shouldRelay(host);

  const headers = mergeHeaders(target.origin, init.headers);

  let requestUrl = target.toString();
  if (viaRelay) {
    requestUrl = `${process.env.STORE_PROXY_URL}?url=${encodeURIComponent(target.toString())}`;
    headers.set('x-proxy-secret', process.env.STORE_PROXY_SECRET ?? '');
  }

  await acquire(host);
  try {
    let lastRes: Response | undefined;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(requestUrl, { ...init, headers });
        if (!RETRY_STATUSES.has(res.status)) return res;
        lastRes = res;
        if (attempt < MAX_RETRIES) await sleep(retryDelayMs(attempt, res));
      } catch (err) {
        if (attempt === MAX_RETRIES) throw err;
        await sleep(retryDelayMs(attempt));
      }
    }
    // Out of retries: log who is blocking, then hand the response back so
    // callers keep their existing `if (!res.ok)` handling.
    if (lastRes) await logBlocked(target.toString(), lastRes, viaRelay);
    return lastRes as Response;
  } finally {
    release(host);
  }
}