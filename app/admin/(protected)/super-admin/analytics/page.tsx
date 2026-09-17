// app/admin/(protected)/super-admin/analytics/page.tsx
//
// Real analytics, not a stub — was a 2-line placeholder. Super Admin
// only, org-wide (every site at once, not scoped to one like Manager's
// own Reports page below). Reuses the exact same computation functions
// Reports already uses (lib/admin/reports.ts) rather than a second,
// possibly-drifting copy of "how do we calculate QC pass rate" — the
// two pages differ in WHAT they show (this one adds order value/channel
// mix and a staff snapshot Reports doesn't have) and WHO can see it, not
// in how the underlying numbers get computed.
//
// Every number here is real, derived from orders/purchases/staffDirectory
// already in AdminDataContext — nothing fabricated. Where this app
// genuinely doesn't track something yet (true revenue/margin — orders
// only carry totalValue, the customer-facing price, not cost or profit;
// WhatsApp messaging cost; seller-level performance), this page says so
// plainly instead of inventing a number. Those breakdowns live at their
// own still-locked sidebar entries (see admin-sidebar.tsx) until they're
// real.
"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  BarChart3,
  Boxes,
  Clock,
  DollarSign,
  Link2,
  MessageCircleQuestion,
  PackageCheck,
  ShoppingBag,
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
  computeSiteSummaries,
  formatHours,
  formatPercent,
  type DateRangeOption,
} from "@/lib/admin/reports"
import type { Channel } from "@/types/admin"

const CHANNEL_LABEL: Record<Channel, string> = {
  1: "Catalogue",
  2: "Marketplace link",
  3: "Custom request",
}
const CHANNEL_DESCRIPTION: Record<Channel, string> = {
  1: "Bought straight from WishDrop's own curated catalogue — a fixed SKU and price, no scraping or manual pricing involved.",
  2: "Customer pasted a product link; price came from the scraper at the time of purchase.",
  3: "No usable link or price up front — a Sales & Purchase teammate manually quoted and confirmed this one.",
}

function fmtLKR(n: number): string {
  return `Rs ${Math.round(n).toLocaleString("en-LK")}`
}

/** Small horizontal proportion bar — used for the channel/value
 * breakdown below. Dependency-free, same "no charting library" choice
 * TrendBarChart already made for this app. */
function ShareBar({ label, description, value, total, formatValue }: {
  label: string
  description: string
  value: number
  total: number
  formatValue: (n: number) => string
}) {
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <div className="group relative" title={description}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-semibold text-ink">{label}</span>
        <span className="flex-none text-ink/50">
          {formatValue(value)} <span className="text-ink/35">({Math.round(pct)}%)</span>
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink/[0.06]">
        <div className="h-full rounded-full bg-teal-deep transition-all" style={{ width: `${Math.max(pct, total > 0 && value > 0 ? 2 : 0)}%` }} />
      </div>
    </div>
  )
}

