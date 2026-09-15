/**
 * contexts/orderContexts.tsx
 *
 * Real order data + context for the customer-facing "My Orders" page
 * (app/account/orders/page.tsx) and the "Track Order" page
 * (app/account/orders/track/page.tsx). Wrap your orders page (or a layout
 * above it) in <OrdersProvider> and read data with the useOrders() hook.
 *
 * Fetches the logged-in user's own `orders` (+ order_items + the linked
 * product_snapshots image + recipient address) straight from Supabase
 * on mount — see the real implementation below the type/helper section.
 * `initialOrders` is kept as an escape hatch for tests only.
 *
 * Each OrderItem carries an `image` field used for the product thumbnail(s)
 * on the order card. The values below use LoremFlickr (https://loremflickr.com),
 * a keyword-based service that serves real, licensed Creative Commons photos
 * matching the given tag(s) — so each item shows an actual photo of that kind
 * of product instead of a flat placeholder swatch. For production, replace
 * each with the real product photo URL from your catalog/CDN.
 *
 * `sellerName` / `sellerType` / `storeUrl` (per item):
 * WishDrop sources each product independently, so a single order can bundle
 * items bought from different stores AND items sourced from individual
 * sellers/boutiques (Channel 3-style manual requests) side by side.
 *   - sellerType: 'store'      → a real storefront (Amazon, Fabindia, a
 *                                 branded boutique site, etc.) — `storeUrl`
 *                                 is usually present.
 *   - sellerType: 'individual' → sourced from a person directly (an
 *                                 Instagram seller, a tailor, a small
 *                                 independent maker) — `storeUrl` is often
 *                                 absent or just a profile link.
 * All three fields are OPTIONAL — `itemSourceLabel()` below falls back to
 * a generic "WishDrop partner store" label when they're not set, so older
 * seed rows and any order you add later still render fine without you
 * having to backfill every item.
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

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { createClient } from '@/lib/supabase/client'
import { mapStageToCustomerStatus } from '@/lib/supabase/orders-admin'

export type OrderStatus = 'Processing' | 'Quality Check' | 'Shipped' | 'Delivered' | 'Cancelled'

// Who/where a given item was sourced from. 'store' = a real storefront
// (Amazon, a brand's own site, a boutique's webstore). 'individual' = a
// person sourced directly — an Instagram seller, a tailor, a maker with
// no storefront of their own.
export type SellerType = 'store' | 'individual'

export type OrderItem = {
  /** order_items.id — real row uuid. Optional only because MOCK_ORDERS (unused now, kept for reference) doesn't set it. Used to look up a QC issue for this specific item (see fetchQcIssuesForItem in lib/supabase/qc-issues.ts). */
  id?: string
  name: string
  variant?: string // e.g. "Size UK 9" or "Color: Black" — omit if not applicable
  qty: number
  unitPrice: number
  image: string // product photo URL shown as the item thumbnail
  /** Display name of the store or person this item was sourced from */
  sellerName?: string
  /** 'store' | 'individual' — drives the badge/icon next to sellerName */
  sellerType?: SellerType
  /** Storefront or profile link, if there is one */
  storeUrl?: string
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
  /**
   * Optional — this page is normally "my orders for the one logged-in
   * customer", so it's usually omitted here. Set when a consumer of this
   * data (e.g. AdminDataContext, which shows orders across MANY
   * customers) needs a distinct name per order. Falls back via
   * getOrderCustomerName() below.
   */
  customerName?: string
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

// "Fabindia" / "Sourced from @priya_designs" style line shown under an
// item's title. Falls back to a generic label so items without seller
// info (or older seed rows) still render something sensible.
export function itemSourceLabel(item: OrderItem): string {
  if (!item.sellerName) return 'WishDrop partner store'
  return item.sellerType === 'individual' ? `Sourced from ${item.sellerName}` : item.sellerName
}

// True once an order's items came from 2+ distinct sellers — lets the
// order card show a "Multiple sellers" pill instead of a single store name.
export function hasMultipleSources(order: Order): boolean {
  const distinct = new Set(order.items.map((it) => it.sellerName ?? 'WishDrop partner store'))
  return distinct.size > 1
}

