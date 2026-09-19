// lib/scrape/resolve-redirect.ts
//
// A customer pasting a shortlink (bit.ly, amzn.to, fkrt.it, tinyurl.com,
// a WhatsApp-shared affiliate link, etc.) points the scraper at a domain
// that has nothing to do with the real product — the shortener's own
// domain, not the store's. Left unresolved, this breaks several things
// that all key off the URL's hostname:
//   - matchAffiliatedSellerUrl (store-config-db.ts) compares hostnames
//     against known sellers — a shortlink to one of WishDrop's own
//     affiliated stores would never match, since it's checking
//     "bit.ly", not the seller's real domain, so the customer would be
//     sent through the external scraper instead of the fast internal
//     catalog redirect.
//   - scrape_health/upsertScrapeHealth attributes the attempt to
//     whatever domainFor(url) resolves to — a shortlink would pollute
//     stats under a meaningless "bit.ly" entry instead of the real
//     seller domain the product actually lives on.
//   - requests.source_domain (Channel 3 fallback) has the same problem
//     for a request created from an unresolved shortlink.
//
// A plain "affiliate link" that isn't a shortener — e.g.
// flipkart.com/product/xyz?affid=123 — needs none of this: the real
// domain is already the visible one, query params don't change
// `new URL(url).hostname`. This only matters for genuine redirect
// chains where the visible domain isn't the real destination at all.

/**
 * Follows HTTP redirects to find the real destination URL, if `url`
 * turns out to be a shortlink. Returns the original URL unchanged on
 * any failure (timeout, network error, a site that blocks a bare GET)
 * — resolution is a best-effort improvement, never a hard requirement
 * for scraping to proceed, so a shortener having a bad day shouldn't
 * block a customer's request entirely.
 *
 * Uses a real GET (not HEAD) because several shortlink services don't
 * implement HEAD correctly (some 404 it, some ignore the redirect on
 * it) — the response body is aborted immediately via signal once
 * headers arrive, so this doesn't actually download a full page for a
 * chain that ends on a heavy product page; only the redirect hops
 * themselves (which are typically near-empty responses) are paid for
 * in full.
 */
export async function resolveFinalUrl(url: string, timeoutMs = 8000): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        // A generic browser UA — some shorteners serve an interstitial
        // "click to continue" HTML page instead of a real redirect to
        // non-browser-looking clients, which would defeat this entirely.
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
    })
    // Stop reading the body the moment we have the final URL/headers —
    // fetch() has already followed every redirect hop by this point
    // (that's what `redirect: 'follow'` did), so nothing past this is
    // needed for resolution.
    controller.abort()
    return res.url || url
  } catch {
    return url
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Cheap, no-network heuristic for whether `url` is even worth resolving
 * — most pasted links are already a real store URL, and spending a
 * whole extra round-trip resolving e.g. "flipkart.com/product/xyz" (which
 * already IS the real destination) on every single lookup would be pure
 * wasted latency. Only known shortener domains, or a suspiciously short
 * path (a strong shortlink signal: a real product URL is essentially
 * never just "/abc123"), trigger an actual resolution attempt.
 */
const KNOWN_SHORTENERS = new Set([
  'bit.ly',
  'tinyurl.com',
  't.co',
  'amzn.to',
  // FIX: amzn.in (Amazon's own India-specific shortlink domain,
  // distinct from amzn.to) was missing — a real customer-reported case
  // ("https://amzn.in/d/0dWEYzN0" didn't scrape) that this same gap
  // also should have caught via the path heuristic below, except that
  // heuristic had its own bug (see its own comment).
  'amzn.in',
  'fkrt.it',
  'fkrt.cc',
  'cutt.ly',
  'rebrand.ly',
  'is.gd',
  'ow.ly',
  'shorturl.at',
  'lnkd.in',
])

export function looksLikeShortlink(url: string): boolean {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase()
    if (KNOWN_SHORTENERS.has(host)) return true
    // FIX: this used to also require the path to contain no "/" at
    // all — but a real shortlink can still have one, e.g. Amazon's own
    // "amzn.in/d/0dWEYzN0" shape. The actual signal is TOTAL path
    // length, not slash count: a real product page path is essentially
    // always much longer/more descriptive than this (a title slug,
    // multiple segments, a long numeric id), regardless of how many
    // segments it's split across.
    const path = parsed.pathname.replace(/^\/|\/$/g, '')
    return path.length > 0 && path.length <= 14
  } catch {
    return false
  }
}