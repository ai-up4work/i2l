// components/admin/wishdrop-mall/ProductEditor.tsx
//
// The one editor for every Wishdrop Mall product — used to:
//   - add a product by hand (emptyForm),
//   - review/edit a product pulled from a link or another store before
//     saving (draftToForm — fed by the SAME extractors the storefront's
//     product pages use: /api/product-lookup's scraper for links,
//     fetchStoreProduct for affiliated stores),
//   - edit a saved product (fullToForm, from GET /products/[id]).
//
// Every field is editable: title, brand, category, gender, SKU, tags,
// images (first = primary, rest = gallery; reorder/remove/add by link or
// upload from computer), price & "was" price in LKR, description,
// highlights, specifications, weight, visibility, supplier link + price,
// and variants — each with its own option values, optional own price,
// image, supplier link/price and QUANTITY ON HAND.
//
// The Mall sells stock Wishdrop already holds, so quantity is required
// (per variant when there are variants). Image links are saved as links;
// only photos uploaded from the computer go into our own Storage.
'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Loader2,
  Plus,
  Sparkles,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { normalizeDescription } from '@/lib/scrape/normalize-description'
import { getDualDeliveryPricing } from '@/lib/pricing'
import {
  MALL_DELIVERY_FEE_LKR,
  approxLKR,
  variantLabel,
  type MallCategory,
  type MallDraft,
  type MallProductFull,
  type MallProductInput,
  type MallProductRow,
} from '@/lib/wishdrop-mall'
import { Dialog, ICON_BUTTON, INPUT, PRIMARY_BUTTON, SECONDARY_BUTTON, Thumb, formatMoney, mallApi } from './shared'

// ─── Form state (strings for inputs; converted on save) ─────────────────

type VariantForm = {
  key: string
  id?: string
  options: Record<string, string>
  price: string
  imageUrl: string
  sourceUrl: string
  sourcePrice: string
  sku: string
  /** Quantity on hand. */
  stock: string
}

export type ProductForm = {
  name: string
  brand: string
  /** Mall category id; '' = uncategorized. */
  categoryId: string
  /** The supplier's own category name, shown as a hint on imports. */
  category: string
  gender: '' | 'men' | 'women' | 'unisex'
  sku: string
  tags: string
  images: string[]
  description: string
  highlights: string[]
  specs: { name: string; value: string }[]
  price: string
  compareAt: string
  weightKg: string
  stockCount: string
  active: boolean
  source: { platform: string; handle: string; url: string; price: string; currency: string }
  optionNames: string[]
  variants: VariantForm[]
  /** Values the supplier lists outside its variants (e.g. sizes). */
  suggestedOptions: Record<string, string[]>
}

let keySeq = 0
const newKey = () => `v${++keySeq}`
const numStr = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? '' : String(n))

export function emptyForm(): ProductForm {
  return {
    name: '',
    brand: '',
    categoryId: '',
    category: '',
    gender: '',
    sku: '',
    tags: '',
    images: [],
    description: '',
    highlights: [],
    specs: [],
    price: '',
    compareAt: '',
    weightKg: '',
    stockCount: '',
    active: true,
    source: { platform: '', handle: '', url: '', price: '', currency: 'INR' },
    optionNames: [],
    variants: [],
    suggestedOptions: {},
  }
}

/** HTML -> readable plain text with paragraph breaks kept. */
function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
  const el = document.createElement('textarea')
  el.innerHTML = withBreaks
  return el.value.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Pre-fills the editor from whatever the extractors found. If the
 *  supplier's category matches one of the Mall's (by name), it's chosen. */
export function draftToForm(draft: MallDraft, categories: MallCategory[] = []): ProductForm {
  // Store feeds (Shopify etc.) put the real description — often with a
  // spec table — in fullDescription HTML. Run it through the SAME
  // normaliser the product page uses to split prose from specs.
  let description = draft.description ?? ''
  let specs = [...(draft.specs ?? [])]
  if (draft.fullDescription) {
    const normalized = normalizeDescription(draft.fullDescription, draft.description)
    if (normalized.html) description = htmlToText(normalized.html)
    else if (normalized.text) description = normalized.text
    const seen = new Set(specs.map((s) => s.name.toLowerCase()))
    for (const s of normalized.specs) {
      if (!seen.has(s.name.toLowerCase())) {
        specs.push(s)
        seen.add(s.name.toLowerCase())
      }
    }
  }
  specs = specs.slice(0, 80)

  const optionNames: string[] = []
  for (const v of draft.variants) for (const k of Object.keys(v.options)) if (!optionNames.includes(k)) optionNames.push(k)

  return {
    name: draft.name ?? '',
    brand: draft.brand ?? '',
    categoryId:
      categories.find((c) => c.name.toLowerCase() === (draft.category ?? '').trim().toLowerCase())?.id ?? '',
    category: draft.category && draft.category !== 'General' ? draft.category : '',
    gender: draft.gender ?? '',
    sku: draft.sku ?? '',
    tags: (draft.tags ?? []).join(', '),
    images: Array.from(new Set(draft.images ?? [])),
    description,
    highlights: draft.highlights ?? [],
    specs,
    price: '',
    compareAt: '',
    weightKg: numStr(draft.weightKg),
    // The supplier's stock isn't ours — staff enter what they hold.
    stockCount: '',
    active: true,
    source: {
      platform: draft.source.platform ?? '',
      handle: draft.source.handle ?? '',
      url: draft.source.url ?? '',
      price: numStr(draft.costPrice),
      currency: draft.currency || 'INR',
    },
    optionNames: optionNames.slice(0, 3),
    suggestedOptions: draft.suggestedOptions ?? {},
    variants: draft.variants.map((v) => ({
      key: newKey(),
      options: v.options,
      price: '', // same as product price unless staff set one
      imageUrl: v.imageUrl ?? '',
      sourceUrl: v.sourceUrl ?? '',
      sourcePrice: numStr(v.costPrice),
      sku: v.sku ?? '',
      stock: '',
    })),
  }
}

