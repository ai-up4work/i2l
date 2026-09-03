import type { View } from './types'

export const viewRoutes: Record<View, string> = {
  home: '/account',
  shoppingCommunity: '/account/community',
  addRequest: '/account/requests/new',
  affiliatedStores: '/stores',
  addShipment: '/account/shipments/new',
  warehouseAddresses: '/account/warehouses',
  requests: '/account/requests',
  shipmentOrders: '/account/shipments',
  biddingRequests: '/account/bidding',
  confirmRequest: '/account/requests/confirm',
  preview: '/account/requests/preview',
  promoCodes: '/account/promo-codes',
  credits: '/account/credits',
  referrals: '/account/referrals',
  ordersHub: '/account/orders',
  settings: '/account/settings',
  account: '/account/settings',
  // New — added for the Personal Center-style home page
  profile: '/account/profile',
  coupons: '/account/coupons',
  points: '/account/points',
  wallet: '/account/wallet',
  paymentOptions: '/account/payment-options',
  giftCard: '/account/gift-card',
  messages: '/account/messages',
  serviceRecords: '/account/service-records',
  wishlist: '/account/wishlist',
  following: '/account/following',
  wishdropVip: '/account/wishdrop-vip',
  AddressBook: '/account/address-book',
  trackingOrders: '/account/tracking-orders',
  recentlyViewed: '/account/recently-viewed',
  myFollowing: '/account/my-following'
}

export function pathForView(view: View): string {
  const path = viewRoutes[view]
  if (!path) {
    console.warn(`[routes] Unknown view "${view}", falling back to home`)
    return viewRoutes.home
  }
  return path
}

export function viewForPath(pathname: string): View {
  const match = (Object.entries(viewRoutes) as [View, string][]).find(
    ([, path]) => path === pathname
  )
  return match?.[0] ?? 'home'
}