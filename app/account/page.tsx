'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import HomePage from '@/components/dashboard/HomePage'
import { pathForView } from '@/components/dashboard/routes'
import { useDashboard } from '@/contexts/DashboardContext'
import { useAuth } from '@/contexts/AuthContext'
import { useLoyalty, effectiveCouponStatus } from '@/contexts/Loyaltycontext'
import { useWishlist } from '@/contexts/Wishlistcontext'
import { OrdersProvider, useOrders } from '@/contexts/Ordercontexts'
import { createClient } from '@/lib/supabase/client'
import type { MyOrdersCardLatestOrder } from '@/components/dashboard/MyOrdersCard'

// orders[0] is already the most recent order — OrdersProvider's Supabase
// query orders by created_at descending (see orderContexts.tsx). Trimmed
// down to just what MyOrdersCard needs (id/status/item image+name) rather
// than passing the full Order shape through, so the card stays decoupled
// from the orders-context's richer type.
//
// This REPLACES the old hand-rolled `orders.select('stage')` fetch below —
// that query only ever selected `stage`, never `order_items` or
// `product_snapshots`, so there was no image data available to show no
// matter what HomePage/MyOrdersCard did with it. useOrders() already does
// the correct join + the same stage->status mapping (mapStageToCustomerStatus)
// that the rest of the app (Orders Hub, Track Order) relies on, so this
// keeps "latest order" logic in exactly one place instead of two
// independently-maintained versions that can drift apart.
function toLatestOrder(orders: ReturnType<typeof useOrders>['orders']): MyOrdersCardLatestOrder | undefined {
  const latest = orders[0]
  if (!latest) return undefined
  return {
    id: latest.id,
    status: latest.status,
    items: latest.items.map((item) => ({
      image: item.image,
      name: item.name,
    })),
  }
}

function AccountHomePageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { pastedLink, setPastedLink, startItemInfo } = useDashboard()
  const { user } = useAuth()
  const { points, credits, coupons } = useLoyalty()
  const { count: wishlistCount } = useWishlist()
  const { orders, loading: ordersLoading } = useOrders()

  const [followingCount, setFollowingCount] = useState(0)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    const supabase = createClient()
    ;(async () => {
      const { count } = await supabase
        .from('follows')
        .select('id', { count: 'exact', head: true })
        .eq('follower_id', user.id)
      if (cancelled) return
      setFollowingCount(count ?? 0)
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
      latestOrder={ordersLoading ? undefined : toLatestOrder(orders)}
    />
  )
}

export default function AccountHomePage() {
  return (
    <Suspense fallback={null}>
      {/* OrdersProvider added here — this page previously did its own
          one-off `orders.select('stage')` query instead of using the
          shared orders context, so wrapping here is new. If a layout
          above this route (e.g. app/account/layout.tsx) ALREADY wraps
          with <OrdersProvider>, remove this wrapper and just call
          useOrders() directly in AccountHomePageInner — double-wrapping
          would spin up a second, redundant fetch of the same data. */}
      <OrdersProvider>
        <AccountHomePageInner />
      </OrdersProvider>
    </Suspense>
  )
}