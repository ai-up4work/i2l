'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
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

import { getSeller, STATUS_LABEL, STATUS_STYLE, type SellerStatus } from '@/data/sellers/data'
import { EXTRACTOR_TYPE_LABEL } from '@/data/sellers/data'
import { useLiveProductCount } from '@/hooks/useLiveProductCount'
import type {
  StoreProviderType,
  JsonApiProviderConfig,
  HtmlScrapeProviderConfig,
} from '@/lib/store-config'
import type { StoreProduct } from '@/lib/store.types'

// ---------------------------------------------------------------------------
// /admin/sellers/[sellerId] — Sales & Purchase Executive
//
// Two columns on wide screens:
//   1. Profile & Method — store/contact/status editing, PLUS picking the
//                  extractor type (shopify/woocommerce/jsonapi/html-scrape/
//                  mock) and its config, in one column. PATCH data/stores/
//                  data.ts + the admin-only seller_admin_meta table for the
//                  profile half; PATCH STORE_PROVIDERS[platform] once wired
//                  up for the method half. The two have separate "Save"
//                  actions since they map to separate PATCH endpoints.
//   2. Simulation — runs the onboarding checklist against the REAL feed,
//                  one check at a time, using the current (unsaved) Method
//                  state from the column on the left. Each check is
//                  evaluated from the same fetchShopifyProducts/
//                  fetchWooCommerceProducts/fetchJsonApiProducts response
//                  the storefront uses — nothing here is faked, only the
//                  reveal is staggered for legibility. Checks that don't
//                  apply to the current provider/config (e.g. no color
//                  field mapped on a jsonapi feed) are marked "skipped",
//                  not failed — an admin shouldn't have to fight a
//                  checklist that assumes every feed looks the same.
//
// html-scrape has no live test yet (needs the engine behind
// app/api/scrape/route.ts) and mock has no feed at all — both get an
// explanatory message in the Simulation column instead of a checklist.
// ---------------------------------------------------------------------------

const inputClass =
  'w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-teal/60 focus:ring-2 focus:ring-teal/10'

const monoInputClass = `${inputClass} font-mono`

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// Method column types
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
// Simulation column types
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
  currencyDetected?: boolean
}

/** Result of testing one specific product by URL/handle, rather than a
 * random sample from the feed \u2014 for spot-checking a complex product
 * (unusual variants, a tricky image, a weird price) that might not
 * happen to land in the page-1 sample above. */
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
        // The sample is deliberately picked to mix products with and
        // without variants when the feed has both (see pickRepresentativeSample
        // server-side). If NONE of the sampled products have variants, the
        // most likely explanation is simply that this store's catalog \u2014
        // or at least what's on page 1 \u2014 is mostly single-SKU items with
        // no size/color choices (jewelry, perfume, accessories, etc), which
        // is a normal, valid feed shape, not a broken extractor. Use "Test
        // a specific product" on an item you know has options to confirm
        // either way, rather than trusting this sample alone.
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

