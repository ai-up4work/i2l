// app/sitemaps/products/[platform]/route.ts — /sitemaps/products/<store>
//
// One product sitemap per live store, with every product's photos as
// image-sitemap entries (<image:image>), so Google can find product pages
// and their images even though the store catalogue loads them in the
// browser. Listed in /sitemap-index.xml.
//
// Upstream cost: API-backed stores (Shopify, WooCommerce, JSON feeds, our
// own catalogue) are listed up to MAX_PAGES × 48 products; scraped stores
// only their first page, so a sitemap request never turns into a long
// scrape. The response is cached at the CDN for a day.

import { getSellerAndConfig } from '@/lib/store-config-db'
import { isMockStore, listStoreProducts, withTimeout } from '@/lib/store-listing-server'
import { absoluteUrl } from '@/lib/seo'
import type { StoreProduct } from '@/lib/store.types'

const PER_PAGE = 48
const MAX_PAGES = 10 // up to 480 products per store
const API_TYPES = new Set(['shopify', 'woocommerce', 'jsonapi', 'catalogue'])
const PAGE_TIMEOUT_MS = 8000

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function emptyUrlset(): Response {
  return xmlResponse('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n', 3600)
}

function xmlResponse(body: string, maxAge: number): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge}`,
    },
  })
}

export async function GET(_req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params
  // Only live stores — getSellerAndConfig returns nothing for hidden ones.
  const seller = await getSellerAndConfig(platform)
  if (!seller || isMockStore(seller)) return emptyUrlset()

  const pages = platform === 'anishka-creation' || !API_TYPES.has(seller.config.type) ? 1 : MAX_PAGES
  const products: StoreProduct[] = []
  for (let page = 1; page <= pages; page++) {
    const listing = await withTimeout(
      listStoreProducts(platform, seller, { page, perPage: PER_PAGE, category: '', search: '', sort: 'newest' }),
      PAGE_TIMEOUT_MS,
    )
    if (!listing || !listing.products.length) break
    products.push(...listing.products)
    if (page >= listing.totalPages) break
  }

  const seen = new Set<string>()
  const entries: string[] = []
  for (const p of products) {
    if (!p.handle || seen.has(p.handle)) continue
    seen.add(p.handle)
    const loc = absoluteUrl(`/stores/${encodeURIComponent(platform)}/product/${encodeURIComponent(p.handle)}`)
    const images = Array.from(new Set([p.image, ...(p.images ?? [])].filter(Boolean)))
      .filter((src) => /^https?:\/\//i.test(src) || src.startsWith('/'))
      .slice(0, 10)
    entries.push(
      [
        '  <url>',
        `    <loc>${xmlEscape(loc)}</loc>`,
        ...images.map((src) => `    <image:image><image:loc>${xmlEscape(absoluteUrl(src))}</image:loc></image:image>`),
        '  </url>',
      ].join('\n'),
    )
  }

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    ...entries,
    '</urlset>',
    '',
  ].join('\n')

  return xmlResponse(body, 86400)
}
