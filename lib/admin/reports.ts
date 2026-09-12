// lib/admin/reports.ts
//
// Pure, stateless report calculations shared by /admin/reports and
// /admin/reports/[siteId]. Both pages call the same functions with a
// different `siteId` filter ("all" vs one site), so a metric's
// definition — what counts as a "hit", how a bucket's average is
// computed — can never drift between the cross-site view and the
// per-site drill-in.
//
// Every trend function buckets by *day of resolution* (deliveredAt for
// fulfillment/shipping, qcResolvedAt for QC), not day of order
// placement — a report is about when work got finished, not when it
// started. Buckets with no resolved events that day still render (as
// an empty/zero bar) rather than being skipped, so a quiet day reads as
// "quiet," not as a gap in the chart.

import type { Order, Purchase, Site } from "@/types/admin"
import { hoursSince, isOrderAgeBreached } from "@/contexts/AdminDataContext"

export type DateRangeOption = "7d" | "30d" | "90d" | "all"

export const DATE_RANGE_LABEL: Record<DateRangeOption, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time",
}

const RANGE_HOURS: Record<DateRangeOption, number> = {
  "7d": 24 * 7,
  "30d": 24 * 30,
  "90d": 24 * 90,
  all: Infinity,
}

// "All time" still needs a finite number of day-buckets to draw — mock
// data doesn't run back further than ~25 days anyway, so 45 is a
// generous, arbitrary cap rather than a real retention limit.
const ALL_TIME_BUCKET_DAYS = 45

function withinRange(iso: string, range: DateRangeOption): boolean {
  return hoursSince(iso) <= RANGE_HOURS[range]
}

function dayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10)
}

function bucketDayCount(range: DateRangeOption): number {
  return range === "all" ? ALL_TIME_BUCKET_DAYS : RANGE_HOURS[range] / 24
}

/** Oldest-first list of empty day buckets spanning the range, so every chart has a full, ungapped x-axis before any real data is merged in. */
function buildDayBuckets(range: DateRangeOption): { key: string; label: string }[] {
  const days = bucketDayCount(range)
  const buckets: { key: string; label: string }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - i)
    buckets.push({
      key: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    })
  }
  return buckets
}

/* ------------------------------------------------------------------ */
/* Order age / fulfillment trend                                       */
/* ------------------------------------------------------------------ */

export interface OrderAgeTrendPoint {
  key: string
  label: string
  deliveredCount: number
  avgFulfillmentHours: number | null
}

export interface OrderAgeTrendResult {
  points: OrderAgeTrendPoint[]
  openOrderCount: number
  avgOpenAgeHours: number | null
  breachedOpenCount: number
  avgFulfillmentHoursOverall: number | null
  deliveredCountOverall: number
}

/**
 * "Order age" is reported two ways, deliberately not merged into one
 * number: fulfillment time (placedAt → deliveredAt) for orders that
 * have actually finished, trended by delivery day — and a live
 * snapshot of how old *currently open* orders are right now. A
 * customer doesn't care that last month's orders were fast if this
 * week's are stuck, so the open-order snapshot is never averaged
 * together with historical fulfillment times.
 */
