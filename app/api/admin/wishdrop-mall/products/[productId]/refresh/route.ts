// app/api/admin/wishdrop-mall/products/[productId]/refresh/route.ts
//
// POST -> "Check supplier": re-reads the product at the place it was
//         bought from and records the supplier's CURRENT price (product
//         and per variant) and variant buy links — handy before
//         reordering stock.
//
// The Mall sells stock Wishdrop already holds, so this NEVER changes
// anything shoppers see: not your price, not your quantities, not which
// variants are for sale. Differences (supplier sold out, options added or
// dropped) come back as notes for staff.

import { NextRequest, NextResponse } from 'next/server'
import { requireStaffRole, SUPER_ADMIN_ONLY } from '@/lib/supabase/admin-auth'
import { MALL_PRODUCT_COLUMNS, getMallStore, loadMallProduct } from '@/lib/wishdrop-mall/admin'
import { draftFromLink, draftFromStore, SourcingError } from '@/lib/wishdrop-mall/sourcing'

export const maxDuration = 300

type Params = { params: Promise<{ productId: string }> }
type VariantRow = { id: string; label: string }

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
    if (!draft.inStock) warnings.push('The supplier currently shows it as sold out.')

    const now = new Date().toISOString()
    const { data: product, error } = await admin
      .from('products')
      .update({
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

    // ── Variants: supplier price + link only (never stock/availability) ──
    if (draft.variants.length > 0) {
      const { data: current, error: vErr } = await admin
        .from('product_variants')
        .select('id, label')
        .eq('product_id', productId)
      if (vErr) throw vErr
      const rows = (current ?? []) as unknown as VariantRow[]
      const byLabel = new Map(rows.map((v) => [v.label, v]))
      const supplierLabels = new Set(draft.variants.map((v) => v.label))

      for (const v of draft.variants) {
        const match = byLabel.get(v.label)
        if (!match) continue
        const patch = {
          ...(v.costPrice != null ? { source_price: v.costPrice } : {}),
          ...(v.sourceUrl ? { source_url: v.sourceUrl } : {}),
        }
        if (Object.keys(patch).length === 0) continue
        const { error: uErr } = await admin.from('product_variants').update(patch).eq('id', match.id)
        if (uErr) throw uErr
      }

      const newAtSupplier = draft.variants.filter((v) => !byLabel.has(v.label)).map((v) => v.label)
      const goneAtSupplier = rows.filter((v) => !supplierLabels.has(v.label)).map((v) => v.label)
      if (newAtSupplier.length) warnings.push(`Supplier also offers: ${newAtSupplier.slice(0, 5).join(', ')}${newAtSupplier.length > 5 ? '…' : ''}.`)
      if (goneAtSupplier.length) warnings.push(`Supplier no longer lists: ${goneAtSupplier.slice(0, 5).join(', ')}${goneAtSupplier.length > 5 ? '…' : ''}.`)
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
