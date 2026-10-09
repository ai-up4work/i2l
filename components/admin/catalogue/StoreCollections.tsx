// components/admin/catalogue/StoreCollections.tsx
//
// Collections for one social store, on its admin page: create, rename,
// reorder, hide/show, delete, and choose which products are in each.
// Shoppers see them as "Shop by collection" and as a filter on the store
// page. Products can also be added from the product editor.
'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Check, Eye, EyeOff, Loader2, Pencil, Search, Trash2, X } from 'lucide-react'
import { panelClass } from '@/components/admin/seller/shared'
import { imageThumb } from '@/lib/media'

type Collection = { id: string; name: string; slug: string; active: boolean; product_count?: number }
type ProductLite = { id: string; name: string; images: string[] | null; active: boolean }

const smallInput = 'rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-teal'

export default function StoreCollections({ slug }: { slug: string }) {
  const base = `/api/admin/catalogues/stores/${slug}/collections`
  const [collections, setCollections] = useState<Collection[] | null>(null)
  const [products, setProducts] = useState<ProductLite[]>([])
  const [needsMigration, setNeedsMigration] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [choosing, setChoosing] = useState<Collection | null>(null)

  async function load() {
    try {
      const res = await fetch(base)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Could not load collections')
      setCollections(body.collections)
      setProducts(body.products)
      setNeedsMigration(Boolean(body.needsMigration))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load collections')
      setCollections([])
    }
  }
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  async function call(url: string, init: RequestInit) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Something went wrong')
      await load()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function create() {
    if (!newName.trim()) return
    if (await call(base, { method: 'POST', body: JSON.stringify({ name: newName.trim() }) })) setNewName('')
  }

  return (
    <section id="collections" className={`mt-4 scroll-mt-4 p-6 ${panelClass}`}>
      <h2 className="font-semibold text-ink">Collections</h2>
      <p className="mt-0.5 text-sm text-ink/55">
        Groups like &ldquo;Eid edit&rdquo; or &ldquo;Under Rs 5,000&rdquo;. Shoppers see them at the top of the store and can filter by them. A product can be in several.
      </p>

      {needsMigration ? (
        <p className="mt-4 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-ink">
          Run <code className="font-mono text-xs">data/wishdrop-store-collections.sql</code> in Supabase to use collections.
        </p>
      ) : collections === null ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-ink/50">
          <Loader2 size={15} className="animate-spin" /> Loading…
        </div>
      ) : (
        <>
          <div className="mt-4 flex gap-2">
            <input
              value={newName}
              maxLength={60}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void create()}
              placeholder="New collection name"
              className={`${smallInput} min-w-0 flex-1`}
            />
            <button onClick={() => void create()} disabled={busy || !newName.trim()} className="rounded-xl bg-teal-deep px-4 py-2 text-sm font-semibold text-parchment hover:bg-teal disabled:opacity-50">
              Create
            </button>
          </div>

          {collections.length > 0 && (
            <ul className="mt-4 divide-y divide-ink/10 rounded-xl border border-ink/10">
              {collections.map((c, i) => (
                <li key={c.id} className={`flex flex-wrap items-center gap-2 px-3 py-2.5 ${c.active ? '' : 'bg-ink/[0.02]'}`}>
                  {renaming?.id === c.id ? (
                    <div className="flex min-w-0 flex-1 gap-2">
                      <input
                        autoFocus
                        value={renaming.name}
                        maxLength={60}
                        onChange={(e) => setRenaming({ id: c.id, name: e.target.value })}
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter' && (await call(`${base}/${c.id}`, { method: 'PATCH', body: JSON.stringify({ name: renaming.name }) }))) setRenaming(null)
                          if (e.key === 'Escape') setRenaming(null)
                        }}
                        className={`${smallInput} min-w-0 flex-1`}
                      />
                      <button
                        onClick={async () => (await call(`${base}/${c.id}`, { method: 'PATCH', body: JSON.stringify({ name: renaming.name }) })) && setRenaming(null)}
                        aria-label="Save name"
                        className="grid w-9 place-items-center rounded-lg bg-ink text-white"
                      >
                        <Check size={14} />
                      </button>
                      <button onClick={() => setRenaming(null)} aria-label="Cancel" className="grid w-9 place-items-center rounded-lg border border-ink/15">
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm font-semibold ${c.active ? 'text-ink' : 'text-ink/45'}`}>
                        {c.name} {!c.active && <span className="font-normal">(hidden)</span>}
                      </p>
                      <p className="text-xs text-ink/50">
                        {c.product_count ?? 0} product{c.product_count === 1 ? '' : 's'}
                      </p>
                    </div>
                  )}
                  <button onClick={() => setChoosing(c)} className="rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-semibold text-ink/70 hover:text-ink">
                    Choose products
                  </button>
                  <div className="flex items-center">
                    <IconButton label="Move up" disabled={busy || i === 0} onClick={() => call(`${base}/${c.id}`, { method: 'PATCH', body: JSON.stringify({ move: 'up' }) })}>
                      <ArrowUp size={14} />
                    </IconButton>
                    <IconButton label="Move down" disabled={busy || i === collections.length - 1} onClick={() => call(`${base}/${c.id}`, { method: 'PATCH', body: JSON.stringify({ move: 'down' }) })}>
                      <ArrowDown size={14} />
                    </IconButton>
                    <IconButton label="Rename" disabled={busy} onClick={() => setRenaming({ id: c.id, name: c.name })}>
                      <Pencil size={14} />
                    </IconButton>
                    <IconButton label={c.active ? 'Hide from shoppers' : 'Show to shoppers'} disabled={busy} onClick={() => call(`${base}/${c.id}`, { method: 'PATCH', body: JSON.stringify({ active: !c.active }) })}>
                      {c.active ? <Eye size={14} /> : <EyeOff size={14} />}
                    </IconButton>
                    <IconButton
                      label="Delete"
                      disabled={busy}
                      danger
                      onClick={() => {
                        if (window.confirm(`Delete the collection "${c.name}"? Its products stay in the store.`)) void call(`${base}/${c.id}`, { method: 'DELETE' })
                      }}
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {error && <p className="mt-3 text-sm font-semibold text-red-700">{error}</p>}

      {choosing && (
        <ChooseProducts
          collection={choosing}
          products={products}
          url={`${base}/${choosing.id}`}
          onClose={async (saved) => {
            setChoosing(null)
            if (saved) await load()
          }}
        />
      )}
    </section>
  )
}

function IconButton({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`grid h-8 w-8 place-items-center rounded-lg text-ink/50 hover:bg-ink/5 disabled:opacity-30 ${danger ? 'hover:text-red-600' : 'hover:text-ink'}`}
    >
      {children}
    </button>
  )
}

function ChooseProducts({ collection, products, url, onClose }: { collection: Collection; products: ProductLite[]; url: string; onClose: (saved: boolean) => void }) {
  const [selected, setSelected] = useState<Set<string> | null>(null)
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(url)
      .then((r) => r.json())
      .then((d: { productIds?: string[] }) => setSelected(new Set(d.productIds ?? [])))
      .catch(() => setSelected(new Set()))
  }, [url])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products
  }, [products, query])

  async function save() {
    if (!selected) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productIds: [...selected] }) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Could not save')
      onClose(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={() => onClose(false)}>
      <div role="dialog" aria-modal="true" aria-label={`Products in ${collection.name}`} onClick={(e) => e.stopPropagation()} className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-t-2xl bg-card shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-ink/10 p-5">
          <div>
            <h3 className="text-base font-bold text-ink">Products in &ldquo;{collection.name}&rdquo;</h3>
            <p className="text-xs text-ink/50">{selected ? `${selected.size} selected` : 'Loading…'}</p>
          </div>
          <button onClick={() => onClose(false)} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full hover:bg-ink/5">
            <X size={16} />
          </button>
        </div>
        <div className="border-b border-ink/10 px-5 py-3">
          <div className="flex items-center gap-2 rounded-lg border border-ink/15 px-3 py-2">
            <Search size={14} className="text-ink/40" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products" className="w-full bg-transparent text-sm outline-none" />
          </div>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-3 overflow-y-auto p-5 sm:grid-cols-4">
          {selected === null ? (
            <p className="col-span-full text-sm text-ink/50">Loading…</p>
          ) : shown.length === 0 ? (
            <p className="col-span-full text-sm text-ink/50">{products.length ? 'No products match.' : 'This store has no products yet.'}</p>
          ) : (
            shown.map((p) => {
              const on = selected.has(p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() =>
                    setSelected((s) => {
                      const next = new Set(s)
                      if (on) next.delete(p.id)
                      else next.add(p.id)
                      return next
                    })
                  }
                  aria-pressed={on}
                  className="text-left"
                >
                  <span className={`relative block aspect-square overflow-hidden rounded-xl border-2 bg-parchment ${on ? 'border-teal' : 'border-transparent'}`}>
                    {p.images?.[0] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageThumb(p.images[0], 240)} alt="" className={`h-full w-full object-cover ${p.active ? '' : 'opacity-50'}`} />
                    )}
                    <span className={`absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full border ${on ? 'border-teal bg-teal text-white' : 'border-white bg-white/80 text-transparent'}`}>
                      <Check size={13} />
                    </span>
                  </span>
                  <span className="mt-1.5 line-clamp-2 block text-xs text-ink/75">
                    {p.name}
                    {!p.active && <span className="text-ink/40"> (draft)</span>}
                  </span>
                </button>
              )
            })
          )}
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-ink/10 p-4">
          {error && <p className="mr-auto text-sm font-semibold text-red-700">{error}</p>}
          <button onClick={() => onClose(false)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-ink/60">
            Cancel
          </button>
          <button onClick={() => void save()} disabled={saving || selected === null} className="rounded-xl bg-teal-deep px-5 py-2.5 text-sm font-semibold text-parchment hover:bg-teal disabled:opacity-60">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
