// lib/supabase/seller-auth.ts
import { createClient } from '@/lib/supabase/server'

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