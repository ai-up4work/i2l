// app/admin/pack-label/page.tsx
"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Inbox, PackageCheck, Search, SearchX } from "lucide-react"

import { useAdminData, hoursSince } from "@/contexts/AdminDataContext"
import { CHANNEL_LABEL, PACK_STATUS_LABEL, type PackStatus, type PackLine } from "@/types/admin"
import type { StatusTone } from "@/components/admin/warehouse/status-pill"
import { panelClass } from "@/components/admin/seller/shared"

// Pack & label queue — orders that passed QC at this site, awaiting
// packing. Rows are per-order here (not per-item like QC), since
// packing/labeling is an order-level action, not a per-line-item one.
//
// Previously backed by a standalone hardcoded ORDERS array with its own
// ad-hoc "Affiliated store" | "Scraped link" | "Manual quote" channel
// strings and a "Packed" status nothing ever actually set. Now
// `visiblePackLines` is derived from AdminDataContext's orders +
// purchases: an order surfaces here once every item on it has passed QC
// (see PackLine in types/admin.ts), and "Packed" reflects a real
// packOrder() call rather than a status no button could reach.

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
const TONE_EDGE: Record<StatusTone, string> = {
  teal: "before:bg-teal-deep/70",
  amber: "before:bg-gold-deep",
  rose: "before:bg-rose-600/70",
}
const PACK_STATUS_TONE: Record<PackStatus, StatusTone> = {
  awaiting_pack: "amber",
  packed: "teal",
}

const COLUMNS = ["Order", "Destination", "Items", "Passed QC", "Order age", "Handling", "Status"]

export default function PackLabelPage() {
  const router = useRouter()
  const { visiblePackLines, currentUser, permissions, sites } = useAdminData()
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("awaiting_pack")
  const [query, setQuery] = useState("")

  const matchesQuery = (row: PackLine, q: string) =>
    !q || row.orderNumber.toLowerCase().includes(q) || row.customerName.toLowerCase().includes(q)

  const counts = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base: Record<string, number> = { all: 0 }
    for (const row of visiblePackLines) {
      if (!matchesQuery(row, q)) continue
      base.all += 1
      base[row.status] = (base[row.status] ?? 0) + 1
    }
    return base
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visiblePackLines, query])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return visiblePackLines
      .filter((row) => {
        if (tab !== "all" && row.status !== tab) return false
        return matchesQuery(row, q)
      })
      .sort((a, b) => b.qcPassedAgeHours - a.qcPassedAgeHours)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visiblePackLines, tab, query])

  const hasAnyFilter = query.trim().length > 0 || tab !== "all"
  const clearFilters = () => {
    setQuery("")
    setTab("all")
  }

  const scopeLabel = permissions.ordersScopedToOwnSite
    ? sites.find((s) => s.id === currentUser.siteId)?.name ?? "your site"
    : "all sites"

  return (
    <div className="min-h-screen bg-parchment font-body text-ink">
      <div className="mx-auto max-w-[1560px] px-6 pb-20 pt-10 lg:px-10">
        {/* ── Header ── */}
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 flex-none place-items-center rounded-2xl border border-ink/10 bg-card text-teal-deep shadow-[0_1px_2px_rgba(32,36,43,0.04),0_16px_40px_-24px_rgba(14,140,156,0.4)]">
              <PackageCheck size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-display text-3xl text-ink">Pack &amp; label</h1>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink/60">
                Orders that passed quality check at {scopeLabel}, ready to be packed and labeled for export.
              </p>
            </div>
          </div>
        </div>

        {/* ── Filters ── */}
        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1 rounded-full border border-ink/10 bg-card p-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal ${
                  tab === t.key
                    ? "bg-teal-deep text-parchment shadow-[0_6px_18px_-8px_rgba(14,140,156,0.5)]"
                    : "text-ink/55 hover:text-ink/80"
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
              className="w-full rounded-full border border-ink/10 bg-card py-2.5 pl-9 pr-4 text-sm text-ink placeholder:text-ink/35 outline-none transition-colors focus:border-teal/50 focus:ring-2 focus:ring-teal/15"
            />
          </div>
        </div>

        <p className="mt-4 text-xs font-medium text-ink/40">
          {rows.length} order{rows.length === 1 ? "" : "s"}
        </p>

        {/* ── Table ── */}
        <div className={`mt-3 overflow-hidden ${panelClass}`}>
          <div className="sticky top-0 z-10 hidden grid-cols-[1fr_0.9fr_0.6fr_0.9fr_0.9fr_1.2fr_0.9fr] gap-2 border-b border-ink/10 bg-parchment/70 px-5 py-3 text-[11px] font-semibold tracking-wide text-ink/45 sm:grid">
            {COLUMNS.map((label, i) => (
              <span key={label} className={i === 2 ? "text-right" : ""}>
                {label}
              </span>
            ))}
          </div>

          {rows.length === 0 ? (
            <EmptyState hasAnyFilter={hasAnyFilter} onClearFilters={clearFilters} />
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

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpen()
      }}
      className={`group relative grid w-full cursor-pointer grid-cols-[1fr_auto] items-center gap-3 border-b border-ink/[0.06] px-5 py-3.5 pl-6 text-left outline-none transition-colors before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:content-[''] last:border-b-0 hover:bg-parchment/50 focus-visible:bg-teal/[0.08] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-teal/40 sm:grid-cols-[1fr_0.9fr_0.6fr_0.9fr_0.9fr_1.2fr_0.9fr] ${TONE_EDGE[tone]}`}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-ink">{row.orderNumber}</span>
        <span className="block truncate text-xs text-ink/45">{row.customerName}</span>
        <span className="mt-1 inline-block text-[11px] font-medium text-ink/40">{CHANNEL_LABEL[row.channel]}</span>
      </span>

      <span className="hidden truncate text-sm text-ink/70 sm:block">{row.destination}</span>

      <span className="hidden justify-self-end text-sm text-ink/55 sm:block">{row.itemCount}</span>

      <span className="hidden text-sm text-ink/50 sm:block">{row.qcPassedAgeLabel} ago</span>

      <span className="hidden text-sm text-ink/50 sm:block">{row.orderAgeLabel}</span>

      <span className="hidden truncate text-xs text-gold-deep sm:block">{row.handlingNote ?? <span className="text-ink/25">—</span>}</span>

      <span className="hidden sm:block">
        <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${TONE_PILL[tone]}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} />
          {PACK_STATUS_LABEL[row.status]}
        </span>
      </span>

      {/* mobile-only summary */}
      <span className="col-span-2 flex items-center justify-between gap-2 pl-13 sm:hidden">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${TONE_PILL[tone]}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} />
          {PACK_STATUS_LABEL[row.status]}
        </span>
        <span className="text-xs text-ink/50">{row.destination}</span>
      </span>
    </div>
  )
}

function EmptyState({ hasAnyFilter, onClearFilters }: { hasAnyFilter: boolean; onClearFilters: () => void }) {
  if (hasAnyFilter) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
        <SearchX size={22} className="text-ink/25" />
        <div>
          <p className="text-sm font-semibold text-ink/70">Nothing matches this filter</p>
          <p className="mt-1 text-xs text-ink/45">Try a different search term or tab.</p>
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
        <p className="text-sm font-semibold text-ink/70">Nothing here right now</p>
        <p className="mt-1 max-w-xs text-xs text-ink/45">
          Orders show up here once every item on them has passed quality check.
        </p>
      </div>
    </div>
  )
}