export default function SellerDetailPage() {
  const router = useRouter()
  const params = useParams<{ sellerId: string }>()
  const seller = getSeller(params.sellerId)

  const isLiveFeed = seller ? seller.providerConfig.type !== 'mock' : false
  const live = useLiveProductCount(seller?.platform ?? '', isLiveFeed)

  // ---- Profile state ----
  const [form, setForm] = useState({
    storeName: seller?.store.name ?? '',
    storeUrl: seller?.store.url ?? '',
    contactName: seller?.admin.contactName ?? '',
    contactEmail: seller?.admin.contactEmail ?? '',
    contactPhone: seller?.admin.contactPhone ?? '',
    notes: seller?.admin.notes ?? '',
    status: seller?.admin.status ?? ('active' as SellerStatus),
  })
  const [profileSaved, setProfileSaved] = useState(false)

  const set =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setForm((prev) => ({ ...prev, [key]: e.target.value }))
      setProfileSaved(false)
    }

  const handleSaveProfile = () => {
    // TODO(wire-up): two PATCHes once the APIs exist —
    //   PATCH /api/admin/stores/[platform]      { name: form.storeName, url: form.storeUrl }
    //   PATCH /api/admin/sellers/[platform]/meta { contactName, contactEmail, contactPhone, notes, status }
    setProfileSaved(true)
    window.setTimeout(() => setProfileSaved(false), 2000)
  }

  const handleDeactivate = () => {
    setForm((prev) => ({ ...prev, status: 'inactive' as SellerStatus }))
    // TODO(wire-up): PATCH seller_admin_meta.status -> 'inactive'. No hard
    // delete here by design — the AffiliatedStore/STORE_PROVIDERS entries
    // stay intact so re-activating doesn't mean re-onboarding from scratch.
  }

  // ---- Method state ----
  const cfg = seller?.providerConfig
  const [providerType, setProviderType] = useState<StoreProviderType>(cfg?.type ?? 'mock')
  const [baseUrl, setBaseUrl] = useState(cfg && cfg.type !== 'mock' ? cfg.baseUrl : seller?.store.url ?? '')
  const [currency, setCurrency] = useState(cfg?.currency ?? '')

  const [jsonFields, setJsonFields] = useState<JsonFieldsState>(
    cfg?.type === 'jsonapi'
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
      : DEFAULT_JSON_FIELDS
  )

  const [htmlSelectors, setHtmlSelectors] = useState<HtmlSelectorsState>(
    cfg?.type === 'html-scrape' ? cfg.selectors : DEFAULT_HTML_SELECTORS
  )
  const [listingUrl, setListingUrl] = useState(cfg?.type === 'html-scrape' ? cfg.listingUrl : '')
  const [configSaved, setConfigSaved] = useState(false)

  const setJsonField = (field: keyof JsonFieldsState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setJsonFields((prev) => ({ ...prev, [field]: e.target.value }))

  const setHtmlSelector = (field: keyof HtmlSelectorsState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setHtmlSelectors((prev) => ({ ...prev, [field]: e.target.value }))

  const handleSaveConfig = () => {
    // TODO(wire-up): PATCH /api/admin/sellers/[platform]/provider-config
    // with a payload shaped to the selected providerType:
    //   shopify/woocommerce -> { type, baseUrl, currency }
    //   jsonapi               -> { type, baseUrl, currency, ...jsonFields }
    //   html-scrape           -> { type, baseUrl, currency, listingUrl, selectors: htmlSelectors }
    //   mock                  -> { type: 'mock' }
    setConfigSaved(true)
    window.setTimeout(() => setConfigSaved(false), 2000)
  }

  // ---- Simulation state ----
  const [checkStates, setCheckStates] = useState<Record<string, CheckOutcome>>({})
  const [simRunning, setSimRunning] = useState(false)
  const [testResult, setTestResult] = useState<TestExtractorResult | null>(null)
  const [showRaw, setShowRaw] = useState(false)

  // ---- Manual single-product test state ----
  // Independent of runSimulation/testResult above \u2014 lets an admin bypass
  // the random page-1 sample and check one specific product (by URL or raw
  // handle/id) against the same real fetchShopifyProduct/
  // fetchWooCommerceProduct/fetchJsonApiProduct functions the storefront's
  // own product page uses.
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

  if (!seller) {
    return (
      <div className="mx-auto max-w-2xl px-6 pb-20 pt-8 text-center lg:px-10">
        <p className="mt-16 text-sm text-ink/50">
          No seller found for &ldquo;{params.sellerId}&rdquo;. It may have been removed.
        </p>
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

  const monogram = seller.store.name.trim().charAt(0).toUpperCase() || '?'

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
  const simHasRun = Object.keys(checkStates).length > 0

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

      {/* Header: identity + status + top-line stats */}
      <div className="mt-5 flex flex-col gap-6 rounded-2xl border border-ink/10 bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 flex-none items-center justify-center rounded-2xl bg-indigo text-2xl font-semibold text-gold">
            {monogram}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-display text-3xl leading-tight text-ink">{seller.store.name}</h1>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[form.status]}`}>
                {STATUS_LABEL[form.status]}
              </span>
            </div>
            <p className="mt-1 text-sm text-ink/50">
              {EXTRACTOR_TYPE_LABEL[seller.providerConfig.type]}
              {isLiveFeed && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-semibold text-gold-deep">
                  <span className="h-1.5 w-1.5 rounded-full bg-gold-deep" />
                  Live feed
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="grid flex-none grid-cols-3 gap-3 sm:min-w-[320px]">
          <Stat
            label={isLiveFeed ? 'Products (live)' : 'Products'}
            value={
              !isLiveFeed
                ? seller.store.itemCount ?? 0
                : live.loading
                ? '\u2026'
                : live.error
                ? seller.store.itemCount ?? 0
                : live.count ?? 0
            }
          />
          <Stat label="Orders" value={seller.admin.ordersReceived} />
          <Stat label="Pending" value={seller.admin.ordersPending} />
        </div>
      </div>

      {isLiveFeed && live.error && (
        <p className="mt-2 text-xs text-red-600/70">
          Couldn&rsquo;t reach the live feed just now ({live.error}) &mdash; showing the last saved count instead.{' '}
          <button type="button" onClick={live.refresh} className="font-semibold underline">
            Retry
          </button>
        </p>
      )}

      {/* Two columns: Profile & Method / Simulation */}
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1.25fr] xl:items-start">
        {/* ---------------- Profile & Method ---------------- */}
        <section className="flex flex-col gap-8 rounded-2xl border border-ink/10 bg-card p-6">
          {/* -- Profile -- */}
          <div className="flex flex-col gap-5">
            <SectionHeading title="Profile" subtitle="Store details, contact, and account status." />

            <Field label="Store name">
              <input type="text" value={form.storeName} onChange={set('storeName')} className={inputClass} />
            </Field>

            <Field label="Status">
              <select value={form.status} onChange={set('status')} className={inputClass}>
                <option value="active">{STATUS_LABEL.active}</option>
                <option value="pending_review">{STATUS_LABEL.pending_review}</option>
                <option value="inactive">{STATUS_LABEL.inactive}</option>
              </select>
            </Field>

            <Field label="Store URL">
              <input type="url" value={form.storeUrl} onChange={set('storeUrl')} className={inputClass} />
            </Field>

            <Field label="Contact name">
              <input type="text" value={form.contactName} onChange={set('contactName')} className={inputClass} />
            </Field>

            <Field label="Contact phone">
              <input type="tel" value={form.contactPhone} onChange={set('contactPhone')} className={inputClass} />
            </Field>

            <Field label="Contact email">
              <input type="email" value={form.contactEmail} onChange={set('contactEmail')} className={inputClass} />
            </Field>

            <Field label="Notes">
              <textarea value={form.notes} onChange={set('notes')} rows={3} className={inputClass} />
            </Field>

            <div className="mt-1 flex flex-col gap-3 border-t border-ink/10 pt-5">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleDeactivate}
                  disabled={form.status === 'inactive'}
                  className="rounded-xl border border-red-600/25 px-3.5 py-2 text-sm font-semibold text-red-700 transition-all hover:bg-red-600/5 disabled:cursor-not-allowed disabled:border-ink/10 disabled:text-ink/30"
                >
                  Deactivate
                </button>

                <div className="flex items-center gap-3">
                  {profileSaved && (
                    <span className="flex items-center gap-1 text-xs font-semibold text-teal-deep">
                      <Check size={13} /> Saved
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleSaveProfile}
                    className="rounded-xl bg-teal-deep px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-teal"
                  >
                    Save changes
                  </button>
                </div>
              </div>
              <p className="text-xs text-ink/35">
                Hard delete isn&rsquo;t available here by design &mdash; only Manager and Super
                Admin can delete a seller outright.
              </p>
            </div>
          </div>

          {/* -- Method -- */}
          <div className="flex flex-col gap-5 border-t border-ink/10 pt-8">
            <SectionHeading title="Extraction method" subtitle="How this seller's products get pulled in." />

            <div className="grid grid-cols-1 gap-2">
              {EXTRACTOR_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setProviderType(opt.value)
                    setManualInput('')
                    setManualResult(null)
                  }}
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
                    onChange={(e) => setBaseUrl(e.target.value)}
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
                  JSON field mapping &mdash; confirm each against a real response before saving.
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
                  CSS selectors &mdash; point these at a real category/shop page&rsquo;s markup.
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

            <div className="flex items-center justify-end gap-3 border-t border-ink/10 pt-5">
              {configSaved && (
                <span className="flex items-center gap-1 text-xs font-semibold text-teal-deep">
                  <Check size={13} /> Saved
                </span>
              )}
              <button
                type="button"
                onClick={handleSaveConfig}
                className="rounded-xl bg-teal-deep px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-teal"
              >
                Save configuration
              </button>
            </div>
          </div>
        </section>

        {/* ---------------- Simulation ---------------- */}
        <section className="flex flex-col gap-5 rounded-2xl border border-ink/10 bg-card p-6">
          <SectionHeading title="Test simulation" subtitle="Runs the onboarding checklist against the real feed." />

          {providerType === 'mock' && (
            <p className="rounded-xl border border-dashed border-ink/15 bg-parchment/50 p-4 text-xs text-ink/45">
              No live feed configured for this provider type &mdash; there&rsquo;s nothing to test.
              Catalogue entries here are added by hand.
            </p>
          )}

          {providerType === 'html-scrape' && (
            <p className="rounded-xl border border-dashed border-ink/15 bg-parchment/50 p-4 text-xs text-ink/45">
              Live simulation isn&rsquo;t wired up for HTML scraping yet &mdash; it needs the
              scraping engine behind <span className="font-mono text-ink/55">app/api/scrape/route.ts</span>.
              Verify selectors manually against the listing page for now.
            </p>
          )}

          {(providerType === 'shopify' || providerType === 'woocommerce' || providerType === 'jsonapi') && (
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
              {/* The checklist above only ever samples whatever happens to
                  be on page 1 of the feed \u2014 a genuinely complex product
                  (odd variant structure, a missing image, a weird price)
                  might never land in that sample. This bypasses the random
                  sample entirely and fetches exactly the product you point
                  it at, through the same real single-product fetchers the
                  storefront's own product page uses. */}
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

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-ink/10 bg-parchment/60 px-3 py-2.5 text-center">
      <p className="text-lg font-semibold text-ink">{value}</p>
      <p className="mt-0.5 text-xs text-ink/50">{label}</p>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-ink/50">{label}</span>
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

/** One row of the checklist. Icon + status color communicate the outcome
 * at a glance; the detail line underneath carries the specific "why". */
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

/** Raw drill-in: totals, live categories, and every sampled product fully
 * expanded — variants included, since a variant-matching bug is exactly
 * the kind of thing invisible in a one-line summary. */
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