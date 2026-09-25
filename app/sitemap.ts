// app/sitemap.ts — served at /sitemap.xml
//
// Static public pages + every active store (hardcoded marketplaces from
// data/stores/data.ts, plus active local sellers from Supabase).
//
// Individual product pages are NOT listed: they're fetched live from each
// store's upstream feed, so enumerating them here would mean crawling every
// store on every sitemap request. Google discovers them through the store
// catalogue pages instead, and each product page carries its own canonical
// + Product structured data.
//
// Uses a plain anon Supabase client (no cookies) so the result can be cached
// and revalidated hourly instead of rendering per request.

import type { MetadataRoute } from 'next'
import { createClient } from '@supabase/supabase-js'
import { marketplaceStores } from '@/data/stores/data'
import { absoluteUrl } from '@/lib/seo'

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
  { path: '/taxation', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/coupons', priority: 0.6, changeFrequency: 'weekly' },
  { path: '/community/discover/recommended', priority: 0.6, changeFrequency: 'daily' },
  { path: '/shopping-guides', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/shopping/marketplaces/ebay', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/shopping/marketplaces/mercari', priority: 0.5, changeFrequency: 'monthly' },
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

async function fetchActiveSellerSlugs(): Promise<{ slug: string; updatedAt?: string }[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return []

  try {
    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await supabase
      .from('sellers')
      .select('platform_slug, last_sync, last_edit, created_at')
      .eq('status', 'active')
    if (error || !data) {
      if (error) console.error('[sitemap] sellers', error.message)
      return []
    }
    return data
      .filter((row) => row.platform_slug)
      .map((row) => {
        // No updated_at column on sellers — use the most recent of the
        // feed sync, manual edit, or creation timestamps.
        const stamps = [row.last_sync, row.last_edit, row.created_at]
          .filter(Boolean)
          .map((t) => new Date(t as string).getTime())
          .filter((t) => !Number.isNaN(t))
        return {
          slug: row.platform_slug as string,
          updatedAt: stamps.length ? new Date(Math.max(...stamps)).toISOString() : undefined,
        }
      })
  } catch (err) {
    console.error('[sitemap] sellers', err)
    return []
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    url: absoluteUrl(r.path),
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }))

  const sellers = await fetchActiveSellerSlugs()
  const seen = new Set<string>()
  const storeEntries: MetadataRoute.Sitemap = []

  for (const store of marketplaceStores) {
    if (seen.has(store.platform)) continue
    seen.add(store.platform)
    storeEntries.push({
      url: absoluteUrl(`/stores/${encodeURIComponent(store.platform)}`),
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
    })
  }

  for (const seller of sellers) {
    if (seen.has(seller.slug)) continue
    seen.add(seller.slug)
    storeEntries.push({
      url: absoluteUrl(`/stores/${encodeURIComponent(seller.slug)}`),
      lastModified: seller.updatedAt ? new Date(seller.updatedAt) : now,
      changeFrequency: 'daily',
      priority: 0.8,
    })
  }

  return [...staticEntries, ...storeEntries]
}
