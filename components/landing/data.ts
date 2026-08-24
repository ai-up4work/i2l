import type { LucideIcon } from 'lucide-react'
import { Package, ShoppingBag, Truck } from 'lucide-react'

export type TopChoiceItem = {
  icon: LucideIcon
  title: string
  text: string
  bullets: string[]
}

export const topChoices: TopChoiceItem[] = [
  {
    icon: Package,
    title: 'Ship from abroad',
    text: 'Get a free warehouse address in 10+ regions and consolidate every parcel into one shipment.',
    bullets: [
      'Free consolidation for shipments from 10 regions',
      'No hidden fees, weight-based pricing',
      'Free shipping protection on every parcel',
    ],
  },
  {
    icon: ShoppingBag,
    title: 'Proxy shopping',
    text: "Can't check out on an overseas site? We buy it for you from 5,000+ online stores.",
    bullets: [
      'Affordable service fee from as low as 6%',
      'Quick order confirmation',
      "We buy from stores that don't ship to Sri Lanka",
    ],
  },
  {
    icon: Truck,
    title: 'Express checkout',
    text: 'One click to buy the hottest overseas items in our in-app marketplace, no forwarding needed.',
    bullets: [
      'Easy payment with local credit cards',
      'Exclusive deals from our shopping partners',
      'Verified reviews from real members',
    ],
  },
]

export type Partner = { name: string; logo: string }

export const partners: Partner[] = [
  { name: 'eBay', logo: '/logos/ebay.png' },
  { name: 'Rakuten', logo: '/logos/rakuten.png' },
  { name: 'Mercari', logo: '/logos/mercari.png' },
  { name: 'Amazon', logo: '/logos/amazon.png' },
  { name: 'Qoo10', logo: '/logos/qoo10.png' },
  { name: 'Lazada', logo: '/logos/lazada.png' },
  { name: 'Shopee', logo: '/logos/shopee.png' },
  { name: 'JD.com', logo: '/logos/jd.png' },
  { name: 'AliExpress', logo: '/logos/aliexpress.png' },
  // { name: 'Taobao', logo: '/logos/taobao.png' },
]

export type LandingPromoCode = {
  tag: string
  discount: string
  title: string
  code: string
  expiresOn: string
}

export const promoCodes: LandingPromoCode[] = [
  {
    tag: 'Express Checkout',
    discount: '$50',
    title: 'Off orders over $50, easy checkout (excludes select categories)',
    code: 'HK826E50',
    expiresOn: '2026-08-31',
  },
  {
    tag: 'Proxy Shopping',
    discount: '15% OFF',
    title: 'Selected Italian brands — Lemaire, Delvaux, and more',
    code: 'HK326UIT',
    expiresOn: '2027-03-31',
  },
  {
    tag: 'Proxy Shopping',
    discount: '2% OFF',
    title: 'eBay proxy orders over $400',
    code: 'HK826B2',
    expiresOn: '2026-08-31',
  },
]

export type Destination = { code: string; name: string; img: string }

export const destinations: Destination[] = [
  { code: 'IN', name: 'India', img: '/images/hero-parcel.png' },
  { code: 'JP', name: 'Japan', img: '/images/service-shopping.png' },
  { code: 'US', name: 'United States', img: '/images/service-forwarding.png' },
  { code: 'AU', name: 'Australia', img: '/images/community-collage.png' },
  { code: 'LK', name: 'Sri Lanka', img: '/images/hero-parcel.png' },
]

export type Step = { title: string; text: string }

export const steps: Step[] = [
  {
    title: 'Get a warehouse address',
    text: 'Select the warehouse address as your shipping address when checking out on overseas sites.',
  },
  {
    title: 'Add your shipment',
    text: 'Once your parcel arrives, declare its tracking number so our team can prepare it for the trip home.',
  },
  {
    title: 'Create a shipping order',
    text: 'Pay the shipping fee. You can also consolidate multiple parcels into one to save on cost.',
  },
  {
    title: 'Wait for delivery',
    text: "Your parcel is sent out within 1-2 working days and you'll receive live tracking details.",
  },
]

export type Guide = { tag: 'Offers' | 'Home' | 'Guide'; img: string; title: string; meta: string }

export const guides: Guide[] = [
  {
    tag: 'Offers',
    img: '/images/service-shopping.png',
    title: 'Proxy shopping rewards — earn up to Rs 5,000 back',
    meta: 'Shopping Rewards',
  },
  {
    tag: 'Home',
    img: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?q=80&w=600&auto=format&fit=crop',
    title: 'Kitchen must-buys: 6 gadgets worth the shipping fee',
    meta: 'Home & Living',
  },
  {
    tag: 'Guide',
    img: 'https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?q=80&w=600&auto=format&fit=crop',
    title: 'Trading card collecting 101: what to know before you order',
    meta: 'Entertainment',
  },
  {
    tag: 'Guide',
    img: 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?q=80&w=600&auto=format&fit=crop',
    title: "US vs Japan sneaker drops: what's actually worth importing",
    meta: 'Lifestyle',
  },
  {
    tag: 'Offers',
    img: 'https://images.unsplash.com/photo-1607082350899-7e105aa886ae?q=80&w=600&auto=format&fit=crop',
    title: '2026 proxy shopping deals — exclusive member pricing',
    meta: 'Offers & Notices',
  },
  {
    tag: 'Guide',
    img: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?q=80&w=600&auto=format&fit=crop',
    title: 'Summer sale season: the best times to order from abroad',
    meta: 'Fashion',
  },
]

export type CommunityPost = { img: string; user: string; likes: number }

export const community: CommunityPost[] = [
  { img: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?q=80&w=400&auto=format&fit=crop', user: 'anjali_k', likes: 8 },
  { img: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?q=80&w=400&auto=format&fit=crop', user: 'kavindu.p', likes: 5 },
  { img: 'https://images.unsplash.com/photo-1585386959984-a4155224a1ad?q=80&w=400&auto=format&fit=crop', user: 'shalini.store', likes: 7 },
  { img: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?q=80&w=400&auto=format&fit=crop', user: 'r_perera', likes: 4 },
  { img: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?q=80&w=400&auto=format&fit=crop', user: 'nadeesha.m', likes: 12 },
  { img: 'https://images.unsplash.com/photo-1595341888016-a392ef81b7de?q=80&w=400&auto=format&fit=crop', user: 'oshan_kt', likes: 10 },
  { img: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?q=80&w=400&auto=format&fit=crop', user: 'binara.w', likes: 18 },
  { img: 'https://images.unsplash.com/photo-1591561954557-26941169b49e?q=80&w=400&auto=format&fit=crop', user: 'thilini_j', likes: 21 },
  { img: 'https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?q=80&w=400&auto=format&fit=crop', user: 'ishara.dev', likes: 22 },
]

export type Testimonial = { quote: string; name: string }

export const testimonials: Testimonial[] = [
  { quote: 'Super service. Very reliable and responsible to deliver the goods on time.', name: 'A. Fernando' },
  {
    quote:
      'I have been using this service for a year and three months. The experience has been excellent — customer service is responsive and helpful with every query.',
    name: 'D. Jansz',
  },
  {
    quote:
      'Shipping is smooth, and pick-up and delivery are usually within the estimated time. Customer service is prompt and genuinely helpful.',
    name: 'N. Silva',
  },
]
