// app/admin/(warehouse)/warehouse-dashboard/page.tsx
"use client"

import { useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Activity, Archive, Boxes, ClipboardCheck, Clock, Flag, PackageCheck, Truck } from "lucide-react"

import { useAdminData, hoursSince, formatAge } from "@/contexts/AdminDataContext"
import { panelClass } from "@/components/admin/seller/shared"
import {
  AttentionList,
  QueueCard,
  StatCard,
  isOverThreshold,
  type AttentionItem,
} from "@/components/admin/dashboard/shared"

// Warehouse dashboard — operational, scoped to the logged-in Warehouse
// user's own site (same scoping every other warehouse queue page uses):
// what's sitting in each queue right now, and what needs eyes on it
// today. A direct visit by a non-Warehouse role bounces back through
// the role-based redirector at /admin/dashboard rather than showing
// this page's site-scoped data to someone it doesn't belong to.

export default function WarehouseDashboardPage() {
  const router = useRouter()
  const {
    currentUser,
    sites,
    visibleOrders,
    visibleQcLines,
    visiblePackLines,
    visibleExportBinLines,
    visibleInTransitLines,
  } = useAdminData()

  useEffect(() => {
    if (currentUser.role !== "warehouse") router.replace("/admin/dashboard")
  }, [currentUser.role, router])

  const siteName = sites.find((s) => s.id === currentUser.siteId)?.name ?? "your site"

  const qcPending = visibleQcLines.filter((l) => l.status === "pending").length
  const qcFlagged = visibleQcLines.filter((l) => l.status === "flagged").length
  const packAwaiting = visiblePackLines.filter((l) => l.status === "awaiting_pack").length
  const exportBinCount = visibleExportBinLines.length
  const inTransitCount = visibleInTransitLines.length
  const inTransitOverdue = visibleInTransitLines.filter((l) => l.deliveryStatus === "overdue").length
  const breachedOrders = visibleOrders.filter((o) => isOverThreshold(o.stage, hoursSince(o.stageEnteredAt))).length
  const delayedOrders = visibleOrders.filter((o) => o.delayed).length

  const attention = useMemo<AttentionItem[]>(() => {
    const items: AttentionItem[] = []

    for (const l of visibleQcLines.filter((l) => l.status === "flagged")) {
      items.push({
        key: `qc-${l.id}`,
        title: l.productTitle,
        subtitle: `${l.orderNumber} · ${l.customerName}`,
        meta: "QC flagged",
        href: `/admin/qc/${l.id}`,
        tone: "rose",
      })
    }
    for (const l of visibleInTransitLines.filter((l) => l.deliveryStatus === "overdue")) {
      items.push({
        key: `transit-${l.id}`,
        title: l.orderNumber,
        subtitle: `${l.destination} · ${l.courier}`,
        meta: `${formatAge(Math.abs(l.etaRemainingHours))} overdue`,
        href: `/admin/orders/${l.orderId}`,
        tone: "rose",
      })
    }
    for (const o of visibleOrders.filter((o) => isOverThreshold(o.stage, hoursSince(o.stageEnteredAt)))) {
      items.push({
        key: `order-${o.id}`,
        title: o.id,
        subtitle: `${o.customerName} · ${o.stage}`,
        meta: `${formatAge(hoursSince(o.stageEnteredAt))} in stage`,
        href: `/admin/orders/${o.id}`,
        tone: "amber",
      })
    }
    return items.slice(0, 8)
  }, [visibleQcLines, visibleInTransitLines, visibleOrders])

  // Guard comes AFTER every hook above so hook call order never changes
  // between renders, even as currentUser.role flips via the role switcher.
  if (currentUser.role !== "warehouse") return null

  return (
    <div className="min-h-screen bg-parchment font-body text-ink">
      <div className="mx-auto max-w-[1560px] px-6 pb-24 pt-10 lg:px-10">
        {/* ── Header ── */}
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 flex-none place-items-center rounded-2xl border border-ink/10 bg-card text-teal-deep shadow-[0_1px_2px_rgba(32,36,43,0.04),0_16px_40px_-24px_rgba(14,140,156,0.4)]">
              <Boxes size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-display text-3xl text-ink">Good to see you, {currentUser.name.split(" ")[0]}</h1>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink/60">
                Here&rsquo;s what&rsquo;s moving through {siteName} right now.
              </p>
            </div>
          </div>
        </div>

        {/* ── Stat strip ── */}
        <div className="mt-9 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={<ClipboardCheck size={15} />} label="Needs inspection" value={qcPending} />
          <StatCard icon={<Flag size={15} />} label="QC flagged" value={qcFlagged} tone={qcFlagged > 0 ? "warning" : "default"} />
          <StatCard icon={<Clock size={15} />} label="Over SLA" value={breachedOrders} tone={breachedOrders > 0 ? "warning" : "default"} />
          <StatCard icon={<Activity size={15} />} label="Delayed" value={delayedOrders} tone={delayedOrders > 0 ? "warning" : "default"} />
        </div>

        {/* ── Queue cards ── */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

        {/* ── Needs attention ── */}
        <div className={`mt-8 overflow-hidden ${panelClass}`}>
          <div className="flex items-center justify-between border-b border-ink/10 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-ink/70">Needs attention</h2>
            <span className="text-xs text-ink/40">{attention.length} item{attention.length === 1 ? "" : "s"}</span>
          </div>
          <div className="px-4">
            <AttentionList items={attention} emptyLabel="Nothing flagged, overdue, or over SLA right now." />
          </div>
        </div>
      </div>
    </div>
  )
}