// app/admin/qc/page.tsx
"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { AlertTriangle, ClipboardCheck, Inbox, Layers, Search, SearchX, Store } from "lucide-react"

import { useAdminData, isOrderAgeBreached } from "@/contexts/AdminDataContext"
import { QC_STATUS_LABEL, CHANNEL_LABEL, type QCStatus, type QCLine } from "@/types/admin"
import type { StatusTone } from "@/components/admin/warehouse/status-pill"
import { panelClass } from "@/components/admin/seller/shared"

// Quality Check queue: items that have been bought and have arrived at this
// warehouse site, waiting to be inspected. It is the stage before Pack & label.
//
// Rows are grouped by parent order. Each group has one header (order number,
// customer, item/seller count, flagged count, "X/Y passed") with its item rows
// underneath. The progress numbers read from ALL of an order's lines
// (`allLines`), not just the ones visible in the current tab or search, so
// switching to "Flagged" never makes a 2-passed/1-flagged order look like
// "0/3 passed". A small note in the group covers the hidden items.
//
// Clicking a row (or the product name) opens the inspection screen. Opening is
// safe, nothing changes until the inspection is saved there.
//
// Backed by AdminDataContext.visibleQcLines, joined live from purchases +
// orders, so this queue can never disagree with Purchases or Order detail.

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
const QC_STATUS_TONE: Record<QCStatus, StatusTone> = {
  pending: "amber",
  passed: "teal",
  flagged: "rose",
}

// Seven columns, shared by the legend and every row so they always line up.
// Written out in full (with the sm: prefix) so Tailwind can see the class.
const GRID =
  "sm:grid-cols-[minmax(0,2fr)_minmax(0,1.1fr)_3rem_6rem_6.5rem_minmax(0,0.8fr)_9rem]"
const COLUMNS = ["Product", "Seller", "Qty", "Arrived", "Order age", "Photos", "Status"]

interface OrderGroup {
  orderId: string
  orderNumber: string
  customerName: string
  allLines: QCLine[]
  visibleLines: QCLine[]
}

function matchesQuery(row: QCLine, q: string) {
  return (
    !q ||
    row.orderNumber.toLowerCase().includes(q) ||
    row.customerName.toLowerCase().includes(q) ||
    row.productTitle.toLowerCase().includes(q) ||
    row.sellerName.toLowerCase().includes(q)
  )
}

