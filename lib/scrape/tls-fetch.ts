/**
 * lib/scrape/tls-fetch.ts
 *
 * Self-hosted TLS-fingerprint-matching fetch. No third-party scraping API.
 *
 * ---------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------
 * Node's built-in TLS stack (whether via `fetch`, `undici`, or `https`)
 * negotiates its TLS ClientHello using Node's own OpenSSL build — cipher
 * suite order, extension order, supported groups, ALPN list, etc. That
 * ClientHello has a distinct, well-known fingerprint (JA3/JA4) that is
 * NOT the same as any real browser's, no matter what User-Agent header
 * you set. Fingerprint-aware WAFs (Akamai, PerimeterX/HUMAN, Cloudflare
 * Bot Management, Imperva, and plenty of custom in-house ones) check the
 * TLS handshake itself, independent of headers — so "set a Chrome
 * User-Agent" alone does nothing against this class of check.
 *
 * This module uses `impit` (https://github.com/apify/impit) — a Rust
 * library, exposed to Node via a native N-API addon — built on patched
 * forks of `rustls`/`reqwest`/`h2` that reproduce a real browser's TLS
 * ClientHello (JA3/JA4) and HTTP/2 frame-level fingerprint, not just its
 * headers. `impit` also sets the User-Agent / `sec-ch-ua` / etc. headers
 * itself, matched to whichever TLS fingerprint it's emulating — do NOT
 * override those headers from calling code, or you recreate the exact
 * "TLS says Chrome, headers say something else" mismatch this module
 * exists to avoid.
 *
 * ---------------------------------------------------------------------
 * HISTORY OF THIS MODULE (why it's not `tls-client` + ffi, or got-scraping)
 * ---------------------------------------------------------------------
 * v1 used the `tls-client` npm wrapper, which loads bogdanfinn/tls-client's
 * shared library through `ffi-napi`/`ref-napi`. Both are old, effectively
 * unmaintained native addons: no working Windows build, narrow prebuild
 * coverage, dead on current Node.
 *
 * v2 swapped the FFI layer for `koffi` (actively maintained, real
 * prebuilds) while still loading the same bogdanfinn/tls-client shared
 * library — but that still required manually downloading a
 * platform-specific `.dll`/`.so`/`.dylib` release asset and pointing
 * `TLS_CLIENT_LIB_PATH`/`TLS_CLIENT_LIB_DIR` at it, which is easy to get
 * wrong and doesn't travel with `npm install`.
 *
 * v3 (this version) uses `impit`. Its npm package auto-selects and
 * installs a prebuilt native binary for your platform as a normal
 * dependency (same mechanism as `esbuild`/`@swc/core`) — `npm install
 * impit` / `pnpm add impit` is the entire setup, no separate binary
 * download, no env vars, no native compiler needed on any platform.
 * It also exposes a `fetch`-compatible API with a real `AbortSignal`, so
 * (unlike v1/v2) an in-flight request can actually be cancelled instead
 * of just having its result discarded.
 *
 * The one real capability drop from v1/v2: `impit`'s Node API only lets
 * you pick a browser *family* (`chrome` / `firefox`), not a specific
 * version the way `tls-client`'s `chrome_120` vs `chrome_124` identifiers
 * did. Identity rotation below is therefore 2-way, not 4-way.
 *
 * ---------------------------------------------------------------------
 * WHAT THIS DOES **NOT** FIX
 * ---------------------------------------------------------------------
 * - IP-reputation blocks. If a WAF blocks based on the requesting IP
 *   (datacenter/cloud ASN, known-bad-IP lists, request-volume-from-this-IP
 *   heuristics), a perfect TLS fingerprint from that same blocked IP is
 *   still blocked. This module accepts an optional proxy so you can route
 *   through your own IP source (residential/mobile/rotating IPs you
 *   control) — but it does not supply IPs itself. See PROXY CONFIG below.
 * - JS-hydration requirements. This is a raw HTTP client, not a browser —
 *   it does not execute JavaScript. If a page's real product data only
 *   exists after client-side JS runs (not in the initial server response
 *   at all, not even as an embedded JSON blob), no fingerprint trick
 *   changes that; you still need the headless-render tier for that case.
 *   It DOES help for sites that server-render an embedded JSON state blob
 *   (e.g. `window.__INITIAL_STATE__`) even though the *visual* DOM
 *   requires hydration — parsers.ts's `extractEmbeddedStateProduct`
 *   already knows how to mine that out of whatever HTML comes back here.
 *
 * ---------------------------------------------------------------------
 * INSTALL
 * ---------------------------------------------------------------------
 *   pnpm add impit
 *
 * That's it — no shared library to download, no TLS_CLIENT_LIB_PATH, no
 * native compiler required on Windows/macOS/Linux.
 *
 * If bundled by Next.js (or any other bundler) for server code, mark it
 * external the same way you would `koffi` or any other native addon —
 * bundling a native N-API module breaks its ability to find its own
 * binary. In next.config.js/ts:
 *
 *   const nextConfig = { serverExternalPackages: ['impit'] }
 *
 * ---------------------------------------------------------------------
 * PROXY CONFIG (self-hosted — no third-party scraping API)
 * ---------------------------------------------------------------------
 * Set TLS_FETCH_PROXIES to a comma-separated list of proxy URLs you
 * control or have purchased access to (residential/mobile/rotating IP
 * providers, your own VPS pool, etc.):
 *
 *   TLS_FETCH_PROXIES=http://user:pass@proxy1.example.com:8000,http://user:pass@proxy2.example.com:8000
 *
 * Left unset, requests go out on your server's own IP — fine for sites
 * that only fingerprint-check, useless against an IP-reputation block.
 */

