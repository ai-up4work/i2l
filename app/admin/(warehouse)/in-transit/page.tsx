// app/admin/in-transit/page.tsx
"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  CheckCircle2,
  Inbox,
  MapPinned,
  Search,
  SearchX,
  Truck,
} from "lucide-react"

import { useAdminData } from "@/contexts/AdminDataContext"
import { DELIVERY_STATUS_LABEL, type DeliveryStatus, type InTransitLine } from "@/types/admin"

// In transit: orders handed off to a courier from the export bin, en
// route to the customer. This is the last stop before "Delivered" —
// marking an order delivered here is what actually advances its
// pipeline stage from "Shipped" to "Delivered" (see markDelivered in
// AdminDataContext).
//
// Previously this page kept its own local MOCK_IN_TRANSIT array in
// useState, entirely disconnected from Orders/Export bin — a pickup
// recorded on Export bin never appeared here, and "Mark delivered" just
// deleted the row locally instead of touching the real order. Now
// `visibleInTransitLines` is derived straight from AdminDataContext's
// orders (see InTransitLine in types/admin.ts: one row per order with
// pickedUpAt set and deliveredAt unset), and markDelivered is the same
// mutation that finally sets Order.deliveredAt and advances the stage —
// so a delivery recorded here is reflected on Orders and Pack & label's
// history immediately, and the row disappears from this queue on the
// very next render because it no longer matches the "not yet delivered"
// filter.

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

