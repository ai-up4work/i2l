// app/api/admin/staff/[staffId]/route.ts
//
// DELETE -> removes a staff member completely: both the staff_accounts
// roster row AND the underlying Supabase auth.users account. These are
// two separate stores (see resend-invite route's own notes on this),
// and deleting only the roster row leaves a dangling auth.users entry
// that permanently blocks re-inviting that email — inviteUserByEmail
// checks auth.users, not staff_accounts, so a half-deleted staff member
// causes a 409 "already registered" forever after. This route removes
// both, in the order that avoids ever leaving that half-state:
// staff_accounts row first, then the auth user — if the auth deletion
// fails, the person is at least off the roster and out of every
// permission check; a leftover auth.users row with no roster row is a
// harmless orphan (it can't log into /admin at all, since
// requireStaffRole requires an active staff_accounts row), and this
// same route can be run again to finish cleaning up if needed.
//
// Same requireStaffRole / role-restriction shape as the other staff
// routes: Manager can remove Sales & Purchase/Warehouse staff only,
// never Manager or Super Admin. Super Admin can remove anyone except
// themselves (a Super Admin locking themselves out is a footgun worth
// blocking outright rather than relying on the UI to prevent it).
//
// IMPORTANT: this file's route is app/api/admin/staff/[staffId]/route.ts
// — the SAME folder as resend-invite's parent segment. If your project
// already has app/api/admin/staff/[staffId]/resend-invite/route.ts,
// this DELETE handler goes in app/api/admin/staff/[staffId]/route.ts
// (one level up, sibling to the resend-invite folder), not inside it.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

async function requireStaffRole(): Promise<
  | { ok: true; admin: ReturnType<typeof createServiceRoleClient>; role: 'manager' | 'sales' | 'warehouse' | 'super_admin'; userId: string }
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
  return { ok: true, admin, role: staff.role as 'manager' | 'sales' | 'warehouse' | 'super_admin', userId: user.id }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ staffId: string }> }) {
  try {
    const { staffId } = await params

    const authCheck = await requireStaffRole()
    if (!authCheck.ok) return authCheck.response
    const { admin, role: callerRole, userId: callerUserId } = authCheck

    if (callerRole !== 'manager' && callerRole !== 'super_admin') {
      return NextResponse.json({ error: 'Only Manager or Super Admin can remove staff.' }, { status: 403 })
    }

    const { data: target, error: lookupError } = await admin
      .from('staff_accounts')
      .select('id, email, role, user_id')
      .eq('id', staffId)
      .maybeSingle()

    if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 })
    if (!target) return NextResponse.json({ error: 'Staff account not found.' }, { status: 404 })

    // Same restriction as create/resend-invite — Manager can't touch
    // Manager or Super Admin rows.
    if (callerRole === 'manager' && (target.role === 'manager' || target.role === 'super_admin')) {
      return NextResponse.json({ error: 'Manager cannot manage Manager or Super Admin accounts.' }, { status: 403 })
    }

    // A Super Admin removing their own account would lock them out with
    // no one left to undo it from the UI — block it outright rather
    // than trusting the client not to send this.
    if (target.user_id === callerUserId) {
      return NextResponse.json({ error: "You can't remove your own staff account." }, { status: 400 })
    }

    // Roster row first. If this fails, nothing has changed — safest
    // order to fail in.
    const { error: deleteRowError } = await admin.from('staff_accounts').delete().eq('id', staffId)
    if (deleteRowError) {
      return NextResponse.json({ error: deleteRowError.message }, { status: 500 })
    }

    // Then the actual login-capable auth account, if one was ever
    // created (a staff row created but never successfully invited could
    // in principle have no user_id — defensive check, shouldn't happen
    // given how POST /api/admin/staff rolls back on failure).
    if (target.user_id) {
      const { error: deleteAuthError } = await admin.auth.admin.deleteUser(target.user_id)
      if (deleteAuthError) {
        // Roster row is already gone — this person can no longer sign
        // into /admin regardless (requireStaffRole needs an active
        // staff_accounts row), but their email is still tied up in
        // auth.users, which will 409 on re-invite until this is
        // resolved. Surface this clearly rather than reporting a clean
        // success.
        console.error('[staff delete] roster row removed but auth user deletion failed', deleteAuthError)
        return NextResponse.json(
          {
            error: `Removed from staff, but couldn't delete the login account (${deleteAuthError.message}). Re-inviting "${target.email}" later may fail until this is cleaned up in Supabase Authentication → Users.`,
          },
          { status: 207 },
        )
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[staff delete] unhandled error', err)
    const message = err instanceof Error ? err.message : 'Unexpected server error.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}