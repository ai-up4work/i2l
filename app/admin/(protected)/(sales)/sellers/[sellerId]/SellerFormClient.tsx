// app/admin/(sales)/sellers/[sellerId]/SellerFormClient.tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  ExternalLink,
  Loader2,
  Package,
  Pencil,
  Search,
  UserPlus,
  X,
} from 'lucide-react'
import Image from 'next/image'

import { STATUS_LABEL, STATUS_STYLE, EXTRACTOR_TYPE_LABEL, type AdminSeller, type SellerStatus } from '@/data/sellers/data'
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
  DEFAULT_DETAIL_SELECTORS,
  type JsonFieldsState,
  type HtmlSelectorsState,
  type DetailSelectorsState,
  type CheckStatus,
  type CheckOutcome,
  type TestExtractorResult,
  type TestExtractorProductResult,
} from '@/components/admin/seller/shared'
import { ProductCard, ProductCardGrid, type SampleProduct } from '@/components/admin/seller/ProductCard'
import StoreBrandingEditor from '@/components/admin/seller/StoreBrandingEditor'
import { JsonApiSettings } from '@/components/admin/seller/JsonApiSettings'
import { cleanJsonApiFields, jsonApiFieldsFromConfig, jsonApiMissingRequired } from '@/lib/jsonapi-config'
import { hasCustomExtractor } from '@/lib/store-providers/sellers'
import { StoreOriginPicker } from '@/components/admin/StoreOriginPicker'
import { StoreCategoryPicker } from '@/components/admin/StoreCategoryPicker'
import { normalizeStoreCategories } from '@/lib/store-categories'
import { CategoryTilesPanel } from '@/components/admin/seller/CategoryTilesPanel'
import { categoryTilesOf, mergeCategoryTiles, type CategoryImageCandidate, type CategoryTile } from '@/lib/category-tiles'
import { STORE_ORIGIN_LABEL, type StoreOrigin } from '@/lib/store-origin'

// ---------------------------------------------------------------------------
// /admin/sellers/[sellerId] — Sales & Purchase Executive
//
// sellerId === 'new'  -> ADD mode: a 4-step wizard (Profile -> Method ->
//                        Test & verify -> Review) with one Continue/Back
//                        pair driving the whole thing, ending in a single
//                        "Finish" confirm.
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
// VERIFICATION MODEL (auto, not a hard gate):
// A seller is never blocked from being created just because its feed
// hasn't been confirmed working yet. Instead:
//   - The seller is created (as `pending_review`, or `active` for mock) the
//     moment Method is confirmed; reaching "Test & verify" then auto-fires
//     the simulation once, the same run the admin could trigger manually.
//   - A clean run promotes the seller to `active` via PATCH; otherwise it
//     stays `pending_review` — still created, just flagged as unverified.
//   - In EDIT mode, if a seller is sitting in `pending_review`, opening its
//     page auto-fires the same test once. If it now passes, the status is
//     silently promoted to `active`. If it still fails, nothing changes; the
//     admin fixes the Method card and saves, which retries the promotion.
//   - Mock sellers (nothing to fetch) are never auto-promoted from here; mock
//     goes `active` immediately since there's nothing to verify.
//
// Currency auto-detection (ADD mode, Method step only): as soon as a
// live-feed provider (Shopify/WooCommerce) and a base URL are both in
// place, this page calls /api/admin/sellers/detect-currency, which reads
// the REAL currency off that store's live cart endpoint. It only ever
// overwrites the Currency field if the admin hasn't typed into it
// themselves (see currencyTouched) — a manual entry always wins.
//
// Store branding (logo + cover): both images are edited through ONE control,
// <StoreBrandingEditor>, which sits at the top of the Profile fields in
// BOTH modes and previews them the way the storefront lays them out (cover
// banner, circular logo overlapping its corner).
//   - `storeLogo` is required in ADD mode, optional in EDIT mode.
//   - `storeCover` is always optional; a store without one shows the brand
//     gradient on its page.
//   - Both are downsized in the browser (see StoreBrandingEditor) so the
//     data URLs sent to the API stay small. A real backend should upload
//     them to storage and keep only the URL.
//   - `logoUrl` is always passed through `resolveLogoUrl` before sending —
//     sellers.logo_url is presumably NOT NULL. `coverUrl` is NOT resolved:
//     null means "no cover" (PATCH null = clear, undefined = leave alone).
//
// Collections panel (EDIT mode, inside the Method card): shows this
// seller's REAL, LIVE store collections/categories — fetched straight off
// their own feed via /api/admin/sellers/[platform]/collections, NOT any
// curated site-wide `collections` table. Two display-layer cleanups happen
// client-side (the API stays a faithful mirror of the store):
//   - De-duplication by name, keeping the higher count.
//   - Filtering out per-size storefront filters (see SIZE_COLLECTION_PATTERN).
// The list is capped at a fixed max-height with internal scroll.
//
// Shopify category mapping (Method card, Shopify provider only): lets the
// admin map the site's own category names onto THIS seller's actual
// Shopify collection handles, fetched live via
// /api/admin/sellers/detect-collections. Saved as
// providerConfig.collectionMap, which fetchShopifyProducts consults when a
// shopper filters by category.
// ---------------------------------------------------------------------------

const WIZARD_STEPS = ['Profile', 'Method', 'Test & verify', 'Review'] as const

// Deterministic placeholder avatar keyed off the store name, used any time
// we don't have a real logo URL to show or save. Keeps `<Image src>` (and
// the DB column) from ever seeing an empty string.
const FALLBACK_LOGO = (seed: string) =>
  `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(seed || 'Store')}`

const resolveLogoUrl = (raw: string | null | undefined, seed: string) =>
  raw && raw.trim() ? raw : FALLBACK_LOGO(seed)

interface SellerCollection {
  id: string
  name: string
  productCount: number
}

// Matches size-only collections some Shopify merchants create purely for
// storefront filter navigation (e.g. "XL / Bust Size 42") rather than
// genuine merchandising collections. Best-effort NAME match: Shopify's API
// has no field distinguishing the two. Extend if other stores use a
// different size-labelling convention.
const SIZE_COLLECTION_PATTERN = /^(XS|S|M|L|XL|XXL|2XL|3XL)\s*\/\s*.*Size/i

// One row of the site-category -> seller's-collection mapping. `handle` is
// the seller's real Shopify collection handle (or, for html-scrape, a
// path/URL on the source site); `category` is typed freely since the site's
// master category list isn't available to this component.
interface CategoryMappingRow {
  category: string
  handle: string
}

