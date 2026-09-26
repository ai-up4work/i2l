// lib/supabase/seller-auth.ts
import { NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

export type SellerSession = {
  id: string
  platform: string
  name: string
  defaultMarginPercent: number
}

/** Server-side only. Returns the seller the current auth session owns, or
 *  null if not logged in / not linked to a seller. */
export async function getCurrentSeller(): Promise<SellerSession | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('sellers')
    .select('id, platform_slug, name, default_margin_percent')
    .eq('owner_user_id', user.id)
    .maybeSingle()

  if (!data) return null
  return {
    id: data.id,
    platform: data.platform_slug,
    name: data.name,
    defaultMarginPercent: Number(data.default_margin_percent ?? 25),
  }
}

// ── API-route gate ──────────────────────────────────────────────────────
//
// For app/api/seller/**. Resolves the logged-in user to the seller row
// they own (sellers.owner_user_id) and hands back the service-role client
// for the writes. Every route must scope its queries to `seller.id` —
// that scoping, not RLS, is what keeps one seller out of another's
// products. Used instead of writing to `products` from the browser, which
// let a seller send any price they liked and hid their own inactive
// products from them (RLS only exposes active rows).


export type SellerAuthResult =
  | { ok: true; seller: SellerSession; admin: ReturnType<typeof createServiceRoleClient> }
  | { ok: false; response: NextResponse }

export async function requireSeller(): Promise<SellerAuthResult> {
  const seller = await getCurrentSeller()
  if (!seller) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Log in with your seller account.' }, { status: 401 }),
    }
  }
  return { ok: true, seller, admin: createServiceRoleClient() }
}
