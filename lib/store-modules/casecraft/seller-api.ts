// lib/store-modules/casecraft/seller-api.ts
//
// Gate for app/api/seller/casecraft/**: the signed-in seller (or staff in
// staff view) of a Case Craft store. Every query must be scoped to
// `seller.id`.

import { NextResponse } from 'next/server'
import { requireSeller, type SellerSession } from '@/lib/supabase/seller-auth'
import { storeModuleFor } from '@/lib/store-modules'
import { casecraftDb, type Db } from './server'

export type CaseCraftSellerResult = { ok: true; seller: SellerSession; db: Db } | { ok: false; response: NextResponse }

export async function requireCaseCraftSeller(): Promise<CaseCraftSellerResult> {
  const auth = await requireSeller()
  if (!auth.ok) return auth
  if (storeModuleFor(auth.seller.platform)?.key !== 'casecraft') {
    return { ok: false, response: NextResponse.json({ error: 'This page is for Case Craft only.' }, { status: 403 }) }
  }
  return { ok: true, seller: auth.seller, db: casecraftDb(auth.admin) }
}
