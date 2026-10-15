// app/api/admin/coupons/route.ts — Manager / Super Admin.
//   GET  ?all=1  -> coupons (all=1 also lists referral / compensation ones)
//   POST         -> create a coupon; optional `userIds` gives it to those
//                   customers straight away (audience "selected")

import { NextRequest, NextResponse } from 'next/server'
import { requireStaffRole } from '@/lib/supabase/admin-auth'
import { staffName } from '@/lib/supabase/staff-name'
import { allocateCoupon, createCoupon, listCouponsForAdmin, validateCouponInput } from '@/lib/coupons/server'

export const runtime = 'nodejs'
const ROLES = ['manager', 'super_admin'] as const

export async function GET(req: NextRequest) {
  const auth = await requireStaffRole(ROLES)
  if (!auth.ok) return auth.response
  try {
    const coupons = await listCouponsForAdmin(auth.admin, { includeSystem: req.nextUrl.searchParams.get('all') === '1' })
    return NextResponse.json({ coupons })
  } catch (err) {
    console.error('[admin/coupons]', err)
    return NextResponse.json(
      { error: 'Couldn’t load coupons. Has data/wishdrop-coupons-referrals-payments.sql been run?' },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireStaffRole(ROLES)
  if (!auth.ok) return auth.response
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const input = validateCouponInput(body)
  if ('error' in input) return NextResponse.json({ error: input.error }, { status: 400 })

  const userIds = Array.isArray(body.userIds) ? (body.userIds as unknown[]).filter((u): u is string => typeof u === 'string') : []
  if (input.audience === 'selected' && userIds.length === 0) {
    return NextResponse.json({ error: 'Pick at least one customer for this coupon.' }, { status: 400 })
  }

  const actor = { staffId: auth.staffId, name: await staffName(auth.admin, auth.staffId) }
  const coupon = await createCoupon(auth.admin, input, 'admin', actor)
  if (userIds.length) await allocateCoupon(auth.admin, coupon.id, userIds.slice(0, 5000), 'admin', actor)
  return NextResponse.json({ coupon })
}
