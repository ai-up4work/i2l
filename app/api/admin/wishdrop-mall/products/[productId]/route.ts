// app/api/admin/wishdrop-mall/products/[productId]/route.ts
//
// PATCH  -> { priceLKR?, compareAtLKR? (null clears it), active?, name?, category? }
//           The LKR price is set directly — it's exactly what the shopper
//           pays before delivery. Setting a price also clears any
//           per-option prices so every size/colour inherits it.
// DELETE -> permanent removal. (Hiding with PATCH { active: false } is
//           the reversible alternative.) Deleting also removes its
//           reviews (FK cascade); past orders keep their own copy of the
//           title/price, so they're unaffected.

import { NextRequest, NextResponse } from 'next/server'
import { requireStaffRole, SUPER_ADMIN_ONLY } from '@/lib/supabase/admin-auth'
import {
  MALL_PRODUCT_COLUMNS,
  compareAtOrNull,
  getMallStore,
  loadMallProduct,
  toLKR,
} from '@/lib/wishdrop-mall/admin'
import { MALL_CURRENCY } from '@/lib/wishdrop-mall'

type Params = { params: Promise<{ productId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireStaffRole(SUPER_ADMIN_ONLY)
  if (!auth.ok) return auth.response
  const { admin } = auth
  const { productId } = await params

  const body = (await req.json().catch(() => ({}))) as {
    priceLKR?: number
    compareAtLKR?: number | null
    active?: boolean
    name?: string
    category?: string
  }

  let newPrice: number | null = null
  if (body.priceLKR !== undefined) {
    newPrice = toLKR(body.priceLKR)
    if (newPrice == null) return NextResponse.json({ error: 'Price must be a positive amount in LKR.' }, { status: 400 })
  }

  try {
    const store = await getMallStore(admin)
    if (!store) return NextResponse.json({ error: 'Wishdrop Mall has not been set up yet.' }, { status: 404 })
    const existing = await loadMallProduct(admin, store.id, productId)
    if (!existing) return NextResponse.json({ error: 'Product not found in Wishdrop Mall.' }, { status: 404 })

    const patch: {
      updated_at: string
      active?: boolean
      name?: string
      category?: string
      price?: number
      currency?: string
      compare_at_price?: number | null
      cost_price?: null
      margin_percent?: null
    } = { updated_at: new Date().toISOString() }

    if (body.active !== undefined) patch.active = Boolean(body.active)
    if (body.name !== undefined) {
      const name = String(body.name).trim().slice(0, 200)
      if (!name) return NextResponse.json({ error: 'Name cannot be empty.' }, { status: 400 })
      patch.name = name
    }
    if (body.category !== undefined) patch.category = String(body.category).trim().slice(0, 80) || 'General'

    const effectivePrice = newPrice ?? existing.price
    if (newPrice != null) {
      patch.price = newPrice
      // Normalise anything added before LKR pricing existed.
      patch.currency = MALL_CURRENCY
      patch.cost_price = null
      patch.margin_percent = null
    }
    if (body.compareAtLKR !== undefined) {
      patch.compare_at_price = body.compareAtLKR === null ? null : compareAtOrNull(body.compareAtLKR, effectivePrice)
    } else if (newPrice != null && existing.compare_at_price != null && existing.compare_at_price <= newPrice) {
      // A "was" price that's no longer higher than the price is meaningless.
      patch.compare_at_price = null
    }

    const { data, error } = await admin
      .from('products')
      .update(patch)
      .eq('id', productId)
      .select(MALL_PRODUCT_COLUMNS)
      .single()
    if (error) throw error

    if (newPrice != null) {
      const { error: vErr } = await admin
        .from('product_variants')
        .update({ price: null, compare_at_price: null })
        .eq('product_id', productId)
      if (vErr) throw vErr
    }

    return NextResponse.json({ product: data })
  } catch (err) {
    const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requireStaffRole(SUPER_ADMIN_ONLY)
  if (!auth.ok) return auth.response
  const { admin } = auth
  const { productId } = await params

  try {
    const store = await getMallStore(admin)
    if (!store) return NextResponse.json({ error: 'Wishdrop Mall has not been set up yet.' }, { status: 404 })
    const existing = await loadMallProduct(admin, store.id, productId)
    if (!existing) return NextResponse.json({ error: 'Product not found in Wishdrop Mall.' }, { status: 404 })

    const { error } = await admin.from('products').delete().eq('id', productId)
    if (error) throw error
    return NextResponse.json({ deleted: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
