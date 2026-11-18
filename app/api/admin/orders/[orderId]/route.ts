// app/api/admin/orders/[orderId]/route.ts
//
// DELETE — permanently delete one order (Manager and Super Admin only).
//
// Done on the server, and checked, because the admin screen used to remove
// the order from its own list first and fire the database delete without
// looking at the answer. When the database refused (or only part of the
// order's data went), staff saw nothing while the customer still saw the
// order. Now the screen only drops the order once this route says it's gone.
//
// Uses public.admin_delete_order (data/wishdrop-delete-order.sql), which
// removes the order together with its purchases, QC issues, stock-movement
// lines, the customer's notifications about it, and its checkout when no other
// order uses it — in one transaction. If that SQL hasn't been run yet, falls
// back to deleting just the order row (and still reports failures honestly).
//
// Paid or refunded orders are refused by the database.

import { NextRequest, NextResponse } from 'next/server'
import { requireStaffRole } from '@/lib/supabase/admin-auth'

export const runtime = 'nodejs'

type Params = { params: Promise<{ orderId: string }> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requireStaffRole(['manager', 'super_admin'])
  if (!auth.ok) return auth.response
  const { admin } = auth

  const { orderId } = await params
  if (!UUID.test(orderId)) return NextResponse.json({ error: 'Invalid order.' }, { status: 400 })

  const { data, error } = await admin.rpc('admin_delete_order' as never, { p_order_id: orderId } as never)

  if (!error) {
    const result = (data ?? {}) as { deleted?: boolean; reason?: string }
    // "not_found" means it's already gone, which is what the caller wanted.
    return NextResponse.json({ ok: true, ...result })
  }

  // The function isn't installed yet: delete the order row itself.
  const missing = error.code === 'PGRST202' || error.code === '42883' || /admin_delete_order/i.test(error.message)
  if (!missing) {
    console.error('[admin/orders] delete failed', error)
    return NextResponse.json({ error: error.message }, { status: error.code === 'P0001' ? 409 : 500 })
  }

  const { data: removed, error: deleteError } = await admin.from('orders').delete().eq('id', orderId).select('id')
  if (deleteError) {
    console.error('[admin/orders] fallback delete failed', deleteError)
    return NextResponse.json({ error: deleteError.message }, { status: deleteError.code === 'P0001' ? 409 : 500 })
  }
  return NextResponse.json({
    ok: true,
    deleted: (removed?.length ?? 0) > 0,
    partial: true,
    note: 'Order deleted, but data/wishdrop-delete-order.sql has not been run, so its checkout and notifications were left in place.',
  })
}
