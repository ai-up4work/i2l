'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Check, ChevronDown, FlaskConical, X } from 'lucide-react'

import { getSeller, EXTRACTOR_TYPE_LABEL } from '@/data/sellers/data'
import type {
  StoreProviderType,
  JsonApiProviderConfig,
  HtmlScrapeProviderConfig,
} from '@/lib/store-config'
import type { StoreProduct } from '@/lib/store.types'

// ---------------------------------------------------------------------------
// /admin/sellers/[sellerId]/scrape-config — Sales & Purchase Executive
// Configure this seller's catalogue feed: which STORE_PROVIDERS entry type
// to use, and (for the two "Custom" types) the field mapping or CSS
// selectors that type needs. "Test" runs it against the real store feed
// and shows what actually comes back — store-wide totals, the real
// category list, and a handful of fully-normalised sample products
// (variants, options, sizes/colors, stock, everything) — before saving.
//
// This is deliberately NOT the same thing as the single-link scraper
// behind app/api/scrape/route.ts (Channel 2/3 — any pasted URL, not tied
// to an onboarded seller). This page configures a seller's whole-catalogue
// feed, i.e. one entry in lib/store-config.ts's STORE_PROVIDERS, keyed by
// the same `platform` slug used everywhere else.
//
// Test extractor: POSTs the current (unsaved) form state to
// /api/admin/sellers/test-extractor, which runs the SAME
// fetchShopifyProducts / fetchWooCommerceProducts / fetchJsonApiProducts
// (plus fetchShopifyCollections / fetchWooCommerceCategories) functions
// the live storefront uses, against the real store, and returns what it
// actually got back — not a single summarized product. Not wired for
// html-scrape yet — that needs the real scraping engine behind
// app/api/scrape/route.ts, whose function signatures aren't available to
// this change; the route returns an honest "not yet supported" for that
// type rather than a fake result.
//
// There's deliberately no separate "test URL" field — the real fetch
// always hits `baseUrl` plus a provider-specific endpoint (/products.json,
// listEndpoint, etc), never an arbitrary pasted URL, so a second URL field
// would just be misleading about what's actually tested. What gets hit is
// shown next to the button instead.
//
// Save is still a demo: wire handleSave to
// PATCH /api/admin/sellers/[platform]/provider-config once it exists —
// that endpoint is what should actually update STORE_PROVIDERS[platform]
// (today a static object; presumably DB-backed once this is real).
// ---------------------------------------------------------------------------

