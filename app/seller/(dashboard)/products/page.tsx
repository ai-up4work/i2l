// app/seller/(dashboard)/products/page.tsx
//
// A custom seller's own catalogue — built for sellers who run their shop
// on Instagram / Facebook and work from a phone. They add a product with
// photos and videos straight from their gallery (uploaded to Cloudinary,
// see components/media/MediaUploader.tsx), their own price, and stock.
//
// All reads/writes go through /api/seller/products (server-side, scoped
// to this seller). The seller enters THEIR price; Wishdrop's margin and
// the selling price are applied on the server. Products show on the
// seller's store page (/stores/<slug>) as soon as they're saved and active.
'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ExternalLink, Loader2, Pencil, Play, Plus, Search, Trash2 } from 'lucide-react'
import ProductForm, { type CatalogueProduct, type ProductFormPayload } from '@/components/catalogue/ProductForm'
import { imageThumb, videoPoster } from '@/lib/media'

type ProductRow = CatalogueProduct & { handle?: string }
type SellerInfo = { id: string; name: string; slug: string }

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? 'Something went wrong')
  return body as T
}

function coverOf(p: ProductRow): string | null {
  if (p.images?.[0]) return imageThumb(p.images[0], 300)
  if (p.videos?.[0]) return videoPoster(p.videos[0], 300) || null
  return null
}

