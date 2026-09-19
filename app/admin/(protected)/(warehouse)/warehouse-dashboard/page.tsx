// app/admin/(protected)/(warehouse)/warehouse-dashboard/page.tsx
//
// NOTE ON LOCATION: this file must live INSIDE app/admin/(protected)/
// on disk — route groups only share a layout when physically nested,
// not just co-located under app/admin/. If (warehouse) sits as a
// SIBLING of (protected) instead of nested inside it, this page never
// actually receives AdminDataProvider/the sidebar from
// (protected)/layout.tsx, and whatever DOES render at this URL is
// coming from a different page.tsx entirely (a stray/duplicate stub),
// not this file. Run `find app/admin -iname "page.tsx"` if this page
// still doesn't show up after moving it here.
"use client"

import { useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Activity, Archive, Boxes, ClipboardCheck, Clock, Flag, PackageCheck, PartyPopper, Truck } from "lucide-react"

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
    role,
    currentUser,
    sites,
    visibleOrders,
    visibleQcLines,
    visiblePackLines,
    visibleExportBinLines,
    visibleInTransitLines,
    dataLoading,
  } = useAdminData()

  useEffect(() => {
    // Effective `role` (previewRole-aware), not currentUser.role — see
    // the same fix/comment on manager-dashboard/page.tsx and
    // sales-dashboard/page.tsx. This is what makes a super_admin
    // previewing a DIFFERENT role get bounced away from this page.
    if (role !== "warehouse") router.replace("/admin/dashboard")
  }, [role, router])

  // DEFENSIVE: every one of these should always be a real array per
  // AdminDataContext's types, never undefined — but a `?? []` here
  // costs nothing and means a transient/unexpected undefined during a
  // fast refresh or a provider race produces "0 of everything" instead
  // of throwing and silently blanking the whole page. If you ever see
  // these fallbacks actually engage (e.g. by temporarily logging when
  // the raw value is undefined), that's a real upstream bug in the
  // context worth fixing at the source, not papering over here.
  const orders = visibleOrders ?? []
  const qcLines = visibleQcLines ?? []
  const packLines = visiblePackLines ?? []
  const exportBinLines = visibleExportBinLines ?? []
  const inTransitLines = visibleInTransitLines ?? []

  const siteName = sites?.find((s) => s.id === currentUser?.siteId)?.name ?? "your site"

  const qcPending = qcLines.filter((l) => l.status === "pending").length
  const qcFlagged = qcLines.filter((l) => l.status === "flagged").length
  const packAwaiting = packLines.filter((l) => l.status === "awaiting_pack").length
  const exportBinCount = exportBinLines.length
  const inTransitCount = inTransitLines.length
  const inTransitOverdue = inTransitLines.filter((l) => l.deliveryStatus === "overdue").length
  const deliveredCount = orders.filter((o) => o.stage === "Delivered").length
  const breachedOrders = orders.filter((o) => isOverThreshold(o.stage, hoursSince(o.stageEnteredAt))).length
  const delayedOrders = orders.filter((o) => o.delayed).length

  const attention = useMemo<AttentionItem[]>(() => {
    const items: AttentionItem[] = []

    for (const l of qcLines.filter((l) => l.status === "flagged")) {
      items.push({
        key: `qc-${l.id}`,
        title: l.productTitle,
        subtitle: `${l.orderNumber} · ${l.customerName}`,
        meta: "QC flagged",
        href: `/admin/qc/${l.id}`,
        tone: "rose",
      })
    }
    for (const l of inTransitLines.filter((l) => l.deliveryStatus === "overdue")) {
      items.push({
        key: `transit-${l.id}`,
        title: l.orderNumber,
        subtitle: `${l.destination} · ${l.courier}`,
        meta: `${formatAge(Math.abs(l.etaRemainingHours))} overdue`,
        href: `/admin/orders/${l.orderId}`,
        tone: "rose",
      })
    }
    for (const o of orders.filter((o) => isOverThreshold(o.stage, hoursSince(o.stageEnteredAt)))) {
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
  }, [qcLines, inTransitLines, orders])

  // Guard comes AFTER every hook above so hook call order never changes
  // between renders. This checks the SAME `role` the effect above
  // checks (previewRole-aware), not currentUser.role — the two must
  // agree, or a super_admin previewing "Warehouse" hits a contradiction:
  // the effect sees role === "warehouse" and lets them stay, while a
  // currentUser.role-based guard sees their REAL role (still
  // super_admin) and blocks the render anyway, showing the "only
  // available to Warehouse" message even though preview is active.
  // That was a real bug — checking currentUser.role here entirely
  // defeated the point of preview mode. Since `role` already collapses
  // to `previewRole ?? currentUser.role` for a super_admin (see
  // AdminDataContext), using it here means: a real warehouse user
  // always sees this page, and a super_admin sees it exactly when
  // they've chosen to preview Warehouse — nothing more, nothing less.
  //
  // VISIBLE fallback instead of `return null`: a bare `null` here is
  // indistinguishable, at a glance, from the earlier "silent blank
  // page" bug — if this guard is ever hit unexpectedly (e.g. currentUser
  // hasn't finished resolving yet on a hard refresh), you get a visible,
  // boring status line instead of blank parchment, which makes "is this
  // the guard, or a real crash?" answerable on sight.
  if (!currentUser || role !== "warehouse") {
    return (
      <div className="flex h-full items-center justify-center bg-parchment font-body text-sm text-ink/40">
        {currentUser ? "This dashboard is only available to the Warehouse role." : "Loading your account…"}
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      <div className="mx-auto max-w-[1560px] px-6 pb-24 pt-10 lg:px-10">
        {/* ── Header ── */}
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-teal-deep text-parchment">
              <Boxes size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-display text-3xl font-semibold leading-tight">
                Good to see you, {currentUser.name.split(" ")[0]}
              </h1>
              <p className="mt-1 max-w-md text-sm leading-relaxed text-ink/60">
                Here&rsquo;s what&rsquo;s moving through {siteName} right now.
              </p>
            </div>
          </div>
        </div>

        {dataLoading ? (
          <p className="mt-9 text-sm text-ink/40">Loading warehouse data…</p>
        ) : (
          <>
            {/* ── Stat strip ── */}
            <div className="mt-9 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard icon={<ClipboardCheck size={15} />} label="Needs inspection" value={qcPending} />
              <StatCard icon={<Flag size={15} />} label="QC flagged" value={qcFlagged} tone={qcFlagged > 0 ? "warning" : "default"} />
              <StatCard icon={<Clock size={15} />} label="Over SLA" value={breachedOrders} tone={breachedOrders > 0 ? "warning" : "default"} />
              <StatCard icon={<Activity size={15} />} label="Delayed" value={delayedOrders} tone={delayedOrders > 0 ? "warning" : "default"} />
            </div>

            {/* ── Queue cards ── */}
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
              <QueueCard
                icon={<PartyPopper size={20} strokeWidth={1.75} />}
                label="Delivered"
                description="Confirmed delivered — by warehouse or by the customer."
                count={deliveredCount}
                countLabel="delivered"
                onOpen={() => router.push("/admin/delivered")}
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
          </>
        )}
      </div>
    </div>
  )
}