const EXTRACTOR_OPTIONS: { value: StoreProviderType; blurb: string }[] = [
  { value: 'mock', blurb: 'No automated extraction. Catalogue entries are added by hand.' },
  { value: 'shopify', blurb: 'Uses the store\u2019s standard Shopify product JSON \u2014 no field mapping needed.' },
  { value: 'woocommerce', blurb: 'Uses the WooCommerce REST API or store/v1 endpoint \u2014 no field mapping needed.' },
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

const inputClass =
  'w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal/50 font-mono'

type JsonFieldsState = Pick<
  JsonApiProviderConfig,
  'listEndpoint' | 'idField' | 'nameField' | 'priceField' | 'imageField' | 'categoryField' | 'sizesField' | 'colorField'
>

type HtmlSelectorsState = HtmlScrapeProviderConfig['selectors']

interface TestExtractorMeta {
  totalProducts: number
  totalIsExact: boolean
  totalPages: number
}

interface TestExtractorCategory {
  handle: string
  title: string
}

interface TestExtractorResult {
  ok: boolean
  error?: string
  meta?: TestExtractorMeta
  categories?: TestExtractorCategory[]
  categoriesNote?: string
  sampleProducts?: StoreProduct[]
}

export default function ScrapeConfigPage() {
  const router = useRouter()
  const params = useParams<{ sellerId: string }>()
  const seller = getSeller(params.sellerId)

  if (!seller) {
    return (
      <div className="mx-auto max-w-2xl px-6 pb-20 pt-8 text-center lg:px-10">
        <p className="mt-16 text-sm text-ink/50">No seller found for &ldquo;{params.sellerId}&rdquo;.</p>
        <button
          type="button"
          onClick={() => router.push('/admin/sellers')}
          className="mt-4 text-sm font-semibold text-teal-deep hover:underline"
        >
          Back to sellers
        </button>
      </div>
    )
  }

  const cfg = seller.providerConfig

  const [providerType, setProviderType] = useState<StoreProviderType>(cfg.type)
  const [baseUrl, setBaseUrl] = useState(cfg.type !== 'mock' ? cfg.baseUrl : seller.store.url ?? '')
  const [currency, setCurrency] = useState(cfg.currency ?? '')

  const [jsonFields, setJsonFields] = useState<JsonFieldsState>(
    cfg.type === 'jsonapi'
      ? {
          listEndpoint: cfg.listEndpoint,
          idField: cfg.idField,
          nameField: cfg.nameField,
          priceField: cfg.priceField,
          imageField: cfg.imageField,
          categoryField: cfg.categoryField ?? '',
          sizesField: cfg.sizesField ?? '',
          colorField: cfg.colorField ?? '',
        }
      : {
          listEndpoint: '/products/',
          idField: 'id',
          nameField: 'name',
          priceField: 'price',
          imageField: 'image',
          categoryField: '',
          sizesField: '',
          colorField: '',
        }
  )

  const [htmlSelectors, setHtmlSelectors] = useState<HtmlSelectorsState>(
    cfg.type === 'html-scrape'
      ? cfg.selectors
      : { productCard: '', title: '', price: '', image: '', link: '', variants: '' }
  )
  const [listingUrl, setListingUrl] = useState(cfg.type === 'html-scrape' ? cfg.listingUrl : '')

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestExtractorResult | null>(null)
  const [saved, setSaved] = useState(false)

  const setJsonField = (field: keyof JsonFieldsState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setJsonFields((prev) => ({ ...prev, [field]: e.target.value }))

  const setHtmlSelector = (field: keyof HtmlSelectorsState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setHtmlSelectors((prev) => ({ ...prev, [field]: e.target.value }))

  // What the test button will actually hit — shown next to it so it's
  // never a mystery what "test" means for the current provider type.
  const testTarget =
    providerType === 'shopify'
      ? baseUrl && `${baseUrl.replace(/\/+$/, '')}/products.json`
      : providerType === 'woocommerce'
      ? baseUrl && `${baseUrl.replace(/\/+$/, '')} (public WooCommerce feed + categories)`
      : providerType === 'jsonapi'
      ? baseUrl && jsonFields.listEndpoint && `${baseUrl.replace(/\/+$/, '')}${jsonFields.listEndpoint}`
      : providerType === 'html-scrape'
      ? listingUrl && `${(baseUrl || '').replace(/\/+$/, '')}${listingUrl}`
      : null

  const canTest =
    providerType !== 'mock' &&
    !!baseUrl &&
    (providerType !== 'jsonapi' || (jsonFields.idField && jsonFields.nameField && jsonFields.priceField && jsonFields.imageField)) &&
    (providerType !== 'html-scrape' || (htmlSelectors.productCard && htmlSelectors.title && htmlSelectors.price))

  const runTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/admin/sellers/test-extractor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerType,
          baseUrl,
          currency,
          jsonFields: providerType === 'jsonapi' ? jsonFields : undefined,
        }),
      })
      const data = (await res.json()) as TestExtractorResult
      setTestResult(data)
    } catch (e) {
      setTestResult({ ok: false, error: e instanceof Error ? e.message : 'Request failed.' })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = () => {
    // TODO(wire-up): PATCH /api/admin/sellers/[platform]/provider-config
    // with a payload shaped to the selected providerType:
    //   shopify/woocommerce -> { type, baseUrl, currency }
    //   jsonapi              -> { type, baseUrl, currency, ...jsonFields }
    //   html-scrape           -> { type, baseUrl, currency, listingUrl, selectors: htmlSelectors }
    //   mock                  -> { type: 'mock' }
    // This is what should actually update STORE_PROVIDERS[platform] once
    // it's DB-backed instead of the static object in lib/store-config.ts.
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="mx-auto max-w-2xl px-6 pb-20 pt-8 lg:px-10">
      <button
        type="button"
        onClick={() => router.push(`/admin/sellers/${seller.platform}`)}
        className="flex items-center gap-1.5 text-sm font-semibold text-ink/50 hover:text-ink"
      >
        <ArrowLeft size={14} />
        {seller.store.name}
      </button>

      <h1 className="mt-4 font-display text-3xl text-ink">Scrape configuration</h1>
      <p className="mt-2 text-sm text-ink/60">
        Choose how {seller.store.name}&rsquo;s products get pulled in, then test it against the
        real store feed before saving.
      </p>

      {/* Provider type */}
      <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {EXTRACTOR_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              setProviderType(opt.value)
              setTestResult(null)
            }}
            className={`rounded-xl border p-3 text-left transition-all ${
              providerType === opt.value
                ? 'border-teal-deep bg-teal-deep/5 ring-1 ring-teal-deep'
                : 'border-ink/10 bg-card hover:border-ink/20'
            }`}
          >
            <p className="text-sm font-semibold text-ink">{EXTRACTOR_TYPE_LABEL[opt.value]}</p>
            <p className="mt-0.5 text-xs text-ink/50">{opt.blurb}</p>
          </button>
        ))}
      </div>

      {/* Base URL + currency — every non-mock type needs these */}
      {providerType !== 'mock' && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
          <label className="block">
            <span className="text-xs font-semibold text-ink/50">Store base URL</span>
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => {
                setBaseUrl(e.target.value)
                setTestResult(null)
              }}
              placeholder="https://"
              className={`mt-1.5 ${inputClass}`}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-ink/50">Currency</span>
            <input
              type="text"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              placeholder="LKR"
              className={`mt-1.5 ${inputClass}`}
            />
          </label>
        </div>
      )}

      {/* jsonapi field mapping */}
      {providerType === 'jsonapi' && (
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-ink/10 bg-card p-4">
          <p className="text-xs font-semibold text-ink/50">
            JSON field mapping \u2014 confirm each against a real response before saving.
          </p>
          <SelectorField
            label="List endpoint"
            value={jsonFields.listEndpoint}
            onChange={setJsonField('listEndpoint')}
            placeholder="/products/"
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SelectorField label="Id field" value={jsonFields.idField} onChange={setJsonField('idField')} placeholder="id" />
            <SelectorField label="Name field" value={jsonFields.nameField} onChange={setJsonField('nameField')} placeholder="name" />
            <SelectorField label="Price field" value={jsonFields.priceField} onChange={setJsonField('priceField')} placeholder="price" />
            <SelectorField label="Image field" value={jsonFields.imageField} onChange={setJsonField('imageField')} placeholder="image" />
            <SelectorField
              label="Category field (optional)"
              value={jsonFields.categoryField ?? ''}
              onChange={setJsonField('categoryField')}
              placeholder="type"
            />
            <SelectorField
              label="Sizes field (optional)"
              value={jsonFields.sizesField ?? ''}
              onChange={setJsonField('sizesField')}
              placeholder="sizes"
            />
          </div>
        </div>
      )}

      {/* html-scrape selectors */}
      {providerType === 'html-scrape' && (
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-ink/10 bg-card p-4">
          <p className="text-xs font-semibold text-ink/50">
            CSS selectors \u2014 point these at a real category/shop page&rsquo;s markup.
          </p>
          <SelectorField
            label="Listing page path"
            value={listingUrl}
            onChange={(e) => setListingUrl(e.target.value)}
            placeholder="/shop"
          />
          <SelectorField label="Product card" value={htmlSelectors.productCard} onChange={setHtmlSelector('productCard')} placeholder=".product-card" />
          <SelectorField label="Title" value={htmlSelectors.title} onChange={setHtmlSelector('title')} placeholder=".product-name" />
          <SelectorField label="Price" value={htmlSelectors.price} onChange={setHtmlSelector('price')} placeholder=".price-now" />
          <SelectorField label="Image" value={htmlSelectors.image} onChange={setHtmlSelector('image')} placeholder="img.gallery-thumb" />
          <SelectorField label="Link to product" value={htmlSelectors.link} onChange={setHtmlSelector('link')} placeholder="a.product-link" />
          <SelectorField
            label="Variants (optional)"
            value={htmlSelectors.variants ?? ''}
            onChange={setHtmlSelector('variants')}
            placeholder=".size-option"
          />
        </div>
      )}

      {/* Test */}
      {providerType !== 'mock' && (
        <div className="mt-4 rounded-xl border border-ink/10 bg-card p-4">
          <p className="text-xs font-semibold text-ink/50">Test extractor</p>
          <p className="mt-1 text-xs text-ink/40">
            {providerType === 'html-scrape'
              ? 'Not wired to a live scraper yet \u2014 see the note in this page\u2019s comments.'
              : testTarget
              ? <>Will fetch <span className="font-mono text-ink/55">{testTarget}</span> for real.</>
              : 'Enter a base URL above to test.'}
          </p>

          <button
            type="button"
            onClick={runTest}
            disabled={testing || !canTest}
            className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-indigo px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-indigo-deep disabled:cursor-not-allowed disabled:bg-ink/20"
          >
            <FlaskConical size={14} />
            {testing ? 'Testing\u2026' : 'Test extractor'}
          </button>

          {testResult && !testResult.ok && (
            <div className="mt-3 rounded-lg border border-red-600/25 bg-red-600/5 px-3 py-2.5 text-sm">
              <div className="flex items-start gap-2">
                <X size={15} className="mt-0.5 flex-none text-red-600" />
                <div>
                  <p className="font-semibold text-red-700">Test failed</p>
                  <p className="mt-1 text-xs text-red-700/70">{testResult.error}</p>
                </div>
              </div>
            </div>
          )}

          {testResult?.ok && <TestResultPanel result={testResult} />}
        </div>
      )}

      <div className="mt-6 flex items-center justify-end gap-3">
        {saved && (
          <span className="flex items-center gap-1 text-xs font-semibold text-teal-deep">
            <Check size={13} /> Saved
          </span>
        )}
        <button
          type="button"
          onClick={handleSave}
          className="rounded-xl bg-teal-deep px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-teal"
        >
          Save configuration
        </button>
      </div>
    </div>
  )
}

