// app/api/seller/casecraft/designs/[id]/route.ts
// PATCH -> edit a design (any fields). DELETE -> remove it. Past orders
// keep the design's name.

import { NextRequest, NextResponse } from 'next/server'
import { requireCaseCraftSeller } from '@/lib/store-modules/casecraft/seller-api'
import { parseDesign } from '@/lib/store-modules/casecraft/designs'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCaseCraftSeller()
  if (!auth.ok) return auth.response
  const { id } = await params
  const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null
  // Changing models needs the case type to check them against.
  if (raw && raw.models !== undefined && raw.case_type === undefined) {
    const { data: cur } = await auth.db.from('casecraft_designs').select('case_type').eq('id', id).eq('seller_id', auth.seller.id).maybeSingle()
    if (cur) raw.case_type = (cur as { case_type: string }).case_type
  }
  const parsed = parseDesign(raw, true)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const { data, error } = await auth.db
    .from('casecraft_designs')
    .update({ ...parsed.value, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('seller_id', auth.seller.id)
    .select('*')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Design not found.' }, { status: 404 })
  return NextResponse.json({ design: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCaseCraftSeller()
  if (!auth.ok) return auth.response
  const { id } = await params
  const { error } = await auth.db.from('casecraft_designs').delete().eq('id', id).eq('seller_id', auth.seller.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
