// app/admin/shipped/page.tsx
"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  Archive,
  CheckCircle2,
  ChevronRight,
  Inbox,
  PackageCheck,
  PartyPopper,
  Search,
  SearchX,
  Truck,
  Warehouse as WarehouseIcon,
  X,
} from "lucide-react"

import { useAdminData } from "@/contexts/AdminDataContext"
import type { ShippedLine } from "@/types/admin"
import { SendMessageModal } from "@/components/admin/SendMessageModal"
import { deliveredMessage } from "@/lib/chat/customerMessageTemplates"

// Shipped: arrived at the Sri Lanka warehouse, waiting for local delivery.
// "Mark delivered" lives here rather than on /admin/in-transit so that an order
// must first have genuinely arrived in the country, and so the action sits on
// a page whose whole purpose is that action.
//
// Nothing happens on a bare row click. Use the per-row "Mark delivered" button,
// or tick rows and use the selection bar. The order number is a separate link
// to the order detail page.
//
// The section below the queue shows what is still upstream (Pack & label,
// Export bin, In transit), which is useful context for "how much is still on
// its way here".

// Same age colours as the other warehouse pages.
function ageTone(hours: number) {
  if (hours >= 48) return { dot: "bg-rose-500", text: "text-rose-700 font-semibold" }
  if (hours >= 24) return { dot: "bg-amber-500", text: "text-amber-700 font-medium" }
  return { dot: "bg-teal", text: "text-ink/50" }
}

// Shared by the header row and every row so the columns always line up.
const GRID = "sm:grid-cols-[1.75rem_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)_7rem_10rem]"

