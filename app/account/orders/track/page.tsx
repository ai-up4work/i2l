'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowRight,
  Calendar,
  Check,
  Compass,
  Copy,
  ExternalLink,
  MapPin,
  Package,
  PackageCheck,
  PackageSearch,
  Search,
  ShieldCheck,
  Truck,
} from 'lucide-react'
import {
  OrdersProvider,
  useOrders,
  itemMeta,
  orderTotal,
  getOrderRecipient,
  getOrderTimeline,
  getTodayLabel,
  shippingStepIndex,
  SHIPPING_FLOW,
  STATUS_BADGE,
  type Order,
  type TimelineIconKey,
} from '@/contexts/Ordercontexts'

// ---------------------------------------------------------------------------
// Squircle clip-path + item thumbnail. Shows one image for single-item
// orders. For multi-item orders, the front photo stays full-size and
// clearly readable, with 1-2 chips peeking out behind its bottom-right
// corner, and a "+N" overflow badge pinned to the front photo's own
// top-right corner (not floating off the edge of a thin stack).
// ---------------------------------------------------------------------------

function SquircleDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden focusable="false">
      <defs>
        <clipPath id="squircle-clip" clipPathUnits="objectBoundingBox">
          <path
            d="M 0.5,0
               C 0.888,0 0.917,0.021 0.946,0.05
               C 0.976,0.079 1,0.109 1,0.5
               C 1,0.892 0.976,0.921 0.946,0.95
               C 0.917,0.979 0.888,1 0.5,1
               C 0.113,1 0.083,0.979 0.054,0.95
               C 0.024,0.921 0,0.892 0,0.5
               C 0,0.109 0.024,0.079 0.054,0.05
               C 0.083,0.021 0.113,0 0.5,0
               Z"
          />
        </clipPath>
      </defs>
    </svg>
  )
}

function OrderThumbnail({ items, size = 80 }: { items: Order['items']; size?: number }) {
  if (items.length === 1) {
    return (
      <img
        src={items[0].image}
        alt={items[0].name}
        className="flex-none bg-ink/5 object-cover [clip-path:url(#squircle-clip)]"
        style={{ height: size, width: size }}
      />
    )
  }

  const visible = items.slice(0, 3)
  const overflow = items.length - visible.length
  const peekOffset = Math.round(size * 0.16) // how far each chip behind peeks past the front photo
  const containerSize = size + peekOffset * (visible.length - 1)

  return (
    <div className="relative flex-none" style={{ width: containerSize, height: containerSize }}>
      {/* Chips behind the front photo, peeking out toward the bottom-right */}
      {visible.map((item, i) => {
        if (i === 0) return null
        const inset = i * peekOffset
        return (
          <img
            key={i}
            src={item.image}
            alt={item.name}
            className="absolute border-2 border-parchment bg-ink/5 object-cover [clip-path:url(#squircle-clip)]"
            style={{ height: size, width: size, top: inset, left: inset, zIndex: visible.length - i }}
          />
        )
      })}

      {/* Front photo, on top, with the overflow badge pinned to its corner */}
      <div className="absolute left-0 top-0" style={{ width: size, height: size, zIndex: visible.length + 1 }}>
        <img
          src={visible[0].image}
          alt={visible[0].name}
          className="h-full w-full border-2 border-parchment bg-ink/5 object-cover [clip-path:url(#squircle-clip)]"
        />
        {overflow > 0 && (
          <span
            className="absolute -right-1.5 -top-1.5 flex items-center justify-center rounded-full border-2 border-parchment bg-ink text-[10px] font-semibold text-parchment"
            style={{ height: 20, minWidth: 20, padding: '0 4px' }}
          >
            +{overflow}
          </span>
        )}
      </div>
    </div>
  )
}

const TIMELINE_ICONS: Record<TimelineIconKey, React.ComponentType<{ className?: string }>> = {
  confirmed: Package,
  purchased: Package,
  received: Truck,
  quality: PackageSearch,
  shipped: Truck,
  delivered: PackageCheck,
}

const DETAIL_TABS = ['Tracking', 'Details', 'Delivery'] as const
type DetailTab = (typeof DETAIL_TABS)[number]

