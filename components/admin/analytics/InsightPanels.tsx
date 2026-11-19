'use client'

// components/admin/analytics/InsightPanels.tsx
//
// The decision panels on the Analytics page: period-over-period headline
// numbers, the request → delivered funnel, time in each stage against its
// SLA, live problems, and seller performance. Every figure comes from
// lib/admin/insights.ts (real orders / requests / purchases).

import Link from 'next/link'
import { useMemo } from 'react'
import { useAdminData } from '@/contexts/AdminDataContext'
import { computeAttention, computeFunnel, computePeriodDelta, computeSellers, computeStageTimes } from '@/lib/admin/insights'

const fmtLKR = (n: number) => (n >= 1_000_000 ? `Rs. ${(n / 1_000_000).toFixed(2)}M` : `Rs. ${Math.round(n).toLocaleString()}`)
const fmtHours = (h: number | null) => (h === null ? '—' : h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} d`)
const pctOf = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)

function Delta({ cur, prev, lowerIsBetter = false }: { cur: number; prev: number; lowerIsBetter?: boolean }) {
  if (prev === 0 && cur === 0) return <span className="text-xs text-ink/40">no change</span>
  if (prev === 0) return <span className="text-xs text-ink/40">new</span>
  const change = ((cur - prev) / prev) * 100
  if (Math.abs(change) < 0.5) return <span className="text-xs text-ink/40">no change</span>
  const good = lowerIsBetter ? change < 0 : change > 0
  return (
    <span className={`text-xs font-medium ${good ? 'text-teal-deep' : 'text-rose-700'}`}>
      {change > 0 ? 'up' : 'down'} {Math.abs(Math.round(change))}% on the period before
    </span>
  )
}

const card = 'rounded-2xl border border-ink/10 bg-card p-5'

export default function InsightPanels({ days }: { days: number | null }) {
  const { orders, requestLines, purchases } = useAdminData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const since = useMemo(() => (days === null ? null : Date.now() - days * 24 * 3_600_000), [days])

  const funnel = useMemo(() => computeFunnel(requestLines, orders, since), [requestLines, orders, since])
  const stages = useMemo(() => computeStageTimes(orders, since), [orders, since])
  const attention = useMemo(() => computeAttention(orders, requestLines, purchases), [orders, requestLines, purchases])
  const sellers = useMemo(() => computeSellers(orders, since), [orders, since])
  const delta = useMemo(() => computePeriodDelta(orders, days), [orders, days])

  const funnelRows = [
    { label: 'Requests', n: funnel.requests, color: '#EF9F27' },
    { label: 'Quoted', n: funnel.quoted, color: '#378ADD' },
    { label: 'Paid', n: funnel.paid, color: '#7F77DD' },
    { label: 'Delivered', n: funnel.delivered, color: '#1D9E75' },
  ]
  const leak = (() => {
    let worst = { from: '', to: '', lost: 0 }
    for (let i = 1; i < funnelRows.length; i++) {
      const lost = funnelRows[i - 1].n - funnelRows[i].n
      if (lost > worst.lost) worst = { from: funnelRows[i - 1].label.toLowerCase(), to: funnelRows[i].label.toLowerCase(), lost }
    }
    return worst.lost > 0 ? `Biggest drop-off: ${worst.lost} went from ${worst.from} to not ${worst.to}.` : 'No drop-off yet.'
  })()

  const slowest = [...stages].filter((s) => s.avgHours !== null).sort((a, b) => b.avgHours! / b.slaHours - a.avgHours! / a.slaHours)[0]
  const sellerMax = Math.max(1, ...sellers.map((s) => s.orders))
  const medianRefund = 0.05

  return (
    <div className="flex flex-col gap-4">
      {delta && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className={card}>
            <p className="text-xs text-ink/45">Order value</p>
            <p className="mt-1 font-display text-2xl tabular-nums">{fmtLKR(delta.current.value)}</p>
            <Delta cur={delta.current.value} prev={delta.previous.value} />
          </div>
          <div className={card}>
            <p className="text-xs text-ink/45">Orders placed</p>
            <p className="mt-1 font-display text-2xl tabular-nums">{delta.current.count}</p>
            <Delta cur={delta.current.count} prev={delta.previous.count} />
          </div>
          <div className={card}>
            <p className="text-xs text-ink/45">Request to paid</p>
            <p className="mt-1 font-display text-2xl tabular-nums">{pctOf(funnel.paid, funnel.requests)}%</p>
            <span className="text-xs text-ink/40">{funnel.paid} of {funnel.requests} requests</span>
          </div>
          <div className={card}>
            <p className="text-xs text-ink/45">Refunded orders</p>
            <p className="mt-1 font-display text-2xl tabular-nums">{pctOf(delta.current.refunded, delta.current.count)}%</p>
            <Delta cur={delta.current.refunded} prev={delta.previous.refunded} lowerIsBetter />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className={card}>
          <h2 className="text-sm font-semibold text-ink/80">From request to delivered</h2>
          <p className="mt-1 text-xs text-ink/45">Where customers drop off in this period.</p>
          <div className="mt-4 flex flex-col gap-2.5">
            {funnelRows.map((r) => (
              <div key={r.label} className="flex items-center gap-3 text-xs">
                <span className="w-20 flex-none text-ink/55">{r.label}</span>
                <div className="h-4 flex-1 rounded bg-ink/[0.05]">
                  <div className="h-full rounded" style={{ width: `${pctOf(r.n, funnel.requests)}%`, minWidth: r.n ? 3 : 0, background: r.color }} />
                </div>
                <span className="w-16 flex-none text-right tabular-nums">{r.n} <span className="text-ink/40">({pctOf(r.n, funnel.requests)}%)</span></span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-ink/55">{leak}</p>
        </div>

        <div className={card}>
          <h2 className="text-sm font-semibold text-ink/80">Time in each stage, against SLA</h2>
          <p className="mt-1 text-xs text-ink/45">Average for finished stages. The line marks the SLA.</p>
          <div className="mt-4 flex flex-col gap-3">
            {stages.map((s) => {
              const scale = Math.max(s.slaHours * 1.6, s.avgHours ?? 0, 1)
              const over = s.avgHours !== null && s.avgHours > s.slaHours
              return (
                <div key={s.stage} className="flex items-center gap-3 text-xs">
                  <span className="w-24 flex-none text-ink/55">{s.stage}</span>
                  <div className="relative h-3.5 flex-1 rounded bg-ink/[0.05]">
                    {s.avgHours !== null && (
                      <div className="absolute inset-y-0 left-0 rounded" style={{ width: `${Math.min(100, (s.avgHours / scale) * 100)}%`, background: over ? '#E24B4A' : '#1D9E75' }} />
                    )}
                    <span className="absolute -inset-y-0.5 w-0.5 bg-ink" style={{ left: `${(s.slaHours / scale) * 100}%` }} />
                  </div>
                  <span className="w-20 flex-none text-right tabular-nums">{fmtHours(s.avgHours)}</span>
                </div>
              )
            })}
          </div>
          <p className="mt-4 text-xs text-ink/55">
            {slowest && slowest.avgHours! > slowest.slaHours
              ? `${slowest.stage} is running ${fmtHours(slowest.avgHours! - slowest.slaHours)} over its ${fmtHours(slowest.slaHours)} SLA.`
              : 'Every stage is inside its SLA.'}
          </p>
        </div>

        <div className={card}>
          <h2 className="text-sm font-semibold text-ink/80">Needs attention</h2>
          <p className="mt-1 text-xs text-ink/45">Live problems, right now. Click one to open it.</p>
          {attention.length === 0 ? (
            <p className="mt-4 text-sm text-ink/50">Nothing needs attention.</p>
          ) : (
            <ul className="mt-3 flex flex-col">
              {attention.map((a) => (
                <li key={a.label} className="border-b border-ink/[0.06] last:border-0">
                  <Link href={a.href} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-teal-deep">
                    <span>{a.label}</span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${
                        a.tone === 'danger' ? 'bg-rose-50 text-rose-700' : a.tone === 'warn' ? 'bg-amber-50 text-amber-800' : 'bg-ink/[0.06] text-ink/60'
                      }`}
                    >
                      {a.count}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={card}>
          <h2 className="text-sm font-semibold text-ink/80">Sellers</h2>
          <p className="mt-1 text-xs text-ink/45">Orders, delivery time and refund rate in this period.</p>
          {sellers.length === 0 ? (
            <p className="mt-4 text-sm text-ink/50">No orders in this period.</p>
          ) : (
            <div className="mt-3 flex flex-col gap-2.5">
              {sellers.slice(0, 8).map((s) => (
                <div key={s.seller} className="text-xs">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm text-ink/80">{s.seller}</span>
                    <span className="flex-none tabular-nums text-ink/55">
                      {s.orders} order{s.orders === 1 ? '' : 's'} · {fmtHours(s.avgDeliveryHours)} ·{' '}
                      <span className={s.refundRate > medianRefund ? 'font-semibold text-rose-700' : ''}>{Math.round(s.refundRate * 100)}% refunded</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-ink/[0.06]">
                    <div className="h-full rounded-full bg-teal-deep" style={{ width: `${(s.orders / sellerMax) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
