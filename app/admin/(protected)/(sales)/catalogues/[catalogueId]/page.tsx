// app/admin/(protected)/(sales)/catalogues/[catalogueId]/page.tsx
//
// One product from a social store. Staff can edit everything the seller
// can (photos, videos, name, price, stock…) plus Wishdrop's margin,
// hide/show it, and (Manager / Super Admin) delete it for good.
//
// Same layout kit as the rest of Social Stores
// (components/admin/catalogue/ui.tsx).
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ExternalLink, Eye, EyeOff, Package, Trash2 } from 'lucide-react'
import ProductForm, { type CatalogueProduct, type ProductFormPayload } from '@/components/catalogue/ProductForm'
import { useCurrentStaff } from '@/hooks/useCurrentStaff'
import { getDualDeliveryPricing } from '@/lib/pricing'
import { socialStoreCurrency, storeOriginOf } from '@/lib/store-origin'
import {
  BackLink,
  btnSecondary,
  card,
  FullPageLoading,
  Notice,
  OriginTag,
  PageHeader,
  PageShell,
  StateShell,
  StatStrip,
  StatusPill,
  StoreAvatar,
} from '@/components/admin/catalogue/ui'

type Product = CatalogueProduct & {
  handle: string
  seller_id: string
  sellers: ({ id: string; name: string; platform_slug: string; default_margin_percent: number | null; logo_url?: string | null } & Record<string, unknown>) | null
}

function money(currency: string, value: number | null | undefined): string {
  if (value == null) return '—'
  return `${currency} ${Number(value).toLocaleString('en-LK', { maximumFractionDigits: 2 })}`
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

  if (loading) return <FullPageLoading label="Loading product…" />

  if (!product) {
    return (
      <PageShell narrow>
        <div className={`mt-10 ${card}`}>
          <StateShell
            icon={<Package size={22} className="text-ink/25" />}
            title="Product not found"
            body="It may have been removed."
            action={
              <Link href="/admin/catalogues" className={btnSecondary}>
                Back to Social Stores
              </Link>
            }
          />
        </div>
      </PageShell>
    )
  }

  const seller = product.sellers
  const slug = seller?.platform_slug
  const origin = seller ? storeOriginOf(seller) : 'IN'
  // The store decides the currency (LKR for a local store) — see socialStoreCurrency.
  const currency = seller ? socialStoreCurrency(origin) : product.currency
  // What a shopper is actually charged in LKR for one unit, through the
  // same rules the storefront uses (import formula, or local pricing).
  // Social store prices already include the margin.
  const shopper = getDualDeliveryPricing({
    price: Number(product.price),
    currency,
    weightKg: product.weight_kg,
    storeSlug: slug,
    origin,
    marginIncluded: true,
  }).express

  return (
    <PageShell>
      <BackLink href={slug ? `/admin/catalogues?store=${product.seller_id}` : '/admin/catalogues'} label={seller?.name ? `${seller.name} products` : 'Social Stores'} />

      <PageHeader
        leading={<StoreAvatar name={seller?.name ?? product.name} logoUrl={seller?.logo_url ?? null} size={56} />}
        title={product.name}
        badges={
          <>
            <StatusPill tone={product.active ? 'live' : 'hidden'}>{product.active ? 'Active' : 'Hidden'}</StatusPill>
            <OriginTag origin={origin} />
          </>
        }
        meta={
          <>
            From{' '}
            {slug ? (
              <Link href={`/admin/catalogues/stores/${slug}`} className="font-semibold text-ink/75 hover:text-teal-deep">
                {seller?.name}
              </Link>
            ) : (
              'an unknown seller'
            )}
            . The seller can edit this from their portal too; only staff can change the margin.
          </>
        }
        actions={
          <>
            {slug && product.active && (
              <a href={`/stores/${slug}/product/${product.handle}`} target="_blank" rel="noreferrer" className={btnSecondary}>
                <ExternalLink size={14} aria-hidden /> View on store
              </a>
            )}
            <button type="button" onClick={handleToggleActive} className={btnSecondary}>
              {product.active ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />} {product.active ? 'Hide' : 'Show on store'}
            </button>
          </>
        }
      />

      <div className="mt-6">
        <StatStrip
          stats={[
            { label: 'Seller’s price', value: money(currency, product.cost_price) },
            { label: 'Margin', value: `${product.margin_percent ?? '—'}%` },
            { label: 'Listed at', value: money(currency, Number(product.price)) },
            { label: 'Shopper pays (1 unit, delivered)', value: shopper.formattedActualTotal },
          ]}
        />
      </div>

      {actionError && (
        <div className="mt-4">
          <Notice tone="red">{actionError}</Notice>
        </div>
      )}

      <div className="mt-6">
        <ProductForm
          key={product.id}
          initial={product}
          marginPercent={Number(product.margin_percent ?? seller?.default_margin_percent ?? 25)}
          staffSellerId={product.seller_id}
          collectionsUrl={slug ? `/api/admin/catalogues/stores/${slug}/collections` : undefined}
          submitLabel="Save changes"
          onSubmit={handleSave}
          local={origin === 'LK'}
        />
        {saved && <p className="mt-3 text-right text-sm font-semibold text-teal-deep">Saved.</p>}
      </div>

      {canDelete && (
        <section className={`mt-8 flex flex-wrap items-center justify-between gap-4 border-red-200 p-5 ${card}`}>
          <div>
            <h2 className="font-display text-base font-semibold text-ink">Delete this product</h2>
            <p className="mt-0.5 text-xs text-ink/55">Removes it for good. To take it off the store but keep it, hide it instead.</p>
          </div>
          <button
            type="button"
            onClick={handleDelete}
            className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100"
          >
            <Trash2 size={14} aria-hidden /> Delete for good
          </button>
        </section>
      )}
    </PageShell>
  )
}
