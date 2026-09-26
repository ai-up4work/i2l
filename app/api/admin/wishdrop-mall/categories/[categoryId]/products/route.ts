// app/api/admin/wishdrop-mall/categories/[categoryId]/products/route.ts
//
// PUT { productIds: string[] } -> makes exactly these products the
// category's products: listed ones move in (from wherever they were);
// products currently in it but not listed become uncategorized.
// Super admin only.

import { NextRequest, NextResponse } from 'next/server'
import { requireStaffRole, SUPER_ADMIN_ONLY } from '@/lib/supabase/admin-auth'
import { assignMallCategory, getMallStore } from '@/lib/wishdrop-mall/admin'

type Params = { params: Promise<{ categoryId: string }> }

export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requireStaffRole(SUPER_ADMIN_ONLY)
  if (!auth.ok) return auth.response
  const { admin } = auth
  const { categoryId } = await params

  const body = (await req.json().catch(() => ({}))) as { productIds?: unknown }
  const wanted = Array.isArray(body.productIds)
    ? Array.from(new Set(body.productIds.filter((x): x is string => typeof x === 'string'))).slice(0, 2000)
    : []

  try {
    const store = await getMallStore(admin)
    if (!store) return NextResponse.json({ error: 'Wishdrop Mall has not been set up yet.' }, { status: 404 })

    const { data: current, error } = await admin
      .from('products')
      .select('id')
      .eq('seller_id', store.id)
      .eq('mall_category_id', categoryId)
    if (error) throw error
    const wantedSet = new Set(wanted)
    const removed = ((current ?? []) as { id: string }[]).map((r) => r.id).filter((id) => !wantedSet.has(id))

    const added = await assignMallCategory(admin, store.id, wanted, categoryId)
    const cleared = await assignMallCategory(admin, store.id, removed, null)
    return NextResponse.json({ inCategory: added, removed: cleared })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
