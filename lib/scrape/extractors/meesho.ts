// lib/scrape/extractors/meesho.ts
//
// Meesho-specific scraping logic, split out into its own module the same
// way amazon.ts and flipkart.ts are.
//
// UPDATE: a real captured Meesho PDP fragment has now confirmed several
// things this file previously only guessed at — title, price, rating,
// review count, seller name, and the (single-size) "Select Size" picker
// are all backed by real markup below, with the specific selectors that
// matched noted inline.
//
// FIX: a second real captured fragment showed the ratings/review-count
// text rendering as a single span — "4878 Ratings, 2420 Reviews" — two
// genuinely different numbers, not one figure repeated.
// extractMeeshoRatingFromDom() previously matched only the "Ratings"
// figure but stored it under `review_count`, silently discarding the
// real review count whenever the two differ. See that function below
// for the fix — now prefers an explicit "Reviews" match and only falls
// back to the Ratings figure if no Reviews number is present at all.
//
// FIX: a third real captured fragment showed Meesho's MULTI-option size
// picker for the first time, with a genuine mix of in-stock and
// out-of-stock chips (XS/S/M/L sold out, XL/XXL in stock, confirmed by
// cross-referencing the "Product Details" text block). Against this
// real markup, isChipOutOfStock()'s previous heuristic (disabled attr /
// sold-out-sounding class / trailing "(Out of Stock)" text) matched
// NONE of the four genuinely out-of-stock chips. Out-of-stock chips
// instead carry an extra empty child whose class contains
// "DividerSection" and their label span's literal `color` attribute
// reads "greyT3Divider" instead of the in-stock "greyBase". See
// isChipOutOfStock() below for the fix. isSelectedSizeChip() remains
// UNVERIFIED — no chip in any captured example so far has been in a
// pre-selected state.
//
// FIX: real testing confirmed Meesho's block survives even the
// in-house headless-browser tier in parsers.ts — that tier only fixes
// "needs JS to render" problems, not IP-reputation blocks, and
// Meesho's WAF blocks on the egress IP itself regardless of what
// browser is behind it. Added a Meesho-specific ScraperAPI fallback
// (residential-proxy pool) below, consumed generically by parsers.ts
// via the SUPPORTS_SCRAPERAPI_FALLBACK flag — same opt-in pattern as
// REQUIRES_RENDER_FOR_VARIANTS.
//
// FIX: a single SCRAPERAPI_KEY exhausting its quota used to take the
// whole ScraperAPI tier down with it. Replaced with a key *pool* —
// SCRAPERAPI_KEY plus up to ten numbered SCRAPERAPI_KEY_1..
// SCRAPERAPI_KEY_10 env vars, all pooled together. Requests round-robin
// which key they start with (spreads load instead of hammering key #1
// until it dies), and within a single call, a key that looks
// exhausted/invalid/rate-limited (or still comes back blocked) falls
// through to the next key in the pool automatically. See
// getScraperApiKeyPool()/fetchMeeshoViaScraperApi() below.
//
// FIX: ScraperAPI is the paid, minimize-usage tier — a repeat scrape of
// the same Meesho URL within a day shouldn't burn a second credit.
// Added a Redis cache in front of fetchMeeshoViaScraperApi() keyed by
// URL, 24h TTL (see CACHE_TTL_SECONDS below). Uses the existing
// REDIS_URL env var already configured for this project. Redis being
// unreachable/misconfigured never breaks scraping — every Redis call
// is wrapped so a cache miss/error just falls through to a real
// ScraperAPI fetch, same as today. See getRedisClient()/
// getCachedMeeshoHtml()/setCachedMeeshoHtml() below.
//
// FIX: production logs showed BOTH keys in a two-key pool failing with
// the identical message "This operation was aborted" — that's the
// AbortController firing from our own timeout, not a ScraperAPI-side
// auth/quota rejection. render:'true' + premium/ultra_premium
// (headless render + residential proxy) can commonly take 30-60s+ per
// ScraperAPI's own docs.
//
// FIX (this pass, superseding the flat-60s-timeout fix above): a flat
// per-request timeout conflated two different concerns — "how long is
// one HTTP call to ScraperAPI allowed to hang" and "how long is the
// WHOLE retry loop (every key, every free retry, every ultra_premium
// fallback) allowed to run before giving up." A single 60s number
// tried to be both and did neither well: too short for a legitimately
// slow render, and (if simply raised) too generous per individual
// attempt, letting one bad attempt eat most of the budget on its own.
// Split into PER_ATTEMPT_TIMEOUT_MS (30s — one HTTP call) and
// TOTAL_BUDGET_MS (5 min — the entire call, across every key and
// retry), with a deadline tracked across the whole loop so the last
// attempt before the deadline gets whatever time is actually left,
// never more. Also threaded an optional AbortSignal all the way down
// from the caller (ultimately the incoming Next.js request) into every
// individual ScraperAPI fetch, so a client disconnecting stops the
// upstream call instead of it running to completion — and being
// billed — with nobody left to receive the result.
//
// FIX: a real log showed key 2 fail with HTTP 500 —
// "Request failed. You will not be charged for this request. ...
// Protected domains may require adding premium=true OR
// ultra_premium=true" — even though premium=true was already being
// sent. Confirmed this is ScraperAPI's generic canned message for any
// failed/hard-to-scrape attempt, not a real diagnosis that premium was
// missing. Since the response explicitly says the request wasn't
// charged, it's cheap to retry the same key a couple of times before
// writing it off (see MAX_FREE_RETRIES_PER_KEY), and only after that
// keeps failing the same way does it spend one real, billed
// ultra_premium=true attempt on that key — genuinely following
// ScraperAPI's own suggested remedy — before moving to the next key in
// the pool. See attemptScraperApiRequest()/fetchMeeshoViaScraperApi()
// below.
//
// FIX: quotaExhaustedKeys used to be a plain Set — once a key 403'd
// with a credit/quota-looking message it stayed blacklisted for the
// entire process lifetime, even past a real monthly quota reset. Now a
// Map of key -> timestamp; a key is only skipped for
// QUOTA_RETRY_AFTER_MS before becoming eligible again.
import type { Cheerio, CheerioAPI } from 'cheerio'
import Redis from 'ioredis'
import { cleanText, detectCurrencyAndClean, domainCurrency, looksBlocked, readErrorBodySnippet } from '../shared'
import type { AmazonVariantDimension, AmazonVariantOption } from './amazon'