// Distinct seller names across an order's items, in first-seen order —
// handy for a "Sourced from Fabindia, Etsy +1 more" summary line.
export function orderSellerNames(order: Order): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const it of order.items) {
    const name = it.sellerName ?? 'WishDrop partner store'
    if (!seen.has(name)) {
      seen.add(name)
      names.push(name)
    }
  }
  return names
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

// Who the order belongs to. On this page every order is implicitly "the
// current customer", so `customerName` is usually unset — falls back to
// the recipient's name (if set) and finally to a generic label. Consumers
// that show orders across many customers (e.g. the admin panel) should set
// `customerName` explicitly per order rather than relying on this fallback.
export function getOrderCustomerName(order: Order): string {
  return order.customerName ?? order.recipient?.name ?? 'Customer'
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


// ---------------------------------------------------------------------------
// LEGACY SEED DATA — kept only because contexts/AdminDataContext.tsx still
// imports MOCK_ORDERS (as CUSTOMER_ORDERS) to seed its own, still-fully-mock
// admin dataset. The real customer-facing OrdersProvider below this block
// no longer reads from it at all. Safe to delete once AdminDataContext gets
// its own real Supabase-backed rewrite (a separate, admin-side pass).
// ---------------------------------------------------------------------------
function productImage(keywords: string, lock: number) {
  return `https://loremflickr.com/200/200/${keywords}?lock=${lock}`
}

// Deliberately broad coverage across status × currency × item-shape, plus a
// few edge cases worth testing in the UI:
//   - Quality Check WITHOUT a note (order #10479) — the note banner is
//     conditional on `note` being present, not just on status.
//   - A 4-item order (#10470) — the card only shows the first 3 thumbnails
//     (`items.slice(0, 3)`), so this exercises that overflow. It also mixes
//     3 different sellers across those 4 items, to exercise
//     hasMultipleSources()/orderSellerNames() with more than 2 distinct.
//   - A very long product name (#10461) — wrapping/truncation check.
//   - Cancelled with qty > 1 (#10450) — cancellation isn't only ever qty 1.
//   - Multi-item orders (#10495, #10480, #10471, #10470, #10469, #10466,
//     #10455, #10447) deliberately mix `sellerType: 'store'` and
//     `sellerType: 'individual'` items on the SAME order, to exercise the
//     "different persons and stores" case end-to-end.
//   - Enough rows (18) to exercise pagination across multiple pages at
//     PAGE_SIZE = 4.
// Exported (not just used internally) so other parts of the app — notably
// AdminDataContext.tsx — can treat this array as the single source of
// truth for order data and derive their own view of it, instead of each
// context hand-maintaining its own duplicate seed list that can drift out
// of sync.
export const MOCK_ORDERS: Order[] = [
  // Processing — single product, quantity 1
  {
    id: 'WD-10499',
    date: 'Sep 07, 2026',
    status: 'Processing',
    currency: 'INR',
    items: [
      {
        name: 'Ceramic coffee mug set',
        qty: 1,
        unitPrice: 2450,
        image: productImage('coffee,mug', 1),
        sellerName: 'Amazon.in',
        sellerType: 'store',
        storeUrl: 'https://www.amazon.in',
      },
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
        sellerName: 'Fabindia',
        sellerType: 'store',
        storeUrl: 'https://www.fabindia.com',
      },
    ],
  },
  // Processing — multiple products, DIFFERENT sellers (one store, one individual)
  {
    id: 'WD-10495',
    date: 'Sep 05, 2026',
    status: 'Processing',
    currency: 'INR',
    items: [
      {
        name: 'Spiral notebook',
        qty: 3,
        unitPrice: 220,
        image: productImage('notebook,stationery', 3),
        sellerName: 'Flipkart — Classmate Store',
        sellerType: 'store',
        storeUrl: 'https://www.flipkart.com',
      },
      {
        name: 'Hand-lettered gel pen set',
        qty: 1,
        unitPrice: 350,
        image: productImage('pen,stationery', 4),
        sellerName: '@inkandquill.studio',
        sellerType: 'individual',
        storeUrl: 'https://instagram.com/inkandquill.studio',
      },
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
        sellerName: 'Nike.com',
        sellerType: 'store',
        storeUrl: 'https://www.nike.com',
      },
    ],
  },
  // Quality Check — multiple products, DIFFERENT sellers, with note
  {
    id: 'WD-10480',
    date: 'Sep 03, 2026',
    status: 'Quality Check',
    currency: 'LKR',
    note: 'Both items are being inspected together before they’re packed for shipping.',
    items: [
      {
        name: 'Aviator sunglasses',
        qty: 1,
        unitPrice: 4200,
        image: productImage('sunglasses', 6),
        sellerName: 'Ray-Ban.com',
        sellerType: 'store',
        storeUrl: 'https://www.ray-ban.com',
      },
      {
        name: 'Hand-stitched leather wallet',
        qty: 1,
        unitPrice: 5600,
        image: productImage('leather,wallet', 7),
        sellerName: 'Arun — leather craftsman',
        sellerType: 'individual',
      },
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
        sellerName: 'Decathlon',
        sellerType: 'store',
        storeUrl: 'https://www.decathlon.in',
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
        sellerName: '@wickandwillow.candles',
        sellerType: 'individual',
        storeUrl: 'https://instagram.com/wickandwillow.candles',
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
    items: [
      {
        name: 'LED desk lamp',
        qty: 1,
        unitPrice: 3100,
        image: productImage('desklamp', 10),
        sellerName: 'Amazon.in',
        sellerType: 'store',
        storeUrl: 'https://www.amazon.in',
      },
    ],
  },
  // Shipped — multiple products, THREE different sellers (2 stores + 1 individual)
  {
    id: 'WD-10471',
    date: 'Aug 29, 2026',
    status: 'Shipped',
    currency: 'LKR',
    carrier: 'FedEx',
    trackingNumber: '7712 4498 3320',
    estimatedDelivery: 'Sep 3 – Sep 5',
    items: [
      {
        name: 'Baseball cap',
        qty: 1,
        unitPrice: 3200,
        image: productImage('baseballcap', 11),
        sellerName: 'New Era Cap Co.',
        sellerType: 'store',
        storeUrl: 'https://www.neweracap.com',
      },
      {
        name: 'Over-ear headphones',
        qty: 1,
        unitPrice: 18900,
        image: productImage('headphones', 12),
        sellerName: 'Flipkart — AudioTech',
        sellerType: 'store',
        storeUrl: 'https://www.flipkart.com',
      },
      {
        name: 'Fleece hoodie',
        variant: 'Size L',
        qty: 1,
        unitPrice: 6350,
        image: productImage('hoodie,sweatshirt', 13),
        sellerName: '@thread.and.thrift',
        sellerType: 'individual',
        storeUrl: 'https://instagram.com/thread.and.thrift',
      },
    ],
  },
  // Shipped — 4 products, THREE different sellers (thumbnail-overflow edge
  // case: card only shows 3 thumbnails, but seller mix still spans all 4)
  {
    id: 'WD-10470',
    date: 'Aug 28, 2026',
    status: 'Shipped',
    currency: 'INR',
    carrier: 'DHL Express',
    trackingNumber: '1Z999AA10123456700',
    estimatedDelivery: 'Sep 2 – Sep 4',
    items: [
      {
        name: 'Kitchen organizer tray',
        qty: 1,
        unitPrice: 2200,
        image: productImage('kitchen,tray', 14),
        sellerName: 'Amazon.in',
        sellerType: 'store',
        storeUrl: 'https://www.amazon.in',
      },
      {
        name: 'Bamboo cutting board',
        qty: 1,
        unitPrice: 1650,
        image: productImage('cuttingboard', 15),
        sellerName: 'Bamboo & Co. — woodworker',
        sellerType: 'individual',
      },
      {
        name: 'Cotton dish towels',
        qty: 2,
        unitPrice: 450,
        image: productImage('dishtowel,kitchen', 16),
        sellerName: 'Fabindia',
        sellerType: 'store',
        storeUrl: 'https://www.fabindia.com',
      },
      {
        name: 'Wall spice rack',
        qty: 1,
        unitPrice: 1980,
        image: productImage('spices,rack', 17),
        sellerName: '@homeandhearth.crafts',
        sellerType: 'individual',
        storeUrl: 'https://instagram.com/homeandhearth.crafts',
      },
    ],
  },
  // Processing — multiple products, DIFFERENT sellers (variant present)
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
        sellerName: 'Amazon.in',
        sellerType: 'store',
        storeUrl: 'https://www.amazon.in',
      },
      {
        name: 'Screen protector',
        qty: 1,
        unitPrice: 950,
        image: productImage('smartphone,glass', 19),
        sellerName: 'Flipkart — MobileGuard',
        sellerType: 'store',
        storeUrl: 'https://www.flipkart.com',
      },
    ],
  },
  // Delivered — multiple products, DIFFERENT sellers
  {
    id: 'WD-10466',
    date: 'Aug 23, 2026',
    status: 'Delivered',
    currency: 'LKR',
    items: [
      {
        name: 'Desk organizer tray',
        qty: 1,
        unitPrice: 2800,
        image: productImage('deskorganizer', 20),
        sellerName: 'IKEA',
        sellerType: 'store',
        storeUrl: 'https://www.ikea.com',
      },
      {
        name: 'Bluetooth mini speaker',
        qty: 1,
        unitPrice: 7900,
        image: productImage('speaker,bluetooth', 21),
        sellerName: 'Flipkart — SoundWave',
        sellerType: 'store',
        storeUrl: 'https://www.flipkart.com',
      },
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
        sellerName: 'Wildcraft',
        sellerType: 'store',
        storeUrl: 'https://www.wildcraft.com',
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
        sellerName: '@ecoware.india',
        sellerType: 'individual',
        storeUrl: 'https://instagram.com/ecoware.india',
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
      {
        name: 'Skincare starter set',
        qty: 1,
        unitPrice: 6750,
        image: productImage('skincare,cosmetics', 24),
        sellerName: 'Nykaa',
        sellerType: 'store',
        storeUrl: 'https://www.nykaa.com',
      },
    ],
  },
  // Cancelled — multiple products, DIFFERENT sellers
  {
    id: 'WD-10455',
    date: 'Aug 12, 2026',
    status: 'Cancelled',
    currency: 'LKR',
    items: [
      {
        name: 'Desk lamp',
        qty: 1,
        unitPrice: 2600,
        image: productImage('desklamp', 25),
        sellerName: 'Amazon.in',
        sellerType: 'store',
        storeUrl: 'https://www.amazon.in',
      },
      {
        name: 'Extension cord',
        qty: 1,
        unitPrice: 1100,
        image: productImage('extensioncord,cable', 26),
        sellerName: 'Flipkart — PowerPlus',
        sellerType: 'store',
        storeUrl: 'https://www.flipkart.com',
      },
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
        sellerName: 'Milton',
        sellerType: 'store',
        storeUrl: 'https://www.milton.in',
      },
    ],
  },
  // Delivered — multiple products, mixed quantities, DIFFERENT sellers
  {
    id: 'WD-10447',
    date: 'Aug 05, 2026',
    status: 'Delivered',
    currency: 'LKR',
    items: [
      {
        name: 'Notebook set',
        qty: 2,
        unitPrice: 480,
        image: productImage('notebook,stationery', 28),
        sellerName: 'Flipkart — Classmate Store',
        sellerType: 'store',
        storeUrl: 'https://www.flipkart.com',
      },
      {
        name: 'Highlighters',
        qty: 1,
        unitPrice: 650,
        image: productImage('highlighter,markers', 29),
        sellerName: 'Amazon.in',
        sellerType: 'store',
        storeUrl: 'https://www.amazon.in',
      },
      {
        name: 'Hand-painted sticky notes',
        qty: 3,
        unitPrice: 210,
        image: productImage('stickynotes', 30),
        sellerName: '@paperandpetal.co',
        sellerType: 'individual',
        storeUrl: 'https://instagram.com/paperandpetal.co',
      },
    ],
  },
]


