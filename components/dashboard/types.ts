import type { LucideIcon } from 'lucide-react'

// ── Request status ──────────────────────────────────────────────────────
// This is the SINGLE source of truth. The old types.ts had two versions
// disagreeing on the flow — this replaces both.
//
// 'Cancelled' is deliberately NOT part of REQUEST_STATUS_FLOW below.
// It isn't a step you move "forward" through — it's a branch off the
// early stages, only reachable while nothing has been purchased yet.
export type RequestStatus =
  | 'Requested'
  | 'Awaiting payment'
  | 'Order accepted'
  | 'Product received'
  | 'Quality check'
  | 'Packaging'
  | 'Shipped'
  | 'Delivered'
  | 'Cancelled'

// Canonical forward order. Enforced by lib/orderStateMachine.ts — nothing
// can jump stages or skip backward outside of that module.
export const REQUEST_STATUS_FLOW: RequestStatus[] = [
  'Requested',
  'Awaiting payment',
  'Order accepted',
  'Product received',
  'Quality check',
  'Packaging',
  'Shipped',
  'Delivered',
]

export type StatusActor = 'customer' | 'admin' | 'system'

// One row per transition. This is what the timeline UI renders, and it's
// the audit trail that answers "why can't I cancel this" for a customer.
export type StatusEvent = {
  status: RequestStatus
  at: string // ISO timestamp
  actor: StatusActor
  note?: string
}

export type ItemRequest = {
  id: string
  name: string
  url: string
  qty: number
  unitPrice: number
  image: string
  status: RequestStatus
  statusHistory: StatusEvent[]
  customerId: string
  customerName: string
}

export type OfferTone = 'sun' | 'ebay' | 'welcome' | 'rakuten' | 'referral' | 'anime'

export type Offer = {
  title: string
  img: string
  tone: OfferTone
}

export type View =
  | 'home'
  | 'shoppingCommunity'
  | 'addRequest'
  | 'affiliatedStores'
  | 'addShipment'
  | 'warehouseAddresses'
  | 'requests'
  | 'shipmentOrders'
  | 'biddingRequests'
  | 'confirmRequest'
  | 'preview'
  | 'promoCodes'
  | 'credits'
  | 'referrals'
  | 'ordersHub'
  | 'settings'
  | 'account'
  | 'paymentOptions'
  | 'profile'
  | 'coupons'
  | 'points'
  | 'wallet'
  | 'giftCard'
  | 'messages'
  | 'serviceRecords'
  | 'wishlist'
  | 'following'
  | 'recentlyViewed'
  | 'wishdropVip'
  | 'AddressBook'
  | 'trackingOrders'
  | 'myFollowing'
  | 'cart'
  | 'boards'
  | '/messages/serviceRecords'
  | '/account/my-following'
  | '/account/recently-viewed'
  | '/account/wishlist'

export type NavItem = {
  label: string
  icon: LucideIcon
  view: View
}

export type Draft = {
  url: string
  name: string
  qty: number
  unitPrice: number
  currency: string
  image: string
  isLiquid: boolean | null
  hasBatteries: boolean | null
}

export type WarehouseAddress = {
  region: string
  flag: string
  note?: string
  disabled?: boolean
  country: string
  recipientPrefix: string
  addressLines: string[]
  postalCode: string
  phone: string
}

export type ShipmentOrderStatus = 'Preparing' | 'In transit' | 'Delivered' | 'Delayed'

export type ShipmentOrder = {
  id: string
  origin: string
  parcelCount: number
  weightKg: number
  status: ShipmentOrderStatus
  updatedAt: string
}

export type BiddingStatus = 'Bidding open' | 'You are winning' | 'Outbid' | 'Won'

export type BiddingRequest = {
  id: string
  name: string
  image: string
  currentBid: number
  yourMaxBid: number
  status: BiddingStatus
  endsIn: string
}

export type PromoCodeStatus = 'Available' | 'Used' | 'Expired'

export type PromoCode = {
  code: string
  category: string
  discount: string
  title: string
  expiresOn: string
  status: PromoCodeStatus
}

export type CommunityPost = {
  user: string
  tag: string
  content: string
  likes: number
  comments: number
  avatar?: string
}

export type CreditTransactionType = 'earned' | 'redeemed' | 'expired'

export type CreditTransaction = {
  id: string
  label: string
  date: string
  amount: number
  type: CreditTransactionType
}

export type EarnMethod = {
  title: string
  description: string
  reward: string
}

export type ReferralStatus = 'Invited' | 'Joined' | 'Rewarded'

export type ReferredFriend = {
  name: string
  status: ReferralStatus
  reward: string
  date: string
}

export type RewardTier = {
  friends: string
  reward: string
}