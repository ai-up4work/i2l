'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  ExternalLink,
  Loader2,
  MinusCircle,
  Search,
  XCircle,
} from 'lucide-react'

import { EXTRACTOR_TYPE_LABEL } from '@/data/sellers/data'
import type {
  StoreProviderType,
  JsonApiProviderConfig,
  HtmlScrapeProviderConfig,
} from '@/lib/store-config'
import type { StoreProduct } from '@/lib/store.types'

// ---------------------------------------------------------------------------
// /admin/sellers/new — Sales & Purchase Executive
//
// Previously this page just collected profile fields and posted a form.
// Onboarding a seller with a real feed meant guessing at field mappings or
// selectors blind, saving, then hopping to a separate Scrape config page to
// find out whether any of it actually worked.
//
// Now extraction method + the live test simulation (same checklist and
// single-product tester as the seller detail page) live right here, so an
// admin can configure a feed and see it proven out against the real store
// before the seller ever gets added. `platform` is still the slug used
// everywhere downstream (affiliatedStores, STORE_PROVIDERS,
// /stores/[platform]) — picked once, here.
//
// For shopify/woocommerce, store name + currency can also be pulled
// straight off the feed via POST /api/admin/sellers/detect-store
// (needs adding — see runDetectStore below): WooCommerce's WP REST API
// root (GET {baseUrl}/wp-json/) returns the site's `name`, and its Store
// API puts `currency_code` on every product; Shopify has no public
// shop-info endpoint, so that side is best-effort off the homepage's
// og:site_name/<title> tag, with currency read off a real product price
// from /products.json. Detected values only fill fields that are still
// empty — never overwrite something the admin already typed.
//
// Demo only: "Add seller" shows a confirmation and returns to the list, but
// does NOT persist. Wire handleSubmit up to a real POST /api/admin/sellers
// once it exists — payload should create both an affiliatedStores entry and
// a STORE_PROVIDERS entry shaped like providerConfig below (type: 'mock' if
// left as manual, otherwise baseUrl/currency plus whichever of jsonFields /
// htmlSelectors applies).
// ---------------------------------------------------------------------------

const inputClass =
  'w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-teal/60 focus:ring-2 focus:ring-teal/10'

const monoInputClass = `${inputClass} font-mono`

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

const slugify = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

// ---------------------------------------------------------------------------
// Method types
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

type JsonFieldsState = Pick<
  JsonApiProviderConfig,
  'listEndpoint' | 'idField' | 'nameField' | 'priceField' | 'imageField' | 'categoryField' | 'sizesField' | 'colorField'
>

type HtmlSelectorsState = HtmlScrapeProviderConfig['selectors']

const DEFAULT_JSON_FIELDS: JsonFieldsState = {
  listEndpoint: '/products/',
  idField: 'id',
  nameField: 'name',
  priceField: 'price',
  imageField: 'image',
  categoryField: '',
  sizesField: '',
  colorField: '',
}

const DEFAULT_HTML_SELECTORS: HtmlSelectorsState = {
  productCard: '',
  title: '',
  price: '',
  image: '',
  link: '',
  variants: '',
}

// ---------------------------------------------------------------------------
// Simulation types (identical contract to the seller detail page, so the
// same /api/admin/sellers/test-extractor endpoint serves both)
// ---------------------------------------------------------------------------

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

interface TestExtractorProductResult {
  ok: boolean
  error?: string
  product?: StoreProduct
}

type CheckStatus = 'pending' | 'running' | 'pass' | 'fail' | 'skip'

interface CheckOutcome {
  status: CheckStatus
  detail?: string
}

interface CheckContext {
  result: TestExtractorResult
  providerType: StoreProviderType
  jsonFields: JsonFieldsState
  elapsedMs: number
}

interface CheckDef {
  id: string
  title: string
  evaluate: (ctx: CheckContext) => { status: 'pass' | 'fail' | 'skip'; detail: string }
}

const CHECKS: CheckDef[] = [
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
        : { status: 'fail', detail: `${broken.length} of ${products.length} sample product(s) are missing a name, price, or currency.` }
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
        : { status: 'pass', detail: `Checked ${withVariants.length} product(s) with variants \u2014 pricing present on every option.` }
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
        ? { status: 'pass', detail: 'Stock flag present on every sampled product \u2014 still worth a manual spot-check against the live site.' }
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
        : { status: 'pass', detail: `Responded in ${seconds}s for ${result.meta.totalProducts}${result.meta.totalIsExact ? '' : '+'} products.` }
    },
  },
]

