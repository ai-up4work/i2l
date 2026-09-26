// components/admin/wishdrop-mall/AddProductsPanel.tsx
//
// The "Add products" side of /admin/wishdrop-mall. Two ways to source:
//   - Browse a store: pick any affiliated seller with a live feed, search
//     its catalogue (via the same public /api/stores/[platform] route the
//     storefront uses) and click Add on a product.
//   - Paste a link: any product URL — our own sellers resolve through
//     their feed, anything else goes through the scraper.
// Either way opens ImportDialog, which previews the product server-side,
// lets staff set the name, category and the LKR selling price, and saves it.
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Link2, Loader2, Plus, Search, Store } from 'lucide-react'
import type { StoreProduct } from '@/lib/store.types'
import { MALL_DELIVERY_FEE_LKR, approxLKR, type MallDraft, type MallProductRow } from '@/lib/wishdrop-mall'
import { getDualDeliveryPricing } from '@/lib/pricing'
import {
  Dialog,
  INPUT,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  Thumb,
  formatMoney,
  mallApi,
} from './shared'

type Source = { platform: string; name: string; logo: string }
type ImportTarget = { platform: string; handle: string; label: string } | { url: string; label: string }

const PER_PAGE = 24

export default function AddProductsPanel({
  existing,
  categories,
  onAdded,
}: {
  existing: MallProductRow[]
  categories: string[]
  onAdded: (product: MallProductRow) => void
}) {
  const [mode, setMode] = useState<'browse' | 'link'>('browse')
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
        ) : (
          <PasteLink onPick={setTarget} />
        )}
      </div>

      {target && (
        <ImportDialog
          target={target}
          categories={categories}
          onClose={() => setTarget(null)}
          onAdded={(p) => {
            onAdded(p)
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

// ─── Import dialog ──────────────────────────────────────────────────────

function lkr(n: number | null | undefined): string {
  return n == null ? '—' : formatMoney(n, 'Rs')
}

function ImportDialog({
  target,
  categories,
  onClose,
  onAdded,
}: {
  target: ImportTarget
  categories: string[]
  onClose: () => void
  onAdded: (p: MallProductRow) => void
}) {
  const [draft, setDraft] = useState<MallDraft | null>(null)
  const [duplicateOf, setDuplicateOf] = useState<{ id: string; name: string } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [price, setPrice] = useState('')
  const [wasPrice, setWasPrice] = useState('')
  const [publish, setPublish] = useState(true)
  const [allowDuplicate, setAllowDuplicate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoadError(null)
    setDraft(null)
    const body = 'url' in target ? { url: target.url } : { platform: target.platform, handle: target.handle }
    mallApi<{ draft: MallDraft; duplicateOf: { id: string; name: string } | null }>('/api/admin/wishdrop-mall/preview', {
      method: 'POST',
      body: JSON.stringify(body),
    })
      .then(({ draft: d, duplicateOf: dup }) => {
        setDraft(d)
        setDuplicateOf(dup)
        setName(d.name)
        setCategory(d.category)
      })
      .catch((e: Error) => setLoadError(e.message))
  }, [target])

  useEffect(load, [load])

  // Reference numbers for staff while they choose the price.
  const reference = useMemo(() => {
    if (!draft || draft.costPrice == null) return null
    const sourceLKR = approxLKR(draft.costPrice, draft.currency)
    // What a shopper would pay for this same item through Wishdrop's
    // normal import channel (Express — Economy is locked sitewide).
    const normal = getDualDeliveryPricing({ price: draft.costPrice, currency: draft.currency, weightKg: draft.weightKg })
    return { sourceLKR, normalTotal: Math.round(normal.express.actualTotalLKR) }
  }, [draft])

  const priceNum = Math.round(parseFloat(price))
  const priceValid = Number.isFinite(priceNum) && priceNum > 0
  const wasNum = Math.round(parseFloat(wasPrice))
  const wasValid = wasPrice.trim() === '' || (Number.isFinite(wasNum) && priceValid && wasNum > priceNum)

  const save = async () => {
    if (!draft || !priceValid || !wasValid) return
    setSaving(true)
    setSaveError(null)
    try {
      const { product } = await mallApi<{ product: MallProductRow }>('/api/admin/wishdrop-mall/products', {
        method: 'POST',
        body: JSON.stringify({
          draft,
          name,
          category,
          priceLKR: priceNum,
          compareAtLKR: wasPrice.trim() ? wasNum : null,
          active: publish,
          allowDuplicate,
        }),
      })
      onAdded({ ...product, images: product.images ?? [] })
    } catch (e) {
      setSaveError((e as Error).message)
      setSaving(false)
    }
  }

  const isLink = 'url' in target

  return (
    <Dialog
      title="Add to Wishdrop Mall"
      subtitle={draft ? `From ${draft.source.name}` : undefined}
      onClose={onClose}
      wide
      footer={
        draft ? (
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-sm text-ink/70">
              <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} className="accent-teal-deep" />
              Show to shoppers right away
            </label>
            <div className="flex gap-2">
              <button type="button" className={SECONDARY_BUTTON} onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className={PRIMARY_BUTTON}
                onClick={save}
                disabled={saving || !priceValid || !wasValid || !name.trim() || (!!duplicateOf && !allowDuplicate)}
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                Add to Mall
              </button>
            </div>
          </div>
        ) : undefined
      }
    >
      {loadError ? (
        <div className="py-8 text-center">
          <AlertTriangle size={22} className="mx-auto text-rose-600" />
          <p className="mt-3 text-sm font-semibold text-rose-700">{loadError}</p>
          <button type="button" className={`${SECONDARY_BUTTON} mt-4`} onClick={load}>
            Try again
          </button>
        </div>
      ) : !draft ? (
        <div className="flex flex-col items-center gap-3 py-12 text-ink/50">
          <Loader2 size={22} className="animate-spin" />
          <p className="text-sm">{isLink ? 'Reading the product page — some stores take up to a minute…' : 'Loading product…'}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {duplicateOf && (
            <div className="rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-ink/80">
              <p className="font-semibold">Already in Wishdrop Mall as &ldquo;{duplicateOf.name}&rdquo;.</p>
              <label className="mt-1.5 flex items-center gap-2 text-xs">
                <input type="checkbox" checked={allowDuplicate} onChange={(e) => setAllowDuplicate(e.target.checked)} className="accent-teal-deep" />
                Add a second copy anyway
              </label>
            </div>
          )}
          {!draft.inStock && (
            <p className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-800">
              <AlertTriangle size={14} /> The source shows this as sold out — you may not be able to fulfil orders.
            </p>
          )}

          {draft.images.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {draft.images.slice(0, 8).map((src) => (
                <Thumb key={src} src={src} alt="" size={72} />
              ))}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="text-xs font-semibold text-ink/60">Name shoppers see</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className={`${INPUT} mt-1`} />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-ink/60">Category</span>
              <input value={category} onChange={(e) => setCategory(e.target.value)} list="mall-categories" className={`${INPUT} mt-1`} />
              <datalist id="mall-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
          </div>

          {/* ── Price (LKR) ── */}
          <div className="rounded-xl border border-ink/10 bg-parchment/60 p-4">
            <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
              <label className="block w-40">
                <span className="text-xs font-semibold text-ink/60">Price (Rs)</span>
                <input
                  value={price}
                  onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ''))}
                  inputMode="numeric"
                  placeholder="e.g. 4500"
                  autoFocus
                  className={`${INPUT} mt-1 font-display text-lg`}
                />
              </label>
              <label className="block w-36">
                <span className="text-xs font-semibold text-ink/60">Was price (optional)</span>
                <input
                  value={wasPrice}
                  onChange={(e) => setWasPrice(e.target.value.replace(/[^0-9.]/g, ''))}
                  inputMode="numeric"
                  className={`${INPUT} mt-1`}
                />
              </label>
              <div className="pb-1 text-sm text-ink/70">
                {priceValid ? (
                  <>
                    Customer pays <strong className="text-ink">{lkr(priceNum)}</strong> + {lkr(MALL_DELIVERY_FEE_LKR)} delivery
                  </>
                ) : (
                  <span className="text-ink/45">+ {lkr(MALL_DELIVERY_FEE_LKR)} delivery. No tax or other charges.</span>
                )}
              </div>
            </div>
            {!wasValid && <p className="mt-2 text-xs font-semibold text-rose-700">The &ldquo;was&rdquo; price must be higher than the price.</p>}

            <div className="mt-4 grid gap-2 border-t border-ink/10 pt-3 text-xs text-ink/60 sm:grid-cols-2">
              <p>
                Source price:{' '}
                <span className="font-semibold text-ink/80">{formatMoney(draft.costPrice, draft.currency)}</span>
                {reference?.sourceLKR != null && draft.currency !== 'LKR' && <> (≈ {lkr(reference.sourceLKR)} today)</>}
              </p>
              {reference && (
                <p>
                  Same item via normal import:{' '}
                  <span className="font-semibold text-ink/80">{lkr(reference.normalTotal)}</span> total to the customer
                  {priceValid && (
                    <span className={priceNum + MALL_DELIVERY_FEE_LKR <= reference.normalTotal ? ' text-teal-deep' : ' text-gold-deep'}>
                      {' '}(Mall: {lkr(priceNum + MALL_DELIVERY_FEE_LKR)})
                    </span>
                  )}
                </p>
              )}
            </div>
            {isLink && (
              <p className="mt-2 text-xs text-ink/45">Source price was read from the page, so treat it as a guide.</p>
            )}
          </div>

          <div className="text-xs leading-relaxed text-ink/50">
            {draft.variants.length > 0 ? `${draft.variants.length} options (sizes/colours) will be imported at this same price. ` : ''}
            Source:{' '}
            {draft.source.url ? (
              <a href={draft.source.url} target="_blank" rel="noreferrer" className="text-teal-deep underline decoration-dotted underline-offset-4">
                {draft.source.name}
              </a>
            ) : (
              draft.source.name
            )}{' '}
            — only staff can see this.
          </div>

          {saveError && <p className="text-sm font-semibold text-rose-700">{saveError}</p>}
        </div>
      )}
    </Dialog>
  )
}
