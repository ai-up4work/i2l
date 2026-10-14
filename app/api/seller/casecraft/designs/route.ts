// app/api/seller/casecraft/designs/route.ts
// GET -> all of this store's ready-made designs. POST -> add one.

import { NextRequest, NextResponse } from 'next/server'
import { requireCaseCraftSeller } from '@/lib/store-modules/casecraft/seller-api'
import { CASECRAFT_MIGRATION_HINT, isMissingTable, loadDesigns } from '@/lib/store-modules/casecraft/server'
import { parseDesign } from '@/lib/store-modules/casecraft/designs'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireCaseCraftSeller()
  if (!auth.ok) return auth.response
  const { designs, needsMigration } = await loadDesigns(auth.seller.id, auth.db)
  return NextResponse.json({ designs, needsMigration }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const auth = await requireCaseCraftSeller()
  if (!auth.ok) return auth.response
  const parsed = parseDesign(await req.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const { data, error } = await auth.db
    .from('casecraft_designs')
    .insert({ ...parsed.value, seller_id: auth.seller.id })
    .select('*')
    .single()
  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ error: CASECRAFT_MIGRATION_HINT }, { status: 503 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ design: data })
}
