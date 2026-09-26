// app/admin/sellers/page.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronRight, Inbox, Loader2, Plus, Search, SearchX, ShoppingBag } from "lucide-react"

import { STATUS_LABEL, mapDbRowToAdminSeller, type AdminSeller, type SellerStatus } from "@/data/sellers/data"
import { useSequentialLiveProductCounts, type LiveCountEntry } from "@/hooks/useSequentialLiveProductCounts"

// Sellers: the affiliated stores feeding the catalogue. Same list recipe as
// Delivered (table-style rows on a shared GRID), Requests (status tabs with
// counts) and Orders (clickable row plus a real <Link> on the name).
//
// Data: /api/admin/sellers, mapped by mapDbRowToAdminSeller. Product counts
// paint instantly from the cached AffiliatedStore.itemCount, then every seller
// with a real feed is checked against /api/stores/[platform] ONE AT A TIME in
// list order (useSequentialLiveProductCounts). The queue is built from the full
// seller list, so searching or filtering never restarts or reorders it.
//
// Only sellers waiting on a review get a left edge (gold, the one tone kept for
// "needs a second look"), so the eye goes straight to them.

const STORE_ICON = {
  shopify: "/shopify.png",
  woocommerce: "/woo.png",
  jsonapi: "/json.png",
  "html-scrape": "/custom.png",
  mock: "/custom-made.png",
} as const

const FEED_LABEL: Record<keyof typeof STORE_ICON, string> = {
  shopify: "Shopify",
  woocommerce: "WooCommerce",
  jsonapi: "JSON API",
  "html-scrape": "Custom (HTML)",
  mock: "Mock",
}

type StatusFilter = "all" | SellerStatus

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: STATUS_LABEL.active },
  { key: "pending_review", label: STATUS_LABEL.pending_review },
  { key: "inactive", label: STATUS_LABEL.inactive },
]

const STATUS_TONE: Record<SellerStatus, { pill: string; dot: string }> = {
  active: { pill: "bg-teal/12 text-teal-deep ring-1 ring-inset ring-teal/25", dot: "bg-teal-deep" },
  pending_review: { pill: "bg-gold/15 text-gold-deep ring-1 ring-inset ring-gold/30", dot: "bg-gold-deep" },
  inactive: { pill: "bg-ink/[0.04] text-ink/60 ring-1 ring-inset ring-ink/10", dot: "bg-ink/30" },
}

// Shared by the header row and every row so the columns always line up.
const GRID =
  "sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,0.9fr)_1.5rem]"

const COLUMNS: { label: string; right?: boolean }[] = [
  { label: "Store" },
  { label: "Feed type" },
  { label: "Products", right: true },
  { label: "Pending orders", right: true },
  { label: "Status" },
  { label: "Joined" },
]

const STATE_SHELL = "flex flex-col items-center gap-3 px-4 py-16 text-center"
const LINK_BUTTON = "text-xs font-semibold text-teal-deep underline decoration-dotted underline-offset-4 hover:text-teal"

