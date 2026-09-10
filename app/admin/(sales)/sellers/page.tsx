'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search } from 'lucide-react'

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

  return (
    <div className="mx-auto max-w-5xl px-6 pb-20 pt-8 lg:px-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-3xl text-ink">Sellers</h1>
          <p className="mt-2 max-w-lg text-sm text-ink/60">
            Affiliated stores feeding the catalogue. Add a new one manually, or open an existing
            seller to edit their details or extractor config.
          </p>
        </div>

        <button
          type="button"
          onClick={() => router.push('/admin/sellers/new')}
          className="flex flex-none items-center gap-1.5 rounded-xl bg-teal-deep px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-teal active:scale-[0.98]"
        >
          <Plus size={15} />
          Add seller
        </button>
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {(['all', 'active', 'pending_review', 'inactive'] as StatusFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setStatusFilter(f)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                statusFilter === f ? 'bg-ink text-white' : 'bg-ink/5 text-ink/60 hover:bg-ink/10'
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
            className="w-full rounded-lg border border-ink/15 bg-white py-1.5 pl-8 pr-3 text-sm text-ink outline-none focus:border-teal/50"
          />
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-ink/10 bg-card">
        <div className="hidden grid-cols-[1.6fr_1fr_0.9fr_0.8fr_0.8fr_1fr] gap-2 border-b border-ink/10 px-4 py-2.5 text-xs font-semibold text-ink/45 sm:grid">
          <span>Store</span>
          <span>Feed type</span>
          <span className="text-right">Products</span>
          <span className="text-right">Pending orders</span>
          <span>Status</span>
          <span>Joined</span>
        </div>

        {filtered.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-ink/45">No sellers match this filter.</p>
        )}

        {filtered.map((s) => (
          <SellerRow
            key={s.platform}
            seller={s}
            live={liveCounts[s.platform]}
            onRefreshLive={() => refreshLiveCount(s.platform)}
            onOpen={() => router.push(`/admin/sellers/${s.platform}`)}
          />
        ))}
      </div>
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
      className="grid w-full cursor-pointer grid-cols-2 items-center gap-2 border-b border-ink/10 px-4 py-3 text-left last:border-b-0 hover:bg-ink/[0.02] sm:grid-cols-[1.6fr_1fr_0.9fr_0.8fr_0.8fr_1fr]"
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
 * Real-feed sellers show the cached count dimmed (with a small pulsing
 * dot) while their turn in the sequential queue hasn't come up yet or is
 * in flight, then swap to the confirmed live count once settled. On
 * error, falls back to the cached number with a retry affordance.
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
        className="inline-flex items-center gap-1.5 text-sm text-ink/40"
        title={status === 'loading' ? "Fetching this seller's live count\u2026" : 'Queued \u2014 checking live counts one at a time'}
      >
        <span className="animate-pulse">{cached ?? '\u2014'}</span>
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink/25" />
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
        className="text-sm text-red-600/70 underline decoration-dotted"
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
      className="text-sm font-semibold text-teal-deep"
    >
      {live?.count}
      {live?.atLeast && '+'}
    </button>
  )
}