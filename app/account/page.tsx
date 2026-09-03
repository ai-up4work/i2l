'use client'

import { useRouter } from 'next/navigation'
import HomePage from '@/components/dashboard/HomePage'
import { pathForView } from '@/components/dashboard/routes'
import { useDashboard } from '@/contexts/DashboardContext'

export default function AccountHomePage() {
  const router = useRouter()
  const { pastedLink, setPastedLink, startItemInfo } = useDashboard()

  return (
    <HomePage
      link={pastedLink}
      setLink={setPastedLink}
      onSubmitRequest={startItemInfo}
      onBrowseStores={() => router.push(pathForView('affiliatedStores'))}
      onViewOrders={() => router.push(pathForView('ordersHub'))}
      onViewProfile={() => router.push(pathForView('profile'))}
      onViewCoupons={() => router.push(pathForView('coupons'))}
      onViewPoints={() => router.push(pathForView('points'))}
      onViewWallet={() => router.push(pathForView('wallet'))}
      onViewGiftCard={() => router.push(pathForView('giftCard'))}
      onViewMessages={() => router.push(pathForView('messages'))}
      onViewServiceRecords={() => router.push(pathForView('serviceRecords'))}
      onViewWishlist={() => router.push(pathForView('wishlist'))}
      onViewFollowing={() => router.push(pathForView('following'))}
      onViewRecentlyViewed={() => router.push(pathForView('recentlyViewed'))}
    />
  )
}