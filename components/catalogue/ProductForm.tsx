// components/catalogue/ProductForm.tsx
//
// The product editor for social stores (sellers with no website feed).
// Used by the seller portal (app/seller/(dashboard)/products) and by staff
// (Admin → Social Stores). Laid out like Shopify's product page:
//
//   main column: title & description · media · pricing · inventory ·
//                shipping · variants (size / colour) · product details
//   side column: status · organization (category, brand, who it's for,
//                tags) · margin (staff only)
//
// Prices are never typed as the selling price: the seller enters THEIR
// price, and the listed price (shown here as a preview) is worked out on
// the server as price × (1 + margin%). Rules: lib/catalogue-products.ts.
'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, ImageIcon, Plus, Trash2, X } from 'lucide-react'
import MediaUploader from '@/components/media/MediaUploader'
import { imageThumb } from '@/lib/media'

// ─── Types ───────────────────────────────────────────────────────────────

export type CatalogueVariant = {
  id: string
  label: string
  options: Record<string, string> | null
  sku: string | null
  cost_price: number | null
  price: number | null
  stock: number | null
  image_url: string | null
  available: boolean
}

export type CatalogueProduct = {
  id: string
  name: string
  description: string | null
  category: string | null
  brand?: string | null
  tags?: string[] | null
  gender?: string | null
  sku?: string | null
  cost_price: number | null
  margin_percent: number | null
  price: number
  compare_at_price?: number | null
  currency: string
  stock_count: number | null
  weight_kg: number | null
  images: string[] | null
  videos?: string[] | null
  highlights?: string[] | null
  specs?: { name: string; value: string }[] | null
  active: boolean
  product_variants?: CatalogueVariant[] | null
  collection_ids?: string[] | null
}

export type ProductFormPayload = {
  name: string
  description: string | null
  category: string | null
  brand: string | null
  tags: string[]
  gender: string | null
  sku: string | null
  costPrice: number
  compareAtPrice: number | null
  trackInventory: boolean
  stockCount: number | null
  weightKg: string | null
  images: string[]
  videos: string[]
  highlights: string[]
  specs: { name: string; value: string }[]
  active: boolean
  variants: {
    id?: string
    options: Record<string, string>
    costPrice: number | null
    stock: number | null
    sku: string | null
    imageUrl: string | null
    available: boolean
  }[]
  collectionIds?: string[]
  marginPercent?: number
}

interface Props {
  initial?: CatalogueProduct | null
  /** Margin used for the price preview (and the staff field's default). */
  marginPercent: number
  /** Staff mode: shows the editable margin; uploads go to this seller's folder. */
  staffSellerId?: string
  categorySuggestions?: string[]
  /** GET lists the store's collections ({ collections }), POST { name }
   *  creates one. Omit to hide the Collections card. */
  collectionsUrl?: string
  submitLabel: string
  onSubmit: (payload: ProductFormPayload) => Promise<void>
  onCancel?: () => void
}

// ─── Small building blocks ───────────────────────────────────────────────

const inputClass =
  'w-full rounded-xl border border-ink/15 bg-white px-3.5 py-3 text-base outline-none focus:border-teal sm:py-2.5 sm:text-sm'
const smallInput = 'w-full rounded-lg border border-ink/15 bg-white px-2.5 py-2 text-sm outline-none focus:border-teal'
const labelClass = 'mb-1.5 block text-xs font-semibold text-ink/60'
const hintClass = 'mt-1 block text-xs text-ink/45'

