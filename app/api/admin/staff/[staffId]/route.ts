// app/api/admin/staff/[staffId]/route.ts
//
// GET   -> fetch one staff account
// PATCH -> update name/role/site, or deactivate/reactivate (status)
// DELETE -> hard-delete. Real, server-side policy now: Super Admin can
//           delete anyone; Manager can delete a Sales & Purchase or
//           Warehouse account, but NOT a Manager or Super Admin
//           account — checked against the TARGET's actual current
//           role in the database, not anything the client claims,
//           so this can't be bypassed by a client that simply omits or
//           fakes the target's role.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

async function requireAuthedUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

/** Resolves the current session to an ACTIVE staff_accounts row and
 * returns its id + role — or an error response to return as-is. Same
 * shape as the one in ../route.ts; kept as its own copy rather than a
 * shared import since these are two separate route files (each
 * compiled as its own serverless function) and the lookup is only a
 * few lines. */
async function requireStaffRole(): Promise<
  | { ok: true; admin: ReturnType<typeof createServiceRoleClient>; id: string; role: 'manager' | 'sales' | 'warehouse' | 'super_admin' }
  | { ok: false; response: NextResponse }
> {
  const user = await requireAuthedUser()
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }
  }

  const admin = createServiceRoleClient()
  let { data: staff } = await admin.from('staff_accounts').select('id, role, status, user_id').eq('user_id', user.id).maybeSingle()
  if (!staff && user.email) {
    const fallback = await admin.from('staff_accounts').select('id, role, status, user_id').eq('email', user.email).maybeSingle()
    staff = fallback.data
  }

  if (!staff || staff.status === 'deactivated') {
    return { ok: false, response: NextResponse.json({ error: 'This account is not an active staff account.' }, { status: 403 }) }
  }
  return { ok: true, admin, id: staff.id, role: staff.role as 'manager' | 'sales' | 'warehouse' | 'super_admin' }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ staffId: string }> }) {
  const user = await requireAuthedUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { staffId } = await params
  const admin = createServiceRoleClient()
  const { data, error } = await admin.from('staff_accounts').select('*').eq('id', staffId).maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Staff account not found' }, { status: 404 })
  return NextResponse.json({ staff: data })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ staffId: string }> }) {
  const authCheck = await requireStaffRole()
  if (!authCheck.ok) return authCheck.response
  const { admin, id: callerId, role: callerRole } = authCheck

  const { staffId } = await params
  const body = await req.json()
  const { name, email, role, siteId, status } = body

  const isSelf = staffId === callerId

  // Self-service (e.g. /admin/settings/profile editing your own name) —
  // always allowed regardless of role, same as before. Everything past
  // this point only applies when someone is editing SOMEONE ELSE's
  // roster entry, which is a management action, not self-service.
  if (!isSelf) {
    if (callerRole !== 'manager' && callerRole !== 'super_admin') {
      return NextResponse.json({ error: 'Only Manager or Super Admin can edit other staff accounts.' }, { status: 403 })
    }

    if (callerRole === 'manager') {
      // Manager can edit a Sales & Purchase/Warehouse account, but not
      // a Manager or Super Admin one — check the TARGET's actual
      // current role in the database, not anything the client claims.
      const { data: target } = await admin.from('staff_accounts').select('role').eq('id', staffId).maybeSingle()
      if (!target) return NextResponse.json({ error: 'Staff account not found' }, { status: 404 })
      if (target.role !== 'sales' && target.role !== 'warehouse') {
        return NextResponse.json({ error: 'Manager can only edit Sales & Purchase or Warehouse accounts.' }, { status: 403 })
      }
      // Also blocks the promotion loophole this restriction would
      // otherwise leave open — Manager setting an existing Sales &
      // Purchase/Warehouse account's role TO manager or super_admin
      // would be functionally the same as onboarding one, which is
      // Super Admin-only (see the POST handler in ../route.ts).
      if (role !== undefined && role !== 'sales' && role !== 'warehouse') {
        return NextResponse.json({ error: 'Manager can only set the role to Sales & Purchase or Warehouse.' }, { status: 403 })
      }
    }
  }

  const patch: Database['public']['Tables']['staff_accounts']['Update'] = {}
  if (name !== undefined) patch.name = name
  if (email !== undefined) patch.email = email
  if (role !== undefined) patch.role = role
  if (siteId !== undefined) patch.site_id = role === 'warehouse' || (role === undefined && siteId) ? siteId : null
  if (status !== undefined) patch.status = status

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { data, error } = await admin.from('staff_accounts').update(patch).eq('id', staffId).select().single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: `The email "${email}" is already in use by another account.` }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ staff: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ staffId: string }> }) {
  const authCheck = await requireStaffRole()
  if (!authCheck.ok) return authCheck.response
  const { admin, role: callerRole } = authCheck

  if (callerRole !== 'manager' && callerRole !== 'super_admin') {
    return NextResponse.json({ error: 'Only Manager or Super Admin can delete staff accounts.' }, { status: 403 })
  }

  const { staffId } = await params

  // Fetched unconditionally now (not just for the Manager role-check
  // branch below) — user_id is what lets this also clean up the
  // underlying auth.users row after the roster row is gone. Previously
  // this route only ever deleted staff_accounts, leaving the real
  // Supabase Auth account behind — since auth.users is shared across
  // the whole platform (customers included, same as the invite route's
  // own "already has an account" check), that meant a deleted staff
  // member's email could never be re-invited: the next attempt would
  // fail with exactly that "already has an account" error, for an
  // account that, from the roster's point of view, no longer existed.
  const { data: target } = await admin.from('staff_accounts').select('role, user_id').eq('id', staffId).maybeSingle()
  if (!target) return NextResponse.json({ error: 'Staff account not found' }, { status: 404 })

  if (callerRole === 'manager') {
    // Manager can delete a Sales & Purchase/Warehouse account, but not
    // a Manager or Super Admin one — checked against the TARGET's
    // actual current role in the database, so this can't be bypassed
    // by a client that simply calls DELETE directly on a Manager's id.
    if (target.role !== 'sales' && target.role !== 'warehouse') {
      return NextResponse.json({ error: 'Manager can only delete Sales & Purchase or Warehouse accounts.' }, { status: 403 })
    }
  }

  const { error } = await admin.from('staff_accounts').delete().eq('id', staffId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Best-effort — the roster row is already gone either way, so a
  // failure here (e.g. user_id was somehow already null, or the auth
  // user was already removed some other way) shouldn't turn a
  // successful delete into an error response. Not awaited-and-checked
  // strictly, but still awaited so it actually runs before this
  // response goes out rather than racing the client's next request.
  if (target.user_id) {
    await admin.auth.admin.deleteUser(target.user_id).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}