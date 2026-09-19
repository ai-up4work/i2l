// app/admin/delivered/page.tsx
"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ChevronRight, PartyPopper, Search, SearchX, Smartphone, Warehouse as WarehouseIcon } from "lucide-react"

import { useAdminData, hoursSince, formatAge } from "@/contexts/AdminDataContext"

// Delivered: the last stage. An order lands here when markDelivered is called
// from /admin/shipped (or a Manager override), or when the customer confirms
// delivery from their own account page. Both write the same
// `orders.stage = 'delivered'` and `delivered_confirmed_by`, which is why the
// "Confirmed by" column is worth showing: it is the one place this admin panel
// and the customer-facing flow can disagree about who closed out an order.
//
// Read-only by design. There is nothing to action from here; the page exists so
// Delivered has somewhere real to land, and so Reports and the dashboards have
// somewhere to link their "delivered" figures to.

// Shared by the header row and every row so the columns always line up.
const GRID =
  "sm:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_1.5rem]"

export default function DeliveredPage() {
  const { visibleOrders, sites, currentUser, permissions } = useAdminData()
  const [query, setQuery] = useState("")

  const delivered = useMemo(
    () =>
      visibleOrders
        .filter((o) => o.stage === "Delivered")
        .sort(
          (a, b) =>
            new Date(b.deliveredAt ?? b.stageEnteredAt).getTime() -
            new Date(a.deliveredAt ?? a.stageEnteredAt).getTime(),
        ),
    [visibleOrders],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return delivered
    return delivered.filter((o) => o.id.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q))
  }, [delivered, query])

  const warehouseConfirmedCount = delivered.filter((o) => o.deliveredConfirmedBy === "warehouse").length
  const customerConfirmedCount = delivered.filter((o) => o.deliveredConfirmedBy === "customer").length
  const hasSearch = query.trim() !== ""

  const scopeLabel = permissions.ordersScopedToOwnSite
    ? sites.find((s) => s.id === currentUser.siteId)?.name ?? "your site"
    : "all sites"

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      <div className="mx-auto max-w-8xl px-6 pb-24 pt-10 lg:px-10">
        {/* ── Header ── */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-teal-deep text-parchment">
              <PartyPopper size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-display text-3xl font-semibold leading-tight">Delivered</h1>
              <p className="mt-1 max-w-md text-sm leading-relaxed text-ink/60">
                Orders confirmed delivered at {scopeLabel}, newest first. This is the end of the pipeline, so there is
                nothing to action here.
              </p>
            </div>
          </div>

          <dl className="flex divide-x divide-ink/10 overflow-hidden rounded-2xl border border-ink/10 bg-card">
            <div className="px-5 py-3">
              <dt className="text-xs font-medium text-ink/45">Total delivered</dt>
              <dd className="mt-0.5 font-display text-xl text-ink">{delivered.length}</dd>
            </div>
            <div className="px-5 py-3">
              <dt className="text-xs font-medium text-ink/45">Warehouse confirmed</dt>
              <dd className="mt-0.5 font-display text-xl text-ink">{warehouseConfirmedCount}</dd>
            </div>
            <div className="px-5 py-3">
              <dt className="text-xs font-medium text-ink/45">Customer confirmed</dt>
              <dd className="mt-0.5 font-display text-xl text-ink">{customerConfirmedCount}</dd>
            </div>
          </dl>
        </div>

        {/* ── Search ── */}
        <div className="mt-9 flex flex-wrap items-center gap-4">
          <div className="relative w-full sm:w-72">
            <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/35" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search order or customer"
              aria-label="Search order or customer"
              className="w-full rounded-full border border-ink/10 bg-card py-2.5 pl-9 pr-4 text-sm placeholder:text-ink/35 outline-none transition-colors focus:border-teal/50 focus:ring-2 focus:ring-teal/15"
            />
          </div>
          <p className="text-xs text-ink/45">
            {hasSearch
              ? `${filtered.length} of ${delivered.length} orders shown`
              : `${filtered.length} order${filtered.length === 1 ? "" : "s"}`}
            {hasSearch && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="ml-2 font-semibold text-teal-deep underline decoration-dotted underline-offset-4 hover:text-teal"
              >
                Clear search
              </button>
            )}
          </p>
        </div>

        {/* ── List ── */}
        <div className="mt-4 overflow-hidden rounded-2xl border border-ink/10 bg-card">
          <div
            className={`sticky top-0 z-10 hidden items-center gap-3 border-b border-ink/10 bg-parchment/80 px-5 py-3 text-xs font-medium text-ink/50 backdrop-blur sm:grid ${GRID}`}
          >
            <span>Order</span>
            <span>Value</span>
            <span>Delivered</span>
            <span>Confirmed by</span>
            <span />
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
              {delivered.length === 0 ? (
                <>
                  <PartyPopper size={22} className="text-ink/25" />
                  <div>
                    <p className="text-sm font-semibold text-ink/70">Nothing delivered yet</p>
                    <p className="mt-1 max-w-xs text-xs text-ink/50">
                      Orders appear here once they are marked delivered in Shipped, or confirmed by the customer.
                    </p>
                  </div>
                  <Link
                    href="/admin/shipped"
                    className="text-xs font-semibold text-teal-deep underline decoration-dotted underline-offset-4 hover:text-teal"
                  >
                    Go to Shipped
                  </Link>
                </>
              ) : (
                <>
                  <SearchX size={22} className="text-ink/25" />
                  <div>
                    <p className="text-sm font-semibold text-ink/70">No orders match this search</p>
                    <p className="mt-1 text-xs text-ink/50">Check the order number or customer name.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="text-xs font-semibold text-teal-deep underline decoration-dotted underline-offset-4 hover:text-teal"
                  >
                    Clear search
                  </button>
                </>
              )}
            </div>
          ) : (
            filtered.map((order) => {
              const deliveredAgo = order.deliveredAt ? `${formatAge(hoursSince(order.deliveredAt))} ago` : "—"
              const confirmedBy = order.deliveredConfirmedBy

              const confirmedPill = confirmedBy ? (
                <span
                  className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${
                    confirmedBy === "warehouse"
                      ? "bg-teal/12 text-teal-deep ring-1 ring-inset ring-teal/25"
                      : "bg-indigo/10 text-indigo ring-1 ring-inset ring-indigo/25"
                  }`}
                >
                  {confirmedBy === "warehouse" ? (
                    <WarehouseIcon size={12} aria-hidden />
                  ) : (
                    <Smartphone size={12} aria-hidden />
                  )}
                  {confirmedBy === "warehouse" ? "Warehouse" : "Customer"}
                </span>
              ) : null

              return (
                <Link
                  key={order.id}
                  href={`/admin/orders/${order.id}`}
                  className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-ink/[0.06] px-5 py-4 outline-none transition-colors last:border-b-0 hover:bg-ink/[0.02] focus-visible:bg-teal/[0.06] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-teal/40 sm:gap-y-0 sm:py-3.5 ${GRID}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{order.id}</span>
                    <span className="block truncate text-xs text-ink/50">{order.customerName}</span>
                  </span>

                  {/* mobile: who confirmed it sits beside the order */}
                  <span className="sm:hidden">{confirmedPill}</span>

                  <span className="hidden text-sm tabular-nums text-ink/70 sm:block">
                    {order.totalValue.toLocaleString("en-LK", {
                      style: "currency",
                      currency: "LKR",
                      maximumFractionDigits: 0,
                    })}
                  </span>

                  <span className="hidden text-sm tabular-nums text-ink/50 sm:block">{deliveredAgo}</span>

                  <span className="hidden sm:block">{confirmedPill ?? <span className="text-xs text-ink/35">—</span>}</span>

                  <ChevronRight size={16} className="hidden flex-none text-ink/25 sm:block" aria-hidden />

                  {/* mobile-only details */}
                  <span className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink/55 sm:hidden">
                    <span>
                      {order.totalValue.toLocaleString("en-LK", {
                        style: "currency",
                        currency: "LKR",
                        maximumFractionDigits: 0,
                      })}
                    </span>
                    <span>Delivered {deliveredAgo}</span>
                  </span>
                </Link>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}