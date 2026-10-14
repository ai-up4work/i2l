// app/api/casecraft/orders/route.ts
//
// Case Craft orders, placed from its store page. Kept in casecraft_orders
// and handled by the seller in their portal (Print jobs). Not part of the
// Wishdrop order pipeline.
//
// POST -> place an order. Signed-in shoppers. Prices are worked out here
//         from the saved price list and margin; the browser's numbers are
//         never used.
// GET  -> the signed-in shopper's own Case Craft orders.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { storeModuleFor } from '@/lib/store-modules'
import { getCaseType, getModel, getTemplate, type CaseTypeId } from '@/lib/store-modules/casecraft/catalog'
import {
  deliveryFor,
  isModelOnSale,
  normalizeDelivery,
  sellerCustomPrice,
  shopperPrice,
  type PaymentMethod,
} from '@/lib/store-modules/casecraft/settings'
import { CASECRAFT_MIGRATION_HINT, casecraftDb, isMissingTable, loadSettings, newOrderRef } from '@/lib/store-modules/casecraft/server'

export const dynamic = 'force-dynamic'

/** A link to a file this shopper uploaded (app/api/casecraft/upload-url). */
function ownUpload(url: unknown, userId: string): string | null {
  if (typeof url !== 'string') return null
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) return null
  const prefix = `${base.replace(/\/$/, '')}/storage/v1/object/public/uploads/casecraft/${userId}/`
  return url.startsWith(prefix) && url.length < 600 ? url : null
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to place your order.' }, { status: 401 })

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b) return NextResponse.json({ error: 'Nothing to order.' }, { status: 400 })

  const slug = typeof b.storeSlug === 'string' ? b.storeSlug : ''
  if (storeModuleFor(slug)?.key !== 'casecraft') return NextResponse.json({ error: 'Store not found.' }, { status: 404 })

  const db = casecraftDb()
  const { data: seller } = await db.from('sellers').select('id, status').eq('platform_slug', slug).maybeSingle()
  const sellerRow = seller as { id: string; status?: string } | null
  if (!sellerRow) return NextResponse.json({ error: 'Store not found.' }, { status: 404 })
  if (sellerRow.status && sellerRow.status !== 'active') return NextResponse.json({ error: 'This store isn’t taking orders right now.' }, { status: 409 })

  const rec = await loadSettings(sellerRow.id, db)
  if (rec.needsMigration) return NextResponse.json({ error: CASECRAFT_MIGRATION_HINT }, { status: 503 })
  const { settings, marginPercent } = rec

  const kind = b.kind === 'ready' ? 'ready' : b.kind === 'custom' ? 'custom' : null
  if (!kind) return NextResponse.json({ error: 'Unknown order type.' }, { status: 400 })

  const caseType = getCaseType(typeof b.caseTypeId === 'string' ? b.caseTypeId : null)
  const model = getModel(caseType?.id, typeof b.model === 'string' ? b.model : null)
  if (!caseType || !model || !isModelOnSale(settings, caseType.id, model.label)) {
    return NextResponse.json({ error: 'That phone model isn’t available any more. Pick another.' }, { status: 409 })
  }

  const quantity = Math.floor(Number(b.quantity ?? 1))
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > settings.maxQuantity) {
    return NextResponse.json({ error: `You can order 1 to ${settings.maxQuantity} at a time.` }, { status: 400 })
  }

  const delivery = normalizeDelivery(b.delivery)
  if (!delivery) return NextResponse.json({ error: 'Fill in your name, phone, address, city and district.' }, { status: 400 })

  const payment = (b.payment === 'cod' || b.payment === 'bank' ? b.payment : null) as PaymentMethod | null
  if (!payment || !settings.payments[payment]) return NextResponse.json({ error: 'Pick a payment method.' }, { status: 400 })

  let sellerUnit: number
  let template: string | null = null
  let designId: string | null = null
  let designName: string | null = null
  let photoUrl: string | null = null
  let printUrl: string | null = null
  let previewUrl: string | null = null

  if (kind === 'custom') {
    photoUrl = ownUpload(b.photoUrl, user.id)
    printUrl = ownUpload(b.printUrl, user.id)
    previewUrl = ownUpload(b.previewUrl, user.id)
    if (!photoUrl || !printUrl) return NextResponse.json({ error: 'Upload your photo again, then place the order.' }, { status: 400 })
    template = getTemplate(typeof b.template === 'string' ? b.template : null).id
    sellerUnit = sellerCustomPrice(settings, caseType.id, model.label)
  } else {
    const id = typeof b.designId === 'string' ? b.designId : ''
    const { data: design } = await db.from('casecraft_designs').select('*').eq('id', id).eq('seller_id', sellerRow.id).maybeSingle()
    const d = design as { id: string; name: string; case_type: string; models: string[] | null; price_lkr: number | string; active: boolean } | null
    if (!d || !d.active) return NextResponse.json({ error: 'That design isn’t available any more.' }, { status: 409 })
    if ((d.case_type as CaseTypeId) !== caseType.id || (d.models?.length && !d.models.includes(model.label))) {
      return NextResponse.json({ error: 'That design isn’t made for this phone.' }, { status: 409 })
    }
    designId = d.id
    designName = d.name
    sellerUnit = Number(d.price_lkr)
  }

  const unit = shopperPrice(sellerUnit, marginPercent)
  const subtotal = unit * quantity
  const deliveryFee = deliveryFor(settings, subtotal)

  const row = {
    seller_id: sellerRow.id,
    user_id: user.id,
    kind,
    case_type: caseType.id,
    case_label: caseType.label,
    model_label: model.label,
    template,
    design_id: designId,
    design_name: designName,
    photo_url: photoUrl,
    print_url: printUrl,
    preview_url: previewUrl,
    quantity,
    seller_unit_lkr: sellerUnit,
    margin_percent: marginPercent,
    unit_price_lkr: unit,
    delivery_fee_lkr: deliveryFee,
    total_lkr: subtotal + deliveryFee,
    customer: { ...delivery, email: user.email ?? null },
    payment_method: payment,
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    const ref = newOrderRef()
    const { error } = await db.from('casecraft_orders').insert({ ...row, ref })
    if (!error) {
      return NextResponse.json({
        ref,
        total: row.total_lkr,
        payment,
        bankDetails: payment === 'bank' ? settings.payments.bankDetails : null,
      })
    }
    if (isMissingTable(error)) return NextResponse.json({ error: CASECRAFT_MIGRATION_HINT }, { status: 503 })
    if (error.code !== '23505') {
      console.error('[casecraft] order insert —', error.message)
      return NextResponse.json({ error: 'Could not place the order. Please try again.' }, { status: 500 })
    }
  }
  return NextResponse.json({ error: 'Could not place the order. Please try again.' }, { status: 500 })
}

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ orders: [] })
  const { data, error } = await casecraftDb()
    .from('casecraft_orders')
    .select('ref, kind, case_label, model_label, design_name, preview_url, quantity, total_lkr, status, payment_method, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(30)
  if (error) return NextResponse.json({ orders: [] })
  return NextResponse.json({ orders: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
}
