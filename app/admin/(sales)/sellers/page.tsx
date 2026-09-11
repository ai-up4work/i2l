'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Calendar,
  ChevronRight,
  Inbox,
  Plus,
  Search,
  SearchX,
  ShoppingBag,
} from 'lucide-react'
import Image from 'next/image'

import { ADMIN_SELLERS, STATUS_LABEL, type AdminSeller, type SellerStatus } from '@/data/sellers/data'
import { useSequentialLiveProductCounts, type LiveCountEntry } from '@/hooks/useSequentialLiveProductCounts'
import { panelClass } from '@/components/admin/shared'

const storeIcon = {
  shopify: '/shopify.png',
  woocommerce: '/woo.png',
  jsonapi: '/json.png',
  'html-scrape': '/custom.png',
  mock: '/mock.png',
} as const

// ---------------------------------------------------------------------------
// /admin/sellers — Sales & Purchase Executive
// View the list of affiliated sellers; search/filter by status.
// Reads ADMIN_SELLERS, which is derived live from data/stores/data.ts's
// affiliatedStores + lib/store-config.ts's STORE_PROVIDERS — the same
// sources app/api/stores/[platform]/route.ts reads for the storefront.
//
// Product counts start from the cached AffiliatedStore.itemCount so the
// page paints instantly, then every seller with a real feed is checked
// against app/api/stores/[platform] ONE AT A TIME in list order (see
// useSequentialLiveProductCounts) — each row keeps its cached number,
// dimmed, until its turn comes up and it's replaced with the real total.
//
// Visual design: solid parchment/white surfaces, one soft shadow on the
// table panel — no glass, no blur, since there's nothing behind these
// panels worth frosting. Teal is the working accent (CTAs, live counts,
// active status, links); gold is reserved for the one thing that needs a
// second look (pending review) and never used as a background fill;
// indigo sits in the avatar rotation for a touch of the "weight & trust"
// dark tone. Each row carries a thin left-edge bar in its status colour,
// echoed by the sidebar's active-link accent, so the same visual grammar
// means "this one" everywhere in the admin.
// ---------------------------------------------------------------------------

type StatusFilter = 'all' | SellerStatus

const STATUS_DOT: Record<SellerStatus, string> = {
  active: 'bg-teal-deep',
  pending_review: 'bg-gold-deep',
  inactive: 'bg-ink/30',
}
const STATUS_PILL: Record<SellerStatus, string> = {
  active: 'bg-teal/12 text-teal-deep ring-1 ring-inset ring-teal/25',
  pending_review: 'bg-gold/15 text-gold-deep ring-1 ring-inset ring-gold/30',
  inactive: 'bg-ink/[0.05] text-ink/50 ring-1 ring-inset ring-ink/10',
}
const STATUS_EDGE: Record<SellerStatus, string> = {
  active: 'before:bg-teal-deep/70',
  pending_review: 'before:bg-gold-deep',
  inactive: 'before:bg-transparent',
}

// Avatar fill rotates through the trust/weight and accent tones only —
// gold is kept out of this pool since it's reserved for badges, not fills.
const AVATAR_COLORS = [
  'bg-indigo text-parchment',
  'bg-teal-deep text-parchment',
  'bg-ink text-parchment',
  'bg-indigo-deep text-parchment',
  'bg-teal/20 text-teal-deep',
  'bg-ink/10 text-ink',
]
function avatarColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}
function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0]
}

const COLUMNS = ['Store', 'Feed type', 'Products', 'Pending orders', 'Status', 'Joined']

