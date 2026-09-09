/**
 * components/dashboard/OrdersHubPage.tsx
 *
 * Customer-facing order tracking ("My Orders"). Read-only status display —
 * customers can search, filter by status, track shipped orders, view
 * details, or reorder/buy again on completed orders.
 *
 * "Track Order" navigates to /account/orders/track?order=<id> (opens on
 * the Tracking tab). "View Details" navigates to the same page with
 * &tab=details, opening directly on the Details tab instead. Both read
 * the order back out of the same OrdersProvider context.
 *
 * Data comes from contexts/Ordercontexts.tsx (OrdersProvider / useOrders).
 * Swap the mock data there for a real fetch/query and this page keeps
 * working as-is.
 */
'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, ChevronLeft, ChevronRight, CheckCircle2, PackageSearch } from 'lucide-react'
import {
  OrdersProvider,
  useOrders,
  orderTotal,
  itemMeta,
  FILTERS,
  SHIPPING_FLOW,
  STATUS_BADGE,
  type Order,
} from '@/contexts/Ordercontexts'
import { ItemImageStack } from '@/components/dashboard/ItemImageStack'

const PAGE_SIZE = 4

// DESIGN PASS: a left-edge accent per status, on top of the existing
// STATUS_BADGE pill. A repeated list of otherwise-identical cards is
// exactly the kind of visual noise the rest of this app has been moving
// away from — this gives the eye a color to scan down the list by
// (an order that needs attention vs. one that's done) without adding
// another badge or icon. Falls back to a quiet neutral for any status
// not explicitly mapped, so a future status addition never renders
// unstyled.
const STATUS_ACCENT: Record<string, string> = {
  Unpaid: 'border-l-gold',
  Processing: 'border-l-teal',
  'Quality Check': 'border-l-teal',
  Shipped: 'border-l-teal',
  Delivered: 'border-l-indigo',
  Cancelled: 'border-l-ink/20',
}
const DEFAULT_STATUS_ACCENT = 'border-l-ink/15'

export default function OrdersHubPage() {
  return (
    <OrdersProvider>
      <OrdersPageContent />
    </OrdersProvider>
  )
}

