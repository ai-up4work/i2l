// app/robots.ts — served at /robots.txt
//
// Private areas are disallowed here AND sent `X-Robots-Tag: noindex` by
// next.config.mjs. Both are needed: robots.txt stops crawling, but a URL
// that's linked from elsewhere can still be indexed without being crawled
// unless the page itself says noindex.
//
// Non-production deployments (Vercel previews) disallow everything so
// preview URLs never compete with the real site in search results.

import type { MetadataRoute } from 'next'
import { PRIVATE_PATH_PREFIXES, SITE_URL } from '@/lib/seo'

export default function robots(): MetadataRoute.Robots {
  const isProduction =
    process.env.VERCEL_ENV ? process.env.VERCEL_ENV === 'production' : process.env.NODE_ENV === 'production'

  if (!isProduction) {
    return { rules: [{ userAgent: '*', disallow: '/' }] }
  }

  const disallow = [
    ...PRIVATE_PATH_PREFIXES.map((p) => `${p}/`),
    ...PRIVATE_PATH_PREFIXES,
    '/offline',
    // Tracking/share parameters create duplicate URLs of the same page.
    '/*?*source=',
    '/*?*utm_',
  ]

  // Public, read-only endpoints Google's renderer needs: the store
  // catalogue loads its products from /api/stores/, and product share
  // cards come from /api/og/. The longer, more specific allow wins over
  // the /api disallow.
  const allow = ['/', '/api/stores/', '/api/og/']

  return {
    rules: [
      { userAgent: '*', allow, disallow },
      // AI search and answer engines, named explicitly so a future blanket
      // rule can't accidentally shut them out. These fetch pages to answer
      // questions and cite sources (ChatGPT search, Claude, Perplexity,
      // Apple, Bing/Copilot) — being crawlable is the entry ticket to being
      // recommended there. A crawler with its own group ignores the '*'
      // group, so each gets the same private-area rules.
      {
        userAgent: [
          'Googlebot',
          'Bingbot',
          'OAI-SearchBot',
          'ChatGPT-User',
          'Claude-SearchBot',
          'Claude-User',
          'PerplexityBot',
          'Perplexity-User',
          'Applebot',
        ],
        allow,
        disallow,
      },
    ],
    // The index lists /sitemap.xml and every store's product sitemap.
    sitemap: [`${SITE_URL}/sitemap-index.xml`, `${SITE_URL}/sitemap.xml`],
    host: SITE_URL,
  }
}
