// app/llms.txt/route.ts — /llms.txt
//
// A plain-markdown summary of Wishdrop for AI assistants (the llms.txt
// convention). Google says it doesn't need or use this file; some other AI
// tools do read it. It only restates what the site already says publicly.
// Store guides, blog posts and live stores are added automatically.

import { SITE, absoluteUrl } from '@/lib/seo'
import { STORE_GUIDES } from '@/content/store-guides'
import { BLOG_POSTS } from '@/content/blog'
import { fetchActiveSellerSlugs } from '@/lib/sitemap-data'

export const revalidate = 86400

export async function GET() {
  const sellers = await fetchActiveSellerSlugs()
  const link = (label: string, path: string, note?: string) => `- [${label}](${absoluteUrl(path)})${note ? `: ${note}` : ''}`

  const body = [
    `# ${SITE.name}`,
    '',
    `> ${SITE.description}`,
    '',
    'Wishdrop is a concierge shopping and delivery service for customers in Sri Lanka. Customers browse stores on Wishdrop or send a product link from an Indian online store; Wishdrop quotes one total in Sri Lankan rupees (LKR), buys the item in India, quality-checks it at its facility, ships it to Sri Lanka and delivers it to the customer’s door. The customer needs no Indian address, parcel-forwarding account or import paperwork.',
    '',
    '## Key facts',
    '- Serves: customers in Sri Lanka, buying from online stores in India (plus some local Sri Lankan shops).',
    '- Pricing: one LKR total shown before payment — item (incl. international shipping and handling), a flat service charge, and a flat delivery fee; staff confirm the final price before payment. Nothing more to pay on delivery unless the order changes.',
    '- Delivery: Express usually about 12–15 days from purchase; Economy (when available) about 3–4 weeks.',
    '- Payment: Visa/Mastercard cards, supported mobile wallets, Wishdrop wallet credit; paid in full when the quote is accepted.',
    '- Order stages: Ordered → Quality check → Shipped → Delivered, tracked in the customer’s account.',
    '',
    '## Main pages',
    link('Home', '/'),
    link('Stores on Wishdrop', '/stores'),
    link('Shop from Indian stores (guides)', '/shop-from-india'),
    link('Price estimator', '/estimate', 'estimate a delivered LKR price'),
    link('Shipping & delivery', '/shipping'),
    link('Shipping rates', '/shipping/pricing'),
    link('Prohibited items', '/prohibited-items'),
    link('Payment methods', '/policy/payment-method'),
    link('Refund & cancellation policy', '/refund-policy'),
    link('About', '/about'),
    link('Contact', '/contact'),
    '',
    '## Store guides',
    ...STORE_GUIDES.map((g) => link(`How to buy from ${g.name} in Sri Lanka`, `/shop-from-india/${g.slug}`)),
    '',
    '## Blog',
    ...BLOG_POSTS.map((p) => link(p.title, `/blog/${p.slug}`)),
    '',
    ...(sellers.length ? ['## Stores', ...sellers.map((s) => link(s.slug, `/stores/${encodeURIComponent(s.slug)}`)), ''] : []),
  ].join('\n')

  return new Response(body, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400',
    },
  })
}
