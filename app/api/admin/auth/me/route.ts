// app/api/admin/auth/me/route.ts
//
// GET -> given the current Supabase session (cookie-based), find the
// matching staff_accounts row and return it — this is what AdminDataContext
// calls on mount to decide "is a real staff member logged in, and if so
// who/what role". Returns 401 if there's no session at all, 403 if
// there IS a session but it doesn't belong to an active staff account
// (e.g. a customer account, or a deactivated staff member).
//
// Matched by user_id first (the normal case once a staff account has
// signed in at least once and gotten linked — see /api/admin/staff/login
// and the invite flow in /api/admin/staff's POST). Falls back to email
// match for a staff account that was created but has never linked
// user_id yet, which shouldn't normally happen once the invite flow
// below is in place, but costs nothing to handle defensively.

import { NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const admin = createServiceRoleClient()

  let { data: staff } = await admin.from('staff_accounts').select('*').eq('user_id', user.id).maybeSingle()

  if (!staff && user.email) {
    const fallback = await admin.from('staff_accounts').select('*').eq('email', user.email).maybeSingle()
    staff = fallback.data
    // Link it now, since we just proved by email match that this auth
    // user IS this staff row — next lookup goes straight through
    // user_id instead of needing this fallback again.
    if (staff && !staff.user_id) {
      await admin.from('staff_accounts').update({ user_id: user.id }).eq('id', staff.id)
    }
  }

  if (!staff) {
    return NextResponse.json({ error: 'This account is not a staff account.' }, { status: 403 })
  }
  if (staff.status === 'deactivated') {
    return NextResponse.json({ error: 'This staff account has been deactivated.' }, { status: 403 })
  }

  await admin.from('staff_accounts').update({ last_login: new Date().toISOString() }).eq('id', staff.id)

  return NextResponse.json({ staff })
}