function Card({ title, hint, children, aside }: { title: string; hint?: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-ink/10 bg-card p-4 sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-ink">{title}</h3>
          {hint && <p className="mt-0.5 text-xs text-ink/50">{hint}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-10 flex-none rounded-full transition-colors ${checked ? 'bg-teal' : 'bg-ink/20'}`}
      >
        <span className={`absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
      </button>
      {label}
    </label>
  )
}

/** Type a value and press Enter (or comma) to add it. */
function ChipInput({
  values,
  onChange,
  placeholder,
  quickPicks = [],
}: {
  values: string[]
  onChange: (v: string[]) => void
  placeholder: string
  quickPicks?: string[]
}) {
  const [draft, setDraft] = useState('')
  function add(raw: string) {
    const parts = raw.split(',').map((p) => p.trim()).filter(Boolean)
    const next = [...values]
    for (const p of parts) if (!next.some((v) => v.toLowerCase() === p.toLowerCase())) next.push(p.slice(0, 40))
    onChange(next)
    setDraft('')
  }
  const unused = quickPicks.filter((q) => !values.some((v) => v.toLowerCase() === q.toLowerCase()))
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-ink/15 bg-white px-2 py-1.5 focus-within:border-teal">
        {values.map((v) => (
          <span key={v} className="flex items-center gap-1 rounded-full bg-ink/[0.06] py-1 pl-2.5 pr-1 text-xs font-semibold text-ink">
            {v}
            <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`} className="grid h-4 w-4 place-items-center rounded-full hover:bg-ink/10">
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => (e.target.value.endsWith(',') ? add(e.target.value) : setDraft(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (draft.trim()) add(draft)
            } else if (e.key === 'Backspace' && !draft && values.length) {
              onChange(values.slice(0, -1))
            }
          }}
          onBlur={() => draft.trim() && add(draft)}
          placeholder={values.length ? '' : placeholder}
          className="min-w-[120px] flex-1 bg-transparent px-1 py-1 text-sm outline-none"
        />
      </div>
      {unused.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {unused.map((q) => (
            <button key={q} type="button" onClick={() => add(q)} className="rounded-full border border-dashed border-ink/25 px-2.5 py-1 text-xs text-ink/60 hover:border-teal hover:text-teal-deep">
              + {q}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Variants ────────────────────────────────────────────────────────────

type VariantRow = {
  id?: string
  options: Record<string, string>
  cost: string
  stock: string
  sku: string
  imageUrl: string
  available: boolean
}

const SIZE_PICKS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Free size']
const DETAIL_PICKS = ['Material', 'Fabric', 'Care instructions', 'Fit', 'Length', 'Size chart', 'Country of origin', 'What’s included']

function variantKey(options: Record<string, string>) {
  return `${(options.Size ?? '').toLowerCase()}|${(options.Color ?? '').toLowerCase()}`
}

function buildCombos(sizes: string[], colors: string[]): Record<string, string>[] {
  if (sizes.length && colors.length) return sizes.flatMap((s) => colors.map((c) => ({ Size: s, Color: c })))
  if (sizes.length) return sizes.map((s) => ({ Size: s }))
  if (colors.length) return colors.map((c) => ({ Color: c }))
  return []
}

const num = (v: string) => (v.trim() === '' ? null : Number(v))
const fmt = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ─── Variant photo picker ────────────────────────────────────────────────

type PhotoScope = 'one' | 'color' | 'all'

/**
 * Full-screen picker showing the product's photos as thumbnails. Picking a
 * photo applies it to just this variant, to every variant of the same
 * colour (the default when the variant has a colour), or to all variants.
 */
function VariantPhotoDialog({
  title,
  color,
  images,
  current,
  onPick,
  onClose,
}: {
  title: string
  color?: string
  images: string[]
  current: string
  onPick: (url: string, scope: PhotoScope) => void
  onClose: () => void
}) {
  const [scope, setScope] = useState<PhotoScope>(color ? 'color' : 'one')
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Photo for ${title}`}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-card p-5 shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-ink">Photo for {title}</h3>
            <p className="mt-0.5 text-xs text-ink/50">Shoppers see this photo when they pick this option.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full hover:bg-ink/5">
            <X size={16} />
          </button>
        </div>

        <fieldset className="mt-4 flex flex-wrap gap-2">
          <legend className="sr-only">Apply to</legend>
          {(
            [
              ['one', `Only ${title}`],
              ...(color ? [['color', `Every ${color} variant`] as const] : []),
              ['all', 'All variants'],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold ${
                scope === value ? 'border-ink bg-ink text-white' : 'border-ink/15 text-ink/65 hover:text-ink'
              }`}
            >
              <input type="radio" name="photo-scope" value={value} checked={scope === value} onChange={() => setScope(value)} className="sr-only" />
              {label}
            </label>
          ))}
        </fieldset>

        {images.length === 0 ? (
          <p className="mt-5 rounded-xl bg-parchment px-4 py-6 text-center text-sm text-ink/55">Add photos in the Media section first.</p>
        ) : (
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {images.map((url, i) => {
              const on = url === current
              return (
                <button
                  key={url}
                  type="button"
                  onClick={() => onPick(url, scope)}
                  aria-label={`Photo ${i + 1}`}
                  aria-pressed={on}
                  className={`relative aspect-square overflow-hidden rounded-xl border-2 ${on ? 'border-teal' : 'border-transparent hover:border-ink/30'}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageThumb(url, 240)} alt="" className="h-full w-full object-cover" />
                  {on && (
                    <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-teal text-white">
                      <Check size={13} />
                    </span>
                  )}
                  <span className="absolute bottom-1 left-1 rounded bg-black/55 px-1.5 text-[10px] font-semibold text-white">{i + 1}</span>
                </button>
              )
            })}
          </div>
        )}

        <button type="button" onClick={() => onPick('', scope)} className="mt-4 text-xs font-semibold text-ink/55 underline hover:text-ink">
          No photo of its own (use the main photo)
        </button>
      </div>
    </div>
  )
}