export type MeeshoVariantOption = AmazonVariantOption
export type MeeshoVariantDimension = AmazonVariantDimension

// ---------- Site config (consumed by parsers.ts) ----------

/** The SiteId literal for Meesho — imported instead of re-typing the
 * string 'meesho' at each call site in parsers.ts. */
export const SITE_ID = 'meesho' as const

/** Meesho's __NEXT_DATA__ blob (when present) usually carries enough
 * for price/title even on a direct fetch, but the size-button row has
 * not been verified to always be present pre-hydration. parsers.ts
 * uses this to flag (via a warning, since there's no render-capable
 * fetch tier anymore) when variant data was requested but never
 * appeared. */
export const REQUIRES_RENDER_FOR_VARIANTS = true

/** Meesho's og:meta price tags have historically been unreliable, so
 * its structured-data fallback chain intentionally stays JSON-only
 * (the __NEXT_DATA__ blob + the DOM-based fallbacks below) rather than
 * also trying the generic JSON-LD/og:meta pass parsers.ts runs for
 * most other sites — that risked silently overwriting a correct null
 * with a wrong number instead of leaving it null. */
export const SKIPS_GENERIC_STRUCTURED_FALLBACK = true

/** Tells parsers.ts's fetchDirectWithRetries this site has a
 * ScraperAPI fallback function it can call (see
 * meeshoScraperApiConfigured/fetchMeeshoViaScraperApi below) after its
 * own direct-fetch and headless-browser tiers are exhausted. Consumed
 * generically via SCRAPERAPI_FALLBACK's registry in parsers.ts, so a
 * second site can opt in later without changing parsers.ts's fetch
 * logic itself. */
export const SUPPORTS_SCRAPERAPI_FALLBACK = true

/** Pulls the internal `_meeshoWarning`/`_meeshoUnavailable` flags
 * (see isMeeshoUnavailable() below) off a parsed result and returns
 * them as plain metadata, deleting the internal keys in the process —
 * so parsers.ts never needs to know those keys exist by name. */
export function consumeMeeshoMeta(parsed: Record<string, any>): { warning?: string; unavailable?: boolean } {
  const warning = parsed._meeshoWarning as string | undefined
  const unavailable = parsed._meeshoUnavailable as boolean | undefined
  delete parsed._meeshoWarning
  delete parsed._meeshoUnavailable
  return { warning, unavailable }
}

// ---------- ScraperAPI keys (rotation across up to 10 keys) ----------
//
// Meesho's block, per real testing, survives even the in-house
// headless-browser tier — that tier only fixes "needs JS to render"
// problems, not IP-reputation blocks, and Meesho's WAF blocks on the
// egress IP itself regardless of what browser is behind it (see
// parsers.ts's RENDER_FALLBACK_HOSTS comment). ScraperAPI's
// residential-proxy pool is the actual fix for that class of block.
//
// Supports a single SCRAPERAPI_KEY and/or up to ten numbered keys
// SCRAPERAPI_KEY_1 .. SCRAPERAPI_KEY_10 — any that are set get pooled
// together. Requests round-robin across the pool (module-level index,
// resets on process restart — fine, it's just a load-spreading
// heuristic) so one key doesn't get hammered to exhaustion while
// others sit unused. If a key's response looks like a quota/auth
// failure (401/403/429) — or still comes back blocked — the next key
// in the pool is tried automatically within the same call, so a
// single exhausted key doesn't take down the whole ScraperAPI
// fallback tier.
const MAX_SCRAPERAPI_KEYS = 10

function getScraperApiKeyPool(): string[] {
  const keys: string[] = []
  const single = process.env.SCRAPERAPI_KEY
  if (single) keys.push(single)
  for (let i = 1; i <= MAX_SCRAPERAPI_KEYS; i++) {
    const k = process.env[`SCRAPERAPI_KEY_${i}`]
    if (k) keys.push(k)
  }
  // De-dupe in case the same value is set under both SCRAPERAPI_KEY and
  // one of the numbered slots.
  return [...new Set(keys)]
}

let scraperApiRotationIndex = 0

// Once a key comes back quota-exhausted, it used to be blacklisted for
// the entire process lifetime (a plain Set, never expired) — even past
// a real monthly quota reset. Now a Map of key -> timestamp; a key is
// only skipped for QUOTA_RETRY_AFTER_MS before it's eligible again, so
// a stale reading can't keep a genuinely-fine key dead forever.
const quotaExhaustedKeys = new Map<string, number>()
const QUOTA_RETRY_AFTER_MS = 24 * 60 * 60 * 1000 // re-try a "dead" key once a day

function isQuotaExhausted(key: string): boolean {
  const exhaustedAt = quotaExhaustedKeys.get(key)
  if (exhaustedAt == null) return false
  if (Date.now() - exhaustedAt > QUOTA_RETRY_AFTER_MS) {
    quotaExhaustedKeys.delete(key)
    return false
  }
  return true
}

