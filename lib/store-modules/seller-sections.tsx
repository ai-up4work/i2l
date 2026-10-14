// lib/store-modules/seller-sections.tsx
//
// Server side: the seller portal pages of each custom store
// (lib/store-modules), shown at /seller/studio/<section>.

import type { ReactNode } from 'react'
import type { SellerSession } from '@/lib/supabase/seller-auth'
import PrintJobs from '@/components/store-modules/casecraft/seller/PrintJobs'
import Designs from '@/components/store-modules/casecraft/seller/Designs'
import PriceList from '@/components/store-modules/casecraft/seller/PriceList'

type SectionRender = (seller: SellerSession) => ReactNode

export const SELLER_SECTIONS: Record<string, Record<string, SectionRender>> = {
  casecraft: {
    orders: (seller) => <PrintJobs storeName={seller.name} />,
    designs: () => <Designs />,
    pricing: () => <PriceList />,
  },
}