function OrdersPageContent() {
  const { orders } = useOrders()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All')
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      const matchesFilter = filter === 'All' || o.status === filter
      const q = query.trim().toLowerCase()
      const matchesQuery =
        q.length === 0 ||
        o.id.toLowerCase().includes(q) ||
        o.items.some((it) => it.name.toLowerCase().includes(q))
      return matchesFilter && matchesQuery
    })
  }, [query, filter, orders])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageOrders = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="min-h-screen bg-parchment font-body text-ink">
      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* Breadcrumb */}
        <nav className="mb-4 flex items-center gap-1.5 text-xs text-ink/60">
          <span>Account</span>
          <span>›</span>
          <span className="text-ink">My Orders</span>
        </nav>

        {/* Header */}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="font-display text-3xl font-semibold text-indigo">My Orders</h1>
          <span className="rounded-full bg-ink/5 px-2.5 py-0.5 text-xs font-semibold text-ink/50">
            {orders.length} total
          </span>
        </div>
        <p className="mt-1.5 text-sm text-ink/70">View your purchases, requests and order details.</p>

        {/* Search */}
        <div className="relative mt-6">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(1)
            }}
            placeholder="Search by order number, product name..."
            className="w-full rounded-full border border-ink/15 bg-card py-3 pl-11 pr-11 text-sm outline-none placeholder:text-ink/40 transition-colors focus:border-teal focus:ring-2 focus:ring-teal/15"
          />
        </div>

        {/* Filter pills */}
        <div className="mt-4 flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const active = f === filter
            return (
              <button
                key={f}
                onClick={() => {
                  setFilter(f)
                  setPage(1)
                }}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'border-teal bg-teal text-white'
                    : 'border-ink/15 bg-card text-ink hover:border-teal/50'
                }`}
              >
                {f}
              </button>
            )
          })}
        </div>

        {/* Order list */}
        <div className="mt-6 space-y-4">
          {pageOrders.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-ink/15 bg-card px-8 py-12 text-center">
              <PackageSearch size={36} strokeWidth={1.2} className="text-ink/25" />
              <p className="text-sm text-ink/50">No orders match your search.</p>
            </div>
          )}

          {pageOrders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>

        {/* Pagination */}
        {filtered.length > 0 && (
          <div className="mt-6 flex items-center justify-between text-sm">
            <span className="text-ink/60">
              Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, filtered.length)} of{' '}
              {filtered.length} orders
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex h-8 w-8 items-center justify-center rounded-full text-ink/60 transition-colors hover:bg-ink/8 disabled:opacity-30 disabled:hover:bg-transparent"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => setPage(n)}
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                    n === page ? 'bg-indigo text-white' : 'text-ink hover:bg-ink/8'
                  }`}
                >
                  {n}
                </button>
              ))}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex h-8 w-8 items-center justify-center rounded-full text-ink/60 transition-colors hover:bg-ink/8 disabled:opacity-30 disabled:hover:bg-transparent"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function OrderCard({ order }: { order: Order }) {
  const router = useRouter()
  const isMultiItem = order.items.length > 1
  const primary = order.items[0]
  const currentStepIndex = order.status === 'Shipped' ? 2 : order.status === 'Delivered' ? 3 : -1
  const statusAccent = STATUS_ACCENT[order.status] ?? DEFAULT_STATUS_ACCENT

  const goToTracking = () => router.push(`/account/orders/track?order=${order.id}`)
  const goToDetails = () => router.push(`/account/orders/track?order=${order.id}&tab=details`)

  return (
    <div className={`overflow-hidden rounded-2xl border border-ink/10 border-l-4 bg-card ${statusAccent}`}>
      {/* ---------------------------------------------------------------
          Mobile / tablet layout — image stack stays full-width above
          the qty/total row. fitActive is NOT passed here, so the stack
          falls back to crop-to-fill mode: the active card fills whatever
          width flex-grow gives it, cropping via background-size. This
          is intentional on mobile — there's no room to let the stack's
          own width vary, it must always fill the card's fixed width.

          NOTE: ItemImageStack's root div always sets `height: '100%'`
          as an inline style, which beats any height class passed in via
          `className` (inline styles win over classes regardless of
          specificity). So the *wrapping* div here — not the className
          passed into ItemImageStack — is what has to carry the actual
          height (h-24). Without it, height:100% resolves against this
          div's auto height and the whole stack collapses to 0px, which
          is why it was invisible on mobile.
          --------------------------------------------------------------- */}
      <div className="min-w-0 p-5 lg:hidden">
        {/* Header row */}
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs font-semibold tracking-wide text-ink">ORDER #{order.id}</div>
            <div className="mt-0.5 text-xs text-ink/60">{order.date}</div>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_BADGE[order.status]}`}>
            {order.status}
          </span>
        </div>

        {isMultiItem ? (
          <div className="mt-4 flex items-start gap-3">
            {/* fitActive makes the stack's own width track the active
                image's aspect ratio (plus small collapsed rails for the
                others) instead of stretching to fill the row — so it
                only takes the width it actually needs to fill h-24. */}
            <div className="h-24 flex-none">
              <ItemImageStack items={order.items} fitActive />
            </div>
            <div className="flex-1 pt-1 text-right">
              <div className="font-medium">
                {order.items.length} items · {order.items.reduce((n, it) => n + it.qty, 0)} total qty
              </div>
              <div className="text-xs text-ink/60">
                Total {order.currency} {orderTotal(order).toLocaleString()}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-4">
            <img
              src={primary.image}
              alt={primary.name}
              className="h-16 w-16 flex-none rounded-xl bg-ink/5 object-cover"
            />
            <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-medium">{primary.name}</div>
                <div className="text-xs text-ink/60">{itemMeta(primary)}</div>
              </div>
              <div className="flex-none text-right">
                <div className="font-medium">
                  {order.currency} {orderTotal(order).toLocaleString()}
                </div>
                <div className="text-[11px] text-ink/50">+ WishDrop delivery</div>
              </div>
            </div>
          </div>
        )}

        {/* Quality-check note */}
        {order.status === 'Quality Check' && order.note && (
          <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-teal/8 px-3.5 py-3 text-sm text-teal-deep">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{order.note}</span>
          </div>
        )}

        {/* Shipping progress */}
        {order.status === 'Shipped' && <ShippingProgress currentStepIndex={currentStepIndex} />}

        {/* Actions */}
        <div className="mt-5 flex gap-2">
          <OrderCardActions order={order} onGoToTracking={goToTracking} onGoToDetails={goToDetails} />
        </div>
      </div>

      {/* ---------------------------------------------------------------
          Desktop layout (lg+) — for multi-item orders, the stack is
          given fitActive so the rail's own width tracks whichever
          image is active (never crops it), capped at max-w-[380px] so
          it can't swallow the whole card. Single-item orders keep the
          fixed w-44 hero rail as before.
          --------------------------------------------------------------- */}
      <div className="hidden gap-5 p-5 lg:flex">
        {isMultiItem ? (
          <div className="h-40 max-w-[380px] flex-none">
            <ItemImageStack items={order.items} className="h-full" fitActive />
          </div>
        ) : (
          <div className="w-44 flex-none self-stretch overflow-hidden rounded-xl bg-ink/5">
            <img src={primary.image} alt={primary.name} className="h-full w-full object-cover" />
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Header row */}
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs font-semibold tracking-wide text-ink">ORDER #{order.id}</div>
              <div className="mt-0.5 text-xs text-ink/60">{order.date}</div>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_BADGE[order.status]}`}>
              {order.status}
            </span>
          </div>

          {/* Product info */}
          <div className="mt-4 flex items-start justify-between gap-3">
            <div>
              {isMultiItem ? (
                <div className="font-medium">
                  {order.items.length} items · {order.items.reduce((n, it) => n + it.qty, 0)} total qty
                </div>
              ) : (
                <>
                  <div className="font-medium">{primary.name}</div>
                  <div className="text-xs text-ink/60">{itemMeta(primary)}</div>
                </>
              )}
            </div>
            <div className="flex-none text-right">
              <div className="font-medium">
                {order.currency} {orderTotal(order).toLocaleString()}
              </div>
              <div className="text-[11px] text-ink/50">+ WishDrop delivery</div>
            </div>
          </div>

          {/* Quality-check note */}
          {order.status === 'Quality Check' && order.note && (
            <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-teal/8 px-3.5 py-3 text-sm text-teal-deep">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{order.note}</span>
            </div>
          )}

          {/* Shipping progress */}
          {order.status === 'Shipped' && <ShippingProgress currentStepIndex={currentStepIndex} />}

          {/* Actions — pinned to the bottom of the column */}
          <div className="mt-auto flex gap-2 pt-5">
            <OrderCardActions order={order} onGoToTracking={goToTracking} onGoToDetails={goToDetails} />
          </div>
        </div>
      </div>
    </div>
  )
}