function markQuotaExhausted(key: string): void {
  quotaExhaustedKeys.set(key, Date.now())
}

/** Rotates the pool's *starting* key each call (round-robin), so
 * successive requests spread across keys instead of all starting at
 * key #1. Within a single call, if the starting key fails with a
 * quota-looking status (or comes back blocked), we still walk forward
 * through the rest of the pool — see the retry loop in
 * fetchMeeshoViaScraperApi. */
function nextScraperApiKeyOrder(pool: string[]): string[] {
  if (pool.length <= 1) return pool
  const start = scraperApiRotationIndex % pool.length
  scraperApiRotationIndex = (scraperApiRotationIndex + 1) % pool.length
  return [...pool.slice(start), ...pool.slice(0, start)]
}

export function meeshoScraperApiConfigured(): boolean {
  return getScraperApiKeyPool().length > 0
}

/** Diagnostic-only: lets parsers.ts log *why* the ScraperAPI tier was
 * skipped when meeshoScraperApiConfigured() is false, instead of that
 * being a silent no-op (see the outer BLOCKED log's missing ScraperAPI
 * trace — this is what that was). Never used for control flow. */
export function meeshoScraperApiSkipReason(): string {
  return 'No SCRAPERAPI_KEY or SCRAPERAPI_KEY_1..SCRAPERAPI_KEY_10 found in process.env — check the var is set in the right .env file and that the server was restarted after adding it.'
}

// ---------- ScraperAPI timeouts ----------
//
// Two separate numbers, not one:
//   - PER_ATTEMPT_TIMEOUT_MS: how long a SINGLE HTTP call to
//     ScraperAPI is allowed to hang before that one attempt is
//     abandoned and the retry loop moves on (free retry / next key /
//     ultra_premium fallback). Kept short deliberately — one stuck
//     attempt shouldn't be able to quietly eat the whole budget by
//     itself.
//   - TOTAL_BUDGET_MS: how long the ENTIRE fetchMeeshoViaScraperApi
//     call (every key, every free retry, every ultra_premium
//     fallback, combined) is allowed to run before giving up for
//     good. This is the number that should roughly match the
//     caller's own timeout / platform maxDuration — see route.ts and
//     ScraperQaClient.tsx's SCRAPE_TIMEOUT_MS.
//
// Both are overridable via env without a redeploy.
//
// FIX: 30s was too tight for a single attempt given this file's own
// comment that render+premium requests "routinely take 30-60s+" — and
// worse, a plain timeout was NOT being retried at all (see
// attemptScraperApiRequest/fetchMeeshoViaScraperApi below): only a 500
// whose body said "will not be charged" counted as retryable, so a key
// that simply ran long got exactly one attempt and was written off,
// even with minutes of budget still unused. Raised to 45s per attempt
// (still well short of the 5-minute total budget, so a key gets
// several real attempts instead of one marginal one) and timeouts are
// now retried the same way slow-500s are — see TIMEOUT_RETRYABLE and
// the unified retry condition below.
const PER_ATTEMPT_TIMEOUT_MS = 45_000 // 45s
const TOTAL_BUDGET_MS = 300_000 // 5 min

function resolvePerAttemptTimeoutMs(override?: number): number {
  if (override != null) return override
  const envValue = Number(process.env.SCRAPERAPI_ATTEMPT_TIMEOUT_MS)
  return Number.isFinite(envValue) && envValue > 0 ? envValue : PER_ATTEMPT_TIMEOUT_MS
}

function resolveTotalBudgetMs(override?: number): number {
  if (override != null) return override
  const envValue = Number(process.env.SCRAPERAPI_TOTAL_BUDGET_MS)
  return Number.isFinite(envValue) && envValue > 0 ? envValue : TOTAL_BUDGET_MS
}

// ---------- Redis cache (ScraperAPI responses only, 1 day TTL) ----------
//
// Scoped deliberately narrow: only the ScraperAPI tier's *raw HTML* is
// cached, not the whole scrapeProduct() result and not the direct-fetch
// or headless-browser tiers — those are free, so there's no cost
// pressure to cache them, and caching only the paid tier keeps this
// change minimal and low-risk. Cache key is per-URL so different
// products never collide.
const CACHE_TTL_SECONDS = 24 * 60 * 60 // 1 day
const CACHE_KEY_PREFIX = 'meesho:scraperapi:html:'

let redisClient: Redis | null | undefined // undefined = not yet attempted, null = init failed/unconfigured

function getRedisClient(): Redis | null {
  if (redisClient !== undefined) return redisClient

  const url = process.env.REDIS_URL
  if (!url) {
    redisClient = null
    return redisClient
  }

  try {
    redisClient = new Redis(url, {
      // Keep this module resilient: don't let a slow/dead Redis stall a
      // scrape — fail fast and fall through to a real fetch instead.
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: false,
      retryStrategy: () => null, // don't keep reconnecting forever in the background
    })
    redisClient.on('error', (err) => {
      // Swallow — every call site below already treats a cache miss/
      // error as "just fetch from ScraperAPI", so this only needs to
      // exist to stop ioredis from throwing an unhandled error event.
      if (process.env.DEBUG_SCRAPE) {
        console.warn('[meesho redis] connection error:', err instanceof Error ? err.message : err)
      }
    })
  } catch (e) {
    if (process.env.DEBUG_SCRAPE) {
      console.warn('[meesho redis] init failed:', e instanceof Error ? e.message : e)
    }
    redisClient = null
  }

  return redisClient
}

function cacheKeyForUrl(url: string): string {
  return `${CACHE_KEY_PREFIX}${url}`
}

