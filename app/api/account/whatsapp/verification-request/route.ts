// app/api/account/whatsapp/verification-request/route.ts
//
// Customer side of staff-reviewed WhatsApp verification
// (data/wishdrop-whatsapp-manual-verification.sql).
//
// GET    — current state: verified number (if any), latest request, and a
//          suggested number (from their most recent delivery address).
// POST   — { phone } start a request; returns the pre-written WhatsApp
//          message + wa.me link to send it.
// DELETE — cancel the open request.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { deriveHandle, formatHandle } from '@/lib/chat/waLink'
import {
  newVerificationReference,
  normalizeWhatsAppNumber,
  verificationMessage,
  verificationWhatsAppLink,
} from '@/lib/whatsapp/verification'

export const runtime = 'nodejs'

const MAX_REQUESTS_PER_DAY = 5

async function currentUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

type Admin = ReturnType<typeof createServiceRoleClient>

async function loadProfile(admin: Admin, userId: string) {
  const { data } = await admin
    .from('profiles')
    .select('full_name, email, phone, phone_verified, chat_handle')
    .eq('id', userId)
    .maybeSingle()
  return data
}

function publicRequest(r: {
  id: string
  phone: string
  reference: string
  status: string
  reject_reason: string | null
  verified_phone: string | null
  created_at: string
  decided_at: string | null
}) {
  return {
    id: r.id,
    phone: r.phone,
    reference: r.reference,
    status: r.status,
    rejectReason: r.reject_reason,
    verifiedPhone: r.verified_phone,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
  }
}

function messageFor(
  profile: { full_name: string; email: string; chat_handle: string | null },
  reference: string,
  phone: string,
) {
  const message = verificationMessage({
    reference,
    name: profile.full_name,
    email: profile.email,
    handle: formatHandle(profile.chat_handle) ?? (profile.full_name ? deriveHandle(profile.full_name) : null),
    phone,
  })
  return { message, link: verificationWhatsAppLink(message) }
}

export async function GET() {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const admin = createServiceRoleClient()

  const [profile, { data: latest }, { data: address }] = await Promise.all([
    loadProfile(admin, user.id),
    admin
      .from('whatsapp_verification_requests')
      .select('id, phone, reference, status, reject_reason, verified_phone, created_at, decided_at')
      .eq('user_id', user.id)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('addresses')
      .select('phone')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const verifiedPhone = profile?.phone_verified && profile.phone ? profile.phone : null
  const pending = latest?.status === 'pending' ? latest : null

  return NextResponse.json({
    verifiedPhone,
    request: latest ? publicRequest(latest) : null,
    // Re-supply the message/link for a pending request so "Open WhatsApp
    // again" works after a page reload.
    ...(pending && profile ? messageFor(profile, pending.reference, pending.phone) : {}),
    suggestedPhone: address?.phone ? normalizeWhatsAppNumber(address.phone) : null,
  })
}

export async function POST(req: NextRequest) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  let body: { phone?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 })
  }
  const phone = normalizeWhatsAppNumber(body.phone ?? '')
  if (!phone) {
    return NextResponse.json(
      { error: 'Enter a valid mobile number, e.g. 077 123 4567 (or +91… / +44… for other countries).' },
      { status: 400 },
    )
  }

  const admin = createServiceRoleClient()
  const profile = await loadProfile(admin, user.id)
  if (!profile) return NextResponse.json({ error: 'Profile not found.' }, { status: 404 })

  if (profile.phone_verified && profile.phone === phone) {
    return NextResponse.json({ error: 'This number is already verified on your account.' }, { status: 400 })
  }

  const { data: owner } = await admin
    .from('profiles')
    .select('id')
    .eq('phone', phone)
    .neq('id', user.id)
    .limit(1)
    .maybeSingle()
  if (owner) {
    return NextResponse.json(
      { error: 'This number is already linked to another WishDrop account. Contact support if it’s yours.' },
      { status: 409 },
    )
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count } = await admin
    .from('whatsapp_verification_requests')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', since)
  if ((count ?? 0) >= MAX_REQUESTS_PER_DAY) {
    return NextResponse.json(
      { error: 'Too many attempts today. Please try again tomorrow, or message us on WhatsApp.' },
      { status: 429 },
    )
  }

  // Replace any open request (e.g. they're correcting a typo).
  await admin
    .from('whatsapp_verification_requests')
    .update({ status: 'cancelled', decided_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('status', 'pending')

  let inserted = null
  for (let attempt = 0; attempt < 3 && !inserted; attempt++) {
    const { data, error } = await admin
      .from('whatsapp_verification_requests')
      .insert({ user_id: user.id, phone, reference: newVerificationReference() })
      .select('id, phone, reference, status, reject_reason, verified_phone, created_at, decided_at')
      .single()
    if (!error) inserted = data
    else if (error.code !== '23505') {
      console.error('[whatsapp verification] insert failed', error)
      break
    }
  }
  if (!inserted) return NextResponse.json({ error: 'Could not start verification. Try again.' }, { status: 500 })

  return NextResponse.json({ request: publicRequest(inserted), ...messageFor(profile, inserted.reference, phone) })
}

export async function DELETE() {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const admin = createServiceRoleClient()
  await admin
    .from('whatsapp_verification_requests')
    .update({ status: 'cancelled', decided_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('status', 'pending')
  return NextResponse.json({ ok: true })
}
