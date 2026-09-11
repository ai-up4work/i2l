// app/admin/(sales)/sellers/[sellerId]/page.tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  ExternalLink,
  FileCode2,
  ImagePlus,
  Loader2,
  Package,
  Pencil,
  Search,
  UserPlus,
  X,
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
  PROVIDER_LOGO,
  SectionHeading,
  Field,
  SelectorField,
  CHECKS,
  CheckRow,
  DEFAULT_JSON_FIELDS,
  DEFAULT_HTML_SELECTORS,
  type JsonFieldsState,
  type HtmlSelectorsState,
  type CheckStatus,
  type CheckOutcome,
  type TestExtractorResult,
  type TestExtractorProductResult,
} from '@/components/admin/seller/shared'
import { ProductCard, ProductCardGrid, type SampleProduct } from '@/components/admin/seller/ProductCard'

// ---------------------------------------------------------------------------
// /admin/sellers/[sellerId] — Sales & Purchase Executive
//
// sellerId === 'new'  -> ADD mode: a 4-step wizard (Profile -> Method ->
//                        Test & verify -> Review) with one Continue/Back
//                        pair driving the whole thing, ending in a single
//                        "Add seller" confirm.
// sellerId === <slug> -> EDIT mode: everything loads as a read-only summary.
//                        Profile and Method are independent cards, each with
//                        its own "Edit" affordance that swaps just that card
//                        into a form; Cancel reverts with no diff. The Test &
//                        verify panel is always live underneath — running a
//                        test never mutates saved config, so it isn't gated
//                        behind either card's edit state, and it flags
//                        itself stale the moment baseUrl / provider /
//                        field-mapping changes without a re-run.
//
// The wizard and the view/edit cards share the exact same underlying state
// and handlers — only the JSX shell around them differs by mode.
//
// Currency auto-detection (ADD mode, Method step only): as soon as a
// live-feed provider (Shopify/WooCommerce) and a base URL are both in
// place — whether that base URL arrived via the Profile step's store
// auto-detect, or the admin typed/picked things directly on this step —
// this page calls /api/admin/sellers/detect-currency, which reads the
// REAL currency off that store's live cart endpoint. It only ever
// overwrites the Currency field if the admin hasn't typed into it
// themselves (see currencyTouched) — a manual entry always wins.
// ---------------------------------------------------------------------------

const WIZARD_STEPS = ['Profile', 'Method', 'Test & verify', 'Review'] as const

