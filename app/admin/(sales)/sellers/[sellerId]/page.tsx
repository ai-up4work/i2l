'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Check, ChevronRight, Settings2 } from 'lucide-react'
import { ArrowLeft } from 'lucide-react'

import { getSeller, STATUS_LABEL, STATUS_STYLE, type SellerStatus } from '@/data/sellers/data'
import { EXTRACTOR_TYPE_LABEL } from '@/data/sellers/data'
import { useLiveProductCount } from '@/hooks/useLiveProductCount'
// ---------------------------------------------------------------------------
// /admin/sellers/[sellerId] — Sales & Purchase Executive
// Edit a seller's profile/details; deactivate a seller (hard delete stays
// Manager/Super-Admin-only per the Roles & Permissions doc §4.1).
//
// [sellerId] is the same `platform` slug used everywhere else (affiliated-
// Stores, STORE_PROVIDERS, /stores/[platform]) — one identifier across the
// whole app, not a separate admin-only seller id.
//
// Editable fields below split into two groups that map to two different
// real destinations once wired up:
//   - Store profile (name, URL)      -> PATCH data/stores/data.ts's affiliatedStores entry
//   - Contact/notes/status           -> PATCH the admin-only seller_admin_meta table
// Feed/extractor setup lives on its own page (see "Scrape config" button)
// since it edits a third destination (STORE_PROVIDERS) with its own shape.
//
// Products stat: for any seller with a real feed (providerConfig.type !==
// 'mock'), the count shown is LIVE — fetched from app/api/stores/[platform],
// the same route the storefront calls — rather than the hand-entered
// `itemCount` on the AffiliatedStore record. Falls back to that saved
// number if the live feed request fails.
//
// Feed overview (below the quick stats): total pages and live categories,
// straight from the same two endpoints the storefront's category dropdown
// and pagination use — app/api/stores/[platform] for pagination meta, and
// app/api/stores/[platform]?collections=1 for the real category/collection
// list. This is diagnostic, not editable: it's here so an admin can sanity-
// check "does this feed's pagination and category data look right" without
// leaving this page. Gracefully degrades per feed type: mock stores have
// neither (no live feed to ask), some providers have no category taxonomy
// to report (jsonapi without a categories endpoint, a WooCommerce store
// with zero populated categories, etc) — each of those states gets its own
// short, honest label rather than a spinner that never resolves.
// ---------------------------------------------------------------------------

const inputClass =
  'w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal/50'

interface StoreApiMeta {
  total: number
  totalPages: number
  totalIsExact?: boolean
}

interface LiveCollection {
  handle: string
  title: string
}

interface LiveCollectionsResponse {
  collections: LiveCollection[]
}

type FeedOverviewStatus = 'idle' | 'loading' | 'ready' | 'error'
type CategoriesStatus = 'idle' | 'loading' | 'live' | 'unavailable'

/**
 * Fetches pagination meta (total items/pages) and the live category list
 * for a seller's feed, in parallel. Local to this page rather than a
 * shared hook — nothing else currently needs both of these together.
 */
function useLiveFeedOverview(platform: string, enabled: boolean) {
  const [status, setStatus] = useState<FeedOverviewStatus>('idle')
  const [meta, setMeta] = useState<StoreApiMeta | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [categoriesStatus, setCategoriesStatus] = useState<CategoriesStatus>('idle')
  const [categories, setCategories] = useState<LiveCollection[]>([])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    setStatus('loading')
    setError(null)
    // per_page=1 — this call only wants the pagination meta (total /
    // totalPages / totalIsExact), not a real page of products.
    fetch(`/api/stores/${platform}?per_page=1`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as StoreApiMeta
        if (cancelled) return
        setMeta({ total: data.total, totalPages: data.totalPages, totalIsExact: data.totalIsExact })
        setStatus('ready')
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to load')
        setStatus('error')
      })

    setCategoriesStatus('loading')
    fetch(`/api/stores/${platform}?collections=1`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as LiveCollectionsResponse
        if (cancelled) return
        setCategories(data.collections ?? [])
        setCategoriesStatus('live')
      })
      .catch(() => {
        // A 400/network failure here just means "this feed type has no
        // live category taxonomy to report" — not a real error worth
        // alarming an admin over, unlike the product-count/meta fetch
        // above which does surface its error.
        if (cancelled) return
        setCategories([])
        setCategoriesStatus('unavailable')
      })

    return () => {
      cancelled = true
    }
  }, [platform, enabled])

  return { status, meta, error, categoriesStatus, categories }
}

