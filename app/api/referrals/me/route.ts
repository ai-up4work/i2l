// app/api/referrals/me/route.ts — GET the customer's referral code, link,
// rewards on offer and the friends who joined with their link.

import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/current-user'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { referralsForCustomer } from '@/lib/referrals/server'

export const runtime = 'nodejs'

export async function GET() {
  const auth = await requireUser()
  if (!auth.ok) return auth.response
  try {
    return NextResponse.json(await referralsForCustomer(createServiceRoleClient(), auth.userId))
  } catch (err) {
    console.error('[referrals/me]', err)
    return NextResponse.json({ error: 'Couldn’t load your referrals.' }, { status: 500 })
  }
}
