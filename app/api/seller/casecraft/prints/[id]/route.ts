// app/api/seller/casecraft/prints/[id]/route.ts
// PATCH -> edit / hide a printed-case photo. DELETE -> remove it.

import { NextRequest, NextResponse } from 'next/server'
import { requireCaseCraftSeller } from '@/lib/store-modules/casecraft/seller-api'
import { parsePrint } from '@/lib/store-modules/casecraft/prints'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCaseCraftSeller()
  if (!auth.ok) return auth.response
  const { id } = await params
  const parsed = parsePrint(await req.json().catch(() => null), true)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const { data, error } = await auth.db.from('casecraft_prints').update(parsed.value).eq('id', id).eq('seller_id', auth.seller.id).select('*').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  return NextResponse.json({ print: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCaseCraftSeller()
  if (!auth.ok) return auth.response
  const { id } = await params
  const { error } = await auth.db.from('casecraft_prints').delete().eq('id', id).eq('seller_id', auth.seller.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Its likes go with it.
  await auth.db.from('casecraft_likes').delete().eq('target_type', 'print').eq('target_id', id)
  return NextResponse.json({ ok: true })
}