// `impit`'s own types are thin for our purposes; keep the surface we
// actually use narrow and typed here rather than fighting its .d.ts.
type ImpitInstance = {
  fetch: (url: string, init?: { signal?: AbortSignal }) => Promise<{
    status: number
    text: () => Promise<string>
  }>
}

type ImpitConstructor = new (options: {
  browser: 'chrome' | 'firefox'
  proxyUrl?: string
  followRedirects?: boolean
  ignoreTlsErrors?: boolean
}) => ImpitInstance

let ImpitCtorPromise: Promise<ImpitConstructor> | null = null

async function loadImpit(): Promise<ImpitConstructor> {
  if (ImpitCtorPromise) return ImpitCtorPromise

  ImpitCtorPromise = (async () => {
    try {
      // Dynamic import so environments that never touch this fallback
      // tier don't pay the native-load cost or fail startup if the
      // optional dependency isn't installed.
      const mod = await import('impit')
      return mod.Impit as ImpitConstructor
    } catch (e) {
      throw new Error(
        "impit is not installed. Run 'pnpm add impit' to enable the TLS-fingerprint fetch tier. " +
          `(underlying error: ${e instanceof Error ? e.message : String(e)})`
      )
    }
  })()

  // Don't cache a rejected load — let the next call retry.
  ImpitCtorPromise.catch(() => {
    ImpitCtorPromise = null
  })

  return ImpitCtorPromise
}

// ---------------------------------------------------------------------
// Browser identities
// ---------------------------------------------------------------------
// impit generates its own matched User-Agent / sec-ch-ua / etc. headers
// for whichever browser family it's emulating — we deliberately do NOT
// supply our own header set here (unlike the old tls-client-based
// versions of this file), since overriding them independently of the
// TLS fingerprint would recreate the exact "TLS says Chrome, headers say
// something else" inconsistency this module exists to avoid.

type BrowserIdentity = {
  name: string
  browser: 'chrome' | 'firefox'
}

const IDENTITIES: BrowserIdentity[] = [
  { name: 'chrome', browser: 'chrome' },
  { name: 'firefox', browser: 'firefox' },
]

function pickIdentity(attempt: number): BrowserIdentity {
  return IDENTITIES[attempt % IDENTITIES.length]
}

// ---------------------------------------------------------------------
// Proxy pool
// ---------------------------------------------------------------------

function loadProxyPool(): string[] {
  const raw = process.env.TLS_FETCH_PROXIES
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function pickProxy(pool: string[], attempt: number): string | undefined {
  if (!pool.length) return undefined
  return pool[attempt % pool.length]
}

// ---------------------------------------------------------------------
// Instance cache
// ---------------------------------------------------------------------
// A proxy is bound at construction time in impit's API (unlike
// tls-client, which took it per-request), so instances are cached per
// (identity, proxy) pair rather than per identity alone. Reusing an
// instance across requests also lets its internal cookie jar accumulate
// naturally, the same rationale the tls-client-based versions of this
// file had for reusing one session per identity.

const impitCache = new Map<string, ImpitInstance>()

async function getImpitInstance(identity: BrowserIdentity, proxy: string | undefined): Promise<ImpitInstance> {
  const key = `${identity.name}:${proxy ?? 'direct'}`
  const cached = impitCache.get(key)
  if (cached) return cached

  const Impit = await loadImpit()
  const instance = new Impit({
    browser: identity.browser,
    proxyUrl: proxy,
    followRedirects: true,
    ignoreTlsErrors: false,
  })
  impitCache.set(key, instance)
  return instance
}

// ---------------------------------------------------------------------
// Timeout / cancellation
// ---------------------------------------------------------------------

const TIMEOUT_REASON = 'tls-fetch-timeout'

function createRequestSignal(timeoutMs: number, external?: AbortSignal): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error(TIMEOUT_REASON)), timeoutMs)

  const onExternalAbort = () => {
    clearTimeout(timer)
    controller.abort(external?.reason)
  }
  external?.addEventListener('abort', onExternalAbort, { once: true })

  return {
    signal: controller.signal,
    cancel: () => {
      clearTimeout(timer)
      external?.removeEventListener('abort', onExternalAbort)
    },
  }
}