export default function ShippedPage() {
  const {
    visibleShippedLines,
    canActOnShippedLine,
    markDelivered,
    sendChatMessage,
    visiblePackLines,
    visibleExportBinLines,
    visibleInTransitLines,
    sites,
    currentUser,
    permissions,
  } = useAdminData()

  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set()) // line ids
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Same queue pattern as In transit: "Mark delivered" can act on several
  // orders at once, so this feeds the modal one message at a time.
  const [messageQueue, setMessageQueue] = useState<{ threadId: string; text: string }[]>([])
  const currentMessage = messageQueue[0] ?? null

  useEffect(() => () => clearTimeout(noticeTimer.current), [])

  const showNotice = (text: string) => {
    clearTimeout(noticeTimer.current)
    setNotice(text)
    noticeTimer.current = setTimeout(() => setNotice(null), 4000)
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...visibleShippedLines]
      .filter((l) => !q || l.orderNumber.toLowerCase().includes(q) || l.customerName.toLowerCase().includes(q))
      .sort((a, b) => b.shippedAgeHours - a.shippedAgeHours) // longest waiting first
  }, [visibleShippedLines, query])

  const actionable = useMemo(() => filtered.filter(canActOnShippedLine), [filtered, canActOnShippedLine])
  const allVisibleSelected = actionable.length > 0 && actionable.every((l) => selected.has(l.id))

  const oldest = visibleShippedLines.reduce<ShippedLine | null>(
    (max, l) => (!max || l.shippedAgeHours > max.shippedAgeHours ? l : max),
    null,
  )
  const oldestHours = oldest?.shippedAgeHours ?? 0

  const hasSearch = query.trim() !== ""

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

  const queueMessages = (lines: ShippedLine[]) =>
    setMessageQueue((prev) => [
      ...prev,
      ...lines.filter((l) => !!l.chatThreadId).map((l) => ({ threadId: l.chatThreadId!, text: deliveredMessage(l.orderId) })),
    ])

  const handleMarkDelivered = () => {
    // `selected` holds line ids, so look the lines up first, then act on their orders.
    const lines = visibleShippedLines.filter((l) => selected.has(l.id) && canActOnShippedLine(l))
    if (lines.length === 0) return
    lines.forEach((l) => markDelivered(l.orderId))
    queueMessages(lines)
    showNotice(`${lines.length} order${lines.length === 1 ? "" : "s"} marked delivered.`)
    setSelected(new Set())
  }

  const handleSingleDeliver = (line: ShippedLine) => {
    markDelivered(line.orderId)
    queueMessages([line])
    showNotice(`${line.orderNumber} marked delivered.`)
    setSelected((prev) => {
      if (!prev.has(line.id)) return prev
      const next = new Set(prev)
      next.delete(line.id)
      return next
    })
  }

  const upstream = [
    {
      href: "/admin/pack-label",
      label: "Pack & label",
      icon: PackageCheck,
      count: visiblePackLines.filter((l) => l.status === "awaiting_pack").length,
    },
    { href: "/admin/export-bin", label: "Export bin", icon: Archive, count: visibleExportBinLines.length },
    { href: "/admin/in-transit", label: "In transit", icon: Truck, count: visibleInTransitLines.length },
  ]

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
                <WarehouseIcon size={22} strokeWidth={1.75} />
              </div>
              <div>
                <h1 className="font-display text-3xl font-semibold leading-tight">Shipped</h1>
                <p className="mt-1 max-w-md text-sm leading-relaxed text-ink/60">
                  Orders that arrived at {scopeLabel} and are waiting for local delivery. Mark one delivered once it
                  has reached the customer.
                </p>
              </div>
            </div>

            <dl className="flex divide-x divide-ink/10 overflow-hidden rounded-2xl border border-ink/10 bg-white">
              <div className="px-5 py-3">
                <dt className="text-xs font-medium text-ink/45">Awaiting delivery</dt>
                <dd className="mt-0.5 font-display text-xl text-ink">{visibleShippedLines.length}</dd>
              </div>
              <div className="px-5 py-3">
                <dt className="text-xs font-medium text-ink/45">Longest waiting</dt>
                <dd
                  className={`mt-0.5 font-display text-xl ${
                    oldestHours >= 48 ? "text-rose-700" : oldestHours >= 24 ? "text-amber-700" : "text-ink"
                  }`}
                >
                  {oldest ? oldest.shippedAgeLabel : "—"}
                </dd>
              </div>
            </dl>
          </div>

          {/* ── Status message ── */}
          <div aria-live="polite" className="mt-6 min-h-[2.75rem]">
            {notice && (
              <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-teal/25 bg-teal/[0.08] px-4 py-3 text-sm font-medium text-teal-deep">
                <PartyPopper size={16} />
                {notice}
                <Link href="/admin/delivered" className="ml-auto text-xs font-semibold underline underline-offset-4">
                  View delivered
                </Link>
              </div>
            )}
          </div>

          {/* ── Search ── */}
          <div className="mt-2 flex flex-wrap items-center gap-4">
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
            <p className="text-xs text-ink/45">
              {hasSearch
                ? `${filtered.length} of ${visibleShippedLines.length} orders shown`
                : `${filtered.length} order${filtered.length === 1 ? "" : "s"}`}
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
          </div>

          {/* ── Queue ── */}
          <div className="mt-4 overflow-hidden rounded-2xl border border-ink/10 bg-white">
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
              <span>Courier</span>
              <span>Arrived</span>
              <span />
            </div>

            {filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
                {visibleShippedLines.length === 0 ? (
                  <>
                    <Inbox size={22} className="text-ink/25" />
                    <div>
                      <p className="text-sm font-semibold text-ink/70">Nothing awaiting delivery right now</p>
                      <p className="mt-1 max-w-xs text-xs text-ink/50">
                        Orders appear here once they are marked shipped in In transit, which means they have arrived
                        at the Sri Lanka warehouse.
                      </p>
                    </div>
                    <Link
                      href="/admin/in-transit"
                      className="text-xs font-semibold text-teal-deep underline decoration-dotted underline-offset-4 hover:text-teal"
                    >
                      Go to In transit
                    </Link>
                  </>
                ) : (
                  <>
                    <SearchX size={22} className="text-ink/25" />
                    <div>
                      <p className="text-sm font-semibold text-ink/70">No orders match this search</p>
                      <p className="mt-1 text-xs text-ink/50">Check the order number or customer name.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      className="text-xs font-semibold text-teal-deep underline decoration-dotted underline-offset-4 hover:text-teal"
                    >
                      Clear search
                    </button>
                  </>
                )}
              </div>
            ) : (
              filtered.map((line) => (
                <ShippedRow
                  key={line.id}
                  line={line}
                  canAct={canActOnShippedLine(line)}
                  selected={selected.has(line.id)}
                  onToggleSelect={() => toggleSelect(line.id)}
                  onMarkDelivered={() => handleSingleDeliver(line)}
                />
              ))
            )}
          </div>

          {/* ── Upstream: what's still on its way here (a real sequence, in pipeline order) ── */}
          <section aria-labelledby="upstream-heading" className="mt-10">
            <h2 id="upstream-heading" className="text-sm font-semibold text-ink/70">
              Still on its way here
            </h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {upstream.map(({ href, label, icon: Icon, count }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-3 rounded-2xl border border-ink/10 bg-white px-4 py-3.5 outline-none transition-colors hover:border-teal/30 focus-visible:ring-2 focus-visible:ring-teal/40"
                >
                  <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-teal/10 text-teal-deep">
                    <Icon size={18} strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium text-ink/50">{label}</span>
                    <span className="block font-display text-lg text-ink">{count}</span>
                  </span>
                  <ChevronRight size={16} className="flex-none text-ink/25" aria-hidden />
                </Link>
              ))}
            </div>
          </section>

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
                  onClick={handleMarkDelivered}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-parchment px-3.5 py-2 text-xs font-semibold text-ink outline-none transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-parchment/50"
                >
                  <CheckCircle2 size={14} />
                  Mark delivered
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <SendMessageModal
        open={currentMessage !== null}
        title="Let the customer know it's been delivered?"
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

