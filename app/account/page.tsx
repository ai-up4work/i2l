'use client'

import { Suspense, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import HomePage from '@/components/dashboard/HomePage'
import { pathForView } from '@/components/dashboard/routes'
import { useDashboard } from '@/contexts/DashboardContext'

function AccountHomePageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { pastedLink, setPastedLink, startItemInfo } = useDashboard()

  const hasConsumedLinkParam = useRef(false)

  useEffect(() => {
    if (hasConsumedLinkParam.current) return
    const linkFromLanding = searchParams.get('link')
    if (!linkFromLanding) return

    hasConsumedLinkParam.current = true
    setPastedLink(linkFromLanding)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // startItemInfo reads pastedLink from context state, which only updates
  // on the NEXT render after setPastedLink above — so we can't call
  // startItemInfo in the same effect (it would still see the old empty
  // value). Instead, fire it in a second effect that watches pastedLink
  // and runs once it's actually populated from the query param.
  const hasStartedFromParam = useRef(false)
  useEffect(() => {
    if (hasStartedFromParam.current) return
    if (!hasConsumedLinkParam.current) return
    if (!pastedLink.trim()) return

    hasStartedFromParam.current = true
    startItemInfo({ preventDefault: () => {} } as React.FormEvent)
    router.replace('/account')
  }, [pastedLink, startItemInfo, router])

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

export default function AccountHomePage() {
  return (
    <Suspense fallback={null}>
      <AccountHomePageInner />
    </Suspense>
  )
}