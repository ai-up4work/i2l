// app/api/seller/casecraft/orders/route.ts
// GET ?status=new|...|all -> this store's print jobs, newest first, plus
// counts per status. The seller sees their own price, not the margin.

import { NextRequest, NextResponse } from 'next/server'
import { requireCaseCraftSeller } from '@/lib/store-modules/casecraft/seller-api'
import { isMissingTable } from '@/lib/store-modules/casecraft/server'
import { ORDER_STATUSES } from '@/lib/store-modules/casecraft/settings'

export const dynamic = 'force-dynamic'

const SELLER_COLUMNS =
  'id, ref, kind, case_type, case_label, model_label, template, design_id, design_name, photo_url, print_url, preview_url, quantity, seller_unit_lkr, unit_price_lkr, delivery_fee_lkr, total_lkr, customer, payment_method, status, seller_note, tracking, created_at, updated_at'

export async function GET(req: NextRequest) {
  const auth = await requireCaseCraftSeller()
  if (!auth.ok) return auth.response
  const status = req.nextUrl.searchParams.get('status') ?? 'all'

  let q = auth.db.from('casecraft_orders').select(SELLER_COLUMNS).eq('seller_id', auth.seller.id).order('created_at', { ascending: false }).limit(300)
  if (status === 'open') q = q.in('status', ['new', 'confirmed', 'printing'])
  else if (ORDER_STATUSES.some((s) => s.id === status)) q = q.eq('status', status)

  const [{ data, error }, counts] = await Promise.all([
    q,
    auth.db.from('casecraft_orders').select('status').eq('seller_id', auth.seller.id).limit(5000),
  ])
  if (error) {
    return NextResponse.json({ orders: [], counts: {}, needsMigration: isMissingTable(error) }, { headers: { 'Cache-Control': 'no-store' } })
  }
  const tally: Record<string, number> = {}
  for (const r of (counts.data ?? []) as { status: string }[]) tally[r.status] = (tally[r.status] ?? 0) + 1
  return NextResponse.json({ orders: data ?? [], counts: tally, needsMigration: false }, { headers: { 'Cache-Control': 'no-store' } })
}
