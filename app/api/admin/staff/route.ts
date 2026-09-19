// app/api/admin/staff/route.ts
//
// GET  -> list every staff account (every authenticated staff member
//         can read this — AdminDataContext fetches it for everyone,
//         not just Super Admin; each page then filters/scopes what it
//         shows — e.g. Manager's own roster view excludes Manager/Super
//         Admin rows client-side)
// POST -> create a new staff_accounts row AND a real, login-capable
//         Supabase Auth account. Always returns a wrapped invite link
//         (see wrapInviteLink below) for the caller to copy and send
//         themselves — no automatic email is sent. Supabase's own
//         inviteUserByEmail used to be tried first, but its email
//         points straight at the raw one-time link with no way for this
//         codebase to wrap it, and that raw link is exactly what a
//         WhatsApp/email/Slack link-preview crawler kills before the
//         staff member's real first click (see /admin/invite's doc
//         comment). generateLink + wrapping is reliable regardless of
//         which channel the link travels through.
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

  if (!staff || staff.status !== 'active') {
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

/**
 * Wraps a real one-time Supabase auth link (generateLink's action_link)
 * behind /admin/invite so it's never shared as a raw, crawler-followable
 * URL — see that page's own doc comment for the full "why" (link-preview
 * crawlers in WhatsApp/email/Slack burning the one-time token before the
 * staff member's real click). Every place that hands a Supabase invite/
 * recovery link to a human — this route and resend-invite — should wrap
 * it through here rather than returning action_link directly.
 */
function wrapInviteLink(actionLink: string, origin: string): string {
  return `${origin}/admin/invite?to=${encodeURIComponent(actionLink)}`
}

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

  // Always generateLink, never inviteUserByEmail. This used to try
  // Supabase's own auto-sent invite email first (falling back to
  // generateLink only on rate-limit or when the caller opted out) — but
  // Supabase's own email template points straight at the real one-time
  // action_link with nothing in this codebase able to wrap it, and that
  // raw link is exactly what dies before a staff member's first real
  // click (see /admin/invite's doc comment: WhatsApp/email/Slack link-
  // preview crawlers auto-fetch it and burn the one-time token). Always
  // going through generateLink means we always get the link back and can
  // always wrap it through /admin/invite, so the invite is reliable
  // regardless of channel — copy it and send it however's convenient.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin
  const redirectTo = `${siteUrl}/admin/set-password`
  const userMetadata = { full_name: name, is_staff: true }

  const { data: generated, error: generateError } = await admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo, data: userMetadata },
  })
  if (generateError) {
    const message = /already been registered|already exists/i.test(generateError.message)
      ? `"${email}" already has an account on this platform (possibly a customer account) — staff accounts need a distinct email address.`
      : generateError.message
    return NextResponse.json({ error: message }, { status: 409 })
  }
  const invitedUserId = generated.user.id
  const inviteLink = wrapInviteLink(generated.properties.action_link, siteUrl)

  const { data, error } = await admin
    .from('staff_accounts')
    .insert({
      user_id: invitedUserId,
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
    await admin.auth.admin.deleteUser(invitedUserId).catch(() => {})
    if (error.code === '23505') {
      return NextResponse.json({ error: `A staff account with the email "${email}" already exists.` }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ staff: data, inviteLink }, { status: 201 })
}