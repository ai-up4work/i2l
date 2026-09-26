// app/admin/(protected)/super-admin/wishdrop-mall/page.tsx
//
// Wishdrop Mall — Wishdrop's own store, managed as its own sales channel.
// Staff pull products in from any affiliated store's feed or from a
// pasted link (see components/admin/wishdrop-mall/AddProductsPanel.tsx),
// set a price in LKR, and they go on sale at /stores/wishdrop-mall.
// Shoppers pay that price + a flat delivery fee — no tax or import charges.
//
// SUPER ADMIN ONLY — Wishdrop's own store is run by the super admin.
// The page sits under /admin/super-admin/**, which middleware.ts already
// restricts to role === 'super_admin', and every /api/admin/wishdrop-mall
// route checks SUPER_ADMIN_ONLY on the server as well.
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Eye,
  EyeOff,
  Pencil,
  ExternalLink,
  Loader2,
  PackagePlus,
  RefreshCw,
  Search,
  Settings2,
  ShoppingBag,
  Trash2,
} from 'lucide-react'
import AddProductsPanel from '@/components/admin/wishdrop-mall/AddProductsPanel'
import CategoriesPanel from '@/components/admin/wishdrop-mall/CategoriesPanel'
import { EditProductLoader } from '@/components/admin/wishdrop-mall/ProductEditor'
import {
  Dialog,
  ICON_BUTTON,
  INPUT,
  LINK_BUTTON,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  Thumb,
  formatMoney,
  mallApi,
  timeAgo,
} from '@/components/admin/wishdrop-mall/shared'
import {
  MALL_DELIVERY_FEE_LKR,
  approxLKR,
  WISHDROP_MALL_SLUG,
  type MallCategory,
  type MallProductRow,
  type MallStoreRow,
} from '@/lib/wishdrop-mall'

type Tab = 'products' | 'categories' | 'add'
type Visibility = 'all' | 'live' | 'hidden'

