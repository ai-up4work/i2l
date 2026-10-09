// app/api/admin/catalogues/[catalogueId]/route.ts
//
// GET    -> one product (any status), with its seller.
// PATCH  -> staff can edit everything the seller can (name, description,
//           category, cost, stock, weight, photos, videos, visibility)
//           PLUS the one thing only staff control: { marginPercent }.
//           A selling price is never accepted: it is always recomputed
//           as cost × (1 + margin%) whenever either one changes.
// DELETE -> hides the product (active = false). Add ?permanent=1 to
//           remove it for good — Manager / Super Admin only.
//
// Gated to SOURCING_ROLES (Super Admin / Manager / Sales & Purchase).
// Wishdrop Mall products are excluded: they have their own LKR pricing,
// managed at /admin/super-admin/wishdrop-mall.

import { NextRequest, NextResponse } from 'next/server'
import { requireStaffRole, SOURCING_ROLES, DELETE_ROLES } from '@/lib/supabase/admin-auth'
import { productCollectionIds } from '@/lib/store-collections'
import { PRODUCT_EDIT_SELECT, cleanProductInput, friendlyDbError, updateProduct, type ProductInput } from '@/lib/catalogue-products'
import { WISHDROP_MALL_SLUG } from '@/lib/wishdrop-mall'

type AdminClient = Extract<Awaited<ReturnType<typeof requireStaffRole>>, { ok: true }>['admin']

/** 400 response if this product belongs to Wishdrop Mall, else null. */
async function rejectMallProduct(admin: AdminClient, productId: string) {
  const { data } = await admin.from('products').select('seller_id, sellers(platform_slug)').eq('id', productId).maybeSingle()
  const slug = (data as unknown as { sellers: { platform_slug: string } | null } | null)?.sellers?.platform_slug
  if (slug === WISHDROP_MALL_SLUG) {
    return NextResponse.json({ error: 'Wishdrop Mall products are managed on the Wishdrop Mall page.' }, { status: 400 })
  }
  return null
}

const PRODUCT_SELECT = `${PRODUCT_EDIT_SELECT}, sellers(id, name, platform_slug, default_margin_percent)`

export async function GET(_req: NextRequest, { params }: { params: Promise<{ catalogueId: string }> }) {
  const auth = await requireStaffRole(SOURCING_ROLES)
  if (!auth.ok) return auth.response
  const { admin } = auth

  const { catalogueId } = await params
  const { data, error } = await admin.from('products').select(PRODUCT_SELECT).eq('id', catalogueId).maybeSingle()

  if (error) return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Catalogue entry not found' }, { status: 404 })
  return NextResponse.json({ product: { ...(data as object), collection_ids: await productCollectionIds(admin, catalogueId) } })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ catalogueId: string }> }) {
  const auth = await requireStaffRole(SOURCING_ROLES)
  if (!auth.ok) return auth.response
  const { admin } = auth

  const { catalogueId } = await params
  const mallRejection = await rejectMallProduct(admin, catalogueId)
  if (mallRejection) return mallRejection

  const body = (await req.json().catch(() => ({}))) as ProductInput & { marginPercent?: number | string }
  const clean = cleanProductInput(body, false)
  if ('error' in clean) return NextResponse.json({ error: clean.error }, { status: 400 })

  let newMargin: number | undefined
  if (body.marginPercent !== undefined && body.marginPercent !== '') {
    newMargin = Number(body.marginPercent)
    if (!Number.isFinite(newMargin) || newMargin < 0 || newMargin > 1000) {
      return NextResponse.json({ error: 'Enter a valid margin percentage.' }, { status: 400 })
    }
  }
  if (Object.keys(clean.fields).length === 0 && newMargin === undefined && clean.variants === undefined && clean.collectionIds === undefined && clean.compareAtCost === undefined && clean.trackInventory === undefined && clean.stockCount === undefined) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { data: sellerInfo } = await admin.from('products').select('sellers(default_margin_percent)').eq('id', catalogueId).maybeSingle()
  const fallbackMargin = Number((sellerInfo as unknown as { sellers: { default_margin_percent: number | null } | null } | null)?.sellers?.default_margin_percent ?? 25)

  const saved = await updateProduct(admin, catalogueId, clean, { newMargin, fallbackMargin })
  if (!saved.ok) return NextResponse.json({ error: saved.error === 'Product not found.' ? 'Catalogue entry not found' : saved.error }, { status: saved.status })

  const { data, error } = await admin.from('products').select(PRODUCT_SELECT).eq('id', catalogueId).maybeSingle()
  if (error) return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 })
  return NextResponse.json({ product: { ...(data as object), collection_ids: await productCollectionIds(admin, catalogueId) } })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ catalogueId: string }> }) {
  const permanent = req.nextUrl.searchParams.get('permanent') === '1'
  const auth = await requireStaffRole(permanent ? DELETE_ROLES : SOURCING_ROLES)
  if (!auth.ok) return auth.response
  const { admin } = auth

  const { catalogueId } = await params
  const mallRejection = await rejectMallProduct(admin, catalogueId)
  if (mallRejection) return mallRejection

  if (permanent) {
    const { data, error } = await admin.from('products').delete().eq('id', catalogueId).select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) return NextResponse.json({ error: 'Catalogue entry not found' }, { status: 404 })
    return NextResponse.json({ deleted: true })
  }

  const { data, error } = await admin
    .from('products')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', catalogueId)
    .select(PRODUCT_SELECT)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Catalogue entry not found' }, { status: 404 })
  return NextResponse.json({ product: data, deactivated: true })
}
