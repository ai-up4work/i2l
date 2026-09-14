'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useAdminData } from '@/contexts/AdminDataContext'
import { OrderQueueTable } from '@/components/admin/orders/OrderQueueTable'
import {
  fetchAdminOrders,
  fetchSites,
  STAGE_LABEL,
  STAGE_ORDER,
  CHANNEL_LABEL,
  type AdminOrder,
  type Channel,
} from '@/lib/supabase/orders-admin'

// Single lifecycle view of every order across all 3 channels — independent
// of the warehouse queue pages, which each show one stage's slice of this
// same data. Real data: reads the same `orders` table the customer-facing
// "My Orders" page reads, so anything changed here (or by a warehouse
// queue action) is what the customer sees on their next load.
export default function AdminOrdersPage() {
  const { permissions } = useAdminData()
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [sites, setSites] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)

  const [query, setQuery] = useState('')
  const [channelFilter, setChannelFilter] = useState<Channel | 'all'>('all')
  const [stageFilter, setStageFilter] = useState<string>('all')
  const [siteFilter, setSiteFilter] = useState<string>('all')
  const [delayedOnly, setDelayedOnly] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchAdminOrders(), fetchSites()]).then(([o, s]) => {
      if (cancelled) return
      setOrders(o)
      setSites(s)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return orders.filter((o) => {
      if (channelFilter !== 'all' && o.channel !== channelFilter) return false
      if (stageFilter !== 'all' && o.stage !== stageFilter) return false
      if (siteFilter !== 'all' && o.siteId !== siteFilter) return false
      if (delayedOnly && !o.delayed) return false
      if (q && !o.displayId.toLowerCase().includes(q) && !o.customerName.toLowerCase().includes(q)) return false
      return true
    })
  }, [orders, channelFilter, stageFilter, siteFilter, delayedOnly, query])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Orders</h1>
        <p className="mt-1 font-body text-sm text-ink/55">
          {loading ? 'Loading…' : `${filtered.length} of ${orders.length} orders`} — every channel,
          every site, live from the database.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search order ID or customer…"
            className="w-full rounded-xl border border-ink/15 bg-card py-2 pl-9 pr-3 font-body text-sm text-ink outline-none focus:border-teal"
          />
        </div>

        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value === 'all' ? 'all' : (Number(e.target.value) as Channel))}
          className="rounded-xl border border-ink/15 bg-card px-3 py-2 font-body text-sm text-ink outline-none focus:border-teal"
        >
          <option value="all">All channels</option>
          {([1, 2, 3] as Channel[]).map((c) => (
            <option key={c} value={c}>
              {CHANNEL_LABEL[c]}
            </option>
          ))}
        </select>

        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          className="rounded-xl border border-ink/15 bg-card px-3 py-2 font-body text-sm text-ink outline-none focus:border-teal"
        >
          <option value="all">All stages</option>
          {STAGE_ORDER.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABEL[s]}
            </option>
          ))}
        </select>

        {sites.length > 0 && (
          <select
            value={siteFilter}
            onChange={(e) => setSiteFilter(e.target.value)}
            className="rounded-xl border border-ink/15 bg-card px-3 py-2 font-body text-sm text-ink outline-none focus:border-teal"
          >
            <option value="all">All sites</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}

        <label className="flex items-center gap-2 rounded-xl border border-ink/15 bg-card px-3 py-2 font-body text-sm text-ink/70">
          <input type="checkbox" checked={delayedOnly} onChange={(e) => setDelayedOnly(e.target.checked)} />
          Delayed only
        </label>
      </div>

      {!permissions.canMutateOrderStage && (
        <p className="font-body text-xs text-ink/40">
          Viewing read-only — your role doesn't have order-stage mutation controls.
        </p>
      )}

      <OrderQueueTable orders={filtered} detailBasePath="/admin/orders" loading={loading} />
    </div>
  )
}
