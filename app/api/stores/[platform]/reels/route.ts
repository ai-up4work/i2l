// app/api/stores/[platform]/reels/route.ts
//
// GET -> this store's products that have a video, newest first, for the
// reels row on a custom seller's store page. Empty for every other kind
// of store (only catalogue stores hold videos).

import { NextRequest, NextResponse } from 'next/server'
import { getSellerAndConfig, getSellerAndConfigForAdmin } from '@/lib/store-config-db'
import { canPreviewStore, PREVIEW_CACHE_HEADERS } from '@/lib/store-preview'
import { fetchCatalogueReels } from '@/lib/store-providers/catalogue'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params
  try {
    let seller = await getSellerAndConfig(platform)
    let preview = false
    if (!seller && (await canPreviewStore(platform))) {
      seller = await getSellerAndConfigForAdmin(platform)
      preview = Boolean(seller)
    }
    if (!seller) return NextResponse.json({ error: 'Unknown store platform' }, { status: 404 })
    const products = seller.config.type === 'catalogue' ? await fetchCatalogueReels(platform, seller.name, 16, { includeHidden: preview }) : []
    return NextResponse.json(
      { products },
      { headers: preview ? PREVIEW_CACHE_HEADERS : { 'Cache-Control': 's-maxage=60, stale-while-revalidate=60' } },
    )
  } catch (err) {
    console.error('[store reels API]', err)
    return NextResponse.json({ products: [] })
  }
}
