// app/admin/delivered/page.tsx
"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { CheckCircle2, ChevronRight, PartyPopper, Search, SearchX, Smartphone, Warehouse as WarehouseIcon } from "lucide-react"

import { useAdminData, hoursSince, formatAge } from "@/contexts/AdminDataContext"

// Delivered — the terminal stage. An order lands here the instant
// markDelivered is called from /admin/in-transit (or a Manager override),
// or the customer self-confirms from their own account page — either
// source writes the SAME real `orders.stage = 'delivered'` +
// `delivered_confirmed_by`, which is why that field is worth showing
// here explicitly: it's the one place this admin panel and the
// customer-facing "confirm delivery" flow can disagree about who
// actually closed out an order, so making it visible is the whole point
// of this page, not just a nice-to-have column.
//
// Read-only by design — there's nothing to action from here (no queue,
// no next stage). It exists so Delivered isn't just a number that
// disappears from every other queue page with no page of its own to land
// on, and so Reports/the warehouse & manager dashboards have somewhere
// real to link their "delivered" figures to.

export default function DeliveredPage() {
  const { visibleOrders, sites, currentUser, permissions } = useAdminData()
  const [query, setQuery] = useState("")

  const delivered = useMemo(
    () =>
      visibleOrders
        .filter((o) => o.stage === "Delivered")
        .sort((a, b) => new Date(b.deliveredAt ?? b.stageEnteredAt).getTime() - new Date(a.deliveredAt ?? a.stageEnteredAt).getTime()),
    [visibleOrders]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return delivered
    return delivered.filter((o) => o.id.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q))
  }, [delivered, query])

  const warehouseConfirmedCount = delivered.filter((o) => o.deliveredConfirmedBy === "warehouse").length
  const customerConfirmedCount = delivered.filter((o) => o.deliveredConfirmedBy === "customer").length

  const scopeLabel = permissions.ordersScopedToOwnSite
    ? sites.find((s) => s.id === currentUser.siteId)?.name ?? "your site"
    : "all sites"

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      <div className="mx-auto max-w-8xl px-6 pb-24 pt-10 lg:px-10">
        {/* ── Header ── */}
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 flex-none place-items-center rounded-2xl border border-ink/10 bg-white text-teal-deep shadow-[0_1px_2px_rgba(32,36,43,0.04),0_16px_40px_-24px_rgba(14,140,156,0.4)]">
              <PartyPopper size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-display text-3xl font-semibold text-ink">Delivered</h1>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink/60">
                Confirmed delivered at {scopeLabel} — the end of the pipeline. Read-only; there's nothing left to action here.
              </p>
            </div>
          </div>
        </div>

        {/* ── Stat strip ── */}
        <div className="mt-9 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-ink/10 bg-card px-4 py-3.5">
            <p className="flex items-center gap-1.5 text-xs font-medium text-ink/50">
              <CheckCircle2 size={14} /> Total delivered
            </p>
            <p className="mt-1 font-display text-2xl text-ink">{delivered.length}</p>
          </div>
          <div className="rounded-2xl border border-ink/10 bg-card px-4 py-3.5">
            <p className="flex items-center gap-1.5 text-xs font-medium text-ink/50">
              <WarehouseIcon size={14} /> Warehouse-confirmed
            </p>
            <p className="mt-1 font-display text-2xl text-ink">{warehouseConfirmedCount}</p>
          </div>
          <div className="rounded-2xl border border-ink/10 bg-card px-4 py-3.5">
            <p className="flex items-center gap-1.5 text-xs font-medium text-ink/50">
              <Smartphone size={14} /> Customer-confirmed
            </p>
            <p className="mt-1 font-display text-2xl text-ink">{customerConfirmedCount}</p>
          </div>
        </div>

        {/* ── Search ── */}
        <div className="relative mt-6 max-w-md">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search order or customer…"
            className="w-full rounded-xl border border-ink/15 bg-card py-2.5 pl-9 pr-3 text-sm text-ink outline-none placeholder:text-ink/35 focus:border-teal"
          />
        </div>

        {/* ── List ── */}
        <div className="mt-6 overflow-hidden rounded-2xl border border-ink/10 bg-card">
          <div className="hidden grid-cols-[1.3fr_0.9fr_0.8fr_0.9fr_auto] gap-3 border-b border-ink/10 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-ink/35 sm:grid">
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
                    <p className="mt-1 max-w-xs text-xs text-ink/45">
                      Orders show up here once marked delivered from In transit, or self-confirmed by the customer.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <SearchX size={22} className="text-ink/25" />
                  <p className="text-sm font-semibold text-ink/70">No matches</p>
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
              const deliveredAgo = order.deliveredAt ? formatAge(hoursSince(order.deliveredAt)) : "—"
              return (
                <Link
                  key={order.id}
                  href={`/admin/orders/${order.id}`}
                  className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-ink/[0.06] px-5 py-3.5 transition-colors last:border-b-0 hover:bg-teal/[0.04] sm:grid-cols-[1.3fr_0.9fr_0.8fr_0.9fr_auto]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">{order.id}</span>
                    <span className="block truncate text-xs text-ink/45">{order.customerName}</span>
                  </span>

                  <span className="hidden text-sm text-ink/70 sm:block">
                    {order.totalValue.toLocaleString("en-LK", { style: "currency", currency: "LKR", maximumFractionDigits: 0 })}
                  </span>

                  <span className="hidden text-sm text-ink/50 sm:block">{deliveredAgo} ago</span>

                  <span className="hidden sm:block">
                    {order.deliveredConfirmedBy ? (
                      <span
                        className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${
                          order.deliveredConfirmedBy === "warehouse"
                            ? "bg-teal/12 text-teal-deep ring-1 ring-inset ring-teal/25"
                            : "bg-indigo/10 text-indigo ring-1 ring-inset ring-indigo/25"
                        }`}
                      >
                        {order.deliveredConfirmedBy === "warehouse" ? <WarehouseIcon size={12} /> : <Smartphone size={12} />}
                        {order.deliveredConfirmedBy === "warehouse" ? "Warehouse" : "Customer"}
                      </span>
                    ) : (
                      <span className="text-xs text-ink/35">—</span>
                    )}
                  </span>

                  <ChevronRight size={16} className="hidden flex-none text-ink/25 sm:block" />

                  {/* mobile summary */}
                  <span className="col-span-2 flex items-center justify-between gap-2 pl-0 sm:hidden">
                    <span className="text-xs text-ink/45">{deliveredAgo} ago</span>
                    {order.deliveredConfirmedBy && (
                      <span className="text-xs text-ink/40">
                        {order.deliveredConfirmedBy === "warehouse" ? "Warehouse-confirmed" : "Customer-confirmed"}
                      </span>
                    )}
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