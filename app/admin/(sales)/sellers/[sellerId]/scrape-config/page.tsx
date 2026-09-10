'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Check, FlaskConical, X } from 'lucide-react'

import { getSeller, EXTRACTOR_TYPE_LABEL } from '@/data/sellers/data'
import type {
  StoreProviderType,
  JsonApiProviderConfig,
  HtmlScrapeProviderConfig,
} from '@/lib/store-config'

// ---------------------------------------------------------------------------
// /admin/sellers/[sellerId]/scrape-config — Sales & Purchase Executive
// Configure this seller's catalogue feed: which STORE_PROVIDERS entry type
// to use, and (for the two "Custom" types) the field mapping or CSS
// selectors that type needs. "Test" runs it against a real URL and shows
// what would come back, before saving.
//
// This is deliberately NOT the same thing as the single-link scraper
// behind app/api/scrape/route.ts (Channel 2/3 — any pasted URL, not tied
// to an onboarded seller). This page configures a seller's whole-catalogue
// feed, i.e. one entry in lib/store-config.ts's STORE_PROVIDERS, keyed by
// the same `platform` slug used everywhere else.
//
// Demo only: the test is mocked and Save just shows a confirmation. Wire
// runTest to a real extractor-test endpoint and handleSave to
// PATCH /api/admin/sellers/[platform]/provider-config once they exist —
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

  const [testUrl, setTestUrl] = useState(baseUrl)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    ok: boolean
    title?: string
    price?: string
    imageCount?: number
    error?: string
  } | null>(null)
  const [saved, setSaved] = useState(false)

  const setJsonField = (field: keyof JsonFieldsState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setJsonFields((prev) => ({ ...prev, [field]: e.target.value }))

  const setHtmlSelector = (field: keyof HtmlSelectorsState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setHtmlSelectors((prev) => ({ ...prev, [field]: e.target.value }))

  const runTest = () => {
    setTesting(true)
    setTestResult(null)
    // TODO(wire-up): POST { platform: seller.platform, providerType, ...config }
    // to a real extractor-test endpoint and render its actual response.
    window.setTimeout(() => {
      setTesting(false)

      if (providerType === 'jsonapi' && (!jsonFields.idField || !jsonFields.priceField || !jsonFields.nameField)) {
        setTestResult({ ok: false, error: 'id, name, and price fields are required before testing.' })
        return
      }
      if (
        providerType === 'html-scrape' &&
        (!htmlSelectors.productCard || !htmlSelectors.title || !htmlSelectors.price)
      ) {
        setTestResult({ ok: false, error: 'Product card, title, and price selectors are required before testing.' })
        return
      }

      setTestResult({
        ok: true,
        title: `${seller.store.name} \u2014 sample product`,
        price: currency ? `${currency} 4,250` : 'LKR 4,250',
        imageCount: providerType === 'html-scrape' ? 1 : 4,
      })
    }, 900)
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
        Choose how {seller.store.name}&rsquo;s products get pulled in, then test it against a real
        URL before saving.
      </p>

      {/* Provider type */}
      <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {EXTRACTOR_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setProviderType(opt.value)}
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
              onChange={(e) => setBaseUrl(e.target.value)}
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
          <p className="text-xs font-semibold text-ink/50">Test against a real URL</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              type="url"
              value={testUrl}
              onChange={(e) => setTestUrl(e.target.value)}
              placeholder="https://..."
              className="flex-1 rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal/50"
            />
            <button
              type="button"
              onClick={runTest}
              disabled={testing || !testUrl}
              className="flex flex-none items-center justify-center gap-1.5 rounded-lg bg-indigo px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-indigo-deep disabled:cursor-not-allowed disabled:bg-ink/20"
            >
              <FlaskConical size={14} />
              {testing ? 'Testing...' : 'Test extractor'}
            </button>
          </div>

          {testResult && (
            <div
              className={`mt-3 rounded-lg border px-3 py-2.5 text-sm ${
                testResult.ok ? 'border-teal-deep/25 bg-teal-deep/5' : 'border-red-600/25 bg-red-600/5'
              }`}
            >
              {testResult.ok ? (
                <div className="flex items-start gap-2">
                  <Check size={15} className="mt-0.5 flex-none text-teal-deep" />
                  <div className="text-ink/80">
                    <p className="font-semibold text-ink">Extracted successfully</p>
                    <p className="mt-1 text-xs text-ink/60">
                      Title: {testResult.title} &middot; Price: {testResult.price} &middot; {testResult.imageCount}{' '}
                      image(s)
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <X size={15} className="mt-0.5 flex-none text-red-600" />
                  <div>
                    <p className="font-semibold text-red-700">Test failed</p>
                    <p className="mt-1 text-xs text-red-700/70">{testResult.error}</p>
                  </div>
                </div>
              )}
            </div>
          )}
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