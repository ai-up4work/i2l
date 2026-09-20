// app/admin/purchases/page.tsx
"use client"

import { useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronRight, Inbox, Layers, Search, SearchX, ShoppingBag, Store } from "lucide-react"

import { STATUS_LABEL, CHANNEL_LABEL } from "@/data/purchases/data"
import type { PurchaseLine, PurchaseStatus } from "@/types/admin"
import type { StatusTone } from "@/components/admin/warehouse/status-pill"
import { useAdminData } from "@/contexts/AdminDataContext"

// Purchases: the ops queue for "go buy this item from this seller". Scoped per
// order line, not per order: an order can span several sellers, and each
// purchase is an independent action one person can complete on its own.
//
// Rows are grouped under their parent order. Each group header carries the
// order number, customer and an "X/Y purchased" pill. Progress is computed from
// ALL of the order's lines (allLines), not just the ones surviving the current
// tab or search, so switching to "Needs purchase" never makes an order look
// like 0/1 purchased. A small note under the header covers the hidden lines.
//
// Only problem rows (unavailable, or carrying a QC/repurchase issue note) get
// a red edge, so the eye goes straight to them.
//
// Backed by AdminDataContext.visiblePurchaseLines, joined live from real
// orders, so this queue and /admin/orders can never disagree about a customer,
// site or stage.
//
// RESTYLE (2026-09): rows are taller with a 64px product photo (was 40px), the
// product title wraps to two lines instead of truncating, and the price column
// shows the line total under the unit price when quantity is more than one.
// Filtering, grouping and navigation logic is unchanged.

type TabKey = "all" | PurchaseStatus

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "needs_purchase", label: "Needs purchase" },
  { key: "purchased", label: "Purchased" },
  { key: "unavailable", label: "Issues" },
]

const STATUS_TONE: Record<PurchaseStatus, StatusTone> = {
  needs_purchase: "amber",
  purchased: "teal",
  unavailable: "rose",
}
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

const PILL = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold"
const INK_PILL = "bg-ink/[0.04] text-ink/60 ring-1 ring-inset ring-ink/10"
const LINK_BUTTON = "text-xs font-semibold text-teal-deep underline decoration-dotted underline-offset-4 hover:text-teal"

// Shared by the column header and every row so the columns always line up.
const GRID =
  "sm:grid-cols-[minmax(0,2.4fr)_minmax(0,1.3fr)_3rem_minmax(0,1fr)_minmax(0,0.7fr)_minmax(0,1fr)_1.5rem]"

const COLUMNS: { label: string; right?: boolean }[] = [
  { label: "Product" },
  { label: "Seller" },
  { label: "Qty", right: true },
  { label: "Quoted price", right: true },
  { label: "Age" },
  { label: "Status" },
]

interface OrderGroup {
  orderId: string
  orderNumber: string
  customerName: string
  /** Every line on this order visible to the current user, regardless of tab or search. Used for the progress pill. */
  allLines: PurchaseLine[]
  /** Only the lines that survive the current tab and search. These are what render. */
  visibleLines: PurchaseLine[]
}

/** Per-item label: channel 3 is always "Manual request". Channel 1/2 uses the item's OWN source, since a mixed cart's order-level channel can't be trusted per item (see PurchaseLine.itemSource). */
function itemSourceLabel(line: { channel: number; itemSource: "catalogue" | "link" }): string {
  if (line.channel === 3) return CHANNEL_LABEL[3]
  return line.itemSource === "catalogue" ? "Affiliated store" : "Scraped link"
}

const matchesQuery = (line: PurchaseLine, q: string) =>
  !q ||
  line.orderNumber.toLowerCase().includes(q) ||
  line.customerName.toLowerCase().includes(q) ||
  line.productTitle.toLowerCase().includes(q) ||
  line.sellerName.toLowerCase().includes(q)

function StatusPill({ line }: { line: PurchaseLine }) {
  const tone = STATUS_TONE[line.status]
  return (
    <span className={`${PILL} ${TONE_PILL[tone]}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[tone]}`} aria-hidden />
      {STATUS_LABEL[line.status]}
    </span>
  )
}

