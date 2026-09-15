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

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  PackageSearch,
  X,
  Info,
  Store,
  User,
  Receipt,
  AlertTriangle,
} from 'lucide-react'
import {
  OrdersProvider,
  useOrders,
  orderTotal,
  itemMeta,
  itemSourceLabel,
  hasMultipleSources,
  FILTERS,
  SHIPPING_FLOW,
  STATUS_BADGE,
  type Order,
  type OrderItem,
} from '@/contexts/Ordercontexts'
import { ItemImageStack } from '@/components/dashboard/ItemImageStack'
import { fetchQcIssuesForItems, type CustomerVisibleQcIssue } from '@/lib/supabase/qc-issues'
import QcIssueBanner from '@/components/shared/QcIssueBanner'

const PAGE_SIZE = 10

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
  const { orders, loading } = useOrders()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All')
  const [page, setPage] = useState(1)

  // QC issues, keyed by order_items.id, across every one of this
  // customer's orders — fetched once up front (not per-page/per-filter)
  // so a flagged item is visible no matter which status filter is
  // active. A QC issue can outlive the 'Quality Check' status itself
  // (the order keeps moving through Shipped/Delivered while the issue
  // is still pending or getting resolved), so gating this on
  // order.status would hide real, open issues from the default "All"
  // view — the thing this was built to fix.
  const [qcIssuesByItemId, setQcIssuesByItemId] = useState<Map<string, CustomerVisibleQcIssue>>(new Map())

  useEffect(() => {
    const itemIds = orders.flatMap((o) => o.items.map((i) => i.id).filter((id): id is string => !!id))
    if (!itemIds.length) return
    fetchQcIssuesForItems(itemIds).then(setQcIssuesByItemId)
  }, [orders])

  const filtered = useMemo(() => {
    const matches = orders.filter((o) => {
      const matchesFilter = filter === 'All' || o.status === filter
      const q = query.trim().toLowerCase()
      const matchesQuery =
        q.length === 0 ||
        o.id.toLowerCase().includes(q) ||
        o.items.some((it) => it.name.toLowerCase().includes(q))
      return matchesFilter && matchesQuery
    })

    // Bubble QC-flagged orders to the front, ahead of plain recency sort.
    // Without this, a flagged order that isn't among the customer's most
    // recent PAGE_SIZE orders sits unseen a page or more deep in "All" —
    // it's still IN the filtered list (the matchesFilter check above
    // never excludes it), but paginated out of sight, which is
    // functionally invisible to anyone who doesn't click through pages.
    // Narrowing to the "Quality Check" tab shrinks the list enough that
    // the same order lands on page 1, which is exactly what made it look
    // like flagged orders "only show under QC" — they were always in the
    // data, just buried. This sort keeps everything else in its original
    // (already recency-sorted) order — flagged orders move to the front
    // as a block, nothing else's relative order changes.
    const hasIssue = (o: Order) => o.items.some((it) => it.id && qcIssuesByItemId.has(it.id))
    return [...matches].sort((a, b) => Number(hasIssue(b)) - Number(hasIssue(a)))
  }, [query, filter, orders, qcIssuesByItemId])

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
          {loading ? (
            Array.from({ length: PAGE_SIZE }).map((_, i) => <OrderCardSkeleton key={i} />)
          ) : pageOrders.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-ink/15 bg-card px-8 py-12 text-center">
              <PackageSearch size={36} strokeWidth={1.2} className="text-ink/25" />
              <p className="text-sm text-ink/50">
                {orders.length === 0 ? 'No orders yet.' : 'No orders match your search.'}
              </p>
            </div>
          ) : (
            pageOrders.map((order) => (
              <OrderCard key={order.id} order={order} qcIssuesByItemId={qcIssuesByItemId} />
            ))
          )}
        </div>

        {/* Pagination */}
        {!loading && filtered.length > 0 && (
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

function OrderCard({
  order,
  qcIssuesByItemId,
}: {
  order: Order
  qcIssuesByItemId: Map<string, CustomerVisibleQcIssue>
}) {
  const router = useRouter()
  const [showBreakdown, setShowBreakdown] = useState(false)
  const isMultiItem = order.items.length > 1
  const primary = order.items[0]
  const currentStepIndex = order.status === 'Shipped' ? 2 : order.status === 'Delivered' ? 3 : -1
  // A different accent color when this order has any open QC issue,
  // regardless of its current pipeline status — an order that's already
  // moved on to Shipped can still have an unresolved quality issue
  // trailing it, and that should keep reading as "needs attention"
  // rather than fading back to the plain Shipped accent.
  const flaggedItems = order.items.filter((it) => it.id && qcIssuesByItemId.has(it.id))
  const hasQcIssue = flaggedItems.length > 0
  const statusAccent = hasQcIssue ? 'border-l-rose-500' : STATUS_ACCENT[order.status] ?? DEFAULT_STATUS_ACCENT

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
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-xs font-semibold tracking-wide text-ink">ORDER #{order.id}</div>
            <div className="mt-0.5 text-xs text-ink/60">{order.date}</div>
          </div>
          <div className="flex flex-none items-center gap-1.5">
            {hasQcIssue && <QcIssueBadge count={flaggedItems.length} />}
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_BADGE[order.status]}`}>
              {order.status}
            </span>
          </div>
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
              <BreakdownTrigger onClick={() => setShowBreakdown(true)} />
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
                <BreakdownTrigger onClick={() => setShowBreakdown(true)} />
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

        {/* QC issue(s) — shown regardless of order.status, so a flagged
            item stays visible here even once the order has moved on to
            Shipped/Delivered, and regardless of which status filter is
            active on the list above (including the default "All"). */}
        {flaggedItems.map((item) => (
          <QcIssueBanner key={item.id} issue={qcIssuesByItemId.get(item.id!)!} />
        ))}

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
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs font-semibold tracking-wide text-ink">ORDER #{order.id}</div>
              <div className="mt-0.5 text-xs text-ink/60">{order.date}</div>
            </div>
            <div className="flex flex-none items-center gap-1.5">
              {hasQcIssue && <QcIssueBadge count={flaggedItems.length} />}
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_BADGE[order.status]}`}>
                {order.status}
              </span>
            </div>
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
              <BreakdownTrigger onClick={() => setShowBreakdown(true)} />
            </div>
          </div>

          {/* Quality-check note */}
          {order.status === 'Quality Check' && order.note && (
            <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-teal/8 px-3.5 py-3 text-sm text-teal-deep">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{order.note}</span>
            </div>
          )}

          {/* QC issue(s) — same reasoning as the mobile layout above:
              visible regardless of order.status or the active filter. */}
          {flaggedItems.map((item) => (
            <QcIssueBanner key={item.id} issue={qcIssuesByItemId.get(item.id!)!} />
          ))}

          {/* Shipping progress */}
          {order.status === 'Shipped' && <ShippingProgress currentStepIndex={currentStepIndex} />}

          {/* Actions — pinned to the bottom of the column */}
          <div className="mt-auto flex gap-2 pt-5">
            <OrderCardActions order={order} onGoToTracking={goToTracking} onGoToDetails={goToDetails} />
          </div>
        </div>
      </div>

      {showBreakdown && (
        <OrderPriceBreakdownOverlay order={order} onClose={() => setShowBreakdown(false)} />
      )}
    </div>
  )
}