async function getCachedMeeshoHtml(url: string): Promise<string | null> {
  const client = getRedisClient()
  if (!client) return null
  try {
    return await client.get(cacheKeyForUrl(url))
  } catch (e) {
    if (process.env.DEBUG_SCRAPE) {
      console.warn('[meesho redis] GET failed:', e instanceof Error ? e.message : e)
    }
    return null
  }
}

async function setCachedMeeshoHtml(url: string, html: string): Promise<void> {
  const client = getRedisClient()
  if (!client) return
  try {
    await client.set(cacheKeyForUrl(url), html, 'EX', CACHE_TTL_SECONDS)
  } catch (e) {
    if (process.env.DEBUG_SCRAPE) {
      console.warn('[meesho redis] SET failed:', e instanceof Error ? e.message : e)
    }
  }
}

// ---------- Single ScraperAPI request attempt ----------
//
// A 500 response whose body confirms "you will not be charged for this
// request" is ScraperAPI's own signal that the failure was transient
// and free — not a real block, not consumed credit — so it's cheap to
// retry on the SAME key a couple of times before writing that key off
// for this call. That same 500 message always suggests trying
// premium=true OR ultra_premium=true, even when premium=true was
// already sent (confirmed via real logs: this is ScraperAPI's generic
// hard-to-scrape-site message, not a diagnosis of what's actually
// missing from the request) — so once the free retries are exhausted
// and it's STILL failing the same way, one last (billed, higher-cost)
// ultra_premium=true attempt is made for this key, since that's the
// concrete remedy ScraperAPI itself points at, before finally moving
// on to the next key in the pool.
const FREE_RETRYABLE_500_RE = /will not be charged/i
const MAX_FREE_RETRIES_PER_KEY = 2

type ScraperApiAttempt =
  | { ok: true; html: string }
  | {
      ok: false
      status: number | null
      snippet: string | null
      freeRetryable: boolean
      aborted: boolean
      /** True specifically when this attempt was cut short by the
       * caller's own signal (client disconnected, or the overall
       * budget deadline was reached mid-flight) rather than by this
       * attempt's own per-attempt timer. Lets the retry loop decide
       * whether it's worth trying anything further. */
      budgetExhausted?: boolean
    }

/** Makes ONE HTTP call to ScraperAPI. `attemptTimeoutMs` bounds just
 * this call — the retry loop in fetchMeeshoViaScraperApi is what
 * enforces the overall 5-minute budget across every call it makes.
 * `signal`, when provided, is bridged into this attempt's own
 * AbortController so an external cancellation (client disconnect, or
 * the overall budget already being exhausted) can end this specific
 * fetch too, not just future ones. */
