// app/api/admin/wishdrop-mall/products/route.ts
//
// POST -> add a product to Wishdrop Mall.
//   {
//     draft: MallDraft,        // from /api/admin/wishdrop-mall/preview
//     priceLKR: number,        // the selling price, set by staff, in LKR
//     compareAtLKR?: number,   // optional "was" price, must be higher
//     name?, category?,        // staff edits from the preview
//     active?: boolean,        // default true — live immediately
//     allowDuplicate?: boolean // skip the "already imported" check
//   }
//
// Mall pricing is deliberately simple: the LKR price staff set is exactly
// what the shopper pays, plus the flat delivery fee added at checkout
// (lib/pricing.ts). No margin %, no import formula, no tax. What Wishdrop
// pays at the source is kept separately in source_price/source_currency
// for reference and re-checking.
//
// All options (sizes/colours) share the product's price; variant.price is
// left null so it inherits.

import { NextRequest, NextResponse } from 'next/server'
import { requireStaffRole, SUPER_ADMIN_ONLY } from '@/lib/supabase/admin-auth'
import {
  MALL_PRODUCT_COLUMNS,
  compareAtOrNull,
  findMallDuplicate,
  getMallStore,
  toLKR,
} from '@/lib/wishdrop-mall/admin'
import { MALL_CURRENCY, mallHandle, type MallDraft } from '@/lib/wishdrop-mall'

const MAX_IMAGES = 20
const MAX_VARIANTS = 250

export async function POST(req: NextRequest) {
  const auth = await requireStaffRole(SUPER_ADMIN_ONLY)
  if (!auth.ok) return auth.response
  const { admin } = auth

  const body = (await req.json().catch(() => ({}))) as {
    draft?: MallDraft
    priceLKR?: number
    compareAtLKR?: number | null
    name?: string
    category?: string
    active?: boolean
    allowDuplicate?: boolean
  }

  const draft = body.draft
  if (!draft || typeof draft !== 'object' || !draft.source) {
    return NextResponse.json({ error: 'Missing product draft — preview the product first.' }, { status: 400 })
  }

  const price = toLKR(body.priceLKR)
  if (price == null) return NextResponse.json({ error: 'Enter the selling price in LKR.' }, { status: 400 })

  const name = String(body.name ?? draft.name ?? '').trim().slice(0, 200)
  if (!name) return NextResponse.json({ error: 'Product name is required.' }, { status: 400 })
  const category = String(body.category ?? draft.category ?? 'General').trim().slice(0, 80) || 'General'

  try {
    const store = await getMallStore(admin)
    if (!store) return NextResponse.json({ error: 'Set up Wishdrop Mall first.' }, { status: 404 })

    if (!body.allowDuplicate) {
      const dup = await findMallDuplicate(admin, store.id, draft.source)
      if (dup) {
        return NextResponse.json({ error: `Already in Wishdrop Mall as "${dup.name}".`, duplicateOf: dup }, { status: 409 })
      }
    }

    const now = new Date().toISOString()
    const sourcePrice =
      typeof draft.costPrice === 'number' && Number.isFinite(draft.costPrice) && draft.costPrice > 0 ? draft.costPrice : null

    const baseInsert = {
      seller_id: store.id,
      name,
      description: (draft.description ?? '').slice(0, 5000) || null,
      full_description: draft.fullDescription ? draft.fullDescription.slice(0, 20000) : null,
      category,
      condition: 'New',
      tags: Array.isArray(draft.tags) ? draft.tags.slice(0, 30).map(String) : [],
      gender: draft.gender === 'men' || draft.gender === 'women' || draft.gender === 'unisex' ? draft.gender : null,
      sku: draft.sku ?? null,
      cost_price: null,
      margin_percent: null,
      price,
      compare_at_price: compareAtOrNull(body.compareAtLKR, price),
      currency: MALL_CURRENCY,
      weight_kg: typeof draft.weightKg === 'number' ? draft.weightKg : null,
      images: (Array.isArray(draft.images) ? draft.images : [])
        .filter((u) => typeof u === 'string' && u)
        .slice(0, MAX_IMAGES),
      stock_count: typeof draft.stockCount === 'number' ? draft.stockCount : null,
      active: body.active ?? true,
      source_platform: String(draft.source.platform ?? '').slice(0, 120) || null,
      source_handle: draft.source.handle ? String(draft.source.handle).slice(0, 300) : null,
      source_url: draft.source.url ? String(draft.source.url).slice(0, 2000) : null,
      source_price: sourcePrice,
      source_currency: draft.currency ?? null,
      source_synced_at: now,
      created_at: now,
      updated_at: now,
    }

    // Handle carries a random suffix; retry once on the rare collision.
    let inserted: { id: string } | null = null
    for (let attempt = 0; attempt < 2 && !inserted; attempt++) {
      const { data, error } = await admin
        .from('products')
        .insert({ ...baseInsert, handle: mallHandle(name) })
        .select('id')
        .single()
      if (error) {
        if (error.code === '23505' && attempt === 0) continue
        throw error
      }
      inserted = data as { id: string }
    }
    if (!inserted) throw new Error('Could not create the product.')

    const variants = (Array.isArray(draft.variants) ? draft.variants : []).slice(0, MAX_VARIANTS)
    if (variants.length > 0) {
      const rows = variants.map((v) => ({
        product_id: inserted!.id,
        label: String(v.label || 'Default').slice(0, 200),
        sku: v.sku ?? null,
        options: v.options && typeof v.options === 'object' ? v.options : {},
        price: null, // inherits the product's LKR price
        compare_at_price: null,
        cost_price: null,
        available: v.available !== false,
        image_url: v.imageUrl ?? null,
      }))
      const { error: variantError } = await admin.from('product_variants').insert(rows)
      if (variantError) {
        // Don't leave a half-imported product behind.
        await admin.from('products').delete().eq('id', inserted.id)
        throw variantError
      }
    }

    const { data: product, error: readError } = await admin
      .from('products')
      .select(MALL_PRODUCT_COLUMNS)
      .eq('id', inserted.id)
      .single()
    if (readError) throw readError

    return NextResponse.json({ product: { ...(product as object), variant_count: variants.length } }, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? 'Unknown error'
    console.error('[wishdrop-mall/products POST]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
