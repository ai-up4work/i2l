// app/admin/(manager)/reports/[siteId]/page.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Clock,
  MapPin,
  PackageCheck,
  Truck,
  Users,
} from "lucide-react"

import { useAdminData } from "@/contexts/AdminDataContext"
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
//
// RESTYLE (2026-09): brought in line with the /admin/reports parent
// page's v2 language — icon header, colored summary-card tones using
// the same QC/SLA thresholds, a delayed-orders banner instead of a bare
// number, and the staff block as individual cards instead of a
// comma-joined name string that just wraps into an unreadable line once
// a site has more than two or three people assigned.
//
// THRESHOLDS: mirrored from /admin/reports/page.tsx rather than
// imported, since they're local consts there, not exported from
// lib/admin/reports.ts. If they ever drift, that's a sign they should
// move into lib/admin/reports.ts as shared constants — flagging here
// rather than silently duplicating forever.
const QC_GOOD_THRESHOLD = 95
const QC_WARN_THRESHOLD = 85
const SLA_GOOD_THRESHOLD = 90
const SLA_WARN_THRESHOLD = 75

const NEUTRAL_PILL_TONE = "bg-ink/[0.04] text-ink/45 ring-1 ring-inset ring-ink/10"

function pillTone(value: number | null, goodAbove: number, warnAbove: number): string {
  if (value === null) return NEUTRAL_PILL_TONE
  if (value >= goodAbove) return "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200"
  if (value >= warnAbove) return "bg-gold/15 text-gold-deep ring-1 ring-inset ring-gold/30"
  return "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200"
}

function summaryTone(value: number | null, goodAbove: number, warnAbove: number): "positive" | "default" | "warning" {
  if (value === null) return "default"
  if (value >= goodAbove) return "positive"
  if (value >= warnAbove) return "default"
  return "warning"
}

const DATE_RANGE_OPTIONS: DateRangeOption[] = ["7d", "30d", "90d", "all"]

