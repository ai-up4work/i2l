// app/api/admin/order-items/[itemId]/route.ts
//
// PATCH — staff set (or clear) the photo of one order item.
//
// For items whose photo was never found or has since disappeared (the store
// removed it, the scrape missed it). The photo is saved as the item's
// `product_image_url`, which every screen now prefers over the store's own
// image: admin lists and order page, the customer's orders, QC.
//
// Body: { imageUrl: string | null }   null / "" removes the override, so the
//                                     store's own photo (if any) shows again.
//
// Any active staff member (Warehouse sees these photos during QC too).

import { NextRequest, NextResponse } from 'next/server'
import { requireStaffRole } from '@/lib/supabase/admin-auth'

export const runtime = 'nodejs'

type Params = { params: Promise<{ itemId: string }> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireStaffRole()
  if (!auth.ok) return auth.response
  const { admin } = auth

  const { itemId } = await params
  if (!UUID.test(itemId)) return NextResponse.json({ error: 'Invalid item.' }, { status: 400 })

  let body: { imageUrl?: unknown }
  try {
    body = (await req.json()) as { imageUrl?: unknown }
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const raw = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : ''
  if (raw && (raw.length > 2000 || !/^https:\/\//i.test(raw))) {
    return NextResponse.json({ error: 'The photo must be an https link (or uploaded here).' }, { status: 400 })
  }

  // .select() so a missing item is reported instead of "succeeding" on 0 rows.
  const { data, error } = await admin
    .from('order_items')
    .update({ product_image_url: raw || null } as never)
    .eq('id', itemId)
    .select('id')
  if (error) {
    console.error('[admin/order-items] photo update failed', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data || data.length === 0) return NextResponse.json({ error: 'That item was not found.' }, { status: 404 })

  return NextResponse.json({ ok: true, imageUrl: raw || null })
}