export default function InTransitPage() {
  const router = useRouter()
  const { visibleInTransitLines, canActOnInTransitLine, markDelivered, sites, currentUser, permissions } = useAdminData()

  const [query, setQuery] = useState("")
  const [courierFilter, setCourierFilter] = useState<string>("All couriers")
  const [statusTab, setStatusTab] = useState<"all" | DeliveryStatus>("all")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [justDelivered, setJustDelivered] = useState<string[]>([])

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
      .sort((a, b) => a.etaRemainingHours - b.etaRemainingHours)
  }, [visibleInTransitLines, query, courierFilter, statusTab])

  const hasAnyFilter = query.trim() !== "" || courierFilter !== "All couriers" || statusTab !== "all"
  const clearFilters = () => {
    setQuery("")
    setCourierFilter("All couriers")
    setStatusTab("all")
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleSelectAllVisible = () => {
    setSelected((prev) => {
      const actionable = filtered.filter(canActOnInTransitLine)
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

  const actionableFiltered = filtered.filter(canActOnInTransitLine)
  const allVisibleSelected = actionableFiltered.length > 0 && actionableFiltered.every((l) => selected.has(l.id))
  const overdueCount = counts.overdue ?? 0

  const scopeLabel = permissions.ordersScopedToOwnSite
    ? sites.find((s) => s.id === currentUser.siteId)?.name ?? "your site"
    : "all sites"

  return (
    <div className="min-h-screen bg-parchment font-body text-ink">
      <div className="mx-auto max-w-8xl px-6 pb-24 pt-10 lg:px-10">
        {/* ── Header ── */}
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 flex-none place-items-center rounded-2xl border border-ink/10 bg-white text-teal-deep shadow-[0_1px_2px_rgba(32,36,43,0.04),0_16px_40px_-24px_rgba(14,140,156,0.4)]">
              <Truck size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-display text-3xl font-semibold text-ink">In transit</h1>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink/60">
                Orders handed off to a courier from {scopeLabel}, en route to the customer.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-ink/10 bg-white px-5 py-3 text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-ink/40">En route</p>
            <p className="mt-0.5 font-display text-xl text-ink">
              {visibleInTransitLines.length}
              {overdueCount > 0 && (
                <span className="ml-2 text-sm font-normal text-rose-600">{overdueCount} overdue</span>
              )}
            </p>
          </div>
        </div>

        {/* ── Confirmation banner ── */}
        {justDelivered.length > 0 && (
          <div className="mt-6 flex items-center gap-2.5 rounded-2xl border border-teal/25 bg-teal/[0.08] px-4 py-3 text-sm font-medium text-teal-deep">
            <CheckCircle2 size={16} />
            {justDelivered.length} order{justDelivered.length === 1 ? "" : "s"} marked delivered.
          </div>
        )}

        {/* ── Filters ── */}
        <div className="mt-8 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1 rounded-full border border-ink/10 bg-white p-1">
              {STATUS_TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setStatusTab(t.key)}
                  className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal ${
                    statusTab === t.key
                      ? "bg-teal-deep text-parchment shadow-[0_6px_18px_-8px_rgba(14,140,156,0.5)]"
                      : "text-ink/55 hover:text-ink/80"
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
                className="w-full rounded-full border border-ink/10 bg-white py-2.5 pl-9 pr-4 text-sm text-ink placeholder:text-ink/35 outline-none transition-colors focus:border-teal/50 focus:ring-2 focus:ring-teal/15"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-1 rounded-full border border-ink/10 bg-white p-1 sm:self-start">
            {couriers.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCourierFilter(c)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                  courierFilter === c ? "bg-ink text-parchment" : "text-ink/55 hover:text-ink/80"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* ── Bulk action bar ── */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs font-medium text-ink/50">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleSelectAllVisible}
              disabled={actionableFiltered.length === 0}
              className="h-4 w-4 rounded border-ink/20 text-teal-deep focus-visible:ring-2 focus-visible:ring-teal/40"
            />
            {selected.size > 0 ? `${selected.size} selected` : "Select all"}
          </label>

          <button
            type="button"
            onClick={handleMarkDelivered}
            disabled={selected.size === 0}
            className="inline-flex items-center gap-1.5 rounded-xl bg-teal-deep px-3.5 py-2 text-xs font-semibold text-parchment transition-colors hover:bg-teal-deep/90 disabled:cursor-not-allowed disabled:bg-ink/15"
          >
            <CheckCircle2 size={14} />
            Mark delivered
          </button>
        </div>

        {hasAnyFilter ? (
          <p className="mt-3 text-xs font-medium text-ink/40">
            {filtered.length} of {visibleInTransitLines.length} orders ·{" "}
            <button type="button" onClick={clearFilters} className="font-semibold text-teal-deep underline decoration-dotted underline-offset-4 hover:text-teal">
              Clear filters
            </button>
          </p>
        ) : (
          <p className="mt-3 text-xs font-medium text-ink/40">
            {filtered.length} order{filtered.length === 1 ? "" : "s"}
          </p>
        )}

        {/* ── List ── */}
        <div className="mt-3 overflow-hidden rounded-2xl border border-ink/10 bg-white">
          <div className="sticky top-0 z-10 hidden grid-cols-[auto_1.1fr_1fr_0.9fr_0.8fr_0.9fr] gap-2 border-b border-ink/10 bg-parchment/60 px-5 py-3 text-[11px] font-semibold tracking-wide text-ink/45 sm:grid">
            <span />
            <span>Order</span>
            <span>Destination</span>
            <span>Courier / tracking</span>
            <span>In transit</span>
            <span className="text-right">Delivery</span>
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
                onOpen={() => router.push(`/admin/orders/${line.orderId}`)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function InTransitRow({
  line,
  canAct,
  selected,
  onToggleSelect,
  onOpen,
}: {
  line: InTransitLine
  canAct: boolean
  selected: boolean
  onToggleSelect: () => void
  onOpen: () => void
}) {
  const status = line.deliveryStatus
  const deliveryLabel =
    status === "overdue"
      ? `${formatAge(Math.abs(line.etaRemainingHours))} overdue`
      : `due in ${formatAge(line.etaRemainingHours)}`

  return (
    <div
      className={`group grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-ink/[0.06] px-5 py-3.5 transition-colors last:border-b-0 hover:bg-parchment/40 sm:grid-cols-[auto_1.1fr_1fr_0.9fr_0.8fr_0.9fr] ${
        selected ? "bg-teal/[0.05]" : ""
      }`}
    >
      <span onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          disabled={!canAct}
          onChange={onToggleSelect}
          className="h-4 w-4 rounded border-ink/20 text-teal-deep focus-visible:ring-2 focus-visible:ring-teal/40 disabled:opacity-30"
        />
      </span>

      <button type="button" onClick={onOpen} className="min-w-0 text-left">
        <span className="block truncate text-sm font-semibold text-ink hover:underline">{line.orderNumber}</span>
        <span className="block truncate text-xs text-ink/45">{line.customerName}</span>
        {!canAct && <span className="block text-[11px] text-ink/35">View only — different site</span>}
      </button>

      <span className="hidden items-center gap-1.5 truncate text-sm text-ink/70 sm:flex">
        <MapPinned size={13} className="flex-none text-ink/30" />
        {line.destination}
      </span>

      <span className="hidden truncate sm:block">
        <span className="text-xs font-medium text-ink/60">{line.courier}</span>
        {line.trackingRef && <span className="ml-1.5 text-xs text-ink/35">{line.trackingRef}</span>}
      </span>

      <span className="hidden text-sm text-ink/50 sm:block">{line.pickedUpAgeLabel}</span>

      <span className="hidden justify-self-end sm:block">
        <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_PILL[status]}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
          {deliveryLabel}
        </span>
      </span>

      {/* mobile summary */}
      <span className="col-span-3 flex items-center justify-between gap-2 pl-7 sm:hidden">
        <span className="text-xs text-ink/45">{line.destination} · {line.courier}</span>
        <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_PILL[status]}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
          {DELIVERY_STATUS_LABEL[status]}
        </span>
      </span>
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
          <p className="mt-1 max-w-xs text-xs text-ink/45">
            Orders show up here once a courier picks them up from the export bin.
          </p>
        </div>
      </div>
    )
  }

  if (hasAnyFilter) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
        <SearchX size={22} className="text-ink/25" />
        <div>
          <p className="text-sm font-semibold text-ink/70">Nothing matches this filter</p>
          <p className="mt-1 text-xs text-ink/45">Try a different search term, courier, or status tab.</p>
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

  return null
}