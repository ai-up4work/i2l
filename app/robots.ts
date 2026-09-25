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

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          ...PRIVATE_PATH_PREFIXES.map((p) => `${p}/`),
          ...PRIVATE_PATH_PREFIXES,
          '/offline',
          // Tracking/share parameters create duplicate URLs of the same page.
          '/*?*source=',
          '/*?*utm_',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
