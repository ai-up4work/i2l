// app/api/admin/coupons/compensation/route.ts — staff (QC issues).
// POST { userId, amountLKR, orderDisplayId } -> a one-use coupon worth the
// faulty item, valid 90 days, given to that customer. Replaces the old
// browser-side insert into personal_coupons.

import { NextRequest, NextResponse } from 'next/server'
import { requireStaffRole } from '@/lib/supabase/admin-auth'
import { staffName } from '@/lib/supabase/staff-name'
import { db, issuePersonalCoupon } from '@/lib/coupons/server'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const auth = await requireStaffRole(['manager', 'warehouse', 'super_admin'])
  if (!auth.ok) return auth.response
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const userId = typeof body.userId === 'string' ? body.userId : ''
  const amount = Math.round(Number(body.amountLKR))
  const orderDisplayId = typeof body.orderDisplayId === 'string' ? body.orderDisplayId.slice(0, 40) : 'your order'
  if (!userId || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Missing customer or amount.' }, { status: 400 })
  }
  const { coupon, token } = await issuePersonalCoupon(
    auth.admin,
    userId,
    {
      title: `Compensation for ${orderDisplayId}`,
      description: 'One item didn’t pass our quality check. Use this on your next order.',
      discountType: 'fixed',
      discountValue: amount,
      maxDiscountLKR: null,
      minOrderLKR: 0,
      endsAt: null,
      validDays: 90,
    },
    'compensation',
    'compensation',
    { staffId: auth.staffId, name: await staffName(auth.admin, auth.staffId) },
  )
  await db(auth.admin).from('notifications').insert({
    user_id: userId,
    type: 'qc_issue',
    title: 'A replacement coupon is waiting for you',
    body: `One item from order ${orderDisplayId} didn't pass quality check. We've added a Rs. ${amount.toLocaleString('en-LK')} coupon to your account — use it on your next order.`,
    link: '/account/coupons',
  })
  return NextResponse.json({ couponId: coupon.id, token })
}