// Maps the ?tab= query param to a DetailTab, case-insensitively, falling
// back to 'Tracking' for anything missing or unrecognized.
function resolveInitialTab(param: string | null): DetailTab {
  const match = DETAIL_TABS.find((t) => t.toLowerCase() === param?.toLowerCase())
  return match ?? 'Tracking'
}

function statusHeadline(status: Order['status']) {
  switch (status) {
    case 'Processing':
      return 'Your order has been confirmed'
    case 'Quality Check':
      return 'Your item is being inspected'
    case 'Shipped':
      return 'Your order is on its way'
    case 'Delivered':
      return 'Your order has arrived'
    default:
      return ''
  }
}

export default function TrackOrderPage() {
  return (
    <OrdersProvider>
      <Suspense fallback={<TrackOrderSkeleton />}>
        <TrackOrderContent />
      </Suspense>
    </OrdersProvider>
  )
}

function TrackOrderSkeleton() {
  return (
    <div className="min-h-screen bg-parchment font-body text-ink">
      <div className="mx-auto max-w-6xl animate-pulse px-6 py-8 pb-16">
        <div className="h-3 w-40 rounded bg-ink/10" />
        <div className="mt-5 h-9 w-72 rounded bg-ink/10" />
        <div className="mt-2.5 h-4 w-80 rounded bg-ink/10" />

        <div className="mt-6 flex gap-3">
          <div className="h-12 flex-1 rounded-full bg-ink/10" />
          <div className="h-12 w-28 flex-none rounded-full bg-ink/10" />
        </div>

        <div className="mt-8 flex flex-col gap-4 rounded-3xl border border-ink/10 bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 flex-none rounded-2xl bg-ink/10" />
            <div>
              <div className="h-3 w-24 rounded bg-ink/10" />
              <div className="mt-2.5 h-4 w-40 rounded bg-ink/10" />
              <div className="mt-2 h-3 w-28 rounded bg-ink/10" />
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <div className="h-3 w-28 rounded bg-ink/10" />
            <div className="h-4 w-32 rounded bg-ink/10" />
          </div>
        </div>

        <div className="mt-7 flex justify-between px-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-ink/10" />
              <div className="h-2.5 w-14 rounded bg-ink/10" />
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center gap-4 rounded-2xl bg-ink/5 p-4">
          <div className="h-10 w-10 flex-none rounded-full bg-ink/10" />
          <div className="flex-1">
            <div className="h-3.5 w-48 rounded bg-ink/10" />
            <div className="mt-2 h-3 w-64 rounded bg-ink/10" />
          </div>
        </div>

        <div className="mt-8">
          <div className="h-5 w-40 rounded bg-ink/10" />
          <div className="mt-3 h-3 w-24 rounded bg-ink/10" />
          <div className="mt-4 flex flex-col gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-4">
                <div className="h-8 w-8 flex-none rounded-full bg-ink/10" />
                <div className="flex-1">
                  <div className="h-3.5 w-44 rounded bg-ink/10" />
                  <div className="mt-2 h-3 w-32 rounded bg-ink/10" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-ink/10 bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 flex-none rounded bg-ink/10" />
            <div>
              <div className="h-2.5 w-24 rounded bg-ink/10" />
              <div className="mt-2 h-3.5 w-28 rounded bg-ink/10" />
            </div>
          </div>
          <div className="h-8 w-36 rounded-full bg-ink/10" />
        </div>
      </div>
    </div>
  )
}

function TrackOrderContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const orderId = searchParams.get('order')
  const initialTab = resolveInitialTab(searchParams.get('tab'))
  const { orders, getOrderById } = useOrders()
  const [query, setQuery] = useState(orderId ?? '')

  const explicitOrder = orderId ? getOrderById(orderId) : undefined
  const notFound = !!orderId && !explicitOrder

  // No order specified in the URL: if the customer only has one order,
  // just show it directly — there's nothing to choose between. If they
  // have more than one, we ask which one instead of guessing.
  const resolvedOrder = explicitOrder ?? (!orderId && orders.length === 1 ? orders[0] : undefined)
  const needsSelection = !orderId && orders.length > 1

  const handleTrack = () => {
    const trimmed = query.trim()
    if (!trimmed) return
    router.push(`/account/orders/track?order=${trimmed}`)
  }

  return (
    <div className="min-h-screen bg-parchment font-body text-ink">
      <SquircleDefs />
      <div className="mx-auto max-w-6xl px-6 py-8 pb-16">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-ink/60">
          <button type="button" onClick={() => router.push('/account/orders')} className="hover:text-ink">
            Account
          </button>
          <span>›</span>
          <span className="text-ink">Tracking my orders</span>
        </nav>

        {/* Header */}
        <h1 className="mt-4 font-display text-4xl font-semibold text-indigo">Track your order</h1>
        <p className="mt-1.5 text-sm text-ink/70">
          {needsSelection
            ? 'Choose an order below, or search by order number.'
            : 'Enter your order number to see the latest updates.'}
        </p>

        {/* Search */}
        <div className="mt-6 flex gap-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTrack()
              }}
              placeholder="e.g. WD-10482"
              className="w-full rounded-full border border-ink/15 bg-card py-3 pl-11 pr-4 text-sm outline-none placeholder:text-ink/40 focus:border-teal"
            />
          </div>
          <button
            type="button"
            onClick={handleTrack}
            className="flex flex-none items-center gap-2 rounded-full bg-teal-deep px-5 py-3 text-sm font-semibold text-white hover:opacity-90"
          >
            <Search className="h-4 w-4" />
            Track
          </button>
        </div>

        {notFound && (
          <div className="mt-4 rounded-xl border border-dashed border-ink/20 bg-card p-4 text-sm text-ink/60">
            We couldn&apos;t find order #{orderId}. Double check the order number and try again.
          </div>
        )}

        {resolvedOrder && <OrderTrackingDetail order={resolvedOrder} initialTab={initialTab} />}

        {needsSelection && (
          <OrderPicker orders={orders} onSelect={(id) => router.push(`/account/orders/track?order=${id}`)} />
        )}

        {!orderId && orders.length === 0 && <NoOrdersEmptyState onBrowse={() => router.push('/')} />}

        {/* When tracking a specific order and there's more than one on the
            account, surface the rest as a lightweight fallback list too. */}
        {explicitOrder && orders.length > 1 && (
          <RecentOrders
            orders={orders.filter((o) => o.id !== explicitOrder.id)}
            onSelect={(id) => router.push(`/account/orders/track?order=${id}`)}
          />
        )}

        <GoodHandsBanner />
      </div>
    </div>
  )
}

