// app/admin/qc/page.tsx
"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { AlertTriangle, ClipboardCheck, Inbox, Layers, Search, SearchX, Store } from "lucide-react"

import { useAdminData, isOrderAgeBreached } from "@/contexts/AdminDataContext"
import { QC_STATUS_LABEL, CHANNEL_LABEL, type QCStatus, type QCLine } from "@/types/admin"
import type { StatusTone } from "@/components/admin/warehouse/status-pill"
import { panelClass } from "@/components/admin/seller/shared"

// Quality Check queue — mirrors the Sellers/Purchases screens' visual
// language deliberately (parchment surfaces, panelClass cards, teal/gold/
// rose tone system, edge-bar rows) since it's the next stage of the same
// pipeline: an item only shows up here once its purchase line has been
// bought and has arrived at this warehouse site.
//
// GROUPING (2026-09): rows are grouped by parent order, same treatment as
// /admin/purchases — a flat list gave no visual signal that two rows were
// the same order beyond a repeated order number, which is easy to miss on
// a multi-item order where only some lines have cleared QC. Each group
// now gets one header (order number, customer, item/seller-count tag, and
// a "X/Y passed" progress pill computed from ALL of that order's QC
// lines, not just the ones visible in the current tab/search) with its
// item rows nested underneath.
//
// The progress pill deliberately reads against `allLines` rather than the
// filtered `visibleLines` — switching to the "Flagged" tab shouldn't make
// a 3-item order that's 2-passed/1-flagged look like it's "0/3 passed."
// A small note under the header covers that gap explicitly instead of
// leaving it implicit.
//
// ALIGNMENT FIX: dropping the Order/Customer column (now redundant under
// a grouped header) freed up a column's worth of width, so the remaining
// six columns (Product / Seller / Qty / Arrived / Order age / Notes /
// Status) are re-proportioned below rather than just deleting one
// grid-template slot and leaving the rest cramped. Also added `min-w-0`
// to the Seller column, which was missing before and could let a long
// seller name push the grid out of alignment with the header row.
//
// Backed by AdminDataContext.visibleQcLines, joined live from purchases +
// orders — this queue can never disagree with Purchases or Order detail
// for the same item.

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
const QC_STATUS_TONE: Record<QCStatus, StatusTone> = {
  pending: "amber",
  passed: "teal",
  flagged: "rose",
}

// Six columns now instead of eight — Order/Customer folded into the
// group header, so this legend and every row's grid-cols must match it
// exactly (7 template slots below: 6 data columns + the trailing chevron
// space is implicit via padding, not a grid column, so header and row
// both use the same 6-slot template).
const COLUMN_TEMPLATE = "grid-cols-[2fr_1.1fr_0.5fr_0.8fr_0.8fr_0.9fr_0.9fr]"
const COLUMNS = ["Product", "Seller", "Qty", "Arrived", "Order age", "Notes", "Status"]

interface OrderGroup {
  orderId: string
  orderNumber: string
  customerName: string
  allLines: QCLine[]
  visibleLines: QCLine[]
}