// Compact pill next to the status badge flagging that this order has at
// least one open/resolved QC issue on file — intentionally independent
// of `order.status` (see hasQcIssue above) so it still shows once the
// order has moved on to Shipped/Delivered, and shows under every filter
// tab including "All", not just while filtered to "Quality Check".
function QcIssueBadge({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
      <AlertTriangle size={11} className="flex-none" />
      {count > 1 ? `${count} items flagged` : 'Quality issue'}
    </span>
  )
}

// Small underlined text trigger that opens the price breakdown overlay.
// Shares the same slot the old static "+ WishDrop delivery" caption used
// to occupy, so it doesn't add any extra vertical space to the card.
function BreakdownTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-teal-deep underline decoration-teal-deep/30 underline-offset-2 transition-colors hover:decoration-teal-deep"
    >
      <Receipt size={11} className="flex-none" />
      Price breakdown
    </button>
  )
}

// ---------------------------------------------------------------------
// Full order price breakdown — every item, its seller/source, qty ×
// unit price, and the order total. Modeled on the cart's
// PriceBreakdownOverlay (same sheet-on-mobile / dialog-on-desktop shell,
// same scroll-lock + Escape-to-close behavior), but scoped to a whole
// order's item list rather than one cart line with dual delivery
// pricing — Order has no per-item delivery/tax/discount fields, only
// qty * unitPrice per item (see orderTotal in Ordercontexts.tsx), so
// there's no economy/express comparison to show here. The card's
// "+ WishDrop delivery" caption was always just a label, not a stored
// fee, so this overlay states that plainly rather than inventing a
// number.
// ---------------------------------------------------------------------
function OrderPriceBreakdownOverlay({ order, onClose }: { order: Order; onClose: () => void }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  const total = orderTotal(order)
  const multiSource = hasMultipleSources(order)

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-card p-5 shadow-[0_8px_30px_rgba(32,36,43,0.15)] sm:max-h-[80vh] sm:w-full sm:max-w-md sm:rounded-2xl sm:p-6"
        style={{ border: '1px solid rgba(32, 36, 43, 0.08)' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Price breakdown for order ${order.id}`}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink/10 sm:hidden" />

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">Order #{order.id}</p>
            <p className="mt-0.5 text-xs text-ink/50">
              {order.items.length} item{order.items.length > 1 ? 's' : ''} · {order.date}
              {multiSource && ' · Multiple sellers'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close price breakdown"
            className="grid h-8 w-8 flex-none place-items-center rounded-md text-ink/40 transition-colors hover:bg-ink/[0.08] hover:text-ink/70"
          >
            <X size={18} />
          </button>
        </div>

        {/* Line items */}
        <div className="mt-4 space-y-3">
          {order.items.map((item, i) => (
            <OrderBreakdownLine key={i} item={item} currency={order.currency} />
          ))}
        </div>

        {/* Totals */}
        <div className="mt-4 space-y-1.5 border-t border-ink/10 pt-3 text-sm">
          <div className="flex items-center justify-between text-ink/70">
            <span>Items subtotal</span>
            <span>
              {order.currency} {total.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between text-ink/70">
            <span>WishDrop delivery</span>
            <span className="text-ink/50">Included</span>
          </div>
          <div className="flex items-center justify-between border-t border-ink/10 pt-2 text-base font-semibold text-ink">
            <span>Order total</span>
            <span>
              {order.currency} {total.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Shipping reference, when there is one */}
        {(order.carrier || order.trackingNumber) && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-ink/[0.04] px-3 py-2.5 text-xs text-ink/60">
            <Info size={12} className="mt-0.5 flex-none" />
            <span>
              {order.carrier ?? 'Carrier'}
              {order.trackingNumber ? ` · ${order.trackingNumber}` : ''}
              {order.estimatedDelivery ? ` · Est. ${order.estimatedDelivery}` : ''}
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-full border border-ink/15 py-3 text-sm font-semibold text-ink transition-colors hover:bg-ink/[0.04]"
        >
          Close
        </button>
      </div>
    </div>
  )
}

// One item row inside the breakdown overlay: thumbnail, name, variant,
// seller/source (with a store-vs-individual icon via sellerType), and
// its line total (qty * unitPrice), mirroring itemMeta()/itemSourceLabel()
// used elsewhere on the card so the wording stays consistent.
function OrderBreakdownLine({ item, currency }: { item: OrderItem; currency: Order['currency'] }) {
  return (
    <div className="flex items-start gap-3">
      <div className="h-14 w-14 flex-none overflow-hidden rounded-xl border border-ink/10 bg-white">
        <img src={item.image} alt="" className="h-full w-full object-cover" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-medium text-ink">{item.name}</p>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-ink/50">
          {item.sellerType === 'individual' ? (
            <User size={11} className="flex-none" />
          ) : (
            <Store size={11} className="flex-none" />
          )}
          <span className="truncate">{itemSourceLabel(item)}</span>
        </div>
        <p className="mt-1 text-xs text-ink/50">{itemMeta(item)}</p>
      </div>
      <div className="flex-none text-right">
        <p className="text-sm font-medium text-ink">
          {currency} {(item.qty * item.unitPrice).toLocaleString()}
        </p>
        <p className="text-[11px] text-ink/40">
          {currency} {item.unitPrice.toLocaleString()} × {item.qty}
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Skeleton card shown while orders are loading. Mirrors OrderCard's own
// two-layout structure (stacked mobile / row desktop) so the page
// doesn't jump when the real cards swap in — same paddings, same image
// rail width, same action-row height. bg-ink/10 blocks stand in for
// text/images; the outer border-l-ink/10 accent stays neutral since we
// don't know the order's status yet.
// ---------------------------------------------------------------------
function OrderCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink/10 border-l-4 border-l-ink/10 bg-card animate-pulse">
      {/* Mobile / tablet */}
      <div className="p-5 lg:hidden">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="h-3 w-24 rounded bg-ink/10" />
            <div className="h-2.5 w-16 rounded bg-ink/10" />
          </div>
          <div className="h-6 w-20 rounded-full bg-ink/10" />
        </div>
        <div className="mt-4 flex items-center gap-4">
          <div className="h-16 w-16 flex-none rounded-xl bg-ink/10" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-3/4 rounded bg-ink/10" />
            <div className="h-2.5 w-1/2 rounded bg-ink/10" />
          </div>
          <div className="space-y-2 text-right">
            <div className="ml-auto h-3.5 w-16 rounded bg-ink/10" />
            <div className="ml-auto h-2.5 w-20 rounded bg-ink/10" />
          </div>
        </div>
        <div className="mt-5 flex gap-2">
          <div className="h-10 flex-1 rounded-xl bg-ink/10" />
          <div className="h-10 flex-1 rounded-xl bg-ink/10" />
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden gap-5 p-5 lg:flex">
        <div className="w-44 flex-none self-stretch rounded-xl bg-ink/10" />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="h-3 w-28 rounded bg-ink/10" />
              <div className="h-2.5 w-16 rounded bg-ink/10" />
            </div>
            <div className="h-6 w-20 rounded-full bg-ink/10" />
          </div>
          <div className="mt-4 flex items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="h-3.5 w-40 rounded bg-ink/10" />
              <div className="h-2.5 w-28 rounded bg-ink/10" />
            </div>
            <div className="space-y-2 text-right">
              <div className="ml-auto h-3.5 w-16 rounded bg-ink/10" />
              <div className="ml-auto h-2.5 w-20 rounded bg-ink/10" />
            </div>
          </div>
          <div className="mt-auto flex gap-2 pt-5">
            <div className="h-10 w-28 rounded-xl bg-ink/10" />
            <div className="h-10 w-28 rounded-xl bg-ink/10" />
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
  // Unpaid / Processing / any future status not explicitly handled above —
  // still needs a way into the full order record, not just tracking.
  return (
    <>
      <PrimaryButton onClick={onGoToTracking}>Track Order</PrimaryButton>
      <SecondaryButton onClick={onGoToDetails}>View Details</SecondaryButton>
    </>
  )
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