'use client'

// components/admin/dashboard/OrdersGantt.tsx
//
// One Gantt chart for everything in flight. An order is a request that
// already has its quote and payment, so a request that became an order is a
// single row running Sent for review → Quoted → Ordered → Quality check →
// Shipped → Delivered; orders placed straight from the shop start at
// Ordered; requests not yet ordered end at Quoted (or Declined).
//
// The time axis fits the data: it starts where the earliest visible row
// starts, so five orders from the last two days fill the chart instead of
// sitting in a corner. "Auto" shows everything up to 90 days; 7/30/90 cap it.
// Green dot = delivered, red × = refunded / declined, striped bar = still in
// that state, red ring = past its SLA. Click a row to open it.

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAdminData } from '@/contexts/AdminDataContext'
import { buildUnifiedRows, DAY, type TimelineRow } from '@/lib/admin/timeline'

type Filter = 'all' | 'waiting' | 'progress' | 'late' | 'done' | 'closed'
type Range = 'auto' | 7 | 30 | 90

const COLORS: Record<string, string> = {
  review: '#D4A017',
  quoted: '#378ADD',
  ordered: '#EF8A2F',
  quality: '#7F77DD',
  shipped: '#2F9FB8',
}
const GREEN = '#1D9E75'
const RED = '#E24B4A'
const LABEL_W = 230
const ROW_H = 44
const BAR_H = 20
const PAGE = 40
const MAX_AUTO_DAYS = 90

const KIND_TAG: Record<string, string> = { request: 'Request', 'request-order': 'Request → order', order: 'Direct order' }

function fmtDur(ms: number) {
  const h = ms / 3_600_000
  return h < 48 ? `${Math.max(1, Math.round(h))}h` : `${Math.round(h / 24)}d`
}