/**
 * Full test-result view: store-wide totals, the real category list, and
 * every sampled product fully expanded (not just a name/price line) —
 * variants included, since a variant-matching bug (wrong size/color
 * mapping) is exactly the kind of thing that's invisible in a one-line
 * summary and obvious once you can see the raw options/variants array.
 */
function TestResultPanel({ result }: { result: TestExtractorResult }) {
  return (
    <div className="mt-3 rounded-lg border border-teal-deep/25 bg-teal-deep/5 px-3 py-3">
      <div className="flex items-start gap-2">
        <Check size={15} className="mt-0.5 flex-none text-teal-deep" />
        <p className="text-sm font-semibold text-ink">Feed is reachable</p>
      </div>

      {result.meta && (
        <div className="mt-3 grid grid-cols-3 gap-3 border-t border-teal-deep/15 pt-3">
          <div>
            <p className="text-lg font-semibold text-ink">
              {result.meta.totalProducts}
              {!result.meta.totalIsExact && '+'}
            </p>
            <p className="text-xs text-ink/50">
              {result.meta.totalIsExact ? 'Total products' : 'Products (lower bound)'}
            </p>
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
        <div className="mt-3 border-t border-teal-deep/15 pt-3">
          <p className="text-xs font-semibold text-ink/50">Categories</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {result.categories.map((c) => (
              <span
                key={c.handle}
                className="rounded-full border border-ink/10 bg-white px-2.5 py-1 text-xs text-ink/65"
              >
                {c.title}
              </span>
            ))}
          </div>
        </div>
      )}

      {result.categoriesNote && (
        <p className="mt-2 text-[11px] text-ink/40">{result.categoriesNote}</p>
      )}

      {result.sampleProducts && result.sampleProducts.length > 0 && (
        <div className="mt-3 border-t border-teal-deep/15 pt-3">
          <p className="text-xs font-semibold text-ink/50">
            Sample products ({result.sampleProducts.length})
          </p>
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

function SampleProductRow({ product }: { product: StoreProduct }) {
  const [open, setOpen] = useState(false)
  const hasVariants = !!product.variants && product.variants.length > 0

  return (
    <div className="rounded-lg border border-ink/10 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
      >
        {product.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary
          // third-party store domains here, not worth a next/image config
          // entry for a demo-only admin diagnostics view.
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
              <Detail label="Rating" value={`${product.averageRating}${product.reviewCount != null ? ` (${product.reviewCount})` : ''}`} />
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
              <p className="font-semibold text-ink/50">
                Variants ({product.variants!.length})
              </p>
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
                          <span className={v.available ? 'text-teal-deep' : 'text-red-600/70'}>
                            {v.available ? 'Yes' : 'No'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!hasVariants && (
            <p className="text-ink/40">No variants \u2014 single-SKU product.</p>
          )}
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

function SelectorField({
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
      <input type="text" value={value} onChange={onChange} placeholder={placeholder} className={`mt-1 ${inputClass}`} />
    </label>
  )
}