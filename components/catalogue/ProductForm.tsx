// components/catalogue/ProductForm.tsx
//
// The one product form for a custom seller's catalogue. Used by:
//   - the seller portal (app/seller/(dashboard)/products), and
//   - staff in Admin → Catalogues (add on a seller's behalf / edit).
//
// The seller's COST goes in; the selling price is never typed. It is
// worked out on the server as cost × (1 + margin%). The price shown here
// is only a preview of that sum. Staff additionally get the margin field.
'use client'

import { useState } from 'react'
import MediaUploader from '@/components/media/MediaUploader'

export type CatalogueProduct = {
  id: string
  name: string
  description: string | null
  category: string | null
  cost_price: number | null
  margin_percent: number | null
  price: number
  currency: string
  stock_count: number | null
  weight_kg: number | null
  images: string[] | null
  videos?: string[] | null
  active: boolean
}

export type ProductFormPayload = {
  name: string
  description: string | null
  category: string | null
  costPrice: number
  stockCount: string | null
  weightKg: string | null
  images: string[]
  videos: string[]
  marginPercent?: number
}

interface Props {
  initial?: CatalogueProduct | null
  /** Margin used for the price preview (and the staff field's default). */
  marginPercent: number
  /** Staff mode: shows the editable margin, and uploads go to this seller's folder. */
  staffSellerId?: string
  categorySuggestions?: string[]
  submitLabel: string
  onSubmit: (payload: ProductFormPayload) => Promise<void>
  onCancel?: () => void
}

const inputClass =
  'w-full rounded-xl border border-ink/15 bg-white px-3.5 py-3 text-base outline-none focus:border-teal sm:py-2.5 sm:text-sm'
const labelClass = 'mb-1.5 block text-xs font-semibold text-ink/60'

export default function ProductForm({
  initial,
  marginPercent,
  staffSellerId,
  categorySuggestions = [],
  submitLabel,
  onSubmit,
  onCancel,
}: Props) {
  const staff = Boolean(staffSellerId)
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [category, setCategory] = useState(initial?.category ?? '')
  const [costPrice, setCostPrice] = useState(initial?.cost_price != null ? String(initial.cost_price) : '')
  const [stockCount, setStockCount] = useState(initial?.stock_count != null ? String(initial.stock_count) : '')
  const [weightKg, setWeightKg] = useState(initial?.weight_kg != null ? String(initial.weight_kg) : '')
  const [margin, setMargin] = useState(String(initial?.margin_percent ?? marginPercent))
  const [media, setMedia] = useState({ images: initial?.images ?? [], videos: initial?.videos ?? [] })
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cost = Number(costPrice)
  const effectiveMargin = staff ? Number(margin) : initial?.margin_percent ?? marginPercent
  const previewPrice =
    Number.isFinite(cost) && cost > 0 && Number.isFinite(effectiveMargin) && effectiveMargin >= 0
      ? Math.round(cost * (1 + effectiveMargin / 100) * 100) / 100
      : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError('Product name is required.')
    if (!Number.isFinite(cost) || cost <= 0) return setError('Enter a valid cost price.')
    if (staff && (!Number.isFinite(Number(margin)) || Number(margin) < 0)) return setError('Enter a valid margin percentage.')
    if (uploading) return setError('Please wait for the uploads to finish.')
    if (media.images.length === 0 && media.videos.length === 0) return setError('Add at least one photo or video.')

    setSaving(true)
    setError(null)
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || null,
        category: category.trim() || null,
        costPrice: cost,
        stockCount: stockCount.trim() || null,
        weightKg: weightKg.trim() || null,
        images: media.images,
        videos: media.videos,
        ...(staff ? { marginPercent: Number(margin) } : {}),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div>
        <span className={labelClass}>Photos and videos</span>
        <MediaUploader
          images={media.images}
          videos={media.videos}
          onChange={setMedia}
          sellerId={staffSellerId}
          onBusyChange={setUploading}
          disabled={saving}
        />
      </div>

      <label className="block">
        <span className={labelClass}>Product name</span>
        <input required value={name} maxLength={200} onChange={(e) => setName(e.target.value)} placeholder="e.g. Handloom cotton saree, blue" className={inputClass} />
      </label>

      <label className="block">
        <span className={labelClass}>Description (optional)</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          maxLength={5000}
          placeholder="Material, size, colours, what's included. You can paste your Instagram caption."
          className={inputClass}
        />
      </label>

      <label className="block">
        <span className={labelClass}>Category (optional)</span>
        <input
          value={category}
          maxLength={80}
          onChange={(e) => setCategory(e.target.value)}
          list="catalogue-category-suggestions"
          placeholder="e.g. Sarees, Jewellery, Home decor"
          className={inputClass}
        />
        <datalist id="catalogue-category-suggestions">
          {categorySuggestions.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={labelClass}>{staff ? "Seller's price (INR)" : 'Your price (INR)'}</span>
          <input required type="number" inputMode="decimal" min="0" step="0.01" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} placeholder="0.00" className={inputClass} />
        </label>
        <label className="block">
          <span className={labelClass}>Stock (optional)</span>
          <input type="number" inputMode="numeric" min="0" step="1" value={stockCount} onChange={(e) => setStockCount(e.target.value)} placeholder="How many you have" className={inputClass} />
        </label>
        <label className="block">
          <span className={labelClass}>Weight in kg (optional)</span>
          <input type="number" inputMode="decimal" min="0" step="0.01" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} placeholder="e.g. 0.4" className={inputClass} />
        </label>
        {staff && (
          <label className="block">
            <span className={labelClass}>Wishdrop margin %</span>
            <input type="number" inputMode="decimal" min="0" step="0.5" value={margin} onChange={(e) => setMargin(e.target.value)} className={inputClass} />
          </label>
        )}
      </div>

      <div className="rounded-xl border border-ink/10 bg-parchment/60 px-4 py-3 text-sm text-ink/70">
        {previewPrice != null ? (
          <>
            Listed on Wishdrop at <span className="font-semibold text-ink">INR {previewPrice.toFixed(2)}</span>{' '}
            <span className="text-ink/50">
              ({staff ? "seller's" : 'your'} price + {effectiveMargin}% Wishdrop margin). Shoppers see it in rupees (LKR) with shipping to Sri Lanka included.
            </span>
          </>
        ) : (
          <span className="text-ink/50">Enter {staff ? "the seller's" : 'your'} price to see the Wishdrop listing price.</span>
        )}
        {!weightKg.trim() && <span className="mt-1 block text-xs text-ink/45">No weight entered: shipping is worked out as 0.5 kg.</span>}
      </div>

      {error && <p className="text-sm font-medium text-red-600">{error}</p>}

      <div className="sticky bottom-0 -mx-1 flex gap-3 bg-card/95 px-1 py-2 backdrop-blur sm:static sm:justify-end sm:bg-transparent sm:p-0">
        {onCancel && (
          <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-ink/15 px-4 py-3 text-sm font-semibold text-ink/70 sm:flex-none sm:py-2.5">
            Cancel
          </button>
        )}
        <button type="submit" disabled={saving || uploading} className="flex-1 rounded-xl bg-teal px-5 py-3 text-sm font-bold text-white hover:bg-teal-deep disabled:opacity-60 sm:flex-none sm:py-2.5">
          {saving ? 'Saving…' : uploading ? 'Uploading…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
