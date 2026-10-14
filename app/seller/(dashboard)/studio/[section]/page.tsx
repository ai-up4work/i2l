// app/seller/(dashboard)/studio/[section]/page.tsx
//
// A custom store's own seller pages (lib/store-modules), e.g. Case
// Craft's Print jobs, Ready-made designs and Prices & models.
import { notFound, redirect } from 'next/navigation'
import { getCurrentSeller } from '@/lib/supabase/seller-auth'
import { storeModuleFor } from '@/lib/store-modules'
import { SELLER_SECTIONS } from '@/lib/store-modules/seller-sections'

export const dynamic = 'force-dynamic'

export default async function StoreModuleSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const seller = await getCurrentSeller()
  if (!seller) redirect('/seller/login')
  const mod = storeModuleFor(seller.platform)
  if (!mod) redirect('/seller')
  const { section } = await params
  const render = SELLER_SECTIONS[mod.key]?.[section]
  if (!render) notFound()
  return render(seller)
}
