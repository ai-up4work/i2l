// app/api/account/whatsapp/verify-code/route.ts
//
// Second half of the WhatsApp OTP flow — see send-code/route.ts's own
// header comment for why this exists instead of Supabase Auth's
// verifyOtp({ type: 'phone_change' }).
//
// On a correct code: writes profiles.phone/phone_verified (what the
// admin chat panel, WhatsApp integration, and everything else in this
// app that isn't Supabase Auth itself actually reads), AND syncs
// auth.users' own phone/phone_confirmed_at via the service-role client
// — matching what the OLD verifyOtp-based flow did to auth.users, so
// nothing that happens to read the Auth-level field directly silently
// stops working. The auth.users sync is best-effort: if it fails, the
// customer-facing verification still succeeded (profiles is what
// actually matters app-wide), so it's logged rather than surfaced as a
// failure.

import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

// Same rationale as most login-adjacent rate limits: bounds how many
// guesses a 6-digit code can take before forcing a fresh send (and thus
// a fresh, unguessed code), rather than letting an unlimited number of
// attempts run against one static code until its 5-minute expiry.
const MAX_ATTEMPTS = 5

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: { code?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 })
  }
  const submittedCode = (body.code ?? '').trim()
  if (!submittedCode) {
    return NextResponse.json({ error: 'Enter the code we sent you.' }, { status: 400 })
  }

  const { data: profile, error: fetchError } = await supabase
    .from('profiles')
    .select('pending_phone, phone_otp_code_hash, phone_otp_expires_at, phone_otp_attempts')
    .eq('id', user.id)
    .maybeSingle()
  if (fetchError || !profile) {
    return NextResponse.json({ error: 'Could not verify right now. Please try again.' }, { status: 500 })
  }

  if (!profile.pending_phone || !profile.phone_otp_code_hash || !profile.phone_otp_expires_at) {
    return NextResponse.json({ error: 'Request a new code first.' }, { status: 400 })
  }
  if (new Date(profile.phone_otp_expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'That code has expired. Request a new one.' }, { status: 400 })
  }
  if (profile.phone_otp_attempts >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: 'Too many attempts. Request a new code.' }, { status: 429 })
  }

  if (hashCode(submittedCode) !== profile.phone_otp_code_hash) {
    // Best-effort increment — if this write fails, the worst case is one
    // ungated extra guess, not a security-critical gap given the code
    // still expires in a few minutes either way.
    await supabase
      .from('profiles')
      .update({ phone_otp_attempts: profile.phone_otp_attempts + 1 })
      .eq('id', user.id)
    return NextResponse.json({ error: 'Incorrect code. Please try again.' }, { status: 400 })
  }

  const verifiedPhone = profile.pending_phone
  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      phone: verifiedPhone,
      phone_verified: true,
      pending_phone: null,
      phone_otp_code_hash: null,
      phone_otp_expires_at: null,
      phone_otp_attempts: 0,
    })
    .eq('id', user.id)
  if (updateError) {
    console.error('[whatsapp/verify-code] failed to write verified phone', updateError)
    return NextResponse.json({ error: 'Could not save your verified number. Please try again.' }, { status: 500 })
  }

  // Best-effort sync to auth.users — see this file's header comment.
  try {
    const admin = createServiceRoleClient()
    const { error: authError } = await admin.auth.admin.updateUserById(user.id, {
      phone: verifiedPhone,
      phone_confirm: true,
    })
    if (authError) console.error('[whatsapp/verify-code] auth.users sync failed', authError)
  } catch (err) {
    console.error('[whatsapp/verify-code] auth.users sync threw', err)
  }

  return NextResponse.json({ ok: true, phone: verifiedPhone })
}