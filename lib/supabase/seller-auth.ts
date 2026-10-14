// lib/supabase/seller-auth.ts
import { NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

export type SellerSession = {
  id: string
  platform: string
  name: string
  defaultMarginPercent: number
  /** 'active' = live. Anything else = hidden by Wishdrop: shoppers and
   *  the seller can't open the store page (see lib/store-preview.ts). */
  status: string
  logoUrl: string | null
  /** 'LK' = local Sri Lankan store (lib/store-origin.ts). */
  origin: 'IN' | 'LK'
  /** Set when a Super Admin / Manager opened this store's portal with
   *  their own staff login (see getStaffPortalUser). Staff-only settings,
   *  such as a custom store's margin, are shown only then. */
  staffView?: { role: 'super_admin' | 'manager'; name: string }
}

/** Cookie holding the seller id a staff member chose on /seller/stores. */
export const STAFF_STORE_COOKIE = 'wd_staff_store'

/**
 * The signed-in user as a staff member who may open seller portals
 * (Super Admin or Manager), or null. Server-side only.
 */
export async function getStaffPortalUser(): Promise<{ userId: string; role: 'super_admin' | 'manager'; name: string } | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createServiceRoleClient()
  let { data: staff } = await admin.from('staff_accounts').select('*').eq('user_id', user.id).maybeSingle()
  if (!staff && user.email) {
    staff = (await admin.from('staff_accounts').select('*').eq('email', user.email).maybeSingle()).data
  }
  const row = (staff ?? null) as { role?: string; status?: string; name?: string | null; full_name?: string | null; email?: string | null } | null
  if (!row || row.status !== 'active') return null
  if (row.role !== 'super_admin' && row.role !== 'manager') return null
  return { userId: user.id, role: row.role, name: row.name || row.full_name || row.email || 'Wishdrop staff' }
}

function toSellerSession(data: Record<string, unknown>): SellerSession {
  return {
    id: data.id as string,
    platform: data.platform_slug as string,
    name: data.name as string,
    defaultMarginPercent: Number(data.default_margin_percent ?? 25),
    status: (data.status as string | undefined) ?? 'active',
    logoUrl: (data.logo_url as string | null | undefined) ?? null,
    origin: data.store_origin === 'LK' ? 'LK' : 'IN',
  }
}

/** Server-side only. Returns the seller the current auth session owns, or
 *  null if not logged in / not linked to a seller. Super Admins and
 *  Managers get the store they picked on /seller/stores (staffView set). */
export async function getCurrentSeller(): Promise<SellerSession | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('sellers')
    .select('*') // '*' so store_origin comes through once its migration has run
    .eq('owner_user_id', user.id)
    .maybeSingle()

  if (!data) {
    const staff = await getStaffPortalUser()
    if (!staff) return null
    const { cookies } = await import('next/headers')
    const sellerId = (await cookies()).get(STAFF_STORE_COOKIE)?.value
    if (!sellerId) return null
    const { data: row } = await createServiceRoleClient().from('sellers').select('*').eq('id', sellerId).maybeSingle()
    if (!row) return null
    return { ...toSellerSession(row as Record<string, unknown>), staffView: { role: staff.role, name: staff.name } }
  }
  return {
    id: data.id,
    platform: data.platform_slug,
    name: data.name,
    defaultMarginPercent: Number(data.default_margin_percent ?? 25),
    status: (data as { status?: string }).status ?? 'active',
    logoUrl: (data as { logo_url?: string | null }).logo_url ?? null,
    /** 'LK' = local Sri Lankan store — prices in LKR (lib/store-origin.ts). */
    origin: (data as { store_origin?: string | null }).store_origin === 'LK' ? ('LK' as const) : ('IN' as const),
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
