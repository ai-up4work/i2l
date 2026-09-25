// app/api/admin/whatsapp-verifications/route.ts
//
// Staff review of WhatsApp verification requests.
//
// GET  ?view=pending|history   — list (with customer details + conflicts)
// GET  ?countOnly=1            — { pending } for the sidebar badge
// POST { id, action: 'verify', phone? }   — attach the number (phone =
//        the sender number staff saw in WhatsApp, if it differs)
// POST { id, action: 'reject', reason }   — decline with a reason the
//        customer sees
//
// Manager, Sales and Super Admin — the roles that handle customer chat.

import { NextRequest, NextResponse } from 'next/server'
import { requireStaffRole } from '@/lib/supabase/admin-auth'
import { sendPushToUsers } from '@/lib/push/server'
import { formatPhone, normalizeWhatsAppNumber } from '@/lib/whatsapp/verification'
import { formatHandle } from '@/lib/chat/waLink'

export const runtime = 'nodejs'

const VERIFY_ROLES = ['manager', 'sales', 'super_admin'] as const

export async function GET(req: NextRequest) {
  const auth = await requireStaffRole(VERIFY_ROLES)
  if (!auth.ok) return auth.response
  const { admin } = auth

  if (req.nextUrl.searchParams.get('countOnly')) {
    const { count } = await admin
      .from('whatsapp_verification_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
    return NextResponse.json({ pending: count ?? 0 })
  }

  const view = req.nextUrl.searchParams.get('view') === 'history' ? 'history' : 'pending'
  let query = admin
    .from('whatsapp_verification_requests')
    .select('id, user_id, phone, reference, status, verified_phone, reject_reason, decided_by_name, created_at, decided_at')
  query =
    view === 'pending'
      ? query.eq('status', 'pending').order('created_at', { ascending: true })
      : query.in('status', ['verified', 'rejected']).order('decided_at', { ascending: false })
  const { data: rows, error } = await query.limit(view === 'pending' ? 200 : 50)
  if (error) {
    console.error('[wa verifications] list failed', error)
    return NextResponse.json({ error: 'Could not load requests.' }, { status: 500 })
  }

  const userIds = [...new Set((rows ?? []).map((r) => r.user_id))]
  const phones = [...new Set((rows ?? []).map((r) => r.phone))]

  const [{ data: profiles }, { data: owners }] = await Promise.all([
    userIds.length
      ? admin.from('profiles').select('id, full_name, email, chat_handle, phone, phone_verified').in('id', userIds)
      : Promise.resolve({ data: [] as never[] }),
    phones.length && view === 'pending'
      ? admin.from('profiles').select('id, full_name, email, phone').in('phone', phones)
      : Promise.resolve({ data: [] as never[] }),
  ])
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))

  return NextResponse.json({
    requests: (rows ?? []).map((r) => {
      const p = profileById.get(r.user_id)
      const conflict = (owners ?? []).find((o) => o.phone === r.phone && o.id !== r.user_id)
      return {
        id: r.id,
        reference: r.reference,
        phone: r.phone,
        status: r.status,
        verifiedPhone: r.verified_phone,
        rejectReason: r.reject_reason,
        decidedBy: r.decided_by_name,
        createdAt: r.created_at,
        decidedAt: r.decided_at,
        customer: {
          id: r.user_id,
          name: p?.full_name ?? '',
          email: p?.email ?? '',
          handle: formatHandle(p?.chat_handle),
          currentVerifiedPhone: p?.phone_verified ? p.phone : null,
        },
        conflict: conflict ? { name: conflict.full_name, email: conflict.email } : null,
      }
    }),
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireStaffRole(VERIFY_ROLES)
  if (!auth.ok) return auth.response
  const { admin, staffId } = auth

  let body: { id?: string; action?: string; phone?: string; reason?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 })
  }
  if (!body.id || (body.action !== 'verify' && body.action !== 'reject')) {
    return NextResponse.json({ error: 'Missing id or action.' }, { status: 400 })
  }

  const { data: request } = await admin
    .from('whatsapp_verification_requests')
    .select('id, user_id, phone, status')
    .eq('id', body.id)
    .maybeSingle()
  if (!request) return NextResponse.json({ error: 'Request not found.' }, { status: 404 })
  if (request.status !== 'pending') {
    return NextResponse.json({ error: 'This request was already handled (or cancelled by the customer).' }, { status: 409 })
  }

  const { data: staff } = await admin.from('staff_accounts').select('name').eq('id', staffId).maybeSingle()
  const decided = {
    decided_by: staffId,
    decided_by_name: staff?.name ?? null,
    decided_at: new Date().toISOString(),
  }

  // ── Reject ──
  if (body.action === 'reject') {
    const reason = (body.reason ?? '').trim().slice(0, 200)
    if (!reason) return NextResponse.json({ error: 'Give the customer a reason.' }, { status: 400 })

    await admin
      .from('whatsapp_verification_requests')
      .update({ status: 'rejected', reject_reason: reason, ...decided })
      .eq('id', request.id)

    await notifyCustomer(admin, request.user_id, {
      title: 'We couldn’t verify your WhatsApp number',
      body: `${reason} You can try again from My Profile.`,
    })
    return NextResponse.json({ ok: true, status: 'rejected' })
  }

  // ── Verify ──
  const phone = body.phone ? normalizeWhatsAppNumber(body.phone) : request.phone
  if (!phone) return NextResponse.json({ error: 'That number isn’t valid.' }, { status: 400 })

  const { data: owner } = await admin
    .from('profiles')
    .select('full_name, email')
    .eq('phone', phone)
    .neq('id', request.user_id)
    .limit(1)
    .maybeSingle()
  if (owner) {
    return NextResponse.json(
      {
        error: `${formatPhone(phone)} is already verified on another account (${owner.full_name || owner.email}). Reject this request, or remove the number from that account first.`,
      },
      { status: 409 },
    )
  }

  // auth.users first: the customer's "verified" badge reads
  // phone_confirmed_at from there, and it enforces one login per number.
  // If this fails, nothing else is changed.
  const { error: authError } = await admin.auth.admin.updateUserById(request.user_id, {
    phone,
    phone_confirm: true,
  })
  if (authError) {
    console.error('[wa verifications] auth update failed', authError)
    const duplicate = /already|exists|registered|unique/i.test(authError.message)
    return NextResponse.json(
      {
        error: duplicate
          ? `${formatPhone(phone)} is already used by another login. Reject this request or check that account first.`
          : 'Could not save the number. Try again.',
      },
      { status: duplicate ? 409 : 500 },
    )
  }

  const { error: profileError } = await admin
    .from('profiles')
    .update({
      phone,
      phone_verified: true,
      pending_phone: null,
      phone_otp_code_hash: null,
      phone_otp_expires_at: null,
      phone_otp_attempts: 0,
    })
    .eq('id', request.user_id)
  if (profileError) {
    console.error('[wa verifications] profile update failed', profileError)
    return NextResponse.json({ error: 'Could not save the number. Try again.' }, { status: 500 })
  }

  await admin
    .from('whatsapp_verification_requests')
    .update({ status: 'verified', verified_phone: phone, ...decided })
    .eq('id', request.id)

  await notifyCustomer(admin, request.user_id, {
    title: 'Your WhatsApp number is verified',
    body: `We’ll use ${formatPhone(phone)} to reach you about your orders.`,
  })
  return NextResponse.json({ ok: true, status: 'verified', phone })
}

async function notifyCustomer(
  admin: Parameters<typeof sendPushToUsers>[0],
  userId: string,
  message: { title: string; body: string },
) {
  try {
    await admin.from('notifications').insert({
      user_id: userId,
      type: 'account',
      title: message.title,
      body: message.body,
      link: '/account/profile',
    })
    await sendPushToUsers(admin, [userId], {
      kind: 'account',
      title: message.title,
      body: message.body,
      url: '/account/profile',
      tag: 'whatsapp-verification',
    })
  } catch (err) {
    // The decision is saved either way; a missed notification is not fatal.
    console.error('[wa verifications] notify failed', err)
  }
}
