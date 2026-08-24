import type { View } from './types'

/**
 * Single source of truth for dashboard URLs. Sidebar/Topbar navigate by
 * `View` (so they don't need to know route strings), while layout.tsx
 * derives the current `View` back from the pathname to highlight the
 * right nav item and decide what the back button/banner should do.
 */
export const viewRoutes: Record<View, string> = {
  home: '/account',
  shoppingCommunity: '/account/community',
  addRequest: '/account/requests/new',
  addShipment: '/account/shipments/new',
  warehouseAddresses: '/account/warehouses',
  requests: '/account/requests',
  shipmentOrders: '/account/shipments',
  biddingRequests: '/account/bidding',
  preview: '/account/requests/preview',
  promoCodes: '/account/promo-codes',
  credits: '/account/credits',
  referrals: '/account/referrals',
  ordersHub: '/account/orders',
  account: '/account/settings',
}

export function pathForView(view: View): string {
  return viewRoutes[view]
}

export function viewForPath(pathname: string): View {
  const match = (Object.entries(viewRoutes) as [View, string][]).find(([, path]) => path === pathname)
  return match?.[0] ?? 'home'
}
