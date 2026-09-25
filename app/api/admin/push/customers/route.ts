// app/api/admin/push/customers/route.ts
//
// GET ?q=… — find customers by name, email, phone or order number, for
// picking specific recipients on /admin/broadcasts. Returns at most 10,
// with whether each one has push turned on on any device.

import { NextRequest, NextResponse } from 'next/server'
import { requireStaffRole } from '@/lib/supabase/admin-auth'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const auth = await requireStaffRole(['manager', 'super_admin'])
  if (!auth.ok) return auth.response
  const { admin } = auth

  // Strip characters that have meaning inside PostgREST's or() filter.
  const q = (req.nextUrl.searchParams.get('q') ?? '').replace(/[,()*%\\]/g, ' ').trim().slice(0, 80)
  if (q.length < 2) return NextResponse.json({ customers: [] })

  const ids = new Set<string>()

  const { data: profiles, error } = await admin
    .from('profiles')
    .select('id')
    .or(`full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`)
    .limit(10)
  if (error) {
    console.error('[push/customers] search failed', error)
    return NextResponse.json({ error: 'Search failed.' }, { status: 500 })
  }
  profiles?.forEach((p) => ids.add(p.id))

  // "WD-10423" → that order's customer.
  if (/^wd-?\d+$/i.test(q)) {
    const displayId = q.toUpperCase().replace(/^WD-?/, 'WD-')
    const { data: order } = await admin.from('orders').select('user_id').eq('display_id', displayId).maybeSingle()
    if (order?.user_id) ids.add(order.user_id)
  }

  if (!ids.size) return NextResponse.json({ customers: [] })
  const idList = [...ids].slice(0, 10)

  const [{ data: rows }, { data: subs }, { data: staff }] = await Promise.all([
    admin.from('profiles').select('id, full_name, email, phone').in('id', idList),
    admin.from('push_subscriptions').select('user_id').in('user_id', idList),
    admin.from('staff_accounts').select('user_id').in('user_id', idList),
  ])
  const withPush = new Set((subs ?? []).map((s) => s.user_id))
  const staffIds = new Set((staff ?? []).map((s) => s.user_id))

  return NextResponse.json({
    customers: (rows ?? [])
      .filter((r) => !staffIds.has(r.id))
      .map((r) => ({
        id: r.id,
        name: r.full_name,
        email: r.email,
        phone: r.phone,
        pushEnabled: withPush.has(r.id),
      })),
  })
}
