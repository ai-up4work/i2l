'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import HomePage from '@/components/dashboard/HomePage'
import { pathForView } from '@/components/dashboard/routes'
import { useDashboard } from '@/contexts/DashboardContext'
import { useAuth } from '@/contexts/AuthContext'
import { useLoyalty, effectiveCouponStatus } from '@/contexts/Loyaltycontext'
import { useWishlist } from '@/contexts/Wishlistcontext'
import { createClient } from '@/lib/supabase/client'

const ORDER_STAGE_LABEL: Record<string, string> = {
  ordered: 'Ordered',
  quality_check: 'Quality check',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

function AccountHomePageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { pastedLink, setPastedLink, startItemInfo } = useDashboard()
  const { user } = useAuth()
  const { points, credits, coupons } = useLoyalty()
  const { count: wishlistCount } = useWishlist()

  const [followingCount, setFollowingCount] = useState(0)
  const [latestOrderStatus, setLatestOrderStatus] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    const supabase = createClient()
    ;(async () => {
      const [{ count }, { data: latestOrder }] = await Promise.all([
        supabase.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', user.id),
        supabase
          .from('orders')
          .select('stage')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])
      if (cancelled) return
      setFollowingCount(count ?? 0)
      setLatestOrderStatus(latestOrder ? ORDER_STAGE_LABEL[latestOrder.stage] ?? latestOrder.stage : undefined)
    })()
    return () => {
      cancelled = true
    }
  }, [user])

  const couponsCount = coupons.filter((c) => effectiveCouponStatus(c) === 'unused').length

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
      name={user?.name}
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
      onViewServiceRecords={() => router.push(pathForView('/messages/serviceRecords'))}
      onViewWishlist={() => router.push(pathForView('/account/wishlist'))}
      onViewFollowing={() => router.push(pathForView('/account/my-following'))}
      onViewRecentlyViewed={() => router.push(pathForView('/account/recently-viewed'))}
      couponsCount={couponsCount}
      pointsBalance={points}
      walletBalance={credits}
      wishlistCount={wishlistCount}
      followingCount={followingCount}
      latestOrderStatus={latestOrderStatus}
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