/** @type {import('next').NextConfig} */

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
  ],

  // playwright-core reads browsers.json dynamically at import time (not
  // via a static require() the tracer can follow) to resolve browser
  // metadata — even with serverExternalPackages set above (which stops
  // Next's bundler from inlining the package, the right first step),
  // Vercel's own file tracer decides what actually gets COPIED into the
  // deployed function, and that's a separate step. With pnpm's nested
  // node_modules/.pnpm/playwright-core@X.Y.Z/node_modules/playwright-core
  // layout, the tracer has been known to miss this file, producing
  // "Cannot find module '.../playwright-core/browsers.json'" at runtime
  // in production despite working locally (dev never goes through
  // Vercel's tracer/bundling at all). This forces it in regardless of
  // whether the tracer's static analysis catches the dynamic require.
  // The actual Chromium executable itself is unrelated — that comes from
  // @sparticuz/chromium in lib/scrape/browser-fetch.ts, not from this
  // file, so this only needs to cover playwright-core's own metadata.
  outputFileTracingIncludes: {
    '/api/**/*': ['./node_modules/**/playwright-core/browsers.json'],
  },

  // The account sidebar's "Policy" section (components/dashboard/sidebar-data.ts)
  // links to /policy/* paths that were never real routes. Rather than duplicate
  // content under two URLs, these redirect to the actual policy pages under
  // app/(public) — /policy/payment-method has no equivalent yet, so it's a real
  // page instead (see app/(public)/policy/payment-method/page.tsx).
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