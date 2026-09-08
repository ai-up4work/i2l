/**
 * contexts/orderContexts.tsx
 *
 * Mock order data + context for the customer-facing "My Orders" page
 * (app/account/orders/page.tsx) and the "Track Order" page
 * (app/account/orders/track/page.tsx). Wrap your orders page (or a layout
 * above it) in <OrdersProvider> and read data with the useOrders() hook.
 *
 * This is intentionally a drop-in mock: swap MOCK_ORDERS for a real
 * fetch/query (e.g. load them in a server component and pass as
 * `initialOrders` to <OrdersProvider>) and everything downstream keeps
 * working as-is.
 *
 * Each OrderItem carries an `image` field used for the product thumbnail(s)
 * on the order card. The values below use LoremFlickr (https://loremflickr.com),
 * a keyword-based service that serves real, licensed Creative Commons photos
 * matching the given tag(s) — so each item shows an actual photo of that kind
 * of product instead of a flat placeholder swatch. For production, replace
 * each with the real product photo URL from your catalog/CDN.
 *
 * `recipient` / `timeline` (added for the Track Order detail page):
 * Both are OPTIONAL on Order. If you don't set them, `getOrderRecipient()`
 * and `getOrderTimeline()` synthesize sensible values from the order's
 * existing fields (date, status, carrier) so the track page still renders
 * correctly for every order — only WD-10482 has hand-authored values below,
 * as a fully-worked example. Swap in real address/event data per order when
 * you wire this up to a backend.
 */
'use client'

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

export type OrderStatus = 'Processing' | 'Quality Check' | 'Shipped' | 'Delivered' | 'Cancelled'

export type OrderItem = {
  name: string
  variant?: string // e.g. "Size UK 9" or "Color: Black" — omit if not applicable
  qty: number
  unitPrice: number
  image: string // product photo URL shown as the item thumbnail
}

export type OrderRecipient = {
  name: string
  city: string
  country: string
}

// Icon key used to pick a lucide icon for a timeline entry on the track page.
export type TimelineIconKey = 'confirmed' | 'purchased' | 'received' | 'quality' | 'shipped' | 'delivered'

export type TimelineEvent = {
  icon: TimelineIconKey
  title: string
  subtitle?: string // e.g. "WishDrop facility · India"
  date: string // short label, e.g. "Sep 7" — must match today's `getTodayLabel()` output to collapse to a time-only row
  time: string // e.g. "10:42 AM"
}

export type Order = {
  id: string
  date: string
  status: OrderStatus
  items: OrderItem[]
  currency: 'LKR' | 'INR'
  note?: string // e.g. quality-check status message
  carrier?: string // e.g. "DHL Express" — only meaningful once Shipped
  trackingNumber?: string
  estimatedDelivery?: string // e.g. "Sep 4 – Sep 6"
  recipient?: OrderRecipient // optional — falls back via getOrderRecipient()
  timeline?: TimelineEvent[] // optional — falls back via getOrderTimeline()
}

export const FILTERS: Array<OrderStatus | 'All'> = [
  'All',
  'Processing',
  'Quality Check',
  'Shipped',
  'Delivered',
  'Cancelled',
]

export const SHIPPING_FLOW: Array<'Ordered' | 'Quality Check' | 'Shipped' | 'Delivered'> = [
  'Ordered',
  'Quality Check',
  'Shipped',
  'Delivered',
]

export const STATUS_BADGE: Record<OrderStatus, string> = {
  Processing: 'bg-indigo/8 text-indigo',
  'Quality Check': 'bg-teal/10 text-teal-deep',
  Shipped: 'bg-teal/15 text-teal-deep',
  Delivered: 'bg-gold/12 text-gold-deep',
  Cancelled: 'bg-ink/8 text-ink/60',
}

// Sum of qty * unitPrice across every item in the order.
export function orderTotal(order: Order) {
  return order.items.reduce((sum, it) => sum + it.qty * it.unitPrice, 0)
}

// Build the "Size UK 9 · Qty: 2" style line for a single item.
export function itemMeta(item: OrderItem) {
  return [item.variant, `Qty: ${item.qty}`].filter(Boolean).join(' · ')
}

// Maps an order's status to its index in SHIPPING_FLOW (Ordered, Quality
// Check, Shipped, Delivered). Returns -1 for Cancelled, since a cancelled
// order has no progress to show on the stepper.
export function shippingStepIndex(status: OrderStatus): number {
  switch (status) {
    case 'Processing':
      return 0
    case 'Quality Check':
      return 1
    case 'Shipped':
      return 2
    case 'Delivered':
      return 3
    default:
      return -1
  }
}

