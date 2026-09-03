// components/dashboard/data.ts
//
// Non-store dashboard mock data: nav, warehouses, shipments, bidding,
// promo codes, community posts, credits, referrals. Store-related data
// (affiliatedStores, mockProducts, platformLogos, and the legacy
// ALL_STORES shape) moved to data/stores/data.ts — that's now the
// canonical source. This file just re-exports it below so existing
// `import { affiliatedStores } from '@/components/dashboard/data'` call
// sites (several across app/(public)/stores/**) keep working unchanged.
// Don't add new store fields here — add them in data/stores/data.ts.

import {
  Boxes,
  Gavel,
  Home,
  MapPin,
  MessagesSquare,
  PackagePlus,
  PiggyBank,
  ShoppingBag,
  Ticket,
  Truck,
  UserPlus,
} from 'lucide-react'
import type {
  BiddingRequest,
  CommunityPost,
  CreditTransaction,
  EarnMethod,
  ItemRequest,
  NavItem,
  Offer,
  PromoCode,
  ReferredFriend,
  RewardTier,
  ShipmentOrder,
  WarehouseAddress,
} from './types'
import { productImage, random } from '@/lib/mock-assets'

// Re-exported in case any non-store file already imports the image pool
// from here rather than from lib/mock-assets directly.
export { productImage }

export const initialRequests: ItemRequest[] = [
  {
    id: 'P003740746',
    name: 'HP EliteBook 840 G8 14" 16GB 256GB SSD Core i5-1145G7 — Excellent condition',
    url: '',
    qty: 1,
    unitPrice: 275,
    image: random(productImage),
    status: 'Awaiting payment',
  },
]

export const offers: Offer[] = [
  { title: 'Shop More. Save More.', img: '/offers/offer1.jpg', tone: 'sun' },
  { title: 'Cross Borders, Not Budgets', img: '/offers/offer2.jpg', tone: 'sun' },
  { title: 'Welcome to WishDrop', img: '/offers/offer3.jpg', tone: 'welcome' },
  { title: 'Rakuten Japan Exclusive', img: '/offers/offer4.jpg', tone: 'rakuten' },
  { title: 'Refer Friends, Earn Rewards', img: '/offers/offer5.jpg', tone: 'referral' },
  { title: 'Anime Collectibles: 25% Off Shipping', img: '/offers/offer6.jpg', tone: 'anime' },
]

export const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: '',
    items: [
      { label: 'Member Centre', icon: Home, view: 'home' },
      { label: 'Shopping Community', icon: MessagesSquare, view: 'shoppingCommunity' },
    ],
  },
  {
    label: 'Track & Manage',
    items: [
      { label: 'Buying requests', icon: ShoppingBag, view: 'requests' },
      { label: 'Order tracking', icon: Truck, view: 'ordersHub' },
    ],
  },
  {
    label: 'Coupons & Rewards',
    items: [
      { label: 'Promo codes', icon: Ticket, view: 'promoCodes' },
      { label: 'My credits', icon: PiggyBank, view: 'credits' },
      { label: 'My referrals', icon: UserPlus, view: 'referrals' },
    ],
  },
  {
    label: 'Profile & Settings',
    items: [
    { label: 'Profile', icon: UserPlus, view: 'account' },   // was 'settings'
    ]
  }
]

