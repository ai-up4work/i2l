// app/admin/purchases/page.tsx
"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { ChevronRight, Inbox, Layers, Search, SearchX, ShoppingBag, Store } from "lucide-react"

import { STATUS_LABEL, CHANNEL_LABEL } from "@/data/purchases/data"

/** Per-item label: channel 3 is always "Manual request" (unambiguous, never mixed with other channels in one order). Channel 1/2 uses the item's OWN source instead of the order's — see PurchaseLine.itemSource's doc comment for why a mixed cart's order-level channel can't be trusted per item. */
function itemSourceLabel(line: { channel: number; itemSource: "catalogue" | "link" }): string {
  if (line.channel === 3) return CHANNEL_LABEL[3]
  return line.itemSource === "catalogue" ? "Affiliated store" : "Scraped link"
}
import type { PurchaseLine, PurchaseStatus } from "@/types/admin"
import type { StatusTone } from "@/components/admin/warehouse/status-pill"
import { panelClass } from "@/components/admin/seller/shared"
import { useAdminData } from "@/contexts/AdminDataContext"

// Purchases queue — the ops screen for "go buy this item from this seller."
// Scoped per order-line/seller (not per whole order): an order can span
// multiple sellers, and each purchase is an independent action one person
// can pick up and complete on its own.
//
// GROUPING (2026-09): rows are grouped by parent order rather than shown
// as a flat list. Nothing on the old flat layout told you two rows were
// the same order unless you happened to notice a matching order number —
// easy to miss on a busy queue, and actively confusing on a multi-item
// order where some lines are purchased and others aren't. Each group now
// gets a single header (order number, customer, seller-count tag, and a
// "X/Y purchased" progress pill computed from ALL of that order's lines,
// not just the ones visible in the current tab/search) with its item
// rows nested underneath.
//
// Progress is computed from `allLinesByOrder` (built from the full,
// unfiltered visiblePurchaseLines) rather than from the filtered `rows`,
// specifically so switching to the "Needs purchase" tab doesn't make an
// order LOOK like it's 0/1 purchased just because its other, already-
// purchased line is hidden by the filter. A small note below the header
// covers that gap explicitly instead of leaving it implicit.
//
// Backed by AdminDataContext.visiblePurchaseLines, which is joined live
// from real orders — so this queue and the /admin/orders pages can never
// disagree about a customer name, site, or stage.

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
const TONE_EDGE: Record<StatusTone, string> = {
  teal: "before:bg-teal-deep/70",
  amber: "before:bg-gold-deep",
  rose: "before:bg-rose-600/70",
}

const TABS: { key: "all" | PurchaseStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "needs_purchase", label: "Needs purchase" },
  { key: "purchased", label: "Purchased" },
  { key: "unavailable", label: "Issues" },
]

const COLUMNS = ["Product", "Seller", "Qty", "Quoted price", "Age", "Status"]

interface OrderGroup {
  orderId: string
  orderNumber: string
  customerName: string
  channel: PurchaseLine["channel"]
  /** Every line on this order visible to the current user, regardless of tab/search — used for the progress pill. */
  allLines: PurchaseLine[]
  /** Only the lines that survive the current tab/search filter — these are what actually render. */
  visibleLines: PurchaseLine[]
}

