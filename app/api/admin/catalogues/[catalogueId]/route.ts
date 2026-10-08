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
import { cleanSellerInput, friendlyDbError, type SellerProductInput } from '@/app/api/seller/lib'
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

const PRODUCT_SELECT = '*, sellers(id, name, platform_slug, default_margin_percent)'

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ catalogueId: string }> }) {
  const auth = await requireStaffRole(SOURCING_ROLES)
  if (!auth.ok) return auth.response
  const { admin } = auth

  const { catalogueId } = await params
  const { data, error } = await admin.from('products').select(PRODUCT_SELECT).eq('id', catalogueId).maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Catalogue entry not found' }, { status: 404 })
  return NextResponse.json({ product: data })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ catalogueId: string }> }) {
  const auth = await requireStaffRole(SOURCING_ROLES)
  if (!auth.ok) return auth.response
  const { admin } = auth

  const { catalogueId } = await params
  const mallRejection = await rejectMallProduct(admin, catalogueId)
  if (mallRejection) return mallRejection
  const body = (await req.json().catch(() => ({}))) as SellerProductInput & { marginPercent?: number | string }

  const cleaned = cleanSellerInput(body, false)
  if ('error' in cleaned) return NextResponse.json({ error: cleaned.error }, { status: 400 })
  const { fields } = cleaned

  let marginPercent: number | undefined
  if (body.marginPercent !== undefined && body.marginPercent !== '') {
    marginPercent = Number(body.marginPercent)
    if (!Number.isFinite(marginPercent) || marginPercent < 0 || marginPercent > 1000) {
      return NextResponse.json({ error: 'Enter a valid margin percentage.' }, { status: 400 })
    }
  }

  if (Object.keys(fields).length === 0 && marginPercent === undefined) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const patch: typeof fields & { price?: number; margin_percent?: number; updated_at: string } = {
    ...fields,
    updated_at: new Date().toISOString(),
  }

  if (marginPercent !== undefined || fields.cost_price !== undefined) {
    // price is derived — never set directly; recompute from cost + margin
    // whenever either changes so the two can't drift apart.
    const { data: existing, error: fetchError } = await admin
      .from('products')
      .select('cost_price, margin_percent, sellers(default_margin_percent)')
      .eq('id', catalogueId)
      .maybeSingle()

    if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
    if (!existing) return NextResponse.json({ error: 'Catalogue entry not found' }, { status: 404 })
    const row = existing as unknown as {
      cost_price: number | null
      margin_percent: number | null
      sellers: { default_margin_percent: number | null } | null
    }

    const margin = marginPercent ?? row.margin_percent ?? Number(row.sellers?.default_margin_percent ?? 25)
    const cost = fields.cost_price ?? row.cost_price
    patch.margin_percent = margin
    if (cost != null) patch.price = round2(cost * (1 + margin / 100))
  }

  const { data, error } = await admin
    .from('products')
    .update(patch)
    .eq('id', catalogueId)
    .select(PRODUCT_SELECT)
    .maybeSingle()

  if (error) return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Catalogue entry not found' }, { status: 404 })
  return NextResponse.json({ product: data })
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