// ---------------------------------------------------------------------------
// Real data layer. Fetches the logged-in customer's own `orders` (+ their
// `order_items`, each item's `product_snapshots.image_url` for a thumbnail,
// and the order's `addresses` row for the recipient block) from Supabase.
// Every type/helper above this line is unchanged from the original mock —
// OrdersHubPage.tsx and orders/track/page.tsx keep working exactly as
// before, per this file's own original doc comment: "swap MOCK_ORDERS for
// a real fetch/query and everything downstream keeps working as-is."
//
// Placeholder image for any item that never got a scraped/catalog photo
// (rare — cart/wishlist always try to capture one via ensureProductSnapshot
// before an order can exist, but a NULL is still possible for very old or
// hand-inserted rows).
const FALLBACK_ITEM_IMAGE = 'https://loremflickr.com/200/200/package?lock=0'

// Maps the DB's `orders.stage` value to this file's own OrderStatus/
// SHIPPING_FLOW vocabulary. This bucketing logic now lives in
// lib/supabase/orders-admin.ts (mapStageToCustomerStatus) since the admin
// panel's QC/pack-label/export-bin/in-transit/shipped queues use a richer
// real stage vocabulary than this file's 4-value OrderStatus — keeping the
// mapping in one shared place means "My Orders" and every admin queue
// always agree on what a given real stage means. See that file for the
// full stage list and the reasoning per-stage.
const mapStageToOrderStatus = mapStageToCustomerStatus

