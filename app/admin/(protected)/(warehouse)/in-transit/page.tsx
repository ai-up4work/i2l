// app/admin/in-transit/page.tsx
"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { CheckCircle2, Inbox, MapPinned, Search, SearchX, Truck, X } from "lucide-react"

import { useAdminData } from "@/contexts/AdminDataContext"
import type { DeliveryStatus, InTransitLine } from "@/types/admin"
import { SendMessageModal } from "@/components/admin/SendMessageModal"
import { arrivedInSriLankaMessage } from "@/lib/chat/customerMessageTemplates"

// In transit: orders handed to a courier from the export bin, crossing the
// border toward Sri Lanka. "Mark shipped" is what moves an order to "Shipped",
// and "Shipped" means it has arrived at the Sri Lanka warehouse, not just that
// it is on a truck. Local delivery to the customer is a later step on
// /admin/shipped; this page never marks anything delivered.
//
// Nothing happens on a bare row click. Use the per-row "Mark shipped" button,
// or tick rows and use the selection bar. The order number is a separate link
// to the order detail page.

function formatAge(hours: number): string {
  if (hours < 1) return "<1h"
  if (hours < 24) return `${Math.floor(hours)}h`
  const days = Math.floor(hours / 24)
  const remHours = Math.floor(hours % 24)
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`
}

const STATUS_PILL: Record<DeliveryStatus, string> = {
  overdue: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200",
  due_soon: "bg-gold/15 text-gold-deep ring-1 ring-inset ring-gold/30",
  on_track: "bg-teal/12 text-teal-deep ring-1 ring-inset ring-teal/25",
}
const STATUS_DOT: Record<DeliveryStatus, string> = {
  overdue: "bg-rose-600",
  due_soon: "bg-gold-deep",
  on_track: "bg-teal-deep",
}

const STATUS_TABS: { key: "all" | DeliveryStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "overdue", label: "Overdue" },
  { key: "due_soon", label: "Due soon" },
  { key: "on_track", label: "On track" },
]

// Shared by the header row and every row so the columns always line up.
const GRID =
  "sm:grid-cols-[1.75rem_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,0.9fr)_6rem_9.5rem_9.5rem]"

export default function InTransitPage() {
  const { visibleInTransitLines, canActOnInTransitLine, markShipped, sendChatMessage, sites, currentUser, permissions } =
    useAdminData()

  const [query, setQuery] = useState("")
  const [courierFilter, setCourierFilter] = useState<string>("All couriers")
  const [statusTab, setStatusTab] = useState<"all" | DeliveryStatus>("all")
  const [selected, setSelected] = useState<Set<string>>(new Set()) // line ids
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Queue rather than a single slot: "Mark shipped" can act on several orders
  // at once, and reviewing N messages one at a time in the same modal is
  // simpler than showing several. Each entry is removed (sent or skipped)
  // before the next one shows. A single-row ship is a queue of one.
  const [messageQueue, setMessageQueue] = useState<{ threadId: string; text: string }[]>([])
  const currentMessage = messageQueue[0] ?? null

  useEffect(() => () => clearTimeout(noticeTimer.current), [])

  const showNotice = (text: string) => {
    clearTimeout(noticeTimer.current)
    setNotice(text)
    noticeTimer.current = setTimeout(() => setNotice(null), 4000)
  }

  const couriers = useMemo(() => {
    const set = new Set(visibleInTransitLines.map((l) => l.courier))
    return ["All couriers", ...Array.from(set)]
  }, [visibleInTransitLines])

  const counts = useMemo(() => {
    const base: Record<string, number> = { all: visibleInTransitLines.length }
    for (const l of visibleInTransitLines) base[l.deliveryStatus] = (base[l.deliveryStatus] ?? 0) + 1
    return base
  }, [visibleInTransitLines])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...visibleInTransitLines]
      .filter((l) => {
        if (statusTab !== "all" && l.deliveryStatus !== statusTab) return false
        if (courierFilter !== "All couriers" && l.courier !== courierFilter) return false
        if (!q) return true
        return l.orderNumber.toLowerCase().includes(q) || l.customerName.toLowerCase().includes(q)
      })
      .sort((a, b) => a.etaRemainingHours - b.etaRemainingHours) // most overdue first
  }, [visibleInTransitLines, query, courierFilter, statusTab])

  const actionable = useMemo(() => filtered.filter(canActOnInTransitLine), [filtered, canActOnInTransitLine])
  const allVisibleSelected = actionable.length > 0 && actionable.every((l) => selected.has(l.id))

  const hasAnyFilter = query.trim() !== "" || courierFilter !== "All couriers" || statusTab !== "all"
  const clearFilters = () => {
    setQuery("")
    setCourierFilter("All couriers")
    setStatusTab("all")
  }

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const toggleSelectAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev)
      actionable.forEach((l) => (allVisibleSelected ? next.delete(l.id) : next.add(l.id)))
      return next
    })

  const queueMessages = (lines: InTransitLine[]) =>
    setMessageQueue((prev) => [
      ...prev,
      ...lines
        .filter((l) => !!l.chatThreadId)
        .map((l) => ({ threadId: l.chatThreadId!, text: arrivedInSriLankaMessage(l.orderId) })),
    ])

  const handleMarkShipped = () => {
    // `selected` holds line ids, so look the lines up first, then act on their orders.
    const lines = visibleInTransitLines.filter((l) => selected.has(l.id) && canActOnInTransitLine(l))
    if (lines.length === 0) return
    lines.forEach((l) => markShipped(l.orderId))
    queueMessages(lines)
    showNotice(`${lines.length} order${lines.length === 1 ? "" : "s"} marked shipped.`)
    setSelected(new Set())
  }

  const handleSingleShip = (line: InTransitLine) => {
    markShipped(line.orderId)
    queueMessages([line])
    showNotice(`${line.orderNumber} marked shipped.`)
    setSelected((prev) => {
      if (!prev.has(line.id)) return prev
      const next = new Set(prev)
      next.delete(line.id)
      return next
    })
  }

  const scopeLabel = permissions.ordersScopedToOwnSite
    ? sites.find((s) => s.id === currentUser.siteId)?.name ?? "your site"
    : "all sites"

  return (
    <>
      <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
        <div className="mx-auto max-w-8xl px-6 pb-28 pt-10 lg:px-10">
          {/* ── Header ── */}
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-teal-deep text-parchment">
                <Truck size={22} strokeWidth={1.75} />
              </div>
              <div>
                <h1 className="font-display text-3xl font-semibold leading-tight">In transit</h1>
                <p className="mt-1 max-w-md text-sm leading-relaxed text-ink/60">
                  Orders handed to a courier from {scopeLabel}, on the way to the Sri Lanka warehouse. Most overdue
                  first.
                </p>
              </div>
            </div>

            <dl className="flex divide-x divide-ink/10 overflow-hidden rounded-2xl border border-ink/10 bg-white">
              <div className="px-5 py-3">
                <dt className="text-xs font-medium text-ink/45">En route</dt>
                <dd className="mt-0.5 font-display text-xl text-ink">{visibleInTransitLines.length}</dd>
              </div>
              <div className="px-5 py-3">
                <dt className="text-xs font-medium text-ink/45">Due soon</dt>
                <dd className={`mt-0.5 font-display text-xl ${(counts.due_soon ?? 0) > 0 ? "text-amber-700" : "text-ink"}`}>
                  {counts.due_soon ?? 0}
                </dd>
              </div>
              <div className="px-5 py-3">
                <dt className="text-xs font-medium text-ink/45">Overdue</dt>
                <dd className={`mt-0.5 font-display text-xl ${(counts.overdue ?? 0) > 0 ? "text-rose-700" : "text-ink"}`}>
                  {counts.overdue ?? 0}
                </dd>
              </div>
            </dl>
          </div>

          {/* ── Status message ── */}
          <div aria-live="polite" className="mt-6 min-h-[2.75rem]">
            {notice && (
              <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-teal/25 bg-teal/[0.08] px-4 py-3 text-sm font-medium text-teal-deep">
                <CheckCircle2 size={16} />
                {notice}
                <Link href="/admin/shipped" className="ml-auto text-xs font-semibold underline underline-offset-4">
                  View shipped
                </Link>
              </div>
            )}
          </div>

          {/* ── Filters ── */}
          <div className="mt-2 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div role="tablist" aria-label="Filter by delivery status" className="flex flex-wrap gap-1 rounded-full border border-ink/10 bg-white p-1">
                {STATUS_TABS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={statusTab === t.key}
                    onClick={() => setStatusTab(t.key)}
                    className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-teal/40 ${
                      statusTab === t.key ? "bg-teal-deep text-parchment" : "text-ink/55 hover:text-ink/80"
                    }`}
                  >
                    {t.label}
                    <span className={statusTab === t.key ? "text-parchment/70" : "text-ink/35"}>{counts[t.key] ?? 0}</span>
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
                  className="w-full rounded-full border border-ink/10 bg-white py-2.5 pl-9 pr-4 text-sm placeholder:text-ink/35 outline-none transition-colors focus:border-teal/50 focus:ring-2 focus:ring-teal/15"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span id="courier-filter-label" className="text-xs font-medium text-ink/50">
                Courier
              </span>
              <div role="radiogroup" aria-labelledby="courier-filter-label" className="flex flex-wrap gap-1 rounded-full border border-ink/10 bg-white p-1">
                {couriers.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={courierFilter === c}
                    onClick={() => setCourierFilter(c)}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-teal/40 ${
                      courierFilter === c ? "bg-ink text-parchment" : "text-ink/55 hover:text-ink/80"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p className="mt-4 text-xs text-ink/45">
            {hasAnyFilter
              ? `${filtered.length} of ${visibleInTransitLines.length} orders shown`
              : `${filtered.length} order${filtered.length === 1 ? "" : "s"}`}
            {hasAnyFilter && (
              <button
                type="button"
                onClick={clearFilters}
                className="ml-2 font-semibold text-teal-deep underline decoration-dotted underline-offset-4 hover:text-teal"
              >
                Clear filters
              </button>
            )}
          </p>

          {/* ── List ── */}
          <div className="mt-3 overflow-hidden rounded-2xl border border-ink/10 bg-white">
            <div
              className={`sticky top-0 z-10 hidden items-center gap-3 border-b border-ink/10 bg-parchment/80 px-5 py-3 text-xs font-medium text-ink/50 backdrop-blur sm:grid ${GRID}`}
            >
              <input
                type="checkbox"
                aria-label="Select all visible orders"
                checked={allVisibleSelected}
                onChange={toggleSelectAllVisible}
                disabled={actionable.length === 0}
                className="h-4 w-4 rounded border-ink/20 text-teal-deep focus-visible:ring-2 focus-visible:ring-teal/40 disabled:opacity-30"
              />
              <span>Order</span>
              <span>Destination</span>
              <span>Courier and tracking</span>
              <span>In transit</span>
              <span>Delivery</span>
              <span />
            </div>

            {filtered.length === 0 ? (
              <EmptyState
                hasAnyFilter={hasAnyFilter}
                isEmptyOverall={visibleInTransitLines.length === 0}
                onClearFilters={clearFilters}
              />
            ) : (
              filtered.map((line) => (
                <InTransitRow
                  key={line.id}
                  line={line}
                  canAct={canActOnInTransitLine(line)}
                  selected={selected.has(line.id)}
                  onToggleSelect={() => toggleSelect(line.id)}
                  onMarkShipped={() => handleSingleShip(line)}
                />
              ))
            )}
          </div>

          {/* ── Selection bar (sticks to the bottom while rows are ticked) ── */}
          {selected.size > 0 && (
            <div className="sticky bottom-6 z-20 mt-6 flex justify-center">
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-2xl bg-ink px-4 py-3 text-parchment shadow-[0_24px_48px_-20px_rgba(32,36,43,0.65)]">
                <span className="text-sm font-medium">{selected.size} selected</span>
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  aria-label="Clear selection"
                  className="rounded-full p-1.5 text-parchment/60 outline-none transition-colors hover:bg-white/10 hover:text-parchment focus-visible:ring-2 focus-visible:ring-parchment/50"
                >
                  <X size={14} />
                </button>
                <button
                  type="button"
                  onClick={handleMarkShipped}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-parchment px-3.5 py-2 text-xs font-semibold text-ink outline-none transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-parchment/50"
                >
                  <CheckCircle2 size={14} />
                  Mark shipped
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <SendMessageModal
        open={currentMessage !== null}
        title="Let the customer know it's arrived?"
        defaultMessage={currentMessage?.text ?? ""}
        onSend={async (text, attachmentUrl) => {
          if (!currentMessage) return { ok: false, error: "Nothing to send." }
          const result = await sendChatMessage(currentMessage.threadId, text, attachmentUrl)
          if (result.ok) setMessageQueue((prev) => prev.slice(1))
          return result
        }}
        onSkip={() => setMessageQueue((prev) => prev.slice(1))}
      />
    </>
  )
}

function InTransitRow({
  line,
  canAct,
  selected,
  onToggleSelect,
  onMarkShipped,
}: {
  line: InTransitLine
  canAct: boolean
  selected: boolean
  onToggleSelect: () => void
  onMarkShipped: () => void
}) {
  const status = line.deliveryStatus
  const deliveryLabel =
    status === "overdue"
      ? `${formatAge(Math.abs(line.etaRemainingHours))} overdue`
      : `due in ${formatAge(line.etaRemainingHours)}`

  const pill = (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_PILL[status]}`}>
      <span className={`h-1.5 w-1.5 flex-none rounded-full ${STATUS_DOT[status]}`} aria-hidden />
      {deliveryLabel}
    </span>
  )

  const action = (
    <button
      type="button"
      disabled={!canAct}
      onClick={onMarkShipped}
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-teal/30 bg-teal/[0.06] px-3 py-1.5 text-xs font-semibold text-teal-deep outline-none transition-colors hover:bg-teal/[0.12] focus-visible:ring-2 focus-visible:ring-teal/40 disabled:cursor-not-allowed disabled:opacity-30"
    >
      <CheckCircle2 size={13} />
      Mark shipped
    </button>
  )

  return (
    <div
      className={`grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-ink/[0.06] px-5 py-4 transition-colors last:border-b-0 sm:gap-y-0 sm:py-3.5 ${GRID} ${
        selected ? "bg-teal/[0.06]" : "hover:bg-ink/[0.015]"
      }`}
    >
      <input
        type="checkbox"
        aria-label={`Select ${line.orderNumber}`}
        checked={selected}
        disabled={!canAct}
        onChange={onToggleSelect}
        className="h-4 w-4 rounded border-ink/20 text-teal-deep focus-visible:ring-2 focus-visible:ring-teal/40 disabled:opacity-30"
      />

      <div className="min-w-0">
        <Link
          href={`/admin/orders/${line.orderId}`}
          className="block truncate rounded text-sm font-semibold outline-none hover:text-teal-deep hover:underline focus-visible:ring-2 focus-visible:ring-teal/40"
        >
          {line.orderNumber}
        </Link>
        <span className="block truncate text-xs text-ink/50">{line.customerName}</span>
        {!canAct && <span className="block text-[11px] text-ink/40">View only, different site</span>}
      </div>

      {/* mobile: delivery status sits beside the order */}
      <span className="sm:hidden">{pill}</span>

      <span className="hidden min-w-0 items-center gap-1.5 text-sm text-ink/70 sm:flex">
        <MapPinned size={13} className="flex-none text-ink/30" aria-hidden />
        <span className="truncate">{line.destination}</span>
      </span>

      <span className="hidden min-w-0 truncate sm:block">
        <span className="text-sm font-medium text-ink/70">{line.courier}</span>
        {line.trackingRef && <span className="ml-1.5 text-xs text-ink/40">{line.trackingRef}</span>}
      </span>

      <span className="hidden text-sm tabular-nums text-ink/50 sm:block">{line.pickedUpAgeLabel}</span>

      <span className="hidden sm:block">{pill}</span>

      <span className="hidden justify-self-end sm:block">{action}</span>

      {/* mobile-only details and action, aligned under the order */}
      <span className="col-span-2 col-start-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink/55 sm:hidden">
        <span>{line.destination}</span>
        <span>{line.courier}</span>
      </span>
      <span className="col-span-2 col-start-2 sm:hidden">{action}</span>
    </div>
  )
}

function EmptyState({
  hasAnyFilter,
  isEmptyOverall,
  onClearFilters,
}: {
  hasAnyFilter: boolean
  isEmptyOverall: boolean
  onClearFilters: () => void
}) {
  if (isEmptyOverall) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
        <Inbox size={22} className="text-ink/25" />
        <div>
          <p className="text-sm font-semibold text-ink/70">Nothing in transit right now</p>
          <p className="mt-1 max-w-xs text-xs text-ink/50">
            Orders appear here once they are marked picked up in the Export bin.
          </p>
        </div>
        <Link
          href="/admin/export-bin"
          className="text-xs font-semibold text-teal-deep underline decoration-dotted underline-offset-4 hover:text-teal"
        >
          Go to Export bin
        </Link>
      </div>
    )
  }

  if (hasAnyFilter) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
        <SearchX size={22} className="text-ink/25" />
        <div>
          <p className="text-sm font-semibold text-ink/70">No orders match these filters</p>
          <p className="mt-1 text-xs text-ink/50">Try a different search, courier or status.</p>
        </div>
        <button
          type="button"
          onClick={onClearFilters}
          className="text-xs font-semibold text-teal-deep underline decoration-dotted underline-offset-4 hover:text-teal"
        >
          Clear filters
        </button>
      </div>
    )
  }

  return null
}