function ShippedRow({
  line,
  canAct,
  selected,
  onToggleSelect,
  onMarkDelivered,
}: {
  line: ShippedLine
  canAct: boolean
  selected: boolean
  onToggleSelect: () => void
  onMarkDelivered: () => void
}) {
  const age = ageTone(line.shippedAgeHours)

  const action = (
    <button
      type="button"
      disabled={!canAct}
      onClick={onMarkDelivered}
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-teal/30 bg-teal/[0.06] px-3 py-1.5 text-xs font-semibold text-teal-deep outline-none transition-colors hover:bg-teal/[0.12] focus-visible:ring-2 focus-visible:ring-teal/40 disabled:cursor-not-allowed disabled:opacity-30"
    >
      <CheckCircle2 size={13} />
      Mark delivered
    </button>
  )

  return (
    <div
      className={`grid grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 border-b border-ink/[0.06] px-5 py-4 transition-colors last:border-b-0 sm:gap-y-0 sm:py-3.5 ${GRID} ${
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

      <span className="hidden truncate text-sm text-ink/70 sm:block">{line.destination}</span>

      <span className="hidden min-w-0 truncate sm:block">
        <span className="text-sm font-medium text-ink/70">{line.courier ?? "—"}</span>
        {line.trackingRef && <span className="ml-1.5 text-xs text-ink/40">{line.trackingRef}</span>}
      </span>

      <span className={`hidden items-center gap-2 text-sm tabular-nums sm:inline-flex ${age.text}`}>
        <span className={`h-2 w-2 flex-none rounded-full ${age.dot}`} aria-hidden />
        {line.shippedAgeLabel} ago
      </span>

      <span className="hidden justify-self-end sm:block">{action}</span>

      {/* mobile-only details and action, aligned under the order */}
      <span className="col-start-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink/55 sm:hidden">
        <span>{line.destination}</span>
        <span className={`inline-flex items-center gap-1.5 ${age.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${age.dot}`} aria-hidden />
          Arrived {line.shippedAgeLabel} ago
        </span>
      </span>
      <span className="col-start-2 sm:hidden">{action}</span>
    </div>
  )
}