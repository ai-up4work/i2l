// app/api/stores/[platform]/reels/route.ts
//
// GET -> this store's products that have a video, newest first, for the
// reels row on a custom seller's store page. Empty for every other kind
// of store (only catalogue stores hold videos).

import { NextRequest, NextResponse } from 'next/server'
import { getSellerAndConfig } from '@/lib/store-config-db'
import { fetchCatalogueReels } from '@/lib/store-providers/catalogue'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params
  try {
    const seller = await getSellerAndConfig(platform)
    if (!seller) return NextResponse.json({ error: 'Unknown store platform' }, { status: 404 })
    const products = seller.config.type === 'catalogue' ? await fetchCatalogueReels(platform, seller.name, 16) : []
    return NextResponse.json({ products }, { headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=60' } })
  } catch (err) {
    console.error('[store reels API]', err)
    return NextResponse.json({ products: [] })
  }
}
