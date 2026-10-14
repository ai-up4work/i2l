// app/admin/(protected)/(sales)/catalogues/page.tsx
//
// Social Stores: sellers with no website feed (typically Instagram /
// Facebook shops) whose products live in our database. Stores are
// CREATED here ("New store"), never in the seller wizard — the wizard's
// "mock" method is an extractor store and lives in Admin → Sellers
// (lib/catalogue-stores.ts decides by the saved store type).
//
// Two views on one page, same layout recipe as Admin → Sellers
// (components/admin/catalogue/ui.tsx):
//   Stores   — a card per store: status, products, login, location.
//   Products — every product across the stores, filterable.
// Staff can add a product on a seller's behalf ("Add product"), and open
// any product to edit it, change Wishdrop's margin, or hide it.
//
// Reads through /api/admin/catalogues (service role, staff-gated) rather
// than the browser client — RLS only lets the browser read ACTIVE
// products, so hidden ones would silently disappear from this list.
'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, Inbox, KeyRound, Package, Play, Plus, SearchX, Store } from 'lucide-react'
import ProductForm, { type ProductFormPayload } from '@/components/catalogue/ProductForm'
import SellerApplications from '@/components/admin/catalogue/SellerApplications'
import { imageThumb, videoPoster } from '@/lib/media'
import type { StoreOrigin } from '@/lib/store-origin'
import {
  BackLink,
  btnLink,
  btnPrimary,
  btnSecondary,
  btnSmall,
  card,
  FieldLabel,
  IconTile,
  input,
  Notice,
  OriginTag,
  PageHeader,
  PageShell,
  PillTabs,
  SearchInput,
  Section,
  StateShell,
  StatStrip,
  StatusPill,
  StoreAvatar,
} from '@/components/admin/catalogue/ui'

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
  coverUrl?: string | null
  tagline?: string | null
  origin?: StoreOrigin
}

type View = 'stores' | 'products'
type StatusFilter = 'all' | 'active' | 'hidden'

// Product rows share one grid so the sticky header lines up (Sellers page recipe).
const PRODUCT_GRID = 'sm:grid-cols-[minmax(0,2.4fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,0.6fr)_minmax(0,0.9fr)_minmax(0,0.5fr)_minmax(0,0.7fr)]'

function coverOf(r: Row): string | null {
  if (r.images?.[0]) return imageThumb(r.images[0], 120)
  if (r.videos?.[0]) return videoPoster(r.videos[0], 120) || null
  return null
}

function money(currency: string, value: number | null | undefined): string {
  if (value == null) return '—'
  return `${currency} ${Number(value).toLocaleString('en-LK', { maximumFractionDigits: 2 })}`
}

