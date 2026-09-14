// lib/og-lookup.ts
//
// Lightweight, server-only Open Graph tag fetch — the fallback used when
// a link can't be priced by the real scraper (lib/scrape/parsers.ts):
// no extractor matches the domain, or extraction ran but came back with
// no usable price (Instagram posts, boutique sites behind heavy bot
// protection, etc.). Those links become a Channel 3 manual request (see
// DashboardContext's confirmRequest) — this function is what gets that
// request an actual product photo and title instead of a blank card, by
// reading the same <meta property="og:*"> tags every site already
// publishes so its own links preview nicely when shared elsewhere.
//
// Deliberately NOT a full scrape: no headless browser, no retries, no
// proxy fallback (ScraperAPI, TLS-fingerprint fetch, etc.) — those are
// exactly the heavy machinery that already failed for this link one step
// up the call chain. A plain fetch + regex over the first chunk of HTML
// either finds OG tags fast or it doesn't; failing fast here is the
// correct behavior, not a shortcut, since the customer is already on the
// "this needs a human" path either way.

const FETCH_TIMEOUT_MS = 8_000
// OG tags are almost always in <head>, well within the first ~200KB even
// on a heavy page — capping how much we read keeps this fast and cheap
// for pages that never do have OG tags (no point downloading the whole
// document body just to conclude that).
const MAX_BYTES = 200_000

export type OgMetadata = {
  title: string | null
  image: string | null
  description: string | null
}

function extractMetaContent(html: string, property: string): string | null {
  // Order of attributes on the tag isn't guaranteed (content before or
  // after property/name), so two patterns per property rather than one
  // over-clever regex.
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, 'i'),
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) return decodeHtmlEntities(match[1])
  }
  return null
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function resolveUrl(maybeRelative: string, base: string): string {
  try {
    return new URL(maybeRelative, base).toString()
  } catch {
    return maybeRelative
  }
}

/**
 * Fetches `url` and pulls og:title / og:image / og:description (falling
 * back to twitter:title / twitter:image, then <title>, when a site skips
 * OG tags but still supports Twitter Card previews). Returns nulls
 * (never throws) on any failure — timeout, non-200, blocked fetch,
 * no tags found — since this is always a best-effort fallback, not a
 * required step.
 */
export async function fetchOgMetadata(url: string): Promise<OgMetadata> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        // A plain server-side fetch with no browser UA gets blocked or
        // served a stripped page by a lot of sites — a realistic UA
        // materially improves the hit rate for this fallback.
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
    })
    if (!res.ok || !res.body) return { title: null, image: null, description: null }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let html = ''
    while (html.length < MAX_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      html += decoder.decode(value, { stream: true })
      // Once both a title-ish and image-ish tag are present, no need to
      // keep reading — bail out early rather than draining the stream.
      if (/og:title|twitter:title/i.test(html) && /og:image|twitter:image/i.test(html) && html.length > 4000) break
    }
    reader.cancel().catch(() => {})

    const title = extractMetaContent(html, 'og:title') ?? extractMetaContent(html, 'twitter:title') ?? extractTitleTag(html)
    const rawImage = extractMetaContent(html, 'og:image') ?? extractMetaContent(html, 'twitter:image')
    const description = extractMetaContent(html, 'og:description') ?? extractMetaContent(html, 'twitter:description')

    return {
      title,
      image: rawImage ? resolveUrl(rawImage, url) : null,
      description,
    }
  } catch {
    return { title: null, image: null, description: null }
  } finally {
    clearTimeout(timeout)
  }
}

function extractTitleTag(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return match?.[1] ? decodeHtmlEntities(match[1].trim()) : null
}
