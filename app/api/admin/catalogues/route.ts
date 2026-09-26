// app/api/admin/catalogues/route.ts
//
// GET -> every product added by a custom (manual) seller through the
//        seller portal, across all sellers, for the admin Catalogues
//        overview. Includes hidden products (the browser can only read
//        active ones under RLS, which is why the page no longer queries
//        Supabase directly). Wishdrop Mall products are excluded — they're
//        managed at /admin/wishdrop-mall.

import { NextResponse } from 'next/server'
import { requireStaffRole, SOURCING_ROLES } from '@/lib/supabase/admin-auth'
import { WISHDROP_MALL_SLUG } from '@/lib/wishdrop-mall'

export async function GET() {
  const auth = await requireStaffRole(SOURCING_ROLES)
  if (!auth.ok) return auth.response
  const { admin } = auth

  const { data: mall } = await admin.from('sellers').select('id').eq('platform_slug', WISHDROP_MALL_SLUG).maybeSingle()

  let query = admin
    .from('products')
    .select(
      'id, name, category, cost_price, margin_percent, price, currency, stock_count, active, seller_id, sellers(name, platform_slug)',
    )
    .order('created_at', { ascending: false })
  if (mall) query = query.neq('seller_id', (mall as { id: string }).id)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ products: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
}