async function attemptScraperApiRequest(
  apiKey: string,
  url: string,
  attemptTimeoutMs: number,
  { ultraPremium = false, signal }: { ultraPremium?: boolean; signal?: AbortSignal } = {}
): Promise<ScraperApiAttempt> {
  const params = new URLSearchParams({
    api_key: apiKey,
    url,
    render: 'true',
    country_code: 'in',
    ...(ultraPremium ? { ultra_premium: 'true' } : { premium: 'true' }),
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), attemptTimeoutMs)

  const onExternalAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', onExternalAbort)
  }

  try {
    const res = await fetch(`https://api.scraperapi.com/?${params.toString()}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
    clearTimeout(timer)

    if (!res.ok) {
      const snippet = await readErrorBodySnippet(res)
      return {
        ok: false,
        status: res.status,
        snippet,
        freeRetryable: res.status === 500 && FREE_RETRYABLE_500_RE.test(snippet ?? ''),
        aborted: false,
      }
    }

    const html = await res.text()
    return { ok: true, html }
  } catch (e) {
    clearTimeout(timer)
    const externalAborted = signal?.aborted ?? false
    const isAbortError = e instanceof Error && e.name === 'AbortError'
    const snippet = externalAborted
      ? 'aborted — client disconnected or overall ScraperAPI budget was exhausted'
      : isAbortError
        ? `timed out after ${attemptTimeoutMs}ms`
        : e instanceof Error
          ? e.message
          : String(e)

    return {
      ok: false,
      status: null,
      snippet,
      freeRetryable: isAbortError && !externalAborted,
      aborted: isAbortError || externalAborted,
      budgetExhausted: externalAborted,
    }
  } finally {
    if (signal) signal.removeEventListener('abort', onExternalAbort)
  }
}

/** Fetches a Meesho product page via ScraperAPI's residential-proxy
 * pool, trying every configured key in rotation with free retries and
 * an ultra_premium fallback per key (see attemptScraperApiRequest's
 * doc comment), all bounded by a single overall deadline
 * (`totalBudgetMs`, default 5 minutes) rather than a per-call timeout
 * repeated unboundedly. Once the deadline passes, no further attempts
 * are started — whatever's already in flight is allowed to finish
 * only up to its own already-shrunk per-attempt timeout.
 *
 * `signal`, when provided (parsers.ts passes through the original
 * incoming Next.js request's signal), lets an upstream client
 * disconnect stop everything immediately instead of the whole 5-minute
 * budget running to completion — and being billed — with nobody left
 * to receive the result. */
export async function fetchMeeshoViaScraperApi(
  url: string,
  { timeoutMs, totalBudgetMs, signal }: { timeoutMs?: number; totalBudgetMs?: number; signal?: AbortSignal } = {}
): Promise<{ html: string | null; error: string | null }> {
  const cached = await getCachedMeeshoHtml(url)
  if (cached) {
    return { html: cached, error: null }
  }

  const pool = getScraperApiKeyPool()
  if (!pool.length) return { html: null, error: 'No SCRAPERAPI_KEY(_N) configured' }

  const perAttemptTimeoutMs = resolvePerAttemptTimeoutMs(timeoutMs)
  const budgetMs = resolveTotalBudgetMs(totalBudgetMs)
  const deadline = Date.now() + budgetMs

  const orderedKeys = nextScraperApiKeyOrder(pool)

  // Accumulate every key's failure instead of overwriting a single
  // `lastError` — a single "ScraperAPI HTTP 403 (key 2/2)" line told
  // you nothing about whether key 1 failed the same way (whole pool
  // exhausted — nothing to fix except adding quota/keys) or a
  // different way (one dead key masking an otherwise-fine pool). The
  // final error below joins all of them so that distinction is visible
  // at a glance instead of requiring a second round-trip to find out.
  const perKeyErrors: string[] = []
  let quotaExhaustedCount = 0

  // Returns how long the NEXT attempt is allowed to run: the smaller
  // of the fixed per-attempt timeout and whatever's actually left of
  // the overall budget. Returns null once the budget is already gone,
  // so the caller knows not to start another attempt at all.
  function timeoutForNextAttempt(): number | null {
    const remaining = deadline - Date.now()
    if (remaining <= 0) return null
    return Math.min(perAttemptTimeoutMs, remaining)
  }

  keyLoop: for (let i = 0; i < orderedKeys.length; i++) {
    if (signal?.aborted) {
      return { html: null, error: 'Client disconnected — aborting remaining ScraperAPI attempts.' }
    }
    if (Date.now() >= deadline) {
      perKeyErrors.push(`Overall ${budgetMs}ms ScraperAPI budget exhausted before trying remaining key(s).`)
      break
    }

    const apiKey = orderedKeys[i]
    const keyLabel = orderedKeys.length > 1 ? ` (key ${i + 1}/${orderedKeys.length})` : ''

    // Already confirmed dead within the last 24h — don't burn a
    // round-trip re-asking a key we already know will 403. Still
    // counts toward quotaExhaustedCount so the "whole pool is out of
    // credit" summary below stays accurate even when every key was
    // skipped this way.
    if (isQuotaExhausted(apiKey)) {
      quotaExhaustedCount++
      perKeyErrors.push(`ScraperAPI HTTP 403${keyLabel}: skipped — already confirmed out of credits within the last 24h`)
      continue
    }

    let attemptTimeout = timeoutForNextAttempt()
    if (attemptTimeout == null) {
      perKeyErrors.push(`Overall ${budgetMs}ms ScraperAPI budget exhausted before trying key${keyLabel}.`)
      break keyLoop
    }

    let attempt = await attemptScraperApiRequest(apiKey, url, attemptTimeout, { signal })
    let freeRetries = 0
    while (!attempt.ok && attempt.freeRetryable && freeRetries < MAX_FREE_RETRIES_PER_KEY) {
      attemptTimeout = timeoutForNextAttempt()
      if (attemptTimeout == null) break
      freeRetries++
      attempt = await attemptScraperApiRequest(apiKey, url, attemptTimeout, { signal })
    }

    let usedUltraPremiumFallback = false
    if (!attempt.ok && attempt.freeRetryable) {
      attemptTimeout = timeoutForNextAttempt()
      if (attemptTimeout != null) {
        usedUltraPremiumFallback = true
        attempt = await attemptScraperApiRequest(apiKey, url, attemptTimeout, { ultraPremium: true, signal })
      }
    }

    if (!attempt.ok) {
      if (attempt.status === 403 && /credit|quota|exhaust/i.test(attempt.snippet ?? '')) {
        quotaExhaustedCount++
        markQuotaExhausted(apiKey)
      }
      const retryNote = [
        freeRetries > 0 ? `${freeRetries} free retr${freeRetries === 1 ? 'y' : 'ies'}` : null,
        usedUltraPremiumFallback ? 'ultra_premium fallback' : null,
      ]
        .filter(Boolean)
        .join(' + ')
      const retrySuffix = retryNote ? ` [after ${retryNote}]` : ''

      perKeyErrors.push(
        attempt.aborted
          ? `ScraperAPI request failed${keyLabel}${retrySuffix}: ${attempt.snippet}`
          : `ScraperAPI HTTP ${attempt.status}${keyLabel}${retrySuffix}${attempt.snippet ? `: ${attempt.snippet}` : ''}`
      )

      // If this attempt was cut short by the overall budget (not just
      // its own per-attempt timer), there's no point continuing the
      // loop — every subsequent attempt would immediately fail the
      // same way.
      if (attempt.budgetExhausted && Date.now() >= deadline) break keyLoop

      continue // try next key in pool regardless of status — cheap, and a
      // residential-IP assignment can vary key-to-key too
    }

    if (looksBlocked(attempt.html)) {
      perKeyErrors.push(`BLOCKED: CAPTCHA/robot-check page (via ScraperAPI${keyLabel} — Meesho blocked even a residential proxy)`)
      continue
    }

    // Cache only a real, unblocked response — never cache a block
    // page, or every scrape of this URL for the next 24h would just
    // replay the failure.
    await setCachedMeeshoHtml(url, attempt.html)

    return { html: attempt.html, error: null }
  }

  // Every key in the pool was tried (or the budget ran out first). If
  // every key that was actually tried failed on quota specifically,
  // say so up front — that's an operational fix (add keys / raise the
  // plan), not a scraping-logic bug — before listing each key's
  // individual message.
  const summary =
    quotaExhaustedCount > 0 && quotaExhaustedCount === orderedKeys.length
      ? `All ${orderedKeys.length} ScraperAPI key(s) in the pool are out of monthly credits — add more keys (SCRAPERAPI_KEY_1..SCRAPERAPI_KEY_10) or upgrade the plan. `
      : ''

  return { html: null, error: perKeyErrors.length ? `${summary}${perKeyErrors.join(' | ')}` : summary || null }
}

// ---------- Own-text helper ----------
//
// Reads ONLY direct text-node children of an element, not text buried
// in nested tags. Good for a simple badge span whose entire content is
// a bare text node. Deliberately NOT used for buy-CTA buttons below —
// see BUY_CTA detection's own comment for why.
function ownText($el: Cheerio<any>): string {
  return $el
    .contents()
    .filter((_, node) => node.type === 'text')
    .text()
    .replace(/\s+/g, ' ')
    .trim()
}

// ---------- __NEXT_DATA__ blob ----------
//
// Meesho is a Next.js app; on a full page load the PDP embeds its
// initial props (including the product node) in
// `<script id="__NEXT_DATA__" type="application/json">`. Kept as the
// first-choice source when present, with DOM-based extraction (below)
// as the fallback for everything it doesn't cover or when it's absent
// entirely — a real captured fragment of this page had no such script
// tag in it at all, and every field below still needed to resolve from
// plain DOM.
const PRICE_KEYS = ['price', 'sellingPrice', 'finalPrice', 'discountedPrice', 'displayPrice']
const MRP_KEYS = ['mrp', 'listPrice', 'originalPrice', 'strikePrice']
const NAME_KEYS = ['name', 'title', 'productName', 'displayName']

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

function scoreProductNode(node: Record<string, any>): number {
  let s = 0
  for (const k of PRICE_KEYS) if (node[k] != null) s++
  for (const k of NAME_KEYS) if (node[k] != null) s++
  if (node.rating != null || node.avgRating != null) s += 0.5
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

type MeeshoNextDataProduct = {
  title: string | null
  price: string | null
  mrp: string | null
  rating: string | null
  review_count: string | null
  images: string[]
}

function extractMeeshoNextData($: CheerioAPI): MeeshoNextDataProduct | null {
  const raw = $('script#__NEXT_DATA__').html()
  if (!raw) return null

  let data: any
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }

  const node = findProductNode(data)
  if (!node) return null

  const priceKey = PRICE_KEYS.find((k) => node[k] != null)
  const mrpKey = MRP_KEYS.find((k) => node[k] != null)
  const nameKey = NAME_KEYS.find((k) => node[k] != null)

  let images: string[] = []
  for (const k of ['image', 'images', 'imageUrl', 'imageUrls', 'productImages']) {
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
    rating: node.rating != null ? String(node.rating) : node.avgRating != null ? String(node.avgRating) : null,
    review_count: node.reviewCount != null ? String(node.reviewCount) : node.ratingCount != null ? String(node.ratingCount) : null,
    images,
  }
}

// ---------- Title ----------
//
// Confirmed by a real captured page: the product title is a plain
// `<h1>` (e.g. `<h1 ... class="sc-dOfePm bIeHMb">Best silk printed
// Daily wear saree</h1>`), no special class needed.
export function extractMeeshoTitle($: CheerioAPI, nextData: MeeshoNextDataProduct | null): string | null {
  if (nextData?.title) return nextData.title
  return cleanText($('h1').first())
}

// ---------- Price / MRP ----------
//
// Confirmed by a real captured page: the live price sits in an <h4>
// inside a wrapper whose class contains "PriceContainer" (seen as
// ShippingInfoMobilestyles__PriceContainer), rendered as
// "₹<!--comment-->252" — cheerio's .text() drops the HTML comment, so
// this reads cleanly as "₹252". A body-wide ₹-regex is kept as a
// second fallback for pages where that wrapper's class name differs.
// No MRP/strikethrough element was present in the captured example
// (this particular listing has no discount to show), so the MRP
// selector below is a best-effort guess, not confirmed against a real
// discounted listing yet.
export function extractMeeshoPriceBlock(
  $: CheerioAPI,
  nextData: MeeshoNextDataProduct | null,
  domainHint: string | null
): { price: string | null; mrp: string | null } {
  let priceRaw = nextData?.price ?? null
  let mrpRaw = nextData?.mrp ?? null

  if (!priceRaw) {
    const priceText = cleanText($('[class*="PriceContainer"] h4, [class*="PriceRow"] h4').first())
    if (priceText) priceRaw = priceText
  }
  if (!priceRaw) {
    const bodyText = $('body').text()
    const priceMatch = bodyText.match(/₹\s?[\d,]+/)
    priceRaw = priceMatch ? priceMatch[0] : null
  }

  if (!mrpRaw) {
    // UNVERIFIED: no real discounted listing captured yet — guessing at
    // a struck-through element near the price block.
    const mrpText = cleanText(
      $('[class*="PriceRow"] s, [class*="PriceRow"] strike, [class*="PriceContainer"] s, [class*="PriceContainer"] strike').first()
    )
    if (mrpText) mrpRaw = mrpText
  }

  const { amount: price } = detectCurrencyAndClean(priceRaw, domainHint)
  const { amount: mrp } = detectCurrencyAndClean(mrpRaw, domainHint)
  return { price, mrp }
}

// ---------- Rating / review count ----------
//
// Confirmed by a real captured page: the product's own rating badge is
// a `<span label="3.9">` inside a wrapper whose class contains
// "RatingSection" (ShippingInfo__RatingSection), immediately followed
// by a sibling span reading "70801  Ratings, 19093  Reviews". Scoped
// to that wrapper specifically, since `[label]` spans also appear
// elsewhere on the same page (the shop's own rating badge, and each
// individual review's star rating) — grabbing the page-wide first
// match would risk picking up the wrong one.
//
// FIX: a second real captured page confirms that sibling span really
// does carry TWO distinct numbers — "4878 Ratings, 2420 Reviews" — not
// the same count twice. Now prefers an explicit "Reviews" match and
// only falls back to the "Ratings" figure if no "Reviews" number is
// present anywhere in scope.
function extractMeeshoRatingFromDom($: CheerioAPI): { rating: string | null; review_count: string | null } {
  const section = $('[class*="RatingSection"]').first()
  const scope = section.length ? section : $('body')

  const ratingAttr = scope.find('span[label]').first().attr('label')
  const rating = ratingAttr ? ratingAttr.trim() : null

  let review_count: string | null = null
  let ratingsCountFallback: string | null = null
  scope.find('span, div').each((_, el) => {
    if (review_count) return false
    const text = cleanText($(el))
    if (!text) return

    const reviewsMatch = text.match(/([\d,]+)\s*Reviews?/i)
    if (reviewsMatch) {
      review_count = reviewsMatch[1].replace(/,/g, '')
      return
    }

    if (!ratingsCountFallback) {
      const ratingsMatch = text.match(/([\d,]+)\s*Ratings?/i)
      if (ratingsMatch) ratingsCountFallback = ratingsMatch[1].replace(/,/g, '')
    }
  })

  return { rating, review_count: review_count ?? ratingsCountFallback }
}

// ---------- Seller ----------
//
// Confirmed by a real captured page: the "Sold By" card renders the
// shop name in a span whose class contains "ShopName"
// (ShopCardstyled__ShopName), e.g. "JIHANA FAB".
function extractMeeshoSeller($: CheerioAPI): string | null {
  return cleanText($('[class*="ShopName"]').first())
}

// ---------- Images ----------
//
// Confirmed by a real captured page: the actual product photos (both
// the small thumbnail rail and the large desktop image) carry
// `data-testid="product-images"`, or sit inside a wrapper whose class
// contains "ProductDesktopImage". Scoping to these specifically is
// necessary, not cosmetic — a plain "any <img> whose src contains
// 'meesho'" scan (the old approach) also picks up similar-product
// thumbnails, review photos, the shop's profile picture, and
// marketing/value-prop icons, since all of those are served from the
// same images.meesho.com host too.
function extractMeeshoImages($: CheerioAPI): string[] {
  const images = new Set<string>()
  $('img[data-testid="product-images"], [class*="ProductDesktopImage"] img').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src')
    if (src) images.add(src)
  })
  return [...images]
}

