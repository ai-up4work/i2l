// app/api/admin/catalogues/[catalogueId]/route.ts
//
// GET    -> fetch one catalogue (products row) by id, admin view
// PATCH  -> the two things admin actually controls per the current
//           decision (see app/admin/(sales)/catalogues/[catalogueId]/page.tsx):
//             { marginPercent }  -> update margin_percent, recompute price
//             { active }         -> show/hide the listing
//           Sellers own name/description/cost_price/stock_count/images
//           themselves via their own portal (app/seller/(dashboard)/products),
//           so this route intentionally does not accept those fields.
// DELETE -> soft delete only (active = false). Per the admin route spec,
//           catalogue entries are never hard-deleted from here — a real
//           hard-delete (if ever needed) is Manager/Super Admin territory
//           and isn't exposed in this UI.
//
// Gated to SOURCING_ROLES (Super Admin / Manager / Sales & Purchase).
// Previously this only checked "someone is logged in" while writing with
// the service role — so any customer or seller account could change any
// product's margin or hide it. Wishdrop Mall products are excluded: they
// have their own LKR pricing, managed at /admin/wishdrop-mall.

import { NextRequest, NextResponse } from 'next/server'
import { requireStaffRole, SOURCING_ROLES } from '@/lib/supabase/admin-auth'
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

const PRODUCT_SELECT = '*, sellers(name, platform_slug)'

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
  const body = await req.json()
  const { marginPercent, active } = body as { marginPercent?: number; active?: boolean }

  if (marginPercent === undefined && active === undefined) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }
  if (marginPercent !== undefined && (!Number.isFinite(marginPercent) || marginPercent < 0)) {
    return NextResponse.json({ error: 'marginPercent must be a non-negative number' }, { status: 400 })
  }

  const patch: {
    active?: boolean
    margin_percent?: number
    price?: number
    updated_at: string
  } = { updated_at: new Date().toISOString() }

  if (active !== undefined) patch.active = active

  if (marginPercent !== undefined) {
    // price is a derived field — never let a client set it directly, always
    // recompute from cost_price + margin so the two can't drift apart (this
    // is the exact failure mode flagged in the route spec for this page).
    const { data: existing, error: fetchError } = await admin
      .from('products')
      .select('cost_price')
      .eq('id', catalogueId)
      .maybeSingle()

    if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
    if (!existing) return NextResponse.json({ error: 'Catalogue entry not found' }, { status: 404 })

    patch.margin_percent = marginPercent
    if (existing.cost_price != null) {
      patch.price = round2(existing.cost_price * (1 + marginPercent / 100))
    }
  }

  const { data, error } = await admin
    .from('products')
    .update(patch)
    .eq('id', catalogueId)
    .select(PRODUCT_SELECT)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Catalogue entry not found' }, { status: 404 })
  return NextResponse.json({ product: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ catalogueId: string }> }) {
  const auth = await requireStaffRole(SOURCING_ROLES)
  if (!auth.ok) return auth.response
  const { admin } = auth

  const { catalogueId } = await params
  const mallRejection = await rejectMallProduct(admin, catalogueId)
  if (mallRejection) return mallRejection
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
