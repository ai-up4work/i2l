// app/api/admin/wishdrop-mall/products/[productId]/refresh/route.ts
//
// POST -> re-check the product at its source: records the source's
//         current price, stock, and which options (sizes/colours) are
//         still offered.
//
// It NEVER changes the Mall's selling price — that's set by staff in LKR.
// If the source price moved, the response says so, so staff can decide
// whether to re-price. Options the source dropped are marked unavailable
// and new ones are added (inheriting the product's price). A sold-out
// source is reported as a warning, not auto-hidden.

import { NextRequest, NextResponse } from 'next/server'
import { requireStaffRole, SUPER_ADMIN_ONLY } from '@/lib/supabase/admin-auth'
import { MALL_PRODUCT_COLUMNS, getMallStore, loadMallProduct } from '@/lib/wishdrop-mall/admin'
import { draftFromLink, draftFromStore, SourcingError } from '@/lib/wishdrop-mall/sourcing'

export const maxDuration = 300

type Params = { params: Promise<{ productId: string }> }
type VariantRow = { id: string; label: string; available: boolean }

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireStaffRole(SUPER_ADMIN_ONLY)
  if (!auth.ok) return auth.response
  const { admin } = auth
  const { productId } = await params

  try {
    const store = await getMallStore(admin)
    if (!store) return NextResponse.json({ error: 'Wishdrop Mall has not been set up yet.' }, { status: 404 })
    const existing = await loadMallProduct(admin, store.id, productId)
    if (!existing) return NextResponse.json({ error: 'Product not found in Wishdrop Mall.' }, { status: 404 })

    let draft
    if (existing.source_platform && existing.source_handle) {
      draft = await draftFromStore(existing.source_platform, existing.source_handle)
    } else if (existing.source_url) {
      draft = await draftFromLink(existing.source_url, req.signal)
    } else {
      return NextResponse.json({ error: 'This product has no source to refresh from.' }, { status: 400 })
    }

    const warnings: string[] = []
    if (!draft.inStock) warnings.push('The source shows this product as out of stock.')

    const now = new Date().toISOString()
    const { data: product, error } = await admin
      .from('products')
      .update({
        stock_count: draft.stockCount,
        // Keep the last known price if the source didn't show one this time.
        source_price: draft.costPrice ?? existing.source_price,
        source_currency: draft.currency || existing.source_currency,
        source_synced_at: now,
        updated_at: now,
      })
      .eq('id', productId)
      .select(MALL_PRODUCT_COLUMNS)
      .single()
    if (error) throw error

    // ── Options (sizes/colours): availability only, price is inherited ──
    if (draft.variants.length > 0) {
      const { data: current, error: vErr } = await admin
        .from('product_variants')
        .select('id, label, available')
        .eq('product_id', productId)
      if (vErr) throw vErr
      const rows = (current ?? []) as unknown as VariantRow[]
      const byLabel = new Map(rows.map((v) => [v.label, v]))
      const seen = new Set<string>()

      for (const v of draft.variants) {
        const match = byLabel.get(v.label)
        if (match) {
          seen.add(match.id)
          if (match.available !== v.available) {
            const { error: uErr } = await admin.from('product_variants').update({ available: v.available }).eq('id', match.id)
            if (uErr) throw uErr
          }
        } else {
          const { error: iErr } = await admin.from('product_variants').insert({
            product_id: productId,
            label: v.label,
            options: v.options,
            image_url: v.imageUrl,
            sku: v.sku,
            price: null,
            available: v.available,
          })
          if (iErr) throw iErr
        }
      }

      const gone = rows.filter((v) => !seen.has(v.id) && v.available)
      if (gone.length > 0) {
        const { error: gErr } = await admin
          .from('product_variants')
          .update({ available: false })
          .in('id', gone.map((v) => v.id))
        if (gErr) throw gErr
        warnings.push(`${gone.length} option(s) no longer offered by the source were marked unavailable.`)
      }
    }

    const before = existing.source_price
    const after = draft.costPrice
    const sameCurrency = (draft.currency || null) === (existing.source_currency || null)
    return NextResponse.json({
      product,
      warnings,
      sourcePriceChanged: after != null && (before == null || !sameCurrency || Math.abs(before - after) >= 0.01),
      previousSourcePrice: before,
      previousSourceCurrency: existing.source_currency,
    })
  } catch (err) {
    if (err instanceof SourcingError) return NextResponse.json({ error: err.message }, { status: err.status })
    const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
