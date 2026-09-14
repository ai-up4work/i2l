'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Search } from 'lucide-react'
import { StatusPill, type StatusTone } from '@/components/admin/warehouse/status-pill'
import { fetchPurchases, CHANNEL_LABEL, type AdminPurchase, type Channel } from '@/lib/supabase/orders-admin'

const STATUS_TONE: Record<string, StatusTone> = {
  pending: 'amber',
  purchased: 'teal',
  failed: 'rose',
}

export default function PurchasesQueuePage() {
  const [purchases, setPurchases] = useState<AdminPurchase[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [query, setQuery] = useState('')

  useEffect(() => {
    fetchPurchases().then((p) => {
      setPurchases(p)
      setLoading(false)
    })
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return purchases.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false
      if (q && !p.sourceStore.toLowerCase().includes(q) && !(p.orderDisplayId ?? '').toLowerCase().includes(q)) return false
      return true
    })
  }, [purchases, statusFilter, query])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Purchases</h1>
        <p className="mt-1 font-body text-sm text-ink/55">
          {loading ? 'Loading…' : `${filtered.length} of ${purchases.length}`} purchases made on customers'
          behalf, live from the database.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search order ID or source store…"
            className="w-full rounded-xl border border-ink/15 bg-card py-2 pl-9 pr-3 font-body text-sm text-ink outline-none focus:border-teal"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-ink/15 bg-card px-3 py-2 font-body text-sm text-ink outline-none focus:border-teal"
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="purchased">Purchased</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl border border-ink/10 bg-card/60" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink/15 bg-card px-8 py-16 text-center">
          <p className="font-body text-sm text-ink/50">No purchases match this filter.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((p) => (
            <Link
              key={p.id}
              href={`/admin/purchases/${p.id}`}
              className="flex flex-wrap items-center gap-4 rounded-2xl border border-ink/10 bg-card p-4 transition-colors hover:border-teal/40"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-ink">{p.orderDisplayId ?? p.id.slice(0, 8)}</span>
                  <StatusPill label={CHANNEL_LABEL[p.channel]} tone={p.channel === 3 ? 'amber' : 'teal'} />
                </div>
                <p className="mt-1 truncate font-body text-sm text-ink/60">
                  {p.customerName ?? 'Unknown customer'} · {p.sourceStore}
                </p>
              </div>
              <p className="hidden w-28 flex-none text-right font-body text-sm font-semibold text-ink sm:block">
                Rs. {p.amount.toLocaleString()}
              </p>
              <StatusPill label={p.status} tone={STATUS_TONE[p.status] ?? 'amber'} />
              <ChevronRight size={16} className="flex-none text-ink/25" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