export const warehouseAddresses: WarehouseAddress[] = [
  {
    region: 'Portland, U.S.',
    flag: '🇺🇸',
    note: 'Tax-free',
    country: 'US',
    recipientPrefix: 'Safnas Kaldeen',
    addressLines: ['I2L Warehouse #48219', '2500 Gateway Drive, Suite 400', 'Portland, OR 97201'],
    postalCode: '97201',
    phone: '+1 503 555 0148',
  },
  {
    region: 'Chiba, Japan',
    flag: '🇯🇵',
    note: 'Effective July 28',
    country: 'JP',
    recipientPrefix: 'I2L 48219',
    addressLines: ['I2L Warehouse #48219', '3-2-1 Shinminato, Chuo-ku', 'Chiba 260-0003'],
    postalCode: '260-0003',
    phone: '+81 43 555 0148',
  },
  {
    region: 'Toronto, Canada',
    flag: '🇨🇦',
    country: 'CA',
    recipientPrefix: 'Safnas Kaldeen',
    addressLines: ['I2L Warehouse #48219', '120 Bremner Blvd, Unit 8', 'Toronto, ON M5J 0A8'],
    postalCode: 'M5J 0A8',
    phone: '+1 416 555 0148',
  },
  {
    region: 'Ashford, U.K.',
    flag: '🇬🇧',
    country: 'GB', // was 'UK' — flagcdn.com expects the real ISO 3166-1 code, not 'UK'
    recipientPrefix: 'Safnas Kaldeen',
    addressLines: ['I2L Warehouse #48219', 'Unit 12, Metroline Business Park', 'Ashford, Kent TN24 0LH'],
    postalCode: 'TN24 0LH',
    phone: '+44 1233 555 019',
  },
  {
    region: 'Milan, Italy',
    flag: '🇮🇹',
    note: 'New',
    country: 'IT',
    recipientPrefix: 'Safnas Kaldeen',
    addressLines: ['I2L Warehouse #48219', 'Via Privata Antonio Bertolazzi 4', '20124 Milano MI'],
    postalCode: '20124',
    phone: '+39 02 5550 0148',
  },
  {
    region: 'Sydney, Australia',
    flag: '🇦🇺',
    country: 'AU',
    recipientPrefix: 'Safnas Kaldeen',
    addressLines: ['I2L Warehouse #48219', '55 Pyrmont Bridge Road', 'Sydney NSW 2009'],
    postalCode: '2009',
    phone: '+61 2 5550 0148',
  },
  {
    region: 'Seoul, Korea',
    flag: '🇰🇷',
    country: 'KR',
    recipientPrefix: 'I2L 48219',
    addressLines: ['I2L Warehouse #48219', '123 Teheran-ro, Gangnam-gu', 'Seoul 06142'],
    postalCode: '06142',
    phone: '+82 2 555 0148',
  },
  {
    region: 'Dongguan, China',
    flag: '🇨🇳',
    country: 'CN',
    recipientPrefix: '48219 康达林',
    addressLines: ['I2L 转运仓 #48219', '广东省东莞市南城区', '鸿福路二段'],
    postalCode: '523000',
    phone: '+86 769 5550 148',
  },
  {
    region: 'Taipei, Taiwan',
    flag: '🇹🇼',
    country: 'TW',
    recipientPrefix: 'I2L 48219',
    addressLines: ['I2L Warehouse #48219', 'No. 100, Sec. 2, Dunhua S. Rd', "Da'an District, Taipei 106"],
    postalCode: '106',
    phone: '+886 2 5550 148',
  },
  {
    region: 'Bangkok, Thailand',
    flag: '🇹🇭',
    note: 'Closing soon',
    country: 'TH',
    recipientPrefix: 'I2L 48219',
    addressLines: ['I2L Warehouse #48219', '99 Sukhumvit Road', 'Bangkok 10110'],
    postalCode: '10110',
    phone: '+66 2 555 0148',
  },
  {
    region: 'Milan, Italy',
    flag: '🇮🇹',
    note: 'Deactivated',
    disabled: true,
    country: 'IT',
    recipientPrefix: 'Safnas Kaldeen',
    addressLines: ['I2L Warehouse #40112 (closed)', 'Via Roma 21', '20121 Milano MI'],
    postalCode: '20121',
    phone: '+39 02 5550 0112',
  },
  {
    region: 'Shenzhen, China',
    flag: '🇨🇳',
    note: 'Deactivated',
    disabled: true,
    country: 'CN',
    recipientPrefix: '40112 康达林',
    addressLines: ['I2L 转运仓 #40112 (已关闭)', '广东省深圳市宝安区', '西乡街道固戍二路'],
    postalCode: '518102',
    phone: '+86 755 5550 112',
  },
]

export const shipmentOrders: ShipmentOrder[] = [
  { id: 'SH20260714', origin: 'United States', parcelCount: 3, weightKg: 4.2, status: 'In transit', updatedAt: 'Aug 20, 2026' },
  { id: 'SH20260703', origin: 'Japan', parcelCount: 1, weightKg: 1.1, status: 'Delivered', updatedAt: 'Aug 14, 2026' },
  { id: 'SH20260628', origin: 'United Kingdom', parcelCount: 2, weightKg: 2.6, status: 'Preparing', updatedAt: 'Aug 10, 2026' },
  { id: 'SH20260611', origin: 'China', parcelCount: 5, weightKg: 7.8, status: 'Delayed', updatedAt: 'Aug 6, 2026' },
]

