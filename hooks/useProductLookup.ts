// hooks/useProductLookup.ts
'use client'
import { useCallback, useState } from 'react'
import type { ScrapeResult } from '@/lib/scrape/parsers'

// A failed scrape (captcha, rate-limit, a proxy tier timing out, a
// momentary block) is very often just transient — retrying the exact
// same request a few seconds later succeeds more often than not. This
// single silent retry means most customers never see a failure state
// at all; it only costs 5 extra seconds on the minority of requests
// that needed it.
const RETRY_DELAY_MS = 5000

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchProductLookup(url: string): Promise<{ ok: boolean; data: ScrapeResult | null }> {
  try {
    const res = await fetch(`/api/product-lookup?url=${encodeURIComponent(url)}`)
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
 */
async function fetchOgFallback(url: string): Promise<ScrapeResult | null> {
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
      site: 'generic',
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

  const lookup = useCallback(async (url: string): Promise<ScrapeResult | null> => {
    setLoading(true)
    setError(null)

    let attempt = await fetchProductLookup(url)
    if (!attempt.ok) {
      await sleep(RETRY_DELAY_MS)
      attempt = await fetchProductLookup(url)
    }

    if (attempt.ok && attempt.data) {
      const data = attempt.data
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
    const ogFallback = await fetchOgFallback(url)
    if (ogFallback) {
      setResult(ogFallback)
      setLoading(false)
      return ogFallback
    }

    // Genuinely nothing recoverable — not even a name or photo. Set a
    // deliberately generic, non-technical error value; ItemInfoModal
    // never renders this string directly, it only checks for its
    // presence to show the "try again / continue via chat" screen.
    const failed: ScrapeResult = { url, site: null, error: 'unreadable' }
    setError('unreadable')
    setResult(failed)
    setLoading(false)
    return failed
  }, [])

  const reset = useCallback(() => {
    setLoading(false)
    setError(null)
    setResult(null)
  }, [])

  return { loading, error, result, lookup, reset }
}