export default function SellerDetailPage() {
  const router = useRouter()
  const params = useParams<{ sellerId: string }>()
  const seller = getSeller(params.sellerId)

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

  const isLiveFeed = seller.providerConfig.type !== 'mock'
  const live = useLiveProductCount(seller.platform, isLiveFeed)
  const overview = useLiveFeedOverview(seller.platform, isLiveFeed)

  const [form, setForm] = useState({
    storeName: seller.store.name,
    storeUrl: seller.store.url ?? '',
    contactName: seller.admin.contactName,
    contactEmail: seller.admin.contactEmail,
    contactPhone: seller.admin.contactPhone,
    notes: seller.admin.notes,
    status: seller.admin.status,
  })
  const [saved, setSaved] = useState(false)

  const set =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setForm((prev) => ({ ...prev, [key]: e.target.value }))
      setSaved(false)
    }

  const handleSave = () => {
    // TODO(wire-up): two PATCHes once the APIs exist —
    //   PATCH /api/admin/stores/[platform]      { name: form.storeName, url: form.storeUrl }
    //   PATCH /api/admin/sellers/[platform]/meta { contactName, contactEmail, contactPhone, notes, status }
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2000)
  }

  const handleDeactivate = () => {
    setForm((prev) => ({ ...prev, status: 'inactive' as SellerStatus }))
    // TODO(wire-up): PATCH seller_admin_meta.status -> 'inactive'. No hard
    // delete here by design — the AffiliatedStore/STORE_PROVIDERS entries
    // stay intact so re-activating doesn't mean re-onboarding from scratch.
  }

  return (
    <div className="mx-auto max-w-2xl px-6 pb-20 pt-8 lg:px-10">
      <button
        type="button"
        onClick={() => router.push('/admin/sellers')}
        className="flex items-center gap-1.5 text-sm font-semibold text-ink/50 hover:text-ink"
      >
        <ArrowLeft size={14} />
        Sellers
      </button>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-3xl text-ink">{seller.store.name}</h1>
          <p className="mt-1 text-sm text-ink/50">{EXTRACTOR_TYPE_LABEL[seller.providerConfig.type]}</p>
        </div>

        <button
          type="button"
          onClick={() => router.push(`/admin/sellers/${seller.platform}/scrape-config`)}
          className="flex flex-none items-center gap-1.5 rounded-xl border border-ink/15 bg-card px-4 py-2 text-sm font-semibold text-ink transition-all hover:border-teal/50"
        >
          <Settings2 size={14} />
          Scrape config
        </button>
      </div>

      {/* Snapshot stats */}
      <div className="mt-6 grid grid-cols-3 gap-3">
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
        <Stat label="Orders received" value={seller.admin.ordersReceived} />
        <Stat label="Pending orders" value={seller.admin.ordersPending} />
      </div>

      {isLiveFeed && live.error && (
        <p className="mt-2 text-xs text-red-600/70">
          Couldn&rsquo;t reach the live feed just now ({live.error}) &mdash; showing the last saved count instead.{' '}
          <button type="button" onClick={live.refresh} className="font-semibold underline">
            Retry
          </button>
        </p>
      )}

      {isLiveFeed &&
        !live.loading &&
        !live.error &&
        live.count !== null &&
        live.count !== (seller.store.itemCount ?? 0) && (
          <p className="mt-2 text-xs text-ink/40">
            Saved count ({seller.store.itemCount ?? 0}) is out of date &mdash; live feed just returned{' '}
            {live.count}.
            <button type="button" onClick={live.refresh} className="ml-2 font-semibold text-ink/60 underline">
              Refresh
            </button>
          </p>
        )}

      {/* Feed overview — pagination meta + live categories, read-only */}
      {isLiveFeed && (
        <div className="mt-6 rounded-xl border border-ink/10 bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">Feed overview</p>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <MiniStat
              label="Total products"
              value={
                overview.status === 'loading'
                  ? '\u2026'
                  : overview.status === 'error'
                  ? '\u2014'
                  : `${overview.meta?.total ?? '\u2014'}${overview.meta?.totalIsExact === false ? '+' : ''}`
              }
              hint={
                overview.status === 'ready' && overview.meta?.totalIsExact === false
                  ? 'Lower bound — feed has more pages than could be confirmed'
                  : overview.status === 'ready' && overview.meta?.totalIsExact
                  ? 'Exact count from the live feed'
                  : undefined
              }
            />
            <MiniStat
              label="Total pages"
              value={overview.status === 'loading' ? '\u2026' : overview.status === 'error' ? '\u2014' : overview.meta?.totalPages ?? '\u2014'}
            />
            <MiniStat
              label="Categories"
              value={
                overview.categoriesStatus === 'loading'
                  ? '\u2026'
                  : overview.categoriesStatus === 'unavailable'
                  ? '\u2014'
                  : overview.categories.length
              }
              hint={overview.categoriesStatus === 'unavailable' ? 'Not available for this feed type' : undefined}
            />
          </div>

          {overview.status === 'error' && (
            <p className="mt-3 text-xs text-red-600/70">Couldn&rsquo;t load feed pagination ({overview.error}).</p>
          )}

          {overview.categoriesStatus === 'live' && overview.categories.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-ink/45">Live categories</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {overview.categories.map((c) => (
                  <span
                    key={c.handle}
                    className="rounded-full border border-ink/10 bg-ink/[0.03] px-2.5 py-1 text-xs text-ink/65"
                  >
                    {c.title}
                  </span>
                ))}
              </div>
            </div>
          )}

          {overview.categoriesStatus === 'live' && overview.categories.length === 0 && (
            <p className="mt-4 text-xs text-ink/40">This feed reported no populated categories.</p>
          )}

          <button
            type="button"
            onClick={() => router.push(`/stores/${seller.platform}`)}
            className="mt-4 flex items-center gap-1 text-xs font-semibold text-teal-deep hover:underline"
          >
            View storefront
            <ChevronRight size={12} />
          </button>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-5 rounded-xl border border-ink/10 bg-card p-5">
        <Field label="Store name">
          <input type="text" value={form.storeName} onChange={set('storeName')} className={inputClass} />
        </Field>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Feed type">
            <input
              type="text"
              value={EXTRACTOR_TYPE_LABEL[seller.providerConfig.type]}
              disabled
              className={`${inputClass} cursor-not-allowed bg-ink/5 text-ink/50`}
            />
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={set('status')} className={inputClass}>
              <option value="active">{STATUS_LABEL.active}</option>
              <option value="pending_review">{STATUS_LABEL.pending_review}</option>
              <option value="inactive">{STATUS_LABEL.inactive}</option>
            </select>
          </Field>
        </div>
        <p className="-mt-3 text-xs text-ink/40">
          Feed type is set on the Scrape config page, not here — it changes how products get
          pulled in, which is a bigger action than editing a profile field.
        </p>

        <Field label="Store URL">
          <input type="url" value={form.storeUrl} onChange={set('storeUrl')} className={inputClass} />
        </Field>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Contact name">
            <input type="text" value={form.contactName} onChange={set('contactName')} className={inputClass} />
          </Field>
          <Field label="Contact phone">
            <input type="tel" value={form.contactPhone} onChange={set('contactPhone')} className={inputClass} />
          </Field>
        </div>

        <Field label="Contact email">
          <input type="email" value={form.contactEmail} onChange={set('contactEmail')} className={inputClass} />
        </Field>

        <Field label="Notes">
          <textarea value={form.notes} onChange={set('notes')} rows={3} className={inputClass} />
        </Field>

        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={handleDeactivate}
            disabled={form.status === 'inactive'}
            className="rounded-xl border border-red-600/25 px-4 py-2 text-sm font-semibold text-red-700 transition-all hover:bg-red-600/5 disabled:cursor-not-allowed disabled:border-ink/10 disabled:text-ink/30"
          >
            Deactivate seller
          </button>

          <div className="flex items-center gap-3">
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
              Save changes
            </button>
          </div>
        </div>
      </div>

      <p className="mt-4 text-xs text-ink/35">
        Hard delete isn&rsquo;t available here by design — only Manager and Super Admin can delete
        a seller record outright. Deactivating hides the store without orphaning open orders.
      </p>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-ink/10 bg-card px-4 py-3 text-center">
      <p className="text-xl font-semibold text-ink">{value}</p>
      <p className="mt-0.5 text-xs text-ink/50">{label}</p>
    </div>
  )
}

/** Smaller, left-aligned stat used inside the Feed overview panel — the
 * panel already has its own card/border, so these stay flush rather than
 * repeating the bordered-box treatment of the top-level Stat cards. */
function MiniStat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div title={hint}>
      <p className="text-lg font-semibold text-ink">{value}</p>
      <p className="text-xs text-ink/45">{label}</p>
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