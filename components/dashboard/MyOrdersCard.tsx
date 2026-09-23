'use client'

import {
  ChevronRight,
  CreditCard,
  PackageOpen,
  Truck,
  MessageSquare,
  Undo2,
  Shirt,
} from 'lucide-react'
import Image from 'next/image'

export type MyOrdersCardOrderItem = {
  image: string
  name: string
}

export type MyOrdersCardLatestOrder = {
  id: string
  status: string
  items: MyOrdersCardOrderItem[]
}

type IconComponent = React.ComponentType<{
  size?: number
  strokeWidth?: number
  className?: string
}>

function OrderStatusIcon({
  label,
  onClick,
  icon: Icon,
}: {
  label: string
  onClick: () => void
  icon: IconComponent
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-w-0 flex-1 flex-col items-center gap-2 py-2 text-center transition-opacity duration-150 hover:opacity-70 sm:gap-2.5"
    >
      <Icon size={22} strokeWidth={1.6} className="text-ink/60" />
      <span className="text-[11px] font-semibold text-ink/60 group-hover:text-ink sm:text-xs">
        {label}
      </span>
    </button>
  )
}

// Thumbnail cluster: single image for a 1-item order, up to 3 staggered
// overlapping tiles + "+N" for multi-item orders. Sizes step up across
// three breakpoints (56px on the smallest phones, 64px on larger phones,
// 72px on sm+) so that 3 tiles plus the "+N" badge always have room to
// sit next to the text column without the card's overflow-hidden
// clipping the last tile on narrow screens. Uses explicit pixel values
// (not h-18/w-18) so they work on Tailwind v3 and v4.
function LatestOrderThumbnails({ items }: { items: MyOrdersCardOrderItem[] }) {
  const visible = items.slice(0, 3)
  const overflow = items.length - visible.length

  if (items.length <= 1) {
    return (
      <span className="h-20 w-20 flex-none overflow-hidden rounded-lg bg-white sm:h-24 sm:w-24 motion-safe:[animation:fadeUp_0.4s_ease-out_both]">
        {items[0] && (
          <Image
            src={items[0].image}
            alt=""
            className="h-full w-full object-cover"
            width={96}
            height={96}
          />
        )}
      </span>
    )
  }

  return (
    // -space-x-4 (mobile) pulls the tiles into a tighter overlapping stack
    // than before (-space-x-3), so the whole cluster takes up noticeably
    // less horizontal width and leaves more room for the text column next
    // to it on narrow screens. Overlap eases back to -space-x-3 at sm+
    // where there's width to spare.
    <span className="flex flex-none -space-x-4 sm:-space-x-3">
      {visible.map((item, i) => (
        <span
          key={i}
          className="h-14 w-14 overflow-hidden rounded-lg border-2 border-card bg-white shadow-sm transition-transform duration-200 hover:z-10 hover:-translate-y-1 xs:h-16 xs:w-16 sm:h-[72px] sm:w-[72px] motion-safe:[animation:fadeUp_0.4s_ease-out_both]"
          style={{ zIndex: visible.length - i, animationDelay: `${i * 80}ms` }}
        >
          <Image
            src={item.image}
            alt=""
            className="h-full w-full object-cover"
            width={72}
            height={72}
          />
        </span>
      ))}
      {overflow > 0 && (
        <span
          className="flex h-14 w-14 items-center justify-center rounded-lg border-2 border-card bg-ink/10 text-xs font-semibold text-ink/60 xs:h-16 xs:w-16 sm:h-[72px] sm:w-[72px] motion-safe:[animation:fadeUp_0.4s_ease-out_both]"
          style={{ animationDelay: `${visible.length * 80}ms` }}
        >
          +{overflow}
        </span>
      )}
    </span>
  )
}