export default function SellerProductsPage() {
  const [defaultMargin, setDefaultMargin] = useState(25)
  const [seller, setSeller] = useState<SellerInfo | null>(null)
  const [products, setProducts] = useState<ProductRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'hidden'>('all')

  // null = list; 'new' = add form; a product = edit form.
  const [editing, setEditing] = useState<ProductRow | 'new' | null>(null)

  useEffect(() => {
    api<{ products: ProductRow[]; defaultMarginPercent: number; seller?: SellerInfo }>('/api/seller/products')
      .then((body) => {
        setProducts(body.products)
        setDefaultMargin(body.defaultMarginPercent)
        setSeller(body.seller ?? null)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category).filter((c): c is string => Boolean(c)))).sort(),
    [products],
  )

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products.filter((p) => {
      if (filter === 'active' && !p.active) return false
      if (filter === 'hidden' && p.active) return false
      return !q || p.name.toLowerCase().includes(q) || (p.category ?? '').toLowerCase().includes(q)
    })
  }, [products, search, filter])

  async function handleSave(payload: ProductFormPayload) {
    if (editing && editing !== 'new') {
      const { product } = await api<{ product: ProductRow }>(`/api/seller/products/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
      setProducts((prev) => prev.map((p) => (p.id === product.id ? product : p)))
    } else {
      const { product } = await api<{ product: ProductRow }>('/api/seller/products', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setProducts((prev) => [product, ...prev])
    }
    setEditing(null)
    window.scrollTo({ top: 0 })
  }

  async function handleDelete(p: ProductRow) {
    if (!window.confirm(`Delete "${p.name}"? To stop selling it for now, hide it instead.`)) return
    const previous = products
    setProducts((prev) => prev.filter((row) => row.id !== p.id))
    try {
      await api(`/api/seller/products/${p.id}`, { method: 'DELETE' })
    } catch (err) {
      setProducts(previous)
      setError((err as Error).message)
    }
  }

  async function handleToggleActive(p: ProductRow) {
    const previous = products
    setProducts((prev) => prev.map((row) => (row.id === p.id ? { ...row, active: !row.active } : row)))
    try {
      await api(`/api/seller/products/${p.id}`, { method: 'PATCH', body: JSON.stringify({ active: !p.active }) })
    } catch (err) {
      setProducts(previous)
      setError((err as Error).message)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-2 py-20 text-ink/50">
        <Loader2 size={22} className="animate-spin" />
        <p className="text-sm">Loading your products…</p>
      </div>
    )
  }

  if (editing) {
    const product = editing === 'new' ? null : editing
    return (
      <div className="mx-auto max-w-2xl">
        <button onClick={() => setEditing(null)} className="flex items-center gap-1.5 text-sm font-semibold text-ink/55 hover:text-ink">
          <ArrowLeft size={15} /> My products
        </button>
        <h2 className="mt-3 font-display text-2xl text-ink">{product ? 'Edit product' : 'Add a product'}</h2>
        <div className="mt-5 rounded-2xl border border-ink/10 bg-card p-4 sm:p-6">
          <ProductForm
            key={product?.id ?? 'new'}
            initial={product}
            marginPercent={defaultMargin}
            categorySuggestions={categories}
            submitLabel={product ? 'Save changes' : 'Add product'}
            onSubmit={handleSave}
            onCancel={() => setEditing(null)}
          />
        </div>
      </div>
    )
  }

  const activeCount = products.filter((p) => p.active).length

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl text-ink">My products</h2>
          <p className="mt-1 max-w-xl text-sm text-ink/55">
            Add your photos, videos and your price. Wishdrop adds its {defaultMargin}% margin and shipping, and
            the product shows on your store page right away.
          </p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          {seller && (
            <a
              href={`/stores/${seller.slug}`}
              target="_blank"
              rel="noreferrer"
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-ink/15 px-4 py-3 text-sm font-semibold text-ink/70 hover:text-ink sm:flex-none sm:py-2.5"
            >
              <ExternalLink size={15} /> View store
            </a>
          )}
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-teal px-5 py-3 text-sm font-bold text-white hover:bg-teal-deep sm:flex-none sm:py-2.5"
          >
            <Plus size={16} /> Add product
          </button>
        </div>
      </div>

      {error && <p className="mt-4 text-sm font-medium text-red-600">{error}</p>}

      {products.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-ink/15 px-6 py-16 text-center">
          <p className="font-display text-xl text-ink">Your catalogue is empty</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink/55">
            Add your first product with the same photos and videos you post on Instagram or Facebook.
          </p>
          <button onClick={() => setEditing('new')} className="mt-5 rounded-xl bg-teal px-5 py-3 text-sm font-bold text-white hover:bg-teal-deep">
            Add your first product
          </button>
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex flex-1 items-center gap-2 rounded-xl border border-ink/10 bg-card px-3 py-2.5">
              <Search size={16} className="text-ink/35" />
              <input
                placeholder="Search your products…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
            <div className="flex gap-1 rounded-xl border border-ink/10 bg-card p-1 text-xs font-semibold">
              {(
                [
                  ['all', `All ${products.length}`],
                  ['active', `Active ${activeCount}`],
                  ['hidden', `Hidden ${products.length - activeCount}`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`flex-1 rounded-lg px-3 py-2 ${filter === key ? 'bg-ink text-white' : 'text-ink/55 hover:text-ink'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {shown.length === 0 ? (
            <p className="mt-10 text-center text-sm text-ink/50">No products match.</p>
          ) : (
            <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((p) => {
                const cover = coverOf(p)
                const photoCount = p.images?.length ?? 0
                const videoCount = p.videos?.length ?? 0
                return (
                  <li key={p.id} className={`flex gap-3 rounded-2xl border border-ink/10 bg-card p-3 ${p.active ? '' : 'opacity-70'}`}>
                    <button onClick={() => setEditing(p)} className="relative h-24 w-24 flex-none overflow-hidden rounded-xl bg-parchment" aria-label={`Edit ${p.name}`}>
                      {cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cover} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="grid h-full w-full place-items-center text-[11px] text-ink/40">No photo</span>
                      )}
                      {videoCount > 0 && (
                        <span className="absolute bottom-1 left-1 flex items-center gap-0.5 rounded-full bg-ink/75 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          <Play size={9} fill="currentColor" /> {videoCount}
                        </span>
                      )}
                    </button>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <p className="truncate text-sm font-semibold text-ink">{p.name}</p>
                      <p className="mt-0.5 truncate text-xs text-ink/50">
                        {p.category ?? 'No category'} · {photoCount} photo{photoCount === 1 ? '' : 's'}
                      </p>
                      <p className="mt-1.5 text-sm text-ink">
                        <span className="font-semibold">INR {Number(p.cost_price ?? 0).toFixed(2)}</span>{' '}
                        <span className="text-xs text-ink/45">
                          listed at INR {Number(p.price).toFixed(2)}
                        </span>
                      </p>
                      <p className="text-xs text-ink/50">
                        {p.stock_count == null ? 'Stock not set' : p.stock_count === 0 ? 'Out of stock' : `${p.stock_count} in stock`}
                      </p>
                      <div className="mt-auto flex items-center gap-2 pt-2">
                        <button
                          onClick={() => handleToggleActive(p)}
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${p.active ? 'bg-teal/10 text-teal-deep' : 'bg-ink/5 text-ink/50'}`}
                          title={p.active ? 'Tap to hide from your store' : 'Tap to show on your store'}
                        >
                          {p.active ? 'Active' : 'Hidden'}
                        </button>
                        <span className="flex-1" />
                        <button onClick={() => setEditing(p)} aria-label={`Edit ${p.name}`} className="grid h-8 w-8 place-items-center rounded-lg text-ink/50 hover:bg-ink/5 hover:text-teal-deep">
                          <Pencil size={15} />
                        </button>
                        <button onClick={() => handleDelete(p)} aria-label={`Delete ${p.name}`} className="grid h-8 w-8 place-items-center rounded-lg text-ink/50 hover:bg-ink/5 hover:text-red-600">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
