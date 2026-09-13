// app/admin/(manager)/reports/page.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Clock,
  PackageCheck,
  Truck,
} from "lucide-react"

import { useAdminData } from "@/contexts/AdminDataContext"
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
// manager-dashboard's real-time operational rollup. Manager only.
//
// RESTYLE (2026-09): card language matching /admin/orders and
// /admin/requests — left-edge accent per row, pill metrics instead of a
// six-column table that hid on mobile. Sites sort "needs attention
// first" by default; a banner surfaces above the fold when the
// all-sites view has a real problem; the summary strip colors the
// QC/SLA cards using the same thresholds as the per-site pills.
//
// NULL-SAFETY NOTE: qcPassRate, shippingSlaHitRate, avgFulfillmentHours
// (SiteSummary) and overallPassRate/overallHitRate (the trend results)
// are all `number | null` in lib/admin/reports.ts — null means "no
// resolved QC verdicts / no completed deliveries yet in this range,"
// which is different from 0%. Every comparison/color/sort below treats
// null explicitly rather than letting it silently coerce (null < 85 is
// true in JS, which would wrongly paint a brand-new site "critical").

const DATE_RANGE_OPTIONS: DateRangeOption[] = ["7d", "30d", "90d", "all"]

type SiteSort = "attention" | "name"

// Thresholds shared between the top summary strip's tone and the
// per-site pill colors, so "green at the top" and "green per row" never
// disagree about what counts as healthy.
const QC_GOOD_THRESHOLD = 95
const QC_WARN_THRESHOLD = 85
const SLA_GOOD_THRESHOLD = 90
const SLA_WARN_THRESHOLD = 75

/** Neutral gray for "no data yet" — distinct from the rose "bad" tone, since null isn't a failure. */
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

