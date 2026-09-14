// app/admin/shipped/page.tsx
"use client"

import { useMemo, useState } from "react"
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
} from "lucide-react"

import { useAdminData } from "@/contexts/AdminDataContext"
import type { ShippedLine } from "@/types/admin"

// Shipped — arrived at the Sri Lanka warehouse, awaiting local delivery.
// This is where "Mark delivered" now lives. It used to live on
// /admin/in-transit, one click away with no confirmation — too easy to
// fire by accident while just trying to glance at an order (see that
// page's header comment). Moving it here does two things at once: it
// requires an order to have genuinely arrived in the country first (a
// real, separate stage — see markShipped/markDelivered in
// AdminDataContext), and it puts the action on a page whose entire
// purpose is exactly that action, rather than buried in a queue about
// something else (international transit).
//
// The strip below the main queue is what it replaced structurally: a
// quick look at what's still upstream (Pack & label / Export bin /
// In transit) — still useful context for "how much is still on its way
// here", just no longer the whole page.

function formatAge(hours: number): string {
  if (hours < 1) return "<1h"
  if (hours < 24) return `${Math.floor(hours)}h`
  const days = Math.floor(hours / 24)
  const remHours = Math.floor(hours % 24)
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`
}

export default function ShippedPage() {
  const {
    visibleShippedLines,
    canActOnShippedLine,
    markDelivered,
    visiblePackLines,
    visibleExportBinLines,
    visibleInTransitLines,
    sites,
    currentUser,
    permissions,
  } = useAdminData()

  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [justDelivered, setJustDelivered] = useState<string[]>([])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...visibleShippedLines]
      .filter((l) => !q || l.orderNumber.toLowerCase().includes(q) || l.customerName.toLowerCase().includes(q))
      .sort((a, b) => b.shippedAgeHours - a.shippedAgeHours)
  }, [visibleShippedLines, query])

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleSelectAllVisible = () => {
    setSelected((prev) => {
      const actionable = filtered.filter(canActOnShippedLine)
      const allVisibleSelected = actionable.every((l) => prev.has(l.id))
      const next = new Set(prev)
      actionable.forEach((l) => (allVisibleSelected ? next.delete(l.id) : next.add(l.id)))
      return next
    })
  }

  const handleMarkDelivered = () => {
    if (selected.size === 0) return
    const ids = Array.from(selected)
    ids.forEach((orderId) => markDelivered(orderId))
    setJustDelivered(ids)
    setSelected(new Set())
    setTimeout(() => setJustDelivered([]), 4000)
  }

  const handleSingleDeliver = (orderId: string) => {
    markDelivered(orderId)
    setJustDelivered([orderId])
    setSelected((prev) => {
      if (!prev.has(orderId)) return prev
      const next = new Set(prev)
      next.delete(orderId)
      return next
    })
    setTimeout(() => setJustDelivered([]), 4000)
  }

  const awaitingPackCount = visiblePackLines.filter((l) => l.status === "awaiting_pack").length
  const inBinCount = visibleExportBinLines.length
  const inTransitCount = visibleInTransitLines.length

  const scopeLabel = permissions.ordersScopedToOwnSite
    ? sites.find((s) => s.id === currentUser.siteId)?.name ?? "your site"
    : "all sites"

  const actionableCount = filtered.filter(canActOnShippedLine).length
  const allVisibleSelected = actionableCount > 0 && filtered.filter(canActOnShippedLine).every((l) => selected.has(l.id))

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      <div className="mx-auto max-w-8xl px-6 pb-24 pt-10 lg:px-10">
        {/* ── Header ── */}
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 flex-none place-items-center rounded-2xl border border-ink/10 bg-white text-teal-deep shadow-[0_1px_2px_rgba(32,36,43,0.04),0_16px_40px_-24px_rgba(14,140,156,0.4)]">
              <WarehouseIcon size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-display text-3xl font-semibold text-ink">Shipped</h1>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink/60">
                Arrived at {scopeLabel}, awaiting local delivery. Mark an order delivered once it's actually
                reached the customer.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-ink/10 bg-white px-5 py-3 text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Awaiting delivery</p>
            <p className="mt-0.5 font-display text-xl text-ink">{visibleShippedLines.length}</p>
          </div>
        </div>

        {justDelivered.length > 0 && (
          <div className="mt-6 flex items-center gap-2.5 rounded-2xl border border-teal/25 bg-teal/[0.08] px-4 py-3 text-sm font-medium text-teal-deep">
            <PartyPopper size={16} />
            {justDelivered.length} order{justDelivered.length === 1 ? "" : "s"} marked delivered.
          </div>
        )}

        {/* ── Upstream strip: what's still on its way here ── */}
        <div className="mt-9 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Link
            href="/admin/pack-label"
            className="flex items-center gap-3 rounded-2xl border border-ink/10 bg-white px-4 py-3.5 transition-colors hover:border-teal/30"
          >
            <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-teal/10 text-teal-deep">
              <PackageCheck size={18} strokeWidth={1.75} />
            </span>
            <span>
              <span className="block text-xs font-semibold text-ink/50">Pack &amp; label</span>
              <span className="block font-display text-lg text-ink">{awaitingPackCount}</span>
            </span>
          </Link>
          <Link
            href="/admin/export-bin"
            className="flex items-center gap-3 rounded-2xl border border-ink/10 bg-white px-4 py-3.5 transition-colors hover:border-teal/30"
          >
            <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-teal/10 text-teal-deep">
              <Archive size={18} strokeWidth={1.75} />
            </span>
            <span>
              <span className="block text-xs font-semibold text-ink/50">Export bin</span>
              <span className="block font-display text-lg text-ink">{inBinCount}</span>
            </span>
          </Link>
          <Link
            href="/admin/in-transit"
            className="flex items-center gap-3 rounded-2xl border border-ink/10 bg-white px-4 py-3.5 transition-colors hover:border-teal/30"
          >
            <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-teal/10 text-teal-deep">
              <Truck size={18} strokeWidth={1.75} />
            </span>
            <span>
              <span className="block text-xs font-semibold text-ink/50">In transit</span>
              <span className="block font-display text-lg text-ink">{inTransitCount}</span>
            </span>
          </Link>
        </div>

        {/* ── Search + bulk bar ── */}
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <div className="relative max-w-md flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search order or customer…"
              className="w-full rounded-xl border border-ink/15 bg-white py-2.5 pl-9 pr-3 text-sm text-ink outline-none placeholder:text-ink/35 focus:border-teal"
            />
          </div>

          {selected.size > 0 && (
            <button
              type="button"
              onClick={handleMarkDelivered}
              className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-parchment transition-colors hover:bg-teal-deep"
            >
              <CheckCircle2 size={15} />
              Mark delivered ({selected.size})
            </button>
          )}
        </div>

        {/* ── Queue ── */}
        <div className="mt-4 overflow-hidden rounded-2xl border border-ink/10 bg-white">
          <div className="hidden grid-cols-[auto_1.2fr_1fr_0.9fr_0.8fr_auto] items-center gap-3 border-b border-ink/[0.06] px-5 py-3 text-xs font-semibold uppercase tracking-wide text-ink/35 sm:grid">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleSelectAllVisible}
              disabled={actionableCount === 0}
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
                    <p className="mt-1 max-w-xs text-xs text-ink/45">
                      Orders show up here once marked shipped from In transit — meaning they've arrived at the
                      Sri Lanka warehouse.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <SearchX size={22} className="text-ink/25" />
                  <p className="text-sm font-semibold text-ink/70">No matches</p>
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
                onMarkDelivered={() => handleSingleDeliver(line.orderId)}
              />
            ))
          )}
        </div>
      </div>
    </div>
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
  return (
    <div
      className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-ink/[0.06] px-5 py-3.5 transition-colors last:border-b-0 sm:grid-cols-[auto_1.2fr_1fr_0.9fr_0.8fr_auto] ${
        selected ? "bg-teal/[0.05]" : ""
      }`}
    >
      <input
        type="checkbox"
        checked={selected}
        disabled={!canAct}
        onChange={onToggleSelect}
        className="h-4 w-4 rounded border-ink/20 text-teal-deep focus-visible:ring-2 focus-visible:ring-teal/40 disabled:opacity-30"
      />

      <span className="min-w-0">
        <Link
          href={`/admin/orders/${line.orderId}`}
          className="block truncate text-sm font-semibold text-ink hover:text-teal-deep hover:underline"
        >
          {line.orderNumber}
        </Link>
        <span className="block truncate text-xs text-ink/45">{line.customerName}</span>
        {!canAct && <span className="block text-[11px] text-ink/35">View only — different site</span>}
      </span>

      <span className="hidden truncate text-sm text-ink/70 sm:block">{line.destination}</span>

      <span className="hidden truncate sm:block">
        <span className="text-xs font-medium text-ink/60">{line.courier ?? "—"}</span>
        {line.trackingRef && <span className="ml-1.5 text-xs text-ink/35">{line.trackingRef}</span>}
      </span>

      <span className="hidden text-sm text-ink/50 sm:block">{line.shippedAgeLabel} ago</span>

      <span className="hidden justify-self-end sm:block">
        <button
          type="button"
          disabled={!canAct}
          onClick={onMarkDelivered}
          title={canAct ? "Mark delivered" : undefined}
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-teal/30 bg-teal/[0.06] px-3 py-1.5 text-xs font-semibold text-teal-deep transition-colors hover:bg-teal/[0.12] disabled:cursor-not-allowed disabled:opacity-30"
        >
          <CheckCircle2 size={13} />
          Mark delivered
        </button>
      </span>

      {/* mobile summary + action */}
      <span className="col-span-3 flex items-center justify-between gap-2 pl-7 sm:hidden">
        <span className="text-xs text-ink/45">{line.destination} · {line.shippedAgeLabel} ago</span>
      </span>
      <span className="col-span-3 pl-7 sm:hidden">
        <button
          type="button"
          disabled={!canAct}
          onClick={onMarkDelivered}
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-teal/30 bg-teal/[0.06] px-3 py-1.5 text-xs font-semibold text-teal-deep transition-colors hover:bg-teal/[0.12] disabled:cursor-not-allowed disabled:opacity-30"
        >
          <CheckCircle2 size={13} />
          Mark delivered
        </button>
      </span>
    </div>
  )
}