/** A saved product, for editing. */
export function fullToForm(p: MallProductFull): ProductForm {
  return {
    name: p.name,
    brand: p.brand ?? '',
    categoryId: p.categoryId ?? '',
    category: '',
    gender: p.gender ?? '',
    sku: p.sku ?? '',
    tags: p.tags.join(', '),
    images: p.images,
    description: p.description,
    highlights: p.highlights,
    specs: p.specs,
    price: p.priceLKR ? String(p.priceLKR) : '',
    compareAt: numStr(p.compareAtLKR),
    weightKg: numStr(p.weightKg),
    stockCount: numStr(p.stockCount),
    active: p.active,
    source: {
      platform: p.source.platform ?? '',
      handle: p.source.handle ?? '',
      url: p.source.url ?? '',
      price: numStr(p.source.price),
      currency: p.source.currency ?? 'INR',
    },
    optionNames: p.optionNames,
    suggestedOptions: {},
    variants: p.variants.map((v) => ({
      key: newKey(),
      id: v.id,
      options: v.options,
      price: numStr(v.priceLKR),
      imageUrl: v.imageUrl ?? '',
      sourceUrl: v.sourceUrl ?? '',
      sourcePrice: numStr(v.sourcePrice),
      sku: v.sku ?? '',
      stock: String(v.stock ?? 0),
    })),
  }
}

