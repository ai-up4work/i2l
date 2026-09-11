// app/admin/%28sales%29/sellers/new/page.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Search,
  UserPlus,
} from 'lucide-react'

import { EXTRACTOR_TYPE_LABEL } from '@/data/sellers/data'
import type {
  StoreProviderType,
  JsonApiProviderConfig,
  HtmlScrapeProviderConfig,
} from '@/lib/store-config'
import {
  inputClass,
  monoInputClass,
  sleep,
  ProviderPicker,
  SectionHeading,
  Field,
  SelectorField,
  CHECKS,
  CheckRow,
  RawResultPanel,
  SampleProductRow,
  DEFAULT_JSON_FIELDS,
  DEFAULT_HTML_SELECTORS,
  type JsonFieldsState,
  type HtmlSelectorsState,
  type CheckStatus,
  type CheckOutcome,
  type TestExtractorResult,
  type TestExtractorProductResult,
} from '@/components/admin/shared'

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
// The provider picker, checklist, and result renderers are shared with
// /admin/sellers/[sellerId] via components/admin/shared.tsx — this page no
// longer keeps its own copy, so the two screens can't silently drift apart
// the way they had (this page was still rendering the old stacked provider
// cards while shared.tsx had already moved to the compact icon-chip picker).
// The page-level chrome (cards, header, buttons) matches the frosted/glass
// treatment used on /admin/sellers so the flow reads as one product.
//
// The checklist below renders as a one-at-a-time carousel (dots + prev/next)
// rather than a stacked list — with 8 checks, a stacked list on the right
// would run taller than the Method card on the left and the two panels
// would never line up. The carousel keeps the panel height fixed and
// auto-follows whichever check is currently running during a simulation.
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

