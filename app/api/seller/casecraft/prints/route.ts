// app/api/seller/casecraft/prints/route.ts
// GET -> this store's "printed case" photos. POST -> add one.

import { NextRequest, NextResponse } from 'next/server'
import { requireCaseCraftSeller } from '@/lib/store-modules/casecraft/seller-api'
import { isMissingTable, loadLikeCounts, loadPrints } from '@/lib/store-modules/casecraft/server'
import { parsePrint } from '@/lib/store-modules/casecraft/prints'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireCaseCraftSeller()
  if (!auth.ok) return auth.response
  const { prints, needsMigration } = await loadPrints(auth.seller.id, auth.db)
  const likes = await loadLikeCounts([], prints.map((p) => p.id), auth.db)
  return NextResponse.json(
    { prints: prints.map((p) => ({ ...p, likes: likes[`print:${p.id}`] ?? 0 })), needsMigration },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function POST(req: NextRequest) {
  const auth = await requireCaseCraftSeller()
  if (!auth.ok) return auth.response
  const parsed = parsePrint(await req.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const { data, error } = await auth.db
    .from('casecraft_prints')
    .insert({ ...parsed.value, seller_id: auth.seller.id })
    .select('*')
    .single()
  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ error: 'The database needs an update first: run data/wishdrop-casecraft-prints-likes.sql in Supabase.' }, { status: 503 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ print: data })
}