type OrderRow = {
  id: string
  display_id: string
  stage: string
  currency: string
  total_value: number
  delayed: boolean
  carrier: string | null
  tracking_number: string | null
  estimated_delivery: string | null
  created_at: string
  order_items: {
    id: string
    title: string
    variant_label: string | null
    quantity: number
    unit_price: number
    seller_name: string | null
    seller_type: string | null
    store_url: string | null
    product_snapshots: { image_url: string | null } | null
  }[]
  addresses: { recipient_name: string; city: string; country: string } | null
}

function formatOrderDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
}

function rowToOrder(row: OrderRow): Order {
  return {
    id: row.display_id,
    date: formatOrderDate(row.created_at),
    status: mapStageToOrderStatus(row.stage),
    currency: row.currency === 'INR' ? 'INR' : 'LKR',
    note: row.delayed ? 'This order is running behind schedule \u2014 we\u2019ll update you as soon as there\u2019s news.' : undefined,
    carrier: row.carrier ?? undefined,
    trackingNumber: row.tracking_number ?? undefined,
    estimatedDelivery: row.estimated_delivery ?? undefined,
    recipient: row.addresses
      ? { name: row.addresses.recipient_name, city: row.addresses.city, country: row.addresses.country }
      : undefined,
    items: row.order_items.map((it) => ({
      id: it.id,
      name: it.title,
      variant: it.variant_label ?? undefined,
      qty: it.quantity,
      unitPrice: it.unit_price,
      image: it.product_snapshots?.image_url ?? FALLBACK_ITEM_IMAGE,
      sellerName: it.seller_name ?? undefined,
      sellerType: (it.seller_type as SellerType | null) ?? undefined,
      storeUrl: it.store_url ?? undefined,
    })),
  }
}

