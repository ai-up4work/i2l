'use client'

// components/admin/dashboard/OrdersGantt.tsx
//
// Gantt chart of every order (or request): one row each, a bar per state
// along a shared time axis. Green dot = delivered / order created, red ×
// = refunded / declined, a faded bar running to today's line = still in
// that state, red outline = past its SLA. Click a row to open it.
// Built only from real data (see lib/admin/timeline.ts).

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAdminData } from '@/contexts/AdminDataContext'
import { buildOrderRows, buildRequestRows, DAY, type TimelineRow } from '@/lib/admin/timeline'

type Kind = 'orders' | 'requests'
type Filter = 'all' | 'active' | 'late' | 'closed'

const ORDER_COLORS: Record<string, string> = { ordered: '#EF9F27', quality: '#7F77DD', shipped: '#378ADD' }
const REQUEST_COLORS: Record<string, string> = { review: '#EF9F27', quoted: '#378ADD' }
const GREEN = '#1D9E75'
const RED = '#E24B4A'
const LABEL_W = 176
const ROW_H = 30
const PAGE = 40

const RANGES = [
  { id: 7, label: '7 days' },
  { id: 30, label: '30 days' },
  { id: 90, label: '90 days' },
] as const

function fmtDay(ms: number) {
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
function fmtDur(ms: number) {
  const h = ms / 3_600_000
  return h < 48 ? `${Math.max(1, Math.round(h))}h` : `${Math.round(h / 24)}d`
}

export default function OrdersGantt() {
  const router = useRouter()
  const { orders, requestLines: requests } = useAdminData()
  const [kind, setKind] = useState<Kind>('orders')
  const [filter, setFilter] = useState<Filter>('all')
  const [days, setDays] = useState<7 | 30 | 90>(30)
  const [limit, setLimit] = useState(PAGE)
  const [tip, setTip] = useState('Hover a bar for how long it spent in that state. Click a row to open it.')

  const now = Date.now()
  const windowStart = now - days * DAY

  const rows = useMemo(() => {
    const all = kind === 'orders' ? buildOrderRows(orders, now) : buildRequestRows(requests, now)
    return all
      // Keep a row if any part of its life falls in the window; open ones always stay.
      .filter((r) => r.outcome === 'open' || r.end >= windowStart)
      .sort((a, b) => b.start - a.start)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, orders, requests, days])

  const filtered = useMemo(
    () =>
      rows.filter((r) =>
        filter === 'all' ? true : filter === 'active' ? r.outcome === 'open' : filter === 'late' ? r.late : r.outcome !== 'open',
      ),
    [rows, filter],
  )
  const shown = filtered.slice(0, limit)

  const span = now - windowStart
  const pct = (ms: number) => `${(Math.min(Math.max(ms - windowStart, 0), span) / span) * 100}%`
  const widthPct = (a: number, b: number) => {
    const s = Math.max(a, windowStart)
    const e = Math.min(b, now)
    return `${(Math.max(e - s, 0) / span) * 100}%`
  }

  const colors = kind === 'orders' ? ORDER_COLORS : REQUEST_COLORS
  const tickCount = days <= 7 ? 8 : 5
  const ticks = Array.from({ length: tickCount }, (_, i) => windowStart + (span * i) / (tickCount - 1))

  const filters: { id: Filter; label: string }[] =
    kind === 'orders'
      ? [{ id: 'all', label: 'All' }, { id: 'active', label: 'Active' }, { id: 'late', label: 'Over SLA' }, { id: 'closed', label: 'Delivered or refunded' }]
      : [{ id: 'all', label: 'All' }, { id: 'active', label: 'Open' }, { id: 'late', label: 'Waiting too long' }, { id: 'closed', label: 'Converted or declined' }]

  const chip = (on: boolean) =>
    `rounded-full px-3 py-1 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-teal/40 ${
      on ? 'bg-teal-deep text-parchment' : 'border border-ink/10 bg-card text-ink/60 hover:text-ink'
    }`

  function describe(r: TimelineRow, label: string, a: number, b: number, late: boolean) {
    setTip(`${r.title} (${r.customer}): ${label} for ${fmtDur(b - a)}${late ? ', over its SLA' : ''}`)
  }

  return (
    <section className="rounded-2xl border border-ink/10 bg-card p-5" aria-label="Orders timeline">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-sm font-semibold text-ink/80">{kind === 'orders' ? 'Order timeline' : 'Request timeline'}</h2>
        <div className="flex gap-1">
          {(['orders', 'requests'] as Kind[]).map((k) => (
            <button key={k} type="button" className={chip(kind === k)} onClick={() => { setKind(k); setFilter('all'); setLimit(PAGE) }}>
              {k === 'orders' ? 'Orders' : 'Requests'}
            </button>
          ))}
        </div>
        <span className="mx-1 h-4 w-px bg-ink/10" />
        <div className="flex flex-wrap gap-1">
          {filters.map((f) => (
            <button key={f.id} type="button" className={chip(filter === f.id)} onClick={() => { setFilter(f.id); setLimit(PAGE) }}>
              {f.label}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <div className="flex gap-1" role="radiogroup" aria-label="Time window">
          {RANGES.map((r) => (
            <button key={r.id} type="button" role="radio" aria-checked={days === r.id} className={chip(days === r.id)} onClick={() => { setDays(r.id); setLimit(PAGE) }}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <div style={{ minWidth: 640 }}>
          <div className="flex">
            <div style={{ width: LABEL_W }} className="flex-none text-[11px] text-ink/45">
              {filtered.length} {kind === 'orders' ? 'order' : 'request'}{filtered.length === 1 ? '' : 's'}
            </div>
            <div className="relative h-5 flex-1 text-[11px] text-ink/45">
              {ticks.map((t, i) => (
                <span
                  key={i}
                  className="absolute whitespace-nowrap"
                  style={{ left: `${(i / (ticks.length - 1)) * 100}%`, transform: `translateX(${i === 0 ? '0' : i === ticks.length - 1 ? '-100%' : '-50%'})` }}
                >
                  {i === ticks.length - 1 ? 'Today' : fmtDay(t)}
                </span>
              ))}
            </div>
          </div>

          <div className="relative">
            {shown.map((r) => (
              <div
                key={r.id}
                role="link"
                tabIndex={0}
                onClick={() => router.push(r.href)}
                onKeyDown={(e) => e.key === 'Enter' && router.push(r.href)}
                className="flex cursor-pointer items-center border-b border-ink/[0.06] outline-none hover:bg-ink/[0.03] focus-visible:bg-teal/[0.06]"
                style={{ height: ROW_H }}
              >
                <div style={{ width: LABEL_W }} className="min-w-0 flex-none pr-2">
                  <span className="block truncate text-xs font-semibold leading-[13px]">{r.title}</span>
                  <span className="block truncate text-[11px] leading-[12px] text-ink/50">{r.customer}{r.subtitle ? ` · ${r.subtitle}` : ''}</span>
                </div>
                <div className="relative h-full flex-1">
                  {r.segments.map((s, i) => {
                    if (s.end < windowStart) return null
                    return (
                      <div
                        key={i}
                        onMouseEnter={() => describe(r, s.label, s.start, s.end, s.late)}
                        className="absolute"
                        style={{
                          top: 9,
                          height: 12,
                          left: pct(s.start),
                          width: widthPct(s.start, s.end),
                          minWidth: 3,
                          background: colors[s.key],
                          opacity: s.open ? 0.55 : 1,
                          borderRadius: 2,
                          outline: s.late ? `1.5px solid ${RED}` : undefined,
                          outlineOffset: 1,
                        }}
                      />
                    )
                  })}
                  {r.outcome === 'done' && r.end >= windowStart && (
                    <span className="absolute rounded-full" style={{ top: 10, width: 10, height: 10, left: `calc(${pct(r.end)} - 5px)`, background: GREEN }} />
                  )}
                  {r.outcome === 'closed' && r.end >= windowStart && (
                    <span className="absolute text-[13px] font-semibold leading-none" style={{ top: 8, left: `calc(${pct(r.end)} - 4px)`, color: RED }}>
                      ×
                    </span>
                  )}
                </div>
              </div>
            ))}
            {shown.length === 0 && <p className="py-10 text-center text-sm text-ink/45">Nothing matches this filter in the last {days} days.</p>}
            <div className="pointer-events-none absolute bottom-0 top-0 border-r border-dashed border-ink/40" style={{ left: LABEL_W, right: 0 }} />
          </div>
        </div>
      </div>

      {filtered.length > limit && (
        <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="mt-3 text-xs font-semibold text-teal-deep hover:underline">
          Show {Math.min(PAGE, filtered.length - limit)} more of {filtered.length - limit} remaining
        </button>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink/55">
        {(kind === 'orders'
          ? ([['Ordered', ORDER_COLORS.ordered], ['Quality check', ORDER_COLORS.quality], ['Shipped', ORDER_COLORS.shipped]] as [string, string][])
          : ([['Sent for review', REQUEST_COLORS.review], ['Quoted', REQUEST_COLORS.quoted]] as [string, string][])
        ).map(([l, c]) => (
          <span key={l} className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: c }} />{l}</span>
        ))}
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: GREEN }} />{kind === 'orders' ? 'Delivered' : 'Order created'}</span>
        <span className="inline-flex items-center gap-1.5"><b className="font-semibold leading-none" style={{ color: RED }}>×</b>{kind === 'orders' ? 'Refunded' : 'Declined'}</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-ink/40 opacity-60" />Still in this state</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ outline: `1.5px solid ${RED}` }} />Over SLA</span>
      </div>
      <p className="mt-2 min-h-[18px] text-xs text-ink/55" aria-live="polite">{tip}</p>
    </section>
  )
}
