// hooks/useProductLookup.ts
'use client'
import { useCallback, useRef, useState } from 'react'
import type { ScrapeResult } from '@/lib/scrape/parsers'

// A failed scrape (captcha, rate-limit, a proxy tier timing out, a
// momentary block) is very often just transient — retrying the exact
// same request a few seconds later succeeds more often than not. This
// single silent retry means most customers never see a failure state
// at all; it only costs 5 extra seconds on the minority of requests
// that needed it.
const RETRY_DELAY_MS = 5000
// FAST: only retry a failure that came back quickly (a dropped connection,
// a momentary block). A slow failure means the server already went through
// every method it has — running that whole chain again would just double
// the wait before the shopper sees the "couldn't read it" screen.
const QUICK_FAILURE_MS = 15_000

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchProductLookup(url: string, refresh = false): Promise<{ ok: boolean; data: ScrapeResult | null }> {
  try {
    const res = await fetch(`/api/product-lookup?url=${encodeURIComponent(url)}${refresh ? '&refresh=1' : ''}`)
    const data = (await res.json().catch(() => null)) as ScrapeResult | null
    return { ok: res.ok && !!data && !data.error, data }
  } catch {
    return { ok: false, data: null }
  }
}

/**
 * Last-resort fallback, tried only once both real scrape attempts have
 * failed — asks /api/og-lookup for whatever the page's own basic
 * <meta>/Open Graph tags give up (title/image), same source
 * confirmRequest already falls back to when seeding a Channel 3 chat
 * message (see fetchOgMetadataClient in DashboardContext.tsx). Doing it
 * here too means the customer sees a real name/photo in the modal
 * itself — before they've committed to sending a request — instead of
 * only after. Never throws; returns null (not a partial/garbage
 * result) when there's genuinely nothing usable, so the caller can
 * fall through to the "couldn't load this, try again or continue via
 * chat" state honestly rather than showing an empty-looking card.
 *
 * `knownSite`: this function only ever calls /api/og-lookup, which has
 * no access to scrapeProduct()'s own detectSite() result — it can't
 * determine the site itself. The caller (lookup(), below) already knows
 * it from the last real attempt's own result, even though that attempt
 * failed overall, and passes it through here instead of this function
 * hardcoding 'generic' regardless of what the real site actually was.
 * Same bug, same fix, as the terminal `failed` object further down —
 * see that one's comment for the full story (confirmed against a real
 * Myntra block: og-lookup recovered the blocked page's own <title>
 * ("Site Maintenance") as if it were real, while also discarding that
 * this was Myntra at all, which is what silently broke
 * ItemInfoModal's SITE_LOGOS lookup on this exact path).
 */
async function fetchOgFallback(url: string, knownSite: ScrapeResult['site']): Promise<ScrapeResult | null> {
  try {
    const res = await fetch(`/api/og-lookup?url=${encodeURIComponent(url)}`)
    if (!res.ok) return null
    const meta = (await res.json().catch(() => null)) as
      | { title: string | null; image: string | null; description: string | null }
      | null
    if (!meta || (!meta.title && !meta.image)) return null

    // Deliberately NOT `error` — an og-recovered result is treated as a
    // (partial) success so ItemInfoModal renders the normal generic
    // listing view (photo/name, "we'll confirm the rest with you") and
    // lets the customer request it like any other unpriced item,
    // instead of falling into the error/retry state.
    return {
      url,
      site: knownSite ?? 'generic',
      title: meta.title ?? null,
      images: meta.image ? [meta.image] : [],
      price: null,
      currencyCode: null,
      ogOnly: true,
      warning: "We couldn't load this listing's full details — we'll confirm the price and options with you.",
    } as ScrapeResult
  } catch {
    return null
  }
}