export default function SiteReportPage() {
  const router = useRouter()
  const params = useParams<{ siteId: string }>()
  const { role, currentUser, orders, purchases, sites, staffDirectory } = useAdminData()
  const [range, setRange] = useState<DateRangeOption>("30d")

  useEffect(() => {
    // Effective `role`, super_admin let through unconditionally — same
    // fix as manager-dashboard/page.tsx and reports/page.tsx.
    if (role !== "manager" && role !== "super_admin") router.replace("/admin/dashboard")
  }, [role, router])

  const site = sites.find((s) => s.id === params.siteId)
  const siteId = params.siteId

  const ageTrend = useMemo(() => computeOrderAgeTrend(orders, range, siteId), [orders, range, siteId])
  const qcTrend = useMemo(() => computeQcPassRateTrend(purchases, orders, range, siteId), [purchases, orders, range, siteId])
  const slaTrend = useMemo(() => computeShippingSlaTrend(orders, range, siteId), [orders, range, siteId])

  const delayedOrders = useMemo(
    () => orders.filter((o) => o.siteId === siteId && o.delayed),
    [orders, siteId]
  )
  const assignedStaff = useMemo(
    () => staffDirectory.filter((s) => s.role === "warehouse" && s.siteId === siteId),
    [staffDirectory, siteId]
  )

  if (role !== "manager" && role !== "super_admin") return null

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
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      <div className="mx-auto max-w-[1560px] px-6 pb-20 pt-10 lg:px-10">
        <button
          type="button"
          onClick={() => router.push("/admin/reports")}
          className="flex items-center gap-1.5 text-sm font-medium text-ink/50 hover:text-ink"
        >
          <ArrowLeft size={14} /> Reports
        </button>

        {/* ── Header ── */}
        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 flex-none place-items-center rounded-2xl border border-ink/10 bg-card text-teal-deep shadow-[0_1px_2px_rgba(32,36,43,0.04),0_16px_40px_-24px_rgba(14,140,156,0.4)]">
              <MapPin size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-display text-3xl text-ink">{site.name}</h1>
              <p className="mt-1.5 text-sm text-ink/55">{site.location}</p>
            </div>
          </div>

          {/* Assigned staff — cards instead of a comma-joined name string */}
          <div className="rounded-2xl border border-ink/10 bg-card px-4 py-3.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink/40">
              <Users size={13} /> Warehouse staff
            </div>
            {assignedStaff.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {assignedStaff.map((s) => (
                  <span
                    key={s.id}
                    className="inline-flex items-center gap-1.5 rounded-full bg-ink/[0.04] py-1 pl-1 pr-2.5 text-xs font-medium text-ink/70 ring-1 ring-inset ring-ink/10"
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-deep/15 text-[10px] font-bold text-teal-deep">
                      {s.name.charAt(0)}
                    </span>
                    {s.name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-1.5 text-sm text-ink/45">No warehouse staff assigned to this site.</p>
            )}
          </div>
        </div>

        {/* ── Delayed-orders banner — only when there's actually something to flag ── */}
        {delayedOrders.length > 0 && (
          <button
            type="button"
            onClick={() => router.push("/admin/orders")}
            className="mt-6 flex w-full items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50/60 px-5 py-4 text-left transition-colors hover:bg-rose-50"
          >
            <AlertTriangle size={18} className="flex-none text-rose-600" />
            <span className="min-w-0 flex-1 text-sm text-rose-800">
              <span className="font-semibold">{delayedOrders.length} delayed order{delayedOrders.length === 1 ? "" : "s"}</span>{" "}
              at this site right now — worth a look.
            </span>
            <ChevronRight size={16} className="flex-none text-rose-400" />
          </button>
        )}

        {/* ── Filters — date range only, site is pre-scoped by the route ── */}
        <div className="mt-6 flex flex-wrap gap-1 rounded-full border border-ink/10 bg-card p-1 sm:inline-flex">
          {DATE_RANGE_OPTIONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal ${
                range === r
                  ? "bg-teal-deep text-parchment shadow-[0_6px_18px_-8px_rgba(14,140,156,0.5)]"
                  : "text-ink/55 hover:text-ink/80"
              }`}
            >
              {DATE_RANGE_LABEL[r]}
            </button>
          ))}
        </div>

        {/* ── Summary strip — same metric set as the parent page, tone-colored ── */}
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
            tone={summaryTone(qcTrend.overallPassRate, QC_GOOD_THRESHOLD, QC_WARN_THRESHOLD)}
          />
          <SummaryCard
            icon={<Truck size={14} />}
            label="Shipping SLA hit rate"
            value={formatPercent(slaTrend.overallHitRate)}
            hint={`${slaTrend.totalHit + slaTrend.totalMiss} delivered`}
            tone={summaryTone(slaTrend.overallHitRate, SLA_GOOD_THRESHOLD, SLA_WARN_THRESHOLD)}
          />
          <SummaryCard
            icon={<AlertTriangle size={14} />}
            label="Delayed now"
            value={String(delayedOrders.length)}
            tone={delayedOrders.length > 0 ? "warning" : "default"}
          />
        </div>

        {/* Quick-read pills echoing the parent page's per-site row, so this
            page and that row never look like they're speaking a different
            visual language about the same two numbers. */}
        <div className="mt-3 flex flex-wrap gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${pillTone(qcTrend.overallPassRate, QC_GOOD_THRESHOLD, QC_WARN_THRESHOLD)}`}>
            QC {formatPercent(qcTrend.overallPassRate)}
          </span>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${pillTone(slaTrend.overallHitRate, SLA_GOOD_THRESHOLD, SLA_WARN_THRESHOLD)}`}>
            SLA {formatPercent(slaTrend.overallHitRate)}
          </span>
        </div>

        {/* ── Trend charts — identical shape to the parent page, scoped data ── */}
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-ink/10 bg-card px-5 py-5">
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
          <div className="rounded-2xl border border-ink/10 bg-card px-5 py-5">
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
          <div className="rounded-2xl border border-ink/10 bg-card px-5 py-5">
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
    </div>
  )
}