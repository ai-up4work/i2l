// app/api/admin/wishdrop-mall/categories/route.ts
//
// GET  -> all Mall categories in storefront order, with product counts.
// POST -> create { name, description?, imageUrl? }. New categories go to
//         the end of the list.
//
// Super admin only.

import { NextRequest, NextResponse } from 'next/server'
import { requireStaffRole, SUPER_ADMIN_ONLY } from '@/lib/supabase/admin-auth'
import { MALL_CATEGORY_COLUMNS, getMallStore, listMallCategories } from '@/lib/wishdrop-mall/admin'
import { categorySlug } from '@/lib/wishdrop-mall'

export async function GET() {
  const auth = await requireStaffRole(SUPER_ADMIN_ONLY)
  if (!auth.ok) return auth.response
  const { admin } = auth
  try {
    const store = await getMallStore(admin)
    if (!store) return NextResponse.json({ categories: [] })
    return NextResponse.json({ categories: await listMallCategories(admin, store.id) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireStaffRole(SUPER_ADMIN_ONLY)
  if (!auth.ok) return auth.response
  const { admin } = auth

  const body = (await req.json().catch(() => ({}))) as { name?: string; description?: string; imageUrl?: string }
  const name = String(body.name ?? '').trim().slice(0, 60)
  if (!name) return NextResponse.json({ error: 'Category name is required.' }, { status: 400 })
  if (name.toLowerCase() === 'general') return NextResponse.json({ error: '"General" is reserved for uncategorized products.' }, { status: 400 })
  const slug = categorySlug(name)
  if (!slug) return NextResponse.json({ error: 'Use at least one letter or number in the name.' }, { status: 400 })
  const imageUrl = String(body.imageUrl ?? '').trim()
  if (imageUrl && !/^https?:\/\//i.test(imageUrl)) return NextResponse.json({ error: 'Image link must start with https://' }, { status: 400 })

  const { data: last } = await admin.from('mall_categories').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle()

  const { data, error } = await admin
    .from('mall_categories')
    .insert({
      name,
      slug,
      description: String(body.description ?? '').trim().slice(0, 500) || null,
      image_url: imageUrl || null,
      sort_order: ((last as { sort_order: number } | null)?.sort_order ?? 0) + 10,
    })
    .select(MALL_CATEGORY_COLUMNS)
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: `A category called "${name}" already exists.` }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ category: { ...(data as object), product_count: 0, live_count: 0 } }, { status: 201 })
}
