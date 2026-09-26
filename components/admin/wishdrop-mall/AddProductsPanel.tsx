// components/admin/wishdrop-mall/AddProductsPanel.tsx
//
// The "Add products" side of the Wishdrop Mall page. Three ways in:
//   - Add manually: an empty product editor — type everything yourself.
//   - Browse a store: pick any affiliated seller with a live feed, search
//     its catalogue (via the same public /api/stores/[platform] route the
//     storefront uses) and click Add on a product.
//   - Paste a link: any product URL — our own sellers resolve through
//     their feed, anything else goes through the scraper.
// Browse/link first load the product through the same extractors the
// storefront's product pages use (preview route), then open the full
// ProductEditor pre-filled with everything found — all of it editable.
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Link2, Loader2, PenLine, Plus, Search, Store } from 'lucide-react'
import type { StoreProduct } from '@/lib/store.types'
import type { MallCategory, MallDraft, MallProductRow } from '@/lib/wishdrop-mall'
import { Dialog, INPUT, PRIMARY_BUTTON, SECONDARY_BUTTON, formatMoney, mallApi } from './shared'
import ProductEditor, { draftToForm, emptyForm, type ProductForm } from './ProductEditor'

type Source = { platform: string; name: string; logo: string }
type ImportTarget =
  | { platform: string; handle: string; label: string }
  | { url: string; label: string }
  | { manual: true; label: string }

const PER_PAGE = 24

