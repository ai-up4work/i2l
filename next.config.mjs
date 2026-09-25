/** @type {import('next').NextConfig} */

// Areas that must never appear in search results. robots.txt (app/robots.ts)
// stops crawling; this header stops indexing of URLs Google finds via links.
// Keep in sync with PRIVATE_PATH_PREFIXES in lib/seo.ts.
const NOINDEX_PREFIXES = ['/account', '/admin', '/seller', '/catalogue', '/demo', '/auth', '/api', '/offline']

const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },

  images: {
    unoptimized: true,
  },

  serverExternalPackages: [
    'impit',
    'playwright',
    'playwright-core',
    '@sparticuz/chromium',
  ],

  // playwright-core reads browsers.json, and @sparticuz/chromium reads its
  // own bin/ Chromium archive, dynamically at runtime (not via a static
  // require() a file tracer can follow) — even with serverExternalPackages
  // above, Vercel's own file tracer still needs to be told explicitly to
  // include them.
  //
  // IMPORTANT: under pnpm, node_modules/playwright-core and
  // node_modules/@sparticuz/chromium are themselves SYMLINKS into the
  // .pnpm virtual store (e.g. .pnpm/playwright-core@1.62.1/node_modules/
  // playwright-core). Globbing through that top-level symlinked path
  // (this file's previous version did: './node_modules/**/playwright-core/
  // browsers.json') still produces the exact Vercel error this is fixing:
  // "The framework produced an invalid deployment package for a
  // Serverless Function ... files in symlinked directories" — Vercel's
  // packager rejects files reached via that indirection. Pointing the
  // glob at the REAL .pnpm store path directly (bypassing the symlink
  // entirely, not just avoiding a broader project-wide node-linker
  // change) is the documented fix for this exact package combination.
  // The version numbers in these paths must match package.json's
  // playwright-core/@sparticuz/chromium versions — bump the glob's `@*`
  // stays version-tolerant on its own, so a routine dependency update
  // shouldn't require touching this again.
  outputFileTracingIncludes: {
    '/api/**/*': [
      './node_modules/.pnpm/playwright-core@*/node_modules/playwright-core/browsers.json',
      './node_modules/.pnpm/@sparticuz+chromium@*/node_modules/@sparticuz/chromium/bin/**',
    ],
  },

  // The account sidebar's "Policy" section (components/dashboard/sidebar-data.ts)
  // links to /policy/* paths that were never real routes. Rather than duplicate
  // content under two URLs, these redirect to the actual policy pages under
  // app/(public) — /policy/payment-method has no equivalent yet, so it's a real
  // page instead (see app/(public)/policy/payment-method/page.tsx).
  async headers() {
    return [
      // Service worker: must never be HTTP-cached, or browsers keep running
      // an old version for up to 24h after a deploy.
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/manifest.webmanifest',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
      },
      // Icons/SEO/PWA images are placeholders that get replaced IN PLACE
      // (same filename), so they get a short cache with background
      // revalidation rather than `immutable` — otherwise browsers and social
      // crawlers would keep the placeholder for a year.
      ...['/icons/:path*', '/images/seo/:path*', '/images/pwa/:path*', '/favicon.ico'].map((source) => ({
        source,
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }],
      })),
      ...NOINDEX_PREFIXES.flatMap((prefix) =>
        [prefix, `${prefix}/:path*`].map((source) => ({
          source,
          headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
        })),
      ),
      // Baseline hardening for every response.
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },

  async redirects() {
    return [
      { source: '/policy/shipping-info', destination: '/shipping', permanent: true },
      { source: '/policy/returns', destination: '/refund-policy', permanent: true },
      { source: '/policy/refund', destination: '/refund-policy', permanent: true },
      { source: '/policy/terms', destination: '/terms', permanent: true },
    ]
  },
}

export default nextConfig