const slugify = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

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
    setActiveCheckIndex(0)
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
  // empty, and the provider chips below stay fully clickable in case the
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
  // Which check the carousel is currently showing. Auto-follows the check
  // in progress while a simulation runs; once finished (or between runs)
  // the admin can browse freely with the dots / prev-next arrows.
  const [activeCheckIndex, setActiveCheckIndex] = useState(0)

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
    setActiveCheckIndex(0)
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
    if (result.ok && !currency && result.currencyDetected && result.sampleProducts?.[0]?.currency) {
      setCurrency(result.sampleProducts[0].currency)
    }

    for (let i = 0; i < CHECKS.length; i++) {
      const check = CHECKS[i]
      await sleep(280)
      setActiveCheckIndex(i)
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
  // gentle nudge next to the submit button — it doesn't block adding the
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
    <div className="relative min-h-screen overflow-hidden bg-parchment font-body text-ink">
      <div className="relative mx-auto max-w-[1560px] px-6 pb-24 pt-10 lg:px-10">
        <button
          type="button"
          onClick={() => router.push('/admin/sellers')}
          className="flex items-center gap-1.5 text-sm font-semibold text-ink/50 transition-colors hover:text-ink"
        >
          <ArrowLeft size={14} />
          Sellers
        </button>

        <div className="mt-4 flex items-start gap-4">
          <div className="grid h-14 w-14 flex-none place-items-center rounded-2xl border border-white/60 bg-white/40 text-teal-deep shadow-[0_8px_30px_-12px_rgba(14,140,156,0.35)] backdrop-blur-xl">
            <UserPlus size={22} strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="font-display text-3xl text-ink">Add a seller</h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/60">
              Enter the store details, set up how products get pulled in, and test that feed
              against the real store before adding the seller.
            </p>
          </div>
        </div>

        {submitted ? (
          <div className="mt-8 flex items-center gap-2 rounded-2xl border border-teal-deep/25 bg-teal-deep/10 px-4 py-3 text-sm font-semibold text-teal-deep backdrop-blur-xl">
            <Check size={16} />
            Seller added (demo \u2014 not yet saved to a backend). Returning to the list...
          </div>
        ) : (
          <>
            {/* ---------------- Store & contact ---------------- */}
            <section className="mt-6 rounded-2xl border border-white/60 bg-white/40 p-6 shadow-[0_20px_60px_-30px_rgba(32,36,43,0.25)] backdrop-blur-2xl">
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
              <section className="flex flex-col gap-5 rounded-2xl border border-white/60 bg-white/40 p-6 shadow-[0_20px_60px_-30px_rgba(32,36,43,0.25)] backdrop-blur-2xl">
                <SectionHeading title="Catalogue feed" subtitle="How this seller's products will get pulled in." />

                {detection.status === 'idle' && (
                  <p className="rounded-xl border border-dashed border-ink/15 bg-white/30 p-3.5 text-xs text-ink/45 backdrop-blur-xl">
                    Add a Store URL above and we&rsquo;ll check it automatically \u2014 no need to know
                    which platform it runs on.
                  </p>
                )}

                {detection.status === 'checking' && (
                  <p className="flex items-center gap-2 rounded-xl border border-indigo/20 bg-indigo/[0.05] p-3.5 text-xs font-semibold text-indigo backdrop-blur-xl">
                    <Loader2 size={14} className="animate-spin" />
                    Checking whether that store runs on Shopify or WooCommerce\u2026
                  </p>
                )}

                {detection.status === 'error' && (
                  <div className="rounded-xl border border-red-600/20 bg-red-600/[0.05] p-3.5 backdrop-blur-xl">
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
                  <div className="rounded-xl border border-teal-deep/25 bg-teal-deep/[0.06] p-3.5 backdrop-blur-xl">
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
                  <div className="rounded-xl border border-dashed border-ink/15 bg-white/30 p-3.5 backdrop-blur-xl">
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

                <ProviderPicker value={providerType} onChange={onProviderTypeChange} />

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
                  <div className="flex flex-col gap-3 rounded-xl border border-ink/10 bg-white/50 p-4 backdrop-blur-xl">
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
                  <div className="flex flex-col gap-3 rounded-xl border border-ink/10 bg-white/50 p-4 backdrop-blur-xl">
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
              <section className="flex flex-col gap-5 rounded-2xl border border-white/60 bg-white/40 p-6 shadow-[0_20px_60px_-30px_rgba(32,36,43,0.25)] backdrop-blur-2xl">
                <SectionHeading title="Test simulation" subtitle="Runs the onboarding checklist against the real feed \u2014 before the seller exists." />

                {providerType === 'mock' && (
                  <p className="rounded-xl border border-dashed border-ink/15 bg-white/30 p-4 text-xs text-ink/45 backdrop-blur-xl">
                    No live feed configured for this provider type \u2014 there&rsquo;s nothing to test.
                    Catalogue entries will be added by hand once this seller is created.
                  </p>
                )}

                {providerType === 'html-scrape' && (
                  <p className="rounded-xl border border-dashed border-ink/15 bg-white/30 p-4 text-xs text-ink/45 backdrop-blur-xl">
                    Live simulation isn&rsquo;t wired up for HTML scraping yet \u2014 it needs the
                    scraping engine behind <span className="font-mono text-ink/55">app/api/scrape/route.ts</span>.
                    Verify selectors manually against the listing page for now.
                  </p>
                )}

                {isLiveProvider && (
                  <>
                    <div className="rounded-xl border border-ink/10 bg-white/50 p-4 backdrop-blur-xl">
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
                          className="flex items-center justify-center gap-1.5 rounded-xl bg-indigo px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_28px_-10px_rgba(37,41,120,0.5)] transition-all hover:bg-indigo-deep active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-ink/20 disabled:shadow-none disabled:active:scale-100"
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
                    <div className="rounded-xl border border-ink/10 bg-white/50 p-4 backdrop-blur-xl">
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
                          className="flex flex-none items-center gap-1.5 rounded-xl bg-indigo px-3.5 py-2 text-sm font-semibold text-white shadow-[0_10px_28px_-10px_rgba(37,41,120,0.5)] transition-all hover:bg-indigo-deep active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-ink/20 disabled:shadow-none disabled:active:scale-100"
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

                    {/* ---- Checklist carousel ---- */}
                    {/* Renders one CHECKS entry at a time in a fixed-height
                        box instead of stacking all 8, so this panel's
                        height doesn't run away from the Method panel on
                        the left. Auto-follows the running check during a
                        simulation; browsable via dots/arrows once idle. */}
                    {simHasRun && (
                      <div className="rounded-xl border border-ink/10 bg-white/50 p-4 backdrop-blur-xl">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-ink/50">
                            Check {activeCheckIndex + 1} of {CHECKS.length}
                          </p>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setActiveCheckIndex((i) => Math.max(0, i - 1))}
                              disabled={activeCheckIndex === 0}
                              className="grid h-6 w-6 place-items-center rounded-lg text-ink/40 transition-colors hover:bg-ink/5 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                              aria-label="Previous check"
                            >
                              <ChevronLeft size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setActiveCheckIndex((i) => Math.min(CHECKS.length - 1, i + 1))}
                              disabled={activeCheckIndex === CHECKS.length - 1}
                              className="grid h-6 w-6 place-items-center rounded-lg text-ink/40 transition-colors hover:bg-ink/5 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                              aria-label="Next check"
                            >
                              <ChevronRight size={14} />
                            </button>
                          </div>
                        </div>

                        <div className="mt-3 min-h-[64px]">
                          {(() => {
                            const activeCheck = CHECKS[activeCheckIndex]
                            return (
                              <CheckRow
                                key={activeCheck.id}
                                title={activeCheck.title}
                                outcome={checkStates[activeCheck.id]}
                              />
                            )
                          })()}
                        </div>

                        <div className="mt-3 flex items-center justify-center gap-1.5">
                          {CHECKS.map((check, i) => {
                            const status = checkStates[check.id]?.status
                            const dotColor =
                              status === 'pass'
                                ? 'bg-teal-deep'
                                : status === 'fail'
                                ? 'bg-red-600'
                                : status === 'skip'
                                ? 'bg-ink/25'
                                : status === 'running'
                                ? 'bg-indigo animate-pulse'
                                : 'bg-ink/15'
                            return (
                              <button
                                key={check.id}
                                type="button"
                                onClick={() => setActiveCheckIndex(i)}
                                aria-label={`Go to ${check.title}`}
                                className={`h-1.5 rounded-full transition-all ${
                                  i === activeCheckIndex ? 'w-5 bg-indigo' : `w-1.5 ${dotColor}`
                                }`}
                              />
                            )
                          })}
                        </div>
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
            <div className="mt-6 flex flex-col items-end gap-2 rounded-2xl border border-white/60 bg-white/40 p-5 shadow-[0_20px_60px_-30px_rgba(32,36,43,0.25)] backdrop-blur-2xl">
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
                  className="rounded-xl bg-teal-deep px-4 py-2.5 text-sm font-semibold text-parchment shadow-[0_10px_28px_-10px_rgba(11,114,128,0.55)] transition-all hover:bg-teal active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-ink/20 disabled:shadow-none disabled:active:scale-100"
                >
                  {submitting ? 'Adding...' : 'Add seller'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}