// app/admin/(sales)/sellers/[sellerId]/page.tsx
import { createServiceRoleClient } from '@/lib/supabase/server'
import { mapDbRowToAdminSeller } from '@/data/sellers/data'
import SellerFormClient from './SellerFormClient'

// Fetches the seller server-side (service role — this is an admin route,
// full visibility regardless of status) before the client wizard ever
// mounts. This matters specifically because SellerFormClient initializes
// ~15 pieces of form state directly from `seller` (form, providerType,
// baseUrl, currency, jsonFields, htmlSelectors, listingUrl...) — useState
// initializers only run once, so fetching seller data client-side AFTER
// mount would leave all of that stuck on empty/ADD-mode defaults. Resolving
// it here means SellerFormClient always mounts with real data already in
// hand.
//
// SECURITY NOTE: same caveat as the API routes — no staff-role check yet,
// just uses the service role key server-side. Add real staff gating before
// this admin panel is exposed outside your own team.
export default async function SellerPage({
  params,
}: {
  params: Promise<{ sellerId: string }>
}) {
  const { sellerId } = await params
  const isNew = sellerId === 'new'

  if (isNew) {
    return <SellerFormClient isNew seller={undefined} />
  }

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('sellers')
    .select('*')
    .eq('platform_slug', sellerId)
    .maybeSingle()

  if (error) {
    console.error('[admin/sellers/:id]', error)
  }

  const seller = data ? mapDbRowToAdminSeller(data) : undefined
  return <SellerFormClient isNew={false} seller={seller} />
}
