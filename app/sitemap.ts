// app/sitemap.ts — served at /sitemap.xml
//
// Static public pages + every active store (hardcoded marketplaces from
// data/stores/data.ts, plus active local sellers from Supabase).
//
// Product pages are in per-store product sitemaps (with images) at
// /sitemaps/products/<store>, all listed in /sitemap-index.xml — that index
// is what robots.txt and Search Console point to.
//
// Uses a plain anon Supabase client (no cookies) so the result can be cached
// and revalidated hourly instead of rendering per request.

import type { MetadataRoute } from 'next'
import { marketplaceStores } from '@/data/stores/data'
import { absoluteUrl } from '@/lib/seo'
import { fetchActiveSellerSlugs } from '@/lib/sitemap-data'
import { BLOG_POSTS } from '@/content/blog'
import { STORE_GUIDES } from '@/content/store-guides'

export const revalidate = 3600

type Freq = NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>

// When you add a new public page under app/(public), add it here too.
const STATIC_ROUTES: { path: string; priority: number; changeFrequency: Freq }[] = [
  { path: '/', priority: 1.0, changeFrequency: 'daily' },
  { path: '/stores', priority: 0.9, changeFrequency: 'daily' },
  { path: '/deals', priority: 0.8, changeFrequency: 'daily' },
  { path: '/categories', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/shopping', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/shipping', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/shipping/pricing', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/coupons', priority: 0.6, changeFrequency: 'weekly' },
  { path: '/community/discover/recommended', priority: 0.6, changeFrequency: 'daily' },
  { path: '/shopping-guides', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/shop-from-india', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/estimate', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/shopping/protection', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/shipping/protection', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/warehouses', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/about', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/contact', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/blog', priority: 0.5, changeFrequency: 'weekly' },
  { path: '/blog/categories/notices', priority: 0.4, changeFrequency: 'weekly' },
  { path: '/stores/apply', priority: 0.4, changeFrequency: 'yearly' },
  { path: '/prohibited-items', priority: 0.4, changeFrequency: 'monthly' },
  { path: '/policy/payment-method', priority: 0.4, changeFrequency: 'yearly' },
  { path: '/refund-policy', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/terms', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/data-deletion', priority: 0.2, changeFrequency: 'yearly' },
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // No lastModified on static pages: stamping "now" on every request tells
  // Google every page changed every hour, so it learns to ignore our dates.
  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    url: absoluteUrl(r.path),
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }))

  const guideEntries: MetadataRoute.Sitemap = STORE_GUIDES.map((g) => ({
    url: absoluteUrl(`/shop-from-india/${g.slug}`),
    lastModified: new Date(g.reviewed),
    changeFrequency: 'monthly',
    priority: 0.8,
  }))

  const blogEntries: MetadataRoute.Sitemap = BLOG_POSTS.map((p) => ({
    url: absoluteUrl(`/blog/${p.slug}`),
    lastModified: new Date(p.updated ?? p.published),
    changeFrequency: 'monthly',
    priority: 0.6,
  }))

  const sellers = await fetchActiveSellerSlugs()
  const seen = new Set<string>()
  const storeEntries: MetadataRoute.Sitemap = []

  for (const store of marketplaceStores) {
    if (seen.has(store.platform)) continue
    seen.add(store.platform)
    storeEntries.push({
      url: absoluteUrl(`/stores/${encodeURIComponent(store.platform)}`),
      changeFrequency: 'daily',
      priority: 0.8,
    })
  }

  for (const seller of sellers) {
    if (seen.has(seller.slug)) continue
    seen.add(seller.slug)
    storeEntries.push({
      url: absoluteUrl(`/stores/${encodeURIComponent(seller.slug)}`),
      ...(seller.updatedAt ? { lastModified: new Date(seller.updatedAt) } : {}),
      changeFrequency: 'daily',
      priority: 0.8,
    })
  }

  return [...staticEntries, ...guideEntries, ...blogEntries, ...storeEntries]
}
