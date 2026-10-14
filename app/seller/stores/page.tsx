// app/seller/stores/page.tsx
//
// Staff only (Super Admin / Manager): pick which store's seller portal to
// open with your own login. Custom stores (lib/store-modules) come first,
// since their staff-only settings (e.g. Case Craft's margin) live in
// their portal. See lib/supabase/seller-auth.ts.
import { redirect } from 'next/navigation'
import { getStaffPortalUser } from '@/lib/supabase/seller-auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { hasStoreModule } from '@/lib/store-modules'
import StorePicker, { type PickerStore } from './StorePicker'

export const dynamic = 'force-dynamic'

export default async function SellerStorePickerPage() {
  const staff = await getStaffPortalUser()
  if (!staff) redirect('/seller/login')

  const { data } = await createServiceRoleClient()
    .from('sellers')
    .select('*')
    .order('name', { ascending: true })
    .limit(1000)

  const rows = (data ?? []) as Record<string, unknown>[]
  const stores: PickerStore[] = rows
    .map((r) => ({
      id: r.id as string,
      name: r.name as string,
      slug: r.platform_slug as string,
      logo: (r.logo_url as string | null) ?? null,
      live: (r.status as string | undefined) === 'active',
      custom: hasStoreModule(r.platform_slug as string),
      social: r.store_source === 'social' || r.provider_type === 'catalogue',
    }))
    .filter((s) => s.custom || s.social)
    .sort((a, b) => Number(b.custom) - Number(a.custom) || a.name.localeCompare(b.name))

  return <StorePicker stores={stores} staffName={staff.name} />
}