export default function PurchasesPage() {
  const router = useRouter()
  const { visiblePurchaseLines } = useAdminData()
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("needs_purchase")
  const [query, setQuery] = useState("")

  const matchesQuery = (line: PurchaseLine, q: string) =>
    !q ||
    line.orderNumber.toLowerCase().includes(q) ||
    line.customerName.toLowerCase().includes(q) ||
    line.productTitle.toLowerCase().includes(q) ||
    line.sellerName.toLowerCase().includes(q)

  // Counts reflect the active search too, so the tab pills never disagree
  // with what's actually on screen underneath them.
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

  // Build order groups: every group carries its full (unfiltered-by-tab)
  // line set for the progress pill, plus the subset that survives the
  // active tab/search for actual rendering. A group with zero visible
  // lines is dropped entirely — it just means none of that order's items
  // match the current filter.
  const groups = useMemo<OrderGroup[]>(() => {
    const q = query.trim().toLowerCase()
    const byOrder = new Map<string, OrderGroup>()

    for (const line of visiblePurchaseLines) {
      if (!matchesQuery(line, q)) continue // search still scopes which orders appear at all

      let group = byOrder.get(line.orderId)
      if (!group) {
        group = {
          orderId: line.orderId,
          orderNumber: line.orderNumber,
          customerName: line.customerName,
          channel: line.channel,
          allLines: [],
          visibleLines: [],
        }
        byOrder.set(line.orderId, group)
      }
      group.allLines.push(line)
      if (tab === "all" || line.status === tab) {
        group.visibleLines.push(line)
      }
    }

    return Array.from(byOrder.values()).filter((g) => g.visibleLines.length > 0)
  }, [visiblePurchaseLines, tab, query])

  const totalVisibleRows = groups.reduce((sum, g) => sum + g.visibleLines.length, 0)
  const hasAnyFilter = query.trim().length > 0 || tab !== "all"
  const clearFilters = () => {
    setQuery("")
    setTab("all")
  }

  const tabTotal = counts[tab] ?? 0

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      <div className="mx-auto max-w-[1560px] px-6 pb-20 pt-10 lg:px-10">
        {/* ── Header ── */}
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 flex-none place-items-center rounded-2xl border border-ink/10 bg-card text-teal-deep shadow-[0_1px_2px_rgba(32,36,43,0.04),0_16px_40px_-24px_rgba(14,140,156,0.4)]">
              <ShoppingBag size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-display text-3xl text-ink">Purchases</h1>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink/60">
                Buy each ordered item from its seller and record what was actually paid.
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

        {/* ── Grouped list ── */}
        <div className="mt-3 space-y-4">
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
                onOpenLine={(id) => router.push(`/admin/purchases/${id}`)}
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
  const purchasedCount = group.allLines.filter((l) => l.status === "purchased").length
  const totalCount = group.allLines.length
  const hiddenCount = totalCount - group.visibleLines.length
  const sellerCount = new Set(group.allLines.map((l) => l.sellerName)).size
  const allDone = purchasedCount === totalCount

  return (
    <div className={`overflow-hidden ${panelClass}`}>
      {/* Order header — always shown, even for a single-item order, so
          "which order is this" never depends on remembering a row's order
          number from three rows up. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/[0.06] bg-parchment/40 px-5 py-3">
        <button
          type="button"
          onClick={onOpenOrder}
          className="flex min-w-0 items-center gap-2 text-left hover:underline"
        >
          <span className="font-display text-sm font-semibold text-ink">{group.orderNumber}</span>
          <span className="text-ink/25">·</span>
          <span className="truncate text-sm text-ink/60">{group.customerName}</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {totalCount > 1 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-ink/[0.05] px-2.5 py-1 text-xs font-semibold text-ink/55 ring-1 ring-inset ring-ink/10">
              <Layers size={11} /> {totalCount} items{sellerCount > 1 ? ` · ${sellerCount} sellers` : ""}
            </span>
          )}
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              allDone
                ? "bg-teal/12 text-teal-deep ring-1 ring-inset ring-teal/25"
                : "bg-ink/[0.04] text-ink/55 ring-1 ring-inset ring-ink/10"
            }`}
          >
            {purchasedCount}/{totalCount} purchased
          </span>
        </div>
      </div>

      {hiddenCount > 0 && (
        <p className="border-b border-ink/[0.06] bg-parchment/20 px-5 py-1.5 text-[11px] text-ink/40">
          +{hiddenCount} other item{hiddenCount === 1 ? "" : "s"} on this order not shown in the current filter
        </p>
      )}

      {/* Item rows — indented slightly so they read as children of the
          header above, with their own order/customer columns dropped
          since the header already carries that context. */}
      <div>
        {group.visibleLines.map((line) => (
          <PurchaseRow key={line.id} line={line} onOpen={() => onOpenLine(line.id)} />
        ))}
      </div>
    </div>
  )
}

