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
  /** request = not ordered yet (or declined); order = placed without a request;
   *  request-order = a request that became an order (one continuous row). */
  kind?: 'request' | 'order' | 'request-order'
  /** Hover card: a picture and a few plain facts about this piece of work. */
  image?: string
  facts?: { label: string; value: string }[]
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
      image: o.items.find((i) => i.productImage)?.productImage,
      facts: [
        { label: 'Items', value: o.items.slice(0, 3).map((i) => `${i.quantity > 1 ? `${i.quantity}× ` : ''}${tidy(i.title)}`).join(', ') + (o.items.length > 3 ? ` +${o.items.length - 3} more` : '') },
        { label: 'Order total', value: `Rs. ${Math.round(o.totalValue).toLocaleString('en-LK')}` },
        { label: 'Payment', value: o.paymentStatus },
        { label: 'Stage', value: o.stage },
      ],
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
      image: r.items.map((i) => i.screenshotUrl || i.productImageUrl).find(Boolean),
      facts: [
        { label: 'Link', value: r.items.slice(0, 2).map((i) => tidy(i.sourceDomain || i.link)).join(', ') + (r.items.length > 2 ? ` +${r.items.length - 2} more` : '') },
        ...(r.items[0]?.note ? [{ label: 'Note', value: r.items[0].note.length > 90 ? `${r.items[0].note.slice(0, 90)}…` : r.items[0].note }] : []),
        ...(r.totalQuote ? [{ label: 'Quote', value: `Rs. ${Math.round(r.totalQuote).toLocaleString('en-LK')}` }] : []),
        { label: 'Status', value: r.status.replace(/_/g, ' ') },
      ],
    }
  })
}

/** Local-date key (yyyy-mm-dd) so "a day" matches the viewer's calendar. */
export function dayKey(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}


/**
 * One row per piece of work. An order is just a request that already has
 * its quote and payment, so a request that became an order is ONE row
 * running Sent for review → Quoted → Ordered → Quality check → Shipped →
 * Delivered. Orders placed straight from the shop (no request) start at
 * Ordered; requests that haven't become orders end at Quoted / Declined.
 */
export function buildUnifiedRows(orders: Order[], requests: RequestLine[], now = Date.now()): TimelineRow[] {
  const orderRows = new Map(buildOrderRows(orders, now).map((r) => [r.id, r]))
  const used = new Set<string>()
  const out: TimelineRow[] = []

  for (const req of buildRequestRows(requests, now)) {
    const line = requests.find((l) => l.id === req.id)
    const orderRow = line?.linkedOrderId ? orderRows.get(line.linkedOrderId) : undefined
    if (!orderRow) {
      out.push({ ...req, kind: 'request' })
      continue
    }
    used.add(orderRow.id)
    // The request part ends the moment the order was placed.
    const head = req.segments.map((s) => ({ ...s, open: false, late: false, end: Math.min(s.end, Math.max(orderRow.start, s.start)) }))
    if (head.length) head[head.length - 1].end = Math.max(orderRow.start, head[head.length - 1].start)
    out.push({
      ...orderRow,
      title: `${req.title} → ${orderRow.title}`,
      start: Math.min(req.start, orderRow.start),
      segments: [...head, ...orderRow.segments],
      image: orderRow.image ?? req.image,
      kind: 'request-order',
    })
  }
  for (const [id, row] of orderRows) if (!used.has(id)) out.push({ ...row, kind: 'order' })
  return out
}
