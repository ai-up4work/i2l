'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowRight,
  Calendar,
  Check,
  Compass,
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
  getOrderRecipient,
  getOrderTimeline,
  getTodayLabel,
  shippingStepIndex,
  SHIPPING_FLOW,
  STATUS_BADGE,
  type Order,
  type TimelineIconKey,
} from '@/contexts/Ordercontexts'

const TIMELINE_ICONS: Record<TimelineIconKey, React.ComponentType<{ className?: string }>> = {
  confirmed: Package,
  purchased: Package,
  received: Truck,
  quality: PackageSearch,
  shipped: Truck,
  delivered: PackageCheck,
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
  const { orders, getOrderById } = useOrders()
  const [query, setQuery] = useState(orderId ?? '')

  const order = orderId ? getOrderById(orderId) : undefined
  const notFound = !!orderId && !order

  const handleTrack = () => {
    const trimmed = query.trim()
    if (!trimmed) return
    router.push(`/account/orders/track?order=${trimmed}`)
  }

  return (
    <div className="min-h-screen bg-parchment font-body text-ink">
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
        <p className="mt-1.5 text-sm text-ink/70">Enter your order number to see the latest updates.</p>

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

        {order && <OrderTrackingDetail order={order} />}

        {!order && <RecentOrders orders={orders} onSelect={(id) => router.push(`/account/orders/track?order=${id}`)} />}

        <GoodHandsBanner />
      </div>
    </div>
  )
}

function OrderTrackingDetail({ order }: { order: Order }) {
  const currentIndex = shippingStepIndex(order.status)
  const isCancelled = order.status === 'Cancelled'
  const recipient = getOrderRecipient(order)
  const timeline = getOrderTimeline(order)
  const today = getTodayLabel()
  const primary = order.items[0]
  const headerLabel = timeline[0]?.date === today ? `Today, ${today}` : timeline[0]?.date

  return (
    <div className="mt-8">
      {/* Order summary card — the hero element: larger radius, more air,
          image sized and rounded to feel like one cohesive object rather
          than a small chip dropped into a bigger card. */}
      <div className="flex flex-col gap-5 rounded-3xl border border-ink/10 bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-5">
          <img
            src={primary.image}
            alt={primary.name}
            className="h-20 w-20 flex-none rounded-2xl bg-ink/5 object-cover"
          />
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
          {/* Status stepper */}
          <div className="relative mt-8 flex justify-between px-1">
            {SHIPPING_FLOW.map((step, i) => (
              <div key={step} className="relative flex flex-1 flex-col items-center text-center">
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
                {i < SHIPPING_FLOW.length - 1 && (
                  <div
                    className={`absolute top-3.5 h-0.5 ${i < currentIndex ? 'bg-teal' : 'bg-ink/12'}`}
                    style={{
                      left: `${((i + 0.5) / SHIPPING_FLOW.length) * 100}%`,
                      width: `${(1 / SHIPPING_FLOW.length) * 100}%`,
                    }}
                  />
                )}
                <span className={`mt-2.5 text-[11px] font-medium ${i <= currentIndex ? 'text-ink' : 'text-ink/40'}`}>
                  {step}
                </span>
              </div>
            ))}
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

      {/* Tracking timeline */}
      {!isCancelled && timeline.length > 0 && (
        <div className="mt-9">
          <h2 className="font-display text-xl text-ink">Tracking timeline</h2>
          {headerLabel && <p className="mt-1.5 text-xs font-medium text-teal-deep">{headerLabel}</p>}
          <div className="mt-4">
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
        </div>
      )}

      {/* Delivery details */}
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
      <h2 className="text-sm font-semibold text-ink/60">Or choose from your recent orders</h2>
      {/* Lighter, divider-based list instead of another stack of bordered
          cards — keeps this a quiet fallback rather than competing with
          the tracking detail above it. */}
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
              <img
                src={primary.image}
                alt={primary.name}
                className="h-11 w-11 flex-none rounded-xl bg-ink/5 object-cover"
              />
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