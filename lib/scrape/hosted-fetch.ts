// lib/scrape/hosted-fetch.ts
//
// Generic hosted-render fetch tiers for sites whose block survives the
// direct fetch — Tata CLiQ's Cloudflare "Attention Required!" 403, in
// particular. Both vendors fetch through India-targeted residential
// proxies and (optionally) render JS, which covers Cloudflare's IP,
// TLS-fingerprint and JS-challenge checks in one call.
//
// ENV VARS: SCRAPE_DO_TOKEN and SCRAPINGDOG_API_KEY. If extractors/ajio.ts
// already reads differently-named variables for the same accounts,
// change the two names below to match so one credential serves every site.
//
// Vendor query-param names (geoCode/super/render for scrape.do;
// country/dynamic/premium for Scrapingdog) are from memory — confirm
// against each vendor's current docs if a call returns a 400.
//
// SECURITY: request URLs contain the API credential, so error strings
// below never include the endpoint.

import { looksBlocked } from './shared'

type FetchOpts = { signal?: AbortSignal }
type FetchResult = { html: string | null; error: string | null }

const TIMEOUT_MS = 60_000

// looksBlocked() may not recognise Cloudflare's own interstitial, so
// check for it explicitly. A hosted vendor returning THIS page must
// count as a failure, otherwise the caller would parse the block page.
const CLOUDFLARE_BLOCK_RE = /Attention Required!?\s*\|\s*Cloudflare|cf-browser-verification|cf_chl_opt|Just a moment\.\.\./i

async function fetchHtml(endpoint: string, opts: FetchOpts): Promise<FetchResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const onAbort = () => controller.abort()
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort()
    else opts.signal.addEventListener('abort', onAbort)
  }

  try {
    const res = await fetch(endpoint, { signal: controller.signal, cache: 'no-store' })
    if (!res.ok) {
      const body = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200)
      return { html: null, error: `HTTP ${res.status}${body ? `: ${body}` : ''}` }
    }
    const html = await res.text()
    if (CLOUDFLARE_BLOCK_RE.test(html) || looksBlocked(html)) {
      return { html: null, error: 'BLOCKED: vendor returned a bot-check page (Cloudflare/CAPTCHA) instead of the product' }
    }
    return { html, error: null }
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError'
    return {
      html: null,
      error: aborted
        ? opts.signal?.aborted
          ? 'Client disconnected'
          : `Timed out after ${TIMEOUT_MS / 1000}s`
        : `Request failed: ${e instanceof Error ? e.message : String(e)}`,
    }
  } finally {
    clearTimeout(timer)
    opts.signal?.removeEventListener('abort', onAbort)
  }
}

// ---------- scrape.do ----------

export const scrapeDoConfigured = () => !!process.env.SCRAPE_DO_TOKEN

export function fetchViaScrapeDo(url: string, opts: FetchOpts = {}): Promise<FetchResult> {
  const token = process.env.SCRAPE_DO_TOKEN
  if (!token) return Promise.resolve({ html: null, error: 'SCRAPE_DO_TOKEN not set' })

  const params = new URLSearchParams({
    token,
    url,
    geoCode: 'in', // India exit IP
    render: 'true', // real headless render (solves JS challenge + hydration)
    super: 'true', // residential/mobile pool — datacenter IPs die on Cloudflare
  })
  return fetchHtml(`https://api.scrape.do/?${params.toString()}`, opts)
}

// ---------- Scrapingdog ----------

export const scrapingdogConfigured = () => !!process.env.SCRAPINGDOG_API_KEY

export function fetchViaScrapingdog(url: string, opts: FetchOpts = {}): Promise<FetchResult> {
  const apiKey = process.env.SCRAPINGDOG_API_KEY
  if (!apiKey) return Promise.resolve({ html: null, error: 'SCRAPINGDOG_API_KEY not set' })

  const params = new URLSearchParams({
    api_key: apiKey,
    url,
    country: 'in',
    dynamic: 'true',
    premium: 'true', // residential proxies
  })
  return fetchHtml(`https://api.scrapingdog.com/scrape?${params.toString()}`, opts)
}

// ---------- Ready-made tier list for LAST_RESORT_FALLBACK ----------
// Same shape as parsers.ts's LastResortTier (structural typing, so no
// import needed).

export const TATACLIQ_HOSTED_TIERS = [
  { configured: scrapeDoConfigured, fetch: fetchViaScrapeDo, source: 'scrape_do' as const },
  { configured: scrapingdogConfigured, fetch: fetchViaScrapingdog, source: 'scrapingdog' as const },
]