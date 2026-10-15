// app/api/coupons/route.ts — GET the signed-in customer's coupons (My
// coupons page), each with a code bound to their account.

import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/current-user'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { listCustomerCoupons } from '@/lib/coupons/server'

export const runtime = 'nodejs'

export async function GET() {
  const auth = await requireUser()
  if (!auth.ok) return auth.response
  try {
    const coupons = await listCustomerCoupons(createServiceRoleClient(), auth.userId)
    return NextResponse.json({ coupons })
  } catch (err) {
    console.error('[coupons]', err)
    return NextResponse.json({ error: 'Couldn’t load your coupons.' }, { status: 500 })
  }
}