export default function WishdropMallPage() {
  const [store, setStore] = useState<MallStoreRow | null>(null)
  const [products, setProducts] = useState<MallProductRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('products')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  // Only super admins can reach this page (see header), and they can delete.
  const canDelete = true

  const load = useCallback(() => {
    setLoading(true)
    setLoadError(null)
    mallApi<{ store: MallStoreRow | null; products: MallProductRow[] }>('/api/admin/wishdrop-mall')
      .then((b) => {
        setStore(b.store)
        setProducts(b.products)
      })
      .catch((e: Error) => setLoadError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 4000)
    return () => window.clearTimeout(t)
  }, [toast])

  // Mall categories (managed in the Categories tab).
  const [categories, setCategories] = useState<MallCategory[]>([])
  const reloadCategories = useCallback(() => {
    mallApi<{ categories: MallCategory[] }>('/api/admin/wishdrop-mall/categories')
      .then((b) => setCategories(b.categories))
      .catch(() => {})
  }, [])
  useEffect(() => {
    if (store) reloadCategories()
  }, [store, reloadCategories])

  /** Apply category moves locally (id -> category id or null), then
   *  refresh counts from the server. */
  const applyCategoryMoves = (changes: Map<string, string | null>) => {
    const nameOf = new Map(categories.map((c) => [c.id, c.name]))
    setProducts((prev) =>
      prev.map((p) =>
        changes.has(p.id)
          ? { ...p, mall_category_id: changes.get(p.id) ?? null, category: nameOf.get(changes.get(p.id) ?? '') ?? 'General' }
          : p,
      ),
    )
    reloadCategories()
  }

  const liveCount = products.filter((p) => p.active).length
  const isLive = store?.status === 'active'

  const updateRow = (row: Partial<MallProductRow> & { id: string }) =>
    setProducts((prev) => prev.map((p) => (p.id === row.id ? { ...p, ...row } : p)))

  const toggleStoreLive = async () => {
    if (!store) return
    try {
      const { store: next } = await mallApi<{ store: MallStoreRow }>('/api/admin/wishdrop-mall', {
        method: 'PATCH',
        body: JSON.stringify({ status: isLive ? 'inactive' : 'active' }),
      })
      setStore(next)
      setToast(next.status === 'active' ? 'Wishdrop Mall is now live for shoppers.' : 'Wishdrop Mall is hidden from shoppers.')
    } catch (e) {
      setToast((e as Error).message)
    }
  }

  // ── Loading / error / not-set-up states ──
  if (loading && !store) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-2 py-32 text-ink/50">
          <Loader2 size={22} className="animate-spin" />
          <p className="text-sm">Loading Wishdrop Mall…</p>
        </div>
      </Shell>
    )
  }
  if (loadError) {
    return (
      <Shell>
        <div className="py-32 text-center">
          <p className="text-sm font-semibold text-rose-700">{loadError}</p>
          <button type="button" onClick={load} className={`${LINK_BUTTON} mt-3`}>
            Try again
          </button>
        </div>
      </Shell>
    )
  }
  if (!store) return <SetupCard onDone={(s) => setStore(s)} />

  return (
    <Shell>
      {/* ── Header ── */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 flex-none place-items-center overflow-hidden rounded-xl bg-teal-deep text-parchment">
            {store.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={store.logo_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <ShoppingBag size={22} strokeWidth={1.75} />
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-3xl font-semibold leading-tight">{store.name}</h1>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                  isLive ? 'bg-teal-deep/10 text-teal-deep' : 'bg-ink/10 text-ink/50'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${isLive ? 'bg-teal-deep' : 'bg-ink/35'}`} />
                {isLive ? 'Live' : 'Hidden from shoppers'}
              </span>
            </div>
            <p className="mt-1 max-w-lg text-sm leading-relaxed text-ink/60">
              Your own store. Pick products from any seller or link, set your price in rupees, and sell them under the Wishdrop
              name. Customers pay your price + {formatMoney(MALL_DELIVERY_FEE_LKR, 'Rs')} delivery — no tax or import charges.
            </p>
            <div className="mt-2 flex flex-wrap gap-4">
              {/* The public store page only shows ACTIVE sellers, so while the
                  Mall is hidden /stores/wishdrop-mall is a 404 — don't offer
                  a link that leads there. */}
              {isLive ? (
                <a href={`/stores/${WISHDROP_MALL_SLUG}`} target="_blank" rel="noreferrer" className={`${LINK_BUTTON} inline-flex items-center gap-1`}>
                  View storefront <ExternalLink size={11} />
                </a>
              ) : (
                <span className="text-xs text-ink/45">
                  Storefront opens at <span className="font-mono">/stores/{WISHDROP_MALL_SLUG}</span> once you click Go live
                </span>
              )}
              <button type="button" onClick={() => setSettingsOpen(true)} className={`${LINK_BUTTON} inline-flex items-center gap-1`}>
                <Settings2 size={11} /> Store settings
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <dl className="flex divide-x divide-ink/10 overflow-x-auto rounded-2xl border border-ink/10 bg-card">
            <Stat label="Products" value={products.length} />
            <Stat label="Live" value={liveCount} />
            <Stat label="Units in stock" value={products.reduce((sum, p) => sum + (p.stock_count ?? 0), 0)} />
            <Stat label="Sold out" value={products.filter((p) => p.stock_count === 0).length} />
            <Stat label="Delivery fee" value={formatMoney(MALL_DELIVERY_FEE_LKR, 'Rs')} />
          </dl>
          <button type="button" onClick={toggleStoreLive} className={isLive ? SECONDARY_BUTTON : PRIMARY_BUTTON}>
            {isLive ? <EyeOff size={15} /> : <Eye size={15} />}
            {isLive ? 'Take offline' : 'Go live'}
          </button>
        </div>
      </div>

      {!isLive && products.length > 0 && (
        <p className="mt-6 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-ink/75">
          The Mall is hidden, so shoppers can&rsquo;t see these {products.length} products yet. Click{' '}
          <strong>Go live</strong> when you&rsquo;re ready.
        </p>
      )}

      {/* ── Tabs ── */}
      <div className="mt-9 flex items-center gap-6 border-b border-ink/10">
        {(
          [
            { key: 'products', label: `Products (${products.length})` },
            { key: 'categories', label: `Categories (${categories.length})` },
            { key: 'add', label: 'Add products' },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 pb-3 text-sm font-semibold transition-colors ${
              tab === t.key ? 'border-teal-deep text-ink' : 'border-transparent text-ink/45 hover:text-ink/75'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'products' ? (
          <ProductsTable
            products={products}
            storeLive={isLive}
            canDelete={canDelete}
            categories={categories}
            onCategoryCreated={(c) => setCategories((prev) => [...prev, c])}
            onCategoryMoves={applyCategoryMoves}
            onChange={(row) => {
              updateRow(row)
              reloadCategories()
            }}
            onRemove={(id) => setProducts((prev) => prev.filter((p) => p.id !== id))}
            onRemoveMany={(ids) => setProducts((prev) => prev.filter((p) => !ids.includes(p.id)))}
            onToast={setToast}
            onAddClick={() => setTab('add')}
          />
        ) : tab === 'categories' ? (
          <CategoriesPanel
            categories={categories}
            products={products}
            onCategoriesChange={setCategories}
            onProductsMoved={applyCategoryMoves}
            onToast={setToast}
          />
        ) : (
          <AddProductsPanel
            existing={products}
            categories={categories}
            onCategoryCreated={(c) => setCategories((prev) => [...prev, c])}
            onAdded={(p) => {
              setProducts((prev) => [p, ...prev])
              reloadCategories()
              setToast(`Added “${p.name}” to ${store.name}.`)
            }}
          />
        )}
      </div>

      {settingsOpen && (
        <SettingsDialog
          store={store}
          onClose={() => setSettingsOpen(false)}
          onSaved={(s) => {
            setStore(s)
            setSettingsOpen(false)
            setToast('Store settings saved.')
          }}
        />
      )}

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-5 py-2.5 text-sm text-parchment shadow-lg">
          {toast}
        </div>
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      <div className="mx-auto max-w-[1560px] px-6 pb-20 pt-10 lg:px-10">{children}</div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="px-5 py-3">
      <dt className="whitespace-nowrap text-xs font-medium text-ink/45">{label}</dt>
      <dd className="mt-0.5 font-display text-xl text-ink">{value}</dd>
    </div>
  )
}

// ─── First-time setup ───────────────────────────────────────────────────

function SetupCard({ onDone }: { onDone: (s: MallStoreRow) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      const { store } = await mallApi<{ store: MallStoreRow }>('/api/admin/wishdrop-mall', { method: 'POST' })
      onDone(store)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Shell>
      <div className="mx-auto mt-16 max-w-xl rounded-2xl border border-ink/10 bg-card p-8 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-teal-deep text-parchment">
          <ShoppingBag size={24} strokeWidth={1.75} />
        </div>
        <h1 className="mt-5 font-display text-3xl font-semibold">Open Wishdrop Mall</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink/60">
          Your own store, sold as its own channel next to your affiliated sellers. It starts hidden, so you can add
          products and set prices before shoppers see it.
        </p>
        <button type="button" onClick={create} disabled={busy} className={`${PRIMARY_BUTTON} mt-6`}>
          {busy && <Loader2 size={14} className="animate-spin" />}
          Set up Wishdrop Mall
        </button>
        {error && <p className="mt-4 text-sm font-semibold text-rose-700">{error}</p>}
      </div>
    </Shell>
  )
}

// ─── Products table ─────────────────────────────────────────────────────

function ProductsTable({
  products,
  storeLive,
  canDelete,
  categories,
  onCategoryCreated,
  onCategoryMoves,
  onChange,
  onRemove,
  onRemoveMany,
  onToast,
  onAddClick,
}: {
  products: MallProductRow[]
  storeLive: boolean
  canDelete: boolean
  categories: MallCategory[]
  onCategoryCreated: (c: MallCategory) => void
  onCategoryMoves: (changes: Map<string, string | null>) => void
  onChange: (row: Partial<MallProductRow> & { id: string }) => void
  onRemove: (id: string) => void
  onRemoveMany: (ids: string[]) => void
  onToast: (msg: string) => void
  onAddClick: () => void
}) {
  const [search, setSearch] = useState('')
  const [visibility, setVisibility] = useState<Visibility>('all')
  const [sourceFilter, setSourceFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Stores/sites products were added from, for "manage everything from one store".
  const sources = useMemo(
    () =>
      Array.from(new Set(products.map((p) => p.source_platform ?? '').filter(Boolean))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [products],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products.filter((p) => {
      if (visibility === 'live' && !p.active) return false
      if (visibility === 'hidden' && p.active) return false
      if (categoryFilter === '__none' && p.mall_category_id) return false
      if (categoryFilter && categoryFilter !== '__none' && p.mall_category_id !== categoryFilter) return false
      if (sourceFilter === '__manual' && p.source_platform) return false
      if (sourceFilter && sourceFilter !== '__manual' && p.source_platform !== sourceFilter) return false
      if (!q) return true
      return (
        p.name.toLowerCase().includes(q) ||
        (p.category ?? '').toLowerCase().includes(q) ||
        (p.source_platform ?? '').toLowerCase().includes(q)
      )
    })
  }, [products, search, visibility, sourceFilter, categoryFilter])

  // Drop selections that are no longer in the list.
  const visibleSelected = filtered.filter((p) => selected.has(p.id)).map((p) => p.id)
  const allVisibleSelected = filtered.length > 0 && visibleSelected.length === filtered.length
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const toggleAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) filtered.forEach((p) => next.delete(p.id))
      else filtered.forEach((p) => next.add(p.id))
      return next
    })

  const moveSelected = async (categoryId: string | null) => {
    const ids = visibleSelected
    if (ids.length === 0) return
    setBulkBusy(true)
    try {
      const { affected } = await mallApi<{ affected: string[] }>('/api/admin/wishdrop-mall/products/bulk', {
        method: 'POST',
        body: JSON.stringify({ ids, action: 'category', categoryId }),
      })
      onCategoryMoves(new Map(affected.map((id) => [id, categoryId])))
      setSelected(new Set())
      const name = categories.find((c) => c.id === categoryId)?.name ?? 'Uncategorized'
      onToast(`${affected.length} product(s) moved to ${name}.`)
    } catch (e) {
      onToast((e as Error).message)
    } finally {
      setBulkBusy(false)
    }
  }

  const runBulk = async (action: 'hide' | 'show' | 'delete') => {
    const ids = visibleSelected
    if (ids.length === 0) return
    if (action === 'delete' && !window.confirm(`Permanently delete ${ids.length} product(s) from the Mall? This can't be undone.`)) return
    setBulkBusy(true)
    try {
      const { affected } = await mallApi<{ affected: string[] }>('/api/admin/wishdrop-mall/products/bulk', {
        method: 'POST',
        body: JSON.stringify({ ids, action }),
      })
      if (action === 'delete') onRemoveMany(affected)
      else affected.forEach((id) => onChange({ id, active: action === 'show' }))
      setSelected(new Set())
      onToast(
        `${affected.length} product(s) ${action === 'delete' ? 'deleted' : action === 'hide' ? 'hidden' : 'now visible'}.`,
      )
    } catch (e) {
      onToast((e as Error).message)
    } finally {
      setBulkBusy(false)
    }
  }

  if (products.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-ink/15 px-6 py-16 text-center">
        <PackagePlus size={24} className="mx-auto text-ink/25" />
        <p className="mt-3 text-sm font-semibold text-ink/70">No products in the Mall yet</p>
        <p className="mt-1 text-xs text-ink/50">Browse a seller&rsquo;s catalogue, paste a product link, or add one manually.</p>
        <button type="button" onClick={onAddClick} className={`${PRIMARY_BUTTON} mt-5`}>
          Add products
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex gap-1 rounded-full border border-ink/10 bg-card p-1">
          {(['all', 'live', 'hidden'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVisibility(v)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold capitalize transition-colors ${
                visibility === v ? 'bg-teal-deep text-parchment' : 'text-ink/55 hover:text-ink/80'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          aria-label="Filter by category"
          className="rounded-full border border-ink/10 bg-card px-4 py-2.5 text-sm text-ink/75 outline-none focus:border-teal/50"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value="__none">Uncategorized</option>
        </select>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          aria-label="Filter by where products came from"
          className="rounded-full border border-ink/10 bg-card px-4 py-2.5 text-sm text-ink/75 outline-none focus:border-teal/50"
        >
          <option value="">All sources</option>
          {sources.map((src) => (
            <option key={src} value={src}>
              From {src}
            </option>
          ))}
          <option value="__manual">Added manually</option>
        </select>
        <div className="relative w-full sm:w-80">
          <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/35" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search product, category or source"
            className="w-full rounded-full border border-ink/10 bg-card py-2.5 pl-9 pr-4 text-sm outline-none placeholder:text-ink/35 focus:border-teal/50 focus:ring-2 focus:ring-teal/15"
          />
        </div>
        </div>
      </div>

      {visibleSelected.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl bg-ink px-4 py-2.5 text-sm text-parchment">
          <span className="mr-2 font-semibold">{visibleSelected.length} selected</span>
          <button type="button" disabled={bulkBusy} onClick={() => runBulk('show')} className="rounded-full bg-parchment/10 px-3 py-1 text-xs font-semibold hover:bg-parchment/20">
            Show
          </button>
          <button type="button" disabled={bulkBusy} onClick={() => runBulk('hide')} className="rounded-full bg-parchment/10 px-3 py-1 text-xs font-semibold hover:bg-parchment/20">
            Hide
          </button>
          <select
            value=""
            disabled={bulkBusy}
            onChange={(e) => e.target.value && moveSelected(e.target.value === '__none' ? null : e.target.value)}
            aria-label="Move selected to category"
            className="rounded-full border-0 bg-parchment/10 px-3 py-1 text-xs font-semibold text-parchment outline-none hover:bg-parchment/20 [&>option]:text-ink"
          >
            <option value="">Move to category…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="__none">Uncategorized</option>
          </select>
          {canDelete && (
            <button type="button" disabled={bulkBusy} onClick={() => runBulk('delete')} className="rounded-full bg-rose-500/80 px-3 py-1 text-xs font-semibold hover:bg-rose-500">
              Delete
            </button>
          )}
          <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-xs text-parchment/70 hover:text-parchment">
            Clear
          </button>
          {bulkBusy && <Loader2 size={14} className="animate-spin" />}
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-2xl border border-ink/10 bg-card">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="border-b border-ink/10 bg-parchment/70 text-xs font-medium text-ink/50">
            <tr>
              <th className="w-10 py-3 pl-5">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                  aria-label="Select all shown products"
                  className="accent-teal-deep"
                />
              </th>
              <th className="px-3 py-3">Product</th>
              <th className="px-3 py-3 text-right">Stock</th>
              <th className="px-3 py-3">Supplier</th>
              <th className="px-3 py-3 text-right">Supplier price</th>
              <th className="px-3 py-3">Price (Rs)</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <ProductRow
                key={p.id}
                product={p}
                storeLive={storeLive}
                canDelete={canDelete}
                selected={selected.has(p.id)}
                onSelect={() => toggleOne(p.id)}
                onEdit={() => setEditingId(p.id)}
                onChange={onChange}
                onRemove={onRemove}
                onToast={onToast}
              />
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="px-5 py-10 text-center text-sm text-ink/50">No products match.</p>}
      </div>

      {editingId && (
        <EditProductLoader
          productId={editingId}
          categories={categories}
          onCategoryCreated={onCategoryCreated}
          onClose={() => setEditingId(null)}
          onSaved={(row) => {
            onChange(row)
            setEditingId(null)
            onToast(`Saved “${row.name}”.`)
          }}
        />
      )}
    </div>
  )
}

function ProductRow({
  product: p,
  storeLive,
  canDelete,
  selected,
  onSelect,
  onEdit,
  onChange,
  onRemove,
  onToast,
}: {
  product: MallProductRow
  storeLive: boolean
  canDelete: boolean
  selected: boolean
  onSelect: () => void
  onEdit: () => void
  onChange: (row: Partial<MallProductRow> & { id: string }) => void
  onRemove: (id: string) => void
  onToast: (msg: string) => void
}) {
  // Products added before LKR pricing existed may still be in another
  // currency — they show an empty price box until one is set.
  const isLKR = p.currency === 'LKR'
  const [price, setPrice] = useState(isLKR ? String(p.price) : '')
  const [busy, setBusy] = useState<null | 'price' | 'active' | 'refresh' | 'delete'>(null)

  useEffect(() => setPrice(p.currency === 'LKR' ? String(p.price) : ''), [p.price, p.currency])

  const patch = async (body: Record<string, unknown>, kind: 'price' | 'active') => {
    setBusy(kind)
    try {
      const { product } = await mallApi<{ product: MallProductRow }>(`/api/admin/wishdrop-mall/products/${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
      onChange(product)
    } catch (e) {
      onToast((e as Error).message)
      setPrice(isLKR ? String(p.price) : '')
    } finally {
      setBusy(null)
    }
  }

  const savePrice = () => {
    const n = Math.round(parseFloat(price))
    if (!Number.isFinite(n) || n <= 0 || (isLKR && n === p.price)) {
      setPrice(isLKR ? String(p.price) : '')
      return
    }
    patch({ priceLKR: n }, 'price')
  }

  const refresh = async () => {
    setBusy('refresh')
    try {
      const res = await mallApi<{
        product: MallProductRow
        warnings: string[]
        sourcePriceChanged: boolean
        previousSourcePrice: number | null
        previousSourceCurrency: string | null
      }>(`/api/admin/wishdrop-mall/products/${p.id}/refresh`, { method: 'POST' })
      onChange(res.product)
      const priceMsg = res.sourcePriceChanged
        ? `Supplier price changed ${formatMoney(res.previousSourcePrice, res.previousSourceCurrency)} → ${formatMoney(res.product.source_price, res.product.source_currency)}. Your price and stock weren't changed.`
        : 'Supplier price unchanged.'
      onToast([priceMsg, ...res.warnings].join(' '))
    } catch (e) {
      onToast((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    if (!window.confirm(`Permanently delete “${p.name}” from the Mall? Its reviews go too. To just stop selling it, hide it instead.`)) return
    setBusy('delete')
    try {
      await mallApi(`/api/admin/wishdrop-mall/products/${p.id}`, { method: 'DELETE' })
      onRemove(p.id)
    } catch (e) {
      onToast((e as Error).message)
      setBusy(null)
    }
  }

  const canRefresh = !!(p.source_handle || p.source_url)

  return (
    <tr className={`border-b border-ink/5 last:border-0 hover:bg-ink/[0.015] ${selected ? 'bg-teal-deep/[0.04]' : ''}`}>
      <td className="py-3 pl-5">
        <input type="checkbox" checked={selected} onChange={onSelect} aria-label={`Select ${p.name}`} className="accent-teal-deep" />
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-3">
          <Thumb src={p.images[0]} alt={p.name} />
          <div className="min-w-0">
            {storeLive && p.active ? (
              <a
                href={`/stores/${WISHDROP_MALL_SLUG}/product/${encodeURIComponent(p.handle)}`}
                target="_blank"
                rel="noreferrer"
                className="line-clamp-1 font-medium text-ink hover:text-teal-deep"
              >
                {p.name}
              </a>
            ) : (
              // Not publicly visible yet (store or product hidden) — the
              // product page would 404, so no link.
              <span className="line-clamp-1 font-medium text-ink">{p.name}</span>
            )}
            <p className="text-xs text-ink/45">
              {p.category ?? 'General'}
              {p.variant_count > 0 ? ` · ${p.variant_count} options` : ''}
            </p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 text-right tabular-nums">
        {p.stock_count == null ? (
          <span className="text-ink/40">—</span>
        ) : p.stock_count === 0 ? (
          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">Sold out</span>
        ) : (
          <span className={`font-semibold ${p.stock_count <= 3 ? 'text-gold-deep' : 'text-ink'}`}>{p.stock_count}</span>
        )}
      </td>
      <td className="px-3 py-3">
        {p.source_url ? (
          <a href={p.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ink/70 hover:text-teal-deep">
            {p.source_platform ?? 'Source'} <ExternalLink size={11} />
          </a>
        ) : (
          <span className="text-ink/60">{p.source_platform ?? '—'}</span>
        )}
        <p className="text-xs text-ink/40">checked {timeAgo(p.source_synced_at)}</p>
      </td>
      <td className="px-3 py-3 text-right tabular-nums text-ink/70">
        {formatMoney(p.source_price, p.source_currency)}
        {p.source_price != null && p.source_currency && p.source_currency !== 'LKR' && (
          <p className="text-xs text-ink/40">≈ {formatMoney(approxLKR(p.source_price, p.source_currency), 'Rs')}</p>
        )}
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-2">
          <div className="relative w-28">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-ink/40">Rs</span>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ''))}
              onBlur={savePrice}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              inputMode="numeric"
              placeholder={isLKR ? undefined : 'Set price'}
              aria-label={`Price for ${p.name} in rupees`}
              className={`${INPUT} py-1.5 pl-8 text-right font-semibold tabular-nums ${!isLKR ? 'border-gold/60' : ''}`}
              disabled={busy === 'price'}
            />
          </div>
          {busy === 'price' && <Loader2 size={13} className="animate-spin text-ink/40" />}
        </div>
        {isLKR && p.compare_at_price != null && (
          <p className="mt-0.5 text-xs text-ink/40 line-through">{formatMoney(p.compare_at_price, 'Rs')}</p>
        )}
        {!isLKR && <p className="mt-0.5 text-xs text-gold-deep">Needs a rupee price</p>}
      </td>
      <td className="px-3 py-3">
        <button
          type="button"
          onClick={() => patch({ active: !p.active }, 'active')}
          disabled={busy === 'active'}
          className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
            p.active ? 'bg-teal-deep/10 text-teal-deep hover:bg-teal-deep/20' : 'bg-ink/5 text-ink/45 hover:bg-ink/10'
          }`}
          title={p.active ? 'Click to hide' : 'Click to show'}
        >
          {busy === 'active' ? '…' : p.active ? 'Live' : 'Hidden'}
        </button>
      </td>
      <td className="px-3 py-3">
        <div className="flex justify-end gap-1">
          <button type="button" onClick={onEdit} disabled={busy !== null} className={ICON_BUTTON} aria-label="Edit product" title="Edit everything">
            <Pencil size={14} />
          </button>
          <button
            type="button"
            onClick={refresh}
            disabled={!canRefresh || busy !== null}
            className={ICON_BUTTON}
            title={canRefresh ? 'Check supplier price (never changes your price or stock)' : 'No supplier link to check'}
            aria-label="Check supplier price"
          >
            <RefreshCw size={14} className={busy === 'refresh' ? 'animate-spin' : ''} />
          </button>
          {canDelete && (
            <button type="button" onClick={remove} disabled={busy !== null} className={`${ICON_BUTTON} hover:text-rose-700`} aria-label="Delete product" title="Delete permanently">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

// ─── Store settings ─────────────────────────────────────────────────────

function SettingsDialog({
  store,
  onClose,
  onSaved,
}: {
  store: MallStoreRow
  onClose: () => void
  onSaved: (s: MallStoreRow) => void
}) {
  const [name, setName] = useState(store.name)
  const [description, setDescription] = useState(store.description ?? '')
  const [logoUrl, setLogoUrl] = useState(store.logo_url ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const { store: next } = await mallApi<{ store: MallStoreRow }>('/api/admin/wishdrop-mall', {
        method: 'PATCH',
        body: JSON.stringify({ name, description, logoUrl }),
      })
      onSaved(next)
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  return (
    <Dialog
      title="Store settings"
      subtitle="How the Mall appears to shoppers"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className={SECONDARY_BUTTON} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={PRIMARY_BUTTON} onClick={save} disabled={saving || !name.trim()}>
            {saving && <Loader2 size={14} className="animate-spin" />}
            Save
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="text-xs font-semibold text-ink/60">Store name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={`${INPUT} mt-1`} />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-ink/60">Description</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={`${INPUT} mt-1 resize-none`} />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-ink/60">Logo URL</span>
          <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…" className={`${INPUT} mt-1`} />
        </label>
        <p className="text-xs text-ink/50">
          Pricing: each product&rsquo;s rupee price is set on the product itself. Customers pay that price plus a flat{' '}
          {formatMoney(MALL_DELIVERY_FEE_LKR, 'Rs')} delivery fee, with no tax or import charges.
        </p>
        {error && <p className="text-sm font-semibold text-rose-700">{error}</p>}
      </div>
    </Dialog>
  )
}