export function useProductLookup() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Full, unmodified /api/product-lookup payload for the most recent URL —
  // this is what ItemInfoModal needs as its `scrapeResult` prop so it can
  // read `.site` / `.variants` / `.error` and decide whether to render the
  // rich platform view (AmazonProductView, FlipkartProductView, etc.),
  // exactly the way ScraperQaClient does with its own `result` state.
  const [result, setResult] = useState<ScrapeResult | null>(null)
  // Bumped on every lookup/reset, so a late live refresh for an older
  // link never replaces what the shopper is looking at now.
  const generation = useRef(0)

  /**
   * `onRefreshed`: when the first answer was an older copy (`stale`), the
   * live result is fetched straight after and handed here (and to
   * `result`) — callers use it to update anything they filled in from the
   * older copy.
   */
  const lookup = useCallback(async (url: string, onRefreshed?: (fresh: ScrapeResult) => void): Promise<ScrapeResult | null> => {
    const myGeneration = ++generation.current
    setLoading(true)
    setError(null)
    // FIX: previously left unset here, `result` (and therefore
    // DashboardContext's scrapeResultWithPreview, and therefore
    // ItemInfoModal's `result` prop) kept holding the PREVIOUS product's
    // full real ScrapeResult all the way through this new lookup's
    // loading phase — scrapeResultWithPreview's `if (scrapeResult)
    // return scrapeResult` guard returns that stale-but-truthy object
    // before it ever looks at the new lookup's own ogPreview, so the
    // skeleton showed the OLD product's real image/title (looking like
    // a wrong/previous OG preview) instead of either a blank skeleton or
    // the NEW url's own preview. Clearing it here, at the same point
    // loading/error are reset, means the skeleton correctly falls
    // through to ogPreview (or plain pulsing placeholders) the instant a
    // new lookup begins — for both beginRequestForUrl's fresh paste AND
    // selectVariant's re-scrape, since both call this same lookup().
    setResult(null)

    const startedAt = Date.now()
    let attempt = await fetchProductLookup(url)
    if (!attempt.ok && (!attempt.data || Date.now() - startedAt < QUICK_FAILURE_MS)) {
      await sleep(RETRY_DELAY_MS)
      if (generation.current !== myGeneration) return null
      attempt = await fetchProductLookup(url)
    }
    if (generation.current !== myGeneration) return null

    if (attempt.ok && attempt.data) {
      const data = attempt.data
      if (data.stale) {
        // FAST: an older copy (1–24h) — show it now, get the live one
        // behind it. The item screen shows "Updating price…" meanwhile.
        void fetchProductLookup(url, true).then((live) => {
          if (generation.current !== myGeneration) return
          if (live.ok && live.data) {
            setError(live.data.warning ?? null)
            setResult(live.data)
            onRefreshed?.(live.data)
          } else {
            // Couldn't get a live read right now: keep the older copy,
            // shown as "price from N hours ago" instead of "updating".
            setResult({ ...data, stale: false })
          }
        })
      }
      if (data.warning) {
        // Non-fatal — we may still have partial data, but flag it so the
        // UI can tell the person to double-check what was auto-filled.
        setError(data.warning)
      }
      setResult(data)
      setLoading(false)
      return data
    }

    // Both real-scraper attempts failed. Never surface *why* to the
    // customer (captcha, blocked, JS-rendering required, proxy timeout,
    // a raw HTTP status, ...) — that's internal diagnostic detail from
    // deep inside the scraper, not something a customer can act on, and
    // naming it (e.g. "captcha") just invites confusion or a support
    // ticket about nothing. Try the OG-only fallback before giving up.
    const ogFallback = await fetchOgFallback(url, attempt.data?.site ?? null)
    if (ogFallback) {
      setResult(ogFallback)
      setLoading(false)
      return ogFallback
    }

    // Genuinely nothing recoverable — not even a name or photo. Set a
    // deliberately generic, non-technical error value; ItemInfoModal
    // never renders this string directly, it only checks for its
    // presence to show the "try again / continue via chat" screen.
    //
    // FIX: `site` still comes from the last real attempt's own result
    // when it has one — scrapeProduct() reliably detects this (see
    // detectSite() in lib/scrape/parsers.ts, which only ever returns
    // null for a URL so malformed `new URL()` itself throws) even on a
    // total failure, and losing it here was the actual reason a known
    // platform's own logo (ItemInfoModal's SITE_LOGOS lookup) silently
    // fell back to the generic icon on this exact "nothing recoverable"
    // path — every earlier stage still knew this was Ajio, only this
    // object was throwing that away. `attempt.data` can itself be null
    // (the fetch call threw rather than returning a parsed body), hence
    // the extra guard.
    const failed: ScrapeResult = { url, site: attempt.data?.site ?? null, error: 'unreadable' }
    setError('unreadable')
    setResult(failed)
    setLoading(false)
    return failed
  }, [])

  const reset = useCallback(() => {
    generation.current++
    setLoading(false)
    setError(null)
    setResult(null)
  }, [])

  return { loading, error, result, lookup, reset }
}