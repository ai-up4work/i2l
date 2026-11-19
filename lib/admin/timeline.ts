// lib/admin/timeline.ts
//
// Pure helpers behind the Orders/Requests Gantt chart and the activity
// heatmap. Everything is derived from data already in AdminDataContext:
// Order.stageHistory (one entry per stage, with the time it started),
// Order.placedAt, Order.paymentStatus, Request.submittedAt / quoteHistory /
// payment / status. Nothing is invented — where a time isn't recorded,
// the bar simply ends at the last time that IS recorded.

import { STAGE_AGE_THRESHOLD_HOURS, REQUEST_SLA_HOURS, type Order, type OrderStage, type RequestLine } from '@/types/admin'

export const HOUR = 3_600_000
export const DAY = 24 * HOUR

export type OrderSegmentKey = 'ordered' | 'quality' | 'shipped'
export type RequestSegmentKey = 'review' | 'quoted'

export interface Segment {
  key: OrderSegmentKey | RequestSegmentKey
  label: string
  start: number // ms
  end: number // ms
  open: boolean // still in this state right now
  late: boolean // open and past its SLA
}

export interface TimelineRow {
  id: string
  href: string
  title: string // e.g. WD-1000063
  customer: string
  subtitle: string // item / link summary
  start: number
  end: number
  segments: Segment[]
  /** How the row ends: a green dot, a red x, or still running. */
  outcome: 'done' | 'closed' | 'open'
  late: boolean
  paymentStatus?: Order['paymentStatus']
}

const ORDER_SEG: Partial<Record<OrderStage, { key: OrderSegmentKey; label: string }>> = {
  Ordered: { key: 'ordered', label: 'Ordered' },
  'Quality check': { key: 'quality', label: 'Quality check' },
  Shipped: { key: 'shipped', label: 'Shipped' },
}

/** Item titles can be a raw pasted link: show just the site instead of the whole URL. */
function tidy(text: string): string {
  if (!/^https?:\/\//i.test(text)) return text
  try {
    return new URL(text).hostname.replace(/^www\./, '')
  } catch {
    return text
  }
}

const ts = (iso: string | undefined | null) => (iso ? new Date(iso).getTime() : NaN)

export function buildOrderRows(orders: Order[], now = Date.now()): TimelineRow[] {
  return orders.map((o) => {
    const placed = ts(o.placedAt)
    const history = [...(o.stageHistory ?? [])]
      .map((h) => ({ stage: h.stage, at: ts(h.at) }))
      .filter((h) => Number.isFinite(h.at))
      .sort((a, b) => a.at - b.at)
    // Make sure the story starts at "Ordered" when the order was placed.
    if (!history.length || history[0].stage !== 'Ordered') history.unshift({ stage: 'Ordered', at: placed })

    const refunded = o.paymentStatus === 'refunded'
    const delivered = o.stage === 'Delivered'
    const segments: Segment[] = []
    let deliveredAt: number | null = null

    for (let i = 0; i < history.length; i++) {
      const h = history[i]
      if (h.stage === 'Delivered') {
        deliveredAt = h.at
        break
      }
      const def = ORDER_SEG[h.stage]
      if (!def) continue
      const next = history[i + 1]
      const isCurrent = !next && o.stage === h.stage && !refunded
      const end = next ? next.at : isCurrent ? now : ts(o.stageEnteredAt) || h.at
      const hours = (Math.max(end, h.at) - h.at) / HOUR
      segments.push({
        key: def.key,
        label: def.label,
        start: h.at,
        end: Math.max(end, h.at),
        open: isCurrent,
        late: isCurrent && hours > STAGE_AGE_THRESHOLD_HOURS[h.stage],
      })
    }
    // Merge repeated entries of the same stage (e.g. a rollback and re-advance).
    const merged: Segment[] = []
    for (const s of segments) {
      const last = merged[merged.length - 1]
      if (last && last.key === s.key) {
        last.end = s.end
        last.open = s.open
        last.late = s.late
      } else merged.push({ ...s })
    }

    const lastSeg = merged[merged.length - 1]
    const end = delivered ? (deliveredAt ?? ts(o.stageEnteredAt) ?? lastSeg?.end ?? now) : refunded ? (lastSeg?.end ?? now) : now
    const outcome: TimelineRow['outcome'] = refunded ? 'closed' : delivered ? 'done' : 'open'
    return {
      id: o.id,
      href: `/admin/orders/${o.id}`,
      title: o.id,
      customer: o.customerName,
      subtitle: o.items[0] ? `${tidy(o.items[0].title)}${o.items.length > 1 ? ` +${o.items.length - 1}` : ''}` : '',
      start: placed,
      end: Math.max(end, placed),
      segments: merged,
      outcome,
      late: outcome === 'open' && merged.some((s) => s.late),
      paymentStatus: o.paymentStatus,
    }
  })
}

export function buildRequestRows(requests: RequestLine[], now = Date.now()): TimelineRow[] {
  return requests.map((r) => {
    const start = ts(r.submittedAt)
    const quoteTimes = r.items
      .flatMap((i) => i.quoteHistory ?? [])
      .map((q) => ts(q.at))
      .filter(Number.isFinite)
      .sort((a, b) => a - b)
    const firstQuote = quoteTimes[0]
    const lastQuote = quoteTimes[quoteTimes.length - 1]
    const confirmedAt = ts(r.payment?.confirmedAt)
    const segments: Segment[] = []
    const open = r.status === 'sent_for_review' || r.status === 'quoted'

    if (r.status === 'sent_for_review' || !Number.isFinite(firstQuote)) {
      const end = open ? now : Math.max(start, lastQuote || confirmedAt || start + HOUR)
      const hours = (end - start) / HOUR
      segments.push({ key: 'review', label: 'Sent for review', start, end, open, late: open && hours > REQUEST_SLA_HOURS })
    } else {
      segments.push({ key: 'review', label: 'Sent for review', start, end: Math.max(start, firstQuote), open: false, late: false })
      const end = r.status === 'quoted' ? now : Math.max(firstQuote, confirmedAt || lastQuote || firstQuote)
      const hours = (end - firstQuote) / HOUR
      segments.push({
        key: 'quoted',
        label: 'Quoted',
        start: firstQuote,
        end,
        open: r.status === 'quoted',
        late: r.status === 'quoted' && hours > REQUEST_SLA_HOURS,
      })
    }
    const last = segments[segments.length - 1]
    return {
      id: r.id,
      href: `/admin/requests/${r.id}`,
      title: r.displayId ?? r.id,
      customer: r.customerName,
      subtitle: tidy(r.items[0]?.sourceDomain || r.items[0]?.link || ''),
      start,
      end: last.end,
      segments,
      outcome: r.status === 'confirmed' ? 'done' : r.status === 'declined' ? 'closed' : 'open',
      late: open && segments.some((s) => s.late),
    }
  })
}

/** Local-date key (yyyy-mm-dd) so "a day" matches the viewer's calendar. */
export function dayKey(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
