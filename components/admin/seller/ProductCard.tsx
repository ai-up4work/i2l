// components/admin/sellers/ProductCard.tsx
'use client'

import { useState } from 'react'
import { ExternalLink, ImageOff, PackageCheck, PackageX, PackageSearch } from 'lucide-react'

// ---------------------------------------------------------------------------
// Shape of a product as pulled back by the extractor (Shopify / WooCommerce /
// JSON API). This intentionally mirrors the field-mapping vocabulary already
// used in the seller form (idField, nameField, priceField, imageField,
// categoryField, sizesField, colorField) so the same names carry through
// end-to-end. If the real API response uses different keys, normalize into
// this shape at the call site rather than changing this component.
// ---------------------------------------------------------------------------
export interface SampleProduct {
  id: string
  name: string
  price: number
  currency?: string
  compareAtPrice?: number
  image?: string
  url?: string
  category?: string
  sizes?: string[]
  colors?: string[]
  inStock?: boolean
  stockCount?: number
  description?: string
}

function formatMoney(amount: number, currency?: string) {
  try {
    return new Intl.NumberFormat('en-LK', {
      style: currency ? 'currency' : 'decimal',
      currency: currency || undefined,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    // Unknown/invalid currency code from a feed we don't fully trust yet —
    // fall back to a plain number with the raw code alongside it.
    return `${currency ? currency + ' ' : ''}${amount.toFixed(2)}`
  }
}

const COLOR_SWATCH: Record<string, string> = {
  black: '#111111',
  white: '#f5f5f0',
  red: '#c0392b',
  blue: '#2b5fc0',
  navy: '#1c2b4a',
  green: '#2e7d4f',
  yellow: '#e8c547',
  gold: '#c9a24b',
  pink: '#e08fa0',
  purple: '#7a5ea8',
  grey: '#8a8a8a',
  gray: '#8a8a8a',
  brown: '#7a5a3c',
  orange: '#d97b3f',
  beige: '#d8c9ac',
  maroon: '#6e2436',
  teal: '#0e8c9c',
}

function swatchFor(name: string) {
  return COLOR_SWATCH[name.trim().toLowerCase()] ?? undefined
}

// ---------------------------------------------------------------------------
// A single product, fully populated. Used both in the "sample products"
// grid a simulation run pulls back, and as the result of a single-product
// manual test (in which case `highlight` puts a stronger border on it since
// it's the one thing the admin asked to check).
// ---------------------------------------------------------------------------
export function ProductCard({ product, highlight = false }: { product: SampleProduct; highlight?: boolean }) {
  const [imgFailed, setImgFailed] = useState(false)
  const hasDiscount = typeof product.compareAtPrice === 'number' && product.compareAtPrice > product.price
  const stockKnown = typeof product.inStock === 'boolean'

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-2xl border bg-card shadow-[0_1px_2px_rgba(32,36,43,0.04)] transition-shadow ${
        highlight ? 'border-teal-deep/35 shadow-[0_16px_40px_-24px_rgba(14,140,156,0.45)]' : 'border-ink/10'
      }`}
    >
      <div className="relative aspect-[4/3] w-full bg-parchment">
        {product.image && !imgFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image}
            alt={product.name}
            onError={() => setImgFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-ink/25">
            <ImageOff size={22} strokeWidth={1.5} />
            <span className="text-[11px] font-semibold">No image returned</span>
          </div>
        )}

        {product.category && (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-ink/80 px-2 py-0.5 text-[11px] font-semibold text-parchment backdrop-blur-sm">
            {product.category}
          </span>
        )}

        {stockKnown && (
          <span
            className={`absolute right-2.5 top-2.5 flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold backdrop-blur-sm ${
              product.inStock ? 'bg-teal-deep/90 text-parchment' : 'bg-red-600/90 text-white'
            }`}
          >
            {product.inStock ? <PackageCheck size={11} /> : <PackageX size={11} />}
            {product.inStock ? (product.stockCount ? `${product.stockCount} in stock` : 'In stock') : 'Out of stock'}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div>
          <p className="font-display text-base leading-snug text-ink line-clamp-2">{product.name}</p>
          <p className="mt-0.5 font-mono text-[11px] text-ink/35">{product.id}</p>
        </div>

        <div className="flex items-baseline gap-2">
          <span className="text-lg font-semibold text-ink">{formatMoney(product.price, product.currency)}</span>
          {hasDiscount && (
            <span className="text-xs text-ink/35 line-through">
              {formatMoney(product.compareAtPrice as number, product.currency)}
            </span>
          )}
        </div>

        {product.description && (
          <p className="text-xs leading-relaxed text-ink/50 line-clamp-2">{product.description}</p>
        )}

        {(product.colors?.length || product.sizes?.length) ? (
          <div className="flex flex-col gap-1.5 border-t border-ink/10 pt-2.5">
            {!!product.colors?.length && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-ink/40">Colors</span>
                <div className="flex items-center gap-1">
                  {product.colors.map((c) => {
                    const swatch = swatchFor(c)
                    return swatch ? (
                      <span
                        key={c}
                        title={c}
                        className="h-3.5 w-3.5 rounded-full border border-ink/15"
                        style={{ backgroundColor: swatch }}
                      />
                    ) : (
                      <span key={c} className="rounded-full border border-ink/15 px-1.5 py-0.5 text-[10px] text-ink/55">
                        {c}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}
            {!!product.sizes?.length && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold text-ink/40">Sizes</span>
                {product.sizes.map((s) => (
                  <span key={s} className="rounded-md border border-ink/15 px-1.5 py-0.5 text-[10px] font-semibold text-ink/55">
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {product.url && (
          <a
            href={product.url}
            target="_blank"
            rel="noreferrer"
            className="mt-auto flex items-center gap-1 pt-1 text-xs font-semibold text-teal-deep hover:underline"
          >
            View on store
            <ExternalLink size={11} />
          </a>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Grid of sample products pulled back from a simulation run. Falls back to a
// friendly empty state rather than an empty grid if the feed returned zero
// usable products (e.g. every item failed field mapping).
// ---------------------------------------------------------------------------
export function ProductCardGrid({ products }: { products: SampleProduct[] }) {
  if (!products.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-2.5 rounded-2xl border border-dashed border-ink/15 p-8 text-center">
        <PackageSearch size={22} className="text-ink/20" strokeWidth={1.5} />
        <p className="max-w-xs text-xs leading-relaxed text-ink/45">
          The feed responded, but no products came back mapped correctly. Double-check the field
          mapping above against a real response.
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  )
}