export default function PurchasesPage() {
  const { visiblePurchaseLines } = useAdminData()
  const [tab, setTab] = useState<TabKey>("needs_purchase")
  const [query, setQuery] = useState("")

  // Search scopes everything, including the tab counts, so a count always
  // matches what the tab would show.
  const counts = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base: Record<string, number> = { all: 0 }
    for (const line of visiblePurchaseLines) {
      if (!matchesQuery(line, q)) continue
      base.all += 1
      base[line.status] = (base[line.status] ?? 0) + 1
    }
    return base
  }, [visiblePurchaseLines, query])

  // Every group keeps its full line set for the progress pill, plus the subset
  // that survives the active tab for rendering. A group with no visible lines
  // is dropped.
  const groups = useMemo<OrderGroup[]>(() => {
    const q = query.trim().toLowerCase()
    const byOrder = new Map<string, OrderGroup>()

    for (const line of visiblePurchaseLines) {
      if (!matchesQuery(line, q)) continue

      let group = byOrder.get(line.orderId)
      if (!group) {
        group = {
          orderId: line.orderId,
          orderNumber: line.orderNumber,
          customerName: line.customerName,
          allLines: [],
          visibleLines: [],
        }
        byOrder.set(line.orderId, group)
      }
      group.allLines.push(line)
      if (tab === "all" || line.status === tab) group.visibleLines.push(line)
    }

    return Array.from(byOrder.values()).filter((g) => g.visibleLines.length > 0)
  }, [visiblePurchaseLines, tab, query])

  const shownRows = groups.reduce((sum, g) => sum + g.visibleLines.length, 0)
  const needsCount = visiblePurchaseLines.filter((l) => l.status === "needs_purchase").length
  const purchasedCount = visiblePurchaseLines.filter((l) => l.status === "purchased").length
  const issueCount = visiblePurchaseLines.filter((l) => l.status === "unavailable").length
  const orderCount = new Set(visiblePurchaseLines.map((l) => l.orderId)).size
  const hasSearch = query.trim() !== ""

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      <div className="mx-auto max-w-8xl px-6 pb-8 pt-10 lg:px-10">
        {/* ── Header ── */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-teal-deep text-parchment">
              <ShoppingBag size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-display text-3xl font-semibold leading-tight">Purchases</h1>
              <p className="mt-1 max-w-md text-sm leading-relaxed text-ink/60">
                Buy each ordered item from its seller and record what was actually paid.
              </p>
            </div>
          </div>

          <dl className="flex divide-x divide-ink/10 overflow-x-auto rounded-2xl border border-ink/10 bg-card">
            <div className="px-5 py-3">
              <dt className="whitespace-nowrap text-xs font-medium text-ink/45">Needs purchase</dt>
              <dd className="mt-0.5 font-display text-xl tabular-nums text-ink">{needsCount}</dd>
            </div>
            <div className="px-5 py-3">
              <dt className="whitespace-nowrap text-xs font-medium text-ink/45">Purchased</dt>
              <dd className="mt-0.5 font-display text-xl tabular-nums text-ink">{purchasedCount}</dd>
            </div>
            <div className="px-5 py-3">
              <dt className="whitespace-nowrap text-xs font-medium text-ink/45">Issues</dt>
              <dd className={`mt-0.5 font-display text-xl tabular-nums ${issueCount > 0 ? "text-rose-700" : "text-ink"}`}>
                {issueCount}
              </dd>
            </div>
            <div className="px-5 py-3">
              <dt className="whitespace-nowrap text-xs font-medium text-ink/45">Orders</dt>
              <dd className="mt-0.5 font-display text-xl tabular-nums text-ink">{orderCount}</dd>
            </div>
          </dl>
        </div>

        {/* ── Filters ── */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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

          <div className="relative w-full sm:w-80">
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
          {shownRows} of {visiblePurchaseLines.length} items shown, across {groups.length} order
          {groups.length === 1 ? "" : "s"}
          {hasSearch && (
            <button type="button" onClick={() => setQuery("")} className={`ml-2 ${LINK_BUTTON}`}>
              Clear search
            </button>
          )}
        </p>

        {/* ── Grouped list ── */}
        <div className="mt-3 space-y-4">
          {groups.length === 0 ? (
            <div className="rounded-2xl border border-ink/10 bg-card">
              <EmptyState
                hasSearch={hasSearch}
                tab={tab}
                tabLabel={TABS.find((t) => t.key === tab)?.label ?? ""}
                queueIsEmpty={visiblePurchaseLines.length === 0}
                onClearSearch={() => setQuery("")}
                onShowAll={() => setTab("all")}
              />
            </div>
          ) : (
            <>
              <div
                className={`sticky top-0 z-10 hidden items-center gap-4 rounded-2xl border border-ink/10 bg-parchment/90 px-5 py-3 text-xs font-medium text-ink/50 backdrop-blur sm:grid ${GRID}`}
              >
                {COLUMNS.map((c) => (
                  <span key={c.label} className={c.right ? "text-right" : ""}>
                    {c.label}
                  </span>
                ))}
                <span />
              </div>

              {groups.map((group) => (
                <OrderGroupCard key={group.orderId} group={group} />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function OrderGroupCard({ group }: { group: OrderGroup }) {
  const purchasedCount = group.allLines.filter((l) => l.status === "purchased").length
  const totalCount = group.allLines.length
  const hiddenCount = totalCount - group.visibleLines.length
  const sellerCount = new Set(group.allLines.map((l) => l.sellerName)).size
  const allDone = purchasedCount === totalCount

  return (
    <section className="overflow-clip rounded-2xl border border-ink/10 bg-card">
      {/* Order header: always shown, even for a single-item order, so "which
          order is this" never depends on remembering a number from three rows up. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/[0.06] bg-parchment/50 px-5 py-3.5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
          <Link
            href={`/admin/orders/${group.orderId}`}
            className="rounded font-display text-base font-semibold outline-none hover:text-teal-deep hover:underline focus-visible:ring-2 focus-visible:ring-teal/40"
          >
            {group.orderNumber}
          </Link>
          <span className="truncate text-sm text-ink/60">{group.customerName}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {totalCount > 1 && (
            <span className={`${PILL} ${INK_PILL}`}>
              <Layers size={11} aria-hidden />
              {totalCount} items{sellerCount > 1 ? `, ${sellerCount} sellers` : ""}
            </span>
          )}
          <span className={`${PILL} ${allDone ? TONE_PILL.teal : INK_PILL}`}>
            {purchasedCount}/{totalCount} purchased
          </span>
        </div>
      </div>

      {hiddenCount > 0 && (
        <p className="border-b border-ink/[0.06] bg-parchment/20 px-5 py-1.5 text-xs text-ink/45">
          +{hiddenCount} other item{hiddenCount === 1 ? "" : "s"} on this order not shown in the current filter
        </p>
      )}

      <div>
        {group.visibleLines.map((line) => (
          <PurchaseRow key={line.id} line={line} />
        ))}
      </div>
    </section>
  )
}

function PurchaseRow({ line }: { line: PurchaseLine }) {
  const router = useRouter()
  const href = `/admin/purchases/${line.id}`
  const problem = line.status === "unavailable" || Boolean(line.issueNote)
  const price = `Rs. ${line.quotedUnitPriceLKR.toLocaleString()}`
  const lineTotal = `Rs. ${(line.quotedUnitPriceLKR * line.quantity).toLocaleString()}`

  return (
    // The row is clickable, the product title is a real <Link> so keyboard and
    // middle-click still work.
    <div
      onClick={() => router.push(href)}
      className={`relative grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 border-b border-ink/[0.06] px-5 py-4 transition-colors last:border-b-0 hover:bg-ink/[0.02] focus-within:bg-teal/[0.04] sm:gap-y-0 ${GRID}`}
    >
      {problem && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-rose-500" />}

      {/* Product */}
      <span className="flex min-w-0 items-center gap-4">
        <span className="h-18 w-18 flex-none overflow-hidden rounded-xl border border-ink/10 bg-ink/[0.04] sm:h-24 sm:w-24">
          <Image src={line.productImage} alt="" width={160} height={160} className="h-full w-full object-cover" />
        </span>
        <span className="min-w-0">
          <Link
            href={href}
            onClick={(e) => e.stopPropagation()}
            className="line-clamp-2 break-words rounded text-sm font-semibold leading-snug outline-none hover:text-teal-deep hover:underline focus-visible:ring-2 focus-visible:ring-teal/40"
          >
            {line.productTitle}
          </Link>
          {(line.variant || line.issueNote) && (
            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              {line.variant && <span className="truncate text-xs text-ink/50">{line.variant}</span>}
              {line.issueNote && (
                // "Repurchase" only for an item back on this queue waiting to be
                // bought again (needs_purchase with an issueNote). An item still
                // flagged in QC (status stays "purchased") hasn't had that
                // decision made yet, so it gets the accurate label "Flagged".
                <span title={line.issueNote} className={`${PILL} flex-none ${TONE_PILL.rose}`}>
                  {line.status === "needs_purchase" ? "Repurchase" : "Flagged"}
                </span>
              )}
            </span>
          )}
        </span>
      </span>

      {/* mobile: status sits beside the product */}
      <span className="sm:hidden">
        <StatusPill line={line} />
      </span>

      <span className="hidden min-w-0 flex-col sm:flex">
        <span className="flex min-w-0 items-center gap-1.5 text-sm text-ink/75">
          <Store size={13} className="flex-none text-ink/30" aria-hidden />
          <span className="truncate">{line.sellerName}</span>
        </span>
        <span className="mt-0.5 truncate text-xs text-ink/45">{itemSourceLabel(line)}</span>
      </span>

      <span className="hidden justify-self-end text-sm tabular-nums text-ink/65 sm:block">{line.quantity}</span>

      <span className="hidden flex-col items-end sm:flex">
        <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-ink">{price}</span>
        {line.quantity > 1 && (
          <span className="mt-0.5 whitespace-nowrap text-xs tabular-nums text-ink/45">{lineTotal} total</span>
        )}
      </span>

      <span className="hidden whitespace-nowrap text-sm tabular-nums text-ink/55 sm:block">{line.ageLabel}</span>

      <span className="hidden sm:block">
        <StatusPill line={line} />
      </span>

      <ChevronRight size={16} className="hidden flex-none text-ink/25 sm:block" aria-hidden />

      {/* mobile-only details */}
      <span className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink/55 sm:hidden">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <Store size={11} className="flex-none text-ink/30" aria-hidden />
          <span className="truncate">{line.sellerName}</span>
        </span>
        <span className="tabular-nums">
          {line.quantity} × {price}
        </span>
        <span>{line.ageLabel}</span>
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
  tab: TabKey
  tabLabel: string
  queueIsEmpty: boolean
  onClearSearch: () => void
  onShowAll: () => void
}) {
  const shell = "flex flex-col items-center gap-3 px-4 py-16 text-center"

  if (hasSearch) {
    return (
      <div className={shell}>
        <SearchX size={22} className="text-ink/25" />
        <div>
          <p className="text-sm font-semibold text-ink/70">No items match this search</p>
          <p className="mt-1 text-xs text-ink/50">Check the order number, customer, product or seller.</p>
        </div>
        <button type="button" onClick={onClearSearch} className={LINK_BUTTON}>
          Clear search
        </button>
      </div>
    )
  }

  // The default tab is "Needs purchase", so an empty tab is not an empty queue.
  // For that tab an empty list is good news, not a gap.
  if (!queueIsEmpty && tab !== "all") {
    const isQueue = tab === "needs_purchase"
    return (
      <div className={shell}>
        <Inbox size={22} className="text-ink/25" />
        <div>
          <p className="text-sm font-semibold text-ink/70">{isQueue ? "Queue is clear" : `No items in \u201C${tabLabel}\u201D`}</p>
          <p className="mt-1 text-xs text-ink/50">
            {isQueue ? "Nothing is waiting to be purchased right now." : "Other items are listed under a different tab."}
          </p>
        </div>
        <button type="button" onClick={onShowAll} className={LINK_BUTTON}>
          Show all items
        </button>
      </div>
    )
  }

  return (
    <div className={shell}>
      <Inbox size={22} className="text-ink/25" />
      <div>
        <p className="text-sm font-semibold text-ink/70">No purchases yet</p>
        <p className="mt-1 max-w-xs text-xs text-ink/50">Items appear here once an order is placed.</p>
      </div>
    </div>
  )
}