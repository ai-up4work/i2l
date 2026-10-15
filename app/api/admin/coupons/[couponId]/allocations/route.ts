// app/api/admin/coupons/[couponId]/allocations/route.ts — Manager / Super Admin.
//   POST   { userIds }        -> give the coupon to more customers
//   DELETE { allocationId }   -> take it back from one customer (unused uses only)

import { NextRequest, NextResponse } from 'next/server'
import { requireStaffRole } from '@/lib/supabase/admin-auth'
import { staffName } from '@/lib/supabase/staff-name'
import { allocateCoupon, db } from '@/lib/coupons/server'

export const runtime = 'nodejs'
const ROLES = ['manager', 'super_admin'] as const
type Params = { params: Promise<{ couponId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireStaffRole(ROLES)
  if (!auth.ok) return auth.response
  const { couponId } = await params
  const body = (await req.json().catch(() => ({}))) as { userIds?: unknown }
  const userIds = Array.isArray(body.userIds) ? body.userIds.filter((u): u is string => typeof u === 'string') : []
  if (userIds.length === 0) return NextResponse.json({ error: 'Pick at least one customer.' }, { status: 400 })
  const added = await allocateCoupon(auth.admin, couponId, userIds.slice(0, 5000), 'admin', {
    staffId: auth.staffId,
    name: await staffName(auth.admin, auth.staffId),
  })
  return NextResponse.json({ added })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireStaffRole(ROLES)
  if (!auth.ok) return auth.response
  const { couponId } = await params
  const body = (await req.json().catch(() => ({}))) as { allocationId?: unknown }
  if (typeof body.allocationId !== 'string') return NextResponse.json({ error: 'Missing allocation.' }, { status: 400 })
  const { error } = await db(auth.admin)
    .from('coupon_allocations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', body.allocationId)
    .eq('coupon_id', couponId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
