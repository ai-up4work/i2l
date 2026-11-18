// app/api/admin/customers/phone/route.ts
//
// Staff attach a WhatsApp number to a customer account by hand — e.g. the
// customer messaged us on WhatsApp / website chat, we read their number from
// the message, and they already have an account.
//
// GET  ?q=<number or pasted WhatsApp text>
//        -> the number(s) found, and any accounts that already hold them.
// POST { userId, phone? , text?, verified?: boolean (default true), replace?: boolean }
//        -> saves the number on the account. verified=true also marks it
//           verified (profiles + auth, the same as the review flow); false
//           saves it as "given, not verified yet".
//
// Manager, Sales and Super Admin.

import { NextRequest, NextResponse } from 'next/server'
import { requireStaffRole } from '@/lib/supabase/admin-auth'
import { extractPhoneNumbers } from '@/lib/whatsapp/extract-phone'
import { formatPhone, normalizeWhatsAppNumber } from '@/lib/whatsapp/verification'
import { logAuditEvent } from '@/lib/audit-event'

export const runtime = 'nodejs'
const ROLES = ['manager', 'sales', 'super_admin'] as const

export async function GET(req: NextRequest) {
  const auth = await requireStaffRole(ROLES)
  if (!auth.ok) return auth.response
  const q = new URL(req.url).searchParams.get('q') ?? ''
  const numbers = extractPhoneNumbers(q)
  if (!numbers.length) return NextResponse.json({ numbers: [], accounts: [] })

  const { data } = await auth.admin
    .from('profiles')
    .select('id, full_name, email, chat_handle, phone, phone_verified')
    .in('phone', numbers)
    .limit(10)
  return NextResponse.json({
    numbers,
    accounts: (data ?? []).map((p) => ({
      id: p.id,
      name: p.full_name ?? '',
      email: p.email ?? '',
      handle: p.chat_handle ?? null,
      phone: p.phone,
      verified: !!p.phone_verified,
    })),
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireStaffRole(ROLES)
  if (!auth.ok) return auth.response
  const { admin } = auth

  const body = (await req.json().catch(() => null)) as {
    userId?: string
    phone?: string
    text?: string
    verified?: boolean
    replace?: boolean
  } | null
  if (!body?.userId) return NextResponse.json({ error: 'Choose the customer account.' }, { status: 400 })

  const phone = body.phone
    ? normalizeWhatsAppNumber(body.phone)
    : body.text
      ? (extractPhoneNumbers(body.text)[0] ?? null)
      : null
  if (!phone) return NextResponse.json({ error: 'No valid phone number found. Use 07X XXX XXXX or +country code.' }, { status: 400 })
  const verified = body.verified !== false

  const { data: profile } = await admin
    .from('profiles')
    .select('id, full_name, email, phone, phone_verified')
    .eq('id', body.userId)
    .maybeSingle()
  if (!profile) return NextResponse.json({ error: 'Customer not found.' }, { status: 404 })

  const { data: isStaff } = await admin.from('staff_accounts').select('id').eq('user_id', body.userId).maybeSingle()
  if (isStaff) return NextResponse.json({ error: 'That is a staff account, not a customer.' }, { status: 400 })

  if (profile.phone === phone && !!profile.phone_verified === verified) {
    return NextResponse.json({ ok: true, unchanged: true, phone })
  }
  if (profile.phone_verified && profile.phone && profile.phone !== phone && !body.replace) {
    return NextResponse.json(
      {
        error: `${profile.full_name || profile.email} already has ${formatPhone(profile.phone)} verified. Tick "Replace" to change it.`,
        needsReplace: true,
      },
      { status: 409 },
    )
  }

  // One verified account per number.
  const { data: owner } = await admin
    .from('profiles')
    .select('full_name, email')
    .eq('phone', phone)
    .eq('phone_verified', true)
    .neq('id', body.userId)
    .limit(1)
    .maybeSingle()
  if (owner && verified) {
    return NextResponse.json(
      { error: `${formatPhone(phone)} is already verified on another account (${owner.full_name || owner.email}).` },
      { status: 409 },
    )
  }

  if (verified) {
    const { error: authError } = await admin.auth.admin.updateUserById(body.userId, { phone, phone_confirm: true })
    if (authError) {
      const duplicate = /already|exists|registered|unique/i.test(authError.message)
      return NextResponse.json(
        { error: duplicate ? `${formatPhone(phone)} is already used by another login.` : 'Could not save the number. Try again.' },
        { status: duplicate ? 409 : 500 },
      )
    }
  }

  const { error: profileError } = await admin
    .from('profiles')
    .update({
      phone,
      phone_verified: verified,
      pending_phone: null,
      phone_otp_code_hash: null,
      phone_otp_expires_at: null,
      phone_otp_attempts: 0,
    })
    .eq('id', body.userId)
  if (profileError) return NextResponse.json({ error: 'Could not save the number. Try again.' }, { status: 500 })

  // A pending review request for this customer is now settled.
  if (verified) {
    await admin
      .from('whatsapp_verification_requests')
      .update({ status: 'verified', verified_phone: phone, decided_by: auth.staffId, decided_at: new Date().toISOString() })
      .eq('user_id', body.userId)
      .eq('status', 'pending')
  }

  await logAuditEvent({
    entity: 'customer phone',
    label: profile.full_name || profile.email || body.userId,
    summary: `Staff attached ${formatPhone(phone)} to ${profile.full_name || profile.email} (${verified ? 'verified' : 'not verified'})${profile.phone ? `, replacing ${profile.phone}` : ''}`,
    severity: 'warning',
    detail: { userId: body.userId, phone, previous: profile.phone, verified },
  })
  return NextResponse.json({ ok: true, phone, verified })
}