export function computeOrderAgeTrend(
  orders: Order[],
  range: DateRangeOption,
  siteId: string | "all"
): OrderAgeTrendResult {
  const scoped = orders.filter((o) => siteId === "all" || o.siteId === siteId)
  const buckets = buildDayBuckets(range)
  const map = new Map(buckets.map((b) => [b.key, { ...b, deliveredCount: 0, totalHours: 0 }]))

  let fulfillmentSum = 0
  let fulfillmentCount = 0

  for (const o of scoped) {
    if (!o.deliveredAt || !withinRange(o.deliveredAt, range)) continue
    const hours = (new Date(o.deliveredAt).getTime() - new Date(o.placedAt).getTime()) / (1000 * 60 * 60)
    const bucket = map.get(dayKey(o.deliveredAt))
    if (bucket) {
      bucket.deliveredCount += 1
      bucket.totalHours += hours
    }
    fulfillmentSum += hours
    fulfillmentCount += 1
  }

  const points: OrderAgeTrendPoint[] = Array.from(map.values()).map((b) => ({
    key: b.key,
    label: b.label,
    deliveredCount: b.deliveredCount,
    avgFulfillmentHours: b.deliveredCount > 0 ? b.totalHours / b.deliveredCount : null,
  }))

  const openOrders = scoped.filter((o) => !o.deliveredAt)
  const openAges = openOrders.map((o) => hoursSince(o.placedAt))

  return {
    points,
    openOrderCount: openOrders.length,
    avgOpenAgeHours: openAges.length > 0 ? openAges.reduce((a, b) => a + b, 0) / openAges.length : null,
    breachedOpenCount: openOrders.filter((o) => isOrderAgeBreached(hoursSince(o.placedAt))).length,
    avgFulfillmentHoursOverall: fulfillmentCount > 0 ? fulfillmentSum / fulfillmentCount : null,
    deliveredCountOverall: fulfillmentCount,
  }
}

/* ------------------------------------------------------------------ */
/* QC pass rate trend                                                  */
/* ------------------------------------------------------------------ */

export interface QcPassRateTrendPoint {
  key: string
  label: string
  passedCount: number
  flaggedCount: number
  passRate: number | null
}

export interface QcPassRateTrendResult {
  points: QcPassRateTrendPoint[]
  totalPassed: number
  totalFlagged: number
  overallPassRate: number | null
}

/**
 * Bucketed by qcResolvedAt (when submitQcResult recorded a verdict),
 * not by order placement — this is a QC-team metric, so it trends by
 * when inspection work happened. "Pending" purchases are excluded
 * entirely; a pass rate is only meaningful once a verdict exists.
 */
export function computeQcPassRateTrend(
  purchases: Purchase[],
  orders: Order[],
  range: DateRangeOption,
  siteId: string | "all"
): QcPassRateTrendResult {
  const orderSite = new Map(orders.map((o) => [o.id, o.siteId]))
  const buckets = buildDayBuckets(range)
  const map = new Map(buckets.map((b) => [b.key, { ...b, passed: 0, flagged: 0 }]))

  let totalPassed = 0
  let totalFlagged = 0

  for (const p of purchases) {
    if (!p.qcResolvedAt || !p.qcStatus || p.qcStatus === "pending") continue
    if (siteId !== "all" && orderSite.get(p.orderId) !== siteId) continue
    if (!withinRange(p.qcResolvedAt, range)) continue

    const bucket = map.get(dayKey(p.qcResolvedAt))
    if (p.qcStatus === "passed") {
      totalPassed += 1
      if (bucket) bucket.passed += 1
    } else {
      totalFlagged += 1
      if (bucket) bucket.flagged += 1
    }
  }

  const points: QcPassRateTrendPoint[] = Array.from(map.values()).map((b) => {
    const total = b.passed + b.flagged
    return {
      key: b.key,
      label: b.label,
      passedCount: b.passed,
      flaggedCount: b.flagged,
      passRate: total > 0 ? (b.passed / total) * 100 : null,
    }
  })

  return {
    points,
    totalPassed,
    totalFlagged,
    overallPassRate: totalPassed + totalFlagged > 0 ? (totalPassed / (totalPassed + totalFlagged)) * 100 : null,
  }
}

/* ------------------------------------------------------------------ */
/* Shipping SLA hit/miss trend                                         */
/* ------------------------------------------------------------------ */

export interface ShippingSlaTrendPoint {
  key: string
  label: string
  hitCount: number
  missCount: number
  hitRate: number | null
}

export interface ShippingSlaTrendResult {
  points: ShippingSlaTrendPoint[]
  totalHit: number
  totalMiss: number
  overallHitRate: number | null
}