/** Thumbnail button that opens the picker. */
function PhotoButton({ url, label, onClick, size = 'h-10 w-10' }: { url: string; label: string; onClick: () => void; size?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`${size} grid flex-none place-items-center overflow-hidden rounded-lg border ${url ? 'border-ink/15' : 'border-dashed border-ink/30 text-ink/40 hover:border-teal hover:text-teal-deep'}`}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageThumb(url, 120)} alt="" className="h-full w-full object-cover" />
      ) : (
        <ImageIcon size={15} />
      )}
    </button>
  )
}

// ─── Form ────────────────────────────────────────────────────────────────

export default function ProductForm({ initial, marginPercent, staffSellerId, categorySuggestions = [], collectionsUrl, submitLabel, onSubmit, onCancel }: Props) {
  const staff = Boolean(staffSellerId)
  const startMargin = initial?.margin_percent ?? marginPercent
  const initialVariants = initial?.product_variants ?? []

  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [media, setMedia] = useState({ images: initial?.images ?? [], videos: initial?.videos ?? [] })
  const [costPrice, setCostPrice] = useState(initial?.cost_price != null ? String(initial.cost_price) : '')
  // The "was" price is stored as a listed price; show it in the seller's terms.
  const [comparePrice, setComparePrice] = useState(
    initial?.compare_at_price != null ? String(Math.round((initial.compare_at_price / (1 + startMargin / 100)) * 100) / 100) : '',
  )
  const [track, setTrack] = useState(initial ? initial.stock_count != null : true)
  const [stockCount, setStockCount] = useState(initial?.stock_count != null ? String(initial.stock_count) : '')
  const [sku, setSku] = useState(initial?.sku ?? '')
  const [weightKg, setWeightKg] = useState(initial?.weight_kg != null ? String(initial.weight_kg) : '')
  const [margin, setMargin] = useState(String(startMargin))

  const [sizes, setSizes] = useState<string[]>(() => Array.from(new Set(initialVariants.map((v) => v.options?.Size).filter((x): x is string => Boolean(x)))))
  const [colors, setColors] = useState<string[]>(() =>
    Array.from(new Set(initialVariants.map((v) => v.options?.Color ?? v.options?.Colour).filter((x): x is string => Boolean(x)))),
  )
  const [useSizes, setUseSizes] = useState(sizes.length > 0)
  const [useColors, setUseColors] = useState(colors.length > 0)
  const [rows, setRows] = useState<Record<string, VariantRow>>(() => {
    const map: Record<string, VariantRow> = {}
    for (const v of initialVariants) {
      const options: Record<string, string> = {}
      if (v.options?.Size) options.Size = v.options.Size
      const c = v.options?.Color ?? v.options?.Colour
      if (c) options.Color = c
      map[variantKey(options)] = {
        id: v.id,
        options,
        cost: v.cost_price != null ? String(v.cost_price) : '',
        stock: v.stock != null ? String(v.stock) : '',
        sku: v.sku ?? '',
        imageUrl: v.image_url ?? '',
        available: v.available,
      }
    }
    return map
  })

  const [highlights, setHighlights] = useState<string[]>(initial?.highlights?.length ? initial.highlights : [])
  const [specs, setSpecs] = useState<{ name: string; value: string }[]>(initial?.specs?.length ? initial.specs : [])

  const [active, setActive] = useState(initial?.active ?? true)
  const [category, setCategory] = useState(initial?.category ?? '')
  const [brand, setBrand] = useState(initial?.brand ?? '')
  const [gender, setGender] = useState(initial?.gender ?? '')
  const [tags, setTags] = useState<string[]>(initial?.tags ?? [])

  // Store collections (many per product).
  const [collections, setCollections] = useState<{ id: string; name: string }[] | null>(null)
  const [collectionsNote, setCollectionsNote] = useState<string | null>(null)
  const [collectionIds, setCollectionIds] = useState<string[]>(initial?.collection_ids ?? [])
  const [newCollection, setNewCollection] = useState('')
  const [creatingCollection, setCreatingCollection] = useState(false)
  useEffect(() => {
    if (!collectionsUrl) return
    let cancelled = false
    fetch(collectionsUrl)
      .then((r) => r.json())
      .then((d: { collections?: { id: string; name: string }[]; needsMigration?: boolean }) => {
        if (cancelled) return
        setCollections(d.collections ?? [])
        if (d.needsMigration) setCollectionsNote('Collections need a database update (data/wishdrop-store-collections.sql).')
      })
      .catch(() => !cancelled && setCollections([]))
    return () => {
      cancelled = true
    }
  }, [collectionsUrl])
  async function addCollection() {
    const name = newCollection.trim()
    if (!name || !collectionsUrl) return
    setCreatingCollection(true)
    setCollectionsNote(null)
    try {
      const res = await fetch(collectionsUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Could not create the collection')
      setCollections((list) => [...(list ?? []), body.collection])
      setCollectionIds((ids) => [...ids, body.collection.id])
      setNewCollection('')
    } catch (err) {
      setCollectionsNote(err instanceof Error ? err.message : 'Could not create the collection')
    } finally {
      setCreatingCollection(false)
    }
  }

  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Variant rows always follow the chosen sizes × colours; edits to a row
  // are kept while its combination still exists.
  const combos = useMemo(() => buildCombos(useSizes ? sizes : [], useColors ? colors : []), [useSizes, useColors, sizes, colors])
  const variantRows: VariantRow[] = combos.map(
    (options) => rows[variantKey(options)] ?? { options, cost: '', stock: '', sku: '', imageUrl: '', available: true },
  )
  const hasVariants = variantRows.length > 0
  function editRow(options: Record<string, string>, patch: Partial<VariantRow>) {
    const key = variantKey(options)
    setRows((prev) => ({ ...prev, [key]: { ...(prev[key] ?? { options, cost: '', stock: '', sku: '', imageUrl: '', available: true }), ...patch, options } }))
  }
  /** Applies a change to every current variant that matches. */
  function editRows(match: (options: Record<string, string>) => boolean, patch: Partial<VariantRow>) {
    setRows((prev) => {
      const next = { ...prev }
      for (const options of combos) {
        if (!match(options)) continue
        const key = variantKey(options)
        next[key] = { ...(prev[key] ?? { options, cost: '', stock: '', sku: '', imageUrl: '', available: true }), ...patch, options }
      }
      return next
    })
  }
  const [photoFor, setPhotoFor] = useState<{ title: string; options: Record<string, string> } | null>(null)
  const [bulkPrice, setBulkPrice] = useState('')
  const [bulkQty, setBulkQty] = useState('')
  function pickPhoto(url: string, scope: PhotoScope) {
    if (!photoFor) return
    const target = photoFor.options
    if (scope === 'all') editRows(() => true, { imageUrl: url })
    else if (scope === 'color' && target.Color) editRows((o) => (o.Color ?? '').toLowerCase() === target.Color.toLowerCase(), { imageUrl: url })
    else editRow(target, { imageUrl: url })
    setPhotoFor(null)
  }

  const cost = Number(costPrice)
  const m = staff ? Number(margin) : startMargin
  const validBase = Number.isFinite(cost) && cost > 0 && Number.isFinite(m) && m >= 0
  const listed = (c: number) => Math.round(c * (1 + m / 100) * 100) / 100
  const was = num(comparePrice)
  const discount = validBase && was != null && was > cost ? Math.round((1 - cost / was) * 100) : null
  const totalStock = hasVariants ? variantRows.reduce((s, r) => s + (Number(r.stock) || 0), 0) : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError('Add a title.')
    if (!validBase) return setError('Enter a valid price.')
    if (uploading) return setError('Please wait for the uploads to finish.')
    if (media.images.length === 0 && media.videos.length === 0) return setError('Add at least one photo or video.')
    if ((useSizes && sizes.length === 0) || (useColors && colors.length === 0)) return setError('Add the sizes or colours you sell, or switch that option off.')
    for (const r of variantRows) {
      const c = num(r.cost)
      if (c != null && !(c > 0)) return setError(`Check the price of ${Object.values(r.options).join(' / ')}.`)
    }

    setSaving(true)
    setError(null)
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || null,
        category: category.trim() || null,
        brand: brand.trim() || null,
        tags,
        gender: gender || null,
        sku: hasVariants ? null : sku.trim() || null,
        costPrice: cost,
        compareAtPrice: was,
        trackInventory: track,
        stockCount: track && !hasVariants ? Number(stockCount) || 0 : null,
        weightKg: weightKg.trim() || null,
        images: media.images,
        videos: media.videos,
        highlights: highlights.map((h) => h.trim()).filter(Boolean),
        specs: specs.map((s) => ({ name: s.name.trim(), value: s.value.trim() })).filter((s) => s.name && s.value),
        active,
        variants: variantRows.map((r) => ({
          id: r.id,
          options: r.options,
          costPrice: num(r.cost),
          stock: track ? Number(r.stock) || 0 : null,
          sku: r.sku.trim() || null,
          imageUrl: r.imageUrl || null,
          available: r.available,
        })),
        ...(collectionsUrl && collections !== null ? { collectionIds } : {}),
        ...(staff ? { marginPercent: Number(margin) } : {}),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  const who = staff ? "the seller's" : 'your'

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* ── Main column ── */}
        <div className="flex min-w-0 flex-col gap-4">
          <Card title="Title and description">
            <label className="block">
              <span className={labelClass}>Title</span>
              <input value={name} maxLength={200} onChange={(e) => setName(e.target.value)} placeholder="e.g. Handloom cotton saree, indigo" className={inputClass} />
            </label>
            <label className="mt-4 block">
              <span className={labelClass}>Description</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                maxLength={8000}
                placeholder="2 or 3 lines: what it is, the material, how it fits. You can paste your Instagram caption. Leave a blank line between paragraphs."
                className={inputClass}
              />
            </label>
          </Card>

          <Card title="Media" hint="Photos and videos. The first photo is the main one on the store and in search.">
            <MediaUploader images={media.images} videos={media.videos} onChange={setMedia} sellerId={staffSellerId} onBusyChange={setUploading} disabled={saving} />
          </Card>

          <Card title="Pricing" hint={`Enter ${who} price. Wishdrop adds its margin and shipping on top.`}>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className={labelClass}>{staff ? "Seller's price" : 'Your price'} (INR)</span>
                <input type="number" inputMode="decimal" min="0" step="0.01" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} placeholder="0.00" className={inputClass} />
              </label>
              <label className="block">
                <span className={labelClass}>Was price (optional)</span>
                <input type="number" inputMode="decimal" min="0" step="0.01" value={comparePrice} onChange={(e) => setComparePrice(e.target.value)} placeholder="Shown crossed out" className={inputClass} />
              </label>
            </div>
            <div className="mt-3 rounded-xl bg-parchment/70 px-3.5 py-3 text-sm text-ink/70">
              {validBase ? (
                <>
                  Listed at <span className="font-semibold text-ink">INR {fmt(listed(cost))}</span>
                  {discount != null && discount > 0 && (
                    <>
                      {' '}
                      <span className="text-ink/45 line-through">INR {fmt(listed(was as number))}</span>{' '}
                      <span className="rounded bg-ink px-1.5 py-0.5 text-[11px] font-bold text-white">-{discount}%</span>
                    </>
                  )}
                  <span className="mt-0.5 block text-xs text-ink/50">
                    {who.charAt(0).toUpperCase() + who.slice(1)} price + {m}% Wishdrop margin. Shoppers see it in rupees (LKR) with shipping to Sri Lanka.
                  </span>
                </>
              ) : (
                <span className="text-ink/50">Enter {who} price to see what it will be listed at.</span>
              )}
              {was != null && validBase && was <= cost && <span className="mt-1 block text-xs font-medium text-red-600">The was price must be higher than the price, or it won&rsquo;t show.</span>}
            </div>
          </Card>

          <Card title="Inventory" aside={<Toggle checked={track} onChange={setTrack} label="Track quantity" />}>
            {hasVariants ? (
              <p className="text-sm text-ink/60">
                {track ? (
                  <>
                    Quantities are set per size/colour below. Total: <span className="font-semibold text-ink">{totalStock}</span>.
                  </>
                ) : (
                  'Not tracking quantity: every option stays available until you switch it off below.'
                )}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {track ? (
                  <label className="block">
                    <span className={labelClass}>Quantity in stock</span>
                    <input type="number" inputMode="numeric" min="0" step="1" value={stockCount} onChange={(e) => setStockCount(e.target.value)} placeholder="0" className={inputClass} />
                    <span className={hintClass}>At 0 it shows as sold out.</span>
                  </label>
                ) : (
                  <p className="self-center text-sm text-ink/55">Not tracking quantity: always shown as in stock.</p>
                )}
                <label className="block">
                  <span className={labelClass}>SKU (optional)</span>
                  <input value={sku} maxLength={80} onChange={(e) => setSku(e.target.value)} placeholder="Your own code" className={inputClass} />
                </label>
              </div>
            )}
          </Card>

          <Card title="Shipping" hint="Weight decides the shipping charge to Sri Lanka.">
            <label className="block max-w-[220px]">
              <span className={labelClass}>Weight (kg)</span>
              <input type="number" inputMode="decimal" min="0" step="0.01" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} placeholder="e.g. 0.4" className={inputClass} />
              <span className={hintClass}>{weightKg.trim() ? 'Packed weight, including the bag or box.' : 'Left empty, 0.5 kg is used.'}</span>
            </label>
          </Card>

          <Card title="Variants" hint="Sizes and colours. Every combination gets its own row, with its own quantity, and optionally its own price and photo.">
            <div className="flex flex-col gap-4">
              <div>
                <Toggle checked={useSizes} onChange={setUseSizes} label="This product comes in sizes" />
                {useSizes && (
                  <div className="mt-2.5">
                    <ChipInput values={sizes} onChange={setSizes} placeholder="Type a size and press Enter" quickPicks={SIZE_PICKS} />
                  </div>
                )}
              </div>
              <div>
                <Toggle checked={useColors} onChange={setUseColors} label="This product comes in colours" />
                {useColors && (
                  <div className="mt-2.5">
                    <ChipInput values={colors} onChange={setColors} placeholder="Type a colour and press Enter, e.g. Red" />
                  </div>
                )}
              </div>

              {hasVariants && useColors && colors.length > 0 && (
                <div className="rounded-xl bg-parchment/70 p-3">
                  <p className="text-xs font-semibold text-ink/65">Photo for each colour</p>
                  <p className="text-[11px] text-ink/45">Pick once per colour and it&rsquo;s used for every size in that colour.</p>
                  <div className="mt-2.5 flex flex-wrap gap-3">
                    {colors.map((c) => {
                      const sample = variantRows.find((r) => (r.options.Color ?? '').toLowerCase() === c.toLowerCase())
                      return (
                        <div key={c} className="flex items-center gap-2">
                          <PhotoButton
                            url={sample?.imageUrl ?? ''}
                            label={`Choose photo for ${c}`}
                            size="h-12 w-12"
                            onClick={() => setPhotoFor({ title: c, options: sample?.options ?? { Color: c } })}
                          />
                          <span className="text-sm font-semibold text-ink">{c}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {hasVariants && (
                <div className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-ink/20 p-3">
                  <p className="w-full text-xs font-semibold text-ink/65">Set for all variants</p>
                  <label className="block">
                    <span className="mb-1 block text-[11px] text-ink/50">Price</span>
                    <input type="number" inputMode="decimal" min="0" step="0.01" value={bulkPrice} onChange={(e) => setBulkPrice(e.target.value)} placeholder={costPrice || '0.00'} className={`${smallInput} w-28`} />
                  </label>
                  {track && (
                    <label className="block">
                      <span className="mb-1 block text-[11px] text-ink/50">Quantity</span>
                      <input type="number" inputMode="numeric" min="0" step="1" value={bulkQty} onChange={(e) => setBulkQty(e.target.value)} placeholder="0" className={`${smallInput} w-24`} />
                    </label>
                  )}
                  <button
                    type="button"
                    disabled={!bulkPrice.trim() && !bulkQty.trim()}
                    onClick={() => {
                      const patch: Partial<VariantRow> = {}
                      if (bulkPrice.trim()) patch.cost = bulkPrice.trim()
                      if (bulkQty.trim()) patch.stock = bulkQty.trim()
                      editRows(() => true, patch)
                      setBulkPrice('')
                      setBulkQty('')
                    }}
                    className="rounded-lg bg-ink px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
                  >
                    Apply to all {variantRows.length}
                  </button>
                </div>
              )}

              {photoFor && (
                <VariantPhotoDialog
                  title={photoFor.title}
                  color={photoFor.options.Color}
                  images={media.images}
                  current={rows[variantKey(photoFor.options)]?.imageUrl ?? ''}
                  onPick={pickPhoto}
                  onClose={() => setPhotoFor(null)}
                />
              )}

              {hasVariants && (
                <div className="-mx-1 overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead className="text-[11px] font-semibold uppercase tracking-wide text-ink/45">
                      <tr>
                        <th className="px-1 py-2">Variant</th>
                        <th className="px-1 py-2">Price</th>
                        {track && <th className="px-1 py-2">Qty</th>}
                        <th className="px-1 py-2">SKU</th>
                        <th className="px-1 py-2">Photo</th>
                        <th className="px-1 py-2 text-center">For sale</th>
                      </tr>
                    </thead>
                    <tbody>
                      {variantRows.map((r) => {
                        const label = [r.options.Size, r.options.Color].filter(Boolean).join(' / ')
                        return (
                          <tr key={variantKey(r.options)} className={`border-t border-ink/10 ${r.available ? '' : 'opacity-50'}`}>
                            <td className="px-1 py-2 font-semibold text-ink">{label}</td>
                            <td className="px-1 py-2">
                              <input type="number" inputMode="decimal" min="0" step="0.01" value={r.cost} onChange={(e) => editRow(r.options, { cost: e.target.value })} placeholder={costPrice || 'Same'} className={`${smallInput} w-24`} aria-label={`Price for ${label}`} />
                            </td>
                            {track && (
                              <td className="px-1 py-2">
                                <input type="number" inputMode="numeric" min="0" step="1" value={r.stock} onChange={(e) => editRow(r.options, { stock: e.target.value })} placeholder="0" className={`${smallInput} w-20`} aria-label={`Quantity for ${label}`} />
                              </td>
                            )}
                            <td className="px-1 py-2">
                              <input value={r.sku} maxLength={80} onChange={(e) => editRow(r.options, { sku: e.target.value })} className={`${smallInput} w-28`} aria-label={`SKU for ${label}`} />
                            </td>
                            <td className="px-1 py-2">
                              <PhotoButton url={r.imageUrl} label={`Choose photo for ${label}`} onClick={() => setPhotoFor({ title: label, options: r.options })} />
                            </td>
                            <td className="px-1 py-2 text-center">
                              <input type="checkbox" checked={r.available} onChange={(e) => editRow(r.options, { available: e.target.checked })} aria-label={`${label} for sale`} className="h-4 w-4 accent-teal" />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  <p className="mt-2 px-1 text-xs text-ink/45">Leave a price empty to use the main price. Tap a photo box to choose which photo shoppers see for that option.</p>
                </div>
              )}
            </div>
          </Card>

          <Card title="Product details" hint="Shown on the product page as bullet points and a details table.">
            <span className={labelClass}>Key points</span>
            <div className="flex flex-col gap-2">
              {highlights.map((h, i) => (
                <div key={i} className="flex gap-2">
                  <input value={h} maxLength={300} onChange={(e) => setHighlights((list) => list.map((x, j) => (j === i ? e.target.value : x)))} placeholder="e.g. Handwoven on a pit loom" className={inputClass} />
                  <button type="button" onClick={() => setHighlights((list) => list.filter((_, j) => j !== i))} aria-label="Remove point" className="grid w-10 flex-none place-items-center rounded-xl text-ink/45 hover:bg-ink/5 hover:text-red-600">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              {highlights.length < 12 && (
                <button type="button" onClick={() => setHighlights((l) => [...l, ''])} className="flex items-center gap-1.5 self-start text-sm font-semibold text-teal-deep">
                  <Plus size={14} /> Add a point
                </button>
              )}
            </div>

            <span className={`${labelClass} mt-5`}>Details</span>
            <div className="flex flex-col gap-2">
              {specs.map((s, i) => (
                <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_40px] gap-2">
                  <input value={s.name} list="product-detail-names" maxLength={60} onChange={(e) => setSpecs((list) => list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="e.g. Material" className={inputClass} />
                  <input value={s.value} maxLength={500} onChange={(e) => setSpecs((list) => list.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} placeholder="e.g. 100% cotton" className={inputClass} />
                  <button type="button" onClick={() => setSpecs((list) => list.filter((_, j) => j !== i))} aria-label="Remove detail" className="grid place-items-center rounded-xl text-ink/45 hover:bg-ink/5 hover:text-red-600">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              <datalist id="product-detail-names">
                {DETAIL_PICKS.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
              <div className="flex flex-wrap gap-1.5">
                {DETAIL_PICKS.filter((d) => !specs.some((s) => s.name.toLowerCase() === d.toLowerCase()))
                  .slice(0, 6)
                  .map((d) => (
                    <button key={d} type="button" onClick={() => setSpecs((l) => [...l, { name: d, value: '' }])} className="rounded-full border border-dashed border-ink/25 px-2.5 py-1 text-xs text-ink/60 hover:border-teal hover:text-teal-deep">
                      + {d}
                    </button>
                  ))}
                <button type="button" onClick={() => setSpecs((l) => [...l, { name: '', value: '' }])} className="rounded-full border border-dashed border-ink/25 px-2.5 py-1 text-xs text-ink/60 hover:border-teal hover:text-teal-deep">
                  + Other
                </button>
              </div>
            </div>
          </Card>
        </div>

        {/* ── Side column ── */}
        <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4">
          <Card title="Status">
            <select value={active ? 'active' : 'draft'} onChange={(e) => setActive(e.target.value === 'active')} className={inputClass}>
              <option value="active">Active: on the store</option>
              <option value="draft">Draft: hidden</option>
            </select>
            <p className={hintClass}>{active ? 'Shoppers can see and buy it as soon as you save.' : 'Only you can see it until you make it active.'}</p>
          </Card>

          <Card title="Organization">
            <label className="block">
              <span className={labelClass}>Category</span>
              <input value={category} maxLength={80} onChange={(e) => setCategory(e.target.value)} list="catalogue-category-suggestions" placeholder="e.g. Sarees" className={inputClass} />
              <datalist id="catalogue-category-suggestions">
                {categorySuggestions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <span className={hintClass}>Shoppers filter the store by category.</span>
            </label>
            <label className="mt-4 block">
              <span className={labelClass}>Brand (optional)</span>
              <input value={brand} maxLength={80} onChange={(e) => setBrand(e.target.value)} placeholder="If it isn't your own" className={inputClass} />
            </label>
            <label className="mt-4 block">
              <span className={labelClass}>For</span>
              <select value={gender} onChange={(e) => setGender(e.target.value)} className={inputClass}>
                <option value="">Not specified</option>
                <option value="women">Women</option>
                <option value="men">Men</option>
                <option value="unisex">Everyone</option>
              </select>
            </label>
            <div className="mt-4">
              <span className={labelClass}>Tags</span>
              <ChipInput values={tags} onChange={setTags} placeholder="e.g. new, festive" />
              <span className={hintClass}>Help shoppers find it in search.</span>
            </div>
          </Card>

          {collectionsUrl && (
            <Card title="Collections" hint="Groups shoppers can filter the store by. A product can be in several.">
              {collections === null ? (
                <p className="text-sm text-ink/45">Loading…</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {collections.length === 0 && <p className="text-sm text-ink/50">No collections yet.</p>}
                  {collections.map((c) => (
                    <label key={c.id} className="flex cursor-pointer items-center gap-2.5 text-sm text-ink">
                      <input
                        type="checkbox"
                        checked={collectionIds.includes(c.id)}
                        onChange={(e) => setCollectionIds((ids) => (e.target.checked ? [...ids, c.id] : ids.filter((x) => x !== c.id)))}
                        className="h-4 w-4 accent-teal"
                      />
                      {c.name}
                    </label>
                  ))}
                  <div className="mt-1 flex gap-2">
                    <input
                      value={newCollection}
                      maxLength={60}
                      onChange={(e) => setNewCollection(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          void addCollection()
                        }
                      }}
                      placeholder="New collection"
                      className={smallInput}
                    />
                    <button type="button" onClick={() => void addCollection()} disabled={!newCollection.trim() || creatingCollection} className="flex-none rounded-lg bg-ink px-3 text-xs font-bold text-white disabled:opacity-40">
                      Add
                    </button>
                  </div>
                </div>
              )}
              {collectionsNote && <p className="mt-2 text-xs font-medium text-red-600">{collectionsNote}</p>}
            </Card>
          )}

          {staff && (
            <Card title="Wishdrop margin" hint="Staff only. The seller never sees this field.">
              <div className="flex items-center gap-2">
                <input type="number" inputMode="decimal" min="0" step="0.5" value={margin} onChange={(e) => setMargin(e.target.value)} className={`${inputClass} w-28`} />
                <span className="text-sm text-ink/55">%</span>
              </div>
            </Card>
          )}
        </div>
      </div>

      {error && <p className="mt-4 text-sm font-medium text-red-600">{error}</p>}

      <div className="sticky bottom-0 z-10 -mx-1 mt-4 flex gap-3 border-t border-ink/10 bg-parchment/95 px-1 py-3 backdrop-blur sm:justify-end">
        {onCancel && (
          <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-ink/15 bg-card px-4 py-3 text-sm font-semibold text-ink/70 sm:flex-none sm:py-2.5">
            Cancel
          </button>
        )}
        <button type="submit" disabled={saving || uploading} className="flex-1 rounded-xl bg-teal px-6 py-3 text-sm font-bold text-white hover:bg-teal-deep disabled:opacity-60 sm:flex-none sm:py-2.5">
          {saving ? 'Saving…' : uploading ? 'Uploading…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
