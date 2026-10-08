// lib/social-stores.ts
//
// Server-only data for the "Instagram & Facebook shops" section on
// /stores: every active custom seller with its item count and a few
// product photos for the tile. Service role on purpose (public, cached
// route with no cookie context) — so it selects only public columns.

import 'server-only'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { isSocialSellerRow } from '@/lib/supabase/affiliated-stores-shared'
import { videoPoster } from '@/lib/media'

export type SocialStoreTile = {
  slug: string
  name: string
  logo: string
  cover: string | null
  tagline: string | null
  description: string | null
  itemCount: number
  videoCount: number
  /** Up to 3 product photos, newest first. */
  previews: string[]
  /** Newest product's created_at, for "new" sorting. */
  latestAt: string | null
}

export async function fetchSocialStoreTiles(): Promise<SocialStoreTile[]> {
  const supabase = createServiceRoleClient()
  const { data: sellerRows, error } = await supabase
    .from('sellers')
    .select('*')
    .eq('status', 'active')
    .eq('type', 'manual')
  if (error) throw error

  const sellers = ((sellerRows ?? []) as unknown as Record<string, unknown>[]).filter(isSocialSellerRow)
  if (sellers.length === 0) return []

  const ids = sellers.map((s) => s.id as string)
  const run = (columns: string) =>
    supabase
      .from('products')
      .select(columns)
      .in('seller_id', ids)
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(3000)

  let { data: productRows, error: productsError } = await run('seller_id, images, videos, created_at')
  if (productsError?.code === '42703') {
    ;({ data: productRows, error: productsError } = await run('seller_id, images, created_at'))
  }
  if (productsError) throw productsError

  type P = { seller_id: string; images: string[] | null; videos?: string[] | null; created_at: string }
  const bySeller = new Map<string, { count: number; videos: number; previews: string[]; latestAt: string | null }>()
  for (const p of (productRows ?? []) as unknown as P[]) {
    const agg = bySeller.get(p.seller_id) ?? { count: 0, videos: 0, previews: [], latestAt: null }
    agg.count += 1
    agg.videos += p.videos?.length ?? 0
    agg.latestAt ??= p.created_at
    if (agg.previews.length < 3) {
      const photo = p.images?.[0] ?? (p.videos?.[0] ? videoPoster(p.videos[0]) : '')
      if (photo) agg.previews.push(photo)
    }
    bySeller.set(p.seller_id, agg)
  }

  return sellers
    .map((s) => {
      const agg = bySeller.get(s.id as string)
      return {
        slug: s.platform_slug as string,
        name: s.name as string,
        logo: (s.logo_url as string | null) ?? '',
        cover: (s.cover_url as string | null) ?? null,
        tagline: (s.tagline as string | null) ?? null,
        description: (s.description as string | null) ?? null,
        itemCount: agg?.count ?? 0,
        videoCount: agg?.videos ?? 0,
        previews: agg?.previews ?? [],
        latestAt: agg?.latestAt ?? null,
      }
    })
    // A shop with nothing to sell yet isn't worth a tile.
    .filter((t) => t.itemCount > 0)
    .sort((a, b) => (b.latestAt ?? '').localeCompare(a.latestAt ?? ''))
}
