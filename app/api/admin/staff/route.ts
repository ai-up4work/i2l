// app/api/admin/staff/route.ts
//
// GET  -> list every staff account (Manager sees everyone except other
//         Managers/Super Admins are filtered client-side per role — see
//         app/admin/(manager)/staff/page.tsx's own comment on that)
// POST -> create a new staff_accounts row AND a real, login-capable
//         Supabase Auth account — see the invite flow below.
//
// SECURITY NOTE: same caveat as every other /api/admin/** route in this
// codebase — only checks that *some* Supabase user is logged in, not
// that they're staff, let alone which role. No staff-role gating exists
// yet server-side; the role-based UI restrictions (Manager can't create
// Manager/Super Admin accounts, only Super Admin's own /super-admin/staff/new
// can) are enforced client-side only for now. Add a real check before
// this is exposed outside your own team.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

async function requireAuthedUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

const VALID_ROLES = ['manager', 'sales', 'warehouse', 'super_admin'] as const

export async function GET() {
  const user = await requireAuthedUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const admin = createServiceRoleClient()
  const { data, error } = await admin.from('staff_accounts').select('*').order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ staff: data })
}

export async function POST(req: NextRequest) {
  const user = await requireAuthedUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json()
  const { name, email, role, siteId } = body

  if (!name || !email || !role) {
    return NextResponse.json({ error: 'name, email, and role are required' }, { status: 400 })
  }
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` }, { status: 400 })
  }
  // Site is only meaningful for Warehouse — same convention as
  // CurrentUser.siteId/StaffMember.siteId throughout the rest of the
  // app. Silently dropped rather than erroring for any other role, so a
  // client that sends a stale siteId value doesn't need special-casing.
  const resolvedSiteId = role === 'warehouse' ? siteId ?? null : null

  const admin = createServiceRoleClient()

  // Real, login-capable account first — supabase.auth.admin.inviteUserByEmail
  // creates the auth.users row AND emails them a link to set their own
  // password (lands on /admin/set-password, which establishes the
  // session automatically via the link's token — see that page). This
  // replaces the earlier version of this route, which only ever created
  // the roster row with no way for that person to actually sign in.
  //
  // If inviteUserByEmail fails (e.g. this email already has ANY
  // Supabase Auth account — a customer account counts too, since
  // auth.users is shared across the whole project, not just staff),
  // the staff_accounts row is never created either — a roster entry
  // with no working login would just be a confusing half-state.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${siteUrl}/admin/set-password`,
    data: { full_name: name, is_staff: true },
  })
  if (inviteError) {
    const message = /already been registered|already exists/i.test(inviteError.message)
      ? `"${email}" already has an account on this platform (possibly a customer account) — staff accounts need a distinct email address.`
      : inviteError.message
    return NextResponse.json({ error: message }, { status: 409 })
  }

  const { data, error } = await admin
    .from('staff_accounts')
    .insert({
      user_id: invited.user.id,
      name,
      email,
      role,
      site_id: resolvedSiteId,
      status: 'active',
    })
    .select()
    .single()

  if (error) {
    // Roster row failed after the auth user was already created —
    // clean up the orphaned auth user rather than leaving an invited
    // account with nowhere for it to actually belong.
    await admin.auth.admin.deleteUser(invited.user.id).catch(() => {})
    if (error.code === '23505') {
      return NextResponse.json({ error: `A staff account with the email "${email}" already exists.` }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ staff: data }, { status: 201 })
}