// ---------- Availability ----------
//
// Requires BOTH a sold-out/unavailable phrase somewhere on the page
// AND the absence of any add-to-cart/buy CTA, so a single sold-out
// size chip can't false-positive the whole listing as dead.
//
// IMPORTANT FIX: a real captured page shows the Add to Cart / Buy Now
// buttons render their label as a *nested* <span> inside an inner
// <div> (icon + label wrapper) — never as a direct text child of the
// <button> itself. Buy-CTA detection reads the button/link's full text
// via cleanText() instead of ownText(). Sold-out phrase detection
// stays on ownText() over div/span, since those badges are typically a
// bare text node.
const SOLD_OUT_RE = /^(sold out|out of stock|currently unavailable|product unavailable)$/i
const BUY_CTA_RE = /^(add to cart|buy now|continue|proceed to buy)$/i

export function isMeeshoUnavailable($: CheerioAPI): boolean {
  let soldOutText = false
  $('div, span').each((_, el) => {
    if (soldOutText) return false
    const text = ownText($(el))
    if (text && SOLD_OUT_RE.test(text)) soldOutText = true
  })

  let hasBuyButton = false
  $('button, a').each((_, el) => {
    if (hasBuyButton) return false
    const text = cleanText($(el))
    if (text && BUY_CTA_RE.test(text)) hasBuyButton = true
  })

  return soldOutText && !hasBuyButton
}

