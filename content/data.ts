import type { LucideIcon } from 'lucide-react'
import { Link2, Package, ShoppingBag, Star, Truck } from 'lucide-react'

export type TopChoiceItem = {
  icon: LucideIcon
  title: string
  text: string
  bullets: string[]
  image?: string
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
    image: '/images/service-ship.png',
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
    image: '/images/service-shopping.png',
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
    image: '/images/fast-service.png',
  },
]

export type Partner = { name: string; logo: string }

export const partners: Partner[] = [
  { name: 'eBay', logo: '/logos/ebay.png' },
  { name: 'Rakuten', logo: '/logos/rakuten.png' },
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
  { code: 'IN', name: 'India', img: '/images/destinations/india.png' },
  { code: 'JP', name: 'Japan', img: '/images/destinations/japan.png' },
  { code: 'US', name: 'United States', img: '/images/destinations/usa.png' },
  { code: 'AU', name: 'Australia', img: '/images/destinations/australia.png' },
  { code: 'LK', name: 'Sri Lanka', img: '/images/destinations/sri-lanka.png' },
  // { code: 'DB', name: 'Dubai', img: '/images/destinations/dubai.png' },
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

export type Testimonial = { quote: string; name: string; avatar: string }

export const testimonials: Testimonial[] = [
  {
    quote: 'Super service. Very reliable and responsible to deliver the goods on time.',
    name: 'A. Fernando',
    avatar: '/avatars/a_fernando.jpg',
  },
  {
    quote:
      'I have been using this service for a year and three months. The experience has been excellent — customer service is responsive and helpful with every query.',
    name: 'D. Jansz',
    avatar: '/avatars/d_jansz.jpg',
  },
  {
    quote:
      'Shipping is smooth, and pick-up and delivery are usually within the estimated time. Customer service is prompt and genuinely helpful.',
    name: 'N. Silva',
    avatar: '/avatars/n_silva.jpg',
  },
]

export const promoStripItems = [
  { label: 'eBay Double Rewards', value: '$3 \u2192 $38', tone: 'bg-rust text-paper' },
  { label: 'Ramadan Flash Sale', value: 'Up to 25% off', tone: 'bg-blue text-paper' },
  { label: "Mercari, Japan's finest", value: 'New arrivals weekly', tone: 'bg-gold text-ink' },
]

export const statsBandItems = [
  { value: '90%', label: 'Max savings on shopping abroad' },
  { value: '50%', label: 'Orders are hard-to-find products' },
  { value: '12M+', label: 'Shipments handled by WishDrop' },
]

export const footerSocialLinks = [
  { label: 'WishDrop Sri Lanka', icon: Link2, href: '#' },
  { label: 'wishdrop.goodies', icon: Star, href: '#' },
]

export const footerColumns = [
  { heading: 'About WishDrop', links: ['About us', 'Join us'] },
  { heading: 'Shipping supports', links: ['Overseas warehouses', 'Prohibited items', 'Tutorials'] },
  { heading: 'Help', links: ['Beginner tips', 'Contact us'] },
]

export type NavItem = { name: string; desc: string; href: string }
export type NavLink = { href: string; label: string; items?: NavItem[] }

export const navLinks: NavLink[] = [
  {
    href: '#shipping',
    label: 'Shipping',
    items: [
      { name: 'Forwarding services', desc: 'Ship packages from 10+ countries to Home', href: '/shipping/' },
      { name: 'Pricing', desc: 'Calculate shipping cost by weight & destination', href: '/shipping/pricing/' },
      { name: 'Taxation', desc: 'Duty, Tax & Customs Document', href: '/taxation/' },
      { name: 'Shipping protection plan', desc: 'Secure your international shipments', href: '/shipping/protection/' },
    ],
  },
  {
    href: '#shopping',
    label: 'Shopping',
    items: [
      { name: 'Global shopping services', desc: 'Shop from international retailers worldwide', href: '/shopping/' },
      { name: 'Shopping protection plan', desc: '7-day safe returns secure online shopping', href: '/shopping/protection/' },
      { name: 'Mercari', desc: 'Buy from Mercari Japan with forwarding', href: '/shopping/marketplaces/mercari/' },
      {
        name: 'JDirectItems Auction',
        desc: 'Official JDirectItems Auction partner for auction bidding with forwarding',
        href: '/jdirectitems-auction/',
      },
      { name: 'eBay', desc: 'Official eBay partner — one-stop proxy ordering and forwarding service', href: '/shopping/marketplaces/ebay/' },
    ],
  },
  {
    href: '#destinations',
    label: 'Discovery',
    items: [
      { name: 'Trending products', desc: 'Based on what other users are buying', href: '/community/discover/recommended/' },
      { name: 'Shopping blogs', desc: 'Worldwide latest buying tips', href: '/blog/' },
      { name: 'Shopping guides', desc: 'Step-by-step guides for buying from top brands', href: '/shopping-guides/' },
      { name: 'Coupons', desc: 'Save on shipping & shopping fees', href: '/coupons/' },
    ],
  },
  {
    href: '#help',
    label: 'Support',
    items: [
      { name: 'Service notices', desc: 'Warehouses updates & service alerts', href: '/blog/categories/notices/' },
      { name: 'Help centres', desc: 'Frequently asked questions by users', href: 'https://help.buyandship.com.my/hc/en-my' },
    ],
  },
]