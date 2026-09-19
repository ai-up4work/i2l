// app/api/admin/register/route.ts
//
// Public route — no auth required, and deliberately so. Self-service
// alternative to the invite-link flow (app/api/admin/staff route.ts's
// POST + app/admin/invite), which kept breaking in production on this
// project's live Supabase Redirect URLs configuration — a one-time link
// that dies to email/chat link-preview crawlers, or silently bounces to
// the wrong page if the redirect target isn't on Supabase's allow-list.
// Self-registration has neither problem: no email step, no one-time
// token, nothing that depends on a redirect landing in the right place.
//
// POST creates a real, immediately-usable Supabase Auth account
// (email_confirm: true — no confirmation link to click or lose) plus a
// staff_accounts row with status='pending' and role = NULL. A pending
// account can sign in to Supabase fine, but has no admin access at all:
// /api/admin/auth/me and middleware.ts's getStaffRole both treat
// anything other than status='active' as "not staff." So it's safe to
// leave this open to the public internet — the worst case is a pending
// row nobody approves, never unauthorized access. See
// data/wishdrop-staff-self-registration.sql for the schema change this
// depends on.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

const VALID_REQUESTED_ROLES = ['manager', 'sales', 'warehouse', 'super_admin'] as const

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, email, password, requestedRole } = body

    if (!name?.trim() || !email?.trim() || !password) {
      return NextResponse.json({ error: 'Name, email, and password are required.' }, { status: 400 })
    }
    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
    }
    if (requestedRole !== undefined && requestedRole !== null && !VALID_REQUESTED_ROLES.includes(requestedRole)) {
      return NextResponse.json({ error: 'Invalid requested role.' }, { status: 400 })
    }

    const admin = createServiceRoleClient()

    // email_confirm: true is the whole point — a real, usable account
    // the moment an approver flips status to 'active', no confirmation
    // link in the middle to die the same way the invite links did.
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
      user_metadata: { full_name: name.trim(), is_staff: true },
    })
    if (createError) {
      const message = /already been registered|already exists/i.test(createError.message)
        ? `"${email.trim()}" already has an account on this platform — sign in instead, or ask a Manager to check on your request.`
        : createError.message
      return NextResponse.json({ error: message }, { status: 409 })
    }

    const { error: staffError } = await admin.from('staff_accounts').insert({
      user_id: created.user.id,
      name: name.trim(),
      email: email.trim(),
      role: null,
      requested_role: requestedRole ?? null,
      status: 'pending',
    })
    if (staffError) {
      // Roster row failed after the auth user was already created —
      // clean up the orphaned auth user, same discipline as
      // /api/admin/staff's own create flow.
      await admin.auth.admin.deleteUser(created.user.id).catch(() => {})
      if (staffError.code === '23505') {
        return NextResponse.json({ error: `A staff account with the email "${email.trim()}" already exists.` }, { status: 409 })
      }
      return NextResponse.json({ error: staffError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (err) {
    console.error('[admin/register] unhandled error', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unexpected server error.' }, { status: 500 })
  }
}
