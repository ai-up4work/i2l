// app/api/admin/coupons/[couponId]/route.ts — Manager / Super Admin.
//   GET   -> coupon + who has it + every use (with order numbers)
//   PATCH -> { status?, endsAt?, title?, description?, totalLimit?, design? }
//            or { voidRedemptionId, reason } to give a use back (e.g. the
//            order was cancelled)

import { NextRequest, NextResponse } from 'next/server'
import { requireStaffRole } from '@/lib/supabase/admin-auth'
import { couponDetailForAdmin, db } from '@/lib/coupons/server'
import { normalizeDesign } from '@/lib/coupons/design'

export const runtime = 'nodejs'
const ROLES = ['manager', 'super_admin'] as const
type Params = { params: Promise<{ couponId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireStaffRole(ROLES)
  if (!auth.ok) return auth.response
  const { couponId } = await params
  const detail = await couponDetailForAdmin(auth.admin, couponId)
  if (!detail) return NextResponse.json({ error: 'Coupon not found.' }, { status: 404 })
  return NextResponse.json(detail)
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireStaffRole(ROLES)
  if (!auth.ok) return auth.response
  const { couponId } = await params
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

  if (typeof body.voidRedemptionId === 'string') {
    const { error } = await db(auth.admin)
      .from('coupon_redemptions')
      .update({
        status: 'voided',
        voided_at: new Date().toISOString(),
        void_reason: typeof body.reason === 'string' ? body.reason.slice(0, 200) : 'Given back by staff',
      })
      .eq('id', body.voidRedemptionId)
      .eq('coupon_id', couponId)
      .eq('status', 'redeemed')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.status === 'active' || body.status === 'paused' || body.status === 'archived') patch.status = body.status
  if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim().slice(0, 120)
  if (typeof body.description === 'string') patch.description = body.description.trim().slice(0, 300) || null
  if (body.design && typeof body.design === 'object') patch.design = normalizeDesign(body.design)
  if ('endsAt' in body) {
    if (body.endsAt === null || body.endsAt === '') patch.ends_at = null
    else if (typeof body.endsAt === 'string' && Number.isFinite(new Date(body.endsAt).getTime())) {
      patch.ends_at = new Date(body.endsAt).toISOString()
    } else return NextResponse.json({ error: 'Invalid end date.' }, { status: 400 })
  }
  if ('totalLimit' in body) {
    const n = Number(body.totalLimit)
    patch.total_limit = body.totalLimit === null || body.totalLimit === '' ? null : Number.isInteger(n) && n > 0 ? n : undefined
    if (patch.total_limit === undefined) return NextResponse.json({ error: 'Total uses must be a whole number.' }, { status: 400 })
  }
  const { error } = await db(auth.admin).from('coupons').update(patch).eq('id', couponId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
