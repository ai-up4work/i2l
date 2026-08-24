/**
 * Server-only product scraper.
 * ------------------------------------------------------------------
 * Given a product page URL, fetches the HTML and extracts whatever a
 * merchant already exposes for search engines and social previews —
 * no headless browser, no site-specific parsers to maintain.
 *
 * Extraction order (first hit wins):
 *   1. JSON-LD `Product` schema (`offers.price`, `offers.priceCurrency`)
 *   2. Open Graph / product meta tags (`og:title`, `product:price:amount`, ...)
 *   3. `<title>` as a last-resort name fallback
 *
 * This covers the overwhelming majority of e-commerce sites (Shopify,
 * WooCommerce, Amazon, eBay, most custom storefronts) because all of
 * them ship structured data for SEO — that's the same data a "share
 * preview" card in iMessage/Slack/Discord relies on.
 */

export type ScrapedProduct = {
  name: string | null
  image: string | null
  price: number | null
  currency: string | null
  siteName: string | null
}

const FETCH_TIMEOUT_MS = 10_000

export async function scrapeProduct(url: string): Promise<ScrapedProduct> {
  const html = await fetchHtml(url)

  const fromJsonLd = extractFromJsonLd(html)
  const fromMeta = extractFromMeta(html)

  return {
    name: fromJsonLd.name ?? fromMeta.name,
    image: fromJsonLd.image ?? fromMeta.image,
    price: fromJsonLd.price ?? fromMeta.price,
    currency: fromJsonLd.currency ?? fromMeta.currency,
    siteName: fromMeta.siteName,
  }
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        // Identify honestly and accept the same content a browser would,
        // which is what makes most storefronts serve the full page
        // (rather than a stripped bot-detection response).
        'User-Agent':
          'Mozilla/5.0 (compatible; India2LankaLinkPreview/1.0; +https://india2lanka.example/link-preview)',
        Accept: 'text/html,application/xhtml+xml',
      },
    })

    if (!response.ok) {
      throw new Error(`The store responded with ${response.status} — the page may require a login or be unavailable.`)
    }

    return await response.text()
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Timed out waiting for that store to respond.')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function extractFromJsonLd(html: string): Partial<ScrapedProduct> {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]

  for (const block of blocks) {
    const raw = block[1]?.trim()
    if (!raw) continue

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      continue // malformed JSON-LD is common in the wild; skip and keep looking
    }

    const product = findProductNode(parsed)
    if (!product) continue

    const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers
    const image = Array.isArray(product.image) ? product.image[0] : product.image

    return {
      name: typeof product.name === 'string' ? product.name : null,
      image: typeof image === 'string' ? image : null,
      price: offer?.price != null ? Number(offer.price) : null,
      currency: typeof offer?.priceCurrency === 'string' ? offer.priceCurrency : null,
    }
  }

  return {}
}

// A JSON-LD payload can be a single object, an array of objects, or an
// object with an @graph array — normalize and find the Product node.
function findProductNode(data: unknown): Record<string, any> | null {
  const nodes: unknown[] = Array.isArray(data) ? data : [data]

  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue
    const record = node as Record<string, any>

    if (record['@type'] === 'Product') return record

    if (Array.isArray(record['@graph'])) {
      const found = record['@graph'].find((entry: any) => entry?.['@type'] === 'Product')
      if (found) return found
    }
  }

  return null
}

function extractFromMeta(html: string): Partial<ScrapedProduct> {
  const name =
    metaContent(html, 'og:title') ?? metaContent(html, 'twitter:title') ?? tagContent(html, 'title')
  const image = metaContent(html, 'og:image') ?? metaContent(html, 'twitter:image')
  const priceRaw = metaContent(html, 'product:price:amount') ?? metaContent(html, 'og:price:amount')
  const currency = metaContent(html, 'product:price:currency') ?? metaContent(html, 'og:price:currency')
  const siteName = metaContent(html, 'og:site_name')

  return {
    name: name ? decodeHtmlEntities(name) : null,
    image: image ?? null,
    price: priceRaw ? parsePrice(priceRaw) : null,
    currency: currency ?? null,
    siteName: siteName ? decodeHtmlEntities(siteName) : null,
  }
}

function metaContent(html: string, property: string): string | null {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Meta tags can order `property`/`name` before or after `content`.
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["']`, 'i'),
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match) return match[1].trim()
  }

  return null
}

function tagContent(html: string, tag: string): string | null {
  const match = html.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i'))
  return match ? match[1].trim() : null
}

function parsePrice(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.,]/g, '').replace(/,/g, '')
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}
