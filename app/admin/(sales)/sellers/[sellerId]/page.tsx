// app/admin/(sales)/sellers/[sellerId]/page.tsx
'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
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
import Image from 'next/image'

import { getSeller, STATUS_LABEL, STATUS_STYLE, EXTRACTOR_TYPE_LABEL, type SellerStatus } from '@/data/sellers/data'
import { useLiveProductCount } from '@/hooks/useLiveProductCount'
import type { StoreProviderType } from '@/lib/store-config'
import {
  panelClass,
  groupClass,
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
// /admin/sellers/[sellerId] — Sales & Purchase Executive
//
// One page, two modes, instead of a separate /sellers/new route:
//   sellerId === 'new'   -> ADD mode: blank profile, platform slug is
//                           editable, store-URL auto-detect runs, the
//                           bottom of the page is a single "Add seller" bar.
//   sellerId === <slug>  -> EDIT mode: profile/method preloaded from
//                           getSeller(), platform slug is fixed, status +
//                           deactivate are available, Profile and Method
//                           each save independently.
// They used to be two files that had drifted apart once already (the new
// page still had the old provider cards after the detail page moved to the
// compact chip picker) — one file removes that failure mode entirely, since
// the Method/Simulation UI literally cannot differ between the two modes
// now. Everything specific to a mode is called out below with an `isNew`
// check rather than duplicated.
//
// Simulation column behaves identically either way: it only ever needs
// providerType + baseUrl + field mappings, all of which exist in both
// modes, so it was never actually coupled to whether the seller exists yet.
// ---------------------------------------------------------------------------

export default function SellerFormPage() {
  const router = useRouter()
  const params = useParams<{ sellerId: string }>()
  const isNew = params.sellerId === 'new'
  const seller = isNew ? undefined : getSeller(params.sellerId)

  // Live product-count stats in the header only make sense for a seller
  // that already exists with a real feed — never fetched in ADD mode.
  const isLiveFeedStats = !isNew && !!seller && seller.providerConfig.type !== 'mock'
  const live = useLiveProductCount(seller?.platform ?? '', isLiveFeedStats)

  // ---- Profile state ----
  const slugify = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')

  const [form, setForm] = useState({
    storeName: seller?.store.name ?? '',
    platform: seller?.platform ?? '',
    platformTouched: false,
    storeUrl: seller?.store.url ?? '',
    storeUrlTouched: false,
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

  const onStoreNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const storeName = e.target.value
    setForm((prev) => ({
      ...prev,
      storeName,
      platform: isNew && !prev.platformTouched ? slugify(storeName) : prev.platform,
    }))
  }

  const onPlatformChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, platform: slugify(e.target.value), platformTouched: true }))

  // ADD mode only: store URL mirrors into the Method base URL until the
  // admin edits that field directly — same-domain feed is the common case.
  const onStoreUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const storeUrl = e.target.value
    setForm((prev) => ({ ...prev, storeUrl, storeUrlTouched: true }))
    if (isNew && !baseUrlTouched) setBaseUrl(storeUrl)
  }

  const canSubmit = form.storeName.trim().length > 0 && form.platform.length > 0 && form.contactEmail.trim().length > 0

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
  const [baseUrl, setBaseUrl] = useState(cfg && cfg.type !== 'mock' ? cfg.baseUrl : '')
  const [baseUrlTouched, setBaseUrlTouched] = useState(!isNew)
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

  const onProviderTypeChange = (value: StoreProviderType) => {
    setProviderType(value)
    setManualInput('')
    setManualResult(null)
    setCheckStates({})
    setTestResult(null)
    setActiveCheckIndex(0)
    if (isNew && value !== 'mock' && !baseUrlTouched && form.storeUrl) {
      setBaseUrl(form.storeUrl)
    }
  }

  const onBaseUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setBaseUrl(value)
    setBaseUrlTouched(true)
    if (isNew && !form.storeUrlTouched) setForm((prev) => ({ ...prev, storeUrl: value }))
  }

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

  // ---- Auto-detect from store URL (ADD mode only) ----
  // Fires when the admin leaves the Store URL field. Hits
  // /api/admin/sellers/detect-store, which works out Shopify vs
  // WooCommerce vs neither, then sets extraction method, base URL,
  // currency, and store name for them. Detected values only fill fields
  // that are still empty; the provider chips stay fully clickable in case
  // the guess needs correcting.
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
    if (isNew && form.storeUrl.trim()) runAutoDetect(form.storeUrl.trim())
  }

  // ---- Simulation state ----
  const [checkStates, setCheckStates] = useState<Record<string, CheckOutcome>>({})
  const [simRunning, setSimRunning] = useState(false)
  const [testResult, setTestResult] = useState<TestExtractorResult | null>(null)
  const [showRaw, setShowRaw] = useState(false)
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
    if (isNew && result.ok && !currency && result.currencyDetected && result.sampleProducts?.[0]?.currency) {
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
  const isLiveProvider = providerType === 'shopify' || providerType === 'woocommerce' || providerType === 'jsonapi'
  const untested = isNew && isLiveProvider && !simHasRun

  // ---- ADD mode submit ----
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

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

  // ---- Not found (EDIT mode, bad slug) ----
  if (!isNew && !seller) {
    return (
      <div className="min-h-screen bg-parchment font-body text-ink">
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
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-parchment font-body text-ink">
      <div className="mx-auto max-w-[1560px] px-6 pb-24 pt-10 lg:px-10">
        <button
          type="button"
          onClick={() => router.push('/admin/sellers')}
          className="flex items-center gap-1.5 text-sm font-semibold text-ink/50 transition-colors hover:text-ink"
        >
          <ArrowLeft size={14} />
          Sellers
        </button>

        {/* ---------------- Header ---------------- */}
        {isNew ? (
          <div className="mt-4 flex items-start gap-4">
            <div className="grid h-14 w-14 flex-none place-items-center rounded-2xl border border-ink/10 bg-card text-teal-deep shadow-[0_1px_2px_rgba(32,36,43,0.04),0_16px_40px_-24px_rgba(14,140,156,0.4)]">
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
        ) : (
          <>
            <div className={`mt-4 flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between ${panelClass}`}>
              <div className="flex items-center gap-4">
                <Image
                  src={seller!.store.logo}
                  alt=""
                  width={48}
                  height={48}
                  className="h-12 w-12 flex-none rounded-full border border-ink/10 object-cover"
                />
                <div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h1 className="font-display text-3xl leading-tight text-ink">{seller!.store.name}</h1>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[form.status]}`}>
                      {STATUS_LABEL[form.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-ink/50">
                    {EXTRACTOR_TYPE_LABEL[seller!.providerConfig.type]}
                    {isLiveFeedStats && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-semibold text-gold-deep ring-1 ring-inset ring-gold/30">
                        <span className="h-1.5 w-1.5 rounded-full bg-gold-deep" />
                        Live feed
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="grid flex-none grid-cols-3 gap-3 sm:min-w-[320px]">
                <Stat
                  label={isLiveFeedStats ? 'Products (live)' : 'Products'}
                  value={
                    !isLiveFeedStats
                      ? seller!.store.itemCount ?? 0
                      : live.loading
                      ? '\u2026'
                      : live.error
                      ? seller!.store.itemCount ?? 0
                      : live.count ?? 0
                  }
                />
                <Stat label="Orders" value={seller!.admin.ordersReceived} />
                <Stat label="Pending" value={seller!.admin.ordersPending} />
              </div>
            </div>

            {isLiveFeedStats && live.error && (
              <p className="mt-2 text-xs text-red-600/70">
                Couldn&rsquo;t reach the live feed just now ({live.error}) &mdash; showing the last saved count instead.{' '}
                <button type="button" onClick={live.refresh} className="font-semibold underline">
                  Retry
                </button>
              </p>
            )}
          </>
        )}

        {submitted ? (
          <div className={`mt-6 flex items-center gap-2 p-4 text-sm font-semibold text-teal-deep ${groupClass} border-teal-deep/25`}>
            <Check size={16} />
            Seller added (demo \u2014 not yet saved to a backend). Returning to the list...
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1.25fr] xl:items-start">
            {/* ---------------- Profile & Method ---------------- */}
            <section className={`flex flex-col gap-8 p-6 ${panelClass}`}>
              {/* -- Profile -- */}
              <div className="flex flex-col gap-5">
                <SectionHeading
                  title="Profile"
                  subtitle={isNew ? 'Who this seller is and how to reach them.' : 'Store details, contact, and account status.'}
                />

                <Field label="Store name" required={isNew}>
                  <input
                    type="text"
                    value={form.storeName}
                    onChange={isNew ? onStoreNameChange : set('storeName')}
                    placeholder={isNew ? 'e.g. Chennai Silk House' : undefined}
                    className={inputClass}
                  />
                </Field>

                {isNew && (
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
                )}

                {!isNew && (
                  <Field label="Status">
                    <select value={form.status} onChange={set('status')} className={inputClass}>
                      <option value="active">{STATUS_LABEL.active}</option>
                      <option value="pending_review">{STATUS_LABEL.pending_review}</option>
                      <option value="inactive">{STATUS_LABEL.inactive}</option>
                    </select>
                  </Field>
                )}

                <Field label="Store URL">
                  <input
                    type="url"
                    value={form.storeUrl}
                    onChange={isNew ? onStoreUrlChange : set('storeUrl')}
                    onBlur={isNew ? onStoreUrlBlur : undefined}
                    placeholder={isNew ? 'https://' : undefined}
                    className={inputClass}
                  />
                  {isNew && (
                    <p className="mt-1 text-xs text-ink/40">
                      We&rsquo;ll check this automatically for a Shopify or WooCommerce feed once you
                      move to the next field.
                    </p>
                  )}
                </Field>

                <Field label="Contact email" required={isNew}>
                  <input type="email" value={form.contactEmail} onChange={set('contactEmail')} placeholder={isNew ? 'name@store.com' : undefined} className={inputClass} />
                </Field>

                <Field label="Contact name">
                  <input type="text" value={form.contactName} onChange={set('contactName')} placeholder={isNew ? 'Full name' : undefined} className={inputClass} />
                </Field>

                <Field label="Contact phone">
                  <input type="tel" value={form.contactPhone} onChange={set('contactPhone')} placeholder={isNew ? '+91 ...' : undefined} className={inputClass} />
                </Field>

                <Field label="Notes">
                  <textarea
                    value={form.notes}
                    onChange={set('notes')}
                    rows={3}
                    placeholder={isNew ? "Onboarding context, feed reliability, anything the next person should know..." : undefined}
                    className={inputClass}
                  />
                </Field>

                {/* EDIT mode: this section saves independently. ADD mode:
                    profile fields are part of the single bottom "Add seller" submit. */}
                {!isNew && (
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
                          className="rounded-xl bg-teal-deep px-4 py-2 text-sm font-semibold text-parchment shadow-[0_10px_28px_-10px_rgba(11,114,128,0.55)] transition-all hover:bg-teal active:scale-[0.98]"
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
                )}
              </div>

              {/* -- Method -- */}
              <div className={`flex flex-col gap-5 ${isNew ? '' : 'border-t border-ink/10 pt-8'}`}>
                <SectionHeading title={isNew ? 'Catalogue feed' : 'Extraction method'} subtitle="How this seller's products get pulled in." />

                {isNew && detection.status === 'idle' && (
                  <p className={`p-3.5 text-xs text-ink/45 border-dashed ${groupClass}`}>
                    Add a Store URL above and we&rsquo;ll check it automatically \u2014 no need to know
                    which platform it runs on.
                  </p>
                )}

                {isNew && detection.status === 'checking' && (
                  <p className={`flex items-center gap-2 p-3.5 text-xs font-semibold text-indigo border-indigo/20 bg-indigo/[0.05]`}>
                    <Loader2 size={14} className="animate-spin" />
                    Checking whether that store runs on Shopify or WooCommerce\u2026
                  </p>
                )}

                {isNew && detection.status === 'error' && (
                  <div className="rounded-xl border border-red-600/20 bg-red-600/[0.05] p-3.5">
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

                {isNew && detection.status === 'done' && (detection.type === 'shopify' || detection.type === 'woocommerce') && (
                  <div className="rounded-xl border border-teal-deep/25 bg-teal-deep/[0.06] p-3.5">
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

                {isNew && detection.status === 'done' && detection.type === 'none' && (
                  <div className={`p-3.5 border-dashed ${groupClass}`}>
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
                  <div className={`flex flex-col gap-3 p-4 ${groupClass}`}>
                    <p className="text-xs font-semibold text-ink/50">
                      JSON field mapping \u2014 confirm each against a real response before {isNew ? 'testing' : 'saving'}.
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
                  <div className={`flex flex-col gap-3 p-4 ${groupClass}`}>
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

                {!isNew && (
                  <div className="flex items-center justify-end gap-3 border-t border-ink/10 pt-5">
                    {configSaved && (
                      <span className="flex items-center gap-1 text-xs font-semibold text-teal-deep">
                        <Check size={13} /> Saved
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={handleSaveConfig}
                      className="rounded-xl bg-teal-deep px-4 py-2 text-sm font-semibold text-parchment shadow-[0_10px_28px_-10px_rgba(11,114,128,0.55)] transition-all hover:bg-teal active:scale-[0.98]"
                    >
                      Save configuration
                    </button>
                  </div>
                )}
              </div>
            </section>

            {/* ---------------- Simulation ---------------- */}
            <section className={`flex flex-col gap-5 p-6 ${panelClass}`}>
              <SectionHeading title="Test simulation" subtitle="Runs the onboarding checklist against the real feed." />

              {providerType === 'mock' && (
                <p className={`p-4 text-xs text-ink/45 border-dashed ${groupClass}`}>
                  No live feed configured for this provider type \u2014 there&rsquo;s nothing to test.
                  Catalogue entries {isNew ? 'will be added' : 'here are added'} by hand.
                </p>
              )}

              {providerType === 'html-scrape' && (
                <p className={`p-4 text-xs text-ink/45 border-dashed ${groupClass}`}>
                  Live simulation isn&rsquo;t wired up for HTML scraping yet \u2014 it needs the
                  scraping engine behind <span className="font-mono text-ink/55">app/api/scrape/route.ts</span>.
                  Verify selectors manually against the listing page for now.
                </p>
              )}

              {isLiveProvider && (
                <>
                  <div className={`p-4 ${groupClass}`}>
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
                  <div className={`p-4 ${groupClass}`}>
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
                  {simHasRun && (
                    <div className={`p-4 ${groupClass}`}>
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
        )}

        {/* ---------------- ADD mode: single bottom submit ---------------- */}
        {isNew && !submitted && (
          <div className={`mt-6 flex flex-col items-end gap-2 p-5 ${panelClass}`}>
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
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-ink/10 bg-parchment/50 px-3 py-2.5 text-center">
      <p className="text-lg font-semibold text-ink">{value}</p>
      <p className="mt-0.5 text-xs text-ink/50">{label}</p>
    </div>
  )
}