export default function AnalyticsPage() {
  const router = useRouter()
  const { role, orders, purchases, sites, staffDirectory } = useAdminData()
  const [range, setRange] = useState<DateRangeOption>("30d")

  useEffect(() => {
    if (role !== "super_admin") router.replace("/admin/dashboard")
  }, [role, router])

  const rangeStart = useMemo(() => {
    if (range === "all") return null
    const days = range === "7d" ? 7 : range === "30d" ? 30 : 90
    return Date.now() - days * 24 * 3_600_000
  }, [range])

  const ordersInRange = useMemo(
    () => (rangeStart === null ? orders : orders.filter((o) => new Date(o.placedAt).getTime() >= rangeStart)),
    [orders, rangeStart]
  )

  const ageTrend = useMemo(() => computeOrderAgeTrend(orders, range, "all"), [orders, range])
  const qcTrend = useMemo(() => computeQcPassRateTrend(purchases, orders, range, "all"), [purchases, orders, range])
  const slaTrend = useMemo(() => computeShippingSlaTrend(orders, range, "all"), [orders, range])
  const siteSummaries = useMemo(() => computeSiteSummaries(orders, purchases, sites, range), [orders, purchases, sites, range])

  const totalValue = useMemo(() => ordersInRange.reduce((sum, o) => sum + o.totalValue, 0), [ordersInRange])
  const avgOrderValue = ordersInRange.length > 0 ? totalValue / ordersInRange.length : 0
  const delayedNow = useMemo(() => orders.filter((o) => o.delayed).length, [orders])

  const channelBreakdown = useMemo(() => {
    const byChannel: Record<Channel, { count: number; value: number }> = {
      1: { count: 0, value: 0 },
      2: { count: 0, value: 0 },
      3: { count: 0, value: 0 },
    }
    for (const o of ordersInRange) {
      byChannel[o.channel].count += 1
      byChannel[o.channel].value += o.totalValue
    }
    return byChannel
  }, [ordersInRange])

  const activeStaffByRole = useMemo(() => {
    const active = staffDirectory.filter((s) => s.status === "active")
    return {
      manager: active.filter((s) => s.role === "manager").length,
      sales: active.filter((s) => s.role === "sales").length,
      warehouse: active.filter((s) => s.role === "warehouse").length,
      super_admin: active.filter((s) => s.role === "super_admin").length,
    }
  }, [staffDirectory])

  if (role !== "super_admin") return null

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      <div className="mx-auto max-w-[1400px] px-6 pb-24 pt-10 lg:px-10">
        {/* ── Header ── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 flex-none place-items-center rounded-2xl border border-ink/10 bg-card text-teal-deep shadow-[0_1px_2px_rgba(32,36,43,0.04),0_16px_40px_-24px_rgba(14,140,156,0.4)]">
              <BarChart3 size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-display text-3xl text-ink">Analytics</h1>
              <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-ink/60">
                Every site at once — order volume, value, timing, and quality, all in one place. Every number below
                comes straight from your real orders and quality checks.
              </p>
            </div>
          </div>

          <div className="flex gap-1 rounded-full border border-ink/10 bg-card p-1">
            {(["7d", "30d", "90d", "all"] as DateRangeOption[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                  range === r ? "bg-teal-deep text-parchment shadow-[0_6px_18px_-8px_rgba(14,140,156,0.5)]" : "text-ink/55 hover:text-ink/80"
                }`}
              >
                {DATE_RANGE_LABEL[r]}
              </button>
            ))}
          </div>
        </div>

        {/* ── Top-line numbers ── */}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <SummaryCard
            icon={<DollarSign size={14} />}
            label="Order value"
            value={fmtLKR(totalValue)}
            hint={`${DATE_RANGE_LABEL[range].toLowerCase()}, ${ordersInRange.length} order${ordersInRange.length === 1 ? "" : "s"}`}
          />
          <SummaryCard icon={<ShoppingBag size={14} />} label="Avg order value" value={fmtLKR(avgOrderValue)} />
          <SummaryCard
            icon={<Clock size={14} />}
            label="Avg fulfillment"
            value={formatHours(ageTrend.avgFulfillmentHoursOverall)}
            hint={`${ageTrend.deliveredCountOverall} delivered`}
          />
          <SummaryCard
            icon={<PackageCheck size={14} />}
            label="QC pass rate"
            value={formatPercent(qcTrend.overallPassRate)}
            hint={`${qcTrend.totalPassed + qcTrend.totalFlagged} resolved`}
            tone={qcTrend.overallPassRate !== null && qcTrend.overallPassRate < 85 ? "warning" : "positive"}
          />
          <SummaryCard
            icon={<Truck size={14} />}
            label="Shipping SLA hit"
            value={formatPercent(slaTrend.overallHitRate)}
            tone={slaTrend.overallHitRate !== null && slaTrend.overallHitRate < 85 ? "warning" : "positive"}
          />
          <SummaryCard
            icon={<Boxes size={14} />}
            label="Delayed right now"
            value={String(delayedNow)}
            tone={delayedNow > 0 ? "warning" : "default"}
          />
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* ── How customers are ordering — the one breakdown Reports doesn't have ── */}
          <div className="rounded-2xl border border-ink/10 bg-card p-5 lg:col-span-1">
            <div className="flex items-center gap-2">
              <Link2 size={15} className="text-ink/40" />
              <h2 className="text-sm font-semibold text-ink/80">How orders came in</h2>
            </div>
            <p className="mt-1 text-xs text-ink/45">By value, {DATE_RANGE_LABEL[range].toLowerCase()}. Hover a row for what it means.</p>
            <div className="mt-4 flex flex-col gap-4">
              {([1, 2, 3] as Channel[]).map((c) => (
                <ShareBar
                  key={c}
                  label={CHANNEL_LABEL[c]}
                  description={CHANNEL_DESCRIPTION[c]}
                  value={channelBreakdown[c].value}
                  total={totalValue}
                  formatValue={fmtLKR}
                />
              ))}
            </div>
            {totalValue === 0 && <p className="mt-3 text-xs text-ink/40">No orders placed in this range yet.</p>}
          </div>

          {/* ── Fulfillment time trend ── */}
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

          {/* ── QC pass rate trend ── */}
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
        </div>

        {/* ── Site-by-site ── */}
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-ink/80">Every site, side by side</h2>
          <p className="mt-1 text-xs text-ink/45">Same numbers as Manager's own Reports page, just all sites in one table instead of one at a time.</p>
          <div className="mt-3 overflow-hidden rounded-2xl border border-ink/10 bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-left text-xs font-semibold uppercase tracking-wide text-ink/40">
                  <th className="px-5 py-3 font-semibold">Site</th>
                  <th className="px-5 py-3 font-semibold">Open orders</th>
                  <th className="px-5 py-3 font-semibold">Delayed</th>
                  <th className="px-5 py-3 font-semibold">Avg fulfillment</th>
                  <th className="px-5 py-3 font-semibold">QC pass rate</th>
                  <th className="px-5 py-3 font-semibold">Shipping SLA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {siteSummaries.map((s) => (
                  <tr key={s.siteId} className="hover:bg-ink/[0.02]">
                    <td className="px-5 py-3 font-semibold text-ink">{s.siteName}</td>
                    <td className="px-5 py-3 text-ink/70">{s.openOrderCount}</td>
                    <td className={`px-5 py-3 ${s.delayedCount > 0 ? "font-semibold text-red-600" : "text-ink/70"}`}>{s.delayedCount}</td>
                    <td className="px-5 py-3 text-ink/70">{formatHours(s.avgFulfillmentHours)}</td>
                    <td className="px-5 py-3 text-ink/70">{formatPercent(s.qcPassRate)}</td>
                    <td className="px-5 py-3 text-ink/70">{formatPercent(s.shippingSlaHitRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Staff snapshot ── */}
        <div className="mt-8">
          <div className="flex items-center gap-2">
            <Users size={15} className="text-ink/40" />
            <h2 className="text-sm font-semibold text-ink/80">Active staff</h2>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard label="Manager" value={String(activeStaffByRole.manager)} />
            <SummaryCard label="Sales & Purchase" value={String(activeStaffByRole.sales)} />
            <SummaryCard label="Warehouse" value={String(activeStaffByRole.warehouse)} />
            <SummaryCard label="Super Admin" value={String(activeStaffByRole.super_admin)} />
          </div>
        </div>

        {/* ── Honest about what isn't tracked yet ── */}
        <div className="mt-8 flex items-start gap-2.5 rounded-2xl border border-dashed border-ink/15 bg-card/60 px-5 py-4">
          <MessageCircleQuestion size={16} className="mt-0.5 flex-none text-ink/35" />
          <div>
            <p className="text-xs font-semibold text-ink/60">Not shown here, on purpose</p>
            <p className="mt-1 text-xs leading-relaxed text-ink/45">
              "Order value" above is what customers were charged, not company revenue — there's no cost or margin
              field on an order yet, so a true profit figure isn't something this page can honestly show. WhatsApp
              messaging cost and per-seller performance aren't tracked anywhere in the data yet either. Rather than
              estimate or fake those, they stay off this page until they're real — see the still-locked entries in
              the sidebar.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}