export default function NewSellerPage() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  // ---- Profile & contact state ----
  const [form, setForm] = useState({
    storeName: '',
    platform: '',
    platformTouched: false,
    storeUrl: '',
    storeUrlTouched: false,
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    notes: '',
  })

  const onStoreNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const storeName = e.target.value
    setForm((prev) => ({
      ...prev,
      storeName,
      platform: prev.platformTouched ? prev.platform : slugify(storeName),
    }))
  }

  const onPlatformChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, platform: slugify(e.target.value), platformTouched: true }))

  // Store URL and the Method section's base URL usually point at the same
  // domain, so whichever the admin fills in first mirrors into the other —
  // but only until the other one has been edited directly, same pattern as
  // the platform slug above.
  const onStoreUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const storeUrl = e.target.value
    setForm((prev) => ({ ...prev, storeUrl, storeUrlTouched: true }))
    if (!baseUrlTouched) setBaseUrl(storeUrl)
  }

  const set = (key: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const canSubmit = form.storeName.trim().length > 0 && form.platform.length > 0 && form.contactEmail.trim().length > 0

  // ---- Method state ----
  const [providerType, setProviderType] = useState<StoreProviderType>('mock')
  const [baseUrl, setBaseUrl] = useState('')
  const [baseUrlTouched, setBaseUrlTouched] = useState(false)
  const [currency, setCurrency] = useState('')

  const [jsonFields, setJsonFields] = useState<JsonFieldsState>(DEFAULT_JSON_FIELDS)
  const [htmlSelectors, setHtmlSelectors] = useState<HtmlSelectorsState>(DEFAULT_HTML_SELECTORS)
  const [listingUrl, setListingUrl] = useState('')

  const setJsonField = (field: keyof JsonFieldsState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setJsonFields((prev) => ({ ...prev, [field]: e.target.value }))

  const setHtmlSelector = (field: keyof HtmlSelectorsState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setHtmlSelectors((prev) => ({ ...prev, [field]: e.target.value }))

  // Picking a provider that needs a base URL prefills it from the store URL
  // (unless the admin has already typed a different one directly into
  // "Store base URL") — one less field to duplicate for the common case
  // where the feed lives on the same domain as the storefront.
  const onProviderTypeChange = (value: StoreProviderType) => {
    setProviderType(value)
    setManualInput('')
    setManualResult(null)
    setCheckStates({})
    setTestResult(null)
    if (value !== 'mock' && !baseUrlTouched && form.storeUrl) {
      setBaseUrl(form.storeUrl)
    }
  }

  const onBaseUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setBaseUrl(value)
    setBaseUrlTouched(true)
    if (!form.storeUrlTouched) setForm((prev) => ({ ...prev, storeUrl: value }))
  }

  // ---- Auto-detect from store URL ----
  // Fires when the admin leaves the Store URL field. Hits
  // /api/admin/sellers/detect-store (backed by lib/store-detection), which
  // works out Shopify vs WooCommerce vs neither, then sets the extraction
  // method, base URL, currency, and store name for them — a non-technical
  // admin never has to know what "Shopify" or "WooCommerce" even means to
  // get a working feed. Detected values only fill fields that are still
  // empty, and the provider cards below stay fully clickable in case the
  // guess needs correcting.
  type DetectionState =
    | { status: 'idle' }
    | { status: 'checking' }
    | { status: 'error'; error: string }
    | {
        status: 'done'
        type: 'shopify' | 'woocommerce' | 'none'
        confidence: 'high' | 'medium' | 'low'
        signals: string[]
        reason?: string
      }

  const [detection, setDetection] = useState<DetectionState>({ status: 'idle' })
  const [detectedUrl, setDetectedUrl] = useState('')
  const [showSignals, setShowSignals] = useState(false)

  const runAutoDetect = async (url: string) => {
    if (!url.trim() || url === detectedUrl) return
    setDetectedUrl(url)
    setDetection({ status: 'checking' })
    setShowSignals(false)
    try {
      const res = await fetch('/api/admin/sellers/detect-store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeUrl: url }),
      })
      const data = (await res.json()) as {
        ok: boolean
        error?: string
        type?: 'shopify' | 'woocommerce' | 'none'
        baseUrl?: string
        confidence?: 'high' | 'medium' | 'low'
        signals?: string[]
        storeName?: string
        currency?: string
        reason?: string
      }

      if (!data.ok || !data.type) {
        setDetection({ status: 'error', error: data.error ?? 'Could not reach that store.' })
        return
      }

      setDetection({
        status: 'done',
        type: data.type,
        confidence: data.confidence ?? 'low',
        signals: data.signals ?? [],
        reason: data.reason,
      })

      if (data.type === 'shopify' || data.type === 'woocommerce') {
        onProviderTypeChange(data.type)
        if (data.baseUrl) setBaseUrl(data.baseUrl)
        setBaseUrlTouched(false)
        if (data.currency && !currency) setCurrency(data.currency)
        if (data.storeName) {
          setForm((prev) =>
            prev.storeName.trim()
              ? prev
              : { ...prev, storeName: data.storeName!, platform: prev.platformTouched ? prev.platform : slugify(data.storeName!) }
          )
        }
      }
    } catch (e) {
      setDetection({ status: 'error', error: e instanceof Error ? e.message : 'Request failed.' })
    }
  }

  const onStoreUrlBlur = () => {
    if (form.storeUrl.trim()) runAutoDetect(form.storeUrl.trim())
  }

  // ---- Simulation state ----
  const [checkStates, setCheckStates] = useState<Record<string, CheckOutcome>>({})
  const [simRunning, setSimRunning] = useState(false)
  const [testResult, setTestResult] = useState<TestExtractorResult | null>(null)
  const [showRaw, setShowRaw] = useState(false)

  const [manualInput, setManualInput] = useState('')
  const [manualLoading, setManualLoading] = useState(false)
  const [manualResult, setManualResult] = useState<TestExtractorProductResult | null>(null)

  const runManualTest = async () => {
    if (!manualInput.trim()) return
    setManualLoading(true)
    setManualResult(null)
    try {
      const res = await fetch('/api/admin/sellers/test-extractor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'single',
          providerType,
          baseUrl,
          currency,
          jsonFields: providerType === 'jsonapi' ? jsonFields : undefined,
          productInput: manualInput.trim(),
        }),
      })
      setManualResult((await res.json()) as TestExtractorProductResult)
    } catch (e) {
      setManualResult({ ok: false, error: e instanceof Error ? e.message : 'Request failed.' })
    }
    setManualLoading(false)
  }

  const testTarget =
    providerType === 'shopify'
      ? baseUrl && `${baseUrl.replace(/\/+$/, '')}/products.json`
      : providerType === 'woocommerce'
      ? baseUrl && `${baseUrl.replace(/\/+$/, '')} (public WooCommerce feed + categories)`
      : providerType === 'jsonapi'
      ? baseUrl && jsonFields.listEndpoint && `${baseUrl.replace(/\/+$/, '')}${jsonFields.listEndpoint}`
      : null

  const canRunSimulation =
    (providerType === 'shopify' || providerType === 'woocommerce' || providerType === 'jsonapi') &&
    !!baseUrl &&
    (providerType !== 'jsonapi' ||
      (jsonFields.idField && jsonFields.nameField && jsonFields.priceField && jsonFields.imageField))

  const runSimulation = async () => {
    setSimRunning(true)
    setTestResult(null)
    setShowRaw(false)
    setCheckStates(Object.fromEntries(CHECKS.map((c) => [c.id, { status: 'pending' as CheckStatus }])))

    const start = Date.now()
    let result: TestExtractorResult
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
      result = (await res.json()) as TestExtractorResult
    } catch (e) {
      result = { ok: false, error: e instanceof Error ? e.message : 'Request failed.' }
    }
    const elapsedMs = Date.now() - start
    setTestResult(result)
    if (result.ok && !currency && result.sampleProducts?.[0]?.currency) {
      setCurrency(result.sampleProducts[0].currency)
    }

    for (const check of CHECKS) {
      await sleep(280)
      setCheckStates((prev) => ({ ...prev, [check.id]: { status: 'running' } }))
      await sleep(420)
      if (check.id !== 'reachable' && !result.ok) {
        setCheckStates((prev) => ({
          ...prev,
          [check.id]: { status: 'skip', detail: 'Feed unreachable \u2014 fix connectivity first.' },
        }))
        continue
      }
      const outcome = check.evaluate({ result, providerType, jsonFields, elapsedMs })
      setCheckStates((prev) => ({ ...prev, [check.id]: outcome }))
    }

    setSimRunning(false)
  }

  const simHasRun = Object.keys(checkStates).length > 0
  const summary = CHECKS.reduce(
    (acc, c) => {
      const s = checkStates[c.id]?.status
      if (s === 'pass') acc.pass += 1
      else if (s === 'fail') acc.fail += 1
      else if (s === 'skip') acc.skip += 1
      return acc
    },
    { pass: 0, fail: 0, skip: 0 }
  )

  // A live provider that's never been run through the simulation gets a
  // gentle nudge next to the submit button \u2014 it doesn't block adding the
  // seller, since the admin may have already verified the feed elsewhere,
  // but flying blind shouldn't be the silent default.
  const isLiveProvider = providerType === 'shopify' || providerType === 'woocommerce' || providerType === 'jsonapi'
  const untested = isLiveProvider && !simHasRun

  const handleSubmit = () => {
    if (!canSubmit) return
    setSubmitting(true)
    // TODO(wire-up): POST to /api/admin/sellers with:
    //   profile: { storeName, platform, storeUrl, contactName, contactEmail, contactPhone, notes }
    //   providerConfig:
    //     mock                  -> { type: 'mock' }
    //     shopify/woocommerce   -> { type, baseUrl, currency }
    //     jsonapi               -> { type, baseUrl, currency, ...jsonFields }
    //     html-scrape           -> { type, baseUrl, currency, listingUrl, selectors: htmlSelectors }
    // On success, router.push(`/admin/sellers/${form.platform}`).
    window.setTimeout(() => {
      setSubmitting(false)
      setSubmitted(true)
      window.setTimeout(() => router.push('/admin/sellers'), 900)
    }, 500)
  }

  return (
    <div className="mx-auto max-w-[1560px] px-6 pb-24 pt-8 lg:px-10">
      <button
        type="button"
        onClick={() => router.push('/admin/sellers')}
        className="flex items-center gap-1.5 text-sm font-semibold text-ink/50 transition-colors hover:text-ink"
      >
        <ArrowLeft size={14} />
        Sellers
      </button>

      <h1 className="mt-4 font-display text-3xl text-ink">Add a seller</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink/60">
        Enter the store details, set up how products get pulled in, and test that feed against
        the real store before adding the seller.
      </p>

      {submitted ? (
        <div className="mt-8 flex items-center gap-2 rounded-xl border border-teal-deep/25 bg-teal-deep/10 px-4 py-3 text-sm font-semibold text-teal-deep">
          <Check size={16} />
          Seller added (demo \u2014 not yet saved to a backend). Returning to the list...
        </div>
      ) : (
        <>
          {/* ---------------- Store & contact ---------------- */}
          <section className="mt-6 rounded-2xl border border-ink/10 bg-card p-6">
            <SectionHeading title="Store & contact" subtitle="Who this seller is and how to reach them." />

            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label="Store name" required>
                <input
                  type="text"
                  value={form.storeName}
                  onChange={onStoreNameChange}
                  placeholder="e.g. Chennai Silk House"
                  className={inputClass}
                />
              </Field>

              <Field label="Platform slug" required>
                <input
                  type="text"
                  value={form.platform}
                  onChange={onPlatformChange}
                  placeholder="chennai-silk-house"
                  className={monoInputClass}
                />
                <p className="mt-1 text-xs text-ink/40">
                  Used internally (feed config, storefront URL /stores/{form.platform || '...'}) \u2014
                  auto-filled from the store name, editable if needed.
                </p>
              </Field>

              <Field label="Store URL">
                <input
                  type="url"
                  value={form.storeUrl}
                  onChange={onStoreUrlChange}
                  onBlur={onStoreUrlBlur}
                  placeholder="https://"
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-ink/40">
                  We&rsquo;ll check this automatically for a Shopify or WooCommerce feed once you
                  move to the next field.
                </p>
              </Field>

              <Field label="Contact email" required>
                <input
                  type="email"
                  value={form.contactEmail}
                  onChange={set('contactEmail')}
                  placeholder="name@store.com"
                  className={inputClass}
                />
              </Field>

              <Field label="Contact name">
                <input
                  type="text"
                  value={form.contactName}
                  onChange={set('contactName')}
                  placeholder="Full name"
                  className={inputClass}
                />
              </Field>

              <Field label="Contact phone">
                <input
                  type="tel"
                  value={form.contactPhone}
                  onChange={set('contactPhone')}
                  placeholder="+91 ..."
                  className={inputClass}
                />
              </Field>

              <div className="sm:col-span-2">
                <Field label="Notes">
                  <textarea
                    value={form.notes}
                    onChange={set('notes')}
                    rows={3}
                    placeholder="Onboarding context, feed reliability, anything the next person should know..."
                    className={inputClass}
                  />
                </Field>
              </div>
            </div>
          </section>

          {/* ---------------- Method / Simulation ---------------- */}
          <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1.25fr] xl:items-start">
            {/* -- Method -- */}
            <section className="flex flex-col gap-5 rounded-2xl border border-ink/10 bg-card p-6">
              <SectionHeading title="Catalogue feed" subtitle="How this seller's products will get pulled in." />

              {detection.status === 'idle' && (
                <p className="rounded-xl border border-dashed border-ink/15 bg-parchment/50 p-3.5 text-xs text-ink/45">
                  Add a Store URL above and we&rsquo;ll check it automatically \u2014 no need to know
                  which platform it runs on.
                </p>
              )}

              {detection.status === 'checking' && (
                <p className="flex items-center gap-2 rounded-xl border border-indigo/20 bg-indigo/[0.04] p-3.5 text-xs font-semibold text-indigo">
                  <Loader2 size={14} className="animate-spin" />
                  Checking whether that store runs on Shopify or WooCommerce\u2026
                </p>
              )}

              {detection.status === 'error' && (
                <div className="rounded-xl border border-red-600/20 bg-red-600/[0.04] p-3.5">
                  <p className="text-xs font-semibold text-red-700">Couldn&rsquo;t check that store automatically</p>
                  <p className="mt-1 text-xs text-red-700/70">{detection.error}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setDetectedUrl('')
                      if (form.storeUrl.trim()) runAutoDetect(form.storeUrl.trim())
                    }}
                    className="mt-2 text-xs font-semibold text-red-700 underline"
                  >
                    Try again
                  </button>
                  <p className="mt-2 text-xs text-ink/45">
                    You can still pick how products get pulled in manually below.
                  </p>
                </div>
              )}

              {detection.status === 'done' && (detection.type === 'shopify' || detection.type === 'woocommerce') && (
                <div className="rounded-xl border border-teal-deep/25 bg-teal-deep/[0.05] p-3.5">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-teal-deep">
                    <Check size={13} />
                    This store runs on {EXTRACTOR_TYPE_LABEL[detection.type]} \u2014 set up below automatically.
                  </p>
                  <p className="mt-1 text-xs text-ink/45">
                    {detection.confidence === 'high'
                      ? 'High confidence match.'
                      : detection.confidence === 'medium'
                      ? 'Likely match \u2014 worth a quick look below before testing.'
                      : 'Best guess \u2014 double-check the details below before testing.'}
                  </p>
                  {detection.signals.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowSignals((v) => !v)}
                      className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-teal-deep hover:underline"
                    >
                      Why we think so
                      <ChevronDown size={11} className={`transition-transform ${showSignals ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                  {showSignals && (
                    <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs text-ink/50">
                      {detection.signals.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {detection.status === 'done' && detection.type === 'none' && (
                <div className="rounded-xl border border-dashed border-ink/15 bg-parchment/50 p-3.5">
                  <p className="text-xs font-semibold text-ink/60">
                    We couldn&rsquo;t automatically detect Shopify or WooCommerce for that URL.
                  </p>
                  <p className="mt-1 text-xs text-ink/45">
                    {detection.reason ?? 'This may be a custom-built store.'} Pick manually below \u2014
                    if it has its own JSON feed or you want to scrape its pages, choose that option;
                    otherwise products can be added by hand.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 gap-2">
                {EXTRACTOR_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onProviderTypeChange(opt.value)}
                    className={`rounded-xl border p-3 text-left transition-all ${
                      providerType === opt.value
                        ? 'border-teal-deep bg-teal-deep/5 ring-1 ring-teal-deep'
                        : 'border-ink/10 bg-parchment/50 hover:border-ink/20'
                    }`}
                  >
                    <p className="text-sm font-semibold text-ink">{EXTRACTOR_TYPE_LABEL[opt.value]}</p>
                    <p className="mt-0.5 text-xs text-ink/50">{opt.blurb}</p>
                  </button>
                ))}
              </div>

              {providerType !== 'mock' && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
                  <label className="block">
                    <span className="text-xs font-semibold text-ink/50">Store base URL</span>
                    <input
                      type="url"
                      value={baseUrl}
                      onChange={onBaseUrlChange}
                      placeholder="https://"
                      className={`mt-1.5 ${monoInputClass}`}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-ink/50">Currency</span>
                    <input
                      type="text"
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      placeholder="LKR"
                      className={`mt-1.5 ${monoInputClass}`}
                    />
                  </label>
                </div>
              )}

              {providerType === 'jsonapi' && (
                <div className="flex flex-col gap-3 rounded-xl border border-ink/10 bg-parchment/50 p-4">
                  <p className="text-xs font-semibold text-ink/50">
                    JSON field mapping \u2014 confirm each against a real response before testing.
                  </p>
                  <SelectorField label="List endpoint" value={jsonFields.listEndpoint} onChange={setJsonField('listEndpoint')} placeholder="/products/" />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <SelectorField label="Id field" value={jsonFields.idField} onChange={setJsonField('idField')} placeholder="id" />
                    <SelectorField label="Name field" value={jsonFields.nameField} onChange={setJsonField('nameField')} placeholder="name" />
                    <SelectorField label="Price field" value={jsonFields.priceField} onChange={setJsonField('priceField')} placeholder="price" />
                    <SelectorField label="Image field" value={jsonFields.imageField} onChange={setJsonField('imageField')} placeholder="image" />
                    <SelectorField label="Category field (optional)" value={jsonFields.categoryField ?? ''} onChange={setJsonField('categoryField')} placeholder="type" />
                    <SelectorField label="Sizes field (optional)" value={jsonFields.sizesField ?? ''} onChange={setJsonField('sizesField')} placeholder="sizes" />
                    <SelectorField label="Color field (optional)" value={jsonFields.colorField ?? ''} onChange={setJsonField('colorField')} placeholder="color" />
                  </div>
                </div>
              )}

              {providerType === 'html-scrape' && (
                <div className="flex flex-col gap-3 rounded-xl border border-ink/10 bg-parchment/50 p-4">
                  <p className="text-xs font-semibold text-ink/50">
                    CSS selectors \u2014 point these at a real category/shop page&rsquo;s markup.
                  </p>
                  <SelectorField label="Listing page path" value={listingUrl} onChange={(e) => setListingUrl(e.target.value)} placeholder="/shop" />
                  <SelectorField label="Product card" value={htmlSelectors.productCard} onChange={setHtmlSelector('productCard')} placeholder=".product-card" />
                  <SelectorField label="Title" value={htmlSelectors.title} onChange={setHtmlSelector('title')} placeholder=".product-name" />
                  <SelectorField label="Price" value={htmlSelectors.price} onChange={setHtmlSelector('price')} placeholder=".price-now" />
                  <SelectorField label="Image" value={htmlSelectors.image} onChange={setHtmlSelector('image')} placeholder="img.gallery-thumb" />
                  <SelectorField label="Link to product" value={htmlSelectors.link} onChange={setHtmlSelector('link')} placeholder="a.product-link" />
                  <SelectorField label="Variants (optional)" value={htmlSelectors.variants ?? ''} onChange={setHtmlSelector('variants')} placeholder=".size-option" />
                </div>
              )}
            </section>

            {/* -- Simulation -- */}
            <section className="flex flex-col gap-5 rounded-2xl border border-ink/10 bg-card p-6">
              <SectionHeading title="Test simulation" subtitle="Runs the onboarding checklist against the real feed \u2014 before the seller exists." />

              {providerType === 'mock' && (
                <p className="rounded-xl border border-dashed border-ink/15 bg-parchment/50 p-4 text-xs text-ink/45">
                  No live feed configured for this provider type \u2014 there&rsquo;s nothing to test.
                  Catalogue entries will be added by hand once this seller is created.
                </p>
              )}

              {providerType === 'html-scrape' && (
                <p className="rounded-xl border border-dashed border-ink/15 bg-parchment/50 p-4 text-xs text-ink/45">
                  Live simulation isn&rsquo;t wired up for HTML scraping yet \u2014 it needs the
                  scraping engine behind <span className="font-mono text-ink/55">app/api/scrape/route.ts</span>.
                  Verify selectors manually against the listing page for now.
                </p>
              )}

              {isLiveProvider && (
                <>
                  <div className="rounded-xl border border-ink/10 bg-parchment/50 p-4">
                    <p className="text-xs font-semibold text-ink/50">Target</p>
                    <p className="mt-1 text-xs text-ink/45">
                      {testTarget ? (
                        <>
                          Will fetch <span className="font-mono text-ink/60">{testTarget}</span> for real, then walk
                          through 8 checks.
                        </>
                      ) : (
                        'Enter a base URL in the Extraction method section to enable testing.'
                      )}
                    </p>

                    <div className="mt-3 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={runSimulation}
                        disabled={simRunning || !canRunSimulation}
                        className="flex items-center justify-center gap-1.5 rounded-lg bg-indigo px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-indigo-deep disabled:cursor-not-allowed disabled:bg-ink/20"
                      >
                        {simRunning ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                        {simRunning ? 'Running checks\u2026' : simHasRun ? 'Run again' : 'Run all checks'}
                      </button>

                      {simHasRun && !simRunning && (
                        <p className="text-xs font-semibold text-ink/50">
                          <span className="text-teal-deep">{summary.pass} passed</span>
                          {summary.fail > 0 && <span className="text-red-600"> &middot; {summary.fail} failed</span>}
                          {summary.skip > 0 && <span className="text-ink/40"> &middot; {summary.skip} skipped</span>}
                        </p>
                      )}
                    </div>

                    {baseUrl && (
                      <a
                        href={baseUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-teal-deep hover:underline"
                      >
                        Open the real store listing
                        <ExternalLink size={11} />
                      </a>
                    )}
                  </div>

                  {/* ---- Test a specific product ---- */}
                  <div className="rounded-xl border border-ink/10 bg-parchment/50 p-4">
                    <p className="text-xs font-semibold text-ink/50">Test a specific product</p>
                    <p className="mt-1 text-xs text-ink/45">
                      {providerType === 'jsonapi'
                        ? 'Paste a product URL, or just the raw id, to check one product instead of a random sample.'
                        : 'Paste a real product URL from the store (or just its handle/slug) to check one product instead of a random sample.'}
                    </p>

                    <div className="mt-3 flex items-center gap-2">
                      <input
                        type="text"
                        value={manualInput}
                        onChange={(e) => setManualInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !manualLoading && manualInput.trim()) runManualTest()
                        }}
                        placeholder={
                          providerType === 'jsonapi'
                            ? 'e.g. 5f2c... or a full product URL'
                            : providerType === 'shopify'
                            ? 'e.g. https://store.com/products/blue-shirt'
                            : 'e.g. https://store.com/product/blue-shirt/'
                        }
                        className={`flex-1 ${monoInputClass}`}
                      />
                      <button
                        type="button"
                        onClick={runManualTest}
                        disabled={manualLoading || !manualInput.trim() || !baseUrl}
                        className="flex flex-none items-center gap-1.5 rounded-lg bg-indigo px-3.5 py-2 text-sm font-semibold text-white transition-all hover:bg-indigo-deep disabled:cursor-not-allowed disabled:bg-ink/20"
                      >
                        {manualLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                        Test
                      </button>
                    </div>

                    {manualResult &&
                      (manualResult.ok && manualResult.product ? (
                        <div className="mt-3">
                          <SampleProductRow product={manualResult.product} defaultOpen />
                        </div>
                      ) : (
                        <div className="mt-3 rounded-lg border border-red-600/25 bg-red-600/5 px-3 py-2.5 text-sm">
                          <p className="font-semibold text-red-700">Couldn&rsquo;t fetch that product</p>
                          <p className="mt-1 text-xs text-red-700/70">{manualResult?.error ?? 'Unknown error.'}</p>
                        </div>
                      ))}
                  </div>

                  {simHasRun && (
                    <div className="flex flex-col gap-2">
                      {CHECKS.map((check) => (
                        <CheckRow key={check.id} title={check.title} outcome={checkStates[check.id]} />
                      ))}
                    </div>
                  )}

                  {testResult && !simRunning && (
                    <div>
                      <button
                        type="button"
                        onClick={() => setShowRaw((v) => !v)}
                        className="flex items-center gap-1 text-xs font-semibold text-teal-deep hover:underline"
                      >
                        {showRaw ? 'Hide' : 'Show'} raw sample data
                        <ChevronDown size={12} className={`transition-transform ${showRaw ? 'rotate-180' : ''}`} />
                      </button>

                      {showRaw &&
                        (testResult.ok ? (
                          <RawResultPanel result={testResult} />
                        ) : (
                          <div className="mt-3 rounded-lg border border-red-600/25 bg-red-600/5 px-3 py-2.5 text-sm">
                            <p className="font-semibold text-red-700">Request failed</p>
                            <p className="mt-1 text-xs text-red-700/70">{testResult.error}</p>
                          </div>
                        ))}
                    </div>
                  )}
                </>
              )}
            </section>
          </div>

          {/* ---------------- Final action ---------------- */}
          <div className="mt-6 flex flex-col items-end gap-2 rounded-2xl border border-ink/10 bg-card p-5">
            {untested && (
              <p className="text-xs text-gold-deep">
                This feed hasn&rsquo;t been tested yet \u2014 run the checks above first if you want to
                confirm it before adding the seller.
              </p>
            )}
            {simHasRun && (
              <p className="text-xs font-semibold text-ink/50">
                Last test: <span className="text-teal-deep">{summary.pass} passed</span>
                {summary.fail > 0 && <span className="text-red-600"> &middot; {summary.fail} failed</span>}
                {summary.skip > 0 && <span className="text-ink/40"> &middot; {summary.skip} skipped</span>}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => router.push('/admin/sellers')}
                className="rounded-xl border border-ink/15 px-4 py-2 text-sm font-semibold text-ink hover:bg-ink/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit || submitting}
                className="rounded-xl bg-teal-deep px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-teal disabled:cursor-not-allowed disabled:bg-ink/20"
              >
                {submitting ? 'Adding...' : 'Add seller'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="font-display text-xl text-ink">{title}</h2>
      <p className="mt-0.5 text-sm text-ink/45">{subtitle}</p>
    </div>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-ink/50">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
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
      <input type="text" value={value} onChange={onChange} placeholder={placeholder} className={`mt-1 ${monoInputClass}`} />
    </label>
  )
}

function CheckRow({ title, outcome }: { title: string; outcome?: CheckOutcome }) {
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

  const borderColor =
    status === 'pass'
      ? 'border-teal-deep/20 bg-teal-deep/[0.03]'
      : status === 'fail'
      ? 'border-red-600/20 bg-red-600/[0.03]'
      : status === 'running'
      ? 'border-indigo/20 bg-indigo/[0.03]'
      : 'border-ink/10 bg-white'

  return (
    <div className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors ${borderColor}`}>
      <div className="mt-0.5 flex-none">{icon}</div>
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${status === 'pending' ? 'text-ink/40' : 'text-ink'}`}>{title}</p>
        {outcome?.detail && <p className="mt-0.5 text-xs text-ink/50">{outcome.detail}</p>}
      </div>
    </div>
  )
}

function RawResultPanel({ result }: { result: TestExtractorResult }) {
  return (
    <div className="mt-3 rounded-lg border border-ink/10 bg-parchment/50 px-3 py-3">
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

function SampleProductRow({ product, defaultOpen = false }: { product: StoreProduct; defaultOpen?: boolean }) {
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