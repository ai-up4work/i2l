// app/r/[code]/route.ts — a referral link (https://<site>/r/<code>).
//
// Remembers the code in a cookie for 30 days and sends the visitor to sign
// up. Once they have an account, the account area calls
// /api/referrals/attach, which reads the cookie and links them to whoever
// shared the link (lib/referrals/server.ts).

import { NextRequest, NextResponse } from 'next/server'
import { REFERRAL_COOKIE, normalizeCode } from '@/lib/referrals/server'

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const clean = normalizeCode(decodeURIComponent(code))
  const target = new URL('/auth/signup', req.nextUrl.origin)
  target.searchParams.set('ref', clean)
  const res = NextResponse.redirect(target)
  if (clean.length >= 4) {
    res.cookies.set(REFERRAL_COOKIE, clean, {
      maxAge: 60 * 60 * 24 * 30,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    })
  }
  return res
}
