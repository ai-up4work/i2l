// lib/admin/insights.ts
//
// Decision-oriented numbers for the Analytics page, all derived from data
// AdminDataContext already holds (orders, requestLines, purchases). Where
// something isn't recorded, it isn't shown.

import { STAGE_AGE_THRESHOLD_HOURS, REQUEST_SLA_HOURS, type Order, type OrderStage, type Purchase, type RequestLine } from '@/types/admin'
import { HOUR } from '@/lib/admin/timeline'

const t = (iso?: string | null) => (iso ? new Date(iso).getTime() : NaN)

export interface Funnel {
  requests: number
  quoted: number
  paid: number
  delivered: number
}

/** Requests received in the window, and how far each got. */
export function computeFunnel(requests: RequestLine[], orders: Order[], since: number | null): Funnel {
  const inRange = requests.filter((r) => since === null || t(r.submittedAt) >= since)
  const orderById = new Map(orders.map((o) => [o.id, o]))
  return {
    requests: inRange.length,
    quoted: inRange.filter((r) => r.status !== 'sent_for_review' || r.allItemsQuoted).length,
    paid: inRange.filter((r) => !!r.payment || r.status === 'confirmed').length,
    delivered: inRange.filter((r) => r.linkedOrderId && orderById.get(r.linkedOrderId)?.stage === 'Delivered').length,
  }
}

export interface StageTime {
  stage: OrderStage
  avgHours: number | null
  slaHours: number
  samples: number
}

/** Average time spent in each stage (finished stages only), against its SLA. */
export function computeStageTimes(orders: Order[], since: number | null): StageTime[] {
  const stages: OrderStage[] = ['Ordered', 'Quality check', 'Shipped']
  const sums = new Map<OrderStage, { total: number; n: number }>(stages.map((s) => [s, { total: 0, n: 0 }]))
  for (const o of orders) {
    if (since !== null && t(o.placedAt) < since) continue
    const h = [...(o.stageHistory ?? [])].sort((a, b) => t(a.at) - t(b.at))
    for (let i = 0; i < h.length - 1; i++) {
      const bucket = sums.get(h[i].stage)
      const hours = (t(h[i + 1].at) - t(h[i].at)) / HOUR
      if (bucket && Number.isFinite(hours) && hours >= 0) {
        bucket.total += hours
        bucket.n += 1
      }
    }
  }
  return stages.map((stage) => {
    const b = sums.get(stage)!
    return { stage, avgHours: b.n ? b.total / b.n : null, slaHours: STAGE_AGE_THRESHOLD_HOURS[stage], samples: b.n }
  })
}

export interface Attention {
  label: string
  count: number
  href: string
  tone: 'danger' | 'warn' | 'info'
}

export function computeAttention(orders: Order[], requests: RequestLine[], purchases: Purchase[]): Attention[] {
  const now = Date.now()
  const overSla = orders.filter((o) => {
    if (o.stage === 'Delivered' || o.paymentStatus === 'refunded') return false
    const hours = (now - t(o.stageEnteredAt)) / HOUR
    return hours > STAGE_AGE_THRESHOLD_HOURS[o.stage]
  }).length
  const staleQuotes = requests.filter((r) => r.status === 'quoted' && (now - t(r.submittedAt)) / HOUR > REQUEST_SLA_HOURS * 3).length
  const overdueRequests = requests.filter((r) => r.slaBreached).length
  const unreplied = orders.filter((o) => o.hasUnrepliedMessage).length + requests.filter((r) => r.hasUnrepliedMessage).length
  const unpaid = orders.filter((o) => o.paymentStatus === 'unpaid' && o.stage === 'Ordered').length
  const flagged = purchases.filter((p) => p.qcStatus === 'flagged').length
  const list: Attention[] = [
    { label: 'Orders past their stage SLA', count: overSla, href: '/admin/orders', tone: 'danger' },
    { label: 'Items flagged in quality check', count: flagged, href: '/admin/qc-issues', tone: 'danger' },
    { label: 'Requests waiting too long for a quote', count: overdueRequests, href: '/admin/requests', tone: 'warn' },
    { label: 'Quotes unpaid for over 3 days', count: staleQuotes, href: '/admin/requests', tone: 'warn' },
    { label: 'Orders awaiting payment', count: unpaid, href: '/admin/orders', tone: 'warn' },
    { label: 'Messages with no reply yet', count: unreplied, href: '/admin/chat', tone: 'info' },
  ]
  return list.filter((a) => a.count > 0)
}

export interface SellerRow {
  seller: string
  orders: number
  items: number
  avgDeliveryHours: number | null
  refundRate: number
}

export function computeSellers(orders: Order[], since: number | null): SellerRow[] {
  const map = new Map<string, { ids: Set<string>; items: number; hours: number; delivered: number; refunded: Set<string> }>()
  for (const o of orders) {
    if (since !== null && t(o.placedAt) < since) continue
    const deliveredAt = o.stage === 'Delivered' ? t(o.stageEnteredAt) : NaN
    for (const it of o.items) {
      const name = (it.sellerName ?? '').trim() || 'Unknown'
      let e = map.get(name)
      if (!e) map.set(name, (e = { ids: new Set(), items: 0, hours: 0, delivered: 0, refunded: new Set() }))
      e.items += it.quantity ?? 1
      if (!e.ids.has(o.id)) {
        e.ids.add(o.id)
        if (Number.isFinite(deliveredAt)) {
          e.hours += (deliveredAt - t(o.placedAt)) / HOUR
          e.delivered += 1
        }
        if (o.paymentStatus === 'refunded') e.refunded.add(o.id)
      }
    }
  }
  return [...map.entries()]
    .map(([seller, e]) => ({
      seller,
      orders: e.ids.size,
      items: e.items,
      avgDeliveryHours: e.delivered ? e.hours / e.delivered : null,
      refundRate: e.ids.size ? e.refunded.size / e.ids.size : 0,
    }))
    .sort((a, b) => b.orders - a.orders)
}

/** Value and count for the window and the equal-length window before it. */
export function computePeriodDelta(orders: Order[], days: number | null) {
  if (days === null) return null
  const now = Date.now()
  const span = days * 24 * HOUR
  const sum = (from: number, to: number) => {
    const set = orders.filter((o) => t(o.placedAt) >= from && t(o.placedAt) < to)
    return { count: set.length, value: set.reduce((n, o) => n + o.totalValue, 0), refunded: set.filter((o) => o.paymentStatus === 'refunded').length }
  }
  return { current: sum(now - span, now + 1), previous: sum(now - 2 * span, now - span) }
}
