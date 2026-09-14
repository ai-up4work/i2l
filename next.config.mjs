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