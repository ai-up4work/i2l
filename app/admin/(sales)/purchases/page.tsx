// app/admin/purchases/page.tsx
"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { ChevronRight, Inbox, Search, SearchX, ShoppingBag, Store } from "lucide-react"

import { STATUS_LABEL, CHANNEL_LABEL } from "@/data/purchases/data"
import type { PurchaseLine, PurchaseStatus } from "@/types/admin"
import type { StatusTone } from "@/components/admin/warehouse/status-pill"
import { panelClass } from "@/components/admin/seller/shared"
import { useAdminData } from "@/contexts/AdminDataContext"

// Purchases queue — the ops screen for "go buy this item from this seller."
// Scoped per order-line/seller (not per whole order): an order can span
// multiple sellers, and each purchase is an independent action one person
// can pick up and complete on its own. Each row still shows the parent
// order/customer so ops has context without needing a separate lookup.
//
// Backed by AdminDataContext.visiblePurchaseLines, which is joined live
// from real orders — so this queue and the /admin/orders pages can never
// disagree about a customer name, site, or stage.
//
// Visual language matches the Sellers/Quality check screens deliberately —
// same panelClass table shell, same tone system, same edge-bar rows —
// since ops moves between all three queues in the course of a shift.

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

const COLUMNS = ["Product", "Order", "Seller", "Qty", "Quoted price", "Age", "Status"]

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

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return visiblePurchaseLines.filter((line) => {
      if (tab !== "all" && line.status !== tab) return false
      return matchesQuery(line, q)
    })
  }, [visiblePurchaseLines, tab, query])

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
          {rows.length === tabTotal
            ? `${tabTotal} item${tabTotal === 1 ? "" : "s"}`
            : `${rows.length} of ${tabTotal} items`}
        </p>

        {/* ── Table ── */}
        <div className={`mt-3 overflow-hidden ${panelClass}`}>
          <div className="sticky top-0 z-10 hidden grid-cols-[1.8fr_1fr_1.1fr_0.5fr_0.9fr_0.7fr_0.9fr_auto] gap-2 border-b border-ink/10 bg-parchment/70 px-5 py-3 text-[11px] font-semibold tracking-wide text-ink/45 sm:grid">
            {COLUMNS.map((label, i) => (
              <span key={label} className={i === 3 || i === 4 ? "text-right" : ""}>
                {label}
              </span>
            ))}
          </div>

          {rows.length === 0 ? (
            <EmptyState hasAnyFilter={hasAnyFilter} onClearFilters={clearFilters} />
          ) : (
            rows.map((line) => (
              <PurchaseRow
                key={line.id}
                line={line}
                onOpen={() => router.push(`/admin/purchases/${line.id}`)}
              />
            ))
          )}
        </div>
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
      className={`group relative grid w-full cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-ink/[0.06] px-5 py-3.5 pl-6 text-left outline-none transition-colors before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:content-[''] last:border-b-0 hover:bg-parchment/50 focus-visible:bg-teal/[0.08] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-teal/40 sm:grid-cols-[1.8fr_1fr_1.1fr_0.5fr_0.9fr_0.7fr_0.9fr_auto] ${TONE_EDGE[tone]}`}
    >
      {/* Product */}
      <span className="col-span-2 flex min-w-0 items-center gap-3 sm:col-span-1">
        <span className="h-10 w-10 flex-none overflow-hidden rounded-xl border border-ink/10 bg-ink/[0.04]">
          <Image src={line.productImage} alt="" width={40} height={40} className="h-full w-full object-cover" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-ink">{line.productTitle}</span>
          {line.variant && <span className="block truncate text-xs text-ink/40">{line.variant}</span>}
        </span>
      </span>

      <span className="hidden flex-col sm:flex">
        <span className="truncate text-sm text-ink/70">{line.orderNumber}</span>
        <span className="truncate text-xs text-ink/40">{line.customerName}</span>
      </span>

      <span className="hidden flex-col sm:flex">
        <span className="flex items-center gap-1.5 truncate text-sm text-ink/70">
          <Store size={12} className="flex-none text-ink/30" />
          {line.sellerName}
        </span>
        <span className="truncate text-xs text-ink/35">{CHANNEL_LABEL[line.channel]}</span>
      </span>

      <span className="hidden justify-self-end text-sm text-ink/55 sm:block">{line.quantity}</span>

      <span className="hidden justify-self-end text-sm font-medium text-ink/70 sm:block">
        ₹{line.quotedUnitPriceINR.toLocaleString("en-IN")}
      </span>

      <span className="hidden text-sm text-ink/50 sm:block">{line.ageLabel}</span>

      <span className="hidden sm:block">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${TONE_PILL[tone]}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} />
          {STATUS_LABEL[line.status]}
        </span>
      </span>

      <ChevronRight size={16} className="hidden flex-none text-ink/25 transition-colors group-hover:text-ink/50 sm:block" />

      {/* mobile-only: price + status since the grid above collapses */}
      <span className="col-span-3 flex items-center justify-between gap-2 pl-13 sm:hidden">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${TONE_PILL[tone]}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} />
          {STATUS_LABEL[line.status]}
        </span>
        <span className="text-xs font-medium text-ink/50">
          ₹{line.quotedUnitPriceINR.toLocaleString("en-IN")}
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