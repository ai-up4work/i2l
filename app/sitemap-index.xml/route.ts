// app/sitemap-index.xml/route.ts — /sitemap-index.xml
//
// The sitemap index robots.txt points to. Next.js doesn't generate an
// index on its own, so this lists:
//   - /sitemap.xml                    every public page, store, guide and blog post
//   - /sitemaps/products/<store>      each live store's products + images
//
// Submit THIS URL in Google Search Console and Bing Webmaster Tools.

import { fetchActiveSellerSlugs } from '@/lib/sitemap-data'
import { absoluteUrl } from '@/lib/seo'

export const revalidate = 3600

function xmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function GET() {
  const sellers = await fetchActiveSellerSlugs()
  const now = new Date().toISOString()

  const sitemaps = [
    { loc: absoluteUrl('/sitemap.xml'), lastmod: now },
    ...sellers.map((s) => ({
      loc: absoluteUrl(`/sitemaps/products/${encodeURIComponent(s.slug)}`),
      lastmod: s.updatedAt ?? now,
    })),
  ]

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...sitemaps.map((s) => `  <sitemap>\n    <loc>${xmlEscape(s.loc)}</loc>\n    <lastmod>${s.lastmod}</lastmod>\n  </sitemap>`),
    '</sitemapindex>',
    '',
  ].join('\n')

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=3600',
    },
  })
}
