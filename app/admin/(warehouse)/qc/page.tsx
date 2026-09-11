// app/admin/qc/page.tsx
"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { ClipboardCheck, Inbox, Search, SearchX, Store } from "lucide-react"

import {
  getQCRows,
  isOrderAgeBreached,
  QC_STATUS_LABEL,
  QC_STATUS_TONE,
  type QCStatus,
} from "@/data/qc/data"
import { CHANNEL_LABEL } from "@/data/purchases/data"
import type { StatusTone } from "@/components/admin/warehouse/status-pill"
import { panelClass } from "@/components/admin/seller/shared"

// Quality Check queue — mirrors the Sellers/Purchases screens' visual
// language deliberately (parchment surfaces, panelClass cards, teal/gold/
// rose tone system, edge-bar rows) since it's the next stage of the same
// pipeline: an item only shows up here once its purchase line has been
// bought and has arrived at this warehouse site.
//
// TODO: scope getQCRows() to the signed-in Warehouse account's own
// warehouse_id server-side — never trust a client-supplied site param.

const TABS: { key: "all" | QCStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Needs inspection" },
  { key: "passed", label: "Passed" },
  { key: "flagged", label: "Flagged" },
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

const COLUMNS = ["Product", "Order", "Seller", "Qty", "Arrived", "Order age", "Notes", "Status"]

export default function QCPage() {
  const router = useRouter()
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("pending")
  const [query, setQuery] = useState("")

  const allRows = useMemo(() => getQCRows(), [])

  const matchesQuery = (row: ReturnType<typeof getQCRows>[number], q: string) =>
    !q ||
    row.purchase.orderNumber.toLowerCase().includes(q) ||
    row.purchase.customerName.toLowerCase().includes(q) ||
    row.purchase.productTitle.toLowerCase().includes(q) ||
    row.purchase.sellerName.toLowerCase().includes(q)

  // Counts reflect the active search too, so the tab pills never disagree
  // with what's actually on screen underneath them.
  const counts = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base: Record<string, number> = { all: 0 }
    for (const row of allRows) {
      if (!matchesQuery(row, q)) continue
      base.all += 1
      base[row.status] = (base[row.status] ?? 0) + 1
    }
    return base
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, query])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return allRows.filter((row) => {
      if (tab !== "all" && row.status !== tab) return false
      return matchesQuery(row, q)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, tab, query])

  const hasAnyFilter = query.trim().length > 0 || tab !== "all"
  const clearFilters = () => {
    setQuery("")
    setTab("all")
  }

  const tabTotal = counts[tab] ?? 0

  return (
    <div className="min-h-screen bg-parchment font-body text-ink">
      <div className="mx-auto max-w-[1560px] px-6 pb-20 pt-10 lg:px-10">
        {/* ── Header ── */}
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 flex-none place-items-center rounded-2xl border border-ink/10 bg-card text-teal-deep shadow-[0_1px_2px_rgba(32,36,43,0.04),0_16px_40px_-24px_rgba(14,140,156,0.4)]">
              <ClipboardCheck size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-display text-3xl text-ink">Quality check</h1>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink/60">
                Inspect each item that&rsquo;s arrived at Colombo Hub before it&rsquo;s packed.
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
              placeholder="Search order, customer, product, seller"
              className="w-full rounded-full border border-ink/10 bg-card py-2.5 pl-9 pr-4 text-sm text-ink placeholder:text-ink/35 outline-none transition-colors focus:border-teal/50 focus:ring-2 focus:ring-teal/15"
            />
          </div>
        </div>

        {/* ── Result count ── */}
        <p className="mt-4 text-xs font-medium text-ink/40">
          {rows.length === tabTotal
            ? `${tabTotal} item${tabTotal === 1 ? "" : "s"}`
            : `${rows.length} of ${tabTotal} items`}
        </p>

        {/* ── Table ── */}
        <div className={`mt-3 overflow-hidden ${panelClass}`}>
          <div className="sticky top-0 z-10 hidden grid-cols-[1.8fr_1fr_1.1fr_0.5fr_0.8fr_0.9fr_0.9fr_0.9fr] gap-2 border-b border-ink/10 bg-parchment/70 px-5 py-3 text-[11px] font-semibold tracking-wide text-ink/45 sm:grid">
            {COLUMNS.map((label, i) => (
              <span key={label} className={i === 3 ? "text-right" : ""}>
                {label}
              </span>
            ))}
          </div>

          {rows.length === 0 ? (
            <EmptyState hasAnyFilter={hasAnyFilter} onClearFilters={clearFilters} />
          ) : (
            rows.map((row) => (
              <QCRow
                key={row.id}
                row={row}
                onOpen={() => router.push(`/admin/qc/${row.id}`)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function QCRow({ row, onOpen }: { row: ReturnType<typeof getQCRows>[number]; onOpen: () => void }) {
  const tone = QC_STATUS_TONE[row.status]
  const breached = isOrderAgeBreached(row.orderAgeHours)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpen()
      }}
      className={`group relative grid w-full cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-ink/[0.06] px-5 py-3.5 pl-6 text-left outline-none transition-colors before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:content-[''] last:border-b-0 hover:bg-parchment/50 focus-visible:bg-teal/[0.08] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-teal/40 sm:grid-cols-[1.8fr_1fr_1.1fr_0.5fr_0.8fr_0.9fr_0.9fr_0.9fr] ${TONE_EDGE[tone]}`}
    >
      {/* Product */}
      <span className="col-span-2 flex min-w-0 items-center gap-3 sm:col-span-1">
        <span className="h-10 w-10 flex-none overflow-hidden rounded-xl border border-ink/10 bg-ink/[0.04]">
          <Image
            src={row.purchase.productImage}
            alt=""
            width={40}
            height={40}
            className="h-full w-full object-cover"
          />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-ink">{row.purchase.productTitle}</span>
          {row.purchase.variant && (
            <span className="block truncate text-xs text-ink/40">{row.purchase.variant}</span>
          )}
        </span>
      </span>

      <span className="hidden flex-col sm:flex">
        <span className="truncate text-sm text-ink/70">{row.purchase.orderNumber}</span>
        <span className="truncate text-xs text-ink/40">{row.purchase.customerName}</span>
      </span>

      <span className="hidden flex-col sm:flex">
        <span className="flex items-center gap-1.5 truncate text-sm text-ink/70">
          <Store size={12} className="flex-none text-ink/30" />
          {row.purchase.sellerName}
        </span>
        <span className="truncate text-xs text-ink/35">{CHANNEL_LABEL[row.purchase.channel]}</span>
      </span>

      <span className="hidden justify-self-end text-sm text-ink/55 sm:block">{row.purchase.quantity}</span>

      <span className="hidden text-sm text-ink/50 sm:block">{row.arrivedAgo}</span>

      <span className="hidden sm:block">
        <span className={breached ? "text-sm font-semibold text-rose-700" : "text-sm text-ink/50"}>
          {row.orderAgeLabel}
        </span>
      </span>

      <span className="hidden text-sm text-ink/50 sm:block">
        {row.photoCount > 0 ? `${row.photoCount} photo${row.photoCount > 1 ? "s" : ""}` : "—"}
      </span>

      <span className="hidden sm:block">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${TONE_PILL[tone]}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} />
          {QC_STATUS_LABEL[row.status]}
        </span>
      </span>

      {/* mobile-only: status + order age since the grid above collapses */}
      <span className="col-span-3 flex items-center justify-between gap-2 pl-13 sm:hidden">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${TONE_PILL[tone]}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} />
          {QC_STATUS_LABEL[row.status]}
        </span>
        <span className={breached ? "text-xs font-semibold text-rose-700" : "text-xs text-ink/45"}>
          {row.orderAgeLabel} old
        </span>
      </span>
    </div>
  )
}

/**
 * Distinguishes "nothing matches your search/tab" (recoverable, offer to
 * clear) from "the queue is genuinely empty" — which, for a QC inbox, is
 * good news rather than an onboarding gap, so it gets a different icon
 * and tone rather than reusing an onboarding-style empty state.
 */
function EmptyState({
  hasAnyFilter,
  onClearFilters,
}: {
  hasAnyFilter: boolean
  onClearFilters: () => void
}) {
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
        <p className="text-sm font-semibold text-ink/70">Queue is clear</p>
        <p className="mt-1 max-w-xs text-xs text-ink/45">
          Nothing&rsquo;s waiting for inspection at this site right now.
        </p>
      </div>
    </div>
  )
}