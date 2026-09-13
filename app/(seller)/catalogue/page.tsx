// app/admin/(sales)/catalogues/page.tsx
//
// Rebuilt from scratch. The old version managed a seller-proposal /
// admin-approve-reject workflow entirely in a mock in-memory array. Per
// the actual decision made for this feature: sellers now log in and edit
// their own products directly (app/seller/(dashboard)/products) — no
// approval step. This page is now a read-mostly overview across every
// manual-mode seller's real catalogue, with the one thing that's still
// genuinely admin's call: the margin (see [catalogueId]/page.tsx).
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { panelClass } from '@/components/admin/seller/shared'

type Row = {
  id: string
  name: string
  category: string | null
  cost_price: number | null
  margin_percent: number | null
  price: number
  currency: string
  stock_count: number | null
  active: boolean
  seller_id: string
  sellers: { name: string; platform_slug: string } | null
}

export default function CataloguesPage() {
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('products')
      .select('id, name, category, cost_price, margin_percent, price, currency, stock_count, active, seller_id, sellers(name, platform_slug)')
      .order('created_at', { ascending: false })
      .then(({ data, error: fetchError }) => {
        if (fetchError) setError(fetchError.message)
        else setRows((data ?? []) as unknown as Row[])
        setLoading(false)
      })
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) => r.name.toLowerCase().includes(q) || r.sellers?.name.toLowerCase().includes(q),
    )
  }, [rows, search])

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-start gap-4">
        <div>
          <h1 className="font-display text-3xl text-ink">Catalogues</h1>
          <p className="mt-1 text-sm text-ink/55">
            Products from every manual-mode seller. Sellers add these directly from their own portal —
            open one here to adjust WishDrop's margin.
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-2 rounded-xl border border-ink/10 bg-card px-3 py-2">
        <Search size={16} className="text-ink/35" />
        <input
          placeholder="Search product or seller…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-transparent text-sm outline-none"
        />
      </div>

      <div className={`mt-4 overflow-hidden ${panelClass}`}>
        {loading ? (
          <div className="flex flex-col items-center gap-2 py-16 text-ink/50">
            <Loader2 size={20} className="animate-spin" />
            <p className="text-sm">Loading catalogue…</p>
          </div>
        ) : error ? (
          <p className="px-5 py-10 text-center text-sm font-semibold text-red-700">{error}</p>
        ) : filtered.length === 0 ? (
          <p className="px-5 py-16 text-center text-sm text-ink/50">
            {rows.length === 0
              ? 'No products yet — nothing shows up here until a manual-mode seller has a login and adds their own products.'
              : 'No products match your search.'}
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink/10 text-xs font-semibold uppercase tracking-wide text-ink/40">
              <tr>
                <th className="px-5 py-3">Product</th>
                <th className="px-5 py-3">Seller</th>
                <th className="px-5 py-3">Cost</th>
                <th className="px-5 py-3">Margin</th>
                <th className="px-5 py-3">Selling price</th>
                <th className="px-5 py-3">Stock</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => router.push(`/admin/catalogues/${r.id}`)}
                  className="cursor-pointer border-b border-ink/5 last:border-0 hover:bg-ink/[0.02]"
                >
                  <td className="px-5 py-3 font-medium text-ink">{r.name}</td>
                  <td className="px-5 py-3 text-ink/70">{r.sellers?.name ?? '—'}</td>
                  <td className="px-5 py-3 text-ink/70">
                    {r.currency} {r.cost_price?.toFixed(2) ?? '—'}
                  </td>
                  <td className="px-5 py-3 text-ink/70">{r.margin_percent ?? '—'}%</td>
                  <td className="px-5 py-3 font-semibold text-ink">
                    {r.currency} {r.price.toFixed(2)}
                  </td>
                  <td className="px-5 py-3 text-ink/70">{r.stock_count ?? '—'}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        r.active ? 'bg-teal/10 text-teal-deep' : 'bg-ink/5 text-ink/40'
                      }`}
                    >
                      {r.active ? 'Active' : 'Hidden'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}