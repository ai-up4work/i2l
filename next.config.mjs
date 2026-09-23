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