// app/admin/(protected)/(sales)/catalogues/[catalogueId]/page.tsx
//
// One product from a custom seller's catalogue. Staff can edit everything
// the seller can (photos, videos, name, price, stock…) plus Wishdrop's
// margin, hide/show it, and (Manager / Super Admin) delete it for good.
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, ExternalLink, EyeOff, Loader2, Trash2 } from 'lucide-react'
import { panelClass } from '@/components/admin/seller/shared'
import ProductForm, { type CatalogueProduct, type ProductFormPayload } from '@/components/catalogue/ProductForm'
import { useCurrentStaff } from '@/hooks/useCurrentStaff'
import { getDualDeliveryPricing } from '@/lib/pricing'

type Product = CatalogueProduct & {
  handle: string
  seller_id: string
  sellers: { id: string; name: string; platform_slug: string; default_margin_percent: number | null } | null
}

export default function CatalogueDetailPage() {
  const params = useParams<{ catalogueId: string }>()
  const router = useRouter()
  const { staff } = useCurrentStaff()
  const canDelete = staff?.role === 'manager' || staff?.role === 'super_admin'

  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/admin/catalogues/${params.catalogueId}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        setProduct(res.ok ? (body.product as Product | null) : null)
      })
      .catch(() => setProduct(null))
      .finally(() => setLoading(false))
  }, [params.catalogueId])

  async function patch(payload: Record<string, unknown>) {
    if (!product) return
    const res = await fetch(`/api/admin/catalogues/${product.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error ?? 'Failed to save')
    setProduct(body.product as Product)
  }

  async function handleSave(payload: ProductFormPayload) {
    await patch(payload)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2500)
  }

  async function handleToggleActive() {
    if (!product) return
    setActionError(null)
    try {
      await patch({ active: !product.active })
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  async function handleDelete() {
    if (!product) return
    if (!window.confirm(`Delete "${product.name}" for good? This can't be undone. To take it off the store but keep it, hide it instead.`)) return
    const res = await fetch(`/api/admin/catalogues/${product.id}?permanent=1`, { method: 'DELETE' })
    if (res.ok) return router.push('/admin/catalogues')
    const body = await res.json().catch(() => ({}))
    setActionError(body.error ?? 'Could not delete the product')
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center gap-2 overflow-y-auto py-20 text-ink/50">
        <Loader2 size={20} className="animate-spin" />
        <p className="text-sm">Loading product…</p>
      </div>
    )
  }

  if (!product) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-2xl px-6 py-16 text-center">
          <p className="text-sm text-ink/55">Product not found. It may have been removed.</p>
          <button onClick={() => router.push('/admin/catalogues')} className="mt-3 text-sm font-semibold text-teal-deep">
            Back to Social Stores
          </button>
        </div>
      </div>
    )
  }

  const slug = product.sellers?.platform_slug
  // What a shopper is actually charged in LKR for one unit, through the
  // same import formula the storefront uses.
  const shopper = getDualDeliveryPricing({
    price: Number(product.price),
    currency: product.currency,
    weightKg: product.weight_kg,
    storeSlug: slug,
  }).express

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <button
          onClick={() => router.push('/admin/catalogues')}
          className="flex items-center gap-1.5 text-sm font-semibold text-ink/55 hover:text-ink"
        >
          <ArrowLeft size={15} /> Social Stores
        </button>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-3xl text-ink">{product.name}</h1>
            <p className="mt-1 text-sm text-ink/55">
              From {product.sellers?.name ?? 'Unknown seller'}. The seller can edit this too, from their portal; only
              staff can change the margin.
            </p>
          </div>
          <div className="flex flex-none items-center gap-2">
            {slug && product.active && (
              <a
                href={`/stores/${slug}/product/${product.handle}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-full border border-ink/15 px-3 py-1.5 text-xs font-semibold text-ink/65 hover:text-ink"
              >
                <ExternalLink size={13} /> View on store
              </a>
            )}
            <button
              onClick={handleToggleActive}
              title={product.active ? 'Click to hide from the store' : 'Click to show on the store'}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                product.active ? 'bg-teal/10 text-teal-deep' : 'bg-ink/5 text-ink/40'
              }`}
            >
              {product.active ? 'Active' : 'Hidden'}
            </button>
          </div>
        </div>

        <div className={`mt-6 grid grid-cols-2 gap-4 p-6 sm:grid-cols-4 ${panelClass}`}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">Seller&rsquo;s price</p>
            <p className="mt-1 text-sm text-ink">
              {product.currency} {product.cost_price != null ? Number(product.cost_price).toFixed(2) : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">Margin</p>
            <p className="mt-1 text-sm text-ink">{product.margin_percent ?? '—'}%</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">Listed at</p>
            <p className="mt-1 text-sm font-semibold text-ink">
              {product.currency} {Number(product.price).toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">Shopper pays</p>
            <p className="mt-1 text-sm font-semibold text-ink">{shopper.formattedActualTotal}</p>
            <p className="text-[11px] text-ink/45">per unit, delivered</p>
          </div>
        </div>

        <div className="mt-4">
          <ProductForm
            key={product.id}
            initial={product}
            marginPercent={Number(product.margin_percent ?? product.sellers?.default_margin_percent ?? 25)}
            staffSellerId={product.seller_id}
            collectionsUrl={product.sellers?.platform_slug ? `/api/admin/catalogues/stores/${product.sellers.platform_slug}/collections` : undefined}
            submitLabel="Save changes"
            onSubmit={handleSave}
          />
          {saved && <p className="mt-3 text-right text-sm font-semibold text-teal-deep">Saved.</p>}
        </div>

        {actionError && <p className="mt-3 text-sm font-semibold text-red-700">{actionError}</p>}

        <div className="mt-4 flex flex-wrap gap-5">
          {product.active && (
            <button onClick={handleToggleActive} className="flex items-center gap-1.5 text-sm font-semibold text-ink/60 hover:text-ink">
              <EyeOff size={14} /> Hide from the store
            </button>
          )}
          {canDelete && (
            <button onClick={handleDelete} className="flex items-center gap-1.5 text-sm font-semibold text-red-700 hover:underline">
              <Trash2 size={14} /> Delete for good
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
