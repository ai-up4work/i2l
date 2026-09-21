// app/api/account/whatsapp/send-code/route.ts
//
// First half of the WhatsApp OTP flow — see verify-code/route.ts's own
// header comment for why this exists instead of Supabase Auth's
// signInWithOtp/updateUser flows.
//
// FIX: this file used to contain a stray, near-identical copy of
// app/api/product-lookup/route.ts's scraper logic instead of anything
// related to phone verification — a real, pre-existing bug confirmed by
// grepping every write site for profiles.pending_phone: verify-code
// only ever sets it back to null on success, nothing ever set it to a
// real value, meaning no customer could have ever actually received a
// code. Rebuilt for real here.
//
// Generates a 6-digit code, writes it (hashed, never in plaintext) to
// the requesting user's own profile row as pending_phone /
// phone_otp_code_hash / phone_otp_expires_at, and sends it to their
// phone via an approved WhatsApp template message — free-form text
// isn't allowed here, since this is a business-initiated message to
// someone who hasn't necessarily messaged us in the last 24h (see
// sendTemplateMessage's own doc comment in lib/chat/whatsapp.ts).
//
// REQUIRES a real, Meta-approved AUTHENTICATION-category template,
// named by WHATSAPP_OTP_TEMPLATE_NAME (.env currently has this set to
// the literal placeholder "your_template_name" — that needs to become
// a real template's name once one exists and is approved in WhatsApp
// Manager). sendTemplateMessage only supports a plain body-text
// parameter today; if the approved template also requires the
// "Copy code" button component Meta's newer auth templates often use,
// that function needs a components:[{type:'button',...}] entry added
// alongside the body one — not needed for a body-only template.

import { NextRequest, NextResponse } from 'next/server'
import { createHash, randomInt } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { sendTemplateMessage } from '@/lib/chat/whatsapp'
import { normalizePhoneE164, e164ToWhatsAppDigits } from '@/lib/chat/phone'

// Same expiry window verify-code's own checks assume — long enough for
// a WhatsApp message to realistically arrive and be typed back in,
// short enough that a leaked/guessed code doesn't stay useful for long.
const CODE_EXPIRY_MINUTES = 10

// Don't let repeated "send code" clicks rack up outbound template sends
// (which cost money once past any free tier) — only block a resend
// while the PREVIOUS code is both unexpired and recent.
const RESEND_COOLDOWN_SECONDS = 60

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

function generateCode(): string {
  return String(randomInt(100000, 1000000)) // always 6 digits
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

  const rawPhone = (body.phone ?? '').trim()
  if (!rawPhone) {
    return NextResponse.json({ error: 'Enter a phone number.' }, { status: 400 })
  }
  const phoneE164 = normalizePhoneE164(rawPhone)
  if (!phoneE164) {
    return NextResponse.json({ error: "That doesn't look like a valid phone number." }, { status: 400 })
  }

  // Cooldown check — only blocks if there's a code that's both still
  // valid AND was issued within the cooldown window; an expired or
  // never-requested code leaves the customer free to request one now.
  const { data: existing } = await supabase
    .from('profiles')
    .select('phone_otp_expires_at')
    .eq('id', user.id)
    .maybeSingle()
  if (existing?.phone_otp_expires_at) {
    const msRemaining = new Date(existing.phone_otp_expires_at).getTime() - Date.now()
    const msSinceSent = CODE_EXPIRY_MINUTES * 60_000 - msRemaining
    if (msRemaining > 0 && msSinceSent < RESEND_COOLDOWN_SECONDS * 1000) {
      return NextResponse.json(
        { error: 'Please wait a moment before requesting another code.' },
        { status: 429 },
      )
    }
  }

  const code = generateCode()
  const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60_000).toISOString()

  const { error: writeError } = await supabase
    .from('profiles')
    .update({
      pending_phone: phoneE164,
      phone_otp_code_hash: hashCode(code),
      phone_otp_expires_at: expiresAt,
      phone_otp_attempts: 0,
    })
    .eq('id', user.id)
  if (writeError) {
    console.error('[whatsapp/send-code] failed to write pending code', writeError)
    return NextResponse.json({ error: 'Could not send a code right now. Please try again.' }, { status: 500 })
  }

  const templateName = process.env.WHATSAPP_OTP_TEMPLATE_NAME
  const templateLang = process.env.WHATSAPP_OTP_TEMPLATE_LANG ?? 'en_US'
  if (!templateName) {
    console.error('[whatsapp/send-code] WHATSAPP_OTP_TEMPLATE_NAME is not set')
    return NextResponse.json(
      { error: 'Phone verification is not set up yet. Please contact support.' },
      { status: 500 },
    )
  }

  try {
    await sendTemplateMessage(e164ToWhatsAppDigits(phoneE164), templateName, templateLang, [code])
  } catch (err) {
    console.error('[whatsapp/send-code] WhatsApp send failed', err)
    // Roll back the pending code rather than leave a request half-done
    // — there's no reason to keep a code "active" once we know for
    // certain it was never actually delivered.
    await supabase
      .from('profiles')
      .update({ pending_phone: null, phone_otp_code_hash: null, phone_otp_expires_at: null, phone_otp_attempts: 0 })
      .eq('id', user.id)
    return NextResponse.json(
      { error: "Couldn't send the code over WhatsApp. Please try again." },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true })
}
