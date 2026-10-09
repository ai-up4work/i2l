// app/api/admin/catalogues/applications/route.ts
//
// GET   -> "Sell on Wishdrop" applications (newest first). ?status=new etc.
// PATCH -> { id, status?, staffNote?, sellerId? } — mark contacted /
//          approved / declined, or link the store made from it.
// Staff only (SOURCING_ROLES).

import { NextRequest, NextResponse } from 'next/server'
import { requireStaffRole, SOURCING_ROLES } from '@/lib/supabase/admin-auth'

const STATUSES = ['new', 'contacted', 'approved', 'declined']

export async function GET(req: NextRequest) {
  const auth = await requireStaffRole(SOURCING_ROLES)
  if (!auth.ok) return auth.response
  const status = req.nextUrl.searchParams.get('status')
  let query = auth.admin.from('seller_applications' as never).select('*').order('created_at', { ascending: false }).limit(200)
  if (status && STATUSES.includes(status)) query = query.eq('status', status)
  const { data, error } = await query
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return NextResponse.json({ applications: [], needsMigration: true })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ applications: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireStaffRole(SOURCING_ROLES)
  if (!auth.ok) return auth.response
  const body = (await req.json().catch(() => ({}))) as { id?: string; status?: string; staffNote?: string; sellerId?: string }
  if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const patch: Record<string, unknown> = { handled_at: new Date().toISOString() }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return NextResponse.json({ error: 'Unknown status' }, { status: 400 })
    patch.status = body.status
  }
  if (body.staffNote !== undefined) patch.staff_note = String(body.staffNote).slice(0, 2000) || null
  if (body.sellerId !== undefined) patch.seller_id = body.sellerId || null
  const { error } = await auth.admin.from('seller_applications' as never).update(patch as never).eq('id', body.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
