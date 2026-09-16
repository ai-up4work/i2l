// app/api/admin/staff/[staffId]/route.ts
//
// GET   -> fetch one staff account
// PATCH -> update name/role/site, or deactivate/reactivate (status)
// DELETE -> hard-delete — Manager/Super Admin only in principle (see
//           the delete policy in whatsapp-integration-discussion-summary.md
//           §4.1); same server-side gating gap as every other route here,
//           enforced client-side only for now.

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
  const user = await requireAuthedUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { staffId } = await params
  const body = await req.json()
  const { name, email, role, siteId, status } = body

  const patch: Database['public']['Tables']['staff_accounts']['Update'] = {}
  if (name !== undefined) patch.name = name
  if (email !== undefined) patch.email = email
  if (role !== undefined) patch.role = role
  if (siteId !== undefined) patch.site_id = role === 'warehouse' || (role === undefined && siteId) ? siteId : null
  if (status !== undefined) patch.status = status

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const admin = createServiceRoleClient()
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
  const user = await requireAuthedUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { staffId } = await params
  const admin = createServiceRoleClient()
  const { error } = await admin.from('staff_accounts').delete().eq('id', staffId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}