// ---------- Size picker (chips) ----------
//
// FIX: a real captured page shows Meesho's size picker is a "Select
// Size" heading followed by chip elements that are plain
// `<span class="SingleChip__StyledChip-sc-...">`, NOT `<button>` or
// `[role="button"]` elements as previously assumed. Chips are matched
// by a class name containing "StyledChip" (deliberately NOT matching
// the *container* div, whose class contains "...ChipsStyled..." — note
// the different word order) in addition to keeping the old
// button/role selectors in case another Meesho surface uses real
// buttons instead.
const SIZE_HEADING_RE = /select size/i
const SIZE_CHIP_SELECTOR = 'button, [role="button"], span[class*="StyledChip"]'

function isSelectedSizeChip($chip: Cheerio<any>): boolean {
  const cls = $chip.attr('class') || ''
  const pressed = $chip.attr('aria-pressed') || $chip.attr('aria-selected')
  // UNVERIFIED: every real example captured so far shows the picker in
  // its pre-selection state — no chip has ever come through already
  // selected — so there's still no confirmed "selected" class/attribute
  // to match against. This is still a best-effort guess pending a real
  // example.
  return pressed === 'true' || /selected|active|checked/i.test(cls)
}

export function extractMeeshoOptions($: CheerioAPI): Record<string, string> | null {
  const options: Record<string, string> = {}

  $('h4, h5, h6').each((_, el) => {
    const heading = cleanText($(el))
    if (!heading || !SIZE_HEADING_RE.test(heading)) return
    const container = $(el).parent()
    const chips = container.find(SIZE_CHIP_SELECTOR)
    const labels: string[] = []
    chips.each((_, chip) => {
      const t = cleanText($(chip))
      if (t) labels.push(t)
    })
    if (!labels.length) return
    if (labels.length === 1) {
      options['Size'] = labels[0]
      return
    }
    const selectedChip = chips.filter((_, chip) => isSelectedSizeChip($(chip))).first()
    const selectedText = cleanText(selectedChip)
    options['Size'] = selectedText || labels.join(' / ')
  })

  return Object.keys(options).length ? options : null
}

