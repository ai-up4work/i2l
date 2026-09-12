// app/admin/export-bin/page.tsx
"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Archive,
  Inbox,
  PackageCheck,
  Printer,
  Search,
  SearchX,
  Truck,
} from "lucide-react"

import { useAdminData } from "@/contexts/AdminDataContext"
import type { ExportBinLine } from "@/types/admin"

// Export bin: everything that's been packed and labeled, staged for
// courier pickup. An order lands here the instant Pack & label's "Mark
// packed" sets Order.packedAt, and leaves the instant markPickedUp is
// called below — which is also what makes it appear on /admin/in-transit.
//
// Previously this page kept its own local MOCK_EXPORT_BIN array in
// useState, entirely disconnected from Orders/Purchases/Pack & label —
// "picked up" here didn't write anywhere real, so In transit never saw
// it. Now `visibleExportBinLines` is derived straight from
// AdminDataContext's orders (see ExportBinLine in types/admin.ts), and
// markPickedUp is the same mutation Pack & label's sibling pages use, so
// a pickup recorded here shows up on In transit immediately and vanishes
// from this queue on the very next render — no separate "event feed"
// needed.
//
// "Print manifest" has no backend concept yet (no PDF/manifest endpoint
// exists), so it stays a local, cosmetic confirmation — it doesn't touch
// order data and there's nothing to keep in sync.

