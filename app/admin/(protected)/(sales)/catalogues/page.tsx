// app/admin/(protected)/(sales)/catalogues/page.tsx
//
// Catalogue stores and their products. A catalogue store is a seller with
// no website feed (typically an Instagram / Facebook shop) whose products
// live in our database. Stores are CREATED here ("New store"), not in the
// seller wizard — the wizard's "mock" method is for stores with a custom
// extractor built into the code (see lib/catalogue-stores.ts).
//
// Sellers add products from their own portal (/seller/products); staff
// can also add one on a seller's behalf here ("Add product"), and open
// any product to edit it, change Wishdrop's margin, or hide it.
//
// Reads through /api/admin/catalogues (service role, staff-gated) rather
// than the browser client — RLS only lets the browser read ACTIVE
// products, so hidden ones would silently disappear from this list.
'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Play, Plus, Search, Settings2, Store } from 'lucide-react'
import { panelClass } from '@/components/admin/seller/shared'
import ProductForm, { type ProductFormPayload } from '@/components/catalogue/ProductForm'
import SellerApplications from '@/components/admin/catalogue/SellerApplications'
import { imageThumb, videoPoster } from '@/lib/media'

type Row = {
  id: string
  name: string
  category: string | null
  cost_price: number | null
  margin_percent: number | null
  price: number
  currency: string
  stock_count: number | null
  images: string[] | null
  videos?: string[] | null
  active: boolean
  seller_id: string
  sellers: { name: string; platform_slug: string } | null
}

type SellerOption = {
  id: string
  name: string
  slug: string
  defaultMarginPercent: number
  hasLogin: boolean
  status: string
  logoUrl?: string | null
  kind?: 'catalogue' | 'legacy'
}

function coverOf(r: Row): string | null {
  if (r.images?.[0]) return imageThumb(r.images[0], 120)
  if (r.videos?.[0]) return videoPoster(r.videos[0], 120) || null
  return null
}