// ---------- Per-chip out-of-stock flag ----------
//
// FIX: a real captured multi-option size picker (XS/S/M/L/XL/XXL) shows
// none of the four genuinely out-of-stock chips (XS, S, M, L — confirmed
// against this same page's "Product Details" text block, which lists
// bust measurements only for XL and XXL) carry a `disabled` attribute,
// an `aria-disabled="true"`, a sold-out-sounding class, or a trailing
// "(Out of Stock)" label. What actually differs, confirmed against this
// page: an out-of-stock chip has one extra empty child `<div>` whose
// class contains "DividerSection" (a strike-line overlay the in-stock
// chip omits entirely), and its label `<span>`'s literal `color` DOM
// attribute reads "greyT3Divider" instead of the in-stock chip's
// "greyBase". The chip's own outer class is a meaningless per-build
// hash and not usable as a signal.
const TILE_OUT_OF_STOCK_CLASS_RE = /disabled|sold-?out|out-?of-?stock|unavailable/i
const TILE_OUT_OF_STOCK_TEXT_RE = /\(\s*(?:out of stock|sold out|unavailable)\s*\)\s*$/i
const TILE_OUT_OF_STOCK_COLOR_RE = /T3|Divider/i

function isChipOutOfStock($chip: Cheerio<any>): boolean {
  if ($chip.is('[disabled]')) return true
  if (($chip.attr('aria-disabled') || '').toLowerCase() === 'true') return true
  const cls = $chip.attr('class') || ''
  if (TILE_OUT_OF_STOCK_CLASS_RE.test(cls)) return true
  const text = cleanText($chip)
  if (text && TILE_OUT_OF_STOCK_TEXT_RE.test(text)) return true

  // Confirmed signals (see comment above the constants block).
  if ($chip.find('[class*="DividerSection"]').length > 0) return true
  const labelColor = $chip.find('span[color]').first().attr('color') || ''
  if (TILE_OUT_OF_STOCK_COLOR_RE.test(labelColor)) return true

  return false
}

function cleanSizeLabel($chip: Cheerio<any>): string | null {
  const text = cleanText($chip)
  if (!text) return null
  return text.replace(TILE_OUT_OF_STOCK_TEXT_RE, '').trim() || text
}

function resolveMeeshoUrl(href: string | undefined | null, pageUrl: string): string | null {
  if (!href) return null
  try {
    return new URL(href, pageUrl).toString()
  } catch {
    return null
  }
}

// ---------- All variants (full size picker) ----------
export function extractMeeshoAllVariants($: CheerioAPI, pageUrl: string): MeeshoVariantDimension[] {
  const dimensions: MeeshoVariantDimension[] = []

  $('h4, h5, h6').each((_, el) => {
    const heading = cleanText($(el))
    if (!heading || !SIZE_HEADING_RE.test(heading)) return

    const container = $(el).parent()
    const $chips = container.find(SIZE_CHIP_SELECTOR)
    if (!$chips.length) return

    const options: MeeshoVariantOption[] = []
    $chips.each((_, chipEl) => {
      const $chip = $(chipEl)
      const label = cleanSizeLabel($chip)
      if (!label) return

      // Plain spans (the confirmed real case) never carry a real link —
      // that only exists on markup with an actual <a>/href, which has
      // not been observed. A null url leaves this chip correctly
      // rendered-but-disabled in the UI rather than silently omitted.
      const href = $chip.attr('href') || $chip.find('a').attr('href') || null

      options.push({
        label,
        price: null,
        currencyCode: null,
        image: null,
        url: resolveMeeshoUrl(href, pageUrl),
        selected: isSelectedSizeChip($chip),
        outOfStock: isChipOutOfStock($chip),
      })
    })

    // Confirmed real case: a single-size listing ("Free Size") has
    // nothing to pick and is implicitly selected, same shortcut used
    // in extractMeeshoOptions() above.
    if (options.length === 1) options[0].selected = true

    if (options.length) dimensions.push({ dimension: 'Size', options })
  })

  return dimensions
}

// ---------- Composed parser ----------

export function parseMeesho($: CheerioAPI, url: string) {
  const domainHint = domainCurrency(url)
  const nextData = extractMeeshoNextData($)

  const { price, mrp } = extractMeeshoPriceBlock($, nextData, domainHint)
  const domRating = extractMeeshoRatingFromDom($)

  const images = new Set<string>()
  for (const src of nextData?.images ?? []) images.add(src)
  for (const src of extractMeeshoImages($)) images.add(src)

  const result: Record<string, any> = {
    title: extractMeeshoTitle($, nextData),
    price,
    mrp,
    currencyCode: domainHint,
    rating: nextData?.rating ?? domRating.rating,
    review_count: nextData?.review_count ?? domRating.review_count,
    availability: 'In Stock (assumed)',
    seller: extractMeeshoSeller($),
    images: [...images],
  }

  if (isMeeshoUnavailable($)) {
    result.availability = 'Unavailable'
    result._meeshoUnavailable = true
    result._meeshoWarning =
      'No add-to-cart/buy text found alongside sold-out/unavailable text — treating this as a genuinely unsellable listing rather than a scrape failure.'
  }

  const options = extractMeeshoOptions($)
  if (options) result.options = options

  const variants = extractMeeshoAllVariants($, url)
  if (variants.length) result.variants = variants

  return result
}