function formatAge(hours: number): string {
  if (hours < 1) return "<1h"
  if (hours < 24) return `${Math.floor(hours)}h`
  const days = Math.floor(hours / 24)
  const remHours = Math.floor(hours % 24)
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`
}

const COURIERS = ["Domex", "Pronto"] as const

export default function ExportBinPage() {
  const router = useRouter()
  const { visibleExportBinLines, canActOnExportBinLine, markPickedUp, sites, currentUser, permissions } = useAdminData()

  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkCourier, setBulkCourier] = useState<(typeof COURIERS)[number]>("Domex")
  const [manifestPrinted, setManifestPrinted] = useState(false)
  const [justPickedUp, setJustPickedUp] = useState<string[]>([])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...visibleExportBinLines]
      .filter((o) => {
        if (!q) return true
        return o.orderNumber.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q)
      })
      .sort((a, b) => b.packedAgeHours - a.packedAgeHours)
  }, [visibleExportBinLines, query])

  const hasAnyFilter = query.trim() !== ""
  const clearFilters = () => setQuery("")

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleSelectAllVisible = () => {
    setSelected((prev) => {
      const actionable = filtered.filter(canActOnExportBinLine)
      const allVisibleSelected = actionable.every((o) => prev.has(o.id))
      const next = new Set(prev)
      actionable.forEach((o) => (allVisibleSelected ? next.delete(o.id) : next.add(o.id)))
      return next
    })
  }

  const handlePickup = () => {
    if (selected.size === 0) return
    const ids = Array.from(selected)
    ids.forEach((orderId) => markPickedUp(orderId, bulkCourier))
    setJustPickedUp(ids)
    setSelected(new Set())
    setTimeout(() => setJustPickedUp([]), 4000)
  }

  const handlePrintManifest = () => {
    if (selected.size === 0) return
    setManifestPrinted(true)
    setTimeout(() => setManifestPrinted(false), 2500)
  }

  const totalWeight = filtered.reduce((sum, o) => sum + (o.weightKg ?? 0), 0)
  const actionableFiltered = filtered.filter(canActOnExportBinLine)
  const allVisibleSelected = actionableFiltered.length > 0 && actionableFiltered.every((o) => selected.has(o.id))

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
              <Archive size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-display text-3xl font-semibold text-ink">Export bin</h1>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink/60">
                Packed and labeled orders staged for courier pickup at {scopeLabel}.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-ink/10 bg-white px-5 py-3 text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-ink/40">In bin</p>
            <p className="mt-0.5 font-display text-xl text-ink">
              {visibleExportBinLines.length}{" "}
              <span className="text-sm font-normal text-ink/40">· {totalWeight.toFixed(1)} kg</span>
            </p>
          </div>
        </div>

        {/* ── Confirmation banners ── */}
        {justPickedUp.length > 0 && (
          <div className="mt-6 flex items-center gap-2.5 rounded-2xl border border-teal/25 bg-teal/[0.08] px-4 py-3 text-sm font-medium text-teal-deep">
            <Truck size={16} />
            {justPickedUp.length} order{justPickedUp.length === 1 ? "" : "s"} handed off to courier — now in transit.
          </div>
        )}
        {manifestPrinted && (
          <div className="mt-4 flex items-center gap-2.5 rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm font-medium text-ink/70">
            <Printer size={16} />
            Manifest sent to printer for {selected.size} order{selected.size === 1 ? "" : "s"}.
          </div>
        )}

        {/* ── Filters ── */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
          {hasAnyFilter && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs font-semibold text-teal-deep underline decoration-dotted underline-offset-4 hover:text-teal"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* ── Bulk action bar ── */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
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

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePrintManifest}
              disabled={selected.size === 0}
              className="inline-flex items-center gap-1.5 rounded-xl border border-ink/10 bg-white px-3.5 py-2 text-xs font-semibold text-ink/70 transition-colors hover:bg-ink/[0.03] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Printer size={14} />
              Print manifest
            </button>

            <select
              value={bulkCourier}
              onChange={(e) => setBulkCourier(e.target.value as (typeof COURIERS)[number])}
              disabled={selected.size === 0}
              title="Courier to assign for pickup"
              className="rounded-xl border border-ink/10 bg-white px-2.5 py-2 text-xs font-medium text-ink/70 outline-none focus:border-teal/50 focus:ring-2 focus:ring-teal/15 disabled:opacity-40"
            >
              {COURIERS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <button
              type="button"
              onClick={handlePickup}
              disabled={selected.size === 0}
              className="inline-flex items-center gap-1.5 rounded-xl bg-teal-deep px-3.5 py-2 text-xs font-semibold text-parchment transition-colors hover:bg-teal-deep/90 disabled:cursor-not-allowed disabled:bg-ink/15"
            >
              <Truck size={14} />
              Mark picked up
            </button>
          </div>
        </div>

        <p className="mt-3 text-xs font-medium text-ink/40">
          {filtered.length} of {visibleExportBinLines.length} orders
        </p>

        {/* ── List ── */}
        <div className="mt-3 overflow-hidden rounded-2xl border border-ink/10 bg-white">
          <div className="sticky top-0 z-10 hidden grid-cols-[auto_1fr_1fr_0.9fr_0.9fr_0.8fr] gap-2 border-b border-ink/10 bg-parchment/60 px-5 py-3 text-[11px] font-semibold tracking-wide text-ink/45 sm:grid">
            <span />
            <span>Order</span>
            <span>Destination</span>
            <span>Label</span>
            <span>Weight</span>
            <span className="text-right">Packed</span>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              hasAnyFilter={hasAnyFilter}
              isEmptyOverall={visibleExportBinLines.length === 0}
              onClearFilters={clearFilters}
            />
          ) : (
            filtered.map((line) => (
              <ExportBinRow
                key={line.id}
                line={line}
                canAct={canActOnExportBinLine(line)}
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

function ExportBinRow({
  line,
  canAct,
  selected,
  onToggleSelect,
  onOpen,
}: {
  line: ExportBinLine
  canAct: boolean
  selected: boolean
  onToggleSelect: () => void
  onOpen: () => void
}) {
  return (
    <div
      className={`group grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-ink/[0.06] px-5 py-3.5 transition-colors last:border-b-0 hover:bg-parchment/40 sm:grid-cols-[auto_1fr_1fr_0.9fr_0.9fr_0.8fr] ${
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

      <span className="hidden truncate text-sm text-ink/70 sm:block">{line.destination}</span>

      <span className="hidden truncate sm:block">
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-ink/[0.04] px-2.5 py-1 text-xs font-semibold text-ink/60 ring-1 ring-inset ring-ink/10">
          <PackageCheck size={12} />
          {line.labelRef ?? "No label"}
        </span>
      </span>

      <span className="hidden text-sm text-ink/50 sm:block">
        {line.weightKg != null ? `${line.weightKg.toFixed(1)} kg` : "—"}
      </span>

      <span className="hidden justify-self-end text-sm text-ink/50 sm:block">{line.packedAgeLabel} ago</span>

      {/* mobile summary */}
      <span className="col-span-3 flex items-center justify-between gap-2 pl-7 sm:hidden">
        <span className="text-xs text-ink/45">{line.destination}</span>
        <span className="text-xs text-ink/40">{line.packedAgeLabel} ago</span>
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
          <p className="text-sm font-semibold text-ink/70">The export bin is empty</p>
          <p className="mt-1 max-w-xs text-xs text-ink/45">
            Orders show up here once they&apos;ve been packed and labeled on Pack &amp; label.
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
          <p className="mt-1 text-xs text-ink/45">Try a different search term.</p>
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