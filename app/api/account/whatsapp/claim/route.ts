// app/api/account/whatsapp/claim/route.ts
//
// POST { phone, consent?, explicit? } — a signed-in customer gives their WhatsApp number (the
// optional field on the sign-up form). Saved as "given, not verified":
// profiles.phone only, never phone_verified. Verification still goes
// through the normal review flow. From sign-up (explicit not set) it is
// ignored when they already have a number saved. From the chat box
// (explicit + consent: true) it also replaces an unverified number and
// records when they agreed to be messaged on WhatsApp.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { normalizeWhatsAppNumber } from '@/lib/whatsapp/verification'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as { phone?: string; consent?: boolean; explicit?: boolean } | null
  const phone = body?.phone ? normalizeWhatsAppNumber(body.phone) : null
  if (!phone) return NextResponse.json({ error: 'That number isn’t valid.' }, { status: 400 })

  const explicit = body?.explicit === true
  if (explicit && body?.consent !== true) {
    return NextResponse.json({ error: 'Please tick the box to agree to be messaged on WhatsApp.' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createServiceRoleClient() as any
  const { data: profile } = await admin.from('profiles').select('phone, phone_verified').eq('id', user.id).maybeSingle()
  if (!profile) return NextResponse.json({ error: 'Profile not found.' }, { status: 404 })
  if (profile.phone_verified && profile.phone) return NextResponse.json({ ok: true, ignored: true, verified: true })
  if (!explicit && profile.phone) return NextResponse.json({ ok: true, ignored: true })

  const update: Record<string, unknown> = { phone }
  if (explicit) update.whatsapp_consent_at = new Date().toISOString()
  let { error } = await admin.from('profiles').update(update).eq('id', user.id)
  if (error && /whatsapp_consent_at/.test(error.message)) {
    // data/wishdrop-whatsapp-consent.sql not run yet: still save the number.
    ;({ error } = await admin.from('profiles').update({ phone }).eq('id', user.id))
  }
  if (error) return NextResponse.json({ error: 'Could not save your number. Try again.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
