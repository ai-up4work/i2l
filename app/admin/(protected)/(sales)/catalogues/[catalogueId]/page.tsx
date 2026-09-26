// app/admin/(sales)/catalogues/[catalogueId]/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { panelClass } from '@/components/admin/seller/shared'

type Product = {
  id: string
  name: string
  description: string | null
  category: string | null
  cost_price: number | null
  margin_percent: number | null
  price: number
  currency: string
  stock_count: number | null
  active: boolean
  images: string[]
  sellers: { name: string; platform_slug: string } | null
}

export default function CatalogueDetailPage() {
  const params = useParams<{ catalogueId: string }>()
  const router = useRouter()

  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [marginInput, setMarginInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('products')
      .select('*, sellers(name, platform_slug)')
      .eq('id', params.catalogueId)
      .maybeSingle()
      .then(({ data }) => {
        setProduct(data as unknown as Product)
        setMarginInput(data ? String((data as any).margin_percent ?? 25) : '')
        setLoading(false)
      })
  }, [params.catalogueId])

  async function handleSaveMargin() {
    if (!product) return
    const margin = Number(marginInput)
    if (!Number.isFinite(margin) || margin < 0) return setSaveError('Enter a valid margin percentage.')
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/admin/catalogues/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marginPercent: margin }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Failed to save')
      setProduct(body.product)
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive() {
    if (!product) return
    const res = await fetch(`/api/admin/catalogues/${product.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !product.active }),
    })
    const body = await res.json()
    if (res.ok) setProduct(body.product)
  }

  async function handleDelete() {
    if (!product) return
    if (!window.confirm(`Hide "${product.name}" from active listings? You can re-activate it later from this page.`)) return
    const res = await fetch(`/api/admin/catalogues/${product.id}`, { method: 'DELETE' })
    if (res.ok) router.push('/admin/catalogues')
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-2 py-20 text-ink/50">
        <Loader2 size={20} className="animate-spin" />
        <p className="text-sm">Loading product…</p>
      </div>
    )
  }

  if (!product) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <p className="text-sm text-ink/55">Product not found. It may have been removed.</p>
        <button onClick={() => router.push('/admin/catalogues')} className="mt-3 text-sm font-semibold text-teal-deep">
          Back to Catalogues
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <button
        onClick={() => router.push('/admin/catalogues')}
        className="flex items-center gap-1.5 text-sm font-semibold text-ink/55 hover:text-ink"
      >
        <ArrowLeft size={15} /> Catalogues
      </button>

      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-ink">{product.name}</h1>
          <p className="mt-1 text-sm text-ink/55">
            Added by {product.sellers?.name ?? 'Unknown seller'} — this seller edits name, description,
            cost price, and stock from their own portal. Admin's only control here is the margin.
          </p>
        </div>
        <button
          onClick={handleToggleActive}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
            product.active ? 'bg-teal/10 text-teal-deep' : 'bg-ink/5 text-ink/40'
          }`}
        >
          {product.active ? 'Active' : 'Hidden'}
        </button>
      </div>

      <div className={`mt-6 grid grid-cols-2 gap-4 p-6 ${panelClass}`}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">Category</p>
          <p className="mt-1 text-sm text-ink">{product.category ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">Stock</p>
          <p className="mt-1 text-sm text-ink">{product.stock_count ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">Cost price (seller-entered)</p>
          <p className="mt-1 text-sm text-ink">
            {product.currency} {product.cost_price?.toFixed(2) ?? '—'}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">Selling price (computed)</p>
          <p className="mt-1 text-sm font-semibold text-ink">
            {product.currency} {product.price.toFixed(2)}
          </p>
        </div>
        {product.description && (
          <div className="col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">Description</p>
            <p className="mt-1 text-sm text-ink/70">{product.description}</p>
          </div>
        )}
      </div>

      <div className={`mt-4 p-6 ${panelClass}`}>
        <h3 className="font-semibold text-ink">Wishdrop margin</h3>
        <p className="mt-1 text-sm text-ink/55">
          Applied on top of the seller's cost price to compute the selling price shown above.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <input
            type="number"
            min="0"
            step="0.5"
            value={marginInput}
            onChange={(e) => setMarginInput(e.target.value)}
            className="w-28 rounded-xl border border-ink/15 px-3.5 py-2.5 text-sm outline-none focus:border-teal"
          />
          <span className="text-sm text-ink/55">%</span>
          <button
            onClick={handleSaveMargin}
            disabled={saving}
            className="rounded-xl bg-teal-deep px-4 py-2.5 text-sm font-semibold text-parchment hover:bg-teal disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save margin'}
          </button>
          {saved && <span className="text-sm font-semibold text-teal-deep">Saved.</span>}
        </div>
        {saveError && <p className="mt-2 text-sm font-semibold text-red-700">{saveError}</p>}
      </div>

      <button
        onClick={handleDelete}
        className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-red-700 hover:underline"
      >
        <Trash2 size={14} /> Hide from listings
      </button>
    </div>
  )
}