// app/admin/pack-label/page.tsx
"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Inbox, PackageCheck, Search, SearchX } from "lucide-react"

import { useAdminData } from "@/contexts/AdminDataContext"
import { CHANNEL_LABEL, PACK_STATUS_LABEL, type PackStatus, type PackLine } from "@/types/admin"
import type { StatusTone } from "@/components/admin/warehouse/status-pill"
import { panelClass } from "@/components/admin/seller/shared"

// Pack & label queue: orders where every item has passed QC at this site and
// that are waiting to be packed. One row per order, since packing and labeling
// are order-level actions. "Packed" reflects a real packOrder() call; a packed
// order then moves on to the Export bin.
//
// Clicking a row (or the order number) opens the pack screen. Opening is safe,
// nothing changes until "Mark packed" is pressed there.

const TABS: { key: "all" | PackStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "awaiting_pack", label: "Awaiting pack" },
  { key: "packed", label: "Packed" },
]

const TONE_DOT: Record<StatusTone, string> = {
  teal: "bg-teal-deep",
  amber: "bg-gold-deep",
  rose: "bg-rose-600",
}
const TONE_PILL: Record<StatusTone, string> = {
  teal: "bg-teal/12 text-teal-deep ring-1 ring-inset ring-teal/25",
  amber: "bg-gold/15 text-gold-deep ring-1 ring-inset ring-gold/30",
  rose: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200",
}
const PACK_STATUS_TONE: Record<PackStatus, StatusTone> = {
  awaiting_pack: "amber",
  packed: "teal",
}

// Shared by the header and every row so the columns always line up.
const GRID =
  "sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_3.5rem_6.5rem_6rem_minmax(0,1.2fr)_9rem]"

// Same age colours as the Export bin: how long an order has been waiting.
function ageTone(hours: number) {
  if (hours >= 48) return { dot: "bg-rose-500", text: "text-rose-700 font-semibold" }
  if (hours >= 24) return { dot: "bg-amber-500", text: "text-amber-700 font-medium" }
  return { dot: "bg-teal", text: "text-ink/50" }
}

function matchesQuery(row: PackLine, q: string) {
  return !q || row.orderNumber.toLowerCase().includes(q) || row.customerName.toLowerCase().includes(q)
}

