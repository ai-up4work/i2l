// app/api/seller/staff-view/route.ts
//
// POST { sellerId } -> a Super Admin / Manager opens that store's seller
//                      portal with their own login (cookie, 12 hours).
// DELETE            -> leave the staff view.
// See getCurrentSeller() in lib/supabase/seller-auth.ts.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getStaffPortalUser, STAFF_STORE_COOKIE } from '@/lib/supabase/seller-auth'
import { sellerHomeFor } from '@/lib/store-modules'

export async function POST(req: NextRequest) {
  const staff = await getStaffPortalUser()
  if (!staff) return NextResponse.json({ error: 'Only a Super Admin or Manager can open a store’s seller portal.' }, { status: 403 })

  const body = (await req.json().catch(() => null)) as { sellerId?: unknown } | null
  const sellerId = typeof body?.sellerId === 'string' ? body.sellerId : ''
  if (!sellerId) return NextResponse.json({ error: 'Pick a store.' }, { status: 400 })

  const { data: seller } = await createServiceRoleClient().from('sellers').select('id, platform_slug').eq('id', sellerId).maybeSingle()
  if (!seller) return NextResponse.json({ error: 'Store not found.' }, { status: 404 })

  const res = NextResponse.json({ ok: true, home: sellerHomeFor(seller.platform_slug as string) })
  res.cookies.set(STAFF_STORE_COOKIE, seller.id as string, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 12,
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(STAFF_STORE_COOKIE, '', { path: '/', maxAge: 0 })
  return res
}