export default function AddProductsPanel({
  existing,
  categories,
  onCategoryCreated,
  onAdded,
}: {
  existing: MallProductRow[]
  categories: MallCategory[]
  onCategoryCreated: (category: MallCategory) => void
  onAdded: (product: MallProductRow, warnings: string[]) => void
}) {
  const [mode, setMode] = useState<'manual' | 'browse' | 'link'>('browse')
  const [target, setTarget] = useState<ImportTarget | null>(null)

  // `platform::handle` of everything already imported, so browse results
  // can show "In Mall" instead of offering a double-import.
  const imported = useMemo(() => {
    const set = new Set<string>()
    for (const p of existing) if (p.source_platform && p.source_handle) set.add(`${p.source_platform}::${p.source_handle}`)
    return set
  }, [existing])

  return (
    <div>
      <div role="tablist" aria-label="How to add products" className="inline-flex gap-1 rounded-full border border-ink/10 bg-card p-1">
        {(
          [
            { key: 'browse', label: 'Browse a store', icon: Store },
            { key: 'link', label: 'Paste a link', icon: Link2 },
            { key: 'manual', label: 'Add manually', icon: PenLine },
          ] as const
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            onClick={() => setMode(key)}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-teal/40 ${
              mode === key ? 'bg-teal-deep text-parchment' : 'text-ink/55 hover:text-ink/80'
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {mode === 'browse' ? (
          <BrowseStore imported={imported} onPick={setTarget} />
        ) : mode === 'link' ? (
          <PasteLink onPick={setTarget} />
        ) : (
          <ManualStart onStart={() => setTarget({ manual: true, label: 'New product' })} />
        )}
      </div>

      {target && (
        <ImportFlow
          target={target}
          categories={categories}
          onCategoryCreated={onCategoryCreated}
          onClose={() => setTarget(null)}
          onAdded={(p, warnings) => {
            onAdded(p, warnings)
            setTarget(null)
          }}
        />
      )}
    </div>
  )
}

// ─── Browse a store ─────────────────────────────────────────────────────

function BrowseStore({ imported, onPick }: { imported: Set<string>; onPick: (t: ImportTarget) => void }) {
  const [sources, setSources] = useState<Source[] | null>(null)
  const [sourcesError, setSourcesError] = useState<string | null>(null)
  const [platform, setPlatform] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<{ products: StoreProduct[]; totalPages: number; total: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    mallApi<{ sources: Source[] }>('/api/admin/wishdrop-mall/sources')
      .then((b) => setSources(b.sources))
      .catch((e: Error) => setSourcesError(e.message))
  }, [])

  // Debounce the search box.
  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, 350)
    return () => window.clearTimeout(t)
  }, [searchInput])

  const requestId = useRef(0)
  useEffect(() => {
    if (!platform) {
      setResult(null)
      return
    }
    const id = ++requestId.current
    setLoading(true)
    setError(null)
    const qs = new URLSearchParams({ page: String(page), per_page: String(PER_PAGE) })
    if (search) qs.set('search', search)
    fetch(`/api/stores/${encodeURIComponent(platform)}?${qs}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (id !== requestId.current) return
        if (!res.ok) throw new Error(body.error ?? `Store feed failed (${res.status})`)
        setResult({ products: body.products ?? [], totalPages: body.totalPages ?? 1, total: body.total ?? 0 })
      })
      .catch((e: Error) => id === requestId.current && setError(e.message))
      .finally(() => id === requestId.current && setLoading(false))
  }, [platform, search, page])

  const sourceName = sources?.find((s) => s.platform === platform)?.name ?? platform

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <select
          value={platform}
          onChange={(e) => {
            setPlatform(e.target.value)
            setPage(1)
          }}
          className={`${INPUT} sm:w-72`}
          aria-label="Store to browse"
          disabled={!sources}
        >
          <option value="">{sources ? 'Choose a store to browse…' : 'Loading stores…'}</option>
          {sources?.map((s) => (
            <option key={s.platform} value={s.platform}>
              {s.name}
            </option>
          ))}
        </select>
        <div className="relative flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={platform ? `Search ${sourceName}` : 'Pick a store first'}
            disabled={!platform}
            className={`${INPUT} pl-8`}
            aria-label="Search products"
          />
        </div>
      </div>

      {sourcesError && <p className="mt-3 text-sm font-semibold text-rose-700">{sourcesError}</p>}
      {sources && sources.length === 0 && (
        <p className="mt-3 text-sm text-ink/55">
          No active stores with a live feed yet. Use &ldquo;Paste a link&rdquo; to add products from anywhere.
        </p>
      )}

      {!platform ? (
        <div className="mt-6 rounded-2xl border border-dashed border-ink/15 px-6 py-14 text-center">
          <Store size={22} className="mx-auto text-ink/25" />
          <p className="mt-3 text-sm font-semibold text-ink/70">Pick a store to see its products</p>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-ink/50">
            You&rsquo;ll see the same live catalogue shoppers see. Add anything to Wishdrop Mall at your own rupee price.
          </p>
        </div>
      ) : loading && !result ? (
        <div className="mt-10 flex justify-center text-ink/40">
          <Loader2 className="animate-spin" size={20} />
        </div>
      ) : error ? (
        <p className="mt-6 text-sm font-semibold text-rose-700">{error}</p>
      ) : result && result.products.length === 0 ? (
        <p className="mt-6 text-sm text-ink/55">No products found{search ? ` for “${search}”` : ''}.</p>
      ) : result ? (
        <>
          <div className={`mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 ${loading ? 'opacity-60' : ''}`}>
            {result.products.map((p) => {
              const inMall = imported.has(`${platform}::${p.handle}`)
              return (
                <div key={p.id} className="flex flex-col overflow-hidden rounded-xl border border-ink/10 bg-card">
                  <div className="aspect-square bg-parchment">
                    {p.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image} alt={p.name} className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
                    ) : null}
                  </div>
                  <div className="flex flex-1 flex-col p-3">
                    <p className="line-clamp-2 text-xs font-semibold leading-snug text-ink">{p.name}</p>
                    <p className="mt-1 text-xs text-ink/55">
                      {formatMoney(p.price, p.currency)}
                      {!p.inStock && <span className="ml-1 text-rose-700">· sold out</span>}
                    </p>
                    <div className="mt-auto pt-2.5">
                      {inMall ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-teal-deep">
                          <Check size={13} /> In Mall
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onPick({ platform, handle: p.handle, label: p.name })}
                          className="inline-flex items-center gap-1 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-parchment transition-colors hover:bg-teal-deep"
                        >
                          <Plus size={12} strokeWidth={2.5} /> Add
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-5 flex items-center justify-between text-xs text-ink/50">
            <span>
              Page {page} of {result.totalPages}
              {result.total ? ` · ${result.total} products` : ''}
            </span>
            <div className="flex gap-2">
              <button type="button" className={SECONDARY_BUTTON} disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft size={14} /> Prev
              </button>
              <button
                type="button"
                className={SECONDARY_BUTTON}
                disabled={page >= result.totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}

// ─── Paste a link ───────────────────────────────────────────────────────

function PasteLink({ onPick }: { onPick: (t: ImportTarget) => void }) {
  const [url, setUrl] = useState('')
  const valid = /^https?:\/\/\S+\.\S+/i.test(url.trim())

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) onPick({ url: url.trim(), label: url.trim() })
      }}
      className="rounded-2xl border border-ink/10 bg-card p-5"
    >
      <label htmlFor="mall-link" className="text-sm font-semibold text-ink">
        Product link
      </label>
      <p className="mt-0.5 text-xs text-ink/50">
        Amazon, Flipkart, Myntra, any Shopify/WooCommerce store, or one of our own sellers.
      </p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <input
          id="mall-link"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          className={INPUT}
          inputMode="url"
          autoComplete="off"
        />
        <button type="submit" className={PRIMARY_BUTTON} disabled={!valid}>
          Fetch product
        </button>
      </div>
    </form>
  )
}

// ─── Add manually ───────────────────────────────────────────────────────

function ManualStart({ onStart }: { onStart: () => void }) {
  return (
    <div className="rounded-2xl border border-ink/10 bg-card p-6">
      <p className="text-sm font-semibold text-ink">Create a product from scratch</p>
      <p className="mt-1 max-w-xl text-xs leading-relaxed text-ink/55">
        Title, brand, photos, price, description, highlights, specifications and variants (each with its own
        image and buy link). Good for products you source offline or from a site the scraper can&rsquo;t read.
      </p>
      <button type="button" onClick={onStart} className={`${PRIMARY_BUTTON} mt-4`}>
        <Plus size={14} /> New product
      </button>
    </div>
  )
}

// ─── Import flow: load via extractors, then open the editor ────────────

function ImportFlow({
  target,
  categories,
  onCategoryCreated,
  onClose,
  onAdded,
}: {
  target: ImportTarget
  categories: MallCategory[]
  onCategoryCreated: (category: MallCategory) => void
  onClose: () => void
  onAdded: (p: MallProductRow, warnings: string[]) => void
}) {
  const isManual = 'manual' in target
  const [form, setForm] = useState<ProductForm | null>(isManual ? emptyForm() : null)
  const [meta, setMeta] = useState<{ duplicateOf: { id: string; name: string } | null; warning: string | null; from: string }>({
    duplicateOf: null,
    warning: null,
    from: '',
  })
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(() => {
    if ('manual' in target) return
    setLoadError(null)
    setForm(null)
    const body = 'url' in target ? { url: target.url } : { platform: target.platform, handle: target.handle }
    mallApi<{ draft: MallDraft; duplicateOf: { id: string; name: string } | null }>('/api/admin/wishdrop-mall/preview', {
      method: 'POST',
      body: JSON.stringify(body),
    })
      .then(({ draft, duplicateOf }) => {
        setMeta({
          duplicateOf,
          warning: draft.inStock ? null : 'The source shows this as sold out — you may not be able to fulfil orders.',
          from: `Pulled from ${draft.source.name}${
            draft.costPrice != null ? ` · ${formatMoney(draft.costPrice, draft.currency)} there` : ''
          } — check everything, set your rupee price, then save.`,
        })
        setForm(draftToForm(draft, categories))
      })
      .catch((e: Error) => setLoadError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per target, not when categories change
  }, [target])

  useEffect(load, [load])

  if (form) {
    return (
      <ProductEditor
        initial={form}
        duplicateOf={meta.duplicateOf}
        sourceWarning={meta.warning}
        subtitle={isManual ? 'Fill in the details. Title, price and quantity are required.' : meta.from}
        categories={categories}
        onCategoryCreated={onCategoryCreated}
        onClose={onClose}
        onSaved={onAdded}
      />
    )
  }

  return (
    <Dialog title="Add to Wishdrop Mall" onClose={onClose}>
      {loadError ? (
        <div className="py-8 text-center">
          <AlertTriangle size={22} className="mx-auto text-rose-600" />
          <p className="mt-3 text-sm font-semibold text-rose-700">{loadError}</p>
          <div className="mt-4 flex justify-center gap-2">
            <button type="button" className={SECONDARY_BUTTON} onClick={load}>
              Try again
            </button>
            <button
              type="button"
              className={PRIMARY_BUTTON}
              onClick={() => {
                // Couldn't read the page — start a manual product with the
                // link already filled in as the buy link.
                const f = emptyForm()
                if ('url' in target) f.source.url = target.url
                setForm(f)
              }}
            >
              Enter details manually
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-12 text-ink/50">
          <Loader2 size={22} className="animate-spin" />
          <p className="text-sm">
            {'url' in target ? 'Reading the product page — some stores take up to a minute…' : 'Loading product…'}
          </p>
        </div>
      )}
    </Dialog>
  )
}
