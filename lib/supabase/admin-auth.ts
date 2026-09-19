// lib/supabase/admin-auth.ts
//
// Shared staff-role gate for /api/admin/** routes. Several of these
// routes' own header comments flagged the same open item verbatim:
// "this only checks that *some* Supabase user is logged in, not that
// they're staff... add a real staff check before this admin panel is
// exposed outside your own team." app/api/admin/staff/route.ts and
// app/api/admin/staff/[staffId]/route.ts already had exactly that check
// (requireStaffRole, inlined in each file) — this module is that same
// lookup, pulled out so every other /api/admin/** route can use the real
// thing instead of only checking "is someone logged in."
//
// requireStaffRole() resolves the current Supabase session to an ACTIVE
// staff_accounts row and its role. requireStaffRole(allowedRoles) additionally
// 403s if that role isn't in the allowed list — used to enforce the
// permission matrix in wishdrop-admin-roles-and-policy.md, e.g. Warehouse
// has no access to sourcing/catalogue at all, and hard-deleting a seller
// is Manager/Super Admin only.

import { NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

export type StaffRole = 'manager' | 'sales' | 'warehouse' | 'super_admin'

export type StaffAuthResult =
  | { ok: true; admin: ReturnType<typeof createServiceRoleClient>; role: StaffRole; staffId: string }
  | { ok: false; response: NextResponse }

async function requireAuthedUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

/**
 * Resolves the current session to an ACTIVE staff_accounts row. Pass
 * `allowedRoles` to additionally restrict which staff roles may proceed
 * (e.g. `['manager', 'super_admin']` for a hard-delete action) — omit it
 * to allow any active staff member through, same as the plain
 * "someone is staff" check every other admin route already wants.
 *
 * Same user_id -> email-fallback lookup as /api/admin/auth/me and
 * middleware.ts, so a staff account that hasn't linked user_id yet
 * (created but never logged in) still resolves correctly.
 */
export async function requireStaffRole(allowedRoles?: readonly StaffRole[]): Promise<StaffAuthResult> {
  const user = await requireAuthedUser()
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }
  }

  const admin = createServiceRoleClient()
  let { data: staff } = await admin
    .from('staff_accounts')
    .select('id, role, status, user_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!staff && user.email) {
    const fallback = await admin
      .from('staff_accounts')
      .select('id, role, status, user_id')
      .eq('email', user.email)
      .maybeSingle()
    staff = fallback.data
  }

  if (!staff || staff.status !== 'active') {
    return { ok: false, response: NextResponse.json({ error: 'This account is not an active staff account.' }, { status: 403 }) }
  }

  const role = staff.role as StaffRole
  if (allowedRoles && !allowedRoles.includes(role)) {
    return { ok: false, response: NextResponse.json({ error: 'You do not have permission to do this.' }, { status: 403 }) }
  }

  return { ok: true, admin, role, staffId: staff.id as string }
}

/** Sourcing & Catalogue (sellers, catalogues, discounts, collections,
 * purchases, scrape-health) is Super Admin/Manager/Sales & Purchase —
 * Warehouse has no functional need for it (see the permission matrix). */
export const SOURCING_ROLES = ['super_admin', 'manager', 'sales'] as const

/** Hard-delete (sellers, orders, listings) is Manager/Super Admin only —
 * Sales & Purchase gets deactivate/hide but never a true delete. */
export const DELETE_ROLES = ['super_admin', 'manager'] as const
