'use client'

// components/admin/dashboard/ActivityHeatmap.tsx
//
// GitHub-style activity grid: one square per day over the last 30 weeks,
// darker = more. Switch between orders placed, requests received and
// order value. Click a day to list what happened and jump to each one.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useAdminData } from '@/contexts/AdminDataContext'
import { dayKey, DAY } from '@/lib/admin/timeline'

type Metric = 'orders' | 'requests' | 'value'
const WEEKS = 30
const CELL = 20
const GAP = 4
const TEAL = '29,158,117'

const fmtLKR = (n: number) => (n >= 1_000_000 ? `Rs. ${(n / 1_000_000).toFixed(2)}M` : `Rs. ${Math.round(n).toLocaleString()}`)

export default function ActivityHeatmap() {
  const { orders, requestLines: requests } = useAdminData()
  const [metric, setMetric] = useState<Metric>('orders')
  const [picked, setPicked] = useState<string | null>(null)

  const { cells, byDay } = useMemo(() => {
    const byDay = new Map<string, { orders: typeof orders; requests: typeof requests; value: number }>()
    const get = (k: string) => {
      let e = byDay.get(k)
      if (!e) byDay.set(k, (e = { orders: [], requests: [], value: 0 }))
      return e
    }
    for (const o of orders) {
      const e = get(dayKey(new Date(o.placedAt).getTime()))
      e.orders.push(o)
      e.value += o.totalValue
    }
    for (const r of requests) get(dayKey(new Date(r.submittedAt).getTime())).requests.push(r)

    // Columns are weeks (Mon..Sun), ending with the current week.
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const dow = (today.getDay() + 6) % 7 // Mon=0
    const start = today.getTime() - (dow + (WEEKS - 1) * 7) * DAY
    const cells = Array.from({ length: WEEKS * 7 }, (_, i) => {
      const ms = start + i * DAY
      return { ms, key: dayKey(ms), future: ms > today.getTime() }
    })
    return { cells, byDay }
  }, [orders, requests])

  const valueOf = (k: string) => {
    const e = byDay.get(k)
    if (!e) return 0
    return metric === 'orders' ? e.orders.length : metric === 'requests' ? e.requests.length : e.value
  }
  const max = Math.max(1, ...cells.map((c) => valueOf(c.key)))
  const level = (v: number) => (v <= 0 ? 0 : v / max > 0.75 ? 1 : v / max > 0.5 ? 0.65 : v / max > 0.25 ? 0.4 : 0.18)

  const total = cells.reduce((n, c) => n + valueOf(c.key), 0)
  const label = metric === 'orders' ? 'orders' : metric === 'requests' ? 'requests' : ''
  const sel = picked ? byDay.get(picked) : null

  const btn = (on: boolean) =>
    `rounded-full px-3 py-1 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-teal/40 ${
      on ? 'bg-teal-deep text-parchment' : 'border border-ink/10 bg-card text-ink/60 hover:text-ink'
    }`

  return (
    <section className="rounded-2xl border border-ink/10 bg-card p-5" aria-label="Activity">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink/80">Activity</h2>
          <p className="mt-1 text-xs text-ink/45">
            {metric === 'value' ? fmtLKR(total) : `${total} ${label}`} in the last {WEEKS} weeks. Click a day to see what came in.
          </p>
        </div>
        <div className="flex gap-1" role="radiogroup" aria-label="Measure">
          {([['orders', 'Orders'], ['requests', 'Requests'], ['value', 'Order value']] as [Metric, string][]).map(([m, l]) => (
            <button key={m} type="button" role="radio" aria-checked={metric === m} className={btn(metric === m)} onClick={() => setMetric(m)}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto pb-1">
        <div
          style={{
            display: 'grid',
            gridAutoFlow: 'column',
            gridTemplateRows: `repeat(7, ${CELL}px)`,
            gridTemplateColumns: `repeat(${WEEKS}, minmax(0, 1fr))`,
            gap: GAP,
            width: '100%',
          }}
        >
          {cells.map((c) => {
            const v = valueOf(c.key)
            const l = level(v)
            const text = `${new Date(c.ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}: ${
              metric === 'value' ? fmtLKR(v) : `${v} ${label}`
            }`
            return (
              <button
                key={c.key}
                type="button"
                title={text}
                aria-label={text}
                disabled={c.future}
                onClick={() => setPicked(picked === c.key ? null : c.key)}
                className="rounded-[2px] outline-none focus-visible:ring-2 focus-visible:ring-teal/60"
                style={{
                  width: '100%',
                  height: CELL,
                  background: c.future ? 'transparent' : l ? `rgba(${TEAL},${l})` : 'rgba(0,0,0,0.06)',
                  boxShadow: picked === c.key ? '0 0 0 1.5px currentColor' : undefined,
                }}
              />
            )
          })}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-ink/45">
        Less
        {[0.18, 0.4, 0.65, 1].map((a) => (
          <i key={a} className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: `rgba(${TEAL},${a})` }} />
        ))}
        More
      </div>

      {picked && (
        <div className="mt-4 rounded-xl border border-ink/10 bg-parchment p-3 text-sm">
          <p className="text-xs font-semibold text-ink/60">
            {new Date(`${picked}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          {!sel || (!sel.orders.length && !sel.requests.length) ? (
            <p className="mt-1 text-xs text-ink/50">Nothing came in this day.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1">
              {sel.orders.slice(0, 12).map((o) => (
                <li key={o.id}>
                  <Link href={`/admin/orders/${o.id}`} className="text-xs text-teal-deep hover:underline">
                    {o.id}
                  </Link>{' '}
                  <span className="text-xs text-ink/55">{o.customerName} · {o.stage} · {fmtLKR(o.totalValue)}</span>
                </li>
              ))}
              {sel.requests.slice(0, 12).map((r) => (
                <li key={r.id}>
                  <Link href={`/admin/requests/${r.id}`} className="text-xs text-teal-deep hover:underline">
                    {r.displayId ?? r.id}
                  </Link>{' '}
                  <span className="text-xs text-ink/55">{r.customerName} · {r.status.replace(/_/g, ' ')}</span>
                </li>
              ))}
              {sel.orders.length + sel.requests.length > 24 && <li className="text-xs text-ink/45">…and more</li>}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