export default function QCPage() {
  const router = useRouter()
  const { visibleQcLines, currentUser, permissions, sites } = useAdminData()
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("pending")
  const [query, setQuery] = useState("")

  const matchesQuery = (row: QCLine, q: string) =>
    !q ||
    row.orderNumber.toLowerCase().includes(q) ||
    row.customerName.toLowerCase().includes(q) ||
    row.productTitle.toLowerCase().includes(q) ||
    row.sellerName.toLowerCase().includes(q)

  // Counts reflect the active search too, so the tab pills never disagree
  // with what's actually on screen underneath them.
  const counts = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base: Record<string, number> = { all: 0 }
    for (const row of visibleQcLines) {
      if (!matchesQuery(row, q)) continue
      base.all += 1
      base[row.status] = (base[row.status] ?? 0) + 1
    }
    return base
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleQcLines, query])

  // Build order groups the same way Purchases does: every group carries
  // its full (unfiltered-by-tab) line set for the progress pill, plus the
  // subset that survives the active tab/search for actual rendering.
  const groups = useMemo<OrderGroup[]>(() => {
    const q = query.trim().toLowerCase()
    const byOrder = new Map<string, OrderGroup>()

    for (const row of visibleQcLines) {
      if (!matchesQuery(row, q)) continue // search still scopes which orders appear at all

      let group = byOrder.get(row.orderId)
      if (!group) {
        group = {
          orderId: row.orderId,
          orderNumber: row.orderNumber,
          customerName: row.customerName,
          allLines: [],
          visibleLines: [],
        }
        byOrder.set(row.orderId, group)
      }
      group.allLines.push(row)
      if (tab === "all" || row.status === tab) {
        group.visibleLines.push(row)
      }
    }

    return Array.from(byOrder.values()).filter((g) => g.visibleLines.length > 0)
  }, [visibleQcLines, tab, query])

  const totalVisibleRows = groups.reduce((sum, g) => sum + g.visibleLines.length, 0)
  const hasAnyFilter = query.trim().length > 0 || tab !== "all"
  const clearFilters = () => {
    setQuery("")
    setTab("all")
  }

  const tabTotal = counts[tab] ?? 0

  // Warehouse is pinned to one site; everyone else is looking at every
  // site's queue at once, so the subtitle should say so honestly instead
  // of hardcoding a site name that may not even be the viewer's.
  const scopeLabel = permissions.ordersScopedToOwnSite
    ? sites.find((s) => s.id === currentUser.siteId)?.name ?? "your site"
    : "all sites"

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
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
                Inspect each item that&rsquo;s arrived at {scopeLabel} before it&rsquo;s packed.
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
          {totalVisibleRows === tabTotal
            ? `${tabTotal} item${tabTotal === 1 ? "" : "s"} across ${groups.length} order${groups.length === 1 ? "" : "s"}`
            : `${totalVisibleRows} of ${tabTotal} items across ${groups.length} order${groups.length === 1 ? "" : "s"}`}
        </p>

        {/* ── Column legend — shown once, above every group, since each
             group's rows share the exact same template. ── */}
        {groups.length > 0 && (
          <div className={`mt-3 hidden ${COLUMN_TEMPLATE} gap-2 px-5 py-2 text-[11px] font-semibold tracking-wide text-ink/40 sm:grid`}>
            {COLUMNS.map((label, i) => (
              <span key={label} className={i === 2 ? "text-right" : ""}>
                {label}
              </span>
            ))}
          </div>
        )}

        {/* ── Grouped list ── */}
        <div className="mt-1 space-y-4">
          {groups.length === 0 ? (
            <div className={panelClass}>
              <EmptyState hasAnyFilter={hasAnyFilter} onClearFilters={clearFilters} />
            </div>
          ) : (
            groups.map((group) => (
              <OrderGroupCard
                key={group.orderId}
                group={group}
                onOpenOrder={() => router.push(`/admin/orders/${group.orderId}`)}
                onOpenLine={(id) => router.push(`/admin/qc/${id}`)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function OrderGroupCard({
  group,
  onOpenOrder,
  onOpenLine,
}: {
  group: OrderGroup
  onOpenOrder: () => void
  onOpenLine: (id: string) => void
}) {
  const passedCount = group.allLines.filter((l) => l.status === "passed").length
  const flaggedCount = group.allLines.filter((l) => l.status === "flagged").length
  const totalCount = group.allLines.length
  const hiddenCount = totalCount - group.visibleLines.length
  const sellerCount = new Set(group.allLines.map((l) => l.sellerName)).size
  const allPassed = passedCount === totalCount
  const anyBreached = group.allLines.some((l) => isOrderAgeBreached(l.orderAgeHours))

  return (
    <div className={`overflow-hidden ${panelClass}`}>
      {/* Order header — always shown, even for a single-item order, so
          which order a row belongs to never depends on matching up an
          order number by eye across several rows. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/[0.06] bg-parchment/40 px-5 py-3">
        <button
          type="button"
          onClick={onOpenOrder}
          className="flex min-w-0 items-center gap-2 text-left hover:underline"
        >
          <span className="font-display text-sm font-semibold text-ink">{group.orderNumber}</span>
          <span className="text-ink/25">·</span>
          <span className="truncate text-sm text-ink/60">{group.customerName}</span>
          {anyBreached && <AlertTriangle size={13} className="flex-none text-rose-600" />}
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {totalCount > 1 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-ink/[0.05] px-2.5 py-1 text-xs font-semibold text-ink/55 ring-1 ring-inset ring-ink/10">
              <Layers size={11} /> {totalCount} items{sellerCount > 1 ? ` · ${sellerCount} sellers` : ""}
            </span>
          )}
          {flaggedCount > 0 && (
            <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
              {flaggedCount} flagged
            </span>
          )}
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              allPassed
                ? "bg-teal/12 text-teal-deep ring-1 ring-inset ring-teal/25"
                : "bg-ink/[0.04] text-ink/55 ring-1 ring-inset ring-ink/10"
            }`}
          >
            {passedCount}/{totalCount} passed
          </span>
        </div>
      </div>

      {hiddenCount > 0 && (
        <p className="border-b border-ink/[0.06] bg-parchment/20 px-5 py-1.5 text-[11px] text-ink/40">
          +{hiddenCount} other item{hiddenCount === 1 ? "" : "s"} on this order not shown in the current filter
        </p>
      )}

      {/* Item rows — indented so they read as children of the header
          above; Order/Customer columns dropped since the header already
          carries that context. */}
      <div>
        {group.visibleLines.map((row) => (
          <QCRow key={row.id} row={row} onOpen={() => onOpenLine(row.id)} />
        ))}
      </div>
    </div>
  )
}

function QCRow({ row, onOpen }: { row: QCLine; onOpen: () => void }) {
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
      className={`group relative grid w-full cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-ink/[0.06] py-3.5 pl-8 pr-5 text-left outline-none transition-colors before:absolute before:inset-y-0 before:left-5 before:w-[3px] before:content-[''] last:border-b-0 hover:bg-parchment/50 focus-visible:bg-teal/[0.08] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-teal/40 sm:${COLUMN_TEMPLATE} ${TONE_EDGE[tone]}`}
    >
      {/* Product */}
      <span className="col-span-2 flex min-w-0 items-center gap-3 sm:col-span-1">
        <span className="h-10 w-10 flex-none overflow-hidden rounded-xl border border-ink/10 bg-ink/[0.04]">
          <Image src={row.productImage} alt="" width={40} height={40} className="h-full w-full object-cover" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-ink">{row.productTitle}</span>
          {row.variant && <span className="block truncate text-xs text-ink/40">{row.variant}</span>}
        </span>
      </span>

      <span className="hidden min-w-0 flex-col sm:flex">
        <span className="flex min-w-0 items-center gap-1.5 truncate text-sm text-ink/70">
          <Store size={12} className="flex-none text-ink/30" />
          <span className="truncate">{row.sellerName}</span>
        </span>
        <span className="truncate text-xs text-ink/35">{CHANNEL_LABEL[row.channel]}</span>
      </span>

      <span className="hidden justify-self-end text-sm text-ink/55 sm:block">{row.quantity}</span>

      <span className="hidden whitespace-nowrap text-sm text-ink/50 sm:block">{row.arrivedAgo}</span>

      <span className="hidden sm:block">
        <span className={breached ? "whitespace-nowrap text-sm font-semibold text-rose-700" : "whitespace-nowrap text-sm text-ink/50"}>
          {row.orderAgeLabel}
        </span>
      </span>

      <span className="hidden truncate text-sm text-ink/50 sm:block">
        {row.photoCount > 0 ? `${row.photoCount} photo${row.photoCount > 1 ? "s" : ""}` : "—"}
      </span>

      <span className="hidden sm:block">
        <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${TONE_PILL[tone]}`}>
          <span className={`h-1.5 w-1.5 flex-none rounded-full ${TONE_DOT[tone]}`} />
          {QC_STATUS_LABEL[row.status]}
        </span>
      </span>

      {/* mobile-only: seller + status + order age since the grid above collapses */}
      <span className="col-span-3 flex items-center justify-between gap-2 pl-13 sm:hidden">
        <span className="flex min-w-0 items-center gap-1.5 truncate text-xs text-ink/50">
          <Store size={11} className="flex-none text-ink/30" />
          <span className="truncate">{row.sellerName}</span>
        </span>
        <span className={`inline-flex flex-none items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${TONE_PILL[tone]}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} />
          {QC_STATUS_LABEL[row.status]}
        </span>
        <span className={breached ? "flex-none text-xs font-semibold text-rose-700" : "flex-none text-xs text-ink/45"}>
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