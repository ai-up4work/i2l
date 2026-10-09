// app/api/seller/products/route.ts
//
// GET  -> the logged-in seller's own products (active AND hidden), with
//         their variants.
// POST -> add a product. The seller sends THEIR price; Wishdrop's margin
//         (the seller's default) is applied on the server. Rules and
//         saving: lib/catalogue-products.ts.

import { NextRequest, NextResponse } from 'next/server'
import { requireSeller } from '@/lib/supabase/seller-auth'
import {
  PRODUCT_EDIT_SELECT,
  cleanProductInput,
  createProduct,
  friendlyDbError,
  loadEditableProduct,
  type ProductInput,
} from '@/lib/catalogue-products'

export async function GET() {
  const auth = await requireSeller()
  if (!auth.ok) return auth.response
  const { admin, seller } = auth

  const { data, error } = await admin
    .from('products')
    .select(PRODUCT_EDIT_SELECT)
    .eq('seller_id', seller.id)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 })
  return NextResponse.json({
    products: data ?? [],
    defaultMarginPercent: seller.defaultMarginPercent,
    seller: { id: seller.id, name: seller.name, slug: seller.platform, live: seller.status === 'active' },
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireSeller()
  if (!auth.ok) return auth.response
  const { admin, seller } = auth

  const body = (await req.json().catch(() => ({}))) as ProductInput
  const clean = cleanProductInput(body, true)
  if ('error' in clean) return NextResponse.json({ error: clean.error }, { status: 400 })

  const saved = await createProduct(admin, seller.id, seller.defaultMarginPercent, clean)
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status })

  const { data, error } = await loadEditableProduct(admin, saved.productId, seller.id)
  if (error) return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 })
  return NextResponse.json({ product: data }, { status: 201 })
}
