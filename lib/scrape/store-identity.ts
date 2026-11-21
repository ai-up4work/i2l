// lib/scrape/store-identity.ts
//
// SERVER-ONLY. For an ad-hoc Shopify / WooCommerce link (a store we have no
// brand logo for), finds the store's OWN name and favicon from its homepage,
// so the item screen can show "Acme Tea Co." with its icon instead of the
// generic Shopify / WooCommerce mark. The generic mark stays as the last
// resort when neither can be found.
//
// Best effort and never fatal: any failure resolves to { name: null,
// favicon: null }. Cached per store (not per product) for an hour, so every
// product from the same store shares one homepage read.

import * as cheerio from 'cheerio'
import { safeFetch } from '@/lib/url-safety'
import { withScrapeCache } from '@/lib/scrape/result-cache'

export type StoreIdentity = { name: string | null; favicon: string | null }

const TIMEOUT_MS = 4000
const MAX_HTML_CHARS = 400_000

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function abs(href: string | undefined | null, base: string): string | null {
  if (!href) return null
  try {
    const u = new URL(href.trim(), base)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}

function cleanName(raw: string | undefined | null): string | null {
  const t = (raw ?? '').replace(/\s+/g, ' ').trim()
  if (!t || t.length > 80) return null
  // A bare "Home" / "Welcome" is a page title, not a store name.
  if (/^(home|welcome|shop|store|online store)$/i.test(t)) return null
  return t
}

/** "Acme Tea – Organic loose leaf" -> "Acme Tea". Only used when the
 *  homepage has no og:site_name / application-name. */
function nameFromTitle(title: string): string | null {
  const first = title.split(/\s+[|–—-]\s+|\s*[|–—]\s*/)[0]
  return cleanName(first)
}

function pickFavicon($: cheerio.CheerioAPI, base: string): string | null {
  const candidates: { href: string; score: number }[] = []
  $('link[rel]').each((_, el) => {
    const rel = ($(el).attr('rel') ?? '').toLowerCase()
    if (!/(^|\s)(icon|shortcut|apple-touch-icon(-precomposed)?)(\s|$)/.test(rel)) return
    const href = abs($(el).attr('href'), base)
    if (!href) return
    const sizes = $(el).attr('sizes') ?? ''
    const px = Number(sizes.split(/[x\s]/)[0]) || 0
    // Prefer a real raster/svg icon of a useful size; apple-touch icons are
    // large and crisp, plain icons next, .ico last.
    let score = px
    if (rel.includes('apple-touch-icon')) score += 100
    if (/\.ico(\?|$)/i.test(href)) score -= 50
    candidates.push({ href, score })
  })
  candidates.sort((a, b) => b.score - a.score)
  return candidates[0]?.href ?? abs('/favicon.ico', base)
}

async function readIdentity(origin: string): Promise<StoreIdentity> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await safeFetch(
      origin,
      {
        signal: controller.signal,
        cache: 'no-store',
        headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      },
      4,
    )
    if (!res.ok) return { name: null, favicon: abs('/favicon.ico', origin) }
    const html = (await res.text()).slice(0, MAX_HTML_CHARS)
    const base = res.url || origin
    const $ = cheerio.load(html)

    const name =
      cleanName($('meta[property="og:site_name"]').attr('content')) ??
      cleanName($('meta[name="application-name"]').attr('content')) ??
      cleanName($('meta[name="apple-mobile-web-app-title"]').attr('content')) ??
      nameFromTitle($('title').first().text())

    return { name, favicon: pickFavicon($, base) }
  } catch {
    return { name: null, favicon: null }
  } finally {
    clearTimeout(timer)
  }
}

/** Store name + favicon for the site at `origin` (e.g. https://shop.example.com). */
export async function getStoreIdentity(origin: string, signal?: AbortSignal): Promise<StoreIdentity> {
  try {
    const result = await withScrapeCache<StoreIdentity & { error?: string | null }>(
      origin,
      {
        kind: 'storeid',
        signal,
        // Don't cache an empty answer — a transient failure shouldn't stick.
        isSuccess: (r) => !!(r.name || r.favicon),
      },
      () => readIdentity(origin),
    )
    return { name: result.name ?? null, favicon: result.favicon ?? null }
  } catch {
    return { name: null, favicon: null }
  }
}
