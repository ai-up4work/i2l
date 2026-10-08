// app/api/stores/social/route.ts
//
// GET -> custom (Instagram / Facebook) seller stores for the /stores
// listing: name, logo, cover, item count and a few product photos.
// Public and briefly cached. See lib/social-stores.ts.

import { NextResponse } from 'next/server'
import { fetchSocialStoreTiles } from '@/lib/social-stores'

export async function GET() {
  try {
    const stores = await fetchSocialStoreTiles()
    return NextResponse.json({ stores }, { headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=120' } })
  } catch (err) {
    console.error('[social stores API]', err)
    return NextResponse.json({ stores: [] }, { status: 200 })
  }
}
