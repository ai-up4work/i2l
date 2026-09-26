// app/api/admin/wishdrop-mall/products/route.ts
//
// POST -> create a Wishdrop Mall product from the product editor.
//   Body: MallProductInput (lib/wishdrop-mall.ts) + { allowDuplicate? }.
//   Works the same whether staff typed everything by hand or the editor
//   was pre-filled from a link / another store — either way the editor's
//   final content is what gets saved.
//
// Pricing is LKR, set by staff; shoppers pay it + the flat delivery fee.
// Every field is validated server-side in cleanMallInput; the opening
// stock is logged. Image links are saved as they are: an external image
// stays a link to the supplier's site, and only photos staff upload from
// their computer (via /api/upload) live in our own Storage.
//
// Super admin only.

import { NextRequest, NextResponse } from 'next/server'
import { requireStaffRole, SUPER_ADMIN_ONLY } from '@/lib/supabase/admin-auth'
import {
  MALL_PRODUCT_COLUMNS,
  cleanMallInput,
  findMallDuplicate,
  getMallStore,
  resolveMallCategory,
  logManualStockChanges,
  syncMallVariants,
} from '@/lib/wishdrop-mall/admin'
import { mallHandle, type MallProductInput } from '@/lib/wishdrop-mall'

export async function POST(req: NextRequest) {
  const auth = await requireStaffRole(SUPER_ADMIN_ONLY)
  if (!auth.ok) return auth.response
  const { admin } = auth

  const body = (await req.json().catch(() => ({}))) as Partial<MallProductInput> & { allowDuplicate?: boolean }
  const cleaned = cleanMallInput(body)
  if ('error' in cleaned) return NextResponse.json({ error: cleaned.error }, { status: 400 })
  const { fields, variants } = cleaned

  try {
    const store = await getMallStore(admin)
    if (!store) return NextResponse.json({ error: 'Set up Wishdrop Mall first.' }, { status: 404 })

    if (!body.allowDuplicate && (fields.source_handle || fields.source_url)) {
      const dup = await findMallDuplicate(admin, store.id, {
        platform: fields.source_platform ?? '',
        handle: fields.source_handle,
        url: fields.source_url,
      })
      if (dup) {
        return NextResponse.json({ error: `Already in Wishdrop Mall as "${dup.name}".`, duplicateOf: dup }, { status: 409 })
      }
    }

    const categoryError = await resolveMallCategory(admin, cleaned.fields)
    if (categoryError) return NextResponse.json({ error: categoryError }, { status: 400 })

    const now = new Date().toISOString()
    let productId: string | null = null
    // Handle carries a random suffix; retry once on the rare collision.
    for (let attempt = 0; attempt < 2 && !productId; attempt++) {
      const { data, error } = await admin
        .from('products')
        .insert({
          ...fields,
          seller_id: store.id,
          handle: mallHandle(fields.name),
          condition: 'New',
          source_synced_at: fields.source_url || fields.source_handle ? now : null,
          created_at: now,
          updated_at: now,
        })
        .select('id')
        .single()
      if (error) {
        if (error.code === '23505' && attempt === 0) continue
        throw error
      }
      productId = (data as { id: string }).id
    }
    if (!productId) throw new Error('Could not create the product.')

    try {
      await syncMallVariants(admin, productId, variants)
    } catch (variantError) {
      // Don't leave a half-saved product behind.
      await admin.from('products').delete().eq('id', productId)
      throw variantError
    }

    await logManualStockChanges(admin, productId, null)

    const { data: product, error: readError } = await admin
      .from('products')
      .select(MALL_PRODUCT_COLUMNS)
      .eq('id', productId)
      .single()
    if (readError) throw readError

    return NextResponse.json(
      { product: { ...(product as object), variant_count: variants.length } },
      { status: 201 },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? 'Unknown error'
    console.error('[wishdrop-mall/products POST]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