export default function QCPage() {
  const router = useRouter()
  const { visibleQcLines, currentUser, permissions, sites } = useAdminData()
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("pending")
  const [query, setQuery] = useState("")

  // Counts reflect the active search too, so the tab counts always match
  // what's on screen.
  const counts = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base: Record<string, number> = { all: 0 }
    for (const row of visibleQcLines) {
      if (!matchesQuery(row, q)) continue
      base.all += 1
      base[row.status] = (base[row.status] ?? 0) + 1
    }
    return base
  }, [visibleQcLines, query])

  // Every group carries its full line set (for the progress numbers) plus the
  // subset that survives the active tab, which is what actually renders.
  const groups = useMemo<OrderGroup[]>(() => {
    const q = query.trim().toLowerCase()
    const byOrder = new Map<string, OrderGroup>()

    for (const row of visibleQcLines) {
      if (!matchesQuery(row, q)) continue // search scopes which orders appear at all

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
      if (tab === "all" || row.status === tab) group.visibleLines.push(row)
    }

    return Array.from(byOrder.values()).filter((g) => g.visibleLines.length > 0)
  }, [visibleQcLines, tab, query])

  const totalVisibleRows = groups.reduce((sum, g) => sum + g.visibleLines.length, 0)
  const tabTotal = counts[tab] ?? 0
  const hasSearch = query.trim().length > 0

  // Header stats always describe the whole queue, not the current filter.
  const pending = visibleQcLines.filter((l) => l.status === "pending")
  const flaggedTotal = visibleQcLines.filter((l) => l.status === "flagged").length
  const oldestPending = pending.reduce<QCLine | null>(
    (max, l) => (!max || l.orderAgeHours > max.orderAgeHours ? l : max),
    null,
  )
  const oldestBreached = oldestPending ? isOrderAgeBreached(oldestPending.orderAgeHours) : false

  // The warehouse role is pinned to one site; everyone else sees every site.
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
              <ClipboardCheck size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-display text-3xl font-semibold leading-tight">Quality check</h1>
              <p className="mt-1 max-w-md text-sm leading-relaxed text-ink/60">
                Inspect each item that&rsquo;s arrived at {scopeLabel} before it&rsquo;s packed.
              </p>
            </div>
          </div>

          <dl className="flex divide-x divide-ink/10 overflow-hidden rounded-2xl border border-ink/10 bg-card">
            <div className="px-5 py-3">
              <dt className="text-xs font-medium text-ink/45">Items to inspect</dt>
              <dd className="mt-0.5 font-display text-xl text-ink">{pending.length}</dd>
            </div>
            <div className="px-5 py-3">
              <dt className="text-xs font-medium text-ink/45">Flagged items</dt>
              <dd className={`mt-0.5 font-display text-xl ${flaggedTotal > 0 ? "text-rose-700" : "text-ink"}`}>
                {flaggedTotal}
              </dd>
            </div>
            <div className="px-5 py-3">
              <dt className="text-xs font-medium text-ink/45">Oldest order waiting</dt>
              <dd className={`mt-0.5 font-display text-xl ${oldestBreached ? "text-rose-700" : "text-ink"}`}>
                {oldestPending ? oldestPending.orderAgeLabel : "—"}
              </dd>
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
              placeholder="Search order, customer, product, seller"
              aria-label="Search order, customer, product or seller"
              className="w-full rounded-full border border-ink/10 bg-card py-2.5 pl-9 pr-4 text-sm placeholder:text-ink/35 outline-none transition-colors focus:border-teal/50 focus:ring-2 focus:ring-teal/15"
            />
          </div>
        </div>

        {/* ── Result count ── */}
        <p className="mt-4 text-xs text-ink/45">
          {totalVisibleRows === tabTotal
            ? `${tabTotal} item${tabTotal === 1 ? "" : "s"} across ${groups.length} order${groups.length === 1 ? "" : "s"}`
            : `${totalVisibleRows} of ${tabTotal} items across ${groups.length} order${groups.length === 1 ? "" : "s"}`}
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

        {/* ── Column legend: shown once above every group, since each group's
             rows share the same grid. Padding is 1px wider than the rows to
             account for the card border. ── */}
        {groups.length > 0 && (
          <div
            className={`sticky top-0 z-10 mt-3 hidden items-center gap-x-3 bg-parchment/90 px-[1.3125rem] py-2.5 text-xs font-medium text-ink/50 backdrop-blur sm:grid ${GRID}`}
          >
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
              <EmptyState
                hasSearch={hasSearch}
                tab={tab}
                tabLabel={TABS.find((t) => t.key === tab)?.label ?? ""}
                queueIsEmpty={visibleQcLines.length === 0}
                onClearSearch={() => setQuery("")}
                onShowAll={() => setTab("all")}
              />
            </div>
          ) : (
            groups.map((group) => (
              <OrderGroupCard
                key={group.orderId}
                group={group}
                onOpenLine={(id) => router.push(`/admin/qc/${id}`)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function OrderGroupCard({ group, onOpenLine }: { group: OrderGroup; onOpenLine: (id: string) => void }) {
  const passedCount = group.allLines.filter((l) => l.status === "passed").length
  const flaggedCount = group.allLines.filter((l) => l.status === "flagged").length
  const totalCount = group.allLines.length
  const hiddenCount = totalCount - group.visibleLines.length
  const sellerCount = new Set(group.allLines.map((l) => l.sellerName)).size
  const allPassed = passedCount === totalCount
  const anyBreached = group.allLines.some((l) => isOrderAgeBreached(l.orderAgeHours))

  return (
    <div className={`overflow-hidden ${panelClass}`}>
      {/* Order header: always shown, even for a single-item order, so which
          order a row belongs to never depends on matching numbers by eye. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-ink/[0.06] bg-parchment/40 px-5 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Link
            href={`/admin/orders/${group.orderId}`}
            className="rounded font-display text-sm font-semibold outline-none hover:text-teal-deep hover:underline focus-visible:ring-2 focus-visible:ring-teal/40"
          >
            {group.orderNumber}
          </Link>
          <span className="truncate text-sm text-ink/60">{group.customerName}</span>
          {anyBreached && (
            <span title="Order age limit exceeded" className="flex-none text-rose-600">
              <AlertTriangle size={14} aria-hidden />
              <span className="sr-only">Order age limit exceeded</span>
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {totalCount > 1 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-ink/[0.05] px-2.5 py-1 text-xs font-semibold text-ink/55 ring-1 ring-inset ring-ink/10">
              <Layers size={11} aria-hidden />
              {totalCount} items{sellerCount > 1 ? ` from ${sellerCount} sellers` : ""}
            </span>
          )}
          {flaggedCount > 0 && (
            <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
              {flaggedCount} flagged
            </span>
          )}
          {totalCount > 1 && (
            <span aria-hidden className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-ink/10 sm:flex">
              <span className="bg-teal-deep" style={{ width: `${(passedCount / totalCount) * 100}%` }} />
              <span className="bg-rose-500" style={{ width: `${(flaggedCount / totalCount) * 100}%` }} />
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
        <p className="border-b border-ink/[0.06] bg-parchment/20 px-5 py-1.5 text-[11px] text-ink/45">
          +{hiddenCount} other item{hiddenCount === 1 ? "" : "s"} on this order not shown in the current filter
        </p>
      )}

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
  // Red once the order is past its age limit; otherwise only items still
  // waiting for inspection get the "fresh" colour.
  const ageDot = breached ? "bg-rose-500" : row.status === "pending" ? "bg-teal" : "bg-ink/20"
  const ageText = breached ? "font-semibold text-rose-700" : "text-ink/50"

  const pill = (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${TONE_PILL[tone]}`}>
      <span className={`h-1.5 w-1.5 flex-none rounded-full ${TONE_DOT[tone]}`} aria-hidden />
      {QC_STATUS_LABEL[row.status]}
    </span>
  )

  return (
    <div
      onClick={onOpen}
      className={`grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-ink/[0.06] px-5 py-3.5 transition-colors last:border-b-0 hover:bg-ink/[0.02] sm:gap-y-0 ${GRID}`}
    >
      {/* Product */}
      <span className="flex min-w-0 items-center gap-3">
        <span className="h-10 w-10 flex-none overflow-hidden rounded-xl border border-ink/10 bg-ink/[0.04]">
          <Image src={row.productImage} alt="" width={40} height={40} className="h-full w-full object-cover" />
        </span>
        <span className="min-w-0">
          <Link
            href={`/admin/qc/${row.id}`}
            onClick={(e) => e.stopPropagation()}
            className="block truncate rounded text-sm font-semibold outline-none hover:text-teal-deep hover:underline focus-visible:ring-2 focus-visible:ring-teal/40"
          >
            {row.productTitle}
          </Link>
          {row.variant && <span className="block truncate text-xs text-ink/50">{row.variant}</span>}
        </span>
      </span>

      {/* mobile: status sits beside the product, details drop below */}
      <span className="sm:hidden">{pill}</span>

      <span className="hidden min-w-0 flex-col sm:flex">
        <span className="flex min-w-0 items-center gap-1.5 text-sm text-ink/70">
          <Store size={12} className="flex-none text-ink/30" aria-hidden />
          <span className="truncate">{row.sellerName}</span>
        </span>
        <span className="truncate text-xs text-ink/40">{CHANNEL_LABEL[row.channel]}</span>
      </span>

      <span className="hidden text-right text-sm tabular-nums text-ink/60 sm:block">{row.quantity}</span>

      <span className="hidden whitespace-nowrap text-sm tabular-nums text-ink/50 sm:block">{row.arrivedAgo}</span>

      <span className={`hidden items-center gap-2 whitespace-nowrap text-sm tabular-nums sm:inline-flex ${ageText}`}>
        <span className={`h-2 w-2 flex-none rounded-full ${ageDot}`} aria-hidden />
        {row.orderAgeLabel}
      </span>

      <span className="hidden truncate text-sm text-ink/50 sm:block">
        {row.photoCount > 0 ? `${row.photoCount} photo${row.photoCount > 1 ? "s" : ""}` : "—"}
      </span>

      <span className="hidden sm:block">{pill}</span>

      {/* mobile-only details */}
      <span className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink/55 sm:hidden">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <Store size={11} className="flex-none text-ink/30" aria-hidden />
          <span className="truncate">{row.sellerName}</span>
        </span>
        <span>Qty {row.quantity}</span>
        <span className={`inline-flex items-center gap-1.5 ${ageText}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${ageDot}`} aria-hidden />
          Order {row.orderAgeLabel} old
        </span>
      </span>
    </div>
  )
}

function EmptyState({
  hasSearch,
  tab,
  tabLabel,
  queueIsEmpty,
  onClearSearch,
  onShowAll,
}: {
  hasSearch: boolean
  tab: string
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
          <p className="text-sm font-semibold text-ink/70">No items match this search</p>
          <p className="mt-1 text-xs text-ink/50">Check the order number, customer, product or seller.</p>
        </div>
        <button type="button" onClick={onClearSearch} className={linkButton}>
          Clear search
        </button>
      </div>
    )
  }

  // The default tab is "Needs inspection", so an empty tab is not the same
  // as an empty queue.
  if (!queueIsEmpty) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
        <Inbox size={22} className="text-ink/25" />
        <div>
          <p className="text-sm font-semibold text-ink/70">
            {tab === "pending" ? "Nothing needs inspection" : `No items in “${tabLabel}”`}
          </p>
          <p className="mt-1 text-xs text-ink/50">
            {tab === "pending"
              ? "Every item that has arrived has been checked."
              : "Other items are in the queue under a different status."}
          </p>
        </div>
        <button type="button" onClick={onShowAll} className={linkButton}>
          Show all items
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
      <Inbox size={22} className="text-ink/25" />
      <div>
        <p className="text-sm font-semibold text-ink/70">Queue is clear</p>
        <p className="mt-1 max-w-xs text-xs text-ink/50">
          Nothing&rsquo;s waiting for inspection at this site right now.
        </p>
      </div>
    </div>
  )
}