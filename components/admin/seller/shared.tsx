// components/admin/shared.tsx
'use client'

import { useState } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  ExternalLink,
  Loader2,
  MinusCircle,
  XCircle,
} from 'lucide-react'
import Image from 'next/image'

import { EXTRACTOR_TYPE_LABEL } from '@/data/sellers/data'
import type {
  StoreProviderType,
  JsonApiProviderConfig,
  HtmlScrapeProviderConfig,
} from '@/lib/store-config'
import type { StoreProduct } from '@/lib/store.types'

// ---------------------------------------------------------------------------
// Shared between /admin/sellers/[sellerId] and /admin/sellers/new.
//
// Chrome system: two levels, not one glass card repeated everywhere.
//   panelClass  — a whole section (Profile, Method, Simulation). Solid
//                 card surface, hairline border, one soft shadow. This is
//                 the thing your eye lands on first.
//   groupClass  — something nested inside a panel (a field cluster, the
//                 "target" box, a status banner). Flat parchment tint,
//                 hairline border, no shadow — visibly one step quieter
//                 than the panel that contains it.
// No backdrop-blur anywhere: the page background is flat, so blur was
// only ever adding softness without a reason. Depth now comes from the
// panel/group distinction instead.
// ---------------------------------------------------------------------------

export const panelClass =
  'rounded-2xl border border-ink/10 bg-card shadow-[0_1px_2px_rgba(32,36,43,0.04),0_20px_50px_-32px_rgba(32,36,43,0.35)]'

export const groupClass = 'rounded-xl border border-ink/10 bg-parchment/60'

export const inputClass =
  'w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-teal/60 focus:ring-2 focus:ring-teal/10'

export const monoInputClass = `${inputClass} font-mono`

export function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// Extraction method
//
// Logo paths mirror the sellers LIST page's `storeIcon` map exactly, so a
// seller's feed-type badge looks identical whether you're scanning the
// table or sitting inside the wizard/edit form for that one row.
// ---------------------------------------------------------------------------

export const PROVIDER_LOGO: Record<StoreProviderType, string> = {
  mock: '/manual.png',
  shopify: '/shopify.png',
  woocommerce: '/woo.png',
  jsonapi: '/json.png',
  'html-scrape': '/custom.png',
}

export const EXTRACTOR_OPTIONS: {
  value: StoreProviderType
  blurb: string
}[] = [
  {
    value: 'mock',
    blurb: 'No automated extraction. Catalogue entries are added by hand.',
  },
  {
    value: 'shopify',
    blurb: 'Uses the store\u2019s standard Shopify product JSON \u2014 no field mapping needed.',
  },
  {
    value: 'woocommerce',
    blurb: 'Uses the WooCommerce REST API or store/v1 endpoint \u2014 no field mapping needed.',
  },
  {
    value: 'jsonapi',
    blurb:
      'Site has its own JSON backend (found via the Network tab). Map each StoreProduct field to the backend\u2019s raw field name.',
  },
  {
    value: 'html-scrape',
    blurb:
      'No JSON backend at all \u2014 scrape rendered HTML with CSS selectors. More fragile: markup changes silently break it.',
  },
]

export type JsonFieldsState = Pick<
  JsonApiProviderConfig,
  | 'listEndpoint'
  | 'idField'
  | 'nameField'
  | 'priceField'
  | 'imageField'
  | 'categoryField'
  | 'sizesField'
  | 'colorField'
>

export type HtmlSelectorsState = HtmlScrapeProviderConfig['selectors']

export const DEFAULT_JSON_FIELDS: JsonFieldsState = {
  listEndpoint: '/products/',
  idField: 'id',
  nameField: 'name',
  priceField: 'price',
  imageField: 'image',
  categoryField: '',
  sizesField: '',
  colorField: '',
}

export const DEFAULT_HTML_SELECTORS: HtmlSelectorsState = {
  productCard: '',
  title: '',
  price: '',
  image: '',
  link: '',
  variants: '',
}

