// app/api/seller/products/[productId]/route.ts
//
// PATCH  -> edit one of the seller's OWN products. If the cost changes,
//           price is recomputed with the product's existing margin (staff
//           may have set a per-product margin in Catalogues).
// DELETE -> remove one of the seller's own products.
//
// Every query is scoped to seller_id = the logged-in seller, so a seller
// can never read or change another seller's product.

import { NextRequest, NextResponse } from 'next/server'
import { requireSeller } from '@/lib/supabase/seller-auth'
import { SELLER_PRODUCT_COLUMNS, cleanSellerInput, sellerPrice, type SellerProductInput } from '../../lib'

type Params = { params: Promise<{ productId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireSeller()
  if (!auth.ok) return auth.response
  const { admin, seller } = auth
  const { productId } = await params

  const body = (await req.json().catch(() => ({}))) as SellerProductInput
  const cleaned = cleanSellerInput(body, false)
  if ('error' in cleaned) return NextResponse.json({ error: cleaned.error }, { status: 400 })
  const { fields } = cleaned
  if (Object.keys(fields).length === 0) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })

  const { data: existing, error: findError } = await admin
    .from('products')
    .select('id, margin_percent')
    .eq('id', productId)
    .eq('seller_id', seller.id)
    .maybeSingle()
  if (findError) return NextResponse.json({ error: findError.message }, { status: 500 })
  if (!existing) return NextResponse.json({ error: 'Product not found.' }, { status: 404 })

  const update: typeof fields & { price?: number; margin_percent?: number; updated_at: string } = {
    ...fields,
    updated_at: new Date().toISOString(),
  }
  if (fields.cost_price !== undefined) {
    const margin = (existing as { margin_percent: number | null }).margin_percent ?? seller.defaultMarginPercent
    update.margin_percent = margin
    update.price = sellerPrice(fields.cost_price, margin)
  }

  const { data, error } = await admin
    .from('products')
    .update(update)
    .eq('id', productId)
    .eq('seller_id', seller.id)
    .select(SELLER_PRODUCT_COLUMNS)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ product: data })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requireSeller()
  if (!auth.ok) return auth.response
  const { admin, seller } = auth
  const { productId } = await params

  const { data, error } = await admin
    .from('products')
    .delete()
    .eq('id', productId)
    .eq('seller_id', seller.id)
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data || data.length === 0) return NextResponse.json({ error: 'Product not found.' }, { status: 404 })
  return NextResponse.json({ deleted: true })
}