type OrdersContextValue = {
  orders: Order[]
  loading: boolean
  error: string | null
  getOrderById: (id: string) => Order | undefined
  filterOrders: (status: OrderStatus | 'All', query: string) => Order[]
}

const OrdersContext = createContext<OrdersContextValue | undefined>(undefined)

export function OrdersProvider({
  children,
  initialOrders,
}: {
  children: ReactNode
  /** Escape hatch for tests/storybook — when omitted (the normal case),
   * orders are fetched live for the logged-in user instead. */
  initialOrders?: Order[]
}) {
  const { user, loading: authLoading } = useAuth()
  const [orders, setOrders] = useState<Order[]>(initialOrders ?? [])
  const [loading, setLoading] = useState(initialOrders == null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialOrders != null) return // escape hatch in use — never fetches
    if (authLoading) return
    if (!user) {
      setOrders([])
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    const supabase = createClient()

    supabase
      .from('orders')
      .select(
        `id, display_id, stage, currency, total_value, delayed, carrier, tracking_number, estimated_delivery, created_at,
         order_items ( id, title, variant_label, quantity, unit_price, seller_name, seller_type, store_url, product_snapshots ( image_url ) ),
         addresses ( recipient_name, city, country )`,
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data, error: fetchError }) => {
        if (cancelled) return
        if (fetchError) {
          setError(fetchError.message)
          setOrders([])
        } else {
          setOrders(((data ?? []) as unknown as OrderRow[]).map(rowToOrder))
        }
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, initialOrders])

  const value = useMemo<OrdersContextValue>(
    () => ({
      orders,
      loading,
      error,
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
    [orders, loading, error],
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