export const biddingRequests: BiddingRequest[] = [
  {
    id: 'B0091422',
    name: 'Vintage Rolex Datejust 36mm, box & papers',
    image: random(productImage),
    currentBid: 3120,
    yourMaxBid: 3400,
    status: 'You are winning',
    endsIn: '4h 12m',
  },
  {
    id: 'B0091108',
    name: 'Sealed Pokémon 151 Booster Box (Japanese)',
    image: random(productImage),
    currentBid: 210,
    yourMaxBid: 200,
    status: 'Outbid',
    endsIn: '1d 3h',
  },
  {
    id: 'B0089765',
    name: 'Nintendo Game & Watch — Zelda, unopened',
    image: random(productImage),
    currentBid: 145,
    yourMaxBid: 145,
    status: 'Won',
    endsIn: 'Ended',
  },
]

export const promoCodes: PromoCode[] = [
  { code: 'WELCOME1200', category: 'Global Shopping', discount: 'LKR 1,200', title: 'Off your first order, any category', expiresOn: '2026-09-30', status: 'Available' },
  { code: 'SHIP9OFF', category: 'Parcel Forwarding', discount: '9% OFF', title: 'Shipping discount, all regions', expiresOn: '2026-08-31', status: 'Available' },
  { code: 'RAKUTEN500', category: 'Proxy Shopping', discount: '¥500', title: 'Off Rakuten orders over ¥5,000', expiresOn: '2026-09-15', status: 'Available' },
  { code: 'REFER20', category: 'Referral Rewards', discount: '20 credits', title: 'Used on shipment SH20260703', expiresOn: '2026-07-20', status: 'Used' },
  { code: 'SUMMER25', category: 'Proxy Shopping', discount: '25% OFF', title: 'Service fee, summer sale', expiresOn: '2026-07-01', status: 'Expired' },
]

export const communityPosts: CommunityPost[] = [
  { user: 'anjali_k', tag: 'Unboxing', content: 'My eBay find finally arrived — packed so well, not a single scratch on the box!', likes: 24, comments: 6, avatar: '/creators/creator-01.jpg' },
  { user: 'oshan_kt', tag: 'Tip', content: 'Consolidating 4 parcels from the US saved me almost LKR 6,000 in shipping. Worth the extra wait.', likes: 41, comments: 11, avatar: '/creators/creator-02.jpg' },
  { user: 'binara.w', tag: 'Question', content: 'Has anyone used the proxy service for Rakuten before? Wondering about typical turnaround time.', likes: 9, comments: 14, avatar: '/creators/creator-03.jpg' },
  { user: 'ishara.dev', tag: 'Review', content: 'Bidding request came through under my max bid and support kept me updated the whole time.', likes: 32, comments: 4, avatar: '/creators/creator-04.jpg' },
  { user: 'thilini_j', tag: 'Unboxing', content: 'Sneaker restock from Japan, next-day dispatch from the warehouse. Very happy with this round.', likes: 58, comments: 9, avatar: '/creators/creator-05.jpg' },
]

// Matches the "0 My credits" stat shown on the home page — a new
// account starts with an empty ledger, so the Credits page is designed
// to look complete with zero transactions rather than needing fake data.
export const creditBalance = 0
export const creditTransactions: CreditTransaction[] = []

export const earnMethods: EarnMethod[] = [
  { title: 'Refer a friend', description: 'They get LKR 1,200 off their first order, you get credits once it ships.', reward: '+500 credits' },
  { title: 'Leave a review', description: 'Share a quick review after any delivered shipment or purchased request.', reward: '+50 credits' },
  { title: 'Complete your profile', description: 'Verify your phone number and add a delivery address.', reward: '+100 credits' },
]

// Matches the "0 My referrals" stat on the home page for the same reason
// creditTransactions is empty above.
export const referralCode = 'SAFNAS25'
export const referralLink = `https://WishDrop.example/r/${referralCode}`
export const referralStats = { invited: 0, joined: 0, creditsEarned: 0 }
export const referredFriends: ReferredFriend[] = []

export const rewardTiers: RewardTier[] = [
  { friends: '1 friend', reward: '500 credits' },
  { friends: '5 friends', reward: '3,000 credits + free shipping voucher' },
  { friends: '10 friends', reward: '7,000 credits + priority support' },
]

// ─── Store data (re-exported for back-compat) ──────────────────────────────
// Canonical source is data/stores/data.ts — see that file. Kept here so
// existing imports from '@/components/dashboard/data' don't need to change.
export {
  affiliatedStores,
  type AffiliatedStore,
  type StoreKind,
  type StoreBuildType,
  platformLogos,
  mockProducts,
  type MockProduct,
  ALL_STORES,
  type Store,
  type StoreType,
  type FilterKey,
  FILTERS,
  ALPHABET,
} from '@/data/stores/data'

