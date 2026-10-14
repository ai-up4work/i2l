// app/seller/(dashboard)/products/layout.tsx
// Custom stores (lib/store-modules) don't use the standard product list:
// send them to their own portal home.
import { redirect } from 'next/navigation'
import { getCurrentSeller } from '@/lib/supabase/seller-auth'
import { hasStoreModule, sellerHomeFor } from '@/lib/store-modules'

export default async function SellerProductsLayout({ children }: { children: React.ReactNode }) {
  const seller = await getCurrentSeller()
  if (seller && hasStoreModule(seller.platform)) redirect(sellerHomeFor(seller.platform))
  return children
}
