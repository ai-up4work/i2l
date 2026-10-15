// app/api/referrals/attach/route.ts — POST: link the signed-in customer to
// the friend who referred them (code from the body, or the cookie set by
// /r/<code>). Safe to call on every visit: it does nothing once attached
// or when there's no code. Clears the cookie either way.

import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/current-user'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { REFERRAL_COOKIE, attachReferral } from '@/lib/referrals/server'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response
  const body = (await req.json().catch(() => ({}))) as { code?: unknown }
  const code = (typeof body.code === 'string' && body.code) || req.cookies.get(REFERRAL_COOKIE)?.value || ''
  if (!code) return NextResponse.json({ attached: false })

  let result
  try {
    result = await attachReferral(createServiceRoleClient(), auth.userId, code)
  } catch (err) {
    console.error('[referrals/attach]', err)
    return NextResponse.json({ attached: false }, { status: 500 })
  }
  const res = NextResponse.json(result)
  res.cookies.delete(REFERRAL_COOKIE)
  return res
}
