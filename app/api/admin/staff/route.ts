// app/api/admin/staff/route.ts
//
// GET  -> list every staff account (Manager sees everyone except other
//         Managers/Super Admins are filtered client-side per role — see
//         app/admin/(manager)/staff/page.tsx's own comment on that)
// POST -> create a new staff_accounts row
//
// SECURITY NOTE: same caveat as every other /api/admin/** route in this
// codebase — only checks that *some* Supabase user is logged in, not
// that they're staff, let alone which role. No staff-role gating exists
// yet server-side; the role-based UI restrictions (Manager can't create
// Manager/Super Admin accounts, only Super Admin's own /super-admin/staff/new
// can) are enforced client-side only for now. Add a real check before
// this is exposed outside your own team.
//
// AUTH GAP, called out explicitly rather than silently glossed over:
// this creates the staff_accounts ROSTER row only — name/email/role/site,
// the record other parts of the app (requests.assigned_staff_id,
// order_stage_history.by_staff_id, etc.) reference. It does NOT create a
// real Supabase Auth user or send an invite email, since /admin/login and
// /super-admin/login are both still stub pages with no real
// authentication wired up at all (see WISHDROP_STATUS.md). user_id stays
// null until that's built — a created staff member exists as a roster
// entry (assignable, visible, editable) but can't actually sign in yet.
// Wiring a real invite flow (supabase.auth.admin.inviteUserByEmail(),
// then linking the resulting auth user's id back onto this row) is real
// follow-up work, not something to fake here.

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
  const { data, error } = await admin
    .from('staff_accounts')
    .insert({
      name,
      email,
      role,
      site_id: resolvedSiteId,
      status: 'active',
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: `A staff account with the email "${email}" already exists.` }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ staff: data }, { status: 201 })
}