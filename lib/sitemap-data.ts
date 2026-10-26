// lib/sitemap-data.ts
//
// Shared by app/sitemap.ts (page sitemap) and app/sitemap-index.xml (the
// index that also lists each store's product sitemap).
//
// Uses a plain anon Supabase client (no cookies) so callers can be cached.

import { createClient } from '@supabase/supabase-js'

export async function fetchActiveSellerSlugs(): Promise<{ slug: string; updatedAt?: string }[]> {
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
