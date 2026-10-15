// app/api/mall/orders/[orderId]/stock/route.ts
//
// POST -> deduct Wishdrop Mall stock for an order that was just placed.
//
// Called by checkout right after the order and its items are saved. It
// trusts nothing from the browser except the order id: it checks the
// order belongs to the signed-in customer, then reads the order's OWN
// item rows (quantity + store_url) and deducts through
// mall_deduct_stock(), which is atomic and refuses to deduct the same
// order item twice — so retries or a double-submit can't double-count.
//
// If someone else bought the last unit between the pre-check and now,
// stock stops at 0 and the shortage is recorded in mall_stock_movements
// (shortage > 0) for staff to resolve.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { deductMallStockForOrder } from '@/lib/wishdrop-mall/stock'

type Params = { params: Promise<{ orderId: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  const { orderId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const admin = createServiceRoleClient()
  const { data: order } = await admin.from('orders').select('id, user_id').eq('id', orderId).maybeSingle()
  if (!order || (order as { user_id: string }).user_id !== user.id) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  }

  try {
    return NextResponse.json(await deductMallStockForOrder(admin, orderId))
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
