// app/api/account/whatsapp/send-code/route.ts
//
// Replaces Supabase Auth's phone_change OTP for this one flow — see
// lib/phone.ts and AuthContext.tsx's own comments for exactly why:
// updateUser()'s phone-change flow has no `channel` option in the
// installed @supabase/supabase-js, only `signInWithOtp()` does, and
// that's a sign-in flow, not "verify and attach a phone to my existing
// account." This generates its own 6-digit code and delivers it over
// WhatsApp via this app's existing Cloud API integration
// (lib/chat/whatsapp.ts) instead.
//
// Requires a WhatsApp Business "Authentication" category template,
// approved in Meta's WhatsApp Manager, since this is a business-
// initiated message and the customer very likely has no open 24-hour
// conversation window with WishDrop's WhatsApp number yet (this may be
// the very first message they ever get from it) — sendTextMessage()
// would be rejected by Meta outside that window; only an approved
// template can be sent cold. Configure via:
//   WHATSAPP_OTP_TEMPLATE_NAME  – the approved template's name
//   WHATSAPP_OTP_TEMPLATE_LANG  – its approved language code, e.g. "en_US"
// The template must have exactly one body variable (the code).

import { NextRequest, NextResponse } from 'next/server'
import { createHash, randomInt } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { normalizeSriLankanMobile } from '@/lib/phone'
import { sendTemplateMessage } from '@/lib/chat/whatsapp'

const CODE_TTL_MINUTES = 5
// Same length as the SMS OTP flow this replaces — long enough to not be
// guessable within the short attempt-limited window (see verify-code),
// short enough to type comfortably off a WhatsApp notification.
const CODE_LENGTH = 6

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: { phone?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 })
  }

  // Re-validate server-side — the client (lib/phone.ts) already does
  // this too, but a request body is never trusted just because the UI
  // that built it happened to check first.
  const normalized = normalizeSriLankanMobile(body.phone ?? '')
  if (!normalized) {
    return NextResponse.json({ error: 'Enter a valid Sri Lankan mobile number.' }, { status: 400 })
  }

  const templateName = process.env.WHATSAPP_OTP_TEMPLATE_NAME
  const templateLang = process.env.WHATSAPP_OTP_TEMPLATE_LANG
  if (!templateName || !templateLang) {
    // Fails loudly rather than silently "succeeding" with no message
    // ever actually sent — see this file's header for the setup step
    // this depends on.
    console.error('[whatsapp/send-code] WHATSAPP_OTP_TEMPLATE_NAME/LANG not configured')
    return NextResponse.json(
      { error: "We can't send verification codes right now — please try again later or contact support." },
      { status: 500 },
    )
  }

  const code = randomInt(0, 10 ** CODE_LENGTH).toString().padStart(CODE_LENGTH, '0')
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString()

  // Written before the send attempt: if the WhatsApp API call itself
  // fails, failing the request is enough — there's no reason a failed
  // send should also leave stale, un-attemptable OTP state behind, but
  // there's also no reason it shouldn't be able to overwrite whatever
  // was pending before, so order here doesn't matter much. Kept before
  // the send for one real reason: if the process crashes between the
  // two calls, the customer sees "check your WhatsApp" state that never
  // actually got a message — sending first, then recording, would risk
  // the opposite (a message that arrives with nothing here to check it
  // against). Neither ordering is perfect without a transaction spanning
  // an external API call, which isn't possible; this is the safer
  // failure mode of the two.
  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      pending_phone: normalized,
      phone_otp_code_hash: hashCode(code),
      phone_otp_expires_at: expiresAt,
      phone_otp_attempts: 0,
    })
    .eq('id', user.id)
  if (updateError) {
    console.error('[whatsapp/send-code] failed to record pending OTP', updateError)
    return NextResponse.json({ error: 'Could not start verification. Please try again.' }, { status: 500 })
  }

  try {
    // Cloud API wants digits only, no leading '+' — see
    // lib/chat/whatsapp.ts's own comment on sendTextMessage for why.
    const toDigitsOnly = normalized.replace('+', '')
    await sendTemplateMessage(toDigitsOnly, templateName, templateLang, [code])
  } catch (err) {
    console.error('[whatsapp/send-code] WhatsApp send failed', err)
    return NextResponse.json(
      { error: "We couldn't send a code to that number. Double-check it's a WhatsApp number and try again." },
      { status: 502 },
    )
  }

  return NextResponse.json({ ok: true })
}