export default function OrdersGantt() {
  const router = useRouter()
  const { orders, requestLines } = useAdminData()
  const [filter, setFilter] = useState<Filter>('all')
  const [range, setRange] = useState<Range>('auto')
  const [limit, setLimit] = useState(PAGE)
  const [hover, setHover] = useState<{ row: TimelineRow; seg: TimelineRow['segments'][number]; x: number; y: number } | null>(null)

  const now = Date.now()
  const rangeStart = now - (range === 'auto' ? MAX_AUTO_DAYS : range) * DAY

  const rows = useMemo(
    () =>
      buildUnifiedRows(orders, requestLines, now)
        // Keep a row if any part of its life is in range; open ones always stay.
        .filter((r) => r.outcome === 'open' || r.end >= rangeStart)
        .sort((a, b) => b.start - a.start),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orders, requestLines, range],
  )

  const inProgress = (r: TimelineRow) => r.outcome === 'open' && r.segments[r.segments.length - 1]?.key !== 'review' && r.segments[r.segments.length - 1]?.key !== 'quoted'
  const waiting = (r: TimelineRow) => r.outcome === 'open' && !inProgress(r)

  const counts = useMemo(
    () => ({
      all: rows.length,
      waiting: rows.filter(waiting).length,
      progress: rows.filter(inProgress).length,
      late: rows.filter((r) => r.late).length,
      done: rows.filter((r) => r.outcome === 'done').length,
      closed: rows.filter((r) => r.outcome === 'closed').length,
    }),
    [rows],
  )

  const filtered = useMemo(
    () =>
      rows.filter((r) =>
        filter === 'all' ? true : filter === 'waiting' ? waiting(r) : filter === 'progress' ? inProgress(r) : filter === 'late' ? r.late : filter === 'done' ? r.outcome === 'done' : r.outcome === 'closed',
      ),
    [rows, filter],
  )
  const shown = filtered.slice(0, limit)

  // Axis fits the data: from the earliest visible row (never before the range) to now, at least a day wide.
  const earliest = filtered.length ? Math.min(...filtered.map((r) => r.start)) : now - DAY
  const windowStart = Math.min(Math.max(rangeStart, earliest - 0.1 * (now - earliest) - 2 * 3_600_000), now - DAY)
  const span = now - windowStart
  const spanDays = span / DAY
  const pct = (ms: number) => `${(Math.min(Math.max(ms - windowStart, 0), span) / span) * 100}%`

  const tickCount = spanDays <= 2 ? 5 : spanDays <= 10 ? Math.round(spanDays) + 1 : 6
  const ticks = Array.from({ length: tickCount }, (_, i) => windowStart + (span * i) / (tickCount - 1))
  const tickLabel = (ms: number, last: boolean) => {
    if (last) return 'Now'
    const d = new Date(ms)
    return spanDays <= 2
      ? d.toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  const chip = (on: boolean) =>
    `rounded-full px-3 py-1 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-teal/40 ${
      on ? 'bg-teal-deep text-parchment' : 'border border-ink/10 bg-card text-ink/60 hover:text-ink'
    }`

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'waiting', label: 'Awaiting quote or payment' },
    { id: 'progress', label: 'In progress' },
    { id: 'late', label: 'Over SLA' },
    { id: 'done', label: 'Delivered' },
    { id: 'closed', label: 'Refunded or declined' },
  ]
  const ranges: { id: Range; label: string }[] = [{ id: 'auto', label: 'Auto' }, { id: 7, label: '7 days' }, { id: 30, label: '30 days' }, { id: 90, label: '90 days' }]

  return (
    <section className="rounded-2xl border border-ink/10 bg-card p-5" aria-label="Orders and requests timeline">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-sm font-semibold text-ink/80">Orders and requests</h2>
        <div className="flex flex-wrap gap-1">
          {filters.map((f) => (
            <button key={f.id} type="button" className={chip(filter === f.id)} onClick={() => { setFilter(f.id); setLimit(PAGE) }}>
              {f.label} <span className="opacity-60">{counts[f.id]}</span>
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <div className="flex gap-1" role="radiogroup" aria-label="Time window">
          {ranges.map((r) => (
            <button key={String(r.id)} type="button" role="radio" aria-checked={range === r.id} className={chip(range === r.id)} onClick={() => { setRange(r.id); setLimit(PAGE) }}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <div style={{ minWidth: 640 }}>
          <div className="flex">
            <div style={{ width: LABEL_W }} className="flex-none" />
            <div className="relative h-5 flex-1 text-[11px] text-ink/45">
              {ticks.map((t, i) => (
                <span
                  key={i}
                  className="absolute whitespace-nowrap"
                  style={{ left: `${(i / (ticks.length - 1)) * 100}%`, transform: `translateX(${i === 0 ? '0' : i === ticks.length - 1 ? '-100%' : '-50%'})` }}
                >
                  {tickLabel(t, i === ticks.length - 1)}
                </span>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="pointer-events-none absolute bottom-0 top-0" style={{ left: LABEL_W, right: 0 }} aria-hidden>
              {ticks.slice(1, -1).map((_, i) => (
                <span key={i} className="absolute bottom-0 top-0 border-l border-ink/[0.07]" style={{ left: `${((i + 1) / (ticks.length - 1)) * 100}%` }} />
              ))}
            </div>

            {shown.map((r) => (
              <div
                key={`${r.kind}:${r.id}`}
                role="link"
                tabIndex={0}
                onClick={() => router.push(r.href)}
                onKeyDown={(e) => e.key === 'Enter' && router.push(r.href)}
                className="relative flex cursor-pointer items-center border-b border-ink/[0.06] outline-none hover:bg-ink/[0.03] focus-visible:bg-teal/[0.06]"
                style={{ height: ROW_H }}
              >
                <div style={{ width: LABEL_W }} className="min-w-0 flex-none pr-3">
                  <span className="flex items-center gap-1.5 text-xs font-semibold leading-[15px]">
                    <span className="truncate">{r.title}</span>
                    {r.kind && <span className="flex-none rounded bg-ink/[0.06] px-1 py-px text-[10px] font-medium text-ink/55">{KIND_TAG[r.kind]}</span>}
                  </span>
                  <span className="block truncate text-[11px] leading-[14px] text-ink/50">{r.customer}{r.subtitle ? ` · ${r.subtitle}` : ''}</span>
                </div>
                <div className="relative h-full min-w-0 flex-1 overflow-x-clip">
                  {r.segments.map((s, i) => {
                    if (s.end < windowStart) return null
                    const w = (Math.max(Math.min(s.end, now) - Math.max(s.start, windowStart), 0) / span) * 100
                    return (
                      <div
                        key={i}
                        onMouseMove={(e) => setHover({ row: r, seg: s, x: e.clientX, y: e.clientY })}
                        onMouseLeave={() => setHover(null)}
                        className="absolute flex items-center overflow-hidden whitespace-nowrap px-2 text-[11px] font-semibold text-white"
                        style={{
                          top: (ROW_H - BAR_H) / 2,
                          height: BAR_H,
                          left: pct(s.start),
                          width: `min(${w}%, calc(100% - ${pct(s.start)} - 3px))`,
                          minWidth: 4,
                          background: s.open ? `repeating-linear-gradient(135deg, rgba(255,255,255,.22) 0 5px, transparent 5px 10px), ${COLORS[s.key]}` : COLORS[s.key],
                          borderRadius: 4,
                          boxShadow: s.late ? `0 0 0 2px #fff, 0 0 0 3.5px ${RED}` : '1px 0 0 #fff',
                        }}
                      >
                        {w > 11 && `${s.label} · ${fmtDur(Math.min(s.end, now) - s.start)}`}
                      </div>
                    )
                  })}
                  {r.outcome === 'done' && r.end >= windowStart && (
                    <span className="absolute rounded-full" style={{ top: (ROW_H - 14) / 2, width: 14, height: 14, left: `min(calc(${pct(r.end)} - 7px), calc(100% - 15px))`, background: GREEN, boxShadow: '0 0 0 2px #fff' }} />
                  )}
                  {r.outcome === 'closed' && r.end >= windowStart && (
                    <span className="absolute text-base font-semibold leading-none" style={{ top: (ROW_H - 16) / 2, left: `min(calc(${pct(r.end)} - 5px), calc(100% - 10px))`, color: RED }}>×</span>
                  )}
                </div>
              </div>
            ))}
            {shown.length === 0 && <p className="py-10 text-center text-sm text-ink/45">Nothing matches this filter{range === 'auto' ? '' : ` in the last ${range} days`}.</p>}
            <div className="pointer-events-none absolute bottom-0 top-0 border-r border-dashed border-ink/40" style={{ left: LABEL_W, right: 0 }} />
          </div>
        </div>
      </div>

      {filtered.length > limit && (
        <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="mt-3 text-xs font-semibold text-teal-deep hover:underline">
          Show {Math.min(PAGE, filtered.length - limit)} more ({filtered.length - limit} remaining)
        </button>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink/55">
        {([['Sent for review', 'review'], ['Quoted', 'quoted'], ['Ordered', 'ordered'], ['Quality check', 'quality'], ['Shipped', 'shipped']] as [string, string][]).map(([l, k]) => (
          <span key={k} className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COLORS[k] }} />{l}</span>
        ))}
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: GREEN }} />Delivered</span>
        <span className="inline-flex items-center gap-1.5"><b className="font-semibold leading-none" style={{ color: RED }}>×</b>Refunded or declined</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-ink/40" style={{ backgroundImage: 'repeating-linear-gradient(135deg, rgba(255,255,255,.5) 0 2px, transparent 2px 4px)' }} />Still in this state</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-ink/10" style={{ boxShadow: `0 0 0 1.5px ${RED}` }} />Over SLA</span>
      </div>
      <p className="mt-2 text-xs text-ink/55">Hover a bar for details. Click a row to open it.</p>
      {hover && (() => {
        const W = 300
        const left = Math.min(hover.x + 16, (typeof window !== 'undefined' ? window.innerWidth : 1200) - W - 12)
        const below = hover.y < 300
        const { row, seg } = hover
        const dur = fmtDur(Math.min(seg.end, now) - seg.start)
        return (
          <div className="pointer-events-none fixed z-50 rounded-xl border border-ink/10 bg-white p-3 shadow-xl" style={{ width: W, left, top: below ? hover.y + 18 : undefined, bottom: below ? undefined : (typeof window !== 'undefined' ? window.innerHeight : 800) - hover.y + 18 }}>
            <div className="flex gap-3">
              {row.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={row.image} alt="" className="h-16 w-16 flex-none rounded-lg bg-ink/[0.05] object-cover" />
              ) : (
                <div className="h-16 w-16 flex-none rounded-lg bg-ink/[0.05]" />
              )}
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{row.title}</div>
                <div className="truncate text-xs text-ink/60">{row.customer}</div>
                <div className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold">
                  <span className="h-2 w-2 rounded-full" style={{ background: COLORS[seg.key] }} />
                  {seg.label} · {dur}{seg.open ? ' so far' : ''}
                </div>
              </div>
            </div>
            {seg.late && <div className="mt-2 rounded-md bg-rose/10 px-2 py-1 text-[11px] font-semibold text-rose">Over its SLA, needs attention</div>}
            <dl className="mt-2 space-y-1 border-t border-ink/[0.07] pt-2 text-[11px]">
              <div className="flex gap-2"><dt className="w-16 flex-none text-ink/45">Started</dt><dd>{new Date(seg.start).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</dd></div>
              {(row.facts ?? []).map((f) => (
                <div key={f.label} className="flex gap-2"><dt className="w-16 flex-none text-ink/45">{f.label}</dt><dd className="min-w-0 break-words">{f.value}</dd></div>
              ))}
            </dl>
          </div>
        )
      })()}
    </section>
  )
}