export default function CataloguesPage() {
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>([])
  const [sellers, setSellers] = useState<SellerOption[]>([])
  const [needsMigration, setNeedsMigration] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sellerFilter, setSellerFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'hidden'>('all')

  const [adding, setAdding] = useState(false)
  const [addSellerId, setAddSellerId] = useState('')

  useEffect(() => {
    fetch('/api/admin/catalogues')
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error ?? 'Could not load catalogue')
        setRows((body.products ?? []) as Row[])
        setSellers((body.sellers ?? []) as SellerOption[])
        setNeedsMigration(Boolean(body.needsMigration))
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))

    // Links from a store's page: ?store=<id> filters to that store,
    // ?add=<id> opens "Add product" for it.
    const qs = new URLSearchParams(window.location.search)
    const store = qs.get('store')
    const add = qs.get('add')
    if (store) setSellerFilter(store)
    if (add) {
      setAddSellerId(add)
      setAdding(true)
    }
  }, [])

  const countBySeller = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of rows) map.set(r.seller_id, (map.get(r.seller_id) ?? 0) + 1)
    return map
  }, [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (sellerFilter !== 'all' && r.seller_id !== sellerFilter) return false
      if (statusFilter === 'active' && !r.active) return false
      if (statusFilter === 'hidden' && r.active) return false
      return !q || r.name.toLowerCase().includes(q) || (r.sellers?.name ?? '').toLowerCase().includes(q) || (r.category ?? '').toLowerCase().includes(q)
    })
  }, [rows, search, sellerFilter, statusFilter])

  const addSeller = sellers.find((s) => s.id === addSellerId) ?? null
  const categories = useMemo(
    () => Array.from(new Set(rows.map((r) => r.category).filter((c): c is string => Boolean(c)))).sort(),
    [rows],
  )

  function openAdd() {
    setAddSellerId(sellerFilter !== 'all' ? sellerFilter : sellers.length === 1 ? sellers[0].id : '')
    setAdding(true)
  }

  async function handleCreate(payload: ProductFormPayload) {
    const res = await fetch('/api/admin/catalogues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, sellerId: addSellerId }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error ?? 'Could not add the product')
    const p = body.product as Row & { sellers: { name: string; platform_slug: string } | null }
    setRows((prev) => [p, ...prev])
    setAdding(false)
  }

  async function toggleActive(r: Row) {
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, active: !x.active } : x)))
    const res = await fetch(`/api/admin/catalogues/${r.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !r.active }),
    })
    if (!res.ok) {
      setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, active: r.active } : x)))
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Could not update the product')
    }
  }

  if (adding) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <button onClick={() => setAdding(false)} className="flex items-center gap-1.5 text-sm font-semibold text-ink/55 hover:text-ink">
            <ArrowLeft size={15} /> Social Stores
          </button>
          <h1 className="mt-4 font-display text-3xl text-ink">Add a product</h1>
          <p className="mt-1 text-sm text-ink/55">
            For sellers who send you their photos instead of using the seller portal. It appears on their store page as soon as you save.
          </p>

          <div className={`mt-6 p-6 ${panelClass}`}>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-ink/60">Store</span>
              <select
                value={addSellerId}
                onChange={(e) => setAddSellerId(e.target.value)}
                className="w-full rounded-xl border border-ink/15 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-teal"
              >
                <option value="">Choose a store…</option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.defaultMarginPercent}% margin){s.status !== 'active' ? ' — hidden' : ''}
                  </option>
                ))}
              </select>
            </label>

            {!addSeller && <p className="mt-3 text-sm text-ink/50">Choose the store first — photos and videos are filed under its name.</p>}
          </div>

          {addSeller && (
            <div className="mt-4">
              <ProductForm
                key={addSeller.id}
                marginPercent={addSeller.defaultMarginPercent}
                staffSellerId={addSeller.id}
                categorySuggestions={categories}
                collectionsUrl={`/api/admin/catalogues/stores/${addSeller.slug}/collections`}
                submitLabel="Add product"
                onSubmit={handleCreate}
                onCancel={() => setAdding(false)}
              />
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl text-ink">Social Stores</h1>
            <p className="mt-1 max-w-2xl text-sm text-ink/55">
              Stores for sellers with no website to pull products from, such as Instagram and Facebook shops. Create the
              store here, then add its products yourself or give the seller a login to do it.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/admin/catalogues/stores/new"
              className="flex items-center gap-2 rounded-xl border border-ink/15 bg-card px-4 py-2.5 text-sm font-semibold text-ink hover:border-ink/40"
            >
              <Store size={16} /> New store
            </Link>
            <button
              onClick={openAdd}
              disabled={sellers.length === 0}
              className="flex items-center gap-2 rounded-xl bg-teal-deep px-4 py-2.5 text-sm font-semibold text-parchment hover:bg-teal disabled:opacity-50"
            >
              <Plus size={16} /> Add product
            </button>
          </div>
        </div>

        <SellerApplications />

        {needsMigration && (
          <p className="mt-4 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-ink">
            Videos are switched off until the database is updated: run <code className="font-mono text-xs">data/wishdrop-seller-media.sql</code> in the Supabase SQL editor.
          </p>
        )}

        {!loading && !error && sellers.length === 0 && (
          <div className={`mt-5 p-6 ${panelClass}`}>
            <p className="font-semibold text-ink">No catalogue stores yet</p>
            <p className="mt-1 max-w-xl text-sm text-ink/55">
              Create a store for the seller first. It starts hidden, so you can add a logo and products before shoppers
              see it.
            </p>
            <Link href="/admin/catalogues/stores/new" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-teal-deep px-4 py-2.5 text-sm font-semibold text-parchment hover:bg-teal">
              <Store size={16} /> Create the first store
            </Link>
          </div>
        )}

        {/* ── Stores ── click a store to filter the products below;
            the gear opens the store's own page (profile, login, go live). */}
        {sellers.length > 0 && (
          <div className="mt-5 flex gap-3 overflow-x-auto pb-1">
            <button
              onClick={() => setSellerFilter('all')}
              className={`flex-none rounded-2xl border px-4 py-3 text-left ${sellerFilter === 'all' ? 'border-ink bg-ink text-white' : 'border-ink/10 bg-card text-ink hover:border-ink/30'}`}
            >
              <span className="block text-sm font-semibold">All stores</span>
              <span className={`block text-xs ${sellerFilter === 'all' ? 'text-white/70' : 'text-ink/50'}`}>{rows.length} products</span>
            </button>
            {sellers.map((s) => {
              const on = sellerFilter === s.id
              const live = s.status === 'active'
              return (
                <div key={s.id} className={`flex flex-none items-stretch overflow-hidden rounded-2xl border ${on ? 'border-ink bg-ink text-white' : 'border-ink/10 bg-card text-ink hover:border-ink/30'}`}>
                  <button onClick={() => setSellerFilter(s.id)} className="flex items-center gap-3 py-3 pl-3 pr-2 text-left">
                    <span className="grid h-10 w-10 flex-none place-items-center overflow-hidden rounded-full bg-parchment text-sm font-bold text-teal-deep">
                      {s.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imageThumb(s.logoUrl, 100)} alt="" className="h-full w-full object-cover" />
                      ) : (
                        s.name.charAt(0).toUpperCase()
                      )}
                    </span>
                    <span>
                      <span className="block max-w-[180px] truncate text-sm font-semibold">{s.name}</span>
                      <span className={`block text-xs ${on ? 'text-white/70' : 'text-ink/50'}`}>
                        {countBySeller.get(s.id) ?? 0} products · {live ? 'Live' : 'Hidden'}
                        {s.kind === 'legacy' ? ' · old setup' : ''}
                        {!s.hasLogin ? ' · no login' : ''}
                      </span>
                    </span>
                  </button>
                  <Link
                    href={`/admin/catalogues/stores/${s.slug}`}
                    aria-label={`Manage ${s.name}`}
                    title="Store page, login and go live"
                    className={`grid w-10 place-items-center border-l ${on ? 'border-white/20 text-white/80 hover:text-white' : 'border-ink/10 text-ink/45 hover:text-ink'}`}
                  >
                    <Settings2 size={15} />
                  </Link>
                </div>
              )
            })}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-xl border border-ink/10 bg-card px-3 py-2">
            <Search size={16} className="text-ink/35" />
            <input
              placeholder="Search product, seller or category…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="rounded-xl border border-ink/10 bg-card px-3 py-2 text-sm outline-none"
            aria-label="Filter by status"
          >
            <option value="all">Active and hidden</option>
            <option value="active">Active only</option>
            <option value="hidden">Hidden only</option>
          </select>
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
            <div className="px-5 py-16 text-center text-sm text-ink/50">
              {rows.length === 0 ? (
                <>
                  <p>No products yet. Add one for a store, or give the seller a login to add their own.</p>
                  {sellers.length > 0 && (
                    <button onClick={openAdd} className="mt-3 font-semibold text-teal-deep underline">
                      Add the first product
                    </button>
                  )}
                </>
              ) : (
                'No products match.'
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
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
                  {filtered.map((r) => {
                    const cover = coverOf(r)
                    const videoCount = r.videos?.length ?? 0
                    return (
                      <tr
                        key={r.id}
                        onClick={() => router.push(`/admin/catalogues/${r.id}`)}
                        className="cursor-pointer border-b border-ink/5 last:border-0 hover:bg-ink/[0.02]"
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <span className="relative h-11 w-11 flex-none overflow-hidden rounded-lg bg-parchment">
                              {cover && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={cover} alt="" className="h-full w-full object-cover" />
                              )}
                              {videoCount > 0 && (
                                <span className="absolute bottom-0.5 right-0.5 grid h-4 w-4 place-items-center rounded-full bg-ink/75 text-white">
                                  <Play size={8} fill="currentColor" />
                                </span>
                              )}
                            </span>
                            <span className="min-w-0">
                              <span className="block max-w-[260px] truncate font-medium text-ink">{r.name}</span>
                              <span className="block text-xs text-ink/45">
                                {r.category ?? 'No category'} · {r.images?.length ?? 0} photos
                                {videoCount > 0 ? ` · ${videoCount} video${videoCount === 1 ? '' : 's'}` : ''}
                              </span>
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-ink/70">{r.sellers?.name ?? '—'}</td>
                        <td className="px-5 py-3 text-ink/70">
                          {r.currency} {r.cost_price != null ? Number(r.cost_price).toFixed(2) : '—'}
                        </td>
                        <td className="px-5 py-3 text-ink/70">{r.margin_percent ?? '—'}%</td>
                        <td className="px-5 py-3 font-semibold text-ink">
                          {r.currency} {Number(r.price).toFixed(2)}
                        </td>
                        <td className="px-5 py-3 text-ink/70">{r.stock_count ?? '—'}</td>
                        <td className="px-5 py-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              void toggleActive(r)
                            }}
                            title={r.active ? 'Click to hide from the store' : 'Click to show on the store'}
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                              r.active ? 'bg-teal/10 text-teal-deep' : 'bg-ink/5 text-ink/40'
                            }`}
                          >
                            {r.active ? 'Active' : 'Hidden'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
