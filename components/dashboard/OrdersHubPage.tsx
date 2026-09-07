/**
 * app/account/orders/page.tsx
 *
 * Customer-facing order tracking ("My Orders"). Read-only status display —
 * customers can search, filter by status, track shipped orders, view
 * details, or reorder/buy again on completed orders.
 *
 * Data now comes from contexts/orderContexts.tsx (OrdersProvider /
 * useOrders). Swap the mock data there for a real fetch/query and this
 * page keeps working as-is.
 *
 * Colors and fonts reference the @theme tokens in globals.css:
 * parchment/ink/card, teal (+deep) for actions/links/progress, gold (+deep)
 * used only as a tint for the "delivered" highlight — never as a fill —
 * and indigo (+deep) for the trust/structural surfaces (headline, active
 * filter, processing badge).
 */
'use client'

import { useMemo, useState } from 'react'
import { Search, ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react'
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

const PAGE_SIZE = 4

export default function CustomerOrdersPage() {
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
        <h1 className="font-display text-3xl font-semibold text-indigo">My Orders</h1>
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
            className="w-full rounded-full border border-ink/15 bg-card py-3 pl-11 pr-11 text-sm outline-none placeholder:text-ink/40 focus:border-teal"
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
            <div className="rounded-xl border border-dashed border-ink/20 bg-card p-8 text-center text-sm text-ink/60">
              No orders match your search.
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
                className="flex h-8 w-8 items-center justify-center rounded-full text-ink/60 disabled:opacity-30"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => setPage(n)}
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                    n === page ? 'bg-indigo text-white' : 'text-ink hover:bg-ink/8'
                  }`}
                >
                  {n}
                </button>
              ))}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex h-8 w-8 items-center justify-center rounded-full text-ink/60 disabled:opacity-30"
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
  const isMultiItem = order.items.length > 1
  const primary = order.items[0]
  const currentStepIndex = order.status === 'Shipped' ? 2 : order.status === 'Delivered' ? 3 : -1

  return (
    <div className="rounded-2xl border border-ink/10 bg-card p-5">
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

      {/* Product row */}
      <div className="mt-4 flex items-center gap-4">
        {isMultiItem ? (
          <div className="flex -space-x-3">
            {order.items.slice(0, 3).map((it, i) => (
              <img
                key={i}
                src={it.image}
                alt={it.name}
                className="h-14 w-14 rounded-xl border-2 border-card bg-ink/5 object-cover"
              />
            ))}
          </div>
        ) : (
          <img
            src={primary.image}
            alt={primary.name}
            className="h-16 w-16 rounded-xl bg-ink/5 object-cover"
          />
        )}

        <div className="flex flex-1 items-start justify-between gap-3">
          <div>
            {isMultiItem ? (
              <>
                <div className="font-medium">
                  {order.items.length} items · {order.items.reduce((n, it) => n + it.qty, 0)} total qty
                </div>
                <div className="text-xs text-ink/60">
                  Total {order.currency} {orderTotal(order).toLocaleString()}
                </div>
              </>
            ) : (
              <>
                <div className="font-medium">{primary.name}</div>
                <div className="text-xs text-ink/60">{itemMeta(primary)}</div>
              </>
            )}
          </div>
          {!isMultiItem && (
            <div className="text-right">
              <div className="font-medium">
                {order.currency} {orderTotal(order).toLocaleString()}
              </div>
              <div className="text-[11px] text-ink/50">+ WishDrop delivery</div>
            </div>
          )}
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
      {order.status === 'Shipped' && (
        <div className="mt-5">
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
                {i < SHIPPING_FLOW.length - 1 && (
                  <div
                    className={`absolute top-2.5 h-0.5 ${i < currentStepIndex ? 'bg-teal' : 'bg-ink/12'}`}
                    style={{
                      left: `${((i + 0.5) / SHIPPING_FLOW.length) * 100}%`,
                      width: `${(1 / SHIPPING_FLOW.length) * 100}%`,
                    }}
                  />
                )}
                <span className="mt-2 text-[11px] text-ink/50">{step}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-5 flex gap-2">
        {(order.status === 'Quality Check' || order.status === 'Shipped') && (
          <>
            <PrimaryButton>Track Order</PrimaryButton>
            <SecondaryButton>View Details</SecondaryButton>
          </>
        )}
        {order.status === 'Delivered' && (
          <>
            <SecondaryButton>View Details</SecondaryButton>
            <PrimaryButton>Buy Again</PrimaryButton>
          </>
        )}
        {order.status === 'Cancelled' && (
          <>
            <SecondaryButton>View Details</SecondaryButton>
            <PrimaryButton>Reorder</PrimaryButton>
          </>
        )}
        {order.status === 'Processing' && <PrimaryButton>Track Order</PrimaryButton>}
      </div>
    </div>
  )
}

function PrimaryButton({ children }: { children: React.ReactNode }) {
  return (
    <button className="flex-1 rounded-lg bg-teal px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-deep">
      {children}
    </button>
  )
}

function SecondaryButton({ children }: { children: React.ReactNode }) {
  return (
    <button className="flex-1 rounded-lg border border-ink/15 bg-card px-4 py-2.5 text-sm font-medium text-ink hover:border-teal/50">
      {children}
    </button>
  )
}