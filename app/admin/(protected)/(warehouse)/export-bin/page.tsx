// app/admin/export-bin/page.tsx
"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { Archive, Inbox, PackageCheck, Printer, Search, SearchX, Truck, X } from "lucide-react"

import { useAdminData } from "@/contexts/AdminDataContext"
import type { ExportBinLine } from "@/types/admin"

// Export bin: everything that's been packed and labeled, staged for courier
// pickup. An order lands here when Pack & label sets Order.packedAt, and
// leaves when markPickedUp is called — which also puts it on /admin/in-transit.
//
// Nothing is handed to a courier by a bare row click. Use the per-row
// "Mark picked up" button, or tick rows and use the selection bar. The courier
// chosen in the toolbar applies to both.

const COURIERS = ["Domex", "Pronto"] as const
type Courier = (typeof COURIERS)[number]

// Shared by the header and every row so the columns always line up.
const GRID =
  "sm:grid-cols-[1.75rem_minmax(0,1.3fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_4.5rem_6.5rem_9.5rem]"

function formatAge(hours: number): string {
  if (hours < 1) return "<1h"
  if (hours < 24) return `${Math.floor(hours)}h`
  const days = Math.floor(hours / 24)
  const remHours = Math.floor(hours % 24)
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`
}

// Older orders are the ones a driver should take first, so age gets a colour.
// (amber/rose are stock Tailwind colours — swap for your own tokens if needed.)
function ageTone(hours: number) {
  if (hours >= 48) return { dot: "bg-rose-500", text: "text-rose-700 font-semibold" }
  if (hours >= 24) return { dot: "bg-amber-500", text: "text-amber-700 font-medium" }
  return { dot: "bg-teal", text: "text-ink/50" }
}

export default function ExportBinPage() {
  const { visibleExportBinLines, canActOnExportBinLine, markPickedUp, sites, currentUser, permissions } =
    useAdminData()

  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set()) // line ids
  const [courier, setCourier] = useState<Courier>("Domex")
  const [notice, setNotice] = useState<{ kind: "pickup" | "manifest"; text: string } | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(noticeTimer.current), [])

  const showNotice = (kind: "pickup" | "manifest", text: string, ms = 4000) => {
    clearTimeout(noticeTimer.current)
    setNotice({ kind, text })
    noticeTimer.current = setTimeout(() => setNotice(null), ms)
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...visibleExportBinLines]
      .filter((o) => !q || o.orderNumber.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q))
      .sort((a, b) => b.packedAgeHours - a.packedAgeHours)
  }, [visibleExportBinLines, query])

  const actionable = useMemo(() => filtered.filter(canActOnExportBinLine), [filtered, canActOnExportBinLine])
  const allVisibleSelected = actionable.length > 0 && actionable.every((o) => selected.has(o.id))

  const totalWeight = visibleExportBinLines.reduce((sum, o) => sum + (o.weightKg ?? 0), 0)
  const oldestHours = visibleExportBinLines.reduce((max, o) => Math.max(max, o.packedAgeHours), 0)
  const selectedLines = visibleExportBinLines.filter((o) => selected.has(o.id))
  const selectedWeight = selectedLines.reduce((sum, o) => sum + (o.weightKg ?? 0), 0)

  const hasAnyFilter = query.trim() !== ""
  const clearFilters = () => setQuery("")

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const toggleSelectAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev)
      actionable.forEach((o) => (allVisibleSelected ? next.delete(o.id) : next.add(o.id)))
      return next
    })

  const handleBulkPickup = () => {
    if (selectedLines.length === 0) return
    selectedLines.forEach((line) => markPickedUp(line.orderId, courier))
    showNotice("pickup", `${selectedLines.length} order${selectedLines.length === 1 ? "" : "s"} picked up by ${courier}.`)
    setSelected(new Set())
  }

  const handleSinglePickup = (line: ExportBinLine) => {
    markPickedUp(line.orderId, courier)
    showNotice("pickup", `${line.orderNumber} picked up by ${courier}.`)
    setSelected((prev) => {
      if (!prev.has(line.id)) return prev
      const next = new Set(prev)
      next.delete(line.id)
      return next
    })
  }

  const handlePrintManifest = () => {
    if (selected.size === 0) return
    showNotice("manifest", `Manifest sent to printer for ${selected.size} order${selected.size === 1 ? "" : "s"}.`, 2500)
  }

  const scopeLabel = permissions.ordersScopedToOwnSite
    ? sites.find((s) => s.id === currentUser.siteId)?.name ?? "your site"
    : "all sites"

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      <div className="mx-auto max-w-8xl px-6 pb-28 pt-10 lg:px-10">
        {/* ── Header ── */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-teal-deep text-parchment">
              <Archive size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-display text-3xl font-semibold leading-tight">Export bin</h1>
              <p className="mt-1 max-w-md text-sm leading-relaxed text-ink/60">
                Packed and labeled orders at {scopeLabel}, waiting for a courier. Oldest first.
              </p>
            </div>
          </div>

          <dl className="flex divide-x divide-ink/10 overflow-hidden rounded-2xl border border-ink/10 bg-white">
            <Stat label="Orders in bin" value={String(visibleExportBinLines.length)} />
            <Stat label="Total weight" value={`${totalWeight.toFixed(1)} kg`} />
            <Stat
              label="Oldest waiting"
              value={visibleExportBinLines.length ? formatAge(oldestHours) : "—"}
              tone={oldestHours >= 48 ? "text-rose-700" : oldestHours >= 24 ? "text-amber-700" : undefined}
            />
          </dl>
        </div>

        {/* ── Status message ── */}
        <div aria-live="polite" className="mt-6 min-h-[2.75rem]">
          {notice && (
            <div
              className={`flex flex-wrap items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium ${
                notice.kind === "pickup"
                  ? "border border-teal/25 bg-teal/[0.08] text-teal-deep"
                  : "border border-ink/10 bg-white text-ink/70"
              }`}
            >
              {notice.kind === "pickup" ? <Truck size={16} /> : <Printer size={16} />}
              {notice.text}
              {notice.kind === "pickup" && (
                <Link href="/admin/in-transit" className="ml-auto text-xs font-semibold underline underline-offset-4">
                  View in transit
                </Link>
              )}
            </div>
          )}
        </div>

        {/* ── Toolbar ── */}
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
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
            <p className="hidden whitespace-nowrap text-xs text-ink/45 sm:block">
              {filtered.length} of {visibleExportBinLines.length} shown
              {hasAnyFilter && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="ml-2 font-semibold text-teal-deep underline decoration-dotted underline-offset-4 hover:text-teal"
                >
                  Clear
                </button>
              )}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span id="courier-label" className="text-xs font-medium text-ink/50">
              Courier
            </span>
            <div
              role="radiogroup"
              aria-labelledby="courier-label"
              className="inline-flex rounded-full border border-ink/10 bg-white p-1"
            >
              {COURIERS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={courier === c}
                  onClick={() => setCourier(c)}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-teal/40 ${
                    courier === c ? "bg-teal-deep text-parchment" : "text-ink/60 hover:text-ink"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── List ── */}
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
            <span>Label</span>
            <span>Weight</span>
            <span>Waiting</span>
            <span />
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
                courier={courier}
                onToggleSelect={() => toggleSelect(line.id)}
                onMarkPickedUp={() => handleSinglePickup(line)}
              />
            ))
          )}
        </div>

        {/* ── Selection bar (sticks to the bottom while rows are ticked) ── */}
        {selected.size > 0 && (
          <div className="sticky bottom-6 z-20 mt-6 flex justify-center">
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-2xl bg-ink px-4 py-3 text-parchment shadow-[0_24px_48px_-20px_rgba(32,36,43,0.65)]">
              <span className="text-sm font-medium">
                {selected.size} selected
                <span className="ml-2 text-parchment/55">{selectedWeight.toFixed(1)} kg</span>
              </span>
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
                onClick={handlePrintManifest}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 px-3.5 py-2 text-xs font-semibold outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-parchment/50"
              >
                <Printer size={14} />
                Print manifest
              </button>
              <button
                type="button"
                onClick={handleBulkPickup}
                className="inline-flex items-center gap-1.5 rounded-xl bg-parchment px-3.5 py-2 text-xs font-semibold text-ink outline-none transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-parchment/50"
              >
                <Truck size={14} />
                Mark picked up by {courier}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="px-5 py-3">
      <dt className="text-xs font-medium text-ink/45">{label}</dt>
      <dd className={`mt-0.5 font-display text-xl ${tone ?? "text-ink"}`}>{value}</dd>
    </div>
  )
}

function ExportBinRow({
  line,
  canAct,
  selected,
  courier,
  onToggleSelect,
  onMarkPickedUp,
}: {
  line: ExportBinLine
  canAct: boolean
  selected: boolean
  courier: string
  onToggleSelect: () => void
  onMarkPickedUp: () => void
}) {
  const tone = ageTone(line.packedAgeHours)

  const pickupButton = (label: string) => (
    <button
      type="button"
      disabled={!canAct}
      onClick={onMarkPickedUp}
      title={canAct ? `Mark picked up by ${courier}` : undefined}
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-teal/30 bg-teal/[0.06] px-3 py-1.5 text-xs font-semibold text-teal-deep outline-none transition-colors hover:bg-teal/[0.12] focus-visible:ring-2 focus-visible:ring-teal/40 disabled:cursor-not-allowed disabled:opacity-30"
    >
      <Truck size={13} />
      {label}
    </button>
  )

  return (
    <div
      className={`grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 border-b border-ink/[0.06] px-5 py-4 transition-colors last:border-b-0 sm:gap-y-0 sm:py-3.5 ${GRID} ${
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
          className="block truncate text-sm font-semibold hover:text-teal-deep hover:underline"
        >
          {line.orderNumber}
        </Link>
        <span className="block truncate text-xs text-ink/50">{line.customerName}</span>
        {!canAct && <span className="block text-[11px] text-ink/40">View only, different site</span>}
      </div>

      <span className="col-start-2 truncate text-sm text-ink/70 sm:col-start-auto">{line.destination}</span>

      <span className="col-start-2 sm:col-start-auto">
        <span className="inline-flex max-w-full items-center gap-1.5 truncate whitespace-nowrap rounded-md bg-ink/[0.04] px-2 py-1 text-xs font-medium text-ink/60 ring-1 ring-inset ring-ink/10">
          <PackageCheck size={12} className="flex-none" />
          {line.labelRef ?? "No label"}
        </span>
      </span>

      <span className="col-start-2 text-sm tabular-nums text-ink/60 sm:col-start-auto">
        {line.weightKg != null ? `${line.weightKg.toFixed(1)} kg` : "—"}
      </span>

      <span className={`col-start-2 inline-flex items-center gap-2 text-sm tabular-nums sm:col-start-auto ${tone.text}`}>
        <span className={`h-2 w-2 flex-none rounded-full ${tone.dot}`} aria-hidden />
        {line.packedAgeLabel}
      </span>

      <span className="col-start-2 sm:col-start-auto sm:justify-self-end">
        <span className="sm:hidden">{pickupButton(`Mark picked up by ${courier}`)}</span>
        <span className="hidden sm:inline">{pickupButton("Mark picked up")}</span>
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
          <p className="mt-1 max-w-xs text-xs text-ink/50">
            Orders appear here once they&apos;re marked packed on Pack &amp; label.
          </p>
        </div>
        <Link
          href="/admin/pack-label"
          className="text-xs font-semibold text-teal-deep underline decoration-dotted underline-offset-4 hover:text-teal"
        >
          Go to Pack &amp; label
        </Link>
      </div>
    )
  }

  if (hasAnyFilter) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
        <SearchX size={22} className="text-ink/25" />
        <div>
          <p className="text-sm font-semibold text-ink/70">No orders match this search</p>
          <p className="mt-1 text-xs text-ink/50">Check the order number or customer name.</p>
        </div>
        <button
          type="button"
          onClick={onClearFilters}
          className="text-xs font-semibold text-teal-deep underline decoration-dotted underline-offset-4 hover:text-teal"
        >
          Clear search
        </button>
      </div>
    )
  }

  return null
}