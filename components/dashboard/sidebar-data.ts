// sidebar-data.ts
import type { View } from './types'

// Two kinds of sidebar items:
// - "view": navigates within the app's own router (uses the View union +
//   onNavigate, same as before).
// - "link": a plain static page (policy text, contact preferences, etc.)
//   that isn't part of the SPA's View state, so it renders as a normal <a>.
export type SidebarItem =
  | { type: 'view'; label: string; view: View; badge?: string }
  | { type: 'link'; label: string; href: string }
  | { type: 'badge'; label: string; view: View; badge: string } // for future use, if we want to show a badge on a view item

export type SidebarGroup = {
  key: string
  label: string
  // Whether this group starts expanded. The active view's group is always
  // force-expanded on top of this, regardless of this flag.
  defaultOpen?: boolean
  items: SidebarItem[]
}

// Mirrors the SHEIN "Personal Center" group structure (My Account / My
// Assets / My Orders / My Favorites / Customer Service / Other Services /
// Policy / Accessibility), with each item's target adjusted to point at
// this app's actual features rather than SHEIN's. A few mappings worth
// double-checking against your real routes:
// - "Address Book" -> warehouseAddresses (closest existing equivalent)
// - "My Payment Options" -> new paymentOptions view (just added to routes.ts)
// - Policy / Accessibility items are treated as static links, not View state
export const sidebarGroups: SidebarGroup[] = [
  {
    key: 'myAccount',
    label: 'My Account',
    defaultOpen: true,
    items: [
      { type: 'view', label: 'WishDrop VIP', view: 'wishdropVip' },
      { type: 'view', label: 'My Profile', view: 'profile', badge: 'POINTS' },
      { type: 'view', label: 'Address Book', view: 'AddressBook' },
      // { type: 'view', label: 'My Payment Options', view: 'paymentOptions' },
      { type: 'view', label: 'Manage My Account', view: 'settings', badge: 'POINTS' },
    ],
  },
  {
    key: 'myAssets',
    label: 'My Assets',
    items: [
      { type: 'view', label: 'Referrals', view: 'referrals' },
      { type: 'view', label: 'Wallet', view: 'wallet' },
      { type: 'view', label: 'Coupons', view: 'coupons' },
      { type: 'view', label: 'Points', view: 'points' },
      { type: 'view', label: 'Gift Card', view: 'giftCard' },
    ],
  },
  {
    key: 'myOrders',
    label: 'My Orders',
    items: [
      { type: 'view', label: 'All Orders', view: 'ordersHub' },
      { type: 'view', label: 'Tracking My Orders', view: 'trackingOrders' },
      // { type: 'view', label: 'Shipments', view: 'shipmentOrders' },
      // { type: 'view', label: 'Bidding Requests', view: 'biddingRequests' },
    ],
  },
  {
    key: 'myFavorites',
    label: 'My Favorites',
    items: [
      { type: 'view', label: 'Wishlist', view: 'wishlist' },
      { type: 'view', label: 'Following', view: 'following' },
      { type: 'view', label: 'Recently Viewed', view: 'recentlyViewed' },
      { type: 'view', label: 'My Following', view: 'myFollowing' },
    ],
  },
  {
    key: 'customerService',
    label: 'Customer Service',
    items: [
      { type: 'view', label: 'My Messages', view: 'messages' },
      { type: 'view', label: 'Service Records', view: 'serviceRecords' },
    ],
  },
  {
    key: 'otherServices',
    label: 'Other Services',
    defaultOpen: true,
    items: [
      { type: 'view', label: 'Shopping Community', view: 'shoppingCommunity' },
      { type: 'view', label: 'Affiliated Stores', view: 'affiliatedStores' },
      { type: 'link', label: 'Contact Preferences', href: '/account/contact-preferences' },
    ],
  },
  {
    key: 'policy',
    label: 'Policy',
    items: [
      { type: 'link', label: 'Shipping Info', href: '/policy/shipping-info' },
      { type: 'link', label: 'Return Policy', href: '/policy/returns' },
      { type: 'link', label: 'Refund', href: '/policy/refund' },
      { type: 'link', label: 'Payment Method', href: '/policy/payment-method' },
      { type: 'link', label: 'Terms & Conditions', href: '/policy/terms' },
    ],
  },
  {
    key: 'accessibility',
    label: 'Accessibility',
    defaultOpen: true,
    items: [
      { type: 'link', label: 'Pop-up & Message Control', href: '/account/settings/notifications' },
    ],
  },
]