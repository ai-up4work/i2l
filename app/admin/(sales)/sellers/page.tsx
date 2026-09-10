'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Inbox, Plus, Search, SearchX } from 'lucide-react'

import { ADMIN_SELLERS, STATUS_LABEL, STATUS_STYLE, type AdminSeller, type SellerStatus } from '@/data/sellers/data'
import { useSequentialLiveProductCounts, type LiveCountEntry } from '@/hooks/useSequentialLiveProductCounts'

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
// Deliberately sequential rather than one fetch per row in parallel: that
// would mean N simultaneous requests to N different third-party stores
// just from opening this list.
// ---------------------------------------------------------------------------

type StatusFilter = 'all' | SellerStatus

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
    <div className="mx-auto max-w-5xl px-6 pb-20 pt-8 lg:px-10">
      {/* ── Header ── */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-3xl text-ink">Sellers</h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-ink/60">
            Affiliated stores feeding the catalogue. Add a new one manually, or open an existing
            seller to edit their details or extractor config.
          </p>
        </div>

        <button
          type="button"
          onClick={() => router.push('/admin/sellers/new')}
          className="flex flex-none items-center gap-1.5 rounded-xl bg-teal-deep px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-teal active:scale-[0.98]"
        >
          <Plus size={15} />
          Add seller
        </button>
      </div>

      {/* ── Filters ── */}
      <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {(['all', 'active', 'pending_review', 'inactive'] as StatusFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setStatusFilter(f)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal ${
                statusFilter === f
                  ? 'bg-ink text-white'
                  : 'bg-ink/5 text-ink/60 hover:bg-ink/10 hover:text-ink/80'
              }`}
            >
              {f === 'all' ? 'All' : STATUS_LABEL[f]}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-56">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search store or feed type"
            className="w-full rounded-lg border border-ink/15 bg-white py-2 pl-8 pr-3 text-sm text-ink outline-none transition-colors focus:border-teal/50 focus:ring-2 focus:ring-teal/15"
          />
        </div>
      </div>

      {/* ── Result count ── */}
      <p className="mt-3 text-xs text-ink/40">
        {filtered.length === ADMIN_SELLERS.length
          ? `${ADMIN_SELLERS.length} seller${ADMIN_SELLERS.length === 1 ? '' : 's'}`
          : `${filtered.length} of ${ADMIN_SELLERS.length} sellers`}
      </p>

      {/* ── Table ── */}
      <div className="mt-3 overflow-hidden rounded-xl border border-ink/10 bg-card">
        <div className="sticky top-0 z-10 hidden grid-cols-[1.6fr_1fr_0.9fr_0.8fr_0.8fr_1fr] gap-2 border-b border-ink/10 bg-card px-4 py-2.5 text-xs font-semibold text-ink/45 sm:grid">
          <span>Store</span>
          <span>Feed type</span>
          <span className="text-right">Products</span>
          <span className="text-right">Pending orders</span>
          <span>Status</span>
          <span>Joined</span>
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
      <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
        <SearchX size={22} className="text-ink/25" />
        <div>
          <p className="text-sm font-semibold text-ink/70">No sellers match this filter</p>
          <p className="mt-1 text-xs text-ink/45">Try a different search term or status.</p>
        </div>
        <button
          type="button"
          onClick={onClearFilters}
          className="mt-1 text-xs font-semibold text-teal-deep underline decoration-dotted underline-offset-2 hover:text-teal"
        >
          Clear filters
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
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
        className="mt-1 flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-ink/85"
      >
        <Plus size={13} />
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
      className="grid w-full cursor-pointer grid-cols-2 items-center gap-2 border-b border-ink/10 px-4 py-3.5 text-left outline-none transition-colors last:border-b-0 hover:bg-ink/[0.025] focus-visible:bg-teal/[0.05] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-teal/40 sm:grid-cols-[1.6fr_1fr_0.9fr_0.8fr_0.8fr_1fr]"
    >
      <span className="col-span-2 truncate text-sm font-semibold text-ink sm:col-span-1">{seller.store.name}</span>

      <span className="hidden truncate text-sm text-ink/60 sm:block capitalize">
        {seller.providerConfig.type === 'html-scrape' ? 'Custom (HTML)' : seller.providerConfig.type}
      </span>

      <span className="hidden justify-self-end sm:block">
        <ProductsCell seller={seller} live={live} onRefresh={onRefreshLive} />
      </span>

      <span className="hidden text-right text-sm text-ink/60 sm:block">{seller.admin.ordersPending}</span>

      <span className="hidden sm:block">
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[seller.admin.status]}`}>
          {STATUS_LABEL[seller.admin.status]}
        </span>
      </span>

      <span className="hidden text-xs text-ink/45 sm:block">
        {new Date(seller.admin.joinedAt).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })}
      </span>

      {/* mobile-only: products + status chip since the grid above collapses */}
      <span className="sm:hidden flex items-center gap-2 justify-self-end">
        <ProductsCell seller={seller} live={live} onRefresh={onRefreshLive} />
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[seller.admin.status]}`}>
          {STATUS_LABEL[seller.admin.status]}
        </span>
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
    return <span className="text-sm text-ink/60">{cached ?? '\u2014'}</span>
  }

  const status = live?.status ?? 'pending'
  const stop = (e: React.MouseEvent) => e.stopPropagation()

  if (status === 'pending' || status === 'loading') {
    return (
      <span
        className="inline-flex items-center gap-1.5"
        title={status === 'loading' ? "Fetching this seller's live count\u2026" : 'Queued \u2014 checking live counts one at a time'}
      >
        <span className="h-3 w-7 animate-pulse rounded bg-ink/10" />
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
        className="text-sm text-red-600/70 underline decoration-dotted underline-offset-2 hover:text-red-600"
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
      className="text-sm font-semibold text-teal-deep underline decoration-transparent underline-offset-2 transition-colors hover:decoration-teal-deep/40"
    >
      {live?.count}
      {live?.atLeast && '+'}
    </button>
  )
}