export default function SellerFormPage() {
  const router = useRouter()
  const params = useParams<{ sellerId: string }>()
  const isNew = params.sellerId === 'new'
  const seller = isNew ? undefined : getSeller(params.sellerId)

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

  // ---- Store logo (ADD mode only \u2014 EDIT mode already has a saved
  // seller.store.logo rendered in the header). Stored as a data URL for
  // this demo; a real backend would want a proper upload endpoint
  // returning a hosted URL instead of inlining base64 into the payload.
  const MAX_LOGO_BYTES = 2 * 1024 * 1024
  const [storeLogo, setStoreLogo] = useState<string | null>(null)
  const [logoError, setLogoError] = useState<string | null>(null)

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // reset so re-picking the same file still fires onChange
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setLogoError('Please choose an image file.')
      return
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError('That image is too large \u2014 please choose one under 2MB.')
      return
    }
    setLogoError(null)
    const reader = new FileReader()
    reader.onload = () => setStoreLogo(typeof reader.result === 'string' ? reader.result : null)
    reader.onerror = () => setLogoError("Couldn't read that file \u2014 try a different image.")
    reader.readAsDataURL(file)
  }

  const handleRemoveLogo = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setStoreLogo(null)
    setLogoError(null)
  }

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

  const onStoreUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const storeUrl = e.target.value
    setForm((prev) => ({ ...prev, storeUrl, storeUrlTouched: true }))
    if (isNew && !baseUrlTouched) setBaseUrl(storeUrl)
  }

  const profileValid =
    form.storeName.trim().length > 0 && form.platform.length > 0 && form.contactEmail.trim().length > 0
  const canSubmit = profileValid

  const handleSaveProfile = () => {
    // TODO(wire-up): two PATCHes once the APIs exist —
    //   PATCH /api/admin/stores/[platform]      { name: form.storeName, url: form.storeUrl }
    //   PATCH /api/admin/sellers/[platform]/meta { contactName, contactEmail, contactPhone, notes, status }
    setProfileSaved(true)
    setEditingProfile(false)
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

  // Currency auto-detection state. `currencyTouched` starts true in EDIT
  // mode (there's already a saved value; typing to CHANGE the provider
  // config shouldn't silently clobber it) and false in ADD mode, where an
  // empty field is exactly what auto-detection is for. Any manual edit to
  // the field sets this true for the rest of the session, same pattern as
  // baseUrlTouched above.
  const [currencyTouched, setCurrencyTouched] = useState(!isNew)
  const [detectingCurrency, setDetectingCurrency] = useState(false)
  const [currencyDetected, setCurrencyDetected] = useState(false)
  const [currencyDetectError, setCurrencyDetectError] = useState<string | null>(null)

  const runDetectCurrency = async (url: string, type: 'shopify' | 'woocommerce') => {
    if (!url.trim() || currencyTouched) return
    setDetectingCurrency(true)
    setCurrencyDetectError(null)
    try {
      const res = await fetch('/api/admin/sellers/detect-currency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerType: type, baseUrl: url }),
      })
      const data = (await res.json()) as {
        ok: boolean
        error?: string
        currency?: string | null
        currencyDetected?: boolean
      }
      if (!data.ok) {
        setCurrencyDetectError(data.error ?? "Couldn't detect this store's currency.")
        return
      }
      if (data.currencyDetected && data.currency) {
        setCurrency(data.currency)
        setCurrencyDetected(true)
      }
    } catch (e) {
      setCurrencyDetectError(e instanceof Error ? e.message : 'Request failed.')
    } finally {
      setDetectingCurrency(false)
    }
  }

  const onCurrencyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrency(e.target.value)
    setCurrencyTouched(true)
    setCurrencyDetected(false)
    setCurrencyDetectError(null)
  }

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

  // Tracks whether the config has changed since the last simulation run, so
  // the Test panel can flag itself stale instead of silently showing
  // results for a config that no longer matches what's on screen.
  const [lastTestedSignature, setLastTestedSignature] = useState<string | null>(null)
  const currentSignature = JSON.stringify({ providerType, baseUrl, jsonFields, htmlSelectors, listingUrl })
  const resultsStale = lastTestedSignature !== null && lastTestedSignature !== currentSignature

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
    setLastTestedSignature(null)
    setCurrencyDetectError(null)

    let urlForCurrency = baseUrl
    if (isNew && value !== 'mock' && !baseUrlTouched && form.storeUrl) {
      setBaseUrl(form.storeUrl)
      urlForCurrency = form.storeUrl
    }

    // Switching provider type changes which live currency source (if any)
    // applies, so re-check immediately whenever there's already a base URL
    // on screen — e.g. the admin picked Shopify first, base URL got
    // filled, then they realise it's actually WooCommerce and switch.
    if (isNew && (value === 'shopify' || value === 'woocommerce') && urlForCurrency.trim()) {
      runDetectCurrency(urlForCurrency.trim(), value)
    }
  }

  const onBaseUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setBaseUrl(value)
    setBaseUrlTouched(true)
    if (isNew && !form.storeUrlTouched) setForm((prev) => ({ ...prev, storeUrl: value }))
  }

  const onBaseUrlBlur = () => {
    if (isNew && (providerType === 'shopify' || providerType === 'woocommerce') && baseUrl.trim()) {
      runDetectCurrency(baseUrl.trim(), providerType)
    }
  }

  const handleSaveConfig = () => {
    // TODO(wire-up): PATCH /api/admin/sellers/[platform]/provider-config
    // with a payload shaped to the selected providerType:
    //   shopify/woocommerce -> { type, baseUrl, currency }
    //   jsonapi               -> { type, baseUrl, currency, ...jsonFields }
    //   html-scrape           -> { type, baseUrl, currency, listingUrl, selectors: htmlSelectors }
    //   mock                  -> { type: 'mock' }
    setConfigSaved(true)
    setEditingMethod(false)
    window.setTimeout(() => setConfigSaved(false), 2000)
  }

  // ---- Auto-detect from store URL (ADD mode only) ----
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
        // onProviderTypeChange above already tries a currency lookup, but
        // it only had the STALE baseUrl in scope (setBaseUrl(data.baseUrl)
        // hasn't committed yet when that call fires). Re-run it here
        // against the freshly detected URL so a manually-typed provider
        // switch and a detected one behave identically.
        runDetectCurrency(data.baseUrl || url, data.type)
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
  const [showRawJson, setShowRawJson] = useState(false)

  const [manualInput, setManualInput] = useState('')
  const [manualLoading, setManualLoading] = useState(false)
  const [manualResult, setManualResult] = useState<TestExtractorProductResult | null>(null)

  // Normalizes whatever the extractor API hands back into the full
  // SampleProduct shape ProductCard expects. The field-mapping UI already
  // canonicalizes on id/name/price/image/category/sizes/color, so this is
  // mostly a passthrough with a couple of common alternate-key fallbacks —
  // adjust here if the real API response uses different key names.
  const normalizeProduct = (raw: unknown): SampleProduct | null => {
    if (!raw || typeof raw !== 'object') return null
    const r = raw as Record<string, unknown>
    const id = r.id ?? r._id ?? r.productId
    const name = r.name ?? r.title
    const price = r.price ?? r.priceValue
    if (id == null || name == null || price == null) return null
    return {
      id: String(id),
      name: String(name),
      price: Number(price),
      currency: (r.currency as string) ?? currency ?? undefined,
      compareAtPrice: r.compareAtPrice != null ? Number(r.compareAtPrice) : undefined,
      image: (r.image as string) ?? (r.imageUrl as string) ?? undefined,
      url: (r.url as string) ?? (r.link as string) ?? undefined,
      category: (r.category as string) ?? (r.type as string) ?? undefined,
      sizes: (r.sizes as string[]) ?? undefined,
      colors: (r.colors as string[]) ?? (r.color ? [String(r.color)] : undefined),
      inStock: typeof r.inStock === 'boolean' ? r.inStock : undefined,
      stockCount: typeof r.stockCount === 'number' ? r.stockCount : undefined,
      description: (r.description as string) ?? undefined,
    }
  }

  const sampleProducts = useMemo(() => {
    if (!testResult?.ok || !testResult.sampleProducts) return []
    return testResult.sampleProducts.map(normalizeProduct).filter((p): p is SampleProduct => p !== null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testResult, currency])

  const manualProduct =
    manualResult?.ok && manualResult.product ? normalizeProduct(manualResult.product) : null

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
    setShowRawJson(false)
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
    setLastTestedSignature(currentSignature)
    if (isNew && result.ok && !currency && result.currencyDetected && result.sampleProducts?.[0]?.currency) {
      setCurrency(result.sampleProducts[0].currency)
      setCurrencyDetected(true)
    }

    for (let i = 0; i < CHECKS.length; i++) {
      const check = CHECKS[i]
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
  const isLiveProvider = providerType === 'shopify' || providerType === 'woocommerce' || providerType === 'jsonapi'
  const untested = isNew && isLiveProvider && !simHasRun

  // ---- ADD mode: wizard ----
  const [step, setStep] = useState(0)

  const methodValid =
    providerType === 'mock'
      ? true
      : providerType === 'jsonapi'
      ? !!baseUrl && !!jsonFields.listEndpoint && !!jsonFields.idField && !!jsonFields.nameField && !!jsonFields.priceField && !!jsonFields.imageField
      : !!baseUrl

  const stepValid = [profileValid, methodValid, true, canSubmit]

  const goNext = () => setStep((s) => Math.min(WIZARD_STEPS.length - 1, s + 1))
  const goBack = () => setStep((s) => Math.max(0, s - 1))

  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = () => {
    if (!canSubmit) return
    setSubmitting(true)
    // TODO(wire-up): POST to /api/admin/sellers with:
    //   profile: { storeName, platform, storeUrl, contactName, contactEmail, contactPhone, notes }
    //   logo: storeLogo \u2014 currently a data URL for this demo; a real
    //     backend should expose a proper upload endpoint (returning a
    //     hosted URL) and this should POST the file there instead of
    //     inlining base64 into the seller-creation payload.
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

  // ---- EDIT mode: per-card edit toggles ----
  const [editingProfile, setEditingProfile] = useState(false)
  const [editingMethod, setEditingMethod] = useState(false)

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

  // -------------------------------------------------------------------
  // Shared blocks reused by both the wizard steps (ADD) and the edit
  // cards (EDIT), so the two modes never drift the way the old separate
  // /new page and detail page did.
  // -------------------------------------------------------------------

  const profileFields = (
    <div className="flex flex-col gap-5">
      <Field label="Store name" required>
        <input
          type="text"
          value={form.storeName}
          onChange={isNew ? onStoreNameChange : set('storeName')}
          placeholder="e.g. Chennai Silk House"
          className={inputClass}
        />
      </Field>

      {isNew && (
        <Field label="Platform slug" required>
          <input type="text" value={form.platform} onChange={onPlatformChange} placeholder="chennai-silk-house" className={monoInputClass} />
          <p className="mt-1 text-xs text-ink/40">
            Used internally (feed config, storefront URL /stores/{form.platform || '...'}) \u2014 auto-filled from the
            store name, editable if needed.
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
          placeholder="https://"
          className={inputClass}
        />
        {isNew && (
          <p className="mt-1 text-xs text-ink/40">
            We&rsquo;ll check this automatically for a Shopify or WooCommerce feed once you move to the next field.
          </p>
        )}
      </Field>

      <Field label="Contact email" required>
        <input type="email" value={form.contactEmail} onChange={set('contactEmail')} placeholder="name@store.com" className={inputClass} />
      </Field>

      <Field label="Contact name">
        <input type="text" value={form.contactName} onChange={set('contactName')} placeholder="Full name" className={inputClass} />
      </Field>

      <Field label="Contact phone">
        <input type="tel" value={form.contactPhone} onChange={set('contactPhone')} placeholder="+91 ..." className={inputClass} />
      </Field>

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
  )

  const autoDetectPanel = isNew && (
    <>
      {detection.status === 'idle' && (
        <p className={`p-3.5 text-xs text-ink/45 border-dashed ${groupClass}`}>
          Add a Store URL in Profile and we&rsquo;ll check it automatically \u2014 no need to know which platform it
          runs on.
        </p>
      )}

      {detection.status === 'checking' && (
        <p className="flex items-center gap-2 rounded-xl border border-indigo/20 bg-indigo/[0.05] p-3.5 text-xs font-semibold text-indigo">
          <Loader2 size={14} className="animate-spin" />
          Checking whether that store runs on Shopify or WooCommerce\u2026
        </p>
      )}

      {detection.status === 'error' && (
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
          <p className="mt-2 text-xs text-ink/45">You can still pick how products get pulled in manually below.</p>
        </div>
      )}

      {detection.status === 'done' && (detection.type === 'shopify' || detection.type === 'woocommerce') && (
        <div className="flex items-start gap-3.5 rounded-xl border border-teal-deep/25 bg-teal-deep/[0.06] p-3.5">
          <DetectedProviderBadge src={PROVIDER_LOGO[detection.type]} />
          <div className="min-w-0 pt-0.5">
            <p className="text-xs font-semibold text-teal-deep">
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
        </div>
      )}

      {detection.status === 'done' && detection.type === 'none' && (
        <div className={`p-3.5 border-dashed ${groupClass}`}>
          <p className="text-xs font-semibold text-ink/60">We couldn&rsquo;t automatically detect Shopify or WooCommerce for that URL.</p>
          <p className="mt-1 text-xs text-ink/45">
            {detection.reason ?? 'This may be a custom-built store.'} Pick manually below \u2014 if it has its own
            JSON feed or you want to scrape its pages, choose that option; otherwise products can be added by hand.
          </p>
        </div>
      )}
    </>
  )

  const currencyIsAutoDetectable = isNew && (providerType === 'shopify' || providerType === 'woocommerce')

  const methodFields = (
    <div className="flex flex-col gap-5">
      {autoDetectPanel}

      <ProviderPicker value={providerType} onChange={onProviderTypeChange} />

      {providerType !== 'mock' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
          <label className="block">
            <span className="text-xs font-semibold text-ink/50">Store base URL</span>
            <input
              type="url"
              value={baseUrl}
              onChange={onBaseUrlChange}
              onBlur={onBaseUrlBlur}
              placeholder="https://"
              className={`mt-1.5 ${monoInputClass}`}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-ink/50">Currency</span>
            <div className="relative mt-1.5">
              <input
                type="text"
                value={currency}
                onChange={onCurrencyChange}
                placeholder="LKR"
                className={`${monoInputClass} ${detectingCurrency ? 'pr-8' : ''}`}
              />
              {detectingCurrency && (
                <Loader2
                  size={13}
                  className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-indigo"
                />
              )}
            </div>
            {currencyIsAutoDetectable && (
              <>
                {currencyDetected && !detectingCurrency && (
                  <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-teal-deep">
                    <Check size={11} />
                    Read live from the store
                  </p>
                )}
                {currencyDetectError && !detectingCurrency && !currencyDetected && (
                  <p className="mt-1 text-[11px] text-ink/40">Couldn&rsquo;t auto-detect a currency \u2014 enter it manually.</p>
                )}
              </>
            )}
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
          <p className="text-xs font-semibold text-ink/50">CSS selectors \u2014 point these at a real category/shop page&rsquo;s markup.</p>
          <SelectorField label="Listing page path" value={listingUrl} onChange={(e) => setListingUrl(e.target.value)} placeholder="/shop" />
          <SelectorField label="Product card" value={htmlSelectors.productCard} onChange={setHtmlSelector('productCard')} placeholder=".product-card" />
          <SelectorField label="Title" value={htmlSelectors.title} onChange={setHtmlSelector('title')} placeholder=".product-name" />
          <SelectorField label="Price" value={htmlSelectors.price} onChange={setHtmlSelector('price')} placeholder=".price-now" />
          <SelectorField label="Image" value={htmlSelectors.image} onChange={setHtmlSelector('image')} placeholder="img.gallery-thumb" />
          <SelectorField label="Link to product" value={htmlSelectors.link} onChange={setHtmlSelector('link')} placeholder="a.product-link" />
          <SelectorField label="Variants (optional)" value={htmlSelectors.variants ?? ''} onChange={setHtmlSelector('variants')} placeholder=".size-option" />
        </div>
      )}
    </div>
  )

  const testPanel = (
    <div className="flex flex-col gap-5">
      {providerType === 'mock' && (
        <div className={`flex flex-col items-center justify-center gap-3 p-10 text-center border-dashed ${groupClass}`}>
          <Package size={26} className="text-ink/20" strokeWidth={1.5} />
          <p className="max-w-xs text-xs leading-relaxed text-ink/45">
            No live feed configured for this provider type \u2014 there&rsquo;s nothing to test. Catalogue entries{' '}
            {isNew ? 'will be added' : 'here are added'} by hand.
          </p>
        </div>
      )}

      {providerType === 'html-scrape' && (
        <div className={`flex flex-col items-center justify-center gap-3 p-10 text-center border-dashed ${groupClass}`}>
          <FileCode2 size={26} className="text-ink/20" strokeWidth={1.5} />
          <p className="max-w-sm text-xs leading-relaxed text-ink/45">
            Live simulation isn&rsquo;t wired up for HTML scraping yet \u2014 it needs the scraping engine behind{' '}
            <span className="font-mono text-ink/55">app/api/scrape/route.ts</span>. Verify selectors manually against
            the listing page for now.
          </p>
        </div>
      )}

      {isLiveProvider && (
        <>
          <div className={`p-4 ${groupClass}`}>
            <p className="text-xs font-semibold text-ink/50">Target</p>
            <p className="mt-1 text-xs text-ink/45">
              {testTarget ? (
                <>
                  Will fetch <span className="font-mono text-ink/60">{testTarget}</span> for real, then walk through{' '}
                  {CHECKS.length} checks.
                </>
              ) : (
                'Enter a base URL in Method to enable testing.'
              )}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-3">
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

              {simHasRun && resultsStale && !simRunning && (
                <p className="flex items-center gap-1 text-xs font-semibold text-gold-deep">
                  Config changed since this ran \u2014 re-run to confirm.
                </p>
              )}
            </div>

            {baseUrl && (
              <a href={baseUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-teal-deep hover:underline">
                Open the real store listing
                <ExternalLink size={11} />
              </a>
            )}
          </div>

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
              (manualResult.ok && manualProduct ? (
                <div className="mt-4 max-w-sm">
                  <ProductCard product={manualProduct} highlight />
                </div>
              ) : (
                <div className="mt-3 rounded-lg border border-red-600/25 bg-red-600/5 px-3 py-2.5 text-sm">
                  <p className="font-semibold text-red-700">Couldn&rsquo;t fetch that product</p>
                  <p className="mt-1 text-xs text-red-700/70">{manualResult?.ok === false ? manualResult.error : 'Unknown error.'}</p>
                </div>
              ))}
          </div>

          {!simHasRun && (
            <div className={`flex flex-col items-center justify-center gap-3 p-10 text-center border-dashed ${groupClass}`}>
              <ClipboardCheck size={26} className="text-ink/20" strokeWidth={1.5} />
              <p className="max-w-sm text-xs leading-relaxed text-ink/45">
                {canRunSimulation
                  ? 'Run the checks above to see reachability, field mapping, variants, stock, images, categories, and response time for this feed.'
                  : 'Fill in the base URL (and field mapping, if this is a JSON feed) to unlock the checklist.'}
              </p>
            </div>
          )}

          {simHasRun && (
            <div className={`p-4 ${groupClass}`}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-ink/50">Checklist</p>
                {simRunning && (
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-indigo">
                    <Loader2 size={11} className="animate-spin" />
                    {CHECKS.filter((c) => checkStates[c.id]?.status === 'pending').length} left
                  </p>
                )}
              </div>

              {/* Full width now means every check can sit on screen at once
                  instead of paging through them one at a time — running
                  checks light up in place as they resolve, so the whole
                  pass is scannable without any nav. */}
              <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                {CHECKS.map((check) => {
                  const outcome = checkStates[check.id]
                  const isRunning = outcome?.status === 'running'
                  return (
                    <div
                      key={check.id}
                      className={`rounded-xl border p-3 transition-colors duration-300 ${
                        isRunning
                          ? 'border-indigo/40 bg-indigo/[0.05]'
                          : outcome?.status === 'fail'
                          ? 'border-red-600/20 bg-red-600/[0.03]'
                          : outcome?.status === 'pass'
                          ? 'border-teal-deep/20 bg-teal-deep/[0.03]'
                          : 'border-ink/10'
                      }`}
                    >
                      <CheckRow title={check.title} outcome={outcome} />
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {testResult?.ok && sampleProducts.length > 0 && (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold text-ink/50">Sample products pulled from the feed</p>
                <button
                  type="button"
                  onClick={() => setShowRawJson((v) => !v)}
                  className="flex items-center gap-1 text-xs font-semibold text-teal-deep hover:underline"
                >
                  {showRawJson ? 'Hide' : 'Show'} raw JSON
                  <ChevronDown size={12} className={`transition-transform ${showRawJson ? 'rotate-180' : ''}`} />
                </button>
              </div>
              <ProductCardGrid products={sampleProducts} />
              {showRawJson && (
                <pre className="mt-3 max-h-72 overflow-auto rounded-xl border border-ink/10 bg-ink/[0.03] p-3 font-mono text-[11px] leading-relaxed text-ink/60">
                  {JSON.stringify(testResult, null, 2)}
                </pre>
              )}
            </div>
          )}

          {testResult && !testResult.ok && !simRunning && (
            <div className="rounded-lg border border-red-600/25 bg-red-600/5 px-3 py-2.5 text-sm">
              <p className="font-semibold text-red-700">Request failed</p>
              <p className="mt-1 text-xs text-red-700/70">{testResult.error}</p>
            </div>
          )}
        </>
      )}
    </div>
  )

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
          <>
            <div className="mt-4 flex items-start gap-4">
              <div className="flex-none">
                <label
                  htmlFor="seller-logo-upload"
                  title={storeLogo ? 'Change logo' : "Add the store's logo"}
                  className="group relative grid h-14 w-14 cursor-pointer place-items-center overflow-hidden rounded-2xl border border-ink/10 bg-card text-teal-deep shadow-[0_1px_2px_rgba(32,36,43,0.04),0_16px_40px_-24px_rgba(14,140,156,0.4)] transition-transform active:scale-[0.96]"
                >
                  <input
                    id="seller-logo-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleLogoChange}
                    className="sr-only"
                  />
                  {storeLogo ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element -- data-URL preview, not a static asset */}
                      <img src={storeLogo} alt="" className="h-full w-full object-cover" />
                      <span className="absolute inset-0 flex items-center justify-center bg-ink/50 opacity-0 transition-opacity group-hover:opacity-100">
                        <Pencil size={16} className="text-white" />
                      </span>
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        title="Remove logo"
                        className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full border border-ink/10 bg-white text-ink/50 shadow-[0_1px_3px_rgba(32,36,43,0.15)] transition-colors hover:bg-red-600/10 hover:text-red-600"
                      >
                        <X size={11} />
                      </button>
                    </>
                  ) : (
                    <>
                      <UserPlus size={22} strokeWidth={1.75} className="transition-opacity group-hover:opacity-0" />
                      <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:bg-teal-deep/[0.06] group-hover:opacity-100">
                        <ImagePlus size={18} strokeWidth={1.75} />
                      </span>
                    </>
                  )}
                </label>
              </div>
              <div>
                <h1 className="font-display text-3xl text-ink">Add a seller</h1>
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/60">
                  Enter the store details, set up how products get pulled in, and test that feed against the real
                  store before adding the seller.
                </p>
                <p className="mt-1 text-xs text-ink/35">
                  {storeLogo ? 'Click the logo to change it.' : "Click the icon to add the store's logo (optional)."}
                </p>
                {logoError && <p className="mt-1 text-xs font-medium text-red-600">{logoError}</p>}
              </div>
            </div>

            {/* ---- Stepper ---- */}
            {!submitted && (
              <div className="mt-7 flex items-center gap-2">
                {WIZARD_STEPS.map((label, i) => (
                  <div key={label} className="flex flex-1 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => i < step && setStep(i)}
                      disabled={i > step}
                      className={`flex items-center gap-2 text-left text-xs font-semibold transition-colors ${
                        i === step ? 'text-ink' : i < step ? 'text-teal-deep' : 'text-ink/30'
                      }`}
                    >
                      <span
                        className={`grid h-6 w-6 flex-none place-items-center rounded-full border text-[11px] ${
                          i === step
                            ? 'border-indigo bg-indigo text-white'
                            : i < step
                            ? 'border-teal-deep/40 bg-teal-deep/10 text-teal-deep'
                            : 'border-ink/15 text-ink/30'
                        }`}
                      >
                        {i < step ? <Check size={12} /> : i + 1}
                      </span>
                      <span className="hidden sm:inline">{label}</span>
                    </button>
                    {i < WIZARD_STEPS.length - 1 && <span className={`h-px flex-1 ${i < step ? 'bg-teal-deep/40' : 'bg-ink/10'}`} />}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className={`mt-4 flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between ${panelClass}`}>
              <div className="flex items-center gap-4">
                <Image src={seller!.store.logo} alt="" width={48} height={48} className="h-12 w-12 flex-none rounded-full border border-ink/10 object-cover" />
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
                  value={!isLiveFeedStats ? seller!.store.itemCount ?? 0 : live.loading ? '\u2026' : live.error ? seller!.store.itemCount ?? 0 : live.count ?? 0}
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
        ) : isNew ? (
          // ------------------------------------------------------------ WIZARD
          <div className="mt-6 flex flex-col gap-6">
            <section className={`p-6 ${panelClass}`}>
              {step === 0 && (
                <>
                  <SectionHeading title="Profile" subtitle="Who this seller is and how to reach them." />
                  <div className="mt-5">{profileFields}</div>
                </>
              )}
              {step === 1 && (
                <>
                  <SectionHeading title="Catalogue feed" subtitle="How this seller's products get pulled in." />
                  <div className="mt-5">{methodFields}</div>
                </>
              )}
              {step === 2 && (
                <>
                  <SectionHeading title="Test & verify" subtitle="Runs the onboarding checklist against the real feed." />
                  <div className="mt-5">{testPanel}</div>
                </>
              )}
              {step === 3 && (
                <>
                  <SectionHeading title="Review" subtitle="Check everything over before adding this seller." />
                  <div className="mt-5 flex flex-col gap-4">
                    <ReviewRow label="Profile" onEdit={() => setStep(0)}>
                      <p className="text-sm font-semibold text-ink">{form.storeName || '\u2014'}</p>
                      <p className="text-xs text-ink/50">/stores/{form.platform || '\u2014'}</p>
                      <p className="mt-1 text-xs text-ink/50">{form.contactEmail || 'No contact email yet'}</p>
                      {form.storeUrl && <p className="mt-1 text-xs text-ink/40">{form.storeUrl}</p>}
                    </ReviewRow>

                    <ReviewRow label="Catalogue feed" onEdit={() => setStep(1)}>
                      <p className="text-sm font-semibold text-ink">{EXTRACTOR_TYPE_LABEL[providerType]}</p>
                      {providerType !== 'mock' && <p className="text-xs text-ink/50">{baseUrl || 'No base URL yet'}</p>}
                      {currency && <p className="text-xs text-ink/40">Currency: {currency}</p>}
                    </ReviewRow>

                    <ReviewRow label="Test results" onEdit={() => setStep(2)}>
                      {simHasRun ? (
                        <p className="text-xs font-semibold text-ink/50">
                          <span className="text-teal-deep">{summary.pass} passed</span>
                          {summary.fail > 0 && <span className="text-red-600"> &middot; {summary.fail} failed</span>}
                          {summary.skip > 0 && <span className="text-ink/40"> &middot; {summary.skip} skipped</span>}
                        </p>
                      ) : (
                        <p className="text-xs text-ink/45">Not tested yet.</p>
                      )}
                    </ReviewRow>

                    {untested && (
                      <p className="text-xs text-gold-deep">
                        This feed hasn&rsquo;t been tested yet \u2014 you can still add the seller, but it&rsquo;s worth
                        confirming the feed works first.
                      </p>
                    )}
                  </div>
                </>
              )}
            </section>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={step === 0 ? () => router.push('/admin/sellers') : goBack}
                className="rounded-xl border border-ink/15 px-4 py-2 text-sm font-semibold text-ink hover:bg-ink/5"
              >
                {step === 0 ? 'Cancel' : 'Back'}
              </button>

              {step < WIZARD_STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={goNext}
                  disabled={!stepValid[step]}
                  className="rounded-xl bg-teal-deep px-4 py-2.5 text-sm font-semibold text-parchment shadow-[0_10px_28px_-10px_rgba(11,114,128,0.55)] transition-all hover:bg-teal active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-ink/20 disabled:shadow-none disabled:active:scale-100"
                >
                  Continue
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSubmit || submitting}
                  className="rounded-xl bg-teal-deep px-4 py-2.5 text-sm font-semibold text-parchment shadow-[0_10px_28px_-10px_rgba(11,114,128,0.55)] transition-all hover:bg-teal active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-ink/20 disabled:shadow-none disabled:active:scale-100"
                >
                  {submitting ? 'Adding...' : 'Add seller'}
                </button>
              )}
            </div>
          </div>
        ) : (
          // ------------------------------------------------------------ EDIT MODE
          <div className="mt-6 flex flex-col gap-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
              {/* ---- Profile card ---- */}
              <section className={`flex flex-col gap-5 p-6 ${panelClass}`}>
                <div className="flex items-start justify-between gap-3">
                  <SectionHeading title="Profile" subtitle="Store details, contact, and account status." />
                  {!editingProfile && (
                    <button
                      type="button"
                      onClick={() => setEditingProfile(true)}
                      className="flex flex-none items-center gap-1.5 rounded-lg border border-ink/15 px-2.5 py-1.5 text-xs font-semibold text-ink/60 hover:bg-ink/5 hover:text-ink"
                    >
                      <Pencil size={12} />
                      Edit
                    </button>
                  )}
                </div>

                {editingProfile ? (
                  <>
                    {profileFields}
                    <div className="flex items-center justify-end gap-2 border-t border-ink/10 pt-5">
                      {profileSaved && (
                        <span className="mr-auto flex items-center gap-1 text-xs font-semibold text-teal-deep">
                          <Check size={13} /> Saved
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setEditingProfile(false)}
                        className="flex items-center gap-1.5 rounded-xl border border-ink/15 px-3.5 py-2 text-sm font-semibold text-ink hover:bg-ink/5"
                      >
                        <X size={13} />
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveProfile}
                        disabled={!profileValid}
                        className="rounded-xl bg-teal-deep px-4 py-2 text-sm font-semibold text-parchment shadow-[0_10px_28px_-10px_rgba(11,114,128,0.55)] transition-all hover:bg-teal active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-ink/20 disabled:shadow-none"
                      >
                        Save changes
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <dl className="flex flex-col gap-3.5 text-sm">
                      <SummaryRow term="Store name" value={form.storeName} />
                      <SummaryRow term="Store URL" value={form.storeUrl || '\u2014'} />
                      <SummaryRow term="Contact email" value={form.contactEmail} />
                      <SummaryRow term="Contact name" value={form.contactName || '\u2014'} />
                      <SummaryRow term="Contact phone" value={form.contactPhone || '\u2014'} />
                      <SummaryRow term="Notes" value={form.notes || '\u2014'} multiline />
                    </dl>
                    <div className="flex items-center justify-between gap-2 border-t border-ink/10 pt-5">
                      <button
                        type="button"
                        onClick={handleDeactivate}
                        disabled={form.status === 'inactive'}
                        className="rounded-xl border border-red-600/25 px-3.5 py-2 text-sm font-semibold text-red-700 transition-all hover:bg-red-600/5 disabled:cursor-not-allowed disabled:border-ink/10 disabled:text-ink/30"
                      >
                        Deactivate
                      </button>
                      <p className="text-xs text-ink/35">Only Manager and Super Admin can delete a seller outright.</p>
                    </div>
                  </>
                )}
              </section>

              {/* ---- Method card ---- */}
              <section className={`flex flex-col gap-5 p-6 ${panelClass}`}>
                <div className="flex items-start justify-between gap-3">
                  <SectionHeading title="Extraction method" subtitle="How this seller's products get pulled in." />
                  {!editingMethod && (
                    <button
                      type="button"
                      onClick={() => setEditingMethod(true)}
                      className="flex flex-none items-center gap-1.5 rounded-lg border border-ink/15 px-2.5 py-1.5 text-xs font-semibold text-ink/60 hover:bg-ink/5 hover:text-ink"
                    >
                      <Pencil size={12} />
                      Edit
                    </button>
                  )}
                </div>

                {editingMethod ? (
                  <>
                    {methodFields}
                    <div className="flex items-center justify-end gap-2 border-t border-ink/10 pt-5">
                      {configSaved && (
                        <span className="mr-auto flex items-center gap-1 text-xs font-semibold text-teal-deep">
                          <Check size={13} /> Saved
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setEditingMethod(false)}
                        className="flex items-center gap-1.5 rounded-xl border border-ink/15 px-3.5 py-2 text-sm font-semibold text-ink hover:bg-ink/5"
                      >
                        <X size={13} />
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveConfig}
                        className="rounded-xl bg-teal-deep px-4 py-2 text-sm font-semibold text-parchment shadow-[0_10px_28px_-10px_rgba(11,114,128,0.55)] transition-all hover:bg-teal active:scale-[0.98]"
                      >
                        Save configuration
                      </button>
                    </div>
                  </>
                ) : (
                  <dl className="flex flex-col gap-3.5 text-sm">
                    <SummaryRow term="Method" value={EXTRACTOR_TYPE_LABEL[providerType]} />
                    {providerType !== 'mock' && <SummaryRow term="Base URL" value={baseUrl || '\u2014'} mono />}
                    {currency && <SummaryRow term="Currency" value={currency} />}
                    {providerType === 'jsonapi' && <SummaryRow term="List endpoint" value={jsonFields.listEndpoint || '\u2014'} mono />}
                    {providerType === 'html-scrape' && <SummaryRow term="Listing page" value={listingUrl || '\u2014'} mono />}
                  </dl>
                )}
              </section>
            </div>

            {/* ---- Test & verify (always live, full width) ---- */}
            <section className={`flex flex-col gap-5 p-6 ${panelClass}`}>
              <SectionHeading title="Test & verify" subtitle="Runs the onboarding checklist against the real feed. Never affects saved config." />
              {testPanel}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * The logo reveal for a successful store-detection match. Mounts already
 * shrunk/rotated/transparent, then flips to its resting state one frame
 * later so the transition classes actually animate instead of snapping in
 * at t=0 \u2014 a plain requestAnimationFrame handoff rather than pulling in
 * an animation library for one moment. The checkmark badge is delayed
 * slightly behind the logo so it reads as "found it, then confirmed" in
 * two beats instead of one flat pop.
 */
function DetectedProviderBadge({ src }: { src: string }) {
  const [entered, setEntered] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true))
    const confirmTimer = window.setTimeout(() => setConfirmed(true), 260)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(confirmTimer)
    }
  }, [])

  return (
    <div className="relative flex-none">
      <span
        className={`grid h-11 w-11 place-items-center rounded-xl bg-white p-2 shadow-[0_6px_18px_-8px_rgba(11,114,128,0.5)] ring-1 ring-teal-deep/15 transition-all duration-500 ease-out ${
          entered ? 'rotate-0 scale-100 opacity-100' : '-rotate-12 scale-50 opacity-0'
        }`}
      >
        <Image src={src} alt="" width={26} height={26} className="h-full w-full object-contain" />
      </span>
      <span
        className={`absolute -bottom-1 -right-1 grid h-[18px] w-[18px] place-items-center rounded-full bg-teal-deep text-white ring-2 ring-white transition-all duration-300 ease-out ${
          confirmed ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
        }`}
      >
        <Check size={9} strokeWidth={3} />
      </span>
    </div>
  )
}

function ReviewRow({ label, onEdit, children }: { label: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className={`flex items-start justify-between gap-4 p-4 ${groupClass}`}>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/35">{label}</p>
        <div className="mt-1">{children}</div>
      </div>
      <button type="button" onClick={onEdit} className="flex flex-none items-center gap-1 text-xs font-semibold text-teal-deep hover:underline">
        <Pencil size={11} />
        Edit
      </button>
    </div>
  )
}

function SummaryRow({ term, value, mono = false, multiline = false }: { term: string; value: string; mono?: boolean; multiline?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-ink/5 pb-3 last:border-0 last:pb-0">
      <dt className="text-[11px] font-semibold text-ink/40">{term}</dt>
      <dd className={`text-ink ${mono ? 'font-mono text-xs' : 'text-sm'} ${multiline ? 'whitespace-pre-wrap leading-relaxed' : ''}`}>{value}</dd>
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