function PurchaseRow({
  line,
  onOpen,
}: {
  line: PurchaseLine
  onOpen: () => void
}) {
  const tone = STATUS_TONE[line.status]

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpen()
      }}
      className={`group relative grid w-full cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-ink/[0.06] py-3.5 pl-8 pr-5 text-left outline-none transition-colors before:absolute before:inset-y-0 before:left-5 before:w-[3px] before:content-[''] last:border-b-0 hover:bg-parchment/50 focus-visible:bg-teal/[0.08] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-teal/40 sm:grid-cols-[2fr_1.3fr_0.5fr_0.9fr_0.7fr_0.9fr_auto] ${TONE_EDGE[tone]}`}
    >
      {/* Product */}
      <span className="col-span-2 flex min-w-0 items-center gap-3 sm:col-span-1">
        <span className="h-10 w-10 flex-none overflow-hidden rounded-xl border border-ink/10 bg-ink/[0.04]">
          <Image src={line.productImage} alt="" width={40} height={40} className="h-full w-full object-cover" />
        </span>
        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="block truncate text-sm font-semibold text-ink">{line.productTitle}</span>
            {line.issueNote && (
              <span
                title={line.issueNote}
                className="inline-flex flex-none items-center gap-1 rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-200"
              >
                {/* "Repurchase" only for an item actually back on this
                    queue waiting to be bought again (status is
                    needs_purchase with an issueNote — see
                    mapToPurchases' awaitingRepurchaseItemIds branch).
                    An item still just sitting flagged in QC (status
                    stays "purchased" with a QC-flag issueNote) hasn't
                    had that decision made yet, so it gets a distinct,
                    accurate label instead of implying a repurchase
                    that hasn't actually been requested. */}
                {line.status === "needs_purchase" ? "Repurchase" : "Flagged"}
              </span>
            )}
          </span>
          {line.variant && <span className="block truncate text-xs text-ink/40">{line.variant}</span>}
        </span>
      </span>

      <span className="hidden min-w-0 flex-col sm:flex">
        <span className="flex min-w-0 items-center gap-1.5 truncate text-sm text-ink/70">
          <Store size={12} className="flex-none text-ink/30" />
          <span className="truncate">{line.sellerName}</span>
        </span>
        <span className="truncate text-xs text-ink/35">{itemSourceLabel(line)}</span>
      </span>

      <span className="hidden justify-self-end text-sm text-ink/55 sm:block">{line.quantity}</span>

      <span className="hidden justify-self-end whitespace-nowrap text-sm font-medium text-ink/70 sm:block">
        ₹{line.quotedUnitPriceINR.toLocaleString("en-IN")}
      </span>

      <span className="hidden whitespace-nowrap text-sm text-ink/50 sm:block">{line.ageLabel}</span>

      <span className="hidden sm:block">
        <span
          className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${TONE_PILL[tone]}`}
        >
          <span className={`h-1.5 w-1.5 flex-none rounded-full ${TONE_DOT[tone]}`} />
          {STATUS_LABEL[line.status]}
        </span>
      </span>

      <ChevronRight size={16} className="hidden flex-none text-ink/25 transition-colors group-hover:text-ink/50 sm:block" />

      {/* mobile-only: seller + price + status since the grid above collapses */}
      <span className="col-span-3 flex items-center justify-between gap-2 pl-13 sm:hidden">
        <span className="flex min-w-0 items-center gap-1.5 truncate text-xs text-ink/50">
          <Store size={11} className="flex-none text-ink/30" />
          <span className="truncate">{line.sellerName}</span>
        </span>
        <span className={`inline-flex flex-none items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${TONE_PILL[tone]}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} />
          {STATUS_LABEL[line.status]}
        </span>
      </span>
    </div>
  )
}

/**
 * Distinguishes "nothing matches your search/tab" (recoverable, offer to
 * clear) from "the queue is genuinely empty" — for the default
 * needs_purchase tab, an empty queue is good news, not a gap, so it gets
 * a calmer icon and copy rather than an onboarding-style prompt.
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
        <p className="mt-1 max-w-xs text-xs text-ink/45">Nothing&rsquo;s waiting to be purchased right now.</p>
      </div>
    </div>
  )
}