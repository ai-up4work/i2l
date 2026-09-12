// app/admin/(manager)/reports/[siteId]/page.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, CheckCircle2, Clock, PackageCheck, Truck, Users } from "lucide-react"

import { useAdminData } from "@/contexts/AdminDataContext"
import { panelClass } from "@/components/admin/seller/shared"
import { SummaryCard, TrendBarChart } from "@/components/admin/reports/shared"
import {
  DATE_RANGE_LABEL,
  computeOrderAgeTrend,
  computeQcPassRateTrend,
  computeShippingSlaTrend,
  formatHours,
  formatPercent,
  type DateRangeOption,
} from "@/lib/admin/reports"

// Same report as /admin/reports, pre-scoped to one site — same metric
// definitions (imported from the same lib/admin/reports functions), so
// numbers here always reconcile with that site's row on the parent
// page. Adds site context the cross-site view has no room for: staff
// headcount and which Warehouse accounts are assigned here.

const DATE_RANGE_OPTIONS: DateRangeOption[] = ["7d", "30d", "90d", "all"]

export default function SiteReportPage() {
  const router = useRouter()
  const params = useParams<{ siteId: string }>()
  const { currentUser, orders, purchases, sites, staffDirectory } = useAdminData()
  const [range, setRange] = useState<DateRangeOption>("30d")

  useEffect(() => {
    if (currentUser.role !== "manager") router.replace("/admin/dashboard")
  }, [currentUser.role, router])

  const site = sites.find((s) => s.id === params.siteId)
  const siteId = params.siteId

  const ageTrend = useMemo(() => computeOrderAgeTrend(orders, range, siteId), [orders, range, siteId])
  const qcTrend = useMemo(() => computeQcPassRateTrend(purchases, orders, range, siteId), [purchases, orders, range, siteId])
  const slaTrend = useMemo(() => computeShippingSlaTrend(orders, range, siteId), [orders, range, siteId])

  const delayedCount = useMemo(
    () => orders.filter((o) => o.siteId === siteId && o.delayed).length,
    [orders, siteId]
  )
  const assignedStaff = useMemo(
    () => staffDirectory.filter((s) => s.role === "warehouse" && s.siteId === siteId),
    [staffDirectory, siteId]
  )

  if (currentUser.role !== "manager") return null

  if (!site) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <p className="text-sm text-ink/50">Site not found.</p>
        <button
          type="button"
          onClick={() => router.push("/admin/reports")}
          className="mt-4 text-sm font-semibold text-teal-deep hover:underline"
        >
          Back to Reports
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-6 pb-20 pt-8 lg:px-10">
      <button
        type="button"
        onClick={() => router.push("/admin/reports")}
        className="flex items-center gap-1.5 text-sm font-medium text-ink/50 hover:text-ink"
      >
        <ArrowLeft size={14} /> Reports
      </button>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-3xl text-ink">{site.name}</h1>
          <p className="mt-1 text-sm text-ink/50">{site.location}</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-ink/10 bg-card px-4 py-3">
          <Users size={16} className="text-ink/40" />
          <div>
            <p className="text-sm font-semibold text-ink">{assignedStaff.length} warehouse staff</p>
            <p className="text-xs text-ink/45">
              {assignedStaff.length > 0 ? assignedStaff.map((s) => s.name).join(", ") : "None assigned"}
            </p>
          </div>
        </div>
      </div>

      {/* Filters — date range only, site is pre-scoped by the route */}
      <div className="mt-8 flex flex-wrap gap-1.5">
        {DATE_RANGE_OPTIONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              range === r ? "bg-ink text-white" : "bg-ink/5 text-ink/60 hover:bg-ink/10"
            }`}
          >
            {DATE_RANGE_LABEL[r]}
          </button>
        ))}
      </div>

      {/* Summary strip — same metric set as the parent page */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <SummaryCard
          icon={<Clock size={14} />}
          label="Avg fulfillment"
          value={formatHours(ageTrend.avgFulfillmentHoursOverall)}
          hint={`${ageTrend.deliveredCountOverall} delivered`}
        />
        <SummaryCard
          icon={<PackageCheck size={14} />}
          label="Open orders"
          value={String(ageTrend.openOrderCount)}
          hint={ageTrend.avgOpenAgeHours !== null ? `avg age ${formatHours(ageTrend.avgOpenAgeHours)}` : undefined}
        />
        <SummaryCard
          icon={<CheckCircle2 size={14} />}
          label="QC pass rate"
          value={formatPercent(qcTrend.overallPassRate)}
          hint={`${qcTrend.totalPassed + qcTrend.totalFlagged} resolved`}
        />
        <SummaryCard
          icon={<Truck size={14} />}
          label="Shipping SLA hit rate"
          value={formatPercent(slaTrend.overallHitRate)}
          hint={`${slaTrend.totalHit + slaTrend.totalMiss} delivered`}
        />
        <SummaryCard
          label="Delayed now"
          value={String(delayedCount)}
          tone={delayedCount > 0 ? "warning" : "default"}
        />
      </div>

      {/* Trend charts — identical shape to the parent page, scoped data */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className={`px-5 py-5 ${panelClass}`}>
          <TrendBarChart
            title="Avg fulfillment time by delivery day"
            points={ageTrend.points.map((p) => ({
              key: p.key,
              label: p.label,
              value: p.avgFulfillmentHours,
              countLabel: `${p.deliveredCount} delivered`,
            }))}
            formatValue={(v) => formatHours(v)}
            emptyLabel="No orders delivered at this site in this range yet."
          />
        </div>
        <div className={`px-5 py-5 ${panelClass}`}>
          <TrendBarChart
            title="QC pass rate by day"
            points={qcTrend.points.map((p) => ({
              key: p.key,
              label: p.label,
              value: p.passRate,
              countLabel: `${p.passedCount} passed / ${p.flaggedCount} flagged`,
            }))}
            formatValue={(v) => `${Math.round(v)}%`}
            emptyLabel="No QC verdicts recorded at this site in this range yet."
          />
        </div>
        <div className={`px-5 py-5 ${panelClass}`}>
          <TrendBarChart
            title="Shipping SLA hit rate by delivery day"
            points={slaTrend.points.map((p) => ({
              key: p.key,
              label: p.label,
              value: p.hitRate,
              countLabel: `${p.hitCount} hit / ${p.missCount} miss`,
            }))}
            formatValue={(v) => `${Math.round(v)}%`}
            emptyLabel="No deliveries completed at this site in this range yet."
          />
        </div>
      </div>
    </div>
  )
}