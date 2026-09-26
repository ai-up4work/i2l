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
  // 'profile' now listed first among the three merged-page aliases so
  // viewForPath's first-match lookup resolves to it — that's what
  // drives sidebar active-state highlighting in app/account/layout.tsx,
  // and "My Profile" is the sidebar item that survived the merge (see
  // sidebar-data.ts). 'settings'/'account' still resolve to the same
  // page for pathForView(view) callers, just aren't picked by the
  // reverse lookup.
  profile: '/account/profile',
  // Both point straight at the merged page now — /account/settings
  // itself is still a route (redirecting to /account/profile) for any
  // external/bookmarked links, but in-app navigation via these views
  // goes directly there, no extra redirect hop.
  settings: '/account/profile',
  account: '/account/profile',
  coupons: '/account/coupons',
  points: '/account/points',
  wallet: '/account/wallet',
  paymentOptions: '/account/payment-options',
  giftCard: '/account/gift-card',
  messages: '/account/messages',
  serviceRecords: '/account/messages/serviceRecords',
  wishlist: '/account/wishlist',
  following: '/account/following',
  WishdropVip: '/account/Wishdrop-vip',
  AddressBook: '/account/address-book',
  trackingOrders: '/account/orders/track',
  recentlyViewed: '/account/recently-viewed',
  myFollowing: '/account/my-following',
  cart: '/account/cart',
  boards: '/account/boards',
  '/messages/serviceRecords': '/account/messages/serviceRecords',
  '/account/my-following': '/account/my-following',
  '/account/recently-viewed': '/account/recently-viewed',
  '/account/wishlist': '/account/wishlist'
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