export default function ReportsPage() {
  const router = useRouter()
  const { currentUser, orders, purchases, sites } = useAdminData()
  const [range, setRange] = useState<DateRangeOption>("30d")
  const [siteFilter, setSiteFilter] = useState<string>("all")
  const [siteSort, setSiteSort] = useState<SiteSort>("attention")

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

  const sortedSites = useMemo(() => {
    const rows = [...siteSummaries]
    if (siteSort === "name") {
      return rows.sort((a, b) => a.siteName.localeCompare(b.siteName))
    }
    // "Needs attention first": worst delayed count first. Tiebreak on QC
    // pass rate, treating null (no verdicts yet) as a neutral 100 rather
    // than 0 — a site with no data isn't "worse" than one with a known
    // bad rate, it's just unproven, so it shouldn't jump ahead of actual
    // problems in this sort.
    return rows.sort((a, b) => {
      if (b.delayedCount !== a.delayedCount) return b.delayedCount - a.delayedCount
      const aQc = a.qcPassRate ?? 100
      const bQc = b.qcPassRate ?? 100
      return aQc - bQc
    })
  }, [siteSummaries, siteSort])

  const worstSite = sortedSites[0]
  const showAttentionBanner = siteFilter === "all" && worstSite !== undefined && worstSite.delayedCount > 0

  if (currentUser.role !== "manager") return null

  return (
    <div className="min-h-screen bg-parchment font-body text-ink">
      <div className="mx-auto max-w-[1560px] px-6 pb-20 pt-10 lg:px-10">
        {/* ── Header ── */}
        <div className="flex items-start gap-4">
          <div className="grid h-14 w-14 flex-none place-items-center rounded-2xl border border-ink/10 bg-card text-teal-deep shadow-[0_1px_2px_rgba(32,36,43,0.04),0_16px_40px_-24px_rgba(14,140,156,0.4)]">
            <BarChart3 size={22} strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="font-display text-3xl text-ink">Reports</h1>
            <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-ink/60">
              Order age, QC pass rate, and shipping SLA trends across every site — for spotting a
              drift before it shows up as a customer complaint, not for today&rsquo;s live queue.
            </p>
          </div>
        </div>

        {/* ── Attention banner — only when the all-sites view actually has a problem ── */}
        {showAttentionBanner && worstSite && (
          <button
            type="button"
            onClick={() => router.push(`/admin/reports/${worstSite.siteId}`)}
            className="mt-6 flex w-full items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50/60 px-5 py-4 text-left transition-colors hover:bg-rose-50"
          >
            <AlertTriangle size={18} className="flex-none text-rose-600" />
            <span className="min-w-0 flex-1 text-sm text-rose-800">
              <span className="font-semibold">{worstSite.siteName}</span> has {worstSite.delayedCount} delayed order
              {worstSite.delayedCount === 1 ? "" : "s"} right now
              {worstSite.qcPassRate !== null && worstSite.qcPassRate < QC_WARN_THRESHOLD && (
                <> and a QC pass rate of only {formatPercent(worstSite.qcPassRate)}</>
              )}{" "}
              — worth a look.
            </span>
            <ChevronRight size={16} className="flex-none text-rose-400" />
          </button>
        )}

        {/* ── Filters ── */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1 rounded-full border border-ink/10 bg-card p-1">
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

          <select
            value={siteFilter}
            onChange={(e) => setSiteFilter(e.target.value)}
            className="rounded-lg border border-ink/10 bg-card px-3 py-2 text-sm text-ink outline-none focus:border-teal/50 focus:ring-2 focus:ring-teal/15"
          >
            <option value="all">All sites</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* ── Summary strip ── */}
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
            value={String(delayedCount)}
            tone={delayedCount > 0 ? "warning" : "default"}
          />
        </div>

        {/* ── Trend charts ── */}
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
              emptyLabel="No orders delivered in this range yet."
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
              emptyLabel="No QC verdicts recorded in this range yet."
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
              emptyLabel="No deliveries completed in this range yet."
            />
          </div>
        </div>

        {/* ── Per-site breakdown ── */}
        <div className="mt-6 flex items-center justify-between">
          <h2 className="font-display text-lg text-ink">By site</h2>
          <div className="flex gap-1 rounded-full border border-ink/10 bg-card p-1">
            {(
              [
                { key: "attention", label: "Needs attention" },
                { key: "name", label: "Name" },
              ] as { key: SiteSort; label: string }[]
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setSiteSort(opt.key)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  siteSort === opt.key ? "bg-ink text-white" : "text-ink/50 hover:text-ink/80"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 space-y-3">
          {sortedSites.map((s) => {
            const accent =
              s.delayedCount > 0
                ? "border-l-rose-500"
                : s.qcPassRate !== null && s.qcPassRate < QC_WARN_THRESHOLD
                ? "border-l-gold-deep"
                : "border-l-teal-deep"

            return (
              <div
                key={s.siteId}
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/admin/reports/${s.siteId}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") router.push(`/admin/reports/${s.siteId}`)
                }}
                className={`flex cursor-pointer flex-col gap-3 rounded-2xl border border-ink/10 border-l-4 bg-card p-4 outline-none transition-colors hover:border-ink/20 focus-visible:bg-teal/[0.06] sm:flex-row sm:items-center sm:justify-between ${accent}`}
              >
                <div>
                  <p className="font-display text-sm font-semibold text-ink">{s.siteName}</p>
                  <p className="mt-0.5 text-xs text-ink/45">
                    {s.openOrderCount} open · avg fulfillment {formatHours(s.avgFulfillmentHours)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {s.delayedCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
                      <AlertTriangle size={11} /> {s.delayedCount} delayed
                    </span>
                  )}
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${pillTone(s.qcPassRate, QC_GOOD_THRESHOLD, QC_WARN_THRESHOLD)}`}>
                    QC {formatPercent(s.qcPassRate)}
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${pillTone(s.shippingSlaHitRate, SLA_GOOD_THRESHOLD, SLA_WARN_THRESHOLD)}`}>
                    SLA {formatPercent(s.shippingSlaHitRate)}
                  </span>
                  <ChevronRight size={16} className="hidden text-ink/25 sm:block" />
                </div>
              </div>
            )
          })}

          {sortedSites.length === 0 && (
            <div className="rounded-2xl border border-dashed border-ink/15 bg-card px-4 py-12 text-center text-sm text-ink/45">
              No site data for this range yet.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}