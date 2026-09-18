// app/api/admin/staff/[staffId]/resend-invite/route.ts
//
// Regenerates a set-password link for a pending/locked-out staff
// account. Uses admin.generateLink with type 'recovery' rather than
// inviteUserByEmail again — the auth user already exists (created by
// the original invite), and re-inviting an existing user errors with
// "already registered". 'recovery' works for any existing user
// regardless of whether they ever set a password, and lands them on
// the same /admin/set-password page either way.
//
// Returns the raw link in the response (not just "email sent") so the
// caller can hand it to the staff member directly if Supabase's mailer
// is unreliable/rate-limited — see the invite flow's own comments.
//
// NOTE: `params` is a Promise here (Next.js 15 App Router route-handler
// convention) — it must be awaited before reading `.id`, or `id` comes
// through as `undefined` and the DB lookup below fails with
// "invalid input syntax for type uuid: undefined".

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

async function requireStaffRole(): Promise<
  | { ok: true; admin: ReturnType<typeof createServiceRoleClient>; role: 'manager' | 'sales' | 'warehouse' | 'super_admin' }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
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

export async function POST(req: NextRequest, { params }: { params: Promise<{ staffId: string }> }) {
  // Wrapped end-to-end: without this, any thrown error (e.g. a missing
  // SUPABASE_SERVICE_ROLE_KEY blowing up createServiceRoleClient(), or
  // any unexpected exception from the Supabase admin SDK) becomes a
  // bare 500 with no body and nothing but a stack trace in the server
  // console — this makes sure the real message always reaches the caller
  // and the server log, instead of having to guess from a blank 500.
  try {
    // Param key MUST match the folder name exactly — this route lives
    // at app/api/admin/staff/[staffId]/resend-invite/route.ts, so the
    // segment is `staffId`, not `id`. Destructuring `{ id }` here would
    // silently give `undefined` and reproduce the same
    // "invalid input syntax for type uuid: undefined" failure.
    const { staffId: id } = await params

    const authCheck = await requireStaffRole()
    if (!authCheck.ok) return authCheck.response
    const { admin, role: callerRole } = authCheck

    if (callerRole !== 'manager' && callerRole !== 'super_admin') {
      return NextResponse.json({ error: 'Only Manager or Super Admin can resend invites.' }, { status: 403 })
    }

    const { data: target, error: lookupError } = await admin
      .from('staff_accounts')
      .select('id, email, role, user_id')
      .eq('id', id)
      .maybeSingle()

    if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 })
    if (!target) return NextResponse.json({ error: 'Staff account not found.' }, { status: 404 })

    // Same restriction as creating staff — Manager can't touch Manager/
    // Super Admin rows, including resending their invites.
    if (callerRole === 'manager' && (target.role === 'manager' || target.role === 'super_admin')) {
      return NextResponse.json({ error: 'Manager cannot manage Manager or Super Admin accounts.' }, { status: 403 })
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin

    // 'invite' vs 'recovery' matters here: a staff row created via
    // inviteUserByEmail but never logged into has an unconfirmed email
    // in auth.users. generateLink({ type: 'recovery' }) can fail for an
    // unconfirmed user on some Supabase versions ("Signups not allowed
    // for this instance" / "Email not confirmed"-style errors), while
    // 'invite' works for exactly this not-yet-activated case. If the
    // user_id is missing entirely (invite never even created the auth
    // user), regenerate with 'invite' too, since 'recovery' requires an
    // existing user and would 400.
    const linkType = target.user_id ? 'invite' : 'invite'
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: linkType,
      email: target.email,
      options: { redirectTo: `${siteUrl}/admin/set-password` },
    })

    if (linkError) {
      console.error('[resend-invite] generateLink failed', linkError)
      return NextResponse.json({ error: linkError.message }, { status: 500 })
    }

    return NextResponse.json({ link: linkData.properties.action_link })
  } catch (err) {
    console.error('[resend-invite] unhandled error', err)
    const message = err instanceof Error ? err.message : 'Unexpected server error.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}