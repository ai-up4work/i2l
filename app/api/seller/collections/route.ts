// app/api/seller/collections/route.ts
//
// GET  -> the logged-in seller's store collections (for the product editor).
// POST -> create one: { name }. Staff manage them fully on the store's
//         admin page; sellers can list and add.

import { NextRequest, NextResponse } from 'next/server'
import { requireSeller } from '@/lib/supabase/seller-auth'
import { createCollection, listCollections } from '@/lib/store-collections'

export async function GET() {
  const auth = await requireSeller()
  if (!auth.ok) return auth.response
  try {
    const { collections, missing } = await listCollections(auth.admin, auth.seller.id)
    return NextResponse.json({ collections, needsMigration: missing }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not load collections' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireSeller()
  if (!auth.ok) return auth.response
  return createCollection(auth.admin, auth.seller.id, await req.json().catch(() => ({})))
}