export default function SellersListPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  // Queue is built from the full seller list (not the filtered view) so
  // searching/filtering doesn't restart or reorder in-flight fetching.
  const liveFeedPlatforms = useMemo(
    () => ADMIN_SELLERS.filter((s) => s.providerConfig.type !== 'mock').map((s) => s.platform),
    []
  )
  const { entries: liveCounts, refresh: refreshLiveCount } = useSequentialLiveProductCounts(liveFeedPlatforms)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return ADMIN_SELLERS.filter((s) => {
      const matchesSearch =
        !q ||
        s.store.name.toLowerCase().includes(q) ||
        s.providerConfig.type.toLowerCase().includes(q)
      const matchesStatus = statusFilter === 'all' || s.admin.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [search, statusFilter])

  const hasAnyFilter = search.trim().length > 0 || statusFilter !== 'all'
  const clearFilters = () => {
    setSearch('')
    setStatusFilter('all')
  }

  return (
    <div className="min-h-screen bg-parchment font-body text-ink">
      <div className="mx-auto max-w-[1560px] px-6 pb-20 pt-10 lg:px-10">
        {/* ── Header ── */}
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 flex-none place-items-center rounded-2xl border border-ink/10 bg-card text-teal-deep shadow-[0_1px_2px_rgba(32,36,43,0.04),0_16px_40px_-24px_rgba(14,140,156,0.4)]">
              <ShoppingBag size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-display text-3xl text-ink">Sellers</h1>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink/60">
                Affiliated stores feeding the catalogue. Add a new one manually, or open an
                existing seller to edit their details or extractor config.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => router.push('/admin/sellers/new')}
            className="flex flex-none items-center gap-1.5 rounded-xl bg-teal-deep px-4 py-2.5 text-sm font-semibold text-parchment shadow-[0_10px_28px_-10px_rgba(11,114,128,0.55)] transition-all hover:bg-teal active:scale-[0.98]"
          >
            <Plus size={16} strokeWidth={2.5} />
            Add seller
          </button>
        </div>

        {/* ── Filters ── */}
        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-1 rounded-full border border-ink/10 bg-card p-1">
            {(['all', 'active', 'pending_review', 'inactive'] as StatusFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setStatusFilter(f)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal ${
                  statusFilter === f
                    ? 'bg-teal-deep text-parchment shadow-[0_6px_18px_-8px_rgba(14,140,156,0.5)]'
                    : 'text-ink/55 hover:text-ink/80'
                }`}
              >
                {f === 'all' ? 'All' : STATUS_LABEL[f]}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/35" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search store or feed type..."
              className="w-full rounded-full border border-ink/10 bg-card py-2.5 pl-9 pr-4 text-sm text-ink placeholder:text-ink/35 outline-none transition-colors focus:border-teal/50 focus:ring-2 focus:ring-teal/15"
            />
          </div>
        </div>

        {/* ── Result count ── */}
        <p className="mt-4 text-xs font-medium text-ink/40">
          {filtered.length === ADMIN_SELLERS.length
            ? `${ADMIN_SELLERS.length} seller${ADMIN_SELLERS.length === 1 ? '' : 's'}`
            : `${filtered.length} of ${ADMIN_SELLERS.length} sellers`}
        </p>

        {/* ── Table ── */}
        <div className={`mt-3 overflow-hidden ${panelClass}`}>
          <div className="sticky top-0 z-10 hidden grid-cols-[1.6fr_1fr_0.9fr_1fr_0.9fr_1fr] gap-2 border-b border-ink/10 bg-parchment/70 px-5 py-3 text-[11px] font-semibold tracking-wide text-ink/45 sm:grid">
            {COLUMNS.map((label, i) => (
              <span key={label} className={i >= 2 && i <= 3 ? 'text-right' : ''}>
                {label}
              </span>
            ))}
          </div>

          {filtered.length === 0 ? (
            <EmptyState hasAnyFilter={hasAnyFilter} onClearFilters={clearFilters} />
          ) : (
            filtered.map((s) => (
              <SellerRow
                key={s.platform}
                seller={s}
                live={liveCounts[s.platform]}
                onRefreshLive={() => refreshLiveCount(s.platform)}
                onOpen={() => router.push(`/admin/sellers/${s.platform}`)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Distinguishes "nothing matches your search/filter" (recoverable, offer
 * to clear) from "there are no sellers yet" (an onboarding moment, offer
 * to add one) — the two have different causes and different fixes, so
 * they get different copy and a different action.
 */
function EmptyState({
  hasAnyFilter,
  onClearFilters,
}: {
  hasAnyFilter: boolean
  onClearFilters: () => void
}) {
  const router = useRouter()

  if (hasAnyFilter) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
        <SearchX size={22} className="text-ink/25" />
        <div>
          <p className="text-sm font-semibold text-ink/70">No sellers match this filter</p>
          <p className="mt-1 text-xs text-ink/45">Try a different search term or status.</p>
        </div>
        <button
          type="button"
          onClick={onClearFilters}
          className="mt-1 text-xs font-semibold text-teal-deep underline decoration-dotted underline-offset-4 hover:text-teal"
        >
          Clear filters
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
      <Inbox size={22} className="text-ink/25" />
      <div>
        <p className="text-sm font-semibold text-ink/70">No sellers yet</p>
        <p className="mt-1 max-w-xs text-xs text-ink/45">
          Add your first affiliated store to start feeding the catalogue.
        </p>
      </div>
      <button
        type="button"
        onClick={() => router.push('/admin/sellers/new')}
        className="mt-1 flex items-center gap-1.5 rounded-lg bg-teal-deep px-3 py-1.5 text-xs font-semibold text-parchment transition-colors hover:bg-teal"
      >
        <Plus size={13} strokeWidth={2.5} />
        Add seller
      </button>
    </div>
  )
}

function SellerRow({
  seller,
  live,
  onRefreshLive,
  onOpen,
}: {
  seller: AdminSeller
  live?: LiveCountEntry
  onRefreshLive: () => void
  onOpen: () => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onOpen()
      }}
      className={`group relative grid w-full cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-ink/[0.06] px-5 py-3.5 pl-6 text-left outline-none transition-colors before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:content-[''] last:border-b-0 hover:bg-parchment/50 focus-visible:bg-teal/[0.08] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-teal/40 sm:grid-cols-[1.6fr_1fr_0.9fr_1fr_0.9fr_1fr_auto] ${STATUS_EDGE[seller.admin.status]}`}
    >
      {/* Store — avatar + name */}
      <span className="col-span-2 flex min-w-0 items-center gap-3 sm:col-span-1">
        <span
          className={`grid h-10 w-10 flex-none place-items-center overflow-hidden rounded-full text-[11px] font-bold uppercase ${
            seller.store.logo ? '' : avatarColor(seller.store.name)
          }`}
        >
          {seller.store.logo ? (
            <Image src={seller.store.logo} alt="" className="h-10 w-10 rounded-full object-cover" width={40} height={40} />
          ) : (
            initials(seller.store.name)
          )}
        </span>
        <span className="truncate text-sm font-semibold text-ink">{seller.store.name}</span>
      </span>

      <span className="hidden items-center gap-2 sm:flex">
        <Image src={storeIcon[seller.providerConfig.type]} alt="" width={20} height={20} className="flex-none rounded" />
        <span className="truncate text-sm text-ink/55">
          {seller.providerConfig.type === 'html-scrape'
            ? 'Custom (HTML)'
            : seller.providerConfig.type === 'woocommerce'
              ? 'Woocommerce'
              : seller.providerConfig.type === 'shopify'
                ? 'Shopify'
                : seller.providerConfig.type}
        </span>
      </span>

      <span className="hidden justify-self-end sm:block">
        <ProductsCell seller={seller} live={live} onRefresh={onRefreshLive} />
      </span>

      <span className="hidden justify-self-end text-sm text-ink/55 sm:block">{seller.admin.ordersPending}</span>

      <span className="hidden sm:block">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_PILL[seller.admin.status]}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[seller.admin.status]}`} />
          {STATUS_LABEL[seller.admin.status]}
        </span>
      </span>

      <span className="hidden items-center gap-1.5 text-xs text-ink/40 sm:flex">
        <Calendar size={12} />
        {new Date(seller.admin.joinedAt).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })}
      </span>

      <ChevronRight size={16} className="hidden flex-none text-ink/25 transition-colors group-hover:text-ink/50 sm:block" />

      {/* mobile-only: products + status chip since the grid above collapses */}
      <span className="col-span-3 flex items-center justify-between gap-2 pl-11 sm:hidden">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_PILL[seller.admin.status]}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[seller.admin.status]}`} />
          {STATUS_LABEL[seller.admin.status]}
        </span>
        <ProductsCell seller={seller} live={live} onRefresh={onRefreshLive} />
      </span>
    </div>
  )
}

/**
 * Mock sellers just show the cached count, no feed to check.
 * Real-feed sellers show a compact loading skeleton while their turn in
 * the sequential queue hasn't come up yet or is in flight, then swap to
 * the confirmed live count once settled. On error, falls back to the
 * cached number with a retry affordance.
 */
function ProductsCell({
  seller,
  live,
  onRefresh,
}: {
  seller: AdminSeller
  live?: LiveCountEntry
  onRefresh: () => void
}) {
  const isLiveFeed = seller.providerConfig.type !== 'mock'
  const cached = seller.store.itemCount ?? null

  if (!isLiveFeed) {
    return <span className="text-sm font-semibold text-ink/70">{cached ?? '\u2014'}</span>
  }

  const status = live?.status ?? 'pending'
  const stop = (e: React.MouseEvent) => e.stopPropagation()

  if (status === 'pending' || status === 'loading') {
    return (
      <span
        className="inline-flex items-center gap-1.5"
        title={status === 'loading' ? "Fetching this seller's live count\u2026" : 'Queued \u2014 checking live counts one at a time'}
      >
        <span className="h-3 w-8 animate-pulse rounded bg-ink/10" />
      </span>
    )
  }

  if (status === 'error') {
    return (
      <button
        type="button"
        onClick={(e) => {
          stop(e)
          onRefresh()
        }}
        title={live?.error ?? 'Failed to fetch live count'}
        className="text-sm font-semibold text-gold-deep underline decoration-dotted underline-offset-4 hover:text-gold"
      >
        {cached ?? '\u2014'} (retry)
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        stop(e)
        onRefresh()
      }}
      title={
        live?.atLeast
          ? 'Feed has more pages than this check could see \u2014 showing a lower bound, click to refresh'
          : 'Live count \u2014 click to refresh'
      }
      className="text-sm font-bold text-teal-deep underline decoration-transparent underline-offset-4 transition-colors hover:text-teal hover:decoration-teal/40"
    >
      {live?.count}
      {live?.atLeast && '+'}
    </button>
  )
}