export default function SellerFormClient({
  seller,
  isNew,
}: {
  seller?: AdminSeller
  isNew: boolean
}) {
  const router = useRouter()

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
    storeOrigin: (seller?.store.origin ?? 'IN') as StoreOrigin,
    // Shopping categories (lib/store-categories.ts) — where shoppers find
    // this store on /categories and in the header's Shop menu.
    categories: normalizeStoreCategories(seller?.store.categories) ?? [],
  })
  const [profileSaved, setProfileSaved] = useState(false)

  // ---- Store branding (logo + cover). Seeded from the saved seller in
  // EDIT mode; empty in ADD mode until picked. `cover` isn't on the
  // AdminSeller type yet, so it's read through a cast — drop the cast once
  // `cover?: string | null` is added to AdminSeller['store'].
  const savedCover = (seller?.store as unknown as { cover?: string | null } | undefined)?.cover ?? null
  const [storeLogo, setStoreLogo] = useState<string | null>(seller?.store.logo || null)
  const [storeCover, setStoreCover] = useState<string | null>(savedCover)
  // ADD mode only: whether the admin has already tried to move past the
  // logo requirement without one, so we don't flash a "required" error
  // before they've had a chance to pick a file.
  const [logoRequiredTouched, setLogoRequiredTouched] = useState(false)

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
    setForm((prev) => ({ ...prev, storeUrl }))
    if (isNew && !baseUrlTouched) setBaseUrl(storeUrl)
  }

  const profileValid =
    form.storeName.trim().length > 0 && form.platform.length > 0 && form.contactEmail.trim().length > 0
  // Only enforced in ADD mode — a seller already saved without a logo
  // shouldn't suddenly block profile edits, but a NEW seller can't be
  // added until a store logo has been picked.
  const logoValid = !isNew || !!storeLogo
  const canSubmit = profileValid && logoValid

  const [savingProfile, setSavingProfile] = useState(false)
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null)

  const handleSaveProfile = async () => {
    if (!seller) return
    setSavingProfile(true)
    setProfileSaveError(null)
    try {
      const res = await fetch(`/api/admin/sellers/${seller.platform}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeName: form.storeName,
          storeUrl: form.storeUrl,
          contactName: form.contactName,
          contactEmail: form.contactEmail,
          contactPhone: form.contactPhone,
          storeOrigin: form.storeOrigin,
          categories: form.categories,
          notes: form.notes,
          // Always resolved so we never PATCH an empty logo_url over a
          // perfectly good saved one.
          logoUrl: resolveLogoUrl(storeLogo, form.storeName),
          // null = no cover (clears a saved one); the page falls back to
          // the brand gradient.
          coverUrl: storeCover,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Failed to save')
      setProfileSaved(true)
      setEditingProfile(false)
      window.setTimeout(() => setProfileSaved(false), 2000)
    } catch (err) {
      setProfileSaveError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSavingProfile(false)
    }
  }

  const [deactivating, setDeactivating] = useState(false)
  const [deactivateError, setDeactivateError] = useState<string | null>(null)

  const handleDeactivate = async () => {
    if (!seller) return
    setDeactivating(true)
    setDeactivateError(null)
    try {
      const res = await fetch(`/api/admin/sellers/${seller.platform}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'inactive' }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Failed to deactivate')
      setForm((prev) => ({ ...prev, status: 'inactive' as SellerStatus }))
    } catch (err) {
      setDeactivateError(err instanceof Error ? err.message : 'Failed to deactivate')
    } finally {
      setDeactivating(false)
    }
  }
  // Turns a deactivated seller back on.
  const [activating, setActivating] = useState(false)
  const handleActivate = async () => {
    if (!seller) return
    setActivating(true)
    setDeactivateError(null)
    try {
      const res = await fetch(`/api/admin/sellers/${seller.platform}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Failed to activate')
      setForm((prev) => ({ ...prev, status: 'active' as SellerStatus }))
    } catch (err) {
      setDeactivateError(err instanceof Error ? err.message : 'Failed to activate')
    } finally {
      setActivating(false)
    }
  }

  // ---- Seller portal login ----
  // Provisions a real Supabase auth user for this seller and links it via
  // sellers.owner_user_id (see app/api/admin/sellers/[platform]/create-login).
  // `hasLogin` starts from the server-fetched seller but is tracked in local
  // state too, so a successful creation flips the UI without a reload.
  const [loginEmail, setLoginEmail] = useState(seller?.admin.contactEmail ?? '')
  const [hasLogin, setHasLogin] = useState(seller?.admin.hasLogin ?? false)
  const [creatingLogin, setCreatingLogin] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  // Holds the one-time temp password just long enough to show/copy it —
  // the API never returns it again, so this is the only place it's visible.
  const [createdLogin, setCreatedLogin] = useState<{ email: string; tempPassword: string } | null>(null)

  // Seller forgot their password: issue a new temporary one for the same
  // account (create-login with { reset: true }).
  const [resettingLogin, setResettingLogin] = useState(false)
  const handleResetLogin = async () => {
    if (!seller) return
    if (!window.confirm('Give this seller a new temporary password? Their current password will stop working.')) return
    setResettingLogin(true)
    setLoginError(null)
    try {
      const res = await fetch(`/api/admin/sellers/${seller.platform}/create-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Failed to reset password')
      setCreatedLogin({ email: body.email, tempPassword: body.tempPassword })
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Failed to reset password')
    } finally {
      setResettingLogin(false)
    }
  }

  const handleCreateLogin = async () => {
    if (!seller || !loginEmail.trim()) return
    setCreatingLogin(true)
    setLoginError(null)
    try {
      const res = await fetch(`/api/admin/sellers/${seller.platform}/create-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail.trim() }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Failed to create login')
      setCreatedLogin({ email: body.email, tempPassword: body.tempPassword })
      setHasLogin(true)
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Failed to create login')
    } finally {
      setCreatingLogin(false)
    }
  }

  // ---- Method state ----
  const cfg = seller?.providerConfig
  const [providerType, setProviderType] = useState<StoreProviderType>(cfg?.type ?? 'mock')
  const [baseUrl, setBaseUrl] = useState(cfg && cfg.type !== 'mock' && cfg.type !== 'catalogue' ? cfg.baseUrl : '')
  const [baseUrlTouched, setBaseUrlTouched] = useState(!isNew)
  const [currency, setCurrency] = useState(cfg?.currency ?? '')

  // "Shop by category" images (lib/category-tiles.ts). Seeded from what's
  // saved; refreshed after a passing test (or on demand for extractor
  // stores, whose extractor lives in code). Saved with the provider config.
  const [categoryTiles, setCategoryTiles] = useState<CategoryTile[]>(() => categoryTilesOf(cfg))
  const [categoryCandidates, setCategoryCandidates] = useState<CategoryImageCandidate[] | null>(null)
  const [categoryImagesLoading, setCategoryImagesLoading] = useState(false)
  const [categoryImagesError, setCategoryImagesError] = useState<string | null>(null)
  const [categoryTilesSave, setCategoryTilesSave] = useState<'idle' | 'saving' | 'saved'>('idle')

  // EDIT mode only: save just the category images (merged server-side
  // into the saved provider config). ADD mode saves them on Finish.
  const saveCategoryTiles = async () => {
    if (!seller) return
    setCategoryTilesSave('saving')
    setCategoryImagesError(null)
    try {
      const res = await fetch(`/api/admin/sellers/${seller.platform}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryTiles }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Could not save the category images')
      setCategoryTilesSave('saved')
      window.setTimeout(() => setCategoryTilesSave('idle'), 2000)
    } catch (e) {
      setCategoryImagesError(e instanceof Error ? e.message : 'Could not save the category images')
      setCategoryTilesSave('idle')
    }
  }

  // Keyed off the LIVE `providerType` state, not `seller.providerConfig.type`
  // (the value the server component fetched on first load), so switching a
  // seller between mock and a real feed and saving turns the "Products
  // (live)" stat on/off immediately.
  //
  // anishka-creation is a deliberate exception: its saved provider_config
  // is 'mock', but it has a real hardcoded feed behind it that the
  // live-count route already knows to call by platform slug.
  const isLiveFeedStats = !isNew && !!seller && (providerType !== 'mock' || hasCustomExtractor(seller.platform))
  const live = useLiveProductCount(seller?.platform ?? '', isLiveFeedStats)

  // Currency auto-detection state. `currencyTouched` starts true in EDIT
  // mode (there's already a saved value) and false in ADD mode, where an
  // empty field is exactly what auto-detection is for.
  const [currencyTouched, setCurrencyTouched] = useState(!isNew)
  const [detectingCurrency, setDetectingCurrency] = useState(false)
  const [currencyDetected, setCurrencyDetected] = useState(false)
  const [currencyDetectError, setCurrencyDetectError] = useState<string | null>(null)

  // ---- Shopify collection list + category mapping (Shopify only) ----
  const [shopifyCollections, setShopifyCollections] = useState<{ handle: string; title: string }[]>([])
  const [collectionsFetching, setCollectionsFetching] = useState(false)
  const [collectionsFetchError, setCollectionsFetchError] = useState<string | null>(null)
  const [collectionsFetchedFor, setCollectionsFetchedFor] = useState<string | null>(null)

  // Seeded from the saved config in EDIT mode; empty rows in ADD mode.
  const [categoryMapping, setCategoryMapping] = useState<CategoryMappingRow[]>(() => {
    const existing = cfg?.type === 'shopify' ? (cfg as { collectionMap?: Record<string, string> }).collectionMap : undefined
    return existing ? Object.entries(existing).map(([category, handle]) => ({ category, handle })) : []
  })

  const fetchSellerCollections = async (url: string) => {
    if (!url.trim() || url === collectionsFetchedFor) return
    setCollectionsFetchedFor(url)
    setCollectionsFetching(true)
    setCollectionsFetchError(null)
    try {
      const res = await fetch('/api/admin/sellers/detect-collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: url }),
      })
      const data = (await res.json()) as { ok: boolean; error?: string; collections?: { handle: string; title: string }[] }
      if (!data.ok) {
        setCollectionsFetchError(data.error ?? "Couldn't fetch this store's collections.")
        return
      }
      setShopifyCollections(data.collections ?? [])
    } catch (e) {
      setCollectionsFetchError(e instanceof Error ? e.message : 'Request failed.')
    } finally {
      setCollectionsFetching(false)
    }
  }

  const addCategoryMappingRow = () => setCategoryMapping((prev) => [...prev, { category: '', handle: '' }])
  const removeCategoryMappingRow = (index: number) =>
    setCategoryMapping((prev) => prev.filter((_, i) => i !== index))
  const updateCategoryMappingRow = (index: number, patch: Partial<CategoryMappingRow>) =>
    setCategoryMapping((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))

  // Trigger the fetch whenever a Shopify base URL becomes available.
  useEffect(() => {
    if (providerType === 'shopify' && baseUrl.trim()) {
      fetchSellerCollections(baseUrl.trim())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerType, baseUrl])

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
    cfg?.type === 'jsonapi' ? jsonApiFieldsFromConfig(cfg) : DEFAULT_JSON_FIELDS
  )
  // What actually gets tested/saved — empty strings dropped, numbers coerced.
  const cleanedJsonFields = useMemo(() => cleanJsonApiFields(jsonFields), [jsonFields])
  const jsonMissing = jsonApiMissingRequired(jsonFields)

  const [htmlSelectors, setHtmlSelectors] = useState<HtmlSelectorsState>(
    cfg?.type === 'html-scrape' ? cfg.selectors : DEFAULT_HTML_SELECTORS
  )
  const [listingUrl, setListingUrl] = useState(cfg?.type === 'html-scrape' ? cfg.listingUrl : '')
  // Off by default — most html-scrape sellers are the classic one-page-
  // per-product case. Only turn this on for a listing whose OWN detail
  // page lists several purchasable items itself (see DEFAULT_DETAIL_SELECTORS).
  const [useDetailItems, setUseDetailItems] = useState(cfg?.type === 'html-scrape' && Boolean(cfg.detail))
  const [detailSelectors, setDetailSelectors] = useState<DetailSelectorsState>(
    cfg?.type === 'html-scrape' && cfg.detail ? cfg.detail : DEFAULT_DETAIL_SELECTORS
  )
  // Per-category listing pages (html-scrape's equivalent of Shopify's
  // collectionMap) — `handle` here holds a path/URL on the source site.
  const [htmlCategoryMap, setHtmlCategoryMap] = useState<CategoryMappingRow[]>(() => {
    const existing = cfg?.type === 'html-scrape' ? cfg.categoryMap : undefined
    return existing ? Object.entries(existing).map(([category, handle]) => ({ category, handle })) : []
  })
  const addHtmlCategoryRow = () => setHtmlCategoryMap((prev) => [...prev, { category: '', handle: '' }])
  const removeHtmlCategoryRow = (index: number) => setHtmlCategoryMap((prev) => prev.filter((_, i) => i !== index))
  const updateHtmlCategoryRow = (index: number, patch: Partial<CategoryMappingRow>) =>
    setHtmlCategoryMap((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  const htmlCategoryMapPayload =
    htmlCategoryMap.some((r) => r.category.trim() && r.handle.trim())
      ? Object.fromEntries(htmlCategoryMap.filter((r) => r.category.trim() && r.handle.trim()).map((r) => [r.category.trim(), r.handle.trim()]))
      : undefined
  const [configSaved, setConfigSaved] = useState(false)

  // Tracks whether the config has changed since the last simulation run, so
  // the Test panel can flag itself stale.
  const [lastTestedSignature, setLastTestedSignature] = useState<string | null>(null)
  const currentSignature = JSON.stringify({
    providerType,
    baseUrl,
    jsonFields,
    htmlSelectors,
    listingUrl,
    useDetailItems,
    detailSelectors,
    htmlCategoryMap,
  })
  const resultsStale = lastTestedSignature !== null && lastTestedSignature !== currentSignature

  const setHtmlSelector = (field: keyof HtmlSelectorsState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setHtmlSelectors((prev) => ({ ...prev, [field]: e.target.value }))

  const setDetailSelector = (field: keyof DetailSelectorsState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDetailSelectors((prev) => ({ ...prev, [field]: e.target.value }))

  const onProviderTypeChange = (value: StoreProviderType) => {
    setProviderType(value)
    setManualInput('')
    setManualResult(null)
    setCheckStates({})
    setTestResult(null)
    setLastTestedSignature(null)
    setLastRunPassed(null)
    setCurrencyDetectError(null)

    let urlForCurrency = baseUrl
    if (isNew && value !== 'mock' && !baseUrlTouched && form.storeUrl) {
      setBaseUrl(form.storeUrl)
      urlForCurrency = form.storeUrl
    }

    // Switching provider type changes which live currency source (if any)
    // applies, so re-check immediately whenever there's already a base URL.
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

  // Shared by handleSaveConfig (EDIT mode) and createSellerRecord /
  // syncCreatedRecord (ADD mode) — shapes the current Method state into the
  // StoreProviderConfig JSON the sellers table's provider_config column expects.
  const buildProviderConfigPayload = (): Record<string, unknown> => {
    const tiles = categoryTiles.length > 0 ? { categoryTiles } : {}
    return { ...buildProviderConfigCore(), ...tiles }
  }

  const buildProviderConfigCore = (): Record<string, unknown> => {
    if (providerType === 'mock') return { type: 'mock' }
    if (providerType === 'shopify' || providerType === 'woocommerce') {
      return {
        type: providerType,
        baseUrl,
        currency: currency || undefined,
        // Only Shopify has a use for this right now (see fetchShopifyProducts).
        collectionMap:
          providerType === 'shopify' && categoryMapping.some((r) => r.category.trim() && r.handle.trim())
            ? Object.fromEntries(
                categoryMapping.filter((r) => r.category.trim() && r.handle.trim()).map((r) => [r.category.trim(), r.handle])
              )
            : undefined,
      }
    }
    if (providerType === 'jsonapi') {
      return { ...cleanedJsonFields, type: 'jsonapi', baseUrl, currency: currency || undefined }
    }
    return {
      type: 'html-scrape',
      baseUrl,
      currency: currency || undefined,
      listingUrl,
      selectors: htmlSelectors,
      detail: useDetailItems ? detailSelectors : undefined,
      categoryMap: htmlCategoryMapPayload,
    }
  }

  const [savingConfig, setSavingConfig] = useState(false)
  const [configSaveError, setConfigSaveError] = useState<string | null>(null)

  const handleSaveConfig = async () => {
    if (!seller) return
    setSavingConfig(true)
    setConfigSaveError(null)
    try {
      const res = await fetch(`/api/admin/sellers/${seller.platform}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerConfig: buildProviderConfigPayload() }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Failed to save')
      setConfigSaved(true)
      setEditingMethod(false)
      window.setTimeout(() => setConfigSaved(false), 2000)
      // baseUrl/providerType aren't in useLiveProductCount's dependency
      // list, so a saved feed change would otherwise keep showing the OLD
      // count. Kick it explicitly.
      live.refresh()
      // Config just changed — re-run verification so a fix immediately has
      // a chance to auto-promote the seller back to active.
      if (providerType !== 'mock') {
        runSimulation()
      }
    } catch (err) {
      setConfigSaveError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSavingConfig(false)
    }
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
        // onProviderTypeChange above only had the STALE baseUrl in scope,
        // so re-run the currency lookup against the freshly detected URL.
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

  // Whether the MOST RECENT completed run passed cleanly (ok + zero failed
  // checks). Computed from a local tally inside runSimulation rather than
  // read back off React state, since those updates are async and we need a
  // trustworthy answer the instant the run ends.
  const [lastRunPassed, setLastRunPassed] = useState<boolean | null>(null)

  // ADD mode's wizard step. Declared here (not down in the wizard section)
  // because the auto-run effect right after runSimulation reads `step`, and
  // a useEffect referencing a later-declared useState throws "Cannot access
  // 'step' before initialization".
  const [step, setStep] = useState(0)

  // ADD mode only: the seller is created the moment Method (step 1) is
  // confirmed — see goNext. This holds the platform slug of that
  // just-created record so Test & verify and Review can PATCH the real row.
  const [createdPlatform, setCreatedPlatform] = useState<string | null>(null)
  const [creatingStore, setCreatingStore] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [manualInput, setManualInput] = useState('')
  const [manualLoading, setManualLoading] = useState(false)
  const [manualResult, setManualResult] = useState<TestExtractorProductResult | null>(null)

  // Normalizes whatever the extractor API hands back into the full
  // SampleProduct shape ProductCard expects.
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
          jsonFields: providerType === 'jsonapi' ? cleanedJsonFields : undefined,
          listingUrl: providerType === 'html-scrape' ? listingUrl : undefined,
          htmlSelectors: providerType === 'html-scrape' ? htmlSelectors : undefined,
          detail: providerType === 'html-scrape' && useDetailItems ? detailSelectors : undefined,
          categoryMap: providerType === 'html-scrape' ? htmlCategoryMapPayload : undefined,
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
      : providerType === 'html-scrape'
      ? listingUrl && listingUrl
      : null

  const canRunSimulation =
    (providerType === 'shopify' || providerType === 'woocommerce' || providerType === 'jsonapi' || providerType === 'html-scrape') &&
    !!baseUrl &&
    (providerType !== 'jsonapi' ||
      jsonMissing.length === 0) &&
    (providerType !== 'html-scrape' ||
      (!!listingUrl && !!htmlSelectors.productCard && !!htmlSelectors.title && !!htmlSelectors.image && !!htmlSelectors.link))

  // Category photos for the store page's "Shop by category" row. Feed
  // stores: the extractor test, asked for photos too. Extractor ("mock")
  // stores: the saved store's own API, since their extractor is in code.
  const loadCategoryImages = async () => {
    setCategoryImagesLoading(true)
    setCategoryImagesError(null)
    try {
      let candidates: CategoryImageCandidate[] | undefined
      if (providerType === 'mock') {
        const slug = seller?.platform ?? createdPlatform
        if (!slug) throw new Error('Save the store first, then look for category images.')
        const res = await fetch(`/api/admin/sellers/${slug}/category-images`)
        const body = (await res.json().catch(() => ({}))) as { categoryImages?: CategoryImageCandidate[]; error?: string }
        if (!res.ok) throw new Error(body.error ?? 'Could not read the categories.')
        candidates = body.categoryImages
      } else {
        const res = await fetch('/api/admin/sellers/test-extractor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            providerType,
            baseUrl,
            currency,
            categoryImages: true,
            jsonFields: providerType === 'jsonapi' ? cleanedJsonFields : undefined,
            listingUrl: providerType === 'html-scrape' ? listingUrl : undefined,
            htmlSelectors: providerType === 'html-scrape' ? htmlSelectors : undefined,
            detail: providerType === 'html-scrape' && useDetailItems ? detailSelectors : undefined,
            categoryMap: providerType === 'html-scrape' ? htmlCategoryMapPayload : undefined,
          }),
        })
        const body = (await res.json()) as TestExtractorResult
        if (!body.ok) throw new Error(body.error ?? 'Could not read the categories.')
        candidates = body.categoryImages ?? []
      }
      setCategoryCandidates(candidates ?? [])
      setCategoryTiles((prev) => mergeCategoryTiles(prev, candidates ?? []))
    } catch (e) {
      setCategoryImagesError(e instanceof Error ? e.message : 'Could not read the categories.')
    } finally {
      setCategoryImagesLoading(false)
    }
  }

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
          jsonFields: providerType === 'jsonapi' ? cleanedJsonFields : undefined,
          listingUrl: providerType === 'html-scrape' ? listingUrl : undefined,
          htmlSelectors: providerType === 'html-scrape' ? htmlSelectors : undefined,
          detail: providerType === 'html-scrape' && useDetailItems ? detailSelectors : undefined,
          categoryMap: providerType === 'html-scrape' ? htmlCategoryMapPayload : undefined,
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

    // Local tally — see lastRunPassed's declaration for why.
    const localOutcomes: Record<string, CheckOutcome> = {}

    for (let i = 0; i < CHECKS.length; i++) {
      const check = CHECKS[i]
      await sleep(280)
      setCheckStates((prev) => ({ ...prev, [check.id]: { status: 'running' } }))
      await sleep(420)
      let outcome: CheckOutcome
      if (check.id !== 'reachable' && !result.ok) {
        outcome = { status: 'skip', detail: 'Feed unreachable \u2014 fix connectivity first.' }
      } else {
        outcome = check.evaluate({ result, providerType, jsonFields, elapsedMs })
      }
      localOutcomes[check.id] = outcome
      setCheckStates((prev) => ({ ...prev, [check.id]: outcome }))
    }

    setSimRunning(false)

    // Feed is reachable and has categories: go find their images.
    if (result.ok && result.categories?.length) void loadCategoryImages()

    const failCount = Object.values(localOutcomes).filter((o) => o.status === 'fail').length
    const passedCleanly = result.ok && failCount === 0
    setLastRunPassed(passedCleanly)

    // Auto-promote a seller sitting unverified the moment it clears this
    // bar — covers BOTH modes:
    //   - EDIT mode: `seller.platform` is the saved slug.
    //   - ADD mode: `createdPlatform` is set once createSellerRecord() has
    //     run; before that there's nothing to PATCH yet.
    // We never auto-DEMOTE an already-active seller just because a later run
    // fails (a temporarily-down store shouldn't silently vanish from the
    // storefront) — that stays a manual "Deactivate" decision.
    const platformToPromote = isNew ? createdPlatform : seller?.platform
    if (platformToPromote && form.status === 'pending_review' && passedCleanly) {
      try {
        const res = await fetch(`/api/admin/sellers/${platformToPromote}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'active' }),
        })
        if (res.ok) setForm((prev) => ({ ...prev, status: 'active' as SellerStatus }))
      } catch {
        // Non-fatal — promoted on the next successful run.
      }
    }
  }

  // Auto-run the checklist once when the ADD wizard reaches "Test & verify".
  useEffect(() => {
    if (isNew && step === 2 && providerType !== 'mock' && canRunSimulation && !simHasRunRef.current && !simRunning) {
      runSimulation()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  // Auto-run once on load for an EDIT-mode seller that's still unverified.
  useEffect(() => {
    if (!isNew && seller && form.status === 'pending_review' && providerType !== 'mock' && canRunSimulation) {
      runSimulation()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const simHasRun = Object.keys(checkStates).length > 0
  // Ref mirror of simHasRun for the step-change effect above.
  const simHasRunRef = useRef(simHasRun)
  simHasRunRef.current = simHasRun

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
  const isLiveProvider =
    providerType === 'shopify' || providerType === 'woocommerce' || providerType === 'jsonapi' || providerType === 'html-scrape'

  // ---- ADD mode: wizard ----
  const methodValid =
    providerType === 'mock'
      ? true
      : providerType === 'jsonapi'
      ? !!baseUrl && jsonMissing.length === 0
      : !!baseUrl

  const stepValid = [profileValid && logoValid, methodValid, true, canSubmit]

  // What status a brand-new seller ends up at once Test & verify has had
  // its say. Nothing BLOCKS creation — this only decides `active` vs
  // `pending_review`.
  const derivedStatus = (): SellerStatus => {
    if (providerType === 'mock') return 'active'
    return lastRunPassed ? 'active' : 'pending_review'
  }

  // Fires exactly once: the moment the admin confirms Method and moves into
  // Test & verify. This is the real INSERT — from here on the wizard edits
  // an actual saved row.
  const createSellerRecord = async (): Promise<boolean> => {
    if (!profileValid || !logoValid) {
      if (!logoValid) setLogoRequiredTouched(true)
      return false
    }
    setCreatingStore(true)
    setCreateError(null)
    try {
      const res = await fetch('/api/admin/sellers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeName: form.storeName,
          platform: form.platform,
          storeUrl: form.storeUrl,
          contactName: form.contactName,
          contactEmail: form.contactEmail,
          contactPhone: form.contactPhone,
          storeOrigin: form.storeOrigin,
          categories: form.categories,
          notes: form.notes,
          // Data URLs for now (see the branding note at the top) — a real
          // backend should upload to storage and keep only the hosted URL.
          logoUrl: resolveLogoUrl(storeLogo, form.storeName || form.platform),
          coverUrl: storeCover,
          providerConfig: buildProviderConfigPayload(),
          // No test has run yet — mock is active straight away, everything
          // else starts pending_review and gets promoted by runSimulation.
          status: providerType === 'mock' ? 'active' : 'pending_review',
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Failed to add seller')
      setCreatedPlatform(form.platform)
      setForm((prev) => ({ ...prev, status: providerType === 'mock' ? 'active' : 'pending_review' }))
      return true
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to add seller')
      return false
    } finally {
      setCreatingStore(false)
    }
  }

  // If the admin has already created the record and then steps BACK to
  // Profile or Method to change something, push that change to the backend
  // before moving forward again.
  const syncCreatedRecord = async () => {
    if (!createdPlatform) return
    try {
      await fetch(`/api/admin/sellers/${createdPlatform}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeName: form.storeName,
          storeUrl: form.storeUrl,
          contactName: form.contactName,
          contactEmail: form.contactEmail,
          contactPhone: form.contactPhone,
          storeOrigin: form.storeOrigin,
          notes: form.notes,
          logoUrl: resolveLogoUrl(storeLogo, form.storeName),
          coverUrl: storeCover,
          providerConfig: buildProviderConfigPayload(),
        }),
      })
    } catch {
      // Non-fatal — handleFinish's own sync is a second chance to catch up.
    }
  }

  const goNext = async () => {
    if (step === 0 && !logoValid) {
      setLogoRequiredTouched(true)
      return
    }
    if (step === 1 && !createdPlatform) {
      const ok = await createSellerRecord()
      if (!ok) return // stay on Method — creation failed, error is shown inline
    } else if (createdPlatform && (step === 0 || step === 1)) {
      await syncCreatedRecord()
    }
    setStep((s) => Math.min(WIZARD_STEPS.length - 1, s + 1))
  }
  const goBack = () => setStep((s) => Math.max(0, s - 1))

  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const submitting = creatingStore

  // The Review step's "Finish" action. The seller row already exists —
  // this just makes sure it has the latest edits and the right final
  // status, then hands off to the seller detail page. It does NOT create a
  // second record.
  const handleFinish = async () => {
    setSubmitError(null)
    let platform = createdPlatform
    if (!platform) {
      // Defensive fallback only — goNext always creates on the way into step 2.
      const ok = await createSellerRecord()
      if (!ok) return
      platform = form.platform
    } else {
      await syncCreatedRecord()
      const finalStatus = derivedStatus()
      if (finalStatus !== form.status) {
        try {
          await fetch(`/api/admin/sellers/${platform}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: finalStatus }),
          })
          setForm((prev) => ({ ...prev, status: finalStatus }))
        } catch (err) {
          setSubmitError(err instanceof Error ? err.message : 'Failed to finalize status')
          return
        }
      }
    }
    setSubmitted(true)
    window.setTimeout(() => router.push(`/admin/sellers/${platform}`), 900)
  }

  // ---- Collections this seller belongs to (EDIT mode only) ----
  // Sourced LIVE from the seller's own store via
  // /api/admin/sellers/[platform]/collections — see the module comment.
  const [collections, setCollections] = useState<SellerCollection[]>([])
  const [collectionsLoading, setCollectionsLoading] = useState(!isNew)
  const [collectionsError, setCollectionsError] = useState<string | null>(null)
  // Non-fatal note from the route (e.g. "couldn't reach this seller's live
  // feed") — distinct from collectionsError, which means OUR route failed.
  const [collectionsWarning, setCollectionsWarning] = useState<string | null>(null)
  // Only shown once the list is long enough to need it (see `> 6` below).
  const [collectionsFilter, setCollectionsFilter] = useState('')

  useEffect(() => {
    if (isNew || !seller) return
    let cancelled = false
    setCollectionsLoading(true)
    setCollectionsError(null)
    setCollectionsWarning(null)
    fetch(`/api/admin/sellers/${seller.platform}/collections`)
      .then(async (res) => {
        const body = await res.json()
        if (!res.ok) throw new Error(body.error ?? 'Failed to load collections')
        return body as { collections?: SellerCollection[]; warning?: string }
      })
      .then((body) => {
        if (cancelled) return
        setCollections(body.collections ?? [])
        setCollectionsWarning(body.warning ?? null)
      })
      .catch((err) => {
        if (cancelled) return
        setCollectionsError(err instanceof Error ? err.message : 'Failed to load collections')
      })
      .finally(() => {
        if (!cancelled) setCollectionsLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, seller?.platform])

  // Display-layer cleanup of the raw live collections list: de-dupe by name
  // (keep the higher count) and drop size-filter collections.
  const visibleCollections = useMemo(() => {
    const byName = new Map<string, SellerCollection>()
    for (const c of collections) {
      if (SIZE_COLLECTION_PATTERN.test(c.name)) continue
      const existing = byName.get(c.name)
      if (!existing || c.productCount > existing.productCount) byName.set(c.name, c)
    }

    const sorted = Array.from(byName.values()).sort((a, b) => b.productCount - a.productCount)
    const q = collectionsFilter.trim().toLowerCase()
    return q ? sorted.filter((c) => c.name.toLowerCase().includes(q)) : sorted
  }, [collections, collectionsFilter])

  // ---- EDIT mode: per-card edit toggles ----
  const [editingProfile, setEditingProfile] = useState(false)
  const [editingMethod, setEditingMethod] = useState(false)

  const cancelEditingProfile = () => {
    setEditingProfile(false)
    // Discard any unsaved logo/cover change along with the rest of the
    // form — otherwise a picked-then-cancelled image would linger in state
    // and quietly get sent on the NEXT save.
    setStoreLogo(seller?.store.logo || null)
    setStoreCover(savedCover)
  }

  // ---- Not found (EDIT mode, bad slug) ----
  if (!isNew && !seller) {
    return (
      <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
        <div className="mx-auto max-w-2xl px-6 pb-20 pt-8 text-center lg:px-10">
          <p className="mt-16 text-sm text-ink/50">
            No seller found. It may have been removed.
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
  // cards (EDIT), so the two modes never drift.
  // -------------------------------------------------------------------

  const profileFields = (
    <div className="flex flex-col gap-5">
      {/* Logo (profile picture) + cover banner, previewed like the storefront. */}
      <StoreBrandingEditor
        logo={storeLogo}
        cover={storeCover}
        onLogoChange={(next) => {
          setStoreLogo(next)
          setProfileSaved(false)
        }}
        onCoverChange={(next) => {
          setStoreCover(next)
          setProfileSaved(false)
        }}
        logoRequired={isNew}
        logoRequiredError={
          isNew && logoRequiredTouched && !storeLogo ? 'A store logo is required before this seller can be added.' : null
        }
      />

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
          <input
            type="text"
            value={form.platform}
            onChange={onPlatformChange}
            placeholder="chennai-silk-house"
            disabled={!!createdPlatform}
            className={`${monoInputClass} ${createdPlatform ? 'cursor-not-allowed opacity-60' : ''}`}
          />
          <p className="mt-1 text-xs text-ink/40">
            {createdPlatform
              ? 'Locked — this seller has already been created under this slug.'
              : `Used internally (feed config, storefront URL /stores/${form.platform || '...'}) — auto-filled from the store name, editable if needed.`}
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

      <Field label="Store location">
        <StoreOriginPicker value={form.storeOrigin} onChange={(v) => setForm((prev) => ({ ...prev, storeOrigin: v }))} />
      </Field>

      {/* A div, not <Field> (a <label>): clicking a label's text would
          toggle the first category button inside it. */}
      <div>
        <span className="text-xs font-semibold text-ink/50">Categories</span>
        <div className="mt-1.5">
          <StoreCategoryPicker
            value={form.categories}
            onChange={(categories) => {
              setForm((prev) => ({ ...prev, categories }))
              setProfileSaved(false)
            }}
          />
        </div>
      </div>

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
          Add a Store URL in Profile and we&rsquo;ll check it automatically — no need to know which platform it
          runs on.
        </p>
      )}

      {detection.status === 'checking' && (
        <p className="flex items-center gap-2 rounded-xl border border-indigo/20 bg-indigo/[0.05] p-3.5 text-xs font-semibold text-indigo">
          <Loader2 size={14} className="animate-spin" />
          Checking whether that store runs on Shopify or WooCommerce…
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
              This store runs on {EXTRACTOR_TYPE_LABEL[detection.type]} — set up below automatically.
            </p>
            <p className="mt-1 text-xs text-ink/45">
              {detection.confidence === 'high'
                ? 'High confidence match.'
                : detection.confidence === 'medium'
                ? 'Likely match — worth a quick look below before testing.'
                : 'Best guess — double-check the details below before testing.'}
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
            {detection.reason ?? 'This may be a custom-built store.'} Pick manually below — if it has its own
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
                  <p className="mt-1 text-[11px] text-ink/40">Couldn&rsquo;t auto-detect a currency — enter it manually.</p>
                )}
              </>
            )}
          </label>
        </div>
      )}

      {providerType === 'shopify' && (
        <div className={`flex flex-col gap-3 p-4 ${groupClass}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-ink/50">
              Category mapping — map your site categories to this store&rsquo;s real Shopify collections.
            </p>
            {collectionsFetching && (
              <span className="flex items-center gap-1 text-xs font-semibold text-indigo">
                <Loader2 size={11} className="animate-spin" />
                Fetching collections…
              </span>
            )}
          </div>

          {collectionsFetchError && (
            <div className="rounded-lg border border-red-600/25 bg-red-600/5 px-3 py-2 text-xs">
              <p className="font-semibold text-red-700">Couldn&rsquo;t load this store&rsquo;s collections</p>
              <p className="mt-0.5 text-red-700/70">{collectionsFetchError}</p>
              <button
                type="button"
                onClick={() => baseUrl.trim() && fetchSellerCollections(baseUrl.trim())}
                className="mt-1.5 font-semibold underline text-red-700"
              >
                Try again
              </button>
            </div>
          )}

          {!collectionsFetching && !collectionsFetchError && shopifyCollections.length === 0 && (
            <p className="text-xs text-ink/40">
              {baseUrl.trim()
                ? 'No collections found on this store yet.'
                : 'Enter a base URL above to load this store’s collections.'}
            </p>
          )}

          {categoryMapping.length === 0 ? (
            <p className="text-xs text-ink/40">
              No categories mapped yet — without a mapping, category filtering falls back to matching each
              product&rsquo;s own type field.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {categoryMapping.map((row, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                  <input
                    type="text"
                    value={row.category}
                    onChange={(e) => updateCategoryMappingRow(i, { category: e.target.value })}
                    placeholder="Site category, e.g. Sarees"
                    className={inputClass}
                  />
                  <select
                    value={row.handle}
                    onChange={(e) => updateCategoryMappingRow(i, { handle: e.target.value })}
                    className={inputClass}
                    disabled={shopifyCollections.length === 0}
                  >
                    <option value="">Select a collection…</option>
                    {shopifyCollections.map((c) => (
                      <option key={c.handle} value={c.handle}>
                        {c.title} ({c.handle})
                      </option>
                    ))}
                    {/* Keeps a saved-but-since-renamed/removed handle visible
                        and selected instead of silently reverting to blank. */}
                    {row.handle && !shopifyCollections.some((c) => c.handle === row.handle) && (
                      <option value={row.handle}>{row.handle} (not found on store)</option>
                    )}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeCategoryMappingRow(i)}
                    title="Remove this mapping"
                    className="grid h-9 w-9 flex-none place-items-center rounded-lg border border-ink/10 text-ink/40 hover:bg-red-600/5 hover:text-red-600"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={addCategoryMappingRow}
            className="flex items-center gap-1.5 self-start text-xs font-semibold text-teal-deep hover:underline"
          >
            + Add category mapping
          </button>
        </div>
      )}

      {providerType === 'jsonapi' && (
        <JsonApiSettings
          value={jsonFields}
          onChange={setJsonFields}
          baseUrl={baseUrl}
          currency={currency}
          isNew={isNew}
        />
      )}

      {providerType === 'html-scrape' && (
        <div className={`flex flex-col gap-3 p-4 ${groupClass}`}>
          <p className="text-xs font-semibold text-ink/50">CSS selectors — point these at a real category/shop page&rsquo;s markup.</p>
          <SelectorField label="Listing page path" value={listingUrl} onChange={(e) => setListingUrl(e.target.value)} placeholder="/shop" />
          <SelectorField label="Product card" value={htmlSelectors.productCard} onChange={setHtmlSelector('productCard')} placeholder=".product-card" />
          <SelectorField label="Title" value={htmlSelectors.title} onChange={setHtmlSelector('title')} placeholder=".product-name" />
          <SelectorField label="Price" value={htmlSelectors.price ?? ''} onChange={setHtmlSelector('price')} placeholder=".price-now" />
          <p className="-mt-2 text-[11px] leading-relaxed text-ink/40">
            Point Title and Price at the SAME selector if a card shows its name and price together in one text block
            (e.g. &ldquo;Catalog - 17432&rdquo; + &ldquo;Min 1595 - Max 1595 INR&rdquo; in one element) — a &ldquo;Min X - Max
            Y&rdquo; range in that text is read automatically and stripped back out of the title.
          </p>
          <SelectorField label="Image" value={htmlSelectors.image} onChange={setHtmlSelector('image')} placeholder="img.gallery-thumb" />
          <SelectorField label="Link to product" value={htmlSelectors.link} onChange={setHtmlSelector('link')} placeholder="a.product-link" />
          <SelectorField label="Variants (optional)" value={htmlSelectors.variants ?? ''} onChange={setHtmlSelector('variants')} placeholder=".size-option" />
          <SelectorField
            label="Page query param (optional)"
            value={htmlSelectors.pageParam ?? ''}
            onChange={setHtmlSelector('pageParam')}
            placeholder="page"
          />
          <p className="-mt-2 text-[11px] leading-relaxed text-ink/40">
            Set this if the listing page itself paginates (a &ldquo;page=2&rdquo; link in its own pagination). Leave blank
            for a single-page listing — every page past the first will otherwise just repeat page 1.
          </p>

          <div className="mt-2 flex flex-col gap-2 rounded-lg border border-ink/10 bg-parchment/40 p-3">
            <p className="text-xs font-semibold text-ink/50">
              Category mapping (optional) — map a category to its OWN listing page on this site, e.g. &ldquo;Sarees&rdquo;
              &rarr; <span className="font-mono text-ink/60">/category/sarees</span>. Without this, the storefront only
              ever shows the one listing page above.
            </p>
            {htmlCategoryMap.length === 0 ? (
              <p className="text-xs text-ink/40">No categories mapped yet — the storefront will show one combined listing.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {htmlCategoryMap.map((row, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                    <input
                      type="text"
                      value={row.category}
                      onChange={(e) => updateHtmlCategoryRow(i, { category: e.target.value })}
                      placeholder="Category, e.g. Sarees"
                      className={inputClass}
                    />
                    <input
                      type="text"
                      value={row.handle}
                      onChange={(e) => updateHtmlCategoryRow(i, { handle: e.target.value })}
                      placeholder="/category/sarees"
                      className={monoInputClass}
                    />
                    <button
                      type="button"
                      onClick={() => removeHtmlCategoryRow(i)}
                      title="Remove this mapping"
                      className="grid h-9 w-9 flex-none place-items-center rounded-lg border border-ink/10 text-ink/40 hover:bg-red-600/5 hover:text-red-600"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={addHtmlCategoryRow}
              className="flex items-center gap-1.5 self-start text-xs font-semibold text-teal-deep hover:underline"
            >
              + Add category mapping
            </button>
          </div>

          <label className="mt-2 flex items-center gap-2 text-xs font-medium text-ink/70">
            <input
              type="checkbox"
              checked={useDetailItems}
              onChange={(e) => setUseDetailItems(e.target.checked)}
              className="h-4 w-4"
            />
            A listing card&rsquo;s detail page lists several priced items itself (a &ldquo;catalog&rdquo; page), not one product
          </label>
          {useDetailItems && (
            <div className="flex flex-col gap-3 rounded-lg border border-ink/10 bg-parchment/40 p-3">
              <p className="text-[11px] leading-relaxed text-ink/45">
                Selectors below apply to the DETAIL page (what &ldquo;Link to product&rdquo; above points at), not the listing
                page. Each repeating item becomes one purchasable design/variant under this catalog.
              </p>
              <SelectorField label="Repeating item" value={detailSelectors.item} onChange={setDetailSelector('item')} placeholder=".design-row" />
              <SelectorField label="Item label / code" value={detailSelectors.itemLabel} onChange={setDetailSelector('itemLabel')} placeholder=".design-code" />
              <SelectorField label="Item price" value={detailSelectors.price} onChange={setDetailSelector('price')} placeholder=".design-price" />
              <SelectorField label="Item image" value={detailSelectors.image} onChange={setDetailSelector('image')} placeholder="img.design-photo" />
              <SelectorField
                label="Availability (optional)"
                value={detailSelectors.availability ?? ''}
                onChange={setDetailSelector('availability')}
                placeholder=".design-stock"
              />
              <SelectorField
                label="Description (optional)"
                value={detailSelectors.description ?? ''}
                onChange={setDetailSelector('description')}
                placeholder=".design-desc"
              />
            </div>
          )}
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
            This store uses a custom extractor written in code, so there&rsquo;s no feed checklist to run here.
            {seller || createdPlatform ? ' You can still pick the images for its categories below.' : ' Save the store, then pick the images for its categories.'}
          </p>
        </div>
      )}

      {providerType === 'mock' && (seller || createdPlatform) && (
        <CategoryTilesPanel
          tiles={categoryTiles}
          candidates={categoryCandidates}
          loading={categoryImagesLoading}
          error={categoryImagesError}
          onChange={setCategoryTiles}
          onRefresh={() => void loadCategoryImages()}
          onSave={isNew ? undefined : () => void saveCategoryTiles()}
          saveState={categoryTilesSave}
        />
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
                {simRunning ? 'Running checks…' : simHasRun ? 'Run again' : 'Run all checks'}
              </button>

              {simHasRun && !simRunning && (
                <p className="text-xs font-semibold text-ink/50">
                  <span className="text-teal-deep">{summary.pass} passed</span>
                  {summary.fail > 0 && <span className="text-red-600"> &middot; {summary.fail} failed</span>}
                  {summary.skip > 0 && <span className="text-ink/40"> &middot; {summary.skip} skipped</span>}
                </p>
              )}

              {simHasRun && !simRunning && lastRunPassed && (isNew ? true : form.status === 'active') && (
                <p className="flex items-center gap-1 text-xs font-semibold text-teal-deep">
                  <Check size={12} />
                  {isNew ? 'Verified — will be created as Active.' : 'Verified — seller is Active.'}
                </p>
              )}

              {simHasRun && !simRunning && !lastRunPassed && (
                <p className="text-xs font-semibold text-gold-deep">
                  {isNew
                    ? 'Not verified yet — you can still add this seller; it’ll be created as Pending review.'
                    : 'Still failing — fix the Method card and save to retry.'}
                </p>
              )}

              {simHasRun && resultsStale && !simRunning && (
                <p className="flex items-center gap-1 text-xs font-semibold text-gold-deep">
                  Config changed since this ran — re-run to confirm.
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
                : providerType === 'html-scrape'
                ? 'Paste a real detail-page URL from the store to check one product (or one catalog, if the detail selectors above are on) instead of a random sample.'
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
                    : providerType === 'html-scrape'
                    ? 'e.g. https://www.anishkacreation.com/p/17522'
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
                {simRunning
                  ? 'Running the checklist against the real feed…'
                  : canRunSimulation
                  ? 'Checks will run automatically — or click above to run them again — covering reachability, field mapping, variants, stock, images, categories, and response time.'
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

              {/* Every check sits on screen at once; running checks light up
                  in place as they resolve, so the whole pass is scannable. */}
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

          {testResult?.ok && (testResult.categories?.length || categoryTiles.length > 0) ? (
            <CategoryTilesPanel
              tiles={categoryTiles}
              candidates={categoryCandidates}
              loading={categoryImagesLoading}
              error={categoryImagesError}
              onChange={setCategoryTiles}
              onRefresh={() => void loadCategoryImages()}
              onSave={isNew ? undefined : () => void saveCategoryTiles()}
              saveState={categoryTilesSave}
            />
          ) : null}

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
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
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
              {/* Read-only preview — the logo is picked in the Profile step. */}
              <span className="grid h-14 w-14 flex-none place-items-center overflow-hidden rounded-full border border-ink/10 bg-white text-teal-deep">
                {storeLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- data-URL preview, not a static asset
                  <img src={storeLogo} alt="" className="h-full w-full object-contain p-1" />
                ) : (
                  <UserPlus size={22} strokeWidth={1.75} />
                )}
              </span>
              <div>
                <h1 className="font-display text-3xl text-ink">Add a seller</h1>
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/60">
                  Enter the store details and how products get pulled in. We&rsquo;ll test the feed automatically and
                  create the seller either way — verified sellers go live immediately, others come in as Pending
                  review until the config is fixed.
                </p>
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
                {/* The logo is edited in the Profile card (Edit -> branding editor). */}
                <Image
                  src={resolveLogoUrl(storeLogo, seller!.store.name)}
                  alt=""
                  width={48}
                  height={48}
                  className="h-12 w-12 flex-none rounded-full border border-ink/10 bg-white object-cover"
                />
                <div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h1 className="font-display text-3xl leading-tight text-ink">{seller!.store.name}</h1>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[form.status]}`}>
                      {STATUS_LABEL[form.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-ink/50">
                    {EXTRACTOR_TYPE_LABEL[providerType]}

                    {form.status === 'pending_review' && (simRunning || (isLiveProvider && !simHasRun)) && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-indigo/10 px-2 py-0.5 text-[11px] font-semibold text-indigo">
                        <Loader2 size={10} className="animate-spin" />
                        Verifying…
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="grid flex-none grid-cols-3 gap-3 sm:min-w-[320px]">
                <Stat
                  label={isLiveFeedStats ? 'Products (live)' : 'Products'}
                  value={!isLiveFeedStats ? seller!.store.itemCount ?? 0 : live.loading ? '…' : live.error ? seller!.store.itemCount ?? 0 : live.count ?? 0}
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
            Seller saved. Taking you to their page...
          </div>
        ) : isNew ? (
          // ------------------------------------------------------------ WIZARD
          <div className="mt-6 flex flex-col gap-6">
            <section className={`p-6 ${panelClass}`}>
              {step === 0 && (
                <>
                  <SectionHeading title="Profile" subtitle="Who this seller is, their logo and cover, and how to reach them." />
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
                  <SectionHeading title="Test & verify" subtitle="Runs automatically against the real feed — pass or fail, you can still continue." />
                  <div className="mt-5">{testPanel}</div>
                </>
              )}
              {step === 3 && (
                <>
                  <SectionHeading title="Review" subtitle="Check everything over before adding this seller." />
                  <div className="mt-5 flex flex-col gap-4">
                    <ReviewRow label="Profile" onEdit={() => setStep(0)}>
                      {storeCover && (
                        // eslint-disable-next-line @next/next/no-img-element -- data-URL preview, not a static asset
                        <img src={storeCover} alt="" className="mb-3 h-16 w-full max-w-md rounded-lg border border-ink/10 object-cover" />
                      )}
                      <div className="flex items-center gap-3">
                        {storeLogo ? (
                          // eslint-disable-next-line @next/next/no-img-element -- data-URL preview, not a static asset
                          <img src={storeLogo} alt="" className="h-9 w-9 flex-none rounded-full border border-ink/10 bg-white object-cover p-0.5" />
                        ) : (
                          <span className="grid h-9 w-9 flex-none place-items-center rounded-full border border-dashed border-red-600/30 text-red-600/60">
                            <UserPlus size={14} />
                          </span>
                        )}
                        <div>
                          <p className="text-sm font-semibold text-ink">{form.storeName || '—'}</p>
                          <p className="text-xs text-ink/50">/stores/{form.platform || '—'}</p>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-ink/50">{form.contactEmail || 'No contact email yet'}</p>
                      {form.storeUrl && <p className="mt-1 text-xs text-ink/40">{form.storeUrl}</p>}
                      {storeLogo ? (
                        <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-teal-deep">
                          <Check size={11} /> Store logo added
                        </p>
                      ) : (
                        <p className="mt-1.5 text-xs font-semibold text-red-700">
                          Store logo missing — go back to Profile to add one before this seller can be added.
                        </p>
                      )}
                      {!storeCover && (
                        <p className="mt-1 text-xs text-ink/40">No cover banner — the store page will show the Wishdrop gradient.</p>
                      )}
                    </ReviewRow>

                    <ReviewRow label="Catalogue feed" onEdit={() => setStep(1)}>
                      <p className="text-sm font-semibold text-ink">{EXTRACTOR_TYPE_LABEL[providerType]}</p>
                      {providerType !== 'mock' && <p className="text-xs text-ink/50">{baseUrl || 'No base URL yet'}</p>}
                      {currency && <p className="text-xs text-ink/40">Currency: {currency}</p>}
                    </ReviewRow>

                    <ReviewRow label="Verification" onEdit={() => setStep(2)}>
                      {providerType === 'mock' ? (
                        <p className="text-xs font-semibold text-teal-deep">Nothing to verify — already Active.</p>
                      ) : simRunning ? (
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-indigo">
                          <Loader2 size={11} className="animate-spin" />
                          Still verifying…
                        </p>
                      ) : simHasRun ? (
                        <>
                          <p className="text-xs font-semibold text-ink/50">
                            <span className="text-teal-deep">{summary.pass} passed</span>
                            {summary.fail > 0 && <span className="text-red-600"> &middot; {summary.fail} failed</span>}
                            {summary.skip > 0 && <span className="text-ink/40"> &middot; {summary.skip} skipped</span>}
                          </p>
                          <p className={`mt-1 text-xs font-semibold ${lastRunPassed ? 'text-teal-deep' : 'text-gold-deep'}`}>
                            {lastRunPassed
                              ? 'Verified — will finish as Active.'
                              : 'Not verified — will finish as Pending review. You can fix the Method card and re-test any time after this.'}
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-ink/45">Not tested yet — will finish as Pending review.</p>
                      )}
                    </ReviewRow>

                    <p className="text-xs text-ink/40">
                      This seller was already added (as {STATUS_LABEL[form.status]}) back when Method was confirmed —
                      Finish below just locks in any later edits and its final status.
                    </p>
                  </div>
                </>
              )}
            </section>

            {(createError || submitError) && (
              <p className="text-right text-sm font-semibold text-red-700">{createError || submitError}</p>
            )}

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
                  disabled={!stepValid[step] || creatingStore}
                  className="rounded-xl bg-teal-deep px-4 py-2.5 text-sm font-semibold text-parchment shadow-[0_10px_28px_-10px_rgba(11,114,128,0.55)] transition-all hover:bg-teal active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-ink/20 disabled:shadow-none disabled:active:scale-100"
                >
                  {step === 1 && !createdPlatform && creatingStore
                    ? 'Adding seller…'
                    : creatingStore
                    ? 'Saving…'
                    : 'Continue'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleFinish}
                  disabled={!canSubmit || submitting}
                  className="rounded-xl bg-teal-deep px-4 py-2.5 text-sm font-semibold text-parchment shadow-[0_10px_28px_-10px_rgba(11,114,128,0.55)] transition-all hover:bg-teal active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-ink/20 disabled:shadow-none disabled:active:scale-100"
                >
                  {submitting ? 'Finishing…' : 'Finish'}
                </button>
              )}
            </div>
          </div>
        ) : (
          // ------------------------------------------------------------ EDIT MODE
          <div className="mt-6 flex flex-col gap-6">
            {/* items-stretch so both cards in the row are stretched to the
                row's tallest; Method's collections list is capped at a fixed
                max-height rather than relying on this stretch. */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 items-stretch">
              {/* ---- Profile card ---- */}
              <section className={`flex flex-col gap-5 p-6 ${panelClass}`}>
                <div className="flex items-start justify-between gap-3">
                  <SectionHeading title="Profile" subtitle="Branding, store details, contact, and account status." />
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
                      {profileSaveError && (
                        <span className="mr-auto text-xs font-semibold text-red-700">{profileSaveError}</span>
                      )}
                      <button
                        type="button"
                        onClick={cancelEditingProfile}
                        className="flex items-center gap-1.5 rounded-xl border border-ink/15 px-3.5 py-2 text-sm font-semibold text-ink hover:bg-ink/5"
                      >
                        <X size={13} />
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveProfile}
                        disabled={!profileValid || savingProfile}
                        className="rounded-xl bg-teal-deep px-4 py-2 text-sm font-semibold text-parchment shadow-[0_10px_28px_-10px_rgba(11,114,128,0.55)] transition-all hover:bg-teal active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-ink/20 disabled:shadow-none"
                      >
                        {savingProfile ? 'Saving…' : 'Save changes'}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Read-only branding preview, laid out like the storefront. */}
                    <div className="relative pb-9">
                      <div className="aspect-[16/5] w-full overflow-hidden rounded-2xl border border-ink/10 bg-[radial-gradient(120%_140%_at_0%_0%,var(--color-teal)_0%,var(--color-indigo)_55%,var(--color-indigo-deep)_100%)]">
                        {storeCover && (
                          // eslint-disable-next-line @next/next/no-img-element -- data-URL / remote preview
                          <img src={storeCover} alt="Cover banner" className="h-full w-full object-cover object-center" />
                        )}
                      </div>
                      <span className="absolute bottom-0 left-4 h-20 w-20 overflow-hidden rounded-full border-4 border-parchment bg-white shadow-sm">
                        {/* eslint-disable-next-line @next/next/no-img-element -- data-URL / remote preview */}
                        <img
                          src={resolveLogoUrl(storeLogo, form.storeName)}
                          alt="Store logo"
                          className="absolute inset-0 h-full w-full scale-100 object-cover"
                        />
                      </span>
                      {!storeCover && (
                        <p className="absolute bottom-0 left-28 pb-1 text-xs text-ink/40">
                          No cover yet — the store page shows the gradient.
                        </p>
                      )}
                    </div>

                    <dl className="flex flex-col gap-3.5 text-sm">
                      <SummaryRow term="Store name" value={form.storeName} />
                      <SummaryRow term="Store URL" value={form.storeUrl || '—'} />
                      <SummaryRow term="Contact email" value={form.contactEmail} />
                      <SummaryRow term="Contact name" value={form.contactName || '—'} />
                      <SummaryRow term="Contact phone" value={form.contactPhone || '—'} />
                      <SummaryRow term="Store location" value={STORE_ORIGIN_LABEL[form.storeOrigin]} />
                      <SummaryRow term="Categories" value={form.categories.length ? form.categories.join(', ') : '—'} />
                      <SummaryRow term="Notes" value={form.notes || '—'} multiline />
                    </dl>
                    <div className="flex items-center justify-between gap-2 border-t border-ink/10 pt-5">
                      {form.status !== 'active' && form.status !== 'pending_review' ? (
                        <button
                          type="button"
                          onClick={handleActivate}
                          disabled={activating}
                          className="rounded-xl bg-teal-deep px-3.5 py-2 text-sm font-semibold text-parchment transition-all hover:bg-teal disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {activating ? 'Activating…' : 'Activate'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleDeactivate}
                          disabled={deactivating}
                          className="rounded-xl border border-red-600/25 px-3.5 py-2 text-sm font-semibold text-red-700 transition-all hover:bg-red-600/5 disabled:cursor-not-allowed disabled:border-ink/10 disabled:text-ink/30"
                        >
                          {deactivating ? 'Deactivating…' : 'Deactivate'}
                        </button>
                      )}
                      {deactivateError ? (
                        <p className="text-xs font-semibold text-red-700">{deactivateError}</p>
                      ) : (
                        <p className="text-xs text-ink/35">Only Manager and Super Admin can delete a seller outright.</p>
                      )}
                    </div>
                  </>
                )}
              </section>

              {/* ---- Method card ---- */}
              <section className={`flex h-full flex-col gap-5 p-6 ${panelClass}`}>
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
                          <Check size={13} /> Saved — re-verifying
                        </span>
                      )}
                      {configSaveError && (
                        <span className="mr-auto text-xs font-semibold text-red-700">{configSaveError}</span>
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
                        disabled={savingConfig}
                        className="rounded-xl bg-teal-deep px-4 py-2 text-sm font-semibold text-parchment shadow-[0_10px_28px_-10px_rgba(11,114,128,0.55)] transition-all hover:bg-teal active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {savingConfig ? 'Saving…' : 'Save configuration'}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <dl className="flex flex-col gap-3.5 text-sm">
                      <SummaryRow term="Method" value={EXTRACTOR_TYPE_LABEL[providerType]} />
                      {providerType !== 'mock' && <SummaryRow term="Base URL" value={baseUrl || '—'} mono />}
                      {currency && <SummaryRow term="Currency" value={currency} />}
                      {providerType === 'jsonapi' && <SummaryRow term="List endpoint" value={jsonFields.listEndpoint || '—'} mono />}
                      {providerType === 'html-scrape' && <SummaryRow term="Listing page" value={listingUrl || '—'} mono />}
                      {providerType === 'html-scrape' && htmlSelectors.pageParam && (
                        <SummaryRow term="Paginated via" value={`?${htmlSelectors.pageParam}=N`} mono />
                      )}
                      {providerType === 'html-scrape' && useDetailItems && (
                        <SummaryRow term="Detail page" value="Catalog of several priced items" />
                      )}
                      {providerType === 'html-scrape' && htmlCategoryMapPayload && (
                        <SummaryRow term="Categories mapped" value={String(Object.keys(htmlCategoryMapPayload).length)} />
                      )}
                    </dl>

                    {/* Collections this seller's products currently sit in —
                        LIVE from the seller's own store. Fixed max-height +
                        internal scroll so a store with 20-30+ collections
                        never grows this card past Profile's height. */}
                    <div className="flex min-h-0 flex-1 flex-col border-t border-ink/10 pt-5">
                      <p className="text-xs font-semibold text-ink/50">
                        Collections
                        {!collectionsLoading && collections.length > 0 && (
                          <span className="ml-1.5 font-normal text-ink/35">({visibleCollections.length})</span>
                        )}
                      </p>

                      {collectionsWarning && !collectionsLoading && (
                        <p className="mt-2 text-[11px] text-gold-deep">{collectionsWarning}</p>
                      )}

                      {collectionsLoading ? (
                        <p className="mt-3 flex items-center gap-1.5 text-xs text-ink/40">
                          <Loader2 size={11} className="animate-spin" />
                          Loading collections…
                        </p>
                      ) : collectionsError ? (
                        <p className="mt-3 text-xs font-medium text-red-600">{collectionsError}</p>
                      ) : collections.length === 0 ? (
                        <p className="mt-3 text-xs text-ink/40">This seller isn&rsquo;t in any collections yet.</p>
                      ) : (
                        <>
                          {collections.length > 6 && (
                            <div className="relative mt-3">
                              <Search
                                size={12}
                                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink/30"
                              />
                              <input
                                type="text"
                                value={collectionsFilter}
                                onChange={(e) => setCollectionsFilter(e.target.value)}
                                placeholder="Filter collections…"
                                className="w-full rounded-lg border border-ink/10 py-1.5 pl-7 pr-2.5 text-xs text-ink placeholder:text-ink/30 focus:border-teal-deep/40 focus:outline-none"
                              />
                            </div>
                          )}

                          <div className="relative mt-2.5 min-h-56 flex-1">
                            <ul className="absolute inset-0 overflow-y-auto pr-1">
                            {visibleCollections.map((c) => (
                              <li
                                key={c.id}
                                className="flex items-center justify-between gap-3 border-b border-ink/5 py-1.5 text-xs last:border-0"
                              >
                                <a
                                  href={`${baseUrl.replace(/\/+$/, '')}/collections/${encodeURIComponent(c.id)}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="min-w-0 truncate font-medium text-ink/70 hover:text-teal-deep hover:underline"
                                  title={`Open ${c.name} on the live store`}
                                >
                                  {c.name}
                                </a>
                                <span className="flex-none text-ink/40">{c.productCount} items</span>
                              </li>
                            ))}
                            {visibleCollections.length === 0 && (
                              <li className="py-2 text-xs text-ink/35">
                                No collections match &ldquo;{collectionsFilter}&rdquo;.
                              </li>
                            )}
                            </ul>
                          </div>
                        </>
                      )}
                    </div>
                  </>
                )}
              </section>
            </div>

            {/* ---- Test & verify (always live, full width) ---- */}
            <section className={`flex flex-col gap-5 p-6 ${panelClass}`}>
              <SectionHeading
                title="Test & verify"
                subtitle={
                  form.status === 'pending_review'
                    ? 'Runs automatically while this seller is Pending review — a clean pass promotes it to Active. Never affects saved config.'
                    : 'Runs against the real feed. Never affects saved config.'
                }
              />
              {testPanel}
            </section>

            {/* ---- Seller portal login (full width) ---- */}
            <section className={`flex flex-col gap-4 p-6 ${panelClass}`}>
              <SectionHeading
                title="Seller portal login"
                subtitle="Lets this seller sign in at /seller/login and add/manage their own products directly, instead of ops doing it on their behalf."
              />

              {/* createdLogin is checked FIRST: creating a login also flips
                  hasLogin to true, and checking hasLogin first meant the
                  one-time password was never shown at all. */}
              {createdLogin ? (
                <div className={`flex flex-col gap-3 p-4 ${groupClass} border-teal-deep/25`}>
                  <p className="text-sm font-semibold text-teal-deep">
                    Login created — share these with the seller now. The password won&rsquo;t be shown again.
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">Email</p>
                      <p className="mt-1 font-mono text-sm text-ink">{createdLogin.email}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">Temporary password</p>
                      <p className="mt-1 font-mono text-sm text-ink">{createdLogin.tempPassword}</p>
                    </div>
                  </div>
                  <p className="text-xs text-ink/45">
                    They can sign in at <span className="font-mono">/seller/login</span> now, then change the password
                    under <span className="font-mono">Account</span> in the seller portal.
                  </p>
                </div>
              ) : hasLogin ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-teal-deep">
                    <Check size={15} />
                    This seller has a login.
                  </div>
                  <button
                    type="button"
                    onClick={handleResetLogin}
                    disabled={resettingLogin}
                    className="flex-none rounded-xl border border-ink/15 bg-card px-4 py-2 text-sm font-semibold text-ink/70 transition-colors hover:border-ink/30 hover:text-ink disabled:opacity-50"
                  >
                    {resettingLogin ? 'Resetting…' : 'Reset password'}
                  </button>
                  {loginError && <p className="text-xs font-semibold text-red-700 sm:basis-full">{loginError}</p>}
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <Field label="Login email" className="flex-1">
                      <input
                        type="email"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        placeholder="seller@example.com"
                        className={inputClass}
                      />
                    </Field>
                    <button
                      type="button"
                      onClick={handleCreateLogin}
                      disabled={creatingLogin || !loginEmail.trim()}
                      className="flex flex-none items-center gap-1.5 rounded-xl bg-teal-deep px-4 py-2.5 text-sm font-semibold text-parchment shadow-[0_10px_28px_-10px_rgba(11,114,128,0.55)] transition-all hover:bg-teal active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-ink/20 disabled:shadow-none"
                    >
                      {creatingLogin ? (
                        <>
                          <Loader2 size={14} className="animate-spin" /> Creating…
                        </>
                      ) : (
                        <>
                          <UserPlus size={14} /> Create seller login
                        </>
                      )}
                    </button>
                  </div>
                  {loginError && <p className="text-xs font-semibold text-red-700">{loginError}</p>}
                  <p className="text-xs text-ink/40">
                    Creates a real account for this seller and links it to this store. Defaults to the contact email
                    above — change it first if products should be managed by someone else.
                  </p>
                </>
              )}
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
 * at t=0 — a plain requestAnimationFrame handoff rather than pulling in an
 * animation library for one moment. The checkmark badge is delayed slightly
 * behind the logo so it reads as "found it, then confirmed".
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