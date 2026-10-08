// app/api/admin/catalogues/route.ts
//
// GET  -> every product in a custom (manual) seller's catalogue, across
//         all sellers, plus the list of custom sellers (for the seller
//         filter and the "Add product" picker). Includes hidden products.
// POST -> staff add a product ON BEHALF of a seller (e.g. an Instagram
//         seller who sends their photos over WhatsApp instead of using
//         the portal). Same rules as the seller portal: staff enter the
//         seller's COST, the price is cost × (1 + margin%). The margin
//         defaults to the seller's own, or can be set here.
//
// Wishdrop Mall products are excluded — they're managed at
// /admin/super-admin/wishdrop-mall. Gated to SOURCING_ROLES.

import { NextRequest, NextResponse } from 'next/server'
import { requireStaffRole, SOURCING_ROLES } from '@/lib/supabase/admin-auth'
import { WISHDROP_MALL_SLUG, mallHandle } from '@/lib/wishdrop-mall'
import { cleanSellerInput, friendlyDbError, sellerPrice, type SellerProductInput } from '@/app/api/seller/lib'

const LIST_COLUMNS =
  'id, handle, name, category, cost_price, margin_percent, price, currency, stock_count, images, videos, active, created_at, seller_id, sellers(name, platform_slug)'
// Used when data/wishdrop-seller-media.sql hasn't been run yet, so the
// page still lists products instead of failing outright.
const LIST_COLUMNS_NO_VIDEOS = LIST_COLUMNS.replace('videos, ', '')

export const PRODUCT_SELECT = '*, sellers(id, name, platform_slug, default_margin_percent)'

export async function GET() {
  const auth = await requireStaffRole(SOURCING_ROLES)
  if (!auth.ok) return auth.response
  const { admin } = auth

  const { data: sellerRows, error: sellersError } = await admin
    .from('sellers')
    .select('id, name, platform_slug, default_margin_percent, owner_user_id, status, logo_url')
    .eq('type', 'manual')
    .neq('platform_slug', WISHDROP_MALL_SLUG)
    .order('name')
  if (sellersError) return NextResponse.json({ error: sellersError.message }, { status: 500 })

  const { data: mall } = await admin.from('sellers').select('id').eq('platform_slug', WISHDROP_MALL_SLUG).maybeSingle()

  const run = (columns: string) => {
    let query = admin.from('products').select(columns).order('created_at', { ascending: false })
    if (mall) query = query.neq('seller_id', (mall as { id: string }).id)
    return query
  }

  let { data, error } = await run(LIST_COLUMNS)
  let needsMigration = false
  if (error?.code === '42703') {
    needsMigration = true
    ;({ data, error } = await run(LIST_COLUMNS_NO_VIDEOS))
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const sellers = ((sellerRows ?? []) as unknown as Array<{
    id: string
    name: string
    platform_slug: string
    default_margin_percent: number | null
    owner_user_id: string | null
    status: string
    logo_url: string | null
  }>).map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.platform_slug,
    defaultMarginPercent: Number(s.default_margin_percent ?? 25),
    hasLogin: Boolean(s.owner_user_id),
    status: s.status,
    logoUrl: s.logo_url,
  }))

  return NextResponse.json({ products: data ?? [], sellers, needsMigration }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const auth = await requireStaffRole(SOURCING_ROLES)
  if (!auth.ok) return auth.response
  const { admin } = auth

  const body = (await req.json().catch(() => ({}))) as SellerProductInput & { sellerId?: string; marginPercent?: number | string }
  if (!body.sellerId) return NextResponse.json({ error: 'Choose a seller.' }, { status: 400 })

  const { data: sellerRow } = await admin
    .from('sellers')
    .select('id, platform_slug, type, default_margin_percent')
    .eq('id', body.sellerId)
    .maybeSingle()
  const seller = sellerRow as { id: string; platform_slug: string; type: string; default_margin_percent: number | null } | null
  if (!seller) return NextResponse.json({ error: 'Seller not found.' }, { status: 404 })
  if (seller.platform_slug === WISHDROP_MALL_SLUG) {
    return NextResponse.json({ error: 'Wishdrop Mall products are managed on the Wishdrop Mall page.' }, { status: 400 })
  }
  if (seller.type !== 'manual') {
    return NextResponse.json({ error: 'This seller has a live feed — its products come from the feed, not from here.' }, { status: 400 })
  }

  const cleaned = cleanSellerInput(body, true)
  if ('error' in cleaned) return NextResponse.json({ error: cleaned.error }, { status: 400 })
  const { fields } = cleaned

  let margin = Number(seller.default_margin_percent ?? 25)
  if (body.marginPercent !== undefined && body.marginPercent !== '') {
    const m = Number(body.marginPercent)
    if (!Number.isFinite(m) || m < 0 || m > 1000) return NextResponse.json({ error: 'Enter a valid margin percentage.' }, { status: 400 })
    margin = m
  }

  const now = new Date().toISOString()
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
      .select(PRODUCT_SELECT)
      .single()
    if (!error) return NextResponse.json({ product: data }, { status: 201 })
    if (error.code !== '23505' || attempt === 1) {
      return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 })
    }
  }
  return NextResponse.json({ error: 'Could not create the product.' }, { status: 500 })
}
