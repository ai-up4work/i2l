// app/api/coupons/claim/route.ts — POST { token } -> add a shared coupon
// code (e.g. from a WhatsApp campaign) to the customer's account.

import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/current-user'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { claimCoupon, discountLabel } from '@/lib/coupons/server'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response
  const body = (await req.json().catch(() => ({}))) as { token?: unknown }
  if (typeof body.token !== 'string' || !body.token.trim()) {
    return NextResponse.json({ error: 'Paste a coupon code.' }, { status: 400 })
  }
  const result = await claimCoupon(createServiceRoleClient(), auth.userId, body.token)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ coupon: { title: result.coupon.title, label: discountLabel(result.coupon) } })
}
