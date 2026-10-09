// app/api/seller/products/[productId]/route.ts
//
// PATCH  -> edit one of the seller's OWN products (any of the editor's
//           fields, or just { active } from the list). Prices are worked
//           out on the server with the product's own margin.
// DELETE -> remove one of the seller's own products.
//
// Every query is scoped to seller_id = the logged-in seller.

import { NextRequest, NextResponse } from 'next/server'
import { requireSeller } from '@/lib/supabase/seller-auth'
import { cleanProductInput, friendlyDbError, loadEditableProduct, updateProduct, type ProductInput } from '@/lib/catalogue-products'

type Params = { params: Promise<{ productId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireSeller()
  if (!auth.ok) return auth.response
  const { admin, seller } = auth
  const { productId } = await params

  const body = (await req.json().catch(() => ({}))) as ProductInput
  const clean = cleanProductInput(body, false)
  if ('error' in clean) return NextResponse.json({ error: clean.error }, { status: 400 })

  const saved = await updateProduct(admin, productId, clean, { sellerId: seller.id, fallbackMargin: seller.defaultMarginPercent })
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status })

  const { data, error } = await loadEditableProduct(admin, productId, seller.id)
  if (error) return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 })
  return NextResponse.json({ product: data })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requireSeller()
  if (!auth.ok) return auth.response
  const { admin, seller } = auth
  const { productId } = await params

  const { data, error } = await admin.from('products').delete().eq('id', productId).eq('seller_id', seller.id).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data || data.length === 0) return NextResponse.json({ error: 'Product not found.' }, { status: 404 })
  return NextResponse.json({ deleted: true })
}