export default function PackLabelPage() {
  const router = useRouter()
  const { visiblePackLines, currentUser, permissions, sites } = useAdminData()
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("awaiting_pack")
  const [query, setQuery] = useState("")

  const counts = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base: Record<string, number> = { all: 0 }
    for (const row of visiblePackLines) {
      if (!matchesQuery(row, q)) continue
      base.all += 1
      base[row.status] = (base[row.status] ?? 0) + 1
    }
    return base
  }, [visiblePackLines, query])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return visiblePackLines
      .filter((row) => (tab === "all" || row.status === tab) && matchesQuery(row, q))
      .sort((a, b) => b.qcPassedAgeHours - a.qcPassedAgeHours)
  }, [visiblePackLines, tab, query])

  // Header stats always describe the whole queue, not the current filter.
  const awaiting = visiblePackLines.filter((r) => r.status === "awaiting_pack")
  const itemsToPack = awaiting.reduce((sum, r) => sum + r.itemCount, 0)
  const oldest = awaiting.reduce<PackLine | null>(
    (max, r) => (!max || r.qcPassedAgeHours > max.qcPassedAgeHours ? r : max),
    null,
  )
  const oldestHours = oldest?.qcPassedAgeHours ?? 0

  const hasSearch = query.trim().length > 0

  const scopeLabel = permissions.ordersScopedToOwnSite
    ? sites.find((s) => s.id === currentUser.siteId)?.name ?? "your site"
    : "all sites"

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      <div className="mx-auto max-w-[1560px] px-6 pb-20 pt-10 lg:px-10">
        {/* ── Header ── */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-teal-deep text-parchment">
              <PackageCheck size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-display text-3xl font-semibold leading-tight">Pack &amp; label</h1>
              <p className="mt-1 max-w-md text-sm leading-relaxed text-ink/60">
                Orders at {scopeLabel} that passed quality check and are ready to pack. Longest waiting first.
              </p>
            </div>
          </div>

          <dl className="flex divide-x divide-ink/10 overflow-hidden rounded-2xl border border-ink/10 bg-card">
            <div className="px-5 py-3">
              <dt className="text-xs font-medium text-ink/45">Orders to pack</dt>
              <dd className="mt-0.5 font-display text-xl text-ink">{awaiting.length}</dd>
            </div>
            <div className="px-5 py-3">
              <dt className="text-xs font-medium text-ink/45">Items to pack</dt>
              <dd className="mt-0.5 font-display text-xl text-ink">{itemsToPack}</dd>
            </div>
            <div className="px-5 py-3">
              <dt className="text-xs font-medium text-ink/45">Longest waiting</dt>
              <dd className={`mt-0.5 font-display text-xl ${oldestHours >= 48 ? "text-rose-700" : oldestHours >= 24 ? "text-amber-700" : "text-ink"}`}>{oldest ? oldest.qcPassedAgeLabel : "—"}</dd>
            </div>
          </dl>
        </div>

        {/* ── Filters ── */}
        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div role="tablist" aria-label="Filter by status" className="flex flex-wrap gap-1 rounded-full border border-ink/10 bg-card p-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-teal/40 ${
                  tab === t.key ? "bg-teal-deep text-parchment" : "text-ink/55 hover:text-ink/80"
                }`}
              >
                {t.label}
                <span className={tab === t.key ? "text-parchment/70" : "text-ink/35"}>{counts[t.key] ?? 0}</span>
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/35" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search order or customer"
              aria-label="Search order or customer"
              className="w-full rounded-full border border-ink/10 bg-card py-2.5 pl-9 pr-4 text-sm placeholder:text-ink/35 outline-none transition-colors focus:border-teal/50 focus:ring-2 focus:ring-teal/15"
            />
          </div>
        </div>

        <p className="mt-4 text-xs text-ink/45">
          {rows.length} order{rows.length === 1 ? "" : "s"} shown
          {hasSearch && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="ml-2 font-semibold text-teal-deep underline decoration-dotted underline-offset-4 hover:text-teal"
            >
              Clear search
            </button>
          )}
        </p>

        {/* ── Table ── */}
        <div className={`mt-3 overflow-hidden ${panelClass}`}>
          <div
            className={`sticky top-0 z-10 hidden items-center gap-3 border-b border-ink/10 bg-parchment/80 px-5 py-3 text-xs font-medium text-ink/50 backdrop-blur sm:grid ${GRID}`}
          >
            <span>Order</span>
            <span>Destination</span>
            <span className="text-right">Items</span>
            <span>Passed QC</span>
            <span>Order age</span>
            <span>Handling</span>
            <span>Status</span>
          </div>

          {rows.length === 0 ? (
            <EmptyState
              hasSearch={hasSearch}
              tabLabel={TABS.find((t) => t.key === tab)?.label ?? ""}
              queueIsEmpty={visiblePackLines.length === 0}
              onClearSearch={() => setQuery("")}
              onShowAll={() => setTab("all")}
            />
          ) : (
            rows.map((row) => (
              <PackRow key={row.id} row={row} onOpen={() => router.push(`/admin/pack-label/${row.id}`)} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function PackRow({ row, onOpen }: { row: PackLine; onOpen: () => void }) {
  const tone = PACK_STATUS_TONE[row.status]
  // Only orders still waiting to be packed get an urgency colour.
  const age = row.status === "awaiting_pack" ? ageTone(row.qcPassedAgeHours) : { dot: "bg-ink/20", text: "text-ink/50" }

  const pill = (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${TONE_PILL[tone]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} aria-hidden />
      {PACK_STATUS_LABEL[row.status]}
    </span>
  )

  return (
    <div
      onClick={onOpen}
      className={`grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-ink/[0.06] px-5 py-4 transition-colors last:border-b-0 hover:bg-ink/[0.02] sm:gap-y-0 sm:py-3.5 ${GRID}`}
    >
      <div className="min-w-0">
        <Link
          href={`/admin/pack-label/${row.id}`}
          onClick={(e) => e.stopPropagation()}
          className="block truncate rounded text-sm font-semibold outline-none hover:text-teal-deep hover:underline focus-visible:ring-2 focus-visible:ring-teal/40"
        >
          {row.orderNumber}
        </Link>
        <span className="block truncate text-xs text-ink/50">{row.customerName}</span>
        <span className="mt-0.5 block text-[11px] text-ink/40">{CHANNEL_LABEL[row.channel]}</span>
      </div>

      {/* mobile: status sits beside the order, details drop below */}
      <span className="sm:hidden">{pill}</span>

      <span className="hidden truncate text-sm text-ink/70 sm:block">{row.destination}</span>
      <span className="hidden text-right text-sm tabular-nums text-ink/60 sm:block">{row.itemCount}</span>
      <span className={`hidden items-center gap-2 text-sm tabular-nums sm:inline-flex ${age.text}`}>
        <span className={`h-2 w-2 flex-none rounded-full ${age.dot}`} aria-hidden />
        {row.qcPassedAgeLabel} ago
      </span>
      <span className="hidden text-sm tabular-nums text-ink/50 sm:block">{row.orderAgeLabel}</span>

      <span className="col-span-2 min-w-0 sm:col-span-1">
        {row.handlingNote ? (
          <span className="inline-block max-w-full truncate rounded-md bg-gold/15 px-2 py-1 text-xs font-medium text-gold-deep ring-1 ring-inset ring-gold/30">
            {row.handlingNote}
          </span>
        ) : (
          <span className="hidden text-ink/25 sm:inline">—</span>
        )}
      </span>

      <span className="hidden sm:block">{pill}</span>

      {/* mobile-only details */}
      <span className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink/55 sm:hidden">
        <span>{row.destination}</span>
        <span>
          {row.itemCount} item{row.itemCount === 1 ? "" : "s"}
        </span>
        <span className={`inline-flex items-center gap-1.5 ${age.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${age.dot}`} aria-hidden />
          QC passed {row.qcPassedAgeLabel} ago
        </span>
      </span>
    </div>
  )
}

function EmptyState({
  hasSearch,
  tabLabel,
  queueIsEmpty,
  onClearSearch,
  onShowAll,
}: {
  hasSearch: boolean
  tabLabel: string
  queueIsEmpty: boolean
  onClearSearch: () => void
  onShowAll: () => void
}) {
  const linkButton =
    "text-xs font-semibold text-teal-deep underline decoration-dotted underline-offset-4 hover:text-teal"

  if (hasSearch) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
        <SearchX size={22} className="text-ink/25" />
        <div>
          <p className="text-sm font-semibold text-ink/70">No orders match this search</p>
          <p className="mt-1 text-xs text-ink/50">Check the order number or customer name.</p>
        </div>
        <button type="button" onClick={onClearSearch} className={linkButton}>
          Clear search
        </button>
      </div>
    )
  }

  // The default tab is "Awaiting pack", so an empty tab is not the same as an empty queue.
  if (!queueIsEmpty) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
        <Inbox size={22} className="text-ink/25" />
        <div>
          <p className="text-sm font-semibold text-ink/70">No orders in “{tabLabel}”</p>
          <p className="mt-1 text-xs text-ink/50">Other orders are in the queue under a different status.</p>
        </div>
        <button type="button" onClick={onShowAll} className={linkButton}>
          Show all orders
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
      <Inbox size={22} className="text-ink/25" />
      <div>
        <p className="text-sm font-semibold text-ink/70">Nothing to pack right now</p>
        <p className="mt-1 max-w-xs text-xs text-ink/50">
          Orders appear here once every item on them has passed quality check.
        </p>
      </div>
    </div>
  )
}