const DEFAULT_ETA_HOURS = 24 // mirrors IN_TRANSIT_DEFAULT_ETA_HOURS in types/admin.ts

/**
 * Only orders that actually completed the courier leg (pickedUpAt AND
 * deliveredAt both set) count toward hit/miss — an order still in
 * transit hasn't missed anything yet, it's just not resolved. "Hit"
 * means actual transit time (pickedUpAt → deliveredAt) was within the
 * order's own etaHours, not a single global cutoff, since ETAs already
 * vary per order.
 */
export function computeShippingSlaTrend(
  orders: Order[],
  range: DateRangeOption,
  siteId: string | "all"
): ShippingSlaTrendResult {
  const scoped = orders.filter((o) => siteId === "all" || o.siteId === siteId)
  const buckets = buildDayBuckets(range)
  const map = new Map(buckets.map((b) => [b.key, { ...b, hit: 0, miss: 0 }]))

  let totalHit = 0
  let totalMiss = 0

  for (const o of scoped) {
    if (!o.deliveredAt || !o.pickedUpAt) continue
    if (!withinRange(o.deliveredAt, range)) continue

    const transitHours = (new Date(o.deliveredAt).getTime() - new Date(o.pickedUpAt).getTime()) / (1000 * 60 * 60)
    const eta = o.etaHours ?? DEFAULT_ETA_HOURS
    const isHit = transitHours <= eta
    const bucket = map.get(dayKey(o.deliveredAt))

    if (isHit) {
      totalHit += 1
      if (bucket) bucket.hit += 1
    } else {
      totalMiss += 1
      if (bucket) bucket.miss += 1
    }
  }

  const points: ShippingSlaTrendPoint[] = Array.from(map.values()).map((b) => {
    const total = b.hit + b.miss
    return {
      key: b.key,
      label: b.label,
      hitCount: b.hit,
      missCount: b.miss,
      hitRate: total > 0 ? (b.hit / total) * 100 : null,
    }
  })

  return {
    points,
    totalHit,
    totalMiss,
    overallHitRate: totalHit + totalMiss > 0 ? (totalHit / (totalHit + totalMiss)) * 100 : null,
  }
}

/* ------------------------------------------------------------------ */
/* Per-site summary — drives the main Reports page's breakdown table   */
/* ------------------------------------------------------------------ */

export interface SiteSummary {
  siteId: string
  siteName: string
  openOrderCount: number
  delayedCount: number
  avgFulfillmentHours: number | null
  qcPassRate: number | null
  shippingSlaHitRate: number | null
}

export function computeSiteSummaries(
  orders: Order[],
  purchases: Purchase[],
  sites: Site[],
  range: DateRangeOption
): SiteSummary[] {
  return sites.map((site) => {
    const ageTrend = computeOrderAgeTrend(orders, range, site.id)
    const qcTrend = computeQcPassRateTrend(purchases, orders, range, site.id)
    const slaTrend = computeShippingSlaTrend(orders, range, site.id)
    return {
      siteId: site.id,
      siteName: site.name,
      openOrderCount: ageTrend.openOrderCount,
      delayedCount: orders.filter((o) => o.siteId === site.id && o.delayed).length,
      avgFulfillmentHours: ageTrend.avgFulfillmentHoursOverall,
      qcPassRate: qcTrend.overallPassRate,
      shippingSlaHitRate: slaTrend.overallHitRate,
    }
  })
}

/* ------------------------------------------------------------------ */
/* Formatting helpers                                                  */
/* ------------------------------------------------------------------ */

export function formatHours(hours: number | null): string {
  if (hours === null) return "—"
  if (hours < 1) return "<1h"
  if (hours < 48) return `${Math.round(hours)}h`
  return `${(hours / 24).toFixed(1)}d`
}

export function formatPercent(pct: number | null): string {
  if (pct === null) return "—"
  return `${Math.round(pct)}%`
}