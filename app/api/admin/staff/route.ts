// app/api/admin/staff/route.ts
//
// GET  -> list every staff account (every authenticated staff member
//         can read this — AdminDataContext fetches it for everyone,
//         not just Super Admin; each page then filters/scopes what it
//         shows — e.g. Manager's own roster view excludes Manager/Super
//         Admin rows client-side)
// POST -> create a new staff_accounts row AND a real, login-capable
//         Supabase Auth account — see the invite flow below.
//
// POST is real and server-side now, not just a UI restriction:
// Manager and Super Admin can both call it, but Manager is restricted
// to creating role sales/warehouse only — trying manager or super_admin
// as the target role gets a 403 regardless of what the client sends.
// Super Admin has no such restriction. Mirrors the same user_id ->
// email-fallback staff lookup /api/admin/auth/me and middleware.ts
// already use, rather than inventing a third version of that check.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

async function requireAuthedUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

/** Resolves the current session to an ACTIVE staff_accounts row and
 * returns its role — or an error response to return as-is. Shared by
 * every /api/admin/staff*  route that needs to know WHO is calling, not
 * just THAT someone is. */
async function requireStaffRole(): Promise<
  | { ok: true; admin: ReturnType<typeof createServiceRoleClient>; role: 'manager' | 'sales' | 'warehouse' | 'super_admin' }
  | { ok: false; response: NextResponse }
> {
  const user = await requireAuthedUser()
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }
  }

  const admin = createServiceRoleClient()
  let { data: staff } = await admin.from('staff_accounts').select('role, status, user_id').eq('user_id', user.id).maybeSingle()
  if (!staff && user.email) {
    const fallback = await admin.from('staff_accounts').select('role, status, user_id').eq('email', user.email).maybeSingle()
    staff = fallback.data
  }

  if (!staff || staff.status === 'deactivated') {
    return { ok: false, response: NextResponse.json({ error: 'This account is not an active staff account.' }, { status: 403 }) }
  }
  return { ok: true, admin, role: staff.role as 'manager' | 'sales' | 'warehouse' | 'super_admin' }
}

const VALID_ROLES = ['manager', 'sales', 'warehouse', 'super_admin'] as const
// What Manager is allowed to create — deliberately excludes 'manager'
// and 'super_admin'. Onboarding a Manager or Super Admin account is
// Super Admin-only; Manager can still onboard the same Sales & Purchase/
// Warehouse roles it always could.
const MANAGER_CREATABLE_ROLES = ['sales', 'warehouse'] as const

export async function GET() {
  const user = await requireAuthedUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const admin = createServiceRoleClient()
  const { data, error } = await admin.from('staff_accounts').select('*').order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ staff: data })
}

export async function POST(req: NextRequest) {
  const authCheck = await requireStaffRole()
  if (!authCheck.ok) return authCheck.response
  const { admin, role: callerRole } = authCheck

  if (callerRole !== 'manager' && callerRole !== 'super_admin') {
    return NextResponse.json({ error: 'Only Manager or Super Admin can add staff.' }, { status: 403 })
  }

  const body = await req.json()
  const { name, email, role, siteId } = body

  if (!name || !email || !role) {
    return NextResponse.json({ error: 'name, email, and role are required' }, { status: 400 })
  }
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` }, { status: 400 })
  }
  if (callerRole === 'manager' && !MANAGER_CREATABLE_ROLES.includes(role)) {
    return NextResponse.json(
      { error: 'Manager can only add Sales & Purchase or Warehouse staff. Manager and Super Admin accounts are Super Admin-only.' },
      { status: 403 },
    )
  }
  // Site is only meaningful for Warehouse — same convention as
  // CurrentUser.siteId/StaffMember.siteId throughout the rest of the
  // app. Silently dropped rather than erroring for any other role, so a
  // client that sends a stale siteId value doesn't need special-casing.
  const resolvedSiteId = role === 'warehouse' ? siteId ?? null : null

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