// Avatar fill rotates through the trust/weight and accent tones only. Gold is
// kept out of this pool since it's reserved for badges, not fills.
const AVATAR_COLORS = [
  "bg-indigo text-parchment",
  "bg-teal-deep text-parchment",
  "bg-ink text-parchment",
  "bg-indigo-deep text-parchment",
  "bg-teal/20 text-teal-deep",
  "bg-ink/10 text-ink",
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

function formatJoined(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

function StatusPill({ status }: { status: SellerStatus }) {
  const tone = STATUS_TONE[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${tone.pill}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  )
}

export default function SellersListPage() {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [sellers, setSellers] = useState<AdminSeller[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    fetch("/api/admin/sellers")
      .then(async (res) => {
        const body = await res.json()
        if (!res.ok) throw new Error(body.error ?? "Failed to load sellers")
        return body.sellers as Record<string, unknown>[]
      })
      .then((rows) => {
        if (!cancelled) setSellers(rows.map(mapDbRowToAdminSeller))
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Failed to load sellers")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  // anishka-creation is a deliberate exception: its saved provider_config
  // is 'mock' (nothing in it actually gets read anymore — see
  // lib/store-providers/sellers/anishka-creation.ts), but it has a real
  // hardcoded feed behind it, called by platform slug regardless of the
  // saved config. Without this OR, its Products count would never join
  // the live-count queue at all.
  const liveFeedPlatforms = useMemo(
    () => sellers.filter((s) => s.providerConfig.type !== "mock" || s.platform === 'anishka-creation').map((s) => s.platform),
    [sellers],
  )
  const { entries: liveCounts, refresh: refreshLiveCount } = useSequentialLiveProductCounts(liveFeedPlatforms)

  // Search scopes everything, including the tab counts, so a count always
  // matches what the tab would show.
  const searched = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return sellers
    return sellers.filter(
      (s) =>
        s.store.name.toLowerCase().includes(q) ||
        s.providerConfig.type.toLowerCase().includes(q) ||
        FEED_LABEL[s.providerConfig.type].toLowerCase().includes(q),
    )
  }, [sellers, search])

  const counts = useMemo(() => {
    const base = {} as Record<StatusFilter, number>
    for (const f of FILTERS) {
      base[f.key] = searched.filter((s) => f.key === "all" || s.admin.status === f.key).length
    }
    return base
  }, [searched])

  const filtered = useMemo(
    () => searched.filter((s) => statusFilter === "all" || s.admin.status === statusFilter),
    [searched, statusFilter],
  )

  const settled = !loading && !loadError
  const activeCount = sellers.filter((s) => s.admin.status === "active").length
  const pendingReviewCount = sellers.filter((s) => s.admin.status === "pending_review").length
  const pendingOrderCount = sellers.reduce((sum, s) => sum + s.admin.ordersPending, 0)
  const hasSearch = search.trim() !== ""
  const stat = (n: number) => (settled ? n : "\u2014")

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      <div className="mx-auto max-w-[1560px] px-6 pb-20 pt-10 lg:px-10">
        {/* ── Header ── */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-teal-deep text-parchment">
              <ShoppingBag size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-display text-3xl font-semibold leading-tight">Sellers</h1>
              <p className="mt-1 max-w-md text-sm leading-relaxed text-ink/60">
                Affiliated stores feeding the catalogue. Open a seller to edit their details or extractor config.
              </p>
            </div>
          </div>

          <dl className="flex divide-x divide-ink/10 overflow-x-auto rounded-2xl border border-ink/10 bg-card">
            <div className="px-5 py-3">
              <dt className="whitespace-nowrap text-xs font-medium text-ink/45">Sellers</dt>
              <dd className="mt-0.5 font-display text-xl text-ink">{stat(sellers.length)}</dd>
            </div>
            <div className="px-5 py-3">
              <dt className="whitespace-nowrap text-xs font-medium text-ink/45">Active</dt>
              <dd className="mt-0.5 font-display text-xl text-ink">{stat(activeCount)}</dd>
            </div>
            <div className="px-5 py-3">
              <dt className="whitespace-nowrap text-xs font-medium text-ink/45">Pending review</dt>
              <dd className={`mt-0.5 font-display text-xl ${settled && pendingReviewCount > 0 ? "text-gold-deep" : "text-ink"}`}>
                {stat(pendingReviewCount)}
              </dd>
            </div>
            <div className="px-5 py-3">
              <dt className="whitespace-nowrap text-xs font-medium text-ink/45">Pending orders</dt>
              <dd className="mt-0.5 font-display text-xl text-ink">{stat(pendingOrderCount)}</dd>
            </div>
          </dl>
        </div>

        {/* ── Filters ── */}
        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div role="tablist" aria-label="Filter by status" className="flex flex-wrap gap-1 rounded-full border border-ink/10 bg-card p-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={statusFilter === f.key}
                onClick={() => setStatusFilter(f.key)}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-teal/40 ${
                  statusFilter === f.key ? "bg-teal-deep text-parchment" : "text-ink/55 hover:text-ink/80"
                }`}
              >
                {f.label}
                <span className={statusFilter === f.key ? "text-parchment/70" : "text-ink/35"}>{counts[f.key]}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-72">
              <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/35" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search store or feed type"
                aria-label="Search store or feed type"
                className="w-full rounded-full border border-ink/10 bg-card py-2.5 pl-9 pr-4 text-sm placeholder:text-ink/35 outline-none transition-colors focus:border-teal/50 focus:ring-2 focus:ring-teal/15"
              />
            </div>
            <Link
              href="/admin/sellers/new"
              className="inline-flex flex-none items-center justify-center gap-1.5 rounded-full bg-teal-deep px-4 py-2.5 text-sm font-semibold text-parchment outline-none transition-colors hover:bg-teal focus-visible:ring-2 focus-visible:ring-teal/40 focus-visible:ring-offset-2 focus-visible:ring-offset-parchment"
            >
              <Plus size={15} strokeWidth={2.5} aria-hidden />
              Add seller
            </Link>
          </div>
        </div>

        {/* ── Result count ── */}
        <p className="mt-4 h-4 text-xs text-ink/45">
          {settled && (
            <>
              {filtered.length} of {sellers.length} sellers shown
              {hasSearch && (
                <button type="button" onClick={() => setSearch("")} className={`ml-2 ${LINK_BUTTON}`}>
                  Clear search
                </button>
              )}
            </>
          )}
        </p>

        {/* ── List ──
            overflow-clip (not -hidden) keeps the rounded corners without making
            this panel a scroll container, so the sticky header can stick. */}
        <div className="mt-3 overflow-clip rounded-2xl border border-ink/10 bg-card">
          <div
            className={`sticky top-0 z-10 hidden items-center gap-3 border-b border-ink/10 bg-parchment/80 px-5 py-3 text-xs font-medium text-ink/50 backdrop-blur sm:grid ${GRID}`}
          >
            {COLUMNS.map((c) => (
              <span key={c.label} className={c.right ? "text-right" : ""}>
                {c.label}
              </span>
            ))}
            <span />
          </div>

          {loading ? (
            <div className={STATE_SHELL}>
              <Loader2 size={22} className="animate-spin text-ink/25" />
              <p className="text-sm font-semibold text-ink/60">Loading sellers…</p>
            </div>
          ) : loadError ? (
            <div className={STATE_SHELL}>
              <div>
                <p className="text-sm font-semibold text-rose-700">{loadError}</p>
                <p className="mt-1 text-xs text-ink/50">The seller list couldn&rsquo;t be loaded.</p>
              </div>
              <button type="button" onClick={() => setReloadKey((k) => k + 1)} className={LINK_BUTTON}>
                Try again
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              hasSearch={hasSearch}
              filterLabel={FILTERS.find((f) => f.key === statusFilter)?.label ?? ""}
              filterIsAll={statusFilter === "all"}
              queueIsEmpty={sellers.length === 0}
              onClearSearch={() => setSearch("")}
              onShowAll={() => setStatusFilter("all")}
            />
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

function EmptyState({
  hasSearch,
  filterLabel,
  filterIsAll,
  queueIsEmpty,
  onClearSearch,
  onShowAll,
}: {
  hasSearch: boolean
  filterLabel: string
  filterIsAll: boolean
  queueIsEmpty: boolean
  onClearSearch: () => void
  onShowAll: () => void
}) {
  if (hasSearch) {
    return (
      <div className={STATE_SHELL}>
        <SearchX size={22} className="text-ink/25" />
        <div>
          <p className="text-sm font-semibold text-ink/70">No sellers match this search</p>
          <p className="mt-1 text-xs text-ink/50">Check the store name or feed type.</p>
        </div>
        <button type="button" onClick={onClearSearch} className={LINK_BUTTON}>
          Clear search
        </button>
      </div>
    )
  }

  // The default tab is "All", but a status tab can still be empty on its own.
  if (!queueIsEmpty && !filterIsAll) {
    return (
      <div className={STATE_SHELL}>
        <Inbox size={22} className="text-ink/25" />
        <div>
          <p className="text-sm font-semibold text-ink/70">No sellers in &ldquo;{filterLabel}&rdquo;</p>
          <p className="mt-1 text-xs text-ink/50">Other sellers are listed under a different status.</p>
        </div>
        <button type="button" onClick={onShowAll} className={LINK_BUTTON}>
          Show all sellers
        </button>
      </div>
    )
  }

  return (
    <div className={STATE_SHELL}>
      <Inbox size={22} className="text-ink/25" />
      <div>
        <p className="text-sm font-semibold text-ink/70">No sellers yet</p>
        <p className="mt-1 max-w-xs text-xs text-ink/50">Add your first affiliated store to start feeding the catalogue.</p>
      </div>
      <Link href="/admin/sellers/new" className={LINK_BUTTON}>
        Add a seller
      </Link>
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
  const { store, providerConfig, admin } = seller
  const feedType = providerConfig.type
  const href = `/admin/sellers/${seller.platform}`

  return (
    // The row is clickable, the name is a real <Link> so keyboard and
    // middle-click still work, and the products cell keeps its own button.
    <div
      onClick={onOpen}
      className={`relative grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-ink/[0.06] px-5 py-4 transition-colors last:border-b-0 hover:bg-ink/[0.02] focus-within:bg-teal/[0.04] sm:gap-y-0 sm:py-3.5 ${GRID}`}
    >
      {admin.status === "pending_review" && (
        <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-gold-deep" />
      )}

      {/* Store: avatar + name */}
      <span className="flex min-w-0 items-center gap-3">
        <span
          className={`grid h-10 w-10 flex-none place-items-center overflow-hidden rounded-full text-[11px] font-bold uppercase ${
            store.logo ? "" : avatarColor(store.name)
          }`}
        >
          {store.logo ? (
            <Image src={store.logo} alt="" className="h-10 w-10 rounded-full object-cover" width={40} height={40} />
          ) : (
            initials(store.name)
          )}
        </span>
        <Link
          href={href}
          onClick={(e) => e.stopPropagation()}
          className="min-w-0 truncate rounded text-sm font-semibold outline-none hover:text-teal-deep hover:underline focus-visible:ring-2 focus-visible:ring-teal/40"
        >
          {store.name}
        </Link>
      </span>

      {/* mobile: status sits beside the store */}
      <span className="sm:hidden">
        <StatusPill status={admin.status} />
      </span>

      <span className="hidden items-center gap-2 sm:flex">
        <Image src={STORE_ICON[feedType]} alt="" width={20} height={20} className="flex-none rounded" />
        <span className="truncate text-sm text-ink/55">{FEED_LABEL[feedType]}</span>
      </span>

      <span className="hidden justify-self-end sm:block">
        <ProductsCell seller={seller} live={live} onRefresh={onRefreshLive} />
      </span>

      <span className="hidden justify-self-end text-sm tabular-nums text-ink/60 sm:block">{admin.ordersPending}</span>

      <span className="hidden sm:block">
        <StatusPill status={admin.status} />
      </span>

      <span className="hidden text-sm tabular-nums text-ink/50 sm:block">{formatJoined(admin.joinedAt)}</span>

      <ChevronRight size={16} className="hidden flex-none text-ink/25 sm:block" aria-hidden />

      {/* mobile-only details */}
      <span className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink/55 sm:hidden">
        <span>{FEED_LABEL[feedType]}</span>
        <span className="inline-flex items-center gap-1.5">
          Products
          <ProductsCell seller={seller} live={live} onRefresh={onRefreshLive} />
        </span>
        <span>
          {admin.ordersPending} pending order{admin.ordersPending === 1 ? "" : "s"}
        </span>
      </span>
    </div>
  )
}

/**
 * Mock sellers just show the cached count, there is no feed to check.
 * Real-feed sellers show a compact skeleton while their turn in the sequential
 * queue is pending or in flight, then swap to the confirmed live count. On
 * error it falls back to the cached number with a retry affordance.
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
  const isLiveFeed = seller.providerConfig.type !== "mock" || seller.platform === 'anishka-creation'
  const cached = seller.store.itemCount ?? null

  if (!isLiveFeed) {
    return <span className="text-sm tabular-nums text-ink/70">{cached ?? "\u2014"}</span>
  }

  const status = live?.status ?? "pending"
  const refresh = (e: React.MouseEvent) => {
    e.stopPropagation()
    onRefresh()
  }

  if (status === "pending" || status === "loading") {
    return (
      <span
        className="inline-flex items-center"
        title={status === "loading" ? "Fetching this seller\u2019s live count\u2026" : "Queued \u2014 checking live counts one at a time"}
      >
        <span className="h-3 w-8 animate-pulse rounded bg-ink/10" />
      </span>
    )
  }

  if (status === "error") {
    return (
      <button
        type="button"
        onClick={refresh}
        title={live?.error ?? "Failed to fetch live count"}
        className="rounded text-sm font-semibold tabular-nums text-gold-deep underline decoration-dotted underline-offset-4 outline-none hover:text-gold focus-visible:ring-2 focus-visible:ring-teal/40"
      >
        {cached ?? "\u2014"} (retry)
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={refresh}
      title={
        live?.atLeast
          ? "Feed has more pages than this check could see \u2014 showing a lower bound, click to refresh"
          : "Live count \u2014 click to refresh"
      }
      className="rounded text-sm font-semibold tabular-nums text-teal-deep underline decoration-transparent underline-offset-4 outline-none transition-colors hover:text-teal hover:decoration-teal/40 focus-visible:ring-2 focus-visible:ring-teal/40"
    >
      {live?.count}
      {live?.atLeast && "+"}
    </button>
  )
}