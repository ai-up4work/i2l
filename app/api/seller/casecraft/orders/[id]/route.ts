// app/api/seller/casecraft/orders/[id]/route.ts
// PATCH { status?, sellerNote?, tracking? } -> update a print job.

import { NextRequest, NextResponse } from 'next/server'
import { requireCaseCraftSeller } from '@/lib/store-modules/casecraft/seller-api'
import { ORDER_STATUSES } from '@/lib/store-modules/casecraft/settings'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCaseCraftSeller()
  if (!auth.ok) return auth.response
  const { id } = await params
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b) return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 })

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (b.status !== undefined) {
    if (!ORDER_STATUSES.some((s) => s.id === b.status)) return NextResponse.json({ error: 'Unknown status.' }, { status: 400 })
    update.status = b.status
  }
  if (b.sellerNote !== undefined) update.seller_note = typeof b.sellerNote === 'string' ? b.sellerNote.trim().slice(0, 1000) || null : null
  if (b.tracking !== undefined) update.tracking = typeof b.tracking === 'string' ? b.tracking.trim().slice(0, 200) || null : null

  const { data, error } = await auth.db
    .from('casecraft_orders')
    .update(update)
    .eq('id', id)
    .eq('seller_id', auth.seller.id)
    .select('id, status, seller_note, tracking, updated_at')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  return NextResponse.json({ order: data })
}
