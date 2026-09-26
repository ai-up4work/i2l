// app/api/admin/wishdrop-mall/categories/reorder/route.ts
//
// POST { ids: string[] } -> saves this as the storefront order (first =
// shown first). Super admin only.

import { NextRequest, NextResponse } from 'next/server'
import { requireStaffRole, SUPER_ADMIN_ONLY } from '@/lib/supabase/admin-auth'

export async function POST(req: NextRequest) {
  const auth = await requireStaffRole(SUPER_ADMIN_ONLY)
  if (!auth.ok) return auth.response
  const { admin } = auth

  const body = (await req.json().catch(() => ({}))) as { ids?: unknown }
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string').slice(0, 500) : []
  if (ids.length === 0) return NextResponse.json({ error: 'No categories given.' }, { status: 400 })

  for (let i = 0; i < ids.length; i++) {
    const { error } = await admin.from('mall_categories').update({ sort_order: (i + 1) * 10 }).eq('id', ids[i])
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
