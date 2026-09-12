// app/admin/(manager)/reports/page.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, CheckCircle2, Clock, PackageCheck, Truck } from "lucide-react"

import { useAdminData } from "@/contexts/AdminDataContext"
import { panelClass } from "@/components/admin/seller/shared"
import { SummaryCard, TrendBarChart } from "@/components/admin/reports/shared"
import {
  DATE_RANGE_LABEL,
  computeOrderAgeTrend,
  computeQcPassRateTrend,
  computeShippingSlaTrend,
  computeSiteSummaries,
  formatHours,
  formatPercent,
  type DateRangeOption,
} from "@/lib/admin/reports"

// Historical/analytical reporting across all sites — distinct from
// manager-dashboard's real-time operational rollup, and from a future
// Super Admin business-oversight view. Manager only. A non-Manager
// visitor bounces back through the role-based redirector, same pattern
// as the Sales dashboard and Scrape health pages.

const DATE_RANGE_OPTIONS: DateRangeOption[] = ["7d", "30d", "90d", "all"]

export default function ReportsPage() {
  const router = useRouter()
  const { currentUser, orders, purchases, sites } = useAdminData()
  const [range, setRange] = useState<DateRangeOption>("30d")
  const [siteFilter, setSiteFilter] = useState<string>("all")

  useEffect(() => {
    if (currentUser.role !== "manager") router.replace("/admin/dashboard")
  }, [currentUser.role, router])

  const ageTrend = useMemo(() => computeOrderAgeTrend(orders, range, siteFilter), [orders, range, siteFilter])
  const qcTrend = useMemo(() => computeQcPassRateTrend(purchases, orders, range, siteFilter), [purchases, orders, range, siteFilter])
  const slaTrend = useMemo(() => computeShippingSlaTrend(orders, range, siteFilter), [orders, range, siteFilter])
  const siteSummaries = useMemo(() => computeSiteSummaries(orders, purchases, sites, range), [orders, purchases, sites, range])

  const delayedCount = useMemo(
    () => orders.filter((o) => (siteFilter === "all" || o.siteId === siteFilter) && o.delayed).length,
    [orders, siteFilter]
  )

  if (currentUser.role !== "manager") return null

  return (
    <div className="mx-auto max-w-6xl px-6 pb-20 pt-8 lg:px-10">
      <header>
        <h1 className="font-display text-3xl text-ink">Reports</h1>
        <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink/60">
          Order age, QC pass rate, and shipping SLA trends across every site — for spotting a
          drift before it shows up as a customer complaint, not for today's live queue.
        </p>
      </header>

      {/* Filters */}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
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

        <select
          value={siteFilter}
          onChange={(e) => setSiteFilter(e.target.value)}
          className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal/50"
        >
          <option value="all">All sites</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* Summary strip */}
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
          icon={<AlertTriangle size={14} />}
          label="Delayed now"
          value={String(delayedCount)}
          tone={delayedCount > 0 ? "warning" : "default"}
        />
      </div>

      {/* Trend charts */}
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
            emptyLabel="No orders delivered in this range yet."
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
            emptyLabel="No QC verdicts recorded in this range yet."
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
            emptyLabel="No deliveries completed in this range yet."
          />
        </div>
      </div>

      {/* Per-site breakdown */}
      <div className={`mt-6 overflow-hidden ${panelClass}`}>
        <div className="border-b border-ink/10 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-ink/70">By site</h2>
        </div>
        <div className="hidden grid-cols-[1.2fr_0.8fr_0.8fr_1fr_0.9fr_0.9fr] gap-2 border-b border-ink/10 px-5 py-2.5 text-xs font-semibold text-ink/45 sm:grid">
          <span>Site</span>
          <span className="text-right">Open</span>
          <span className="text-right">Delayed</span>
          <span className="text-right">Avg fulfillment</span>
          <span className="text-right">QC pass</span>
          <span className="text-right">SLA hit</span>
        </div>
        {siteSummaries.map((s) => (
          <button
            key={s.siteId}
            type="button"
            onClick={() => router.push(`/admin/reports/${s.siteId}`)}
            className="grid w-full grid-cols-2 items-center gap-2 border-b border-ink/10 px-5 py-3 text-left transition-colors last:border-b-0 hover:bg-parchment/60 sm:grid-cols-[1.2fr_0.8fr_0.8fr_1fr_0.9fr_0.9fr]"
          >
            <span className="col-span-2 text-sm font-semibold text-ink sm:col-span-1">{s.siteName}</span>
            <span className="hidden text-right text-sm text-ink/70 sm:block">{s.openOrderCount}</span>
            <span className={`hidden text-right text-sm sm:block ${s.delayedCount > 0 ? "font-semibold text-red-700" : "text-ink/50"}`}>
              {s.delayedCount}
            </span>
            <span className="hidden text-right text-sm text-ink/70 sm:block">{formatHours(s.avgFulfillmentHours)}</span>
            <span className="hidden text-right text-sm text-ink/70 sm:block">{formatPercent(s.qcPassRate)}</span>
            <span className="hidden text-right text-sm text-ink/70 sm:block">{formatPercent(s.shippingSlaHitRate)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}