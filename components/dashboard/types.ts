import type { LucideIcon } from 'lucide-react'

export type RequestStatus = 'Awaiting payment' | 'Requested'

export type ItemRequest = {
  id: string
  name: string
  url: string
  qty: number
  unitPrice: number
  image: string
  status: RequestStatus
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
  // New — added for the Personal Center-style home page
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
  | 'recentlyViewed'
  | 'myFollowing'


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
  /** Air-freight declaration answers from ItemInfoModal; null while unanswered. */
  isLiquid: boolean | null
  hasBatteries: boolean | null
}

export type WarehouseAddress = {
  region: string
  /** Emoji flag rendered in the row's circular badge — no image asset needed. */
  flag: string
  /** Parenthetical note shown after the region name, e.g. "Tax-free", "New", "Deactivated". */
  note?: string
  /** Deactivated/closing warehouses stay listed but can't be copied. */
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
  /** Category pill shown on the card, e.g. "Global Shopping", "Parcel Forwarding". */
  category: string
  /** Big headline value, e.g. "LKR 1,200", "9% OFF". */
  discount: string
  /** Shorter description below the headline, e.g. "Off your first order". */
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
  amount: number // positive for earned/refunded, negative for redeemed/expired
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