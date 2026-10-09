// app/api/stores/[platform]/store-collections/route.ts
//
// GET -> a social store's collections for shoppers: only active ones with
// at least one active product, in the store's order, each with a cover
// photo (its image, or its newest product's photo). Used for the
// "Shop by collection" row and the collection filter on the store page.
// Staff previewing a hidden store get it too (see lib/store-preview.ts).

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { canPreviewStore, PREVIEW_CACHE_HEADERS } from '@/lib/store-preview'
import { videoPoster } from '@/lib/media'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params
  const admin = createServiceRoleClient()

  const { data: store } = await admin.from('sellers').select('id, status').eq('platform_slug', platform).maybeSingle()
  const row = store as { id: string; status: string } | null
  if (!row) return NextResponse.json({ collections: [] }, { status: 404 })
  const preview = row.status !== 'active'
  if (preview && !(await canPreviewStore(platform))) return NextResponse.json({ collections: [] }, { status: 404 })

  const { data: cols, error } = await admin
    .from('store_collections' as never)
    .select('id, name, slug, description, image_url, sort_order')
    .eq('seller_id', row.id)
    .eq('active', true)
    .order('sort_order')
    .order('created_at')
  if (error || !cols?.length) return NextResponse.json({ collections: [] })

  const collections = cols as unknown as { id: string; name: string; slug: string; description: string | null; image_url: string | null }[]
  const { data: links } = await admin
    .from('store_collection_products' as never)
    .select('collection_id, product_id, products!inner(images, videos, active, created_at)')
    .in('collection_id', collections.map((c) => c.id))
  type Link = { collection_id: string; products: { images: string[] | null; videos?: string[] | null; active: boolean; created_at: string } }

  const byCollection = new Map<string, { count: number; cover: string | null; at: string }>()
  for (const l of (links ?? []) as unknown as Link[]) {
    if (!l.products?.active) continue
    const agg = byCollection.get(l.collection_id) ?? { count: 0, cover: null, at: '' }
    agg.count += 1
    const photo = l.products.images?.[0] ?? (l.products.videos?.[0] ? videoPoster(l.products.videos[0]) : null)
    if (photo && l.products.created_at > agg.at) {
      agg.cover = photo
      agg.at = l.products.created_at
    }
    byCollection.set(l.collection_id, agg)
  }

  const result = collections
    .map((c) => ({
      slug: c.slug,
      name: c.name,
      description: c.description,
      image: c.image_url ?? byCollection.get(c.id)?.cover ?? null,
      count: byCollection.get(c.id)?.count ?? 0,
    }))
    .filter((c) => c.count > 0)

  return NextResponse.json(
    { collections: result },
    { headers: preview ? PREVIEW_CACHE_HEADERS : { 'Cache-Control': 's-maxage=60, stale-while-revalidate=60' } },
  )
}
