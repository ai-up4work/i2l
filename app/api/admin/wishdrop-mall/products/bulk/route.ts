// app/api/admin/wishdrop-mall/products/bulk/route.ts
//
// POST { ids: string[], action: 'hide' | 'show' | 'delete' | 'category', categoryId? }
//   'category' moves the products into categoryId (null = uncategorized).
//   Applies one action to many Wishdrop Mall products at once — e.g.
//   everything imported from one store. Only ids that really belong to
//   the Mall are touched (scoped by seller_id). Delete is permanent
//   (reviews cascade; past orders keep their own copy).
//
// Super admin only.

import { NextRequest, NextResponse } from 'next/server'
import { requireStaffRole, SUPER_ADMIN_ONLY } from '@/lib/supabase/admin-auth'
import { assignMallCategory, getMallStore } from '@/lib/wishdrop-mall/admin'

const MAX_IDS = 500

export async function POST(req: NextRequest) {
  const auth = await requireStaffRole(SUPER_ADMIN_ONLY)
  if (!auth.ok) return auth.response
  const { admin } = auth

  const body = (await req.json().catch(() => ({}))) as { ids?: unknown; action?: unknown; categoryId?: unknown }
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string').slice(0, MAX_IDS) : []
  const action = body.action
  if (ids.length === 0) return NextResponse.json({ error: 'No products selected.' }, { status: 400 })
  if (action !== 'hide' && action !== 'show' && action !== 'delete' && action !== 'category') {
    return NextResponse.json({ error: "action must be 'hide', 'show', 'delete' or 'category'." }, { status: 400 })
  }

  const store = await getMallStore(admin).catch(() => null)
  if (!store) return NextResponse.json({ error: 'Wishdrop Mall has not been set up yet.' }, { status: 404 })

  if (action === 'category') {
    const categoryId = typeof body.categoryId === 'string' && body.categoryId ? body.categoryId : null
    try {
      const affected = await assignMallCategory(admin, store.id, ids, categoryId)
      return NextResponse.json({ affected })
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 400 })
    }
  }

  const query =
    action === 'delete'
      ? admin.from('products').delete().in('id', ids).eq('seller_id', store.id).select('id')
      : admin
          .from('products')
          .update({ active: action === 'show', updated_at: new Date().toISOString() })
          .in('id', ids)
          .eq('seller_id', store.id)
          .select('id')

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ affected: ((data ?? []) as { id: string }[]).map((r) => r.id) })
}
