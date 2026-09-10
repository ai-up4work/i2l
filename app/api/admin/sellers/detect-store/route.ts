import { NextResponse } from 'next/server'

import { detectStoreProvider } from '@/lib/store-detection'

// POST /api/admin/sellers/detect-store
// Body: { storeUrl: string }
// Used from the "Add a seller" page: the admin pastes a store URL and this
// works out whether it's Shopify, WooCommerce, or neither, plus whatever
// store name / currency it can read off the feed — see lib/store-detection
// for how each platform is identified.
export async function POST(request: Request) {
  let body: { storeUrl?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 })
  }

  const storeUrl = body.storeUrl?.trim()
  if (!storeUrl) {
    return NextResponse.json({ ok: false, error: 'A store URL is required.' }, { status: 400 })
  }

  try {
    const result = await detectStoreProvider(storeUrl)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Detection failed.' },
      { status: 502 }
    )
  }
}