const toNum = (s: string): number | null => {
  const t = s.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function formToInput(f: ProductForm): MallProductInput {
  return {
    name: f.name.trim(),
    brand: f.brand.trim() || null,
    categoryId: f.categoryId || null,
    // Derived from categoryId on the server.
    category: 'General',
    gender: f.gender || null,
    sku: f.sku.trim() || null,
    tags: f.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    images: f.images.map((u) => u.trim()).filter(Boolean),
    description: f.description.trim(),
    highlights: f.highlights.map((h) => h.trim()).filter(Boolean),
    specs: f.specs.map((s) => ({ name: s.name.trim(), value: s.value.trim() })).filter((s) => s.name && s.value),
    priceLKR: Math.round(Number(f.price)),
    compareAtLKR: toNum(f.compareAt),
    weightKg: toNum(f.weightKg),
    stockCount: toNum(f.stockCount),
    active: f.active,
    source: {
      platform: f.source.platform.trim() || null,
      handle: f.source.handle.trim() || null,
      url: f.source.url.trim() || null,
      price: toNum(f.source.price),
      currency: f.source.currency.trim().toUpperCase() || null,
    },
    optionNames: f.optionNames.map((n) => n.trim()).filter(Boolean),
    variants: f.variants.map((v) => ({
      id: v.id,
      options: v.options,
      priceLKR: toNum(v.price),
      imageUrl: v.imageUrl.trim() || null,
      sourceUrl: v.sourceUrl.trim() || null,
      sourcePrice: toNum(v.sourcePrice),
      sku: v.sku.trim() || null,
      // Server sets availability from quantity (0 = sold out).
      available: true,
      stock: Math.max(0, Math.floor(toNum(v.stock) ?? 0)),
    })),
  }
}

// ─── Editor ─────────────────────────────────────────────────────────────

const LABEL = 'text-xs font-semibold text-ink/60'
const SECTION = 'rounded-2xl border border-ink/10 bg-card p-5'
const SECTION_TITLE = 'font-display text-lg font-semibold text-ink'

export default function ProductEditor({
  initial,
  productId,
  duplicateOf,
  sourceWarning,
  subtitle,
  categories,
  onCategoryCreated,
  onClose,
  onSaved,
}: {
  initial: ProductForm
  /** Set when editing a saved product (PUT); absent when creating (POST). */
  productId?: string
  duplicateOf?: { id: string; name: string } | null
  sourceWarning?: string | null
  subtitle?: string
  categories: MallCategory[]
  /** A category was created from inside the editor. */
  onCategoryCreated?: (category: MallCategory) => void
  onClose: () => void
  onSaved: (row: MallProductRow, warnings: string[]) => void
}) {
  const [f, setF] = useState<ProductForm>(initial)
  const [localCategories, setLocalCategories] = useState<MallCategory[]>(categories)
  const [newCategory, setNewCategory] = useState<string | null>(null)
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [allowDuplicate, setAllowDuplicate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newImage, setNewImage] = useState('')
  // Pre-filled from the variants already there (e.g. imported designs),
  // so "Create all combinations" starts from what exists.
  const [axisValues, setAxisValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      initial.optionNames.map((axis) => [
        axis,
        Array.from(new Set(initial.variants.map((v) => v.options[axis]).filter(Boolean))).join(', '),
      ]),
    ),
  )

  const set = <K extends keyof ProductForm>(key: K, value: ProductForm[K]) => setF((prev) => ({ ...prev, [key]: value }))
  const setSource = (key: keyof ProductForm['source'], value: string) =>
    setF((prev) => ({ ...prev, source: { ...prev.source, [key]: value } }))

  const priceNum = Math.round(Number(f.price))
  const priceValid = f.price.trim() !== '' && Number.isFinite(priceNum) && priceNum > 0
  const compareNum = toNum(f.compareAt)
  const compareValid = compareNum == null || (priceValid && compareNum > priceNum)

  const reference = useMemo(() => {
    const sp = toNum(f.source.price)
    if (sp == null || sp <= 0) return null
    const currency = f.source.currency || 'INR'
    const normal = getDualDeliveryPricing({ price: sp, currency, weightKg: toNum(f.weightKg) })
    return { sourceLKR: approxLKR(sp, currency), normalTotal: Math.round(normal.express.actualTotalLKR), currency, sp }
  }, [f.source.price, f.source.currency, f.weightKg])

  const createCategory = async () => {
    const name = (newCategory ?? '').trim()
    if (!name) return
    setCreatingCategory(true)
    setError(null)
    try {
      const { category } = await mallApi<{ category: MallCategory }>('/api/admin/wishdrop-mall/categories', {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
      setLocalCategories((prev) => [...prev, category])
      set('categoryId', category.id)
      setNewCategory(null)
      onCategoryCreated?.(category)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCreatingCategory(false)
    }
  }

  // ── Images ──
  const moveImage = (i: number, dir: -1 | 1) =>
    setF((prev) => {
      const images = [...prev.images]
      const j = i + dir
      if (j < 0 || j >= images.length) return prev
      ;[images[i], images[j]] = [images[j], images[i]]
      return { ...prev, images }
    })
  const makePrimary = (i: number) =>
    setF((prev) => {
      const images = [...prev.images]
      const [img] = images.splice(i, 1)
      return { ...prev, images: [img, ...images] }
    })
  const addImages = () => {
    const urls = newImage
      .split(/\s+/)
      .map((u) => u.trim())
      .filter((u) => /^https?:\/\//i.test(u))
    if (urls.length === 0) return
    setF((prev) => ({ ...prev, images: Array.from(new Set([...prev.images, ...urls])) }))
    setNewImage('')
  }

  /** Photos of your own stock, from this computer — same upload route
   *  the rest of the admin uses (public `uploads` bucket). */
  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    setError(null)
    const added: string[] = []
    for (const file of Array.from(files).slice(0, 20)) {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('folder', 'products')
      try {
        const res = await fetch('/api/upload', { method: 'POST', body: fd })
        const body = await res.json().catch(() => ({}))
        if (!res.ok || !body.url) throw new Error(body.error ?? 'Upload failed')
        added.push(body.url as string)
      } catch (e) {
        setError(`${file.name}: ${(e as Error).message}`)
      }
    }
    if (added.length) setF((prev) => ({ ...prev, images: Array.from(new Set([...prev.images, ...added])) }))
    setUploading(false)
  }

  // ── Variant axes ──
  const addAxis = () => {
    if (f.optionNames.length >= 3) return
    const defaults = ['Color', 'Size', 'Style']
    const name = defaults.find((d) => !f.optionNames.includes(d)) ?? `Option ${f.optionNames.length + 1}`
    set('optionNames', [...f.optionNames, name])
  }
  const renameAxis = (i: number, name: string) =>
    setF((prev) => {
      const old = prev.optionNames[i]
      const optionNames = prev.optionNames.map((n, j) => (j === i ? name : n))
      const variants = prev.variants.map((v) => {
        if (!(old in v.options)) return v
        const options = { ...v.options }
        const val = options[old]
        delete options[old]
        if (name) options[name] = val
        return { ...v, options }
      })
      return { ...prev, optionNames, variants }
    })
  const removeAxis = (i: number) =>
    setF((prev) => {
      const old = prev.optionNames[i]
      return {
        ...prev,
        optionNames: prev.optionNames.filter((_, j) => j !== i),
        variants: prev.variants.map((v) => {
          const options = { ...v.options }
          delete options[old]
          return { ...v, options }
        }),
      }
    })

  /**
   * Replaces the variant rows with every combination of `lists` (one list
   * of values per axis). A row that already exists for a combination is
   * kept as-is. A NEW combination copies the details (image, price,
   * supplier link/price, SKU) from an existing row it extends — so adding
   * Size to 12 designs gives "ACB1966 / M" the ACB1966 photo and link.
   * Quantities start at 0 for new rows.
   */
  const buildCombinations = (axes: string[], lists: string[][]) => {
    let combos: Record<string, string>[] = [{}]
    for (let i = 0; i < axes.length; i++) {
      combos = combos.flatMap((c) => lists[i].map((val) => ({ ...c, [axes[i]]: val })))
    }
    combos = combos.slice(0, 250)
    setError(null)
    setF((prev) => {
      const byLabel = new Map(prev.variants.map((v) => [variantLabel(v.options, axes), v]))
      const extends_ = (row: VariantForm, combo: Record<string, string>) => {
        const entries = Object.entries(row.options).filter(([, val]) => val)
        return entries.length > 0 && entries.every(([k, val]) => combo[k] === val)
      }
      const variants = combos.map((options) => {
        const exact = byLabel.get(variantLabel(options, axes))
        if (exact) return { ...exact, options }
        const parent = prev.variants.find((v) => extends_(v, options))
        return {
          key: newKey(),
          options,
          price: parent?.price ?? '',
          imageUrl: parent?.imageUrl ?? '',
          sourceUrl: parent?.sourceUrl ?? '',
          sourcePrice: parent?.sourcePrice ?? '',
          sku: parent?.sku ?? '',
          stock: '0',
        }
      })
      return { ...prev, optionNames: axes, variants }
    })
  }

  /** "Create all combinations" from the values typed per option. */
  const generateVariants = () => {
    const axes = f.optionNames.filter(Boolean)
    const lists = axes.map((a) =>
      (axisValues[a] ?? '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    )
    if (axes.length === 0 || lists.some((l) => l.length === 0)) {
      setError('Type values for every option first, separated by commas (e.g. Red, Blue).')
      return
    }
    buildCombinations(axes, lists)
  }

  /** Adds a supplier-suggested option (e.g. Size) across every existing
   *  variant in one click. */
  const applySuggestedOption = (name: string, values: string[]) => {
    if (f.optionNames.length >= 3) return setError('A product can have at most 3 options.')
    const axes = [...f.optionNames.filter(Boolean), name]
    const lists = axes.map((a) =>
      a === name
        ? values
        : Array.from(new Set(f.variants.map((v) => v.options[a]).filter((x): x is string => !!x))),
    )
    if (lists.some((l) => l.length === 0)) return setError('Add values for the existing options first.')
    setAxisValues((prev) => ({ ...prev, ...Object.fromEntries(axes.map((a, i) => [a, lists[i].join(', ')])) }))
    buildCombinations(axes, lists)
    setF((prev) => {
      const rest = { ...prev.suggestedOptions }
      delete rest[name]
      return { ...prev, suggestedOptions: rest }
    })
  }

  const updateVariant = (key: string, patch: Partial<VariantForm>) =>
    setF((prev) => ({ ...prev, variants: prev.variants.map((v) => (v.key === key ? { ...v, ...patch } : v)) }))
  const addVariantRow = () =>
    setF((prev) => ({
      ...prev,
      variants: [
        ...prev.variants,
        { key: newKey(), options: {}, price: '', imageUrl: '', sourceUrl: '', sourcePrice: '', sku: '', stock: '0' },
      ],
    }))

  // ── Save ──
  const save = async () => {
    if (!f.name.trim()) return setError('Title is required.')
    if (!priceValid) return setError('Enter the price in rupees.')
    if (!compareValid) return setError('The “was” price must be higher than the price.')
    if (f.variants.length > 0 && f.optionNames.filter(Boolean).length === 0) {
      return setError('Give your variants at least one option name (e.g. Color).')
    }
    if (f.variants.length === 0 && f.stockCount.trim() === '') {
      return setError('Enter the quantity you have in stock (0 if none yet).')
    }
    setSaving(true)
    setError(null)
    try {
      const payload = formToInput(f)
      const { product, warnings } = productId
        ? await mallApi<{ product: MallProductRow; warnings?: string[] }>(`/api/admin/wishdrop-mall/products/${productId}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          })
        : await mallApi<{ product: MallProductRow; warnings?: string[] }>('/api/admin/wishdrop-mall/products', {
            method: 'POST',
            body: JSON.stringify({ ...payload, allowDuplicate }),
          })
      onSaved({ ...product, images: product.images ?? [] }, warnings ?? [])
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  const blockedByDuplicate = !productId && !!duplicateOf && !allowDuplicate

  return (
    <Dialog
      title={productId ? 'Edit product' : 'New Wishdrop Mall product'}
      subtitle={subtitle}
      onClose={onClose}
      xwide
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <label className="flex items-center gap-2 text-sm text-ink/70">
              <input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} className="accent-teal-deep" />
              Visible to shoppers
            </label>
            {error && <p className="text-sm font-semibold text-rose-700">{error}</p>}
          </div>
          <div className="flex gap-2">
            <button type="button" className={SECONDARY_BUTTON} onClick={onClose}>
              Cancel
            </button>
            <button type="button" className={PRIMARY_BUTTON} onClick={save} disabled={saving || blockedByDuplicate}>
              {saving && <Loader2 size={14} className="animate-spin" />}
              {productId ? 'Save changes' : 'Add to Mall'}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-5 min-w-0">
        {duplicateOf && !productId && (
          <div className="rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-ink/80">
            <p className="font-semibold">Already in Wishdrop Mall as &ldquo;{duplicateOf.name}&rdquo;.</p>
            <label className="mt-1.5 flex items-center gap-2 text-xs">
              <input type="checkbox" checked={allowDuplicate} onChange={(e) => setAllowDuplicate(e.target.checked)} className="accent-teal-deep" />
              Add a second copy anyway
            </label>
          </div>
        )}
        {f.variants.length > 0 && (
          <button
            type="button"
            onClick={() => document.getElementById('mall-editor-variants')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="text-xs font-semibold text-teal-deep underline decoration-dotted underline-offset-4"
          >
            {f.variants.length} variant{f.variants.length === 1 ? '' : 's'} below — set quantities ↓
          </button>
        )}
        {sourceWarning && (
          <p className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-800">
            <AlertTriangle size={14} /> {sourceWarning}
          </p>
        )}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          {/* ── Left column ── */}
          <div className="space-y-5 min-w-0">
            <section className={SECTION}>
              <h3 className={SECTION_TITLE}>Basics</h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className={LABEL}>Title *</span>
                  <input value={f.name} onChange={(e) => set('name', e.target.value)} className={`${INPUT} mt-1`} />
                </label>
                <label className="block">
                  <span className={LABEL}>Brand</span>
                  <input value={f.brand} onChange={(e) => set('brand', e.target.value)} className={`${INPUT} mt-1`} />
                </label>
                <div className="block">
                  <span className={LABEL}>Category</span>
                  {newCategory === null ? (
                    <select
                      value={f.categoryId}
                      onChange={(e) => (e.target.value === '__new' ? setNewCategory(f.category || '') : set('categoryId', e.target.value))}
                      className={`${INPUT} mt-1`}
                      aria-label="Category"
                    >
                      <option value="">Uncategorized</option>
                      {localCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {c.active ? '' : ' (hidden)'}
                        </option>
                      ))}
                      <option value="__new">+ New category…</option>
                    </select>
                  ) : (
                    <div className="mt-1 flex gap-2">
                      <input
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), createCategory())}
                        placeholder="New category name"
                        autoFocus
                        className={INPUT}
                      />
                      <button type="button" onClick={createCategory} disabled={creatingCategory || !newCategory.trim()} className={SECONDARY_BUTTON}>
                        {creatingCategory ? <Loader2 size={14} className="animate-spin" /> : 'Create'}
                      </button>
                      <button type="button" onClick={() => setNewCategory(null)} className={ICON_BUTTON} aria-label="Cancel">
                        <X size={14} />
                      </button>
                    </div>
                  )}
                  {f.category && !f.categoryId && newCategory === null && (
                    <p className="mt-1 text-[11px] text-ink/45">
                      Supplier&rsquo;s category: {f.category}{' '}
                      <button type="button" onClick={() => setNewCategory(f.category)} className="font-semibold text-teal-deep">
                        Create it
                      </button>
                    </p>
                  )}
                </div>
                <label className="block">
                  <span className={LABEL}>For</span>
                  <select value={f.gender} onChange={(e) => set('gender', e.target.value as ProductForm['gender'])} className={`${INPUT} mt-1`}>
                    <option value="">Anyone</option>
                    <option value="women">Women</option>
                    <option value="men">Men</option>
                    <option value="unisex">Unisex</option>
                  </select>
                </label>
                <label className="block">
                  <span className={LABEL}>SKU / model no.</span>
                  <input value={f.sku} onChange={(e) => set('sku', e.target.value)} className={`${INPUT} mt-1`} />
                </label>
                <label className="block sm:col-span-2">
                  <span className={LABEL}>Tags (comma separated)</span>
                  <input value={f.tags} onChange={(e) => set('tags', e.target.value)} placeholder="gift, cotton, festive" className={`${INPUT} mt-1`} />
                </label>
              </div>
            </section>

            <section className={SECTION}>
              <h3 className={SECTION_TITLE}>Description</h3>
              <textarea
                value={f.description}
                onChange={(e) => set('description', e.target.value)}
                rows={6}
                placeholder="Describe the product. Leave a blank line between paragraphs."
                className={`${INPUT} mt-3 resize-y`}
              />

              <div className="mt-5 flex items-center justify-between">
                <span className={LABEL}>Highlights (&ldquo;About this item&rdquo; bullets)</span>
                <button type="button" onClick={() => set('highlights', [...f.highlights, ''])} className="text-xs font-semibold text-teal-deep">
                  + Add bullet
                </button>
              </div>
              <div className="mt-2 space-y-2">
                {f.highlights.map((h, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      value={h}
                      onChange={(e) => set('highlights', f.highlights.map((x, j) => (j === i ? e.target.value : x)))}
                      className={INPUT}
                    />
                    <button type="button" className={ICON_BUTTON} onClick={() => set('highlights', f.highlights.filter((_, j) => j !== i))} aria-label="Remove bullet">
                      <X size={14} />
                    </button>
                  </div>
                ))}
                {f.highlights.length === 0 && <p className="text-xs text-ink/40">No highlights yet.</p>}
              </div>

              <div className="mt-5 flex items-center justify-between">
                <span className={LABEL}>Specifications</span>
                <button type="button" onClick={() => set('specs', [...f.specs, { name: '', value: '' }])} className="text-xs font-semibold text-teal-deep">
                  + Add row
                </button>
              </div>
              <div className="mt-2 space-y-2">
                {f.specs.map((s, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1.5fr_auto] gap-2">
                    <input
                      value={s.name}
                      placeholder="e.g. Material"
                      onChange={(e) => set('specs', f.specs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                      className={INPUT}
                    />
                    <input
                      value={s.value}
                      placeholder="e.g. 100% cotton"
                      onChange={(e) => set('specs', f.specs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                      className={INPUT}
                    />
                    <button type="button" className={ICON_BUTTON} onClick={() => set('specs', f.specs.filter((_, j) => j !== i))} aria-label="Remove row">
                      <X size={14} />
                    </button>
                  </div>
                ))}
                {f.specs.length === 0 && <p className="text-xs text-ink/40">No specifications yet.</p>}
              </div>
            </section>
          </div>

          {/* ── Right column ── */}
          <div className="space-y-5">
            <section className={SECTION}>
              <h3 className={SECTION_TITLE}>Price</h3>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <label className="block">
                  <span className={LABEL}>Price (Rs) *</span>
                  <input
                    value={f.price}
                    onChange={(e) => set('price', e.target.value.replace(/[^0-9.]/g, ''))}
                    inputMode="numeric"
                    placeholder="e.g. 4500"
                    className={`${INPUT} mt-1 font-display text-lg`}
                  />
                </label>
                <label className="block">
                  <span className={LABEL}>Was price (optional)</span>
                  <input value={f.compareAt} onChange={(e) => set('compareAt', e.target.value.replace(/[^0-9.]/g, ''))} inputMode="numeric" className={`${INPUT} mt-1`} />
                </label>
              </div>
              <p className="mt-3 text-sm text-ink/65">
                {priceValid ? (
                  <>
                    Customer pays <strong className="text-ink">{formatMoney(priceNum, 'Rs')}</strong> + {formatMoney(MALL_DELIVERY_FEE_LKR, 'Rs')} delivery.
                  </>
                ) : (
                  <>+ {formatMoney(MALL_DELIVERY_FEE_LKR, 'Rs')} delivery. No tax or import charges.</>
                )}
              </p>
              {reference && (
                <div className="mt-3 space-y-1 border-t border-ink/10 pt-3 text-xs text-ink/55">
                  <p>
                    Source price {formatMoney(reference.sp, reference.currency)}
                    {reference.currency !== 'LKR' && reference.sourceLKR != null && <> ≈ {formatMoney(reference.sourceLKR, 'Rs')} today</>}
                  </p>
                  <p>
                    Same item via normal import: {formatMoney(reference.normalTotal, 'Rs')} total
                    {priceValid && <> · Mall total {formatMoney(priceNum + MALL_DELIVERY_FEE_LKR, 'Rs')}</>}
                  </p>
                </div>
              )}
            </section>

            <section className={SECTION}>
              <h3 className={SECTION_TITLE}>Inventory &amp; supplier (staff only)</h3>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <label className="block">
                  <span className={LABEL}>In stock (qty) *</span>
                  {f.variants.length > 0 ? (
                    <p className={`${INPUT} mt-1 bg-parchment/60 font-semibold text-ink/70`}>
                      {f.variants.reduce((sum, v) => sum + Math.max(0, Math.floor(toNum(v.stock) ?? 0)), 0)}{' '}
                      <span className="font-normal text-ink/45">(sum of variants)</span>
                    </p>
                  ) : (
                    <input
                      value={f.stockCount}
                      onChange={(e) => set('stockCount', e.target.value.replace(/[^0-9]/g, ''))}
                      inputMode="numeric"
                      placeholder="e.g. 25"
                      className={`${INPUT} mt-1 font-semibold`}
                    />
                  )}
                </label>
                <label className="block">
                  <span className={LABEL}>Weight (kg)</span>
                  <input value={f.weightKg} onChange={(e) => set('weightKg', e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" className={`${INPUT} mt-1`} />
                </label>
              </div>
              <label className="mt-3 block">
                <span className={LABEL}>Supplier link (for reordering)</span>
                <div className="mt-1 flex gap-2">
                  <input value={f.source.url} onChange={(e) => setSource('url', e.target.value)} placeholder="https://…" className={INPUT} />
                  {/^https?:\/\//.test(f.source.url) && (
                    <a href={f.source.url} target="_blank" rel="noreferrer" className={ICON_BUTTON} aria-label="Open buy link">
                      <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              </label>
              <div className="mt-3 grid grid-cols-[1fr_5rem] gap-2">
                <label className="block">
                  <span className={LABEL}>Supplier price</span>
                  <input value={f.source.price} onChange={(e) => setSource('price', e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" className={`${INPUT} mt-1`} />
                </label>
                <label className="block">
                  <span className={LABEL}>Currency</span>
                  <input value={f.source.currency} onChange={(e) => setSource('currency', e.target.value.toUpperCase().slice(0, 3))} className={`${INPUT} mt-1 uppercase`} />
                </label>
              </div>
            </section>

            <section className={SECTION}>
              <h3 className={SECTION_TITLE}>Images</h3>
              <p className="mt-1 text-xs text-ink/50">
                The first image is the primary photo; the rest show in the gallery. Pasted links are saved as
                links; photos you upload are stored in your own storage.
              </p>
              <div className="mt-3 space-y-2">
                {f.images.map((src, i) => (
                  <div key={src} className="flex min-w-0 items-center gap-2">
                    <Thumb src={src} alt="" size={48} />
                    <div className="min-w-0 flex-1">
                      {i === 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-teal-deep/10 px-2 py-0.5 text-[11px] font-semibold text-teal-deep">
                          <Star size={10} /> Primary
                        </span>
                      ) : (
                        <button type="button" onClick={() => makePrimary(i)} className="text-[11px] font-semibold text-ink/45 hover:text-teal-deep">
                          Make primary
                        </button>
                      )}
                      <p className="truncate text-xs text-ink/45">{src}</p>
                    </div>
                    <button type="button" className={ICON_BUTTON} onClick={() => moveImage(i, -1)} disabled={i === 0} aria-label="Move up">
                      <ArrowUp size={13} />
                    </button>
                    <button type="button" className={ICON_BUTTON} onClick={() => moveImage(i, 1)} disabled={i === f.images.length - 1} aria-label="Move down">
                      <ArrowDown size={13} />
                    </button>
                    <button type="button" className={ICON_BUTTON} onClick={() => set('images', f.images.filter((_, j) => j !== i))} aria-label="Remove image">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  value={newImage}
                  onChange={(e) => setNewImage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addImages())}
                  placeholder="Paste image link(s)"
                  className={INPUT}
                />
                <button type="button" onClick={addImages} className={SECONDARY_BUTTON}>
                  <Plus size={14} /> Add
                </button>
              </div>
              <label className={`${SECONDARY_BUTTON} mt-2 w-full cursor-pointer ${uploading ? 'pointer-events-none opacity-60' : ''}`}>
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {uploading ? 'Uploading…' : 'Upload from computer'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  multiple
                  className="sr-only"
                  onChange={(e) => {
                    uploadFiles(e.target.files)
                    e.target.value = ''
                  }}
                />
              </label>
            </section>
          </div>
        </div>

        {/* ── Variants (full width) ── */}
        <section id="mall-editor-variants" className={`${SECTION} scroll-mt-4`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className={SECTION_TITLE}>Variants</h3>
              <p className="mt-0.5 text-xs text-ink/50">
                Sizes, colours, styles. Enter how many of each you hold. Leave a variant&rsquo;s price blank to use the product
                price. 0 in stock shows as sold out.
              </p>
            </div>
            <button type="button" onClick={addAxis} disabled={f.optionNames.length >= 3} className={SECONDARY_BUTTON}>
              <Plus size={14} /> Add option
            </button>
          </div>

          {Object.entries(f.suggestedOptions)
            .filter(([name]) => !f.optionNames.some((n) => n.toLowerCase() === name.toLowerCase()))
            .map(([name, values]) => (
              <div
                key={name}
                className="mt-4 flex flex-col gap-2 rounded-xl border border-teal-deep/20 bg-teal-deep/[0.05] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <p className="text-sm text-ink/75">
                  The supplier also lists <strong>{name.toLowerCase()}s</strong>: {values.join(', ')}.
                  {f.variants.length > 0 && (
                    <span className="text-ink/55">
                      {' '}
                      Adding them makes {f.variants.length} × {values.length} = {f.variants.length * values.length} variants, each
                      with its own quantity.
                    </span>
                  )}
                </p>
                <div className="flex flex-none gap-2">
                  <button type="button" onClick={() => applySuggestedOption(name, values)} className={SECONDARY_BUTTON}>
                    <Plus size={14} /> Add {name.toLowerCase()}s
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setF((prev) => {
                        const rest = { ...prev.suggestedOptions }
                        delete rest[name]
                        return { ...prev, suggestedOptions: rest }
                      })
                    }
                    className={ICON_BUTTON}
                    aria-label="Dismiss"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}

          {f.optionNames.length > 0 && (
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {f.optionNames.map((name, i) => (
                <div key={i} className="rounded-xl border border-ink/10 p-3">
                  <div className="flex gap-2">
                    <input value={name} onChange={(e) => renameAxis(i, e.target.value)} placeholder="Option name" className={`${INPUT} font-semibold`} />
                    <button type="button" className={ICON_BUTTON} onClick={() => removeAxis(i)} aria-label="Remove option">
                      <X size={14} />
                    </button>
                  </div>
                  <input
                    value={axisValues[name] ?? ''}
                    onChange={(e) => setAxisValues((prev) => ({ ...prev, [name]: e.target.value }))}
                    placeholder="Values, e.g. Red, Blue, Green"
                    className={`${INPUT} mt-2`}
                  />
                </div>
              ))}
              <div className="flex items-end md:col-span-3">
                <button type="button" onClick={generateVariants} className={SECONDARY_BUTTON}>
                  <Sparkles size={14} /> Create all combinations
                </button>
              </div>
            </div>
          )}

          {f.variants.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-xl border border-ink/10">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="bg-parchment/70 text-xs text-ink/50">
                  <tr>
                    {f.optionNames.map((n, i) => (
                      <th key={i} className="px-3 py-2 font-medium">
                        {n || `Option ${i + 1}`}
                      </th>
                    ))}
                    <th className="px-3 py-2 font-medium">In stock *</th>
                    <th className="px-3 py-2 font-medium">Price (Rs)</th>
                    <th className="px-3 py-2 font-medium">Image</th>
                    <th className="px-3 py-2 font-medium">Supplier link</th>
                    <th className="px-3 py-2 font-medium">Supplier price</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {f.variants.map((v) => (
                    <tr key={v.key} className="border-t border-ink/5 align-top">
                      {f.optionNames.map((n, i) => (
                        <td key={i} className="px-2 py-2">
                          <input
                            value={v.options[n] ?? ''}
                            onChange={(e) => updateVariant(v.key, { options: { ...v.options, [n]: e.target.value } })}
                            className={`${INPUT} min-w-[90px] py-1.5`}
                          />
                        </td>
                      ))}
                      <td className="px-2 py-2">
                        <input
                          value={v.stock}
                          onChange={(e) => updateVariant(v.key, { stock: e.target.value.replace(/[^0-9]/g, '') })}
                          inputMode="numeric"
                          placeholder="0"
                          aria-label="Quantity in stock"
                          className={`${INPUT} w-20 py-1.5 font-semibold ${(toNum(v.stock) ?? 0) === 0 ? 'border-rose-300' : ''}`}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          value={v.price}
                          onChange={(e) => updateVariant(v.key, { price: e.target.value.replace(/[^0-9.]/g, '') })}
                          placeholder={priceValid ? String(priceNum) : 'same'}
                          inputMode="numeric"
                          className={`${INPUT} w-24 py-1.5`}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <Thumb src={v.imageUrl || null} alt="" size={32} />
                          <input value={v.imageUrl} onChange={(e) => updateVariant(v.key, { imageUrl: e.target.value })} placeholder="https://…" className={`${INPUT} min-w-[140px] py-1.5`} />
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1">
                          <input value={v.sourceUrl} onChange={(e) => updateVariant(v.key, { sourceUrl: e.target.value })} placeholder="https://…" className={`${INPUT} min-w-[160px] py-1.5`} />
                          {/^https?:\/\//.test(v.sourceUrl) && (
                            <a href={v.sourceUrl} target="_blank" rel="noreferrer" className={ICON_BUTTON} aria-label="Open buy link">
                              <ExternalLink size={13} />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <input
                          value={v.sourcePrice}
                          onChange={(e) => updateVariant(v.key, { sourcePrice: e.target.value.replace(/[^0-9.]/g, '') })}
                          inputMode="decimal"
                          className={`${INPUT} w-24 py-1.5`}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          className={ICON_BUTTON}
                          onClick={() => set('variants', f.variants.filter((x) => x.key !== v.key))}
                          aria-label="Remove variant"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {f.optionNames.length > 0 && (
            <button type="button" onClick={addVariantRow} className="mt-3 text-xs font-semibold text-teal-deep">
              + Add one variant
            </button>
          )}
          {f.optionNames.length === 0 && f.variants.length === 0 && (
            <p className="mt-3 text-xs text-ink/40">No variants. Click &ldquo;Add option&rdquo; to add sizes, colours or styles.</p>
          )}
        </section>
      </div>
    </Dialog>
  )
}

/** Loads a saved product then opens the editor on it. */
export function EditProductLoader({
  productId,
  categories,
  onCategoryCreated,
  onClose,
  onSaved,
}: {
  productId: string
  categories: MallCategory[]
  onCategoryCreated?: (category: MallCategory) => void
  onClose: () => void
  onSaved: (row: MallProductRow, warnings: string[]) => void
}) {
  const [form, setForm] = useState<ProductForm | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    mallApi<{ product: MallProductFull }>(`/api/admin/wishdrop-mall/products/${productId}`)
      .then(({ product }) => !cancelled && setForm(fullToForm(product)))
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [productId])

  if (form) {
    return (
      <ProductEditor
        initial={form}
        productId={productId}
        categories={categories}
        onCategoryCreated={onCategoryCreated}
        onClose={onClose}
        onSaved={onSaved}
      />
    )
  }
  return (
    <Dialog title="Edit product" onClose={onClose}>
      {error ? (
        <p className="py-6 text-center text-sm font-semibold text-rose-700">{error}</p>
      ) : (
        <div className="flex justify-center py-10 text-ink/40">
          <Loader2 className="animate-spin" size={20} />
        </div>
      )}
    </Dialog>
  )
}