function OrderPicker({ orders, onSelect }: { orders: Order[]; onSelect: (id: string) => void }) {
  return (
    <div className="mt-8">
      <h2 className="text-sm font-semibold text-ink/60">Which order would you like to track?</h2>
      <div className="mt-3 divide-y divide-ink/8 rounded-2xl border border-ink/10 bg-card">
        {orders.map((order) => {
          const primary = order.items[0]
          return (
            <button
              key={order.id}
              type="button"
              onClick={() => onSelect(order.id)}
              className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-ink/[0.03]"
            >
              <OrderThumbnail items={order.items} size={56} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">
                  {order.items.length > 1 ? `${order.items.length} items` : primary.name}
                </p>
                <p className="mt-0.5 text-xs text-ink/50">
                  Order #{order.id} · {order.date}
                </p>
              </div>
              <span className={`flex-none rounded-full px-3 py-1 text-xs font-medium ${STATUS_BADGE[order.status]}`}>
                {order.status}
              </span>
              <ArrowRight className="h-4 w-4 flex-none text-ink/30" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

function NoOrdersEmptyState({ onBrowse }: { onBrowse: () => void }) {
  return (
    <div className="mt-8 flex flex-col items-center gap-3 rounded-3xl border border-dashed border-ink/15 bg-card p-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ink/5 text-ink/40">
        <Package className="h-6 w-6" />
      </div>
      <p className="text-sm font-semibold text-ink">You don&apos;t have any orders yet</p>
      <p className="text-xs text-ink/50">Once you place an order, you&apos;ll be able to track it here.</p>
      <button
        type="button"
        onClick={onBrowse}
        className="mt-1 rounded-full bg-teal-deep px-5 py-2.5 text-xs font-semibold text-white hover:opacity-90"
      >
        Start shopping
      </button>
    </div>
  )
}

function OrderTrackingDetail({ order, initialTab = 'Tracking' }: { order: Order; initialTab?: DetailTab }) {
  const [activeTab, setActiveTab] = useState<DetailTab>(initialTab)
  const currentIndex = shippingStepIndex(order.status)
  const isCancelled = order.status === 'Cancelled'
  const recipient = getOrderRecipient(order)
  const timeline = getOrderTimeline(order)
  const today = getTodayLabel()
  const primary = order.items[0]
  const headerLabel = timeline[0]?.date === today ? `Today, ${today}` : timeline[0]?.date

  const currencySymbol = order.currency === 'LKR' ? 'Rs.' : '₹'
  const total = orderTotal(order)

  const stepCount = SHIPPING_FLOW.length
  const halfStep = 50 / stepCount
  const fullSpan = 100 - halfStep * 2
  const progressWidth = stepCount > 1 ? (fullSpan * currentIndex) / (stepCount - 1) : 0

  const copyTrackingNumber = () => {
    if (order.trackingNumber) navigator.clipboard.writeText(order.trackingNumber)
  }

  return (
    <div className="mt-8">
      {/* Order summary card */}
      <div className="flex flex-col gap-5 rounded-3xl border border-ink/10 bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-5">
          <OrderThumbnail items={order.items} size={80} />
          <div>
            <div className="text-xs font-medium text-ink/50">Order #{order.id} · {order.date}</div>
            <div className="mt-1.5 font-display text-xl leading-tight text-ink">
              {order.items.length > 1 ? `${order.items.length} items` : primary.name}
            </div>
            {order.items.length === 1 && <div className="mt-0.5 text-xs text-ink/60">{itemMeta(primary)}</div>}
          </div>
        </div>

        {order.estimatedDelivery && !isCancelled && (
          <div className="flex items-center gap-2 sm:flex-col sm:items-end sm:gap-1 sm:text-right">
            <div className="flex items-center gap-1.5 text-xs font-medium text-ink/50">
              <Calendar className="h-3.5 w-3.5" />
              Estimated delivery
            </div>
            <div className="text-sm font-semibold text-ink">{order.estimatedDelivery}</div>
          </div>
        )}
      </div>

      {isCancelled ? (
        <div className="mt-6 rounded-2xl border border-ink/10 bg-ink/5 p-4 text-sm text-ink/70">
          This order was cancelled and is no longer being tracked.
        </div>
      ) : (
        <>
          {/* Status stepper — one continuous base track behind every
              circle, with a teal progress line grown to the current
              step, instead of separate per-segment lines trapped inside
              each step's own 1/4-width flex container (which caused
              them to look disconnected). */}
          <div className="relative mt-8 px-1">
            <div
              className="absolute top-3.5 h-0.5 bg-ink/12"
              style={{ left: `${halfStep}%`, right: `${halfStep}%` }}
            />
            <div
              className="absolute top-3.5 h-0.5 bg-teal transition-all duration-300"
              style={{ left: `${halfStep}%`, width: `${Math.max(progressWidth, 0)}%` }}
            />

            <div className="relative flex justify-between">
              {SHIPPING_FLOW.map((step, i) => (
                <div key={step} className="flex flex-1 flex-col items-center text-center">
                  <div
                    className={`z-10 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                      i < currentIndex
                        ? 'bg-teal text-white'
                        : i === currentIndex
                          ? 'bg-teal text-white ring-4 ring-teal/20'
                          : 'bg-ink/10 text-ink/30'
                    }`}
                  >
                    {i < currentIndex ? <Check className="h-3.5 w-3.5" /> : i === currentIndex ? i + 1 : ''}
                  </div>
                  <span className={`mt-2.5 text-[11px] font-medium ${i <= currentIndex ? 'text-ink' : 'text-ink/40'}`}>
                    {step}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Status banner */}
          {order.note && (
            <div className="mt-7 flex items-center gap-4 rounded-2xl bg-teal/8 p-4">
              <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-teal/15 text-teal-deep">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-teal-deep">{statusHeadline(order.status)}</p>
                <p className="mt-0.5 text-sm text-ink/70">{order.note}</p>
              </div>
              <PackageSearch className="hidden h-9 w-9 flex-none text-teal-deep/25 sm:block" />
            </div>
          )}
        </>
      )}

      {!isCancelled && (
        <>
          {/* Section tabs — Tracking / Details / Delivery live inline on the
              page now, no modal. Which one opens first is driven by the
              ?tab= query param, set by "Track Order" vs "View Details"
              on the My Orders page. */}
          <div className="mt-9 flex gap-2 border-b border-ink/10">
            {DETAIL_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`relative -mb-px flex items-center gap-1.5 px-1 pb-3 text-sm font-semibold transition-colors ${
                  activeTab === tab ? 'text-teal-deep' : 'text-ink/45 hover:text-ink/70'
                }`}
              >
                {tab === 'Tracking' && <Truck className="h-4 w-4" />}
                {tab === 'Details' && <Package className="h-4 w-4" />}
                {tab === 'Delivery' && <MapPin className="h-4 w-4" />}
                {tab}
                {activeTab === tab && (
                  <span className="absolute -bottom-px left-0 h-0.5 w-full rounded-full bg-teal-deep" />
                )}
              </button>
            ))}
          </div>

          {/* Tracking tab */}
          {activeTab === 'Tracking' && (
            <div className="mt-7">
              {(order.carrier || order.trackingNumber) && (
                <div className="rounded-2xl border border-ink/10 bg-card p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium text-ink/50">Carrier</p>
                      <p className="mt-1 text-sm font-semibold text-ink">{order.carrier ?? 'Not yet assigned'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-ink/50">Tracking number</p>
                      <div className="mt-1 flex items-center gap-2">
                        <p className="font-mono text-sm font-semibold text-ink">
                          {order.trackingNumber ?? 'Not yet assigned'}
                        </p>
                        {order.trackingNumber && (
                          <button
                            type="button"
                            onClick={copyTrackingNumber}
                            className="rounded-full p-1 text-ink/40 hover:bg-ink/5 hover:text-ink"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  {order.trackingNumber && (
                    <button
                      type="button"
                      className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-ink/15 py-2.5 text-xs font-semibold text-ink hover:border-teal/50"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Track on carrier site
                    </button>
                  )}
                </div>
              )}

              {timeline.length > 0 && (
                <>
                  {headerLabel && <p className="mt-6 text-xs font-medium text-teal-deep">{headerLabel}</p>}
                  <div className="mt-3">
                    {timeline.map((event, i) => {
                      const Icon = TIMELINE_ICONS[event.icon]
                      const isCurrent = i === 0
                      const isLast = i === timeline.length - 1
                      return (
                        <div key={i} className="flex gap-4">
                          <div className="flex flex-col items-center">
                            <div
                              className={`flex h-8 w-8 flex-none items-center justify-center rounded-full ${
                                isCurrent ? 'bg-teal text-white' : 'border-2 border-ink/15 text-ink/40'
                              }`}
                            >
                              <Icon className="h-4 w-4" />
                            </div>
                            {!isLast && <div className={`w-0.5 flex-1 ${isCurrent ? 'bg-teal/50' : 'bg-ink/10'}`} />}
                          </div>
                          <div className={isLast ? 'pb-1' : 'pb-6'}>
                            <p className="text-sm font-semibold text-ink">{event.title}</p>
                            {event.subtitle && <p className="text-xs text-ink/50">{event.subtitle}</p>}
                            <p className="mt-0.5 text-xs text-ink/40">
                              {event.date === today ? event.time : `${event.date} · ${event.time}`}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Details tab */}
          {activeTab === 'Details' && (
            <div className="mt-7 space-y-4">
              <div className="rounded-2xl border border-ink/10 bg-card p-5">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink">
                  <Package className="h-4 w-4 text-ink/40" />
                  Order information
                </h3>
                <div className="space-y-2.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-ink/50">Order number</span>
                    <span className="font-mono font-medium text-ink">#{order.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink/50">Order date</span>
                    <span className="font-medium text-ink">{order.date}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink/50">Status</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[order.status]}`}>
                      {order.status}
                    </span>
                  </div>
                  <div className="mt-1 border-t border-ink/10 pt-2.5 flex justify-between">
                    <span className="text-ink/50">Total</span>
                    <span className="font-semibold text-ink">
                      {currencySymbol} {total.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-ink/10 bg-card p-5">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink">
                  <Package className="h-4 w-4 text-ink/40" />
                  Items ({order.items.length})
                </h3>
                <div className="space-y-4">
                  {order.items.map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <img
                        src={item.image}
                        alt={item.name}
                        className="h-12 w-12 flex-none rounded-xl bg-ink/5 object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{item.name}</p>
                        <p className="text-xs text-ink/50">{itemMeta(item)}</p>
                      </div>
                      <p className="flex-none text-sm font-semibold text-ink">
                        {currencySymbol} {(item.qty * item.unitPrice).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2.5 sm:flex-row">
                <button
                  type="button"
                  className="flex-1 rounded-full border border-ink/15 py-2.5 text-sm font-semibold text-ink hover:border-teal/50"
                >
                  View invoice
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-full border border-ink/15 py-2.5 text-sm font-semibold text-ink hover:border-teal/50"
                >
                  Contact support
                </button>
                {order.status === 'Delivered' && (
                  <button
                    type="button"
                    className="flex-1 rounded-full bg-teal-deep py-2.5 text-sm font-semibold text-white hover:opacity-90"
                  >
                    Return or exchange
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Delivery tab */}
          {activeTab === 'Delivery' && (
            <div className="mt-7 space-y-4">
              <div className="rounded-2xl border border-ink/10 bg-card p-5">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink">
                  <MapPin className="h-4 w-4 text-ink/40" />
                  Delivery address
                </h3>
                <div className="space-y-0.5 text-sm">
                  <p className="font-medium text-ink">{recipient.name}</p>
                  <p className="text-ink/60">
                    {recipient.city}, {recipient.country}
                  </p>
                </div>
              </div>

              {order.estimatedDelivery && (
                <div className="rounded-2xl border border-ink/10 bg-card p-5">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                    <Calendar className="h-4 w-4 text-ink/40" />
                    Estimated delivery
                  </h3>
                  <p className="text-sm text-ink/60">{order.estimatedDelivery}</p>
                </div>
              )}

              {order.status === 'Delivered' && (
                <div className="rounded-2xl border border-teal/20 bg-teal/8 p-5">
                  <div className="flex items-start gap-3">
                    <PackageCheck className="mt-0.5 h-5 w-5 flex-none text-teal-deep" />
                    <div>
                      <h4 className="text-sm font-semibold text-ink">Delivery confirmed</h4>
                      <p className="mt-1 text-sm text-ink/60">
                        Your package was delivered to {recipient.name} in {recipient.city}.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Delivering-to strip stays visible regardless of active tab */}
      {!isCancelled && (
        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink/10 bg-card p-4">
          <div className="flex items-center gap-3">
            <MapPin className="h-5 w-5 flex-none text-ink/40" />
            <div>
              <p className="text-xs font-medium text-ink/50">Delivering to</p>
              <p className="text-sm font-semibold text-ink">{recipient.name}</p>
              <p className="text-xs text-ink/50">
                {recipient.city}, {recipient.country}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('Delivery')}
            className="flex items-center gap-1 rounded-full border border-ink/15 px-4 py-2 text-xs font-semibold text-ink hover:border-teal/50"
          >
            View delivery details
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

function RecentOrders({ orders, onSelect }: { orders: Order[]; onSelect: (id: string) => void }) {
  if (orders.length === 0) return null
  return (
    <div className="mt-10">
      <h2 className="text-sm font-semibold text-ink/60">Or track a different order</h2>
      <div className="mt-3 divide-y divide-ink/8 rounded-2xl border border-ink/10 bg-card">
        {orders.slice(0, 4).map((order) => {
          const primary = order.items[0]
          return (
            <button
              key={order.id}
              type="button"
              onClick={() => onSelect(order.id)}
              className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-ink/[0.03]"
            >
              <OrderThumbnail items={order.items} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">
                  {order.items.length > 1 ? `${order.items.length} items` : primary.name}
                </p>
                <p className="mt-0.5 text-xs text-ink/50">
                  Order #{order.id} · {order.date}
                </p>
              </div>
              <span className={`flex-none rounded-full px-3 py-1 text-xs font-medium ${STATUS_BADGE[order.status]}`}>
                {order.status}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function GoodHandsBanner() {
  return (
    <div className="mt-10 flex items-center gap-4 rounded-2xl border border-ink/10 bg-ink/5 p-5">
      <div className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-card text-teal-deep">
        <Compass className="h-5 w-5" />
      </div>
      <div>
        <p className="text-sm font-semibold text-ink">Your order is in good hands</p>
        <p className="text-xs text-ink/55">From store to your door, we&apos;re with you every step.</p>
      </div>
    </div>
  )
}