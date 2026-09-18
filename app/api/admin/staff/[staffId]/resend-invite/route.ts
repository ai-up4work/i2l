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
  const { staffId: id } = await params

  const authCheck = await requireStaffRole()
  if (!authCheck.ok) return authCheck.response
  const { admin, role: callerRole } = authCheck

  if (callerRole !== 'manager' && callerRole !== 'super_admin') {
    return NextResponse.json({ error: 'Only Manager or Super Admin can resend invites.' }, { status: 403 })
  }

  const { data: target, error: lookupError } = await admin
    .from('staff_accounts')
    .select('id, email, role')
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
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: target.email,
    options: { redirectTo: `${siteUrl}/admin/set-password` },
  })

  if (linkError) return NextResponse.json({ error: linkError.message }, { status: 500 })

  // Best-effort: also fire the normal recovery email through whatever
  // mailer is configured. If it doesn't arrive (default Supabase mailer
  // is unreliable), the link above still works as a manual fallback.
  await admin.auth.resetPasswordForEmail(target.email, {
    redirectTo: `${siteUrl}/admin/set-password`,
  }).catch(() => {})

  return NextResponse.json({ link: linkData.properties.action_link })
}