// Status line for the latest-order teaser. `key={status}` on the wrapping
// span is what makes this replay its entrance animation whenever the
// order's status actually changes (e.g. a background refetch moves it
// from "Processing" to "Shipped") — React treats a key change as a new
// element, remounting it and re-triggering the CSS animation rather than
// just updating text in place. A small teal dot pulses next to any
// status that isn't a terminal state (Delivered/Cancelled), as a subtle
// "this is still moving" cue — kept purely visual/CSS, no interval/timer.
function AnimatedOrderStatus({ status }: { status: string }) {
  const isTerminal = status === 'Delivered' || status === 'Cancelled'
  return (
    <span
      key={status}
      className="flex items-center gap-1.5 motion-safe:[animation:fadeUp_0.35s_ease-out_both]"
      style={{ animationDelay: '120ms' }}
    >
      {!isTerminal && (
        <span className="relative flex h-2 w-2 flex-none">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal/60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-teal" />
        </span>
      )}
      <span className="text-sm font-semibold text-ink">{status}</span>
    </span>
  )
}

export type MyOrdersCardProps = {
  onViewOrders: () => void
  latestOrder?: MyOrdersCardLatestOrder
  animationDelayMs?: number
}

export default function MyOrdersCard({
  onViewOrders,
  latestOrder,
  animationDelayMs = 60,
}: MyOrdersCardProps) {
  const hasOrders = Boolean(latestOrder?.items?.length)

  return (
    <div
      className="relative order-2 flex min-w-0 flex-col overflow-hidden rounded-2xl border border-ink/10 bg-card p-4 sm:p-6 motion-safe:[animation:fadeUp_0.4s_ease-out_both] lg:order-3 lg:h-full"
      style={{ animationDelay: `${animationDelayMs}ms` }}
    >
      <div className="absolute inset-x-0 top-0 h-[3px] bg-gold" aria-hidden="true" />
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg text-ink">My Orders</h2>
        <button
          type="button"
          onClick={onViewOrders}
          className="flex items-center gap-1 text-xs font-semibold text-ink/55 hover:text-teal-deep"
        >
          View All <ChevronRight size={13} />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-5 gap-1">
        <OrderStatusIcon label="Unpaid" onClick={onViewOrders} icon={CreditCard} />
        <OrderStatusIcon label="Processing" onClick={onViewOrders} icon={PackageOpen} />
        <OrderStatusIcon label="Shipped" onClick={onViewOrders} icon={Truck} />
        <OrderStatusIcon label="Review" onClick={onViewOrders} icon={MessageSquare} />
        <OrderStatusIcon label="Returns" onClick={onViewOrders} icon={Undo2} />
      </div>

      {hasOrders && latestOrder ? (
        <button
          type="button"
          onClick={onViewOrders}
          className="mt-5 flex flex-1 items-center gap-1.5 rounded-xl border border-teal/25 bg-teal/8 p-3 text-left transition-colors hover:border-teal/40 xs:gap-2.5 sm:gap-4 sm:px-4 sm:py-3.5"
        >
          <LatestOrderThumbnails items={latestOrder.items} />

          {/* Mobile: three stacked lines (name / status / track order).
              sm+: name + status on the left, "Track order" pushed to the right. */}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="truncate text-[13px] text-ink/70 sm:text-sm">
                {latestOrder.items.length > 1
                  ? `${latestOrder.items.length} items`
                  : latestOrder.items[0]?.name}
              </p>
              <AnimatedOrderStatus status={latestOrder.status} />
            </div>

            <span className="flex flex-none items-center gap-1 whitespace-nowrap text-xs font-semibold text-teal-deep">
              Track order <ChevronRight size={14} />
            </span>
          </div>
        </button>
      ) : (
        <div className="mt-5 flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl bg-ink/[0.025] py-10 text-center">
          <Shirt size={40} strokeWidth={1.2} className="text-ink/20" />
          <p className="text-sm text-ink/40">It is empty here :-(</p>
        </div>
      )}
    </div>
  )
}