// "Sep 7" style label for today, used to collapse same-day timeline rows
// down to a time-only display (see getOrderTimeline / the track page).
export function getTodayLabel(): string {
  return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Where the order is headed. Falls back to a generic placeholder when the
// order has no explicit `recipient` set.
export function getOrderRecipient(order: Order): OrderRecipient {
  return order.recipient ?? { name: 'Customer', city: 'Colombo', country: 'Sri Lanka' }
}

// Newest-first list of tracking events for the track page's timeline. Uses
// `order.timeline` when present; otherwise synthesizes a reasonable history
// from the order's date/status/carrier so every order (not just the demo
// one) renders a populated timeline.
export function getOrderTimeline(order: Order): TimelineEvent[] {
  if (order.timeline) return order.timeline
  if (order.status === 'Cancelled') return []

  const idx = shippingStepIndex(order.status)
  const events: TimelineEvent[] = [
    { icon: 'confirmed', title: 'Order confirmed', date: order.date, time: '10:52 AM' },
    { icon: 'purchased', title: 'Purchased', subtitle: 'Online store', date: order.date, time: '11:25 AM' },
  ]

  if (idx >= 1) {
    events.push({
      icon: 'received',
      title: 'Item received',
      subtitle: 'WishDrop facility',
      date: order.date,
      time: '4:18 PM',
    })
  }
  if (idx === 1) {
    events.push({
      icon: 'quality',
      title: 'Quality check in progress',
      subtitle: 'WishDrop facility',
      date: getTodayLabel(),
      time: '10:42 AM',
    })
  } else if (idx >= 2) {
    events.push({
      icon: 'quality',
      title: 'Quality check complete',
      subtitle: 'WishDrop facility',
      date: order.date,
      time: '6:00 PM',
    })
  }
  if (idx >= 2) {
    events.push({
      icon: 'shipped',
      title: order.status === 'Shipped' ? 'Shipped' : 'Shipped from facility',
      subtitle: order.carrier
        ? `${order.carrier}${order.trackingNumber ? ' · ' + order.trackingNumber : ''}`
        : undefined,
      date: idx === 2 ? getTodayLabel() : order.date,
      time: '9:10 AM',
    })
  }
  if (idx >= 3) {
    events.push({
      icon: 'delivered',
      title: 'Delivered',
      date: getTodayLabel(),
      time: '2:35 PM',
    })
  }

  return events.reverse() // newest first
}

// Real, license-friendly product photo matching the given keyword(s), served
// via LoremFlickr's keyword lookup (https://loremflickr.com/WIDTH/HEIGHT/tag1,tag2).
// A stable `lock` id is included so the same item always renders the same photo
// instead of a new random one on every reload.
function productImage(keywords: string, lock: number) {
  return `https://loremflickr.com/200/200/${keywords}?lock=${lock}`
}

// Deliberately broad coverage across status × currency × item-shape, plus a
// few edge cases worth testing in the UI:
//   - Quality Check WITHOUT a note (order #10479) — the note banner is
//     conditional on `note` being present, not just on status.
//   - A 4-item order (#10470) — the card only shows the first 3 thumbnails
//     (`items.slice(0, 3)`), so this exercises that overflow.
//   - A very long product name (#10461) — wrapping/truncation check.
//   - Cancelled with qty > 1 (#10450) — cancellation isn't only ever qty 1.
//   - Enough rows (18) to exercise pagination across multiple pages at
//     PAGE_SIZE = 4.
const MOCK_ORDERS: Order[] = [
  // Processing — single product, quantity 1
  {
    id: 'WD-10499',
    date: 'Sep 07, 2026',
    status: 'Processing',
    currency: 'INR',
    items: [
      { name: 'Ceramic coffee mug set', qty: 1, unitPrice: 2450, image: productImage('coffee,mug', 1) },
    ],
  },
  // Processing — single product, quantity > 1
  {
    id: 'WD-10497',
    date: 'Sep 06, 2026',
    status: 'Processing',
    currency: 'LKR',
    items: [
      {
        name: 'Cotton bedsheet set',
        variant: 'King Size',
        qty: 2,
        unitPrice: 5400,
        image: productImage('bedsheet,linen', 2),
      },
    ],
  },
  // Processing — multiple products, mixed quantities
  {
    id: 'WD-10495',
    date: 'Sep 05, 2026',
    status: 'Processing',
    currency: 'INR',
    items: [
      { name: 'Spiral notebook', qty: 3, unitPrice: 220, image: productImage('notebook,stationery', 3) },
      { name: 'Gel pen pack', qty: 1, unitPrice: 350, image: productImage('pen,stationery', 4) },
    ],
  },
  // Quality Check — single product, quantity 1, with note
  // (fully worked example: explicit recipient + timeline matching the
  // Track Order screenshot exactly)
  {
    id: 'WD-10482',
    date: 'Sep 04, 2026',
    status: 'Quality Check',
    currency: 'INR',
    note: "We've received your item and our team is checking it before it begins its journey to Sri Lanka.",
    estimatedDelivery: 'Sep 12 – 16, 2026',
    recipient: { name: 'K. Safnas', city: 'Colombo', country: 'Sri Lanka' },
    timeline: [
      {
        icon: 'quality',
        title: 'Quality check in progress',
        subtitle: 'WishDrop facility · India',
        date: 'Sep 7',
        time: '10:42 AM',
      },
      {
        icon: 'received',
        title: 'Item received',
        subtitle: 'WishDrop facility · India',
        date: 'Sep 6',
        time: '4:18 PM',
      },
      { icon: 'purchased', title: 'Purchased', subtitle: 'Online store', date: 'Sep 4', time: '11:25 AM' },
      { icon: 'confirmed', title: 'Order confirmed', date: 'Sep 4', time: '10:52 AM' },
    ],
    items: [
      {
        name: 'Nike Air Max 270',
        variant: 'Size UK 9',
        qty: 1,
        unitPrice: 8499,
        image: productImage('running,shoes', 5),
      },
    ],
  },
  // Quality Check — multiple products, with note
  {
    id: 'WD-10480',
    date: 'Sep 03, 2026',
    status: 'Quality Check',
    currency: 'LKR',
    note: 'Both items are being inspected together before they’re packed for shipping.',
    items: [
      { name: 'Aviator sunglasses', qty: 1, unitPrice: 4200, image: productImage('sunglasses', 6) },
      { name: 'Leather wallet', qty: 1, unitPrice: 5600, image: productImage('leather,wallet', 7) },
    ],
  },
  // Quality Check — no note (edge case: banner should not render)
  {
    id: 'WD-10479',
    date: 'Sep 02, 2026',
    status: 'Quality Check',
    currency: 'INR',
    items: [
      {
        name: 'Yoga mat',
        variant: 'Color: Teal',
        qty: 1,
        unitPrice: 2900,
        image: productImage('yoga,mat', 8),
      },
    ],
  },
  // Delivered — single product, quantity > 1
  {
    id: 'WD-10477',
    date: 'Sep 01, 2026',
    status: 'Delivered',
    currency: 'INR',
    items: [
      {
        name: 'Scented soy candle',
        variant: 'Sandalwood',
        qty: 3,
        unitPrice: 1450,
        image: productImage('candle', 9),
      },
    ],
  },
  // Shipped — single product, quantity 1
  {
    id: 'WD-10475',
    date: 'Aug 31, 2026',
    status: 'Shipped',
    currency: 'INR',
    carrier: 'DHL Express',
    trackingNumber: '1Z999AA10123456784',
    estimatedDelivery: 'Sep 4 – Sep 6',
    items: [{ name: 'LED desk lamp', qty: 1, unitPrice: 3100, image: productImage('desklamp', 10) }],
  },
  // Shipped — multiple products, quantity 1 each
  {
    id: 'WD-10471',
    date: 'Aug 29, 2026',
    status: 'Shipped',
    currency: 'LKR',
    carrier: 'FedEx',
    trackingNumber: '7712 4498 3320',
    estimatedDelivery: 'Sep 3 – Sep 5',
    items: [
      { name: 'Baseball cap', qty: 1, unitPrice: 3200, image: productImage('baseballcap', 11) },
      { name: 'Over-ear headphones', qty: 1, unitPrice: 18900, image: productImage('headphones', 12) },
      {
        name: 'Fleece hoodie',
        variant: 'Size L',
        qty: 1,
        unitPrice: 6350,
        image: productImage('hoodie,sweatshirt', 13),
      },
    ],
  },
  // Shipped — 4 products (thumbnail-overflow edge case: only 3 show)
  {
    id: 'WD-10470',
    date: 'Aug 28, 2026',
    status: 'Shipped',
    currency: 'INR',
    carrier: 'DHL Express',
    trackingNumber: '1Z999AA10123456700',
    estimatedDelivery: 'Sep 2 – Sep 4',
    items: [
      { name: 'Kitchen organizer tray', qty: 1, unitPrice: 2200, image: productImage('kitchen,tray', 14) },
      { name: 'Bamboo cutting board', qty: 1, unitPrice: 1650, image: productImage('cuttingboard', 15) },
      { name: 'Cotton dish towels', qty: 2, unitPrice: 450, image: productImage('dishtowel,kitchen', 16) },
      { name: 'Wall spice rack', qty: 1, unitPrice: 1980, image: productImage('spices,rack', 17) },
    ],
  },
  // Processing — multiple products, mixed quantities (variant present)
  {
    id: 'WD-10469',
    date: 'Aug 26, 2026',
    status: 'Processing',
    currency: 'INR',
    items: [
      {
        name: 'Phone case',
        variant: 'Clear',
        qty: 2,
        unitPrice: 1800,
        image: productImage('phonecase,smartphone', 18),
      },
      { name: 'Screen protector', qty: 1, unitPrice: 950, image: productImage('smartphone,glass', 19) },
    ],
  },
  // Delivered — multiple products, quantity 1 each
  {
    id: 'WD-10466',
    date: 'Aug 23, 2026',
    status: 'Delivered',
    currency: 'LKR',
    items: [
      { name: 'Desk organizer tray', qty: 1, unitPrice: 2800, image: productImage('deskorganizer', 20) },
      { name: 'Bluetooth mini speaker', qty: 1, unitPrice: 7900, image: productImage('speaker,bluetooth', 21) },
    ],
  },
  // Delivered — single product, quantity 1
  {
    id: 'WD-10463',
    date: 'Aug 20, 2026',
    status: 'Delivered',
    currency: 'INR',
    items: [
      {
        name: 'Everyday travel backpack',
        variant: 'Color: Black',
        qty: 1,
        unitPrice: 12990,
        image: productImage('backpack', 22),
      },
    ],
  },
  // Delivered — long product name (layout/wrapping edge case)
  {
    id: 'WD-10461',
    date: 'Aug 18, 2026',
    status: 'Delivered',
    currency: 'INR',
    items: [
      {
        name: 'Stainless Steel Insulated Double-Wall Vacuum Water Bottle with Bamboo Lid',
        variant: '750ml',
        qty: 1,
        unitPrice: 3450,
        image: productImage('waterbottle,steel', 23),
      },
    ],
  },
  // Cancelled — single product, quantity 1
  {
    id: 'WD-10458',
    date: 'Aug 15, 2026',
    status: 'Cancelled',
    currency: 'INR',
    items: [
      { name: 'Skincare starter set', qty: 1, unitPrice: 6750, image: productImage('skincare,cosmetics', 24) },
    ],
  },
  // Cancelled — multiple products
  {
    id: 'WD-10455',
    date: 'Aug 12, 2026',
    status: 'Cancelled',
    currency: 'LKR',
    items: [
      { name: 'Desk lamp', qty: 1, unitPrice: 2600, image: productImage('desklamp', 25) },
      { name: 'Extension cord', qty: 1, unitPrice: 1100, image: productImage('extensioncord,cable', 26) },
    ],
  },
  // Cancelled — single product, quantity > 1 (cancellation isn't only qty 1)
  {
    id: 'WD-10450',
    date: 'Aug 08, 2026',
    status: 'Cancelled',
    currency: 'INR',
    items: [
      {
        name: 'Reusable water bottle',
        variant: '1L',
        qty: 2,
        unitPrice: 1250,
        image: productImage('waterbottle', 27),
      },
    ],
  },
  // Delivered — multiple products, mixed quantities
  {
    id: 'WD-10447',
    date: 'Aug 05, 2026',
    status: 'Delivered',
    currency: 'LKR',
    items: [
      { name: 'Notebook set', qty: 2, unitPrice: 480, image: productImage('notebook,stationery', 28) },
      { name: 'Highlighters', qty: 1, unitPrice: 650, image: productImage('highlighter,markers', 29) },
      { name: 'Sticky notes', qty: 3, unitPrice: 210, image: productImage('stickynotes', 30) },
    ],
  },
]

type OrdersContextValue = {
  orders: Order[]
  getOrderById: (id: string) => Order | undefined
  filterOrders: (status: OrderStatus | 'All', query: string) => Order[]
}

const OrdersContext = createContext<OrdersContextValue | undefined>(undefined)

export function OrdersProvider({
  children,
  initialOrders = MOCK_ORDERS,
}: {
  children: ReactNode
  initialOrders?: Order[]
}) {
  // Swap this useState for real data fetching (e.g. React Query / server
  // component fetch passed down as `initialOrders`) when going live.
  const [orders] = useState<Order[]>(initialOrders)

  const value = useMemo<OrdersContextValue>(
    () => ({
      orders,
      getOrderById: (id) => orders.find((o) => o.id.toLowerCase() === id.toLowerCase()),
      filterOrders: (status, query) => {
        const q = query.trim().toLowerCase()
        return orders.filter((o) => {
          const matchesStatus = status === 'All' || o.status === status
          const matchesQuery =
            q.length === 0 ||
            o.id.toLowerCase().includes(q) ||
            o.items.some((it) => it.name.toLowerCase().includes(q))
          return matchesStatus && matchesQuery
        })
      },
    }),
    [orders]
  )

  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>
}

export function useOrders() {
  const ctx = useContext(OrdersContext)
  if (!ctx) {
    throw new Error('useOrders must be used within an <OrdersProvider>')
  }
  return ctx
}