// ---------------------------------------------------------------------
// Public fetch API — mirrors the {html, error, status} shape used
// elsewhere in lib/scrape (fetchDirectOnce in parsers.ts) so it drops
// into the same call sites with the same error-handling conventions.
// ---------------------------------------------------------------------

export type TlsFetchResult = {
  html: string | null
  error: string | null
  status: number | null
  identityUsed: string | null
}

export async function fetchWithTlsFingerprintOnce(
  url: string,
  attempt: number,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<TlsFetchResult> {
  if (signal?.aborted) {
    return { html: null, error: 'Client disconnected', status: null, identityUsed: null }
  }

  const identity = pickIdentity(attempt)
  const proxyPool = loadProxyPool()
  const proxy = pickProxy(proxyPool, attempt)

  let impit: ImpitInstance
  try {
    impit = await getImpitInstance(identity, proxy)
  } catch (e) {
    return {
      html: null,
      error: e instanceof Error ? e.message : String(e),
      status: null,
      identityUsed: identity.name,
    }
  }

  const { signal: requestSignal, cancel } = createRequestSignal(timeoutMs, signal)

  try {
    const response = await impit.fetch(url, { signal: requestSignal })
    const html = await response.text()
    return { html, error: null, status: response.status, identityUsed: identity.name }
  } catch (e) {
    if (requestSignal.aborted) {
      const reason = requestSignal.reason
      if (reason instanceof Error && reason.message === TIMEOUT_REASON) {
        return {
          html: null,
          error: `TLS-fingerprint fetch timed out after ${timeoutMs}ms (identity: ${identity.name})`,
          status: null,
          identityUsed: identity.name,
        }
      }
      return { html: null, error: 'Client disconnected', status: null, identityUsed: identity.name }
    }
    const msg = e instanceof Error ? e.message : String(e)
    return {
      html: null,
      error: `TLS-fingerprint fetch failed (identity: ${identity.name}${proxy ? ', proxied' : ', no proxy'}): ${msg}`,
      status: null,
      identityUsed: identity.name,
    }
  } finally {
    cancel()
  }
}

/**
 * Retries across multiple browser identities (and, if configured,
 * multiple proxies) before giving up. Each attempt uses a DIFFERENT
 * identity+proxy pairing — repeating the exact same fingerprint+IP
 * combination that just got blocked is pointless.
 *
 * Validity of the response is checked with the SAME shared heuristics
 * used everywhere else in lib/scrape (looksBlocked / looksLikeJsRequiredShell)
 * so "got 200 but it's a CAPTCHA page" and "got 200 but it's an
 * unhydrated shell" are both treated as failures worth retrying, not
 * silently accepted.
 */
export async function fetchWithTlsFingerprintRetries(
  url: string,
  {
    maxAttempts = IDENTITIES.length,
    timeoutMs = 20_000,
    signal,
    isBlocked,
    isJsShell,
  }: {
    maxAttempts?: number
    timeoutMs?: number
    signal?: AbortSignal
    /** Injected rather than imported directly, so this module has zero
     * hard dependency on parsers.ts/shared.ts's specific export shape —
     * callers pass in their own `looksBlocked`/`looksLikeJsRequiredShell`. */
    isBlocked?: (html: string) => boolean
    isJsShell?: (html: string) => boolean
  } = {}
): Promise<{ html: string | null; error: string | null; identityUsed: string | null }> {
  let lastError: string | null = null
  let lastIdentity: string | null = null

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) {
      return { html: null, error: 'Client disconnected', identityUsed: lastIdentity }
    }

    if (attempt > 0) {
      // Small jitter between identity swaps — an instant retry storm is
      // itself a signal, and it also gives a rotating proxy pool a
      // moment before the next request lands on it.
      await new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 500))
    }

    const result = await fetchWithTlsFingerprintOnce(url, attempt, timeoutMs, signal)
    lastIdentity = result.identityUsed

    if (result.html && !result.error) {
      if (isBlocked?.(result.html)) {
        lastError = `TLS-fingerprint fetch (identity: ${result.identityUsed}) returned a CAPTCHA/robot-check page — if this persists across every identity, the block is very likely IP-based rather than fingerprint-based; a different fingerprint on the same blocked IP won't help. See TLS_FETCH_PROXIES.`
        continue
      }
      if (isJsShell?.(result.html)) {
        lastError = `TLS-fingerprint fetch (identity: ${result.identityUsed}) returned an unhydrated JS shell — this site's product data isn't present without executing JS, so no fingerprint or proxy will fix this; you need the headless-render tier for it.`
        continue
      }
      return { html: result.html, error: null, identityUsed: result.identityUsed }
    }

    lastError = result.error
  }

  return { html: null, error: lastError, identityUsed: lastIdentity }
}

/**
 * Call during graceful shutdown. impit's Node binding doesn't expose an
 * explicit close/destroy handle to release (no native session state
 * outlives the process the way tls-client's did) — this just drops our
 * references so cached instances (and their cookie jars) can be
 * garbage-collected instead of reused on the next request.
 */
export async function closeAllTlsSessions(): Promise<void> {
  impitCache.clear()
}