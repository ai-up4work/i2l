// app/admin/(manager)/manager-dashboard/page.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Activity,
  Archive,
  ClipboardCheck,
  Clock,
  Flag,
  PackageCheck,
  ShoppingBag,
  Store,
  Truck,
} from "lucide-react"

import { useAdminData, hoursSince, formatAge } from "@/contexts/AdminDataContext"
import { STAGE_ORDER } from "@/types/admin"
import { panelClass } from "@/components/admin/seller/shared"
import {
  AttentionList,
  QueueCard,
  StatCard,
  isOverThreshold,
  type AttentionItem,
} from "@/components/admin/dashboard/shared"

// Manager dashboard — full oversight. Everything Sales sees plus the
// warehouse queues across every site (Manager isn't site-scoped, unlike
// Warehouse — see ordersScopedToOwnSite in AdminDataContext), plus one
// real actionable widget: bulk-flag orders that are over SLA and not
// yet flagged, using the same bulkFlagDelayed the Orders page's "Flag
// for review" button calls. A direct visit by a non-Manager role
// bounces back through the role-based redirector at /admin/dashboard.

export default function ManagerDashboardPage() {
  const router = useRouter()
  const {
    currentUser,
    sites,
    visibleOrders,
    visiblePurchaseLines,
    visibleQcLines,
    visiblePackLines,
    visibleExportBinLines,
    visibleInTransitLines,
    bulkFlagDelayed,
  } = useAdminData()

  useEffect(() => {
    if (currentUser.role !== "manager") router.replace("/admin/dashboard")
  }, [currentUser.role, router])

  const [justFlagged, setJustFlagged] = useState<number | null>(null)

  const delayedCount = visibleOrders.filter((o) => o.delayed).length
  const breachedOrders = visibleOrders.filter((o) => isOverThreshold(o.stage, hoursSince(o.stageEnteredAt)))
  const breachCount = breachedOrders.length
  const manualQuoteCount = visibleOrders.filter((o) => o.isManualQuote && o.stage !== "Delivered").length
  const inFlightValue = visibleOrders
    .filter((o) => o.stage !== "Delivered")
    .reduce((sum, o) => sum + o.totalValue, 0)

  const needsPurchase = visiblePurchaseLines.filter((l) => l.status === "needs_purchase").length
  const unavailable = visiblePurchaseLines.filter((l) => l.status === "unavailable").length
  const purchased = visiblePurchaseLines.filter((l) => l.status === "purchased").length

  const qcPending = visibleQcLines.filter((l) => l.status === "pending").length
  const qcFlagged = visibleQcLines.filter((l) => l.status === "flagged").length
  const packAwaiting = visiblePackLines.filter((l) => l.status === "awaiting_pack").length
  const exportBinCount = visibleExportBinLines.length
  const inTransitCount = visibleInTransitLines.length
  const inTransitOverdue = visibleInTransitLines.filter((l) => l.deliveryStatus === "overdue").length

  const stageBreakdown = useMemo(() => {
    return STAGE_ORDER.map((stage) => ({
      stage,
      count: visibleOrders.filter((o) => o.stage === stage).length,
    }))
  }, [visibleOrders])
  const maxStageCount = Math.max(1, ...stageBreakdown.map((s) => s.count))

  const siteBreakdown = useMemo(() => {
    return sites.map((site) => {
      const siteOrders = visibleOrders.filter((o) => o.siteId === site.id)
      return {
        site,
        total: siteOrders.length,
        delayed: siteOrders.filter((o) => o.delayed).length,
        breached: siteOrders.filter((o) => isOverThreshold(o.stage, hoursSince(o.stageEnteredAt))).length,
      }
    })
  }, [sites, visibleOrders])

  const attention = useMemo<AttentionItem[]>(() => {
    const items: AttentionItem[] = []

    for (const l of visiblePurchaseLines.filter((l) => l.status === "unavailable")) {
      items.push({
        key: `purchase-${l.id}`,
        title: l.productTitle,
        subtitle: `${l.orderNumber} · ${l.sellerName}`,
        meta: "Unavailable",
        href: `/admin/purchases/${l.id}`,
        tone: "rose",
      })
    }
    for (const o of visibleOrders.filter((o) => o.delayed)) {
      items.push({
        key: `delayed-${o.id}`,
        title: o.id,
        subtitle: `${o.customerName} · ${o.stage}`,
        meta: "Delayed",
        href: `/admin/orders/${o.id}`,
        tone: "amber",
      })
    }
    for (const o of breachedOrders) {
      items.push({
        key: `breach-${o.id}`,
        title: o.id,
        subtitle: `${o.customerName} · ${o.stage}`,
        meta: `${formatAge(hoursSince(o.stageEnteredAt))} in stage`,
        href: `/admin/orders/${o.id}`,
        tone: "amber",
      })
    }
    return items.slice(0, 10)
  }, [visiblePurchaseLines, visibleOrders, breachedOrders])

  // Real actionable widget: flag every breached-but-not-yet-delayed
  // order in one click, using the same mutation the Orders page's bulk
  // "Flag for review" button calls.
  const unflaggedBreaches = breachedOrders.filter((o) => !o.delayed)
  const handleFlagBreaches = () => {
    if (unflaggedBreaches.length === 0) return
    bulkFlagDelayed(unflaggedBreaches.map((o) => o.id))
    setJustFlagged(unflaggedBreaches.length)
    window.setTimeout(() => setJustFlagged(null), 4000)
  }

  // Guard comes AFTER every hook above so hook call order never changes
  // between renders, even as currentUser.role flips via the role switcher.
  if (currentUser.role !== "manager") return null

  return (
    <div className="min-h-screen bg-parchment font-body text-ink">
      <div className="mx-auto max-w-[1560px] px-6 pb-24 pt-10 lg:px-10">
        {/* ── Header ── */}
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 flex-none place-items-center rounded-2xl border border-ink/10 bg-card text-teal-deep shadow-[0_1px_2px_rgba(32,36,43,0.04),0_16px_40px_-24px_rgba(14,140,156,0.4)]">
              <Store size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-display text-3xl text-ink">Good to see you, {currentUser.name.split(" ")[0]}</h1>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink/60">
                Full pipeline and warehouse overview across every site.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-ink/10 bg-card px-5 py-3 text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-ink/40">In flight</p>
            <p className="mt-0.5 font-display text-xl text-ink">₹{inFlightValue.toLocaleString("en-IN")}</p>
          </div>
        </div>

        {/* ── Confirmation banner ── */}
        {justFlagged !== null && (
          <div className="mt-6 flex items-center gap-2.5 rounded-2xl border border-teal/25 bg-teal/[0.08] px-4 py-3 text-sm font-medium text-teal-deep">
            <Flag size={16} />
            {justFlagged} order{justFlagged === 1 ? "" : "s"} flagged for review.
          </div>
        )}

        {/* ── Order stat strip ── */}
        <div className="mt-9 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={<ShoppingBag size={15} />} label="Visible orders" value={visibleOrders.length} />
          <StatCard icon={<Activity size={15} />} label="Delayed" value={delayedCount} tone={delayedCount > 0 ? "warning" : "default"} />
          <StatCard icon={<Clock size={15} />} label="Over SLA" value={breachCount} tone={breachCount > 0 ? "warning" : "default"} />
          <StatCard icon={<Flag size={15} />} label="Manual quotes in flight" value={manualQuoteCount} />
        </div>

        {/* ── Bulk action — the one widget that actually does something
             rather than just reporting a number. ── */}
        {unflaggedBreaches.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold/30 bg-gold/[0.06] px-5 py-3.5">
            <p className="text-sm text-gold-deep">
              <span className="font-semibold">{unflaggedBreaches.length}</span> order{unflaggedBreaches.length === 1 ? " is" : "s are"} over its stage SLA and not yet flagged.
            </p>
            <button
              type="button"
              onClick={handleFlagBreaches}
              className="rounded-xl bg-gold-deep px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              Flag {unflaggedBreaches.length} for review
            </button>
          </div>
        )}

        {/* ── Purchasing snapshot ── */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <QueueCard
            icon={<ShoppingBag size={20} strokeWidth={1.75} />}
            label="Needs purchase"
            description="Ordered items still waiting to be bought from a seller."
            count={needsPurchase}
            countLabel="items"
            onOpen={() => router.push("/admin/purchases")}
          />
          <QueueCard
            icon={<PackageCheck size={20} strokeWidth={1.75} />}
            label="Purchased"
            description="Bought and either in transit to a site or already there."
            count={purchased}
            countLabel="items"
            onOpen={() => router.push("/admin/purchases")}
          />
          <QueueCard
            icon={<Flag size={20} strokeWidth={1.75} />}
            label="Unavailable"
            description="Flagged by ops — needs a customer follow-up or a substitute."
            count={unavailable}
            countLabel="items"
            onOpen={() => router.push("/admin/purchases")}
          />
        </div>

        {/* ── Warehouse across every site — this is exactly the
             cross-site visibility Sales doesn't need. ── */}
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-ink/70">Warehouse, all sites</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <QueueCard
              icon={<ClipboardCheck size={20} strokeWidth={1.75} />}
              label="Quality check"
              description="Items arrived on-site, waiting on inspection."
              count={qcPending}
              countLabel="pending"
              flagCount={qcFlagged}
              flagLabel="flagged"
              onOpen={() => router.push("/admin/qc")}
            />
            <QueueCard
              icon={<PackageCheck size={20} strokeWidth={1.75} />}
              label="Pack & label"
              description="Passed QC, waiting to be boxed and labeled."
              count={packAwaiting}
              countLabel="awaiting pack"
              onOpen={() => router.push("/admin/pack-label")}
            />
            <QueueCard
              icon={<Archive size={20} strokeWidth={1.75} />}
              label="Export bin"
              description="Packed and labeled, staged for courier pickup."
              count={exportBinCount}
              countLabel="in bin"
              onOpen={() => router.push("/admin/export-bin")}
            />
            <QueueCard
              icon={<Truck size={20} strokeWidth={1.75} />}
              label="In transit"
              description="Handed off to a courier, en route to the customer."
              count={inTransitCount}
              countLabel="en route"
              flagCount={inTransitOverdue}
              flagLabel="overdue"
              onOpen={() => router.push("/admin/in-transit")}
            />
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* ── Pipeline breakdown ── */}
          <div className={`overflow-hidden lg:col-span-2 ${panelClass}`}>
            <div className="border-b border-ink/10 px-5 py-3.5">
              <h2 className="text-sm font-semibold text-ink/70">Pipeline breakdown</h2>
            </div>
            <div className="space-y-3 px-5 py-4">
              {stageBreakdown.map(({ stage, count }) => (
                <div key={stage} className="flex items-center gap-3">
                  <span className="w-28 flex-none text-xs font-medium text-ink/60">{stage}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink/[0.06]">
                    <div
                      className="h-full rounded-full bg-teal-deep/70"
                      style={{ width: `${(count / maxStageCount) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 flex-none text-right text-xs font-semibold text-ink/70">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Needs attention ── */}
          <div className={`overflow-hidden ${panelClass}`}>
            <div className="flex items-center justify-between border-b border-ink/10 px-5 py-3.5">
              <h2 className="text-sm font-semibold text-ink/70">Needs attention</h2>
              <span className="text-xs text-ink/40">{attention.length}</span>
            </div>
            <div className="max-h-[420px] overflow-y-auto px-4">
              <AttentionList items={attention} emptyLabel="Nothing delayed, unavailable, or over SLA right now." />
            </div>
          </div>
        </div>

        {/* ── Per-site breakdown ── */}
        <div className={`mt-6 overflow-hidden ${panelClass}`}>
          <div className="border-b border-ink/10 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-ink/70">By site</h2>
          </div>
          <div className="divide-y divide-ink/[0.06]">
            {siteBreakdown.map(({ site, total, delayed, breached }) => (
              <div key={site.id} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <p className="text-sm font-semibold text-ink">{site.name}</p>
                  <p className="text-xs text-ink/45">{site.location}</p>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-ink/60">{total} orders</span>
                  {delayed > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
                      {delayed} delayed
                    </span>
                  )}
                  {breached > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/15 px-2.5 py-1 text-xs font-semibold text-gold-deep ring-1 ring-inset ring-gold/30">
                      {breached} over SLA
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}