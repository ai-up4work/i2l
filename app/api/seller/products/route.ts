// app/api/seller/products/route.ts
//
// GET  -> the logged-in seller's own products (active AND hidden).
// POST -> add a product. Price = cost × (1 + the seller's default
//         margin), computed here — see ../lib.ts.

import { NextRequest, NextResponse } from 'next/server'
import { requireSeller } from '@/lib/supabase/seller-auth'
import { mallHandle } from '@/lib/wishdrop-mall'
import { SELLER_PRODUCT_COLUMNS, cleanSellerInput, sellerPrice, type SellerProductInput } from '../lib'

export async function GET() {
  const auth = await requireSeller()
  if (!auth.ok) return auth.response
  const { admin, seller } = auth

  const { data, error } = await admin
    .from('products')
    .select(SELLER_PRODUCT_COLUMNS)
    .eq('seller_id', seller.id)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ products: data ?? [], defaultMarginPercent: seller.defaultMarginPercent })
}

export async function POST(req: NextRequest) {
  const auth = await requireSeller()
  if (!auth.ok) return auth.response
  const { admin, seller } = auth

  const body = (await req.json().catch(() => ({}))) as SellerProductInput
  const cleaned = cleanSellerInput(body, true)
  if ('error' in cleaned) return NextResponse.json({ error: cleaned.error }, { status: 400 })
  const { fields } = cleaned

  const margin = seller.defaultMarginPercent
  const now = new Date().toISOString()

  // Handle gets a short random suffix so two products with the same name
  // don't collide on (seller_id, handle); retry once on the rare clash.
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await admin
      .from('products')
      .insert({
        ...fields,
        name: fields.name as string,
        seller_id: seller.id,
        handle: mallHandle(fields.name as string),
        margin_percent: margin,
        price: sellerPrice(fields.cost_price as number, margin),
        currency: 'INR',
        active: fields.active ?? true,
        created_at: now,
        updated_at: now,
      })
      .select(SELLER_PRODUCT_COLUMNS)
      .single()
    if (!error) return NextResponse.json({ product: data }, { status: 201 })
    if (error.code !== '23505' || attempt === 1) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }
  return NextResponse.json({ error: 'Could not create the product.' }, { status: 500 })
}
