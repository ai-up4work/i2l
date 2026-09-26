// app/api/admin/wishdrop-mall/categories/[categoryId]/route.ts
//
// PATCH  -> { name?, description?, imageUrl?, active? }. Renaming also
//           updates products.category text on every product in it.
// DELETE -> removes the category; its products become uncategorized
//           (they are NOT deleted).
//
// Super admin only.

import { NextRequest, NextResponse } from 'next/server'
import { requireStaffRole, SUPER_ADMIN_ONLY } from '@/lib/supabase/admin-auth'
import { MALL_CATEGORY_COLUMNS, getMallStore } from '@/lib/wishdrop-mall/admin'
import { categorySlug } from '@/lib/wishdrop-mall'

type Params = { params: Promise<{ categoryId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireStaffRole(SUPER_ADMIN_ONLY)
  if (!auth.ok) return auth.response
  const { admin } = auth
  const { categoryId } = await params

  const body = (await req.json().catch(() => ({}))) as { name?: string; description?: string; imageUrl?: string; active?: boolean }
  const patch: { name?: string; slug?: string; description?: string | null; image_url?: string | null; active?: boolean; updated_at: string } = {
    updated_at: new Date().toISOString(),
  }

  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 60)
    if (!name) return NextResponse.json({ error: 'Category name is required.' }, { status: 400 })
    if (name.toLowerCase() === 'general') return NextResponse.json({ error: '"General" is reserved for uncategorized products.' }, { status: 400 })
    const slug = categorySlug(name)
    if (!slug) return NextResponse.json({ error: 'Use at least one letter or number in the name.' }, { status: 400 })
    patch.name = name
    patch.slug = slug
  }
  if (body.description !== undefined) patch.description = String(body.description).trim().slice(0, 500) || null
  if (body.imageUrl !== undefined) {
    const url = String(body.imageUrl).trim()
    if (url && !/^https?:\/\//i.test(url)) return NextResponse.json({ error: 'Image link must start with https://' }, { status: 400 })
    patch.image_url = url || null
  }
  if (body.active !== undefined) patch.active = Boolean(body.active)

  const { data, error } = await admin.from('mall_categories').update(patch).eq('id', categoryId).select(MALL_CATEGORY_COLUMNS).maybeSingle()
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Another category already has that name.' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Category not found.' }, { status: 404 })

  if (patch.name) {
    const store = await getMallStore(admin)
    if (store) {
      await admin.from('products').update({ category: patch.name }).eq('mall_category_id', categoryId).eq('seller_id', store.id)
    }
  }
  return NextResponse.json({ category: data })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requireStaffRole(SUPER_ADMIN_ONLY)
  if (!auth.ok) return auth.response
  const { admin } = auth
  const { categoryId } = await params

  // Uncategorize its products first (the FK would null the id anyway, but
  // the category text needs resetting too).
  const { error: moveError } = await admin
    .from('products')
    .update({ mall_category_id: null, category: 'General' })
    .eq('mall_category_id', categoryId)
  if (moveError) return NextResponse.json({ error: moveError.message }, { status: 500 })

  const { data, error } = await admin.from('mall_categories').delete().eq('id', categoryId).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Category not found.' }, { status: 404 })
  return NextResponse.json({ deleted: true })
}
