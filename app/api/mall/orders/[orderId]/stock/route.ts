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
import { isMallLineUrl, resolveMallLines } from '@/lib/wishdrop-mall/order-lines'

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

  const { data: items, error } = await admin
    .from('order_items')
    .select('id, store_url, quantity')
    .eq('order_id', orderId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const mallItems = ((items ?? []) as { id: string; store_url: string | null; quantity: number }[]).filter((i) =>
    isMallLineUrl(i.store_url),
  )
  if (mallItems.length === 0) return NextResponse.json({ applied: 0, shortages: [] })

  const resolved = await resolveMallLines(admin, mallItems.map((i) => i.store_url as string))
  let applied = 0
  const shortages: { productId: string; variantId: string | null; shortage: number }[] = []

  for (const item of mallItems) {
    const line = resolved.get(item.store_url as string)
    if (!line) continue
    const { data, error: rpcError } = await admin.rpc('mall_deduct_stock', {
      p_product_id: line.productId,
      p_variant_id: line.variantId,
      p_quantity: item.quantity,
      p_order_id: orderId,
      p_order_item_id: item.id,
    })
    if (rpcError) {
      console.error('[mall stock] deduct failed', item.id, rpcError.message)
      continue
    }
    const row = (data ?? [])[0]
    if (row?.applied) applied++
    if (row?.shortage) shortages.push({ productId: line.productId, variantId: line.variantId, shortage: row.shortage })
  }

  return NextResponse.json({ applied, shortages })
}