function ShippingProgress({ currentStepIndex }: { currentStepIndex: number }) {
  const stepCount = SHIPPING_FLOW.length
  const halfStep = 50 / stepCount
  const fullSpan = 100 - halfStep * 2
  const progressWidth = stepCount > 1 ? (fullSpan * currentStepIndex) / (stepCount - 1) : 0

  return (
    <div className="mt-5">
      <div className="relative">
        {/* Base track, spans the full width behind every circle */}
        <div
          className="absolute top-2.5 h-0.5 bg-ink/12"
          style={{ left: `${halfStep}%`, right: `${halfStep}%` }}
        />
        {/* Teal progress, grows to the current step */}
        <div
          className="absolute top-2.5 h-0.5 bg-teal transition-all duration-300"
          style={{ left: `${halfStep}%`, width: `${Math.max(progressWidth, 0)}%` }}
        />

        <div className="relative flex justify-between">
          {SHIPPING_FLOW.map((step, i) => (
            <div key={step} className="flex flex-1 flex-col items-center text-center">
              <div
                className={`z-10 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                  i < currentStepIndex
                    ? 'bg-teal text-white'
                    : i === currentStepIndex
                      ? 'bg-teal text-white ring-4 ring-teal/20'
                      : 'bg-ink/12 text-transparent'
                }`}
              >
                {i < currentStepIndex ? '✓' : ''}
              </div>
              <span className="mt-2 text-[11px] text-ink/50">{step}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function OrderCardActions({
  order,
  onGoToTracking,
  onGoToDetails,
}: {
  order: Order
  onGoToTracking: () => void
  onGoToDetails: () => void
}) {
  if (order.status === 'Quality Check' || order.status === 'Shipped') {
    return (
      <>
        <PrimaryButton onClick={onGoToTracking}>Track Order</PrimaryButton>
        <SecondaryButton onClick={onGoToDetails}>View Details</SecondaryButton>
      </>
    )
  }
  if (order.status === 'Delivered') {
    return (
      <>
        <SecondaryButton onClick={onGoToDetails}>View Details</SecondaryButton>
        <PrimaryButton>Buy Again</PrimaryButton>
      </>
    )
  }
  if (order.status === 'Cancelled') {
    return (
      <>
        <SecondaryButton onClick={onGoToDetails}>View Details</SecondaryButton>
        <PrimaryButton>Reorder</PrimaryButton>
      </>
    )
  }
  return <PrimaryButton onClick={onGoToTracking}>Track Order</PrimaryButton>
}

function PrimaryButton({
  children,
  onClick,
}: {
  children: React.ReactNode
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 rounded-xl bg-teal px-4 py-2.5 text-sm font-medium text-white transition-all duration-150 hover:bg-teal-deep active:scale-[0.98]"
    >
      {children}
    </button>
  )
}

function SecondaryButton({
  children,
  onClick,
}: {
  children: React.ReactNode
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 rounded-xl border border-ink/15 bg-card px-4 py-2.5 text-sm font-medium text-ink transition-all duration-150 hover:border-teal/50 active:scale-[0.98]"
    >
      {children}
    </button>
  )
}