export default function CataloguesPage() {
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>([])
  const [sellers, setSellers] = useState<SellerOption[]>([])
  const [needsMigration, setNeedsMigration] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const [view, setView] = useState<View>('stores')
  const [search, setSearch] = useState('')
  const [sellerFilter, setSellerFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const [adding, setAdding] = useState(false)
  const [addSellerId, setAddSellerId] = useState('')

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch('/api/admin/catalogues')
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error ?? 'Could not load Social Stores')
        setRows((body.products ?? []) as Row[])
        setSellers((body.sellers ?? []) as SellerOption[])
        setNeedsMigration(Boolean(body.needsMigration))
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [reloadKey])

  useEffect(() => {
    // Links from a store's page: ?store=<id> opens that store's products,
    // ?add=<id> opens "Add product" for it.
    const qs = new URLSearchParams(window.location.search)
    const store = qs.get('store')
    const add = qs.get('add')
    if (store) {
      setSellerFilter(store)
      setView('products')
    }
    if (add) {
      setAddSellerId(add)
      setAdding(true)
    }
  }, [])

  const countsBySeller = useMemo(() => {
    const map = new Map<string, { total: number; active: number }>()
    for (const r of rows) {
      const c = map.get(r.seller_id) ?? { total: 0, active: 0 }
      c.total += 1
      if (r.active) c.active += 1
      map.set(r.seller_id, c)
    }
    return map
  }, [rows])

  const q = search.trim().toLowerCase()

  const visibleStores = useMemo(
    () => sellers.filter((s) => !q || s.name.toLowerCase().includes(q) || s.slug.includes(q) || (s.tagline ?? '').toLowerCase().includes(q)),
    [sellers, q],
  )

  const storeScopedRows = useMemo(
    () =>
      rows.filter((r) => {
        if (sellerFilter !== 'all' && r.seller_id !== sellerFilter) return false
        return !q || r.name.toLowerCase().includes(q) || (r.sellers?.name ?? '').toLowerCase().includes(q) || (r.category ?? '').toLowerCase().includes(q)
      }),
    [rows, sellerFilter, q],
  )
  const visibleRows = useMemo(
    () => storeScopedRows.filter((r) => statusFilter === 'all' || (statusFilter === 'active' ? r.active : !r.active)),
    [storeScopedRows, statusFilter],
  )

  const addSeller = sellers.find((s) => s.id === addSellerId) ?? null
  const categories = useMemo(
    () => Array.from(new Set(rows.map((r) => r.category).filter((c): c is string => Boolean(c)))).sort(),
    [rows],
  )

  const settled = !loading && !error
  const stat = (n: number) => (settled ? n : '—')
  const liveStores = sellers.filter((s) => s.status === 'active').length
  const hiddenProducts = rows.filter((r) => !r.active).length

  function openAdd(sellerId?: string) {
    setAddSellerId(sellerId ?? (sellerFilter !== 'all' ? sellerFilter : sellers.length === 1 ? sellers[0].id : ''))
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
    const p = body.product as Row
    setRows((prev) => [p, ...prev])
    setAdding(false)
    setSellerFilter(p.seller_id)
    setView('products')
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

  // ── Add product ─────────────────────────────────────────────────────────
  if (adding) {
    return (
      <PageShell>
        <BackLink onClick={() => setAdding(false)} />
        <PageHeader
          leading={
            <IconTile>
              <Plus size={22} strokeWidth={1.75} />
            </IconTile>
          }
          title="Add a product"
          meta="For sellers who send you their photos instead of using the seller portal. It appears on their store as soon as you save it as Active."
        />

        <Section className="mt-8" title="Store" description="Photos and videos are filed under the store, so choose it first.">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,420px)_1fr] sm:items-end">
            <FieldLabel label="Which store is this for?">
              <select value={addSellerId} onChange={(e) => setAddSellerId(e.target.value)} className={input}>
                <option value="">Choose a store…</option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.defaultMarginPercent}% margin{s.status !== 'active' ? ' · hidden' : ''}
                  </option>
                ))}
              </select>
            </FieldLabel>
            {addSeller && (
              <div className="flex items-center gap-3 text-sm text-ink/60">
                <StoreAvatar name={addSeller.name} logoUrl={addSeller.logoUrl} size={36} />
                <span>
                  New products get <strong className="text-ink">{addSeller.defaultMarginPercent}%</strong> margin. You can change it per product.
                </span>
                {addSeller.origin && <OriginTag origin={addSeller.origin} />}
              </div>
            )}
          </div>
        </Section>

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
              local={addSeller.origin === 'LK'}
              onCancel={() => setAdding(false)}
            />
          </div>
        )}
      </PageShell>
    )
  }

  // ── List ───────────────────────────────────────────────────────────────
  return (
    <PageShell>
      <PageHeader
        leading={
          <IconTile>
            <Store size={22} strokeWidth={1.75} />
          </IconTile>
        }
        title="Social Stores"
        meta="Instagram and Facebook sellers with no website to pull products from. Create the store here, then add its products yourself or give the seller a login."
        actions={
          <StatStrip
            stats={[
              { label: 'Stores', value: stat(sellers.length) },
              { label: 'Live', value: stat(liveStores) },
              { label: 'Products', value: stat(rows.length) },
              { label: 'Hidden products', value: stat(hiddenProducts), tone: settled && hiddenProducts > 0 ? 'gold' : undefined },
            ]}
          />
        }
      />

      <SellerApplications />

      {needsMigration && (
        <div className="mt-4">
          <Notice>
            Some columns are missing. Run <code className="font-mono text-xs">data/wishdrop-seller-media.sql</code> and{' '}
            <code className="font-mono text-xs">data/wishdrop-store-types-and-location.sql</code> in the Supabase SQL editor.
          </Notice>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="mt-8 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <PillTabs<View>
          label="View"
          value={view}
          onChange={setView}
          tabs={[
            { key: 'stores', label: 'Stores', count: settled ? sellers.length : undefined },
            { key: 'products', label: 'Products', count: settled ? rows.length : undefined },
          ]}
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={view === 'stores' ? 'Search stores' : 'Search product, store or category'}
          />
          <Link href="/admin/catalogues/stores/new" className={btnSecondary}>
            <Store size={15} aria-hidden /> New store
          </Link>
          <button type="button" onClick={() => openAdd()} disabled={sellers.length === 0} className={btnPrimary}>
            <Plus size={15} strokeWidth={2.5} aria-hidden /> Add product
          </button>
        </div>
      </div>

      {loading ? (
        <div className={`mt-4 ${card}`}>
          <StateShell title="Loading Social Stores…" />
        </div>
      ) : error ? (
        <div className={`mt-4 ${card}`}>
          <StateShell
            icon={<Inbox size={22} className="text-rose-400" />}
            title={error}
            action={
              <button type="button" onClick={() => setReloadKey((k) => k + 1)} className={btnLink}>
                Try again
              </button>
            }
          />
        </div>
      ) : view === 'stores' ? (
        <StoresGrid
          stores={visibleStores}
          totalStores={sellers.length}
          searching={q !== ''}
          counts={countsBySeller}
          onClearSearch={() => setSearch('')}
          onShowProducts={(id) => {
            setSellerFilter(id)
            setStatusFilter('all')
            setView('products')
          }}
          onAddProduct={(id) => openAdd(id)}
        />
      ) : (
        <>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <select
              value={sellerFilter}
              onChange={(e) => setSellerFilter(e.target.value)}
              aria-label="Filter by store"
              className="rounded-full border border-ink/10 bg-card px-4 py-2 text-xs font-semibold text-ink/70 outline-none focus:border-teal/50"
            >
              <option value="all">All stores</option>
              {sellers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <PillTabs<StatusFilter>
              label="Filter by status"
              value={statusFilter}
              onChange={setStatusFilter}
              tabs={[
                { key: 'all', label: 'All', count: storeScopedRows.length },
                { key: 'active', label: 'Active', count: storeScopedRows.filter((r) => r.active).length },
                { key: 'hidden', label: 'Hidden', count: storeScopedRows.filter((r) => !r.active).length },
              ]}
            />
            <p className="text-xs text-ink/45 sm:ml-auto">
              {visibleRows.length} of {rows.length} products shown
            </p>
          </div>

          <div className={`mt-3 overflow-clip ${card}`}>
            <div className={`sticky top-0 z-10 hidden items-center gap-3 border-b border-ink/10 bg-parchment/80 px-5 py-3 text-xs font-medium text-ink/50 backdrop-blur sm:grid ${PRODUCT_GRID}`}>
              <span>Product</span>
              <span>Store</span>
              <span className="text-right">Seller&rsquo;s price</span>
              <span className="text-right">Margin</span>
              <span className="text-right">Listed at</span>
              <span className="text-right">Stock</span>
              <span className="text-right">Status</span>
            </div>

            {visibleRows.length === 0 ? (
              rows.length === 0 ? (
                <StateShell
                  icon={<Package size={22} className="text-ink/25" />}
                  title="No products yet"
                  body="Add one for a store, or give the seller a login so they can add their own."
                  action={
                    sellers.length > 0 ? (
                      <button type="button" onClick={() => openAdd()} className={btnLink}>
                        Add the first product
                      </button>
                    ) : undefined
                  }
                />
              ) : (
                <StateShell
                  icon={<SearchX size={22} className="text-ink/25" />}
                  title="No products match"
                  body="Try another store, status or search."
                  action={
                    <button
                      type="button"
                      onClick={() => {
                        setSearch('')
                        setSellerFilter('all')
                        setStatusFilter('all')
                      }}
                      className={btnLink}
                    >
                      Clear filters
                    </button>
                  }
                />
              )
            ) : (
              visibleRows.map((r) => <ProductRow key={r.id} row={r} onOpen={() => router.push(`/admin/catalogues/${r.id}`)} onToggle={() => void toggleActive(r)} />)
            )}
          </div>
        </>
      )}
    </PageShell>
  )
}

// ─── Stores view ────────────────────────────────────────────────────────────

function StoresGrid({
  stores,
  totalStores,
  searching,
  counts,
  onClearSearch,
  onShowProducts,
  onAddProduct,
}: {
  stores: SellerOption[]
  totalStores: number
  searching: boolean
  counts: Map<string, { total: number; active: number }>
  onClearSearch: () => void
  onShowProducts: (id: string) => void
  onAddProduct: (id: string) => void
}) {
  if (totalStores === 0) {
    return (
      <div className={`mt-4 ${card}`}>
        <StateShell
          icon={<Store size={22} className="text-ink/25" />}
          title="No social stores yet"
          body="Create a store for the seller first. It starts hidden, so you can add a logo and products before shoppers see it."
          action={
            <Link href="/admin/catalogues/stores/new" className={btnPrimary}>
              <Store size={15} aria-hidden /> Create the first store
            </Link>
          }
        />
      </div>
    )
  }
  if (stores.length === 0 && searching) {
    return (
      <div className={`mt-4 ${card}`}>
        <StateShell
          icon={<SearchX size={22} className="text-ink/25" />}
          title="No stores match this search"
          action={
            <button type="button" onClick={onClearSearch} className={btnLink}>
              Clear search
            </button>
          }
        />
      </div>
    )
  }

  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {stores.map((s) => {
        const c = counts.get(s.id) ?? { total: 0, active: 0 }
        const live = s.status === 'active'
        return (
          <article key={s.id} className={`group flex flex-col overflow-hidden transition-shadow hover:shadow-[0_18px_40px_-28px_rgba(32,36,43,0.45)] ${card}`}>
            <Link href={`/admin/catalogues/stores/${s.slug}`} className="relative block h-24 bg-gradient-to-br from-teal-deep/80 to-teal/60">
              {s.coverUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageThumb(s.coverUrl, 600)} alt="" className="h-full w-full object-cover" />
              )}
              <span className="absolute right-3 top-3">
                <StatusPill tone={live ? 'live' : 'hidden'}>{live ? 'Live' : 'Hidden'}</StatusPill>
              </span>
            </Link>
            <div className="flex flex-1 flex-col px-5 pb-5">
              <div className="-mt-7 flex items-end justify-between gap-2">
                <span className="rounded-full border-4 border-card">
                  <StoreAvatar name={s.name} logoUrl={s.logoUrl} size={52} />
                </span>
                {s.origin && <OriginTag origin={s.origin} />}
              </div>
              <Link href={`/admin/catalogues/stores/${s.slug}`} className="mt-2 block truncate font-display text-lg font-semibold text-ink hover:text-teal-deep">
                {s.name}
              </Link>
              <p className="truncate text-xs text-ink/45">{s.tagline || `/stores/${s.slug}`}</p>

              <dl className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-parchment/70 px-3 py-2.5 text-center">
                <div>
                  <dt className="text-[11px] text-ink/45">Products</dt>
                  <dd className="font-display text-base text-ink">{c.total}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-ink/45">Active</dt>
                  <dd className="font-display text-base text-ink">{c.active}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-ink/45">Margin</dt>
                  <dd className="font-display text-base text-ink">{s.defaultMarginPercent}%</dd>
                </div>
              </dl>

              <p className={`mt-3 flex items-center gap-1.5 text-xs ${s.hasLogin ? 'text-ink/55' : 'text-gold-deep'}`}>
                <KeyRound size={12} aria-hidden /> {s.hasLogin ? 'Seller has a portal login' : 'No seller login yet'}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-ink/[0.06] pt-4">
                <button type="button" onClick={() => onShowProducts(s.id)} className={btnSmall}>
                  Products
                </button>
                <button type="button" onClick={() => onAddProduct(s.id)} className={btnSmall}>
                  <Plus size={12} aria-hidden /> Add
                </button>
                <Link href={`/admin/catalogues/stores/${s.slug}`} className="ml-auto inline-flex items-center gap-0.5 text-xs font-semibold text-teal-deep hover:underline">
                  Manage <ChevronRight size={13} aria-hidden />
                </Link>
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}

// ─── Products view ──────────────────────────────────────────────────────────

function ProductRow({ row: r, onOpen, onToggle }: { row: Row; onOpen: () => void; onToggle: () => void }) {
  const cover = coverOf(r)
  const videoCount = r.videos?.length ?? 0
  return (
    <div
      onClick={onOpen}
      className={`grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-ink/[0.06] px-5 py-3.5 transition-colors last:border-b-0 hover:bg-ink/[0.02] ${PRODUCT_GRID}`}
    >
      <div className="flex min-w-0 items-center gap-3">
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
          <Link href={`/admin/catalogues/${r.id}`} onClick={(e) => e.stopPropagation()} className="block truncate text-sm font-semibold text-ink hover:text-teal-deep">
            {r.name}
          </Link>
          <span className="block truncate text-xs text-ink/45">
            {r.category ?? 'No category'} · {r.images?.length ?? 0} photo{(r.images?.length ?? 0) === 1 ? '' : 's'}
            {videoCount > 0 ? ` · ${videoCount} video${videoCount === 1 ? '' : 's'}` : ''}
          </span>
        </span>
      </div>
      <span className="hidden truncate text-sm text-ink/65 sm:block">{r.sellers?.name ?? '—'}</span>
      <span className="hidden text-right text-sm tabular-nums text-ink/65 sm:block">{money(r.currency, r.cost_price)}</span>
      <span className="hidden text-right text-sm tabular-nums text-ink/65 sm:block">{r.margin_percent ?? '—'}%</span>
      <span className="hidden text-right text-sm font-semibold tabular-nums text-ink sm:block">{money(r.currency, r.price)}</span>
      <span className={`hidden text-right text-sm tabular-nums sm:block ${r.stock_count === 0 ? 'font-semibold text-rose-600' : 'text-ink/65'}`}>
        {r.stock_count ?? '—'}
      </span>
      <span className="text-right">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggle()
          }}
          title={r.active ? 'Click to hide from the store' : 'Click to show on the store'}
          className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-teal/40"
        >
          <StatusPill tone={r.active ? 'live' : 'hidden'}>{r.active ? 'Active' : 'Hidden'}</StatusPill>
        </button>
      </span>
    </div>
  )
}