/**
 * Compact extractor picker: a row of logo chips instead of five stacked,
 * always-expanded description cards. Only the active chip's blurb is
 * shown, underneath the row \u2014 the explanatory copy an admin needs is
 * still there, it just doesn't cost five cards of vertical space before
 * they've even picked one.
 *
 * Icons here are the same PNG logos the sellers list table uses (see
 * `storeIcon` in the list page) rather than generic lucide glyphs, so
 * "Shopify" always means the Shopify wordmark, everywhere in admin.
 */
export function ProviderPicker({
  value,
  onChange,
}: {
  value: StoreProviderType
  onChange: (value: StoreProviderType) => void
}) {
  const active = EXTRACTOR_OPTIONS.find((o) => o.value === value) ?? EXTRACTOR_OPTIONS[0]

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
        {EXTRACTOR_OPTIONS.map((opt) => {
          const isActive = opt.value === value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              aria-pressed={isActive}
              className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all ${
                isActive
                  ? 'border-teal-deep bg-teal-deep text-white shadow-[0_8px_20px_-10px_rgba(11,114,128,0.6)]'
                  : 'border-ink/12 bg-white text-ink/55 hover:border-ink/25 hover:text-ink'
              }`}
            >
              {/* White tile stays constant behind the logo whether the
                  chip is active or not, so full-colour marks (WooCommerce's
                  purple, JSON's red) never get flattened/inverted into an
                  unreadable blob against the teal fill. */}
              <span className="grid h-14 w-14 flex-none place-items-center rounded-lg bg-white p-1.5 shadow-[0_1px_2px_rgba(32,36,43,0.08)]">
                <Image
                  src={PROVIDER_LOGO[opt.value]}
                  alt=""
                  width={40}
                  height={40}
                  className="h-full w-full object-contain"
                />
              </span>
              <span className="text-xs font-semibold leading-tight">{EXTRACTOR_TYPE_LABEL[opt.value]}</span>
            </button>
          )
        })}
      </div>
      <p className={`px-3 py-2 text-xs leading-relaxed text-ink/55 ${groupClass}`}>{active.blurb}</p>
    </div>
  )
}


// ---------------------------------------------------------------------------
// Section chrome & form fields
// ---------------------------------------------------------------------------

export function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="font-display text-xl text-ink">{title}</h2>
      <p className="mt-0.5 text-sm text-ink/45">{subtitle}</p>
    </div>
  )
}

export function Field({
  label,
  required,
  className,
  children,
}: {
  label: string
  required?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="text-xs font-semibold text-ink/50">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  )
}

export function SelectorField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder: string
}) {
  return (
    <label className="block">
      <span className="text-xs text-ink/50">{label}</span>
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`mt-1 ${monoInputClass}`}
      />
    </label>
  )
}

// ---------------------------------------------------------------------------
// Simulation: types, checklist, and result rendering
// ---------------------------------------------------------------------------

export interface TestExtractorMeta {
  totalProducts: number
  totalIsExact: boolean
  totalPages: number
}

export interface TestExtractorCategory {
  handle: string
  title: string
}

export interface TestExtractorResult {
  ok: boolean
  error?: string
  meta?: TestExtractorMeta
  categories?: TestExtractorCategory[]
  categoriesNote?: string
  sampleProducts?: StoreProduct[]
  currencyDetected?: boolean
}

/** Result of testing one specific product by URL/handle, rather than a
 * random sample from the feed \u2014 for spot-checking a complex product
 * (unusual variants, a tricky image, a weird price) that might not
 * happen to land in the page-1 sample above. */
export interface TestExtractorProductResult {
  ok: boolean
  error?: string
  product?: StoreProduct
}

export type CheckStatus = 'pending' | 'running' | 'pass' | 'fail' | 'skip'

export interface CheckOutcome {
  status: CheckStatus
  detail?: string
}

export interface CheckContext {
  result: TestExtractorResult
  providerType: StoreProviderType
  jsonFields: JsonFieldsState
  elapsedMs: number
}

export interface CheckDef {
  id: string
  title: string
  evaluate: (ctx: CheckContext) => { status: 'pass' | 'fail' | 'skip'; detail: string }
}

export const CHECKS: CheckDef[] = [
  {
    id: 'reachable',
    title: 'Feed is reachable',
    evaluate: ({ result }) =>
      result.ok
        ? { status: 'pass', detail: 'Responded with valid product data.' }
        : { status: 'fail', detail: result.error ?? 'The request failed.' },
  },
  {
    id: 'pagination',
    title: 'Pagination is complete',
    evaluate: ({ result }) => {
      if (!result.meta) return { status: 'skip', detail: 'No pagination meta was returned.' }
      const { totalProducts, totalPages, totalIsExact } = result.meta
      return {
        status: 'pass',
        detail: totalIsExact
          ? `${totalProducts} products confirmed across ${totalPages} pages.`
          : `${totalProducts}+ products across ${totalPages}+ pages \u2014 lower bound, could not confirm the exact total.`,
      }
    },
  },
  {
    id: 'fieldMapping',
    title: 'Field mapping & currency resolve',
    evaluate: ({ result }) => {
      const products = result.sampleProducts ?? []
      if (products.length === 0) return { status: 'fail', detail: 'No sample products came back to verify against.' }
      const broken = products.filter((p) => !p.name || !p.price || p.price <= 0 || !p.currency)
      return broken.length === 0
        ? { status: 'pass', detail: `Name, price, and currency all resolved on ${products.length} sample product(s).` }
        : {
            status: 'fail',
            detail: `${broken.length} of ${products.length} sample product(s) are missing a name, price, or currency.`,
          }
    },
  },
  {
    id: 'variants',
    title: 'Variants & options price correctly',
    evaluate: ({ result, providerType, jsonFields }) => {
      if (providerType === 'jsonapi' && !jsonFields.sizesField && !jsonFields.colorField) {
        return { status: 'skip', detail: 'No size or color field mapped \u2014 nothing to check.' }
      }
      const products = result.sampleProducts ?? []
      if (products.length === 0) return { status: 'skip', detail: 'No sample products to check.' }
      const withVariants = products.filter((p) => p.variants && p.variants.length > 0)
      if (withVariants.length === 0) {
        return {
          status: 'skip',
          detail:
            'None of the sampled products have variant data \u2014 this may just mean the catalog (or at least this sample) is single-SKU items with no size/color options. Use "Test a specific product" below on one you know has options to confirm.',
        }
      }
      const brokenVariant = withVariants.some((p) => p.variants!.some((v) => !v.price || v.price <= 0))
      return brokenVariant
        ? { status: 'fail', detail: 'Some variants are missing a price.' }
        : {
            status: 'pass',
            detail: `Checked ${withVariants.length} product(s) with variants \u2014 pricing present on every option.`,
          }
    },
  },
  {
    id: 'stock',
    title: 'Stock status is accurate',
    evaluate: ({ result }) => {
      const products = result.sampleProducts ?? []
      if (products.length === 0) return { status: 'skip', detail: 'No sample products to check.' }
      const missing = products.filter((p) => typeof p.inStock !== 'boolean')
      return missing.length === 0
        ? {
            status: 'pass',
            detail: 'Stock flag present on every sampled product \u2014 still worth a manual spot-check against the live site.',
          }
        : { status: 'fail', detail: `${missing.length} sample product(s) are missing a stock/availability flag.` }
    },
  },
  {
    id: 'images',
    title: 'Images resolve',
    evaluate: ({ result }) => {
      const products = result.sampleProducts ?? []
      if (products.length === 0) return { status: 'skip', detail: 'No sample products to check.' }
      const missing = products.filter((p) => !p.image)
      return missing.length === 0
        ? { status: 'pass', detail: 'Every sampled product returned an image URL.' }
        : { status: 'fail', detail: `${missing.length} sample product(s) have no image URL.` }
    },
  },
  {
    id: 'categories',
    title: 'Category list is usable',
    evaluate: ({ result }) => {
      if (result.categoriesNote) return { status: 'skip', detail: result.categoriesNote }
      const categories = result.categories ?? []
      return categories.length > 0
        ? { status: 'pass', detail: `${categories.length} categories returned.` }
        : { status: 'skip', detail: 'This feed reported no populated categories.' }
    },
  },
  {
    id: 'scale',
    title: 'Scale & response time',
    evaluate: ({ result, elapsedMs }) => {
      if (!result.meta) return { status: 'skip', detail: 'No total count to evaluate scale against.' }
      const seconds = (elapsedMs / 1000).toFixed(1)
      return elapsedMs > 8000
        ? { status: 'fail', detail: `Took ${seconds}s \u2014 consider pagination or caching before enabling this feed.` }
        : {
            status: 'pass',
            detail: `Responded in ${seconds}s for ${result.meta.totalProducts}${result.meta.totalIsExact ? '' : '+'} products.`,
          }
    },
  },
]

/** One row of the checklist. Icon + accent colour communicate the outcome
 * at a glance; the detail line underneath carries the specific "why". */
export function CheckRow({ title, outcome }: { title: string; outcome?: CheckOutcome }) {
  const status = outcome?.status ?? 'pending'

  const icon =
    status === 'pass' ? (
      <CheckCircle2 size={16} className="text-teal-deep" />
    ) : status === 'fail' ? (
      <XCircle size={16} className="text-red-600" />
    ) : status === 'skip' ? (
      <MinusCircle size={16} className="text-ink/30" />
    ) : status === 'running' ? (
      <Loader2 size={16} className="animate-spin text-indigo" />
    ) : (
      <Circle size={16} className="text-ink/15" />
    )

  const accent =
    status === 'pass'
      ? 'border-teal-deep/20 bg-teal-deep/[0.04]'
      : status === 'fail'
      ? 'border-red-600/20 bg-red-600/[0.04]'
      : status === 'running'
      ? 'border-indigo/20 bg-indigo/[0.04]'
      : 'border-ink/10 bg-white'

  return (
    <div className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors ${accent}`}>
      <div className="mt-0.5 flex-none">{icon}</div>
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${status === 'pending' ? 'text-ink/40' : 'text-ink'}`}>{title}</p>
        {outcome?.detail && <p className="mt-0.5 text-xs leading-relaxed text-ink/50">{outcome.detail}</p>}
      </div>
    </div>
  )
}

/** Raw drill-in: totals, live categories, and every sampled product fully
 * expanded — variants included, since a variant-matching bug is exactly
 * the kind of thing invisible in a one-line summary. */
export function RawResultPanel({ result }: { result: TestExtractorResult }) {
  return (
    <div className={`mt-3 px-3 py-3 ${groupClass}`}>
      {result.meta && (
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-lg font-semibold text-ink">
              {result.meta.totalProducts}
              {!result.meta.totalIsExact && '+'}
            </p>
            <p className="text-xs text-ink/50">{result.meta.totalIsExact ? 'Total products' : 'Products (lower bound)'}</p>
          </div>
          <div>
            <p className="text-lg font-semibold text-ink">{result.meta.totalPages}</p>
            <p className="text-xs text-ink/50">Total pages</p>
          </div>
          <div>
            <p className="text-lg font-semibold text-ink">{result.categories?.length ?? 0}</p>
            <p className="text-xs text-ink/50">Categories</p>
          </div>
        </div>
      )}

      {result.categories && result.categories.length > 0 && (
        <div className="mt-3 border-t border-ink/10 pt-3">
          <p className="text-xs font-semibold text-ink/50">Categories</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {result.categories.map((c) => (
              <span key={c.handle} className="rounded-full border border-ink/10 bg-white px-2.5 py-1 text-xs text-ink/65">
                {c.title}
              </span>
            ))}
          </div>
        </div>
      )}

      {result.sampleProducts && result.sampleProducts.length > 0 && (
        <div className="mt-3 border-t border-ink/10 pt-3">
          <p className="text-xs font-semibold text-ink/50">Sample products ({result.sampleProducts.length})</p>
          <div className="mt-2 flex flex-col gap-2">
            {result.sampleProducts.map((p) => (
              <SampleProductRow key={p.id} product={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function SampleProductRow({ product, defaultOpen = false }: { product: StoreProduct; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const hasVariants = !!product.variants && product.variants.length > 0

  return (
    <div className="rounded-lg border border-ink/10 bg-white">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
        {product.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary
          // third-party store domains, not worth a next/image config entry
          // for a demo-only admin diagnostics view.
          <img
            src={product.image}
            alt=""
            className="h-10 w-10 flex-none rounded-md border border-ink/10 object-cover"
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.style.visibility = 'hidden'
            }}
          />
        ) : (
          <div className="h-10 w-10 flex-none rounded-md border border-dashed border-ink/15" />
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{product.name}</p>
          <p className="text-xs text-ink/50">
            {product.currency} {product.price.toLocaleString()}
            {product.compareAtPrice != null && (
              <span className="ml-1.5 text-ink/35 line-through">
                {product.currency} {product.compareAtPrice.toLocaleString()}
              </span>
            )}
            {' \u00b7 '}
            {product.inStock ? 'In stock' : 'Out of stock'}
            {product.sku && <> &middot; SKU {product.sku}</>}
          </p>
        </div>

        {product.url && (
          <a
            href={product.url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="Open this product on the real store"
            className="flex-none rounded-md p-1 text-ink/35 transition-colors hover:bg-ink/5 hover:text-teal-deep"
          >
            <ExternalLink size={13} />
          </a>
        )}

        <ChevronDown size={14} className={`flex-none text-ink/40 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="space-y-3 border-t border-ink/10 px-3 py-3 text-xs">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Detail label="Category" value={product.category} />
            <Detail label="Images" value={String(product.images?.length ?? 0)} />
            {product.sizes && product.sizes.length > 0 && <Detail label="Sizes" value={product.sizes.join(', ')} />}
            {product.colors && product.colors.length > 0 && <Detail label="Colors" value={product.colors.join(', ')} />}
            {product.weightKg != null && <Detail label="Weight" value={`${product.weightKg} kg`} />}
            {product.averageRating != null && (
              <Detail
                label="Rating"
                value={`${product.averageRating}${product.reviewCount != null ? ` (${product.reviewCount})` : ''}`}
              />
            )}
          </div>

          {product.description && (
            <div>
              <p className="font-semibold text-ink/50">Description</p>
              <p className="mt-0.5 text-ink/60 line-clamp-3">{product.description}</p>
            </div>
          )}

          {product.options && product.options.length > 0 && (
            <div>
              <p className="font-semibold text-ink/50">Options</p>
              <div className="mt-1 flex flex-col gap-1">
                {product.options.map((o) => (
                  <p key={o.name} className="text-ink/60">
                    <span className="font-medium text-ink/70">{o.name}:</span> {o.values.join(', ')}
                  </p>
                ))}
              </div>
            </div>
          )}

          {hasVariants && (
            <div>
              <p className="font-semibold text-ink/50">Variants ({product.variants!.length})</p>
              <div className="mt-1 overflow-x-auto">
                <table className="w-full min-w-[420px] border-collapse">
                  <thead>
                    <tr className="text-left text-ink/40">
                      <th className="py-1 pr-3 font-medium">Options</th>
                      <th className="py-1 pr-3 font-medium">Price</th>
                      <th className="py-1 font-medium">Available</th>
                    </tr>
                  </thead>
                  <tbody>
                    {product.variants!.map((v) => (
                      <tr key={v.id} className="border-t border-ink/5">
                        <td className="py-1 pr-3 text-ink/70">{v.title || v.options.filter(Boolean).join(' / ') || v.id}</td>
                        <td className="py-1 pr-3 text-ink/70">
                          {product.currency} {v.price.toLocaleString()}
                        </td>
                        <td className="py-1">
                          <span className={v.available ? 'text-teal-deep' : 'text-red-600/70'}>{v.available ? 'Yes' : 'No'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!hasVariants && <p className="text-ink/40">No variants \u2014 single-SKU product.</p>}
        </div>
      )}
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-ink/40">{label}</p>
      <p className="font-medium text-ink/70">{value}</p>
    </div>
  )
}