// app/admin/orders/page.tsx
"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronRight, Flag, Inbox, MapPinned, Package, Search, SearchX } from "lucide-react"

import { useAdminData, hoursSince, formatAge } from "@/contexts/AdminDataContext"
import type { Channel, Order, OrderStage } from "@/types/admin"
import { STAGE_ORDER, STAGE_AGE_THRESHOLD_HOURS, CHANNEL_LABEL } from "@/types/admin"
import type { StatusTone } from "@/components/admin/warehouse/status-pill"
import { AnimatedItemCardStack } from "@/components/admin/orders/AnimatedItemCardStack"

// Orders — every order across all three channels, independent of the
// warehouse queue.
//
// DESIGN PASS (2026-09): restyled from a dense table into the same card
// language as the customer-facing "My Orders" page — a left-edge status
// accent, an item image stack, and a clean total/action area — instead
// of a 10-column grid. Ops still needs to scan a lot of orders fast, so
// the card keeps every field the table had (channel, stage, site, both
// age readouts, override controls), just organized as one flexible row
// per order instead of fixed grid tracks. This also removes the
// separate "mobile summary row" the table needed, since a card-based
// row is naturally responsive at any width.
//
// The stage dropdown here is the OVERRIDE control, not the normal way an
// order progresses — that's what the QC/Pack & label/Export bin/In
// transit pages are for, and canMutateOrderStage (Warehouse-at-own-site
// + Manager-anywhere) still governs those. This page's override row is
// gated on the separate `canOverrideOrderStage` permission (Manager
// only), enforced both here and centrally in
// AdminDataContext.updateOrderStage.

type SortMode = "recent" | "stuck"

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
const INK_PILL = "bg-ink/[0.04] text-ink/60 ring-1 ring-inset ring-ink/10"
const INK_DOT = "bg-ink/30"

const CHANNEL_TONE: Record<Channel, StatusTone | "ink"> = {
  1: "teal",
  2: "ink",
  3: "amber",
}

const STAGE_TONE: Record<OrderStage, StatusTone | "ink"> = {
  "Ordered": "ink",
  "Quality check": "amber",
  "Shipped": "teal",
  "Delivered": "teal",
}

// Left-edge accent per card — mirrors STATUS_ACCENT on the customer
// "My Orders" page. Delayed/breached orders always read as rose
// regardless of stage, since that's the thing ops needs to spot first
// scanning down the list; otherwise the accent follows the stage tone.
function orderAccent(order: Order, breach: boolean): string {
  if (order.delayed || breach) return "border-l-rose-500"
  switch (order.stage) {
    case "Ordered":
      return "border-l-ink/15"
    case "Quality check":
      return "border-l-gold-deep"
    case "Shipped":
    case "Delivered":
      return "border-l-teal-deep"
    default:
      return "border-l-ink/15"
  }
}

function pillClass(tone: StatusTone | "ink") {
  return tone === "ink" ? INK_PILL : TONE_PILL[tone]
}
function dotClass(tone: StatusTone | "ink") {
  return tone === "ink" ? INK_DOT : TONE_DOT[tone]
}

function Pill({ tone, children }: { tone: StatusTone | "ink"; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${pillClass(tone)}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass(tone)}`} />
      {children}
    </span>
  )
}

function DelayedPill() {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
      <span className="h-1.5 w-1.5 rounded-full bg-rose-600" />
      Delayed
    </span>
  )
}

// Distinct from DelayedPill — "Delayed" is a generic catch-all (could be
// customs, a stuck courier, anything), so seeing it alone doesn't tell
// ops WHY. This pill specifically means "at least one item on this
// order has an open QC fault" — computed from `purchases` (per-item
// qcStatus, see AdminDataContext's mapToPurchases fix), not from
// order.delayed, so it stays accurate even though flagging an item also
// happens to set order.delayed as a side effect.
function QcIssuePill() {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
      <Flag size={11} className="shrink-0" />
      QC issue
    </span>
  )
}

function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string
  value: string | number
  hint?: string
  tone?: "default" | "warning"
}) {
  return (
    <div className={`rounded-2xl border p-5 ${tone === "warning" ? "border-rose-100 bg-rose-50/40" : "border-ink/10 bg-card"}`}>
      <p className="text-xs font-medium text-ink/45">{label}</p>
      <p className={`mt-1 font-display text-2xl ${tone === "warning" ? "text-rose-700" : "text-ink"}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-ink/40">{hint}</p>}
    </div>
  )
}

// Compact "bar + label" age readout — used for both age fields on a
// card. Label is fixed-width and never wraps.
function AgeReadout({ label, hours, threshold }: { label: string; hours: number; threshold: number }) {
  const breach = threshold !== Infinity && hours > threshold
  const pct = threshold === Infinity ? 0 : Math.min(100, (hours / threshold) * 100)
  const barColor = breach ? "bg-rose-600" : pct > 70 ? "bg-gold-deep" : "bg-teal-deep"

  return (
    <div className="flex items-center gap-1.5" title={breach ? `${formatAge(hours)} — over the ${formatAge(threshold)} threshold` : undefined}>
      <span className="text-[11px] uppercase tracking-wide text-ink/35">{label}</span>
      {threshold !== Infinity && (
        <div className="h-1.5 w-8 shrink-0 overflow-hidden rounded-full bg-ink/[0.06]">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      <span className={`whitespace-nowrap text-xs tabular-nums ${breach ? "font-semibold text-rose-600" : "text-ink/60"}`}>
        {formatAge(hours)}
      </span>
    </div>
  )
}

const inputClass =
  "rounded-lg border border-ink/10 bg-card px-2.5 py-1.5 text-sm text-ink outline-none transition-colors focus:border-teal/50 focus:ring-2 focus:ring-teal/15"

export default function OrdersPage() {
  const router = useRouter()
  const {
    visibleOrders,
    sites,
    permissions,
    updateOrderStage,
    reassignSite,
    toggleDelayed,
    bulkFlagDelayed,
    purchases,
  } = useAdminData()

  // Orders with at least one item currently sitting "flagged" per the
  // real per-item QC signal — same set the QC page itself reads, so
  // this list agrees with /admin/qc and /admin/qc-issues about which
  // orders actually have an open fault, rather than relying on the
  // generic order.delayed flag (which flagging also sets, but which
  // other things — shipping delays, customs — set too).
  const qcFlaggedOrderIds = useMemo(
    () => new Set(purchases.filter((p) => p.qcStatus === "flagged").map((p) => p.orderId)),
    [purchases]
  )

  const [search, setSearch] = useState("")
  const [channelFilter, setChannelFilter] = useState<"all" | Channel>("all")
  const [stageFilter, setStageFilter] = useState<"all" | OrderStage>("all")
  const [siteFilter, setSiteFilter] = useState<"all" | string>("all")
  const [delayedOnly, setDelayedOnly] = useState(false)
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [sortMode, setSortMode] = useState<SortMode>("recent")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [blockedReasons, setBlockedReasons] = useState<Record<string, string>>({})
  const [openSiteMenuFor, setOpenSiteMenuFor] = useState<string | null>(null)

  const hasActiveFilters =
    search.trim() !== "" ||
    channelFilter !== "all" ||
    stageFilter !== "all" ||
    siteFilter !== "all" ||
    delayedOnly ||
    dateFrom !== "" ||
    dateTo !== ""

  const clearFilters = () => {
    setSearch("")
    setChannelFilter("all")
    setStageFilter("all")
    setSiteFilter("all")
    setDelayedOnly(false)
    setDateFrom("")
    setDateTo("")
  }

  const isOverThreshold = (stage: OrderStage, stageHours: number) => {
    const threshold = STAGE_AGE_THRESHOLD_HOURS[stage]
    return threshold !== Infinity && stageHours > threshold
  }

  const handleStageChange = (orderId: string, stage: OrderStage) => {
    const result = updateOrderStage(orderId, stage)
    if (!result.allowed) {
      setBlockedReasons((prev) => ({ ...prev, [orderId]: result.reason ?? "This order can't move to that stage yet." }))
      window.setTimeout(() => {
        setBlockedReasons((prev) => {
          const next = { ...prev }
          delete next[orderId]
          return next
        })
      }, 5000)
    }
  }

  const filtered = useMemo(() => {
    const rows = visibleOrders.filter((o) => {
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        if (!o.id.toLowerCase().includes(q) && !o.customerName.toLowerCase().includes(q)) {
          return false
        }
      }
      if (channelFilter !== "all" && o.channel !== channelFilter) return false
      if (stageFilter !== "all" && o.stage !== stageFilter) return false
      if (siteFilter !== "all" && o.siteId !== siteFilter) return false
      if (delayedOnly && !o.delayed) return false
      if (dateFrom && new Date(o.placedAt) < new Date(dateFrom)) return false
      if (dateTo && new Date(o.placedAt) > new Date(dateTo)) return false
      return true
    })

    return sortMode === "stuck"
      ? [...rows].sort((a, b) => hoursSince(b.stageEnteredAt) - hoursSince(a.stageEnteredAt))
      : [...rows].sort((a, b) => hoursSince(a.placedAt) - hoursSince(b.placedAt))
  }, [visibleOrders, search, channelFilter, stageFilter, siteFilter, delayedOnly, dateFrom, dateTo, sortMode])

  const siteName = (id: string) => sites.find((s) => s.id === id)?.name ?? id

  const delayedCount = visibleOrders.filter((o) => o.delayed).length
  const manualQuoteCount = visibleOrders.filter((o) => o.isManualQuote && o.stage !== "Delivered").length
  const breachCount = visibleOrders.filter((o) => isOverThreshold(o.stage, hoursSince(o.stageEnteredAt))).length

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      <div className="mx-auto max-w-[1560px] px-6 pb-20 pt-10 lg:px-10">
        {/* ── Header ── */}
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 flex-none place-items-center rounded-2xl border border-ink/10 bg-card text-teal-deep shadow-[0_1px_2px_rgba(32,36,43,0.04),0_16px_40px_-24px_rgba(14,140,156,0.4)]">
              <Package size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-display text-3xl text-ink">Orders</h1>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink/60">
                Every order across all three channels, independent of the warehouse queue.
              </p>
            </div>
          </div>

          {permissions.canBulkFlag && (
            <button
              type="button"
              onClick={() => {
                bulkFlagDelayed(Array.from(selected))
                setSelected(new Set())
              }}
              disabled={selected.size === 0}
              className="rounded-xl bg-teal-deep px-4 py-2 text-sm font-semibold text-white hover:bg-teal disabled:opacity-40"
            >
              Flag {selected.size || ""} for review
            </button>
          )}
        </div>

        {/* ── Stat strip ── */}
        <div className="mt-9 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Visible orders" value={visibleOrders.length} />
          <StatCard label="Delayed" value={delayedCount} tone={delayedCount > 0 ? "warning" : "default"} />
          <StatCard label="Over SLA threshold" value={breachCount} tone={breachCount > 0 ? "warning" : "default"} />
          <StatCard label="Manual quotes in flight" value={manualQuoteCount} hint="Channel 3, not yet delivered" />
        </div>

        {/* ── Filters ── */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1 rounded-full border border-ink/10 bg-card p-1">
            {(["recent", "stuck"] as SortMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setSortMode(mode)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal ${
                  sortMode === mode
                    ? "bg-teal-deep text-parchment shadow-[0_6px_18px_-8px_rgba(14,140,156,0.5)]"
                    : "text-ink/55 hover:text-ink/80"
                }`}
              >
                {mode === "recent" ? "Newest first" : "Oldest in stage"}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/35" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search order or customer"
              className="w-full rounded-full border border-ink/10 bg-card py-2.5 pl-9 pr-4 text-sm text-ink placeholder:text-ink/35 outline-none transition-colors focus:border-teal/50 focus:ring-2 focus:ring-teal/15"
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-3 rounded-2xl border border-ink/10 bg-card p-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-ink/45">Channel</label>
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value === "all" ? "all" : (Number(e.target.value) as Channel))}
              className={inputClass}
            >
              <option value="all">All channels</option>
              <option value={1}>1 · {CHANNEL_LABEL[1]}</option>
              <option value={2}>2 · {CHANNEL_LABEL[2]}</option>
              <option value={3}>3 · {CHANNEL_LABEL[3]}</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-ink/45">Stage</label>
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value as "all" | OrderStage)}
              className={inputClass}
            >
              <option value="all">All stages</option>
              {STAGE_ORDER.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {!permissions.ordersScopedToOwnSite && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-ink/45">Site</label>
              <select value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)} className={inputClass}>
                <option value="all">All sites</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-ink/45">Placed from</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputClass} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-ink/45">Placed to</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputClass} />
          </div>

          <label className="flex items-center gap-2 pb-1.5 text-sm text-ink/70">
            <input
              type="checkbox"
              checked={delayedOnly}
              onChange={(e) => setDelayedOnly(e.target.checked)}
              className="h-4 w-4 rounded border-ink/20 text-teal-deep focus-visible:ring-2 focus-visible:ring-teal/40"
            />
            Delayed only
          </label>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="pb-1.5 text-xs font-semibold text-teal-deep underline decoration-dotted underline-offset-4 hover:text-teal"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* ── Result count ── */}
        <p className="mt-4 text-xs font-medium text-ink/40">
          {filtered.length} of {visibleOrders.length} orders
        </p>

        {/* ── Card list ── */}
        <div className="mt-3 space-y-3">
          {filtered.length === 0 ? (
            <EmptyState
              hasAnyFilter={hasActiveFilters}
              isEmptyOverall={visibleOrders.length === 0}
              onClearFilters={clearFilters}
            />
          ) : (
            filtered.map((o) => {
              const stageHours = hoursSince(o.stageEnteredAt)
              const orderAgeHours = hoursSince(o.placedAt)
              const breach = isOverThreshold(o.stage, stageHours)
              const accent = orderAccent(o, breach)
              const blockedReason = blockedReasons[o.id]
              const siteMenuOpen = openSiteMenuFor === o.id
              const itemCount = o.items.reduce((sum, i) => sum + i.quantity, 0)

              return (
                <div
                  key={o.id}
                  className={`overflow-hidden rounded-2xl border pt-2 border-ink/10 border-l-4 bg-card transition-colors hover:border-ink/20 ${accent}`}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(`/admin/orders/${o.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") router.push(`/admin/orders/${o.id}`)
                    }}
                    className="flex cursor-pointer flex-col gap-4 p-4 outline-none focus-visible:bg-teal/[0.06] sm:flex-row sm:items-center"
                  >
                    {permissions.canBulkFlag && (
                      <span
                        className="flex-none self-start sm:self-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(o.id)}
                          onChange={() => toggleSelect(o.id)}
                          className="h-4 w-4 rounded border-ink/20 text-teal-deep focus-visible:ring-2 focus-visible:ring-teal/40"
                        />
                      </span>
                    )}

                    {/* w-32 is only a sensible fixed box for a single
                        item (the stack fills it edge to edge). With 2+
                        items the stack sizes itself to fit its fixed
                        rail widths (see OrderItemImageStack) and would
                        get clipped by a fixed-width parent, so it gets
                        room to grow instead. */}
                        <div className="h-20 w-full flex-none sm:w-32">
                          <AnimatedItemCardStack items={o.items} className="h-full" />
                        </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-display text-sm font-semibold text-ink">{o.id}</span>
                            {qcFlaggedOrderIds.has(o.id) && <QcIssuePill />}
                            {o.delayed && <DelayedPill />}
                          </div>
                          <p className="mt-0.5 truncate text-xs text-ink/55">
                            {o.customerName} <span className="text-ink/25">·</span> {siteName(o.siteId)}
                          </p>
                        </div>
                        <Pill tone={STAGE_TONE[o.stage]}>{o.stage}</Pill>
                      </div>

                      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <Pill tone={CHANNEL_TONE[o.channel]}>
                          Ch. {o.channel} · {CHANNEL_LABEL[o.channel]}
                        </Pill>
                        <span className="text-xs text-ink/45">
                          {itemCount} item{itemCount === 1 ? "" : "s"}
                        </span>
                        <AgeReadout label="Placed" hours={orderAgeHours} threshold={Infinity} />
                        <AgeReadout label="In stage" hours={stageHours} threshold={STAGE_AGE_THRESHOLD_HOURS[o.stage]} />
                      </div>
                    </div>

                    <div className="flex flex-none items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-center sm:gap-1.5">
                      <span className="font-display text-base text-ink">Rs. {o.totalValue.toLocaleString("en-US")}</span>
                      <ChevronRight size={16} className="hidden text-ink/25 sm:block" />
                    </div>
                  </div>

                  {/* Override footer — Manager only, tucked below the
                      main card so it never competes with the info ops
                      scans for. See file header re: canOverrideOrderStage
                      vs canMutateOrderStage. */}
                  {permissions.canOverrideOrderStage && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="flex flex-wrap items-center gap-2 border-t border-ink/[0.06] bg-parchment/40 px-4 py-2"
                    >
                      <span className="text-[11px] font-medium uppercase tracking-wide text-ink/35">Override</span>
                      <select
                        value={o.stage}
                        onChange={(e) => handleStageChange(o.id, e.target.value as OrderStage)}
                        className="rounded-lg border border-ink/10 bg-card px-2 py-1 text-xs text-ink outline-none focus:border-teal/50 focus:ring-2 focus:ring-teal/15"
                      >
                        {STAGE_ORDER.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>

                      {permissions.canReassignSite && (
                        <div className="relative">
                          <button
                            type="button"
                            title={`Reassign site (currently ${siteName(o.siteId)})`}
                            onClick={() => setOpenSiteMenuFor(siteMenuOpen ? null : o.id)}
                            className={`grid h-[26px] w-[26px] place-items-center rounded-lg border text-ink/55 transition-colors hover:bg-ink/[0.04] hover:text-ink ${
                              siteMenuOpen ? "border-teal/50 bg-teal/[0.08] text-teal-deep" : "border-ink/10"
                            }`}
                          >
                            <MapPinned size={13} />
                          </button>
                          {siteMenuOpen && (
                            <div className="absolute left-0 top-full z-20 mt-1 w-40 overflow-hidden rounded-xl border border-ink/10 bg-card py-1 shadow-[0_12px_32px_-12px_rgba(32,36,43,0.25)]">
                              {sites.map((s) => (
                                <button
                                  key={s.id}
                                  type="button"
                                  onClick={() => {
                                    reassignSite(o.id, s.id)
                                    setOpenSiteMenuFor(null)
                                  }}
                                  className={`block w-full px-3 py-1.5 text-left text-xs ${
                                    s.id === o.siteId ? "font-semibold text-teal-deep" : "text-ink/70 hover:bg-ink/[0.04]"
                                  }`}
                                >
                                  {s.name}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {permissions.canToggleDelayed && (
                        <button
                          type="button"
                          onClick={() => toggleDelayed(o.id)}
                          title={o.delayed ? "Clear delayed flag" : "Flag as delayed"}
                          className={`grid h-[26px] w-[26px] place-items-center rounded-lg border transition-colors ${
                            o.delayed
                              ? "border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
                              : "border-ink/10 text-ink/45 hover:bg-ink/[0.04] hover:text-ink"
                          }`}
                        >
                          <Flag size={12} fill={o.delayed ? "currentColor" : "none"} />
                        </button>
                      )}

                      {blockedReason && (
                        <p className="w-full text-[11px] leading-snug text-rose-600 sm:w-auto">{blockedReason}</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
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
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-ink/15 bg-card px-4 py-16 text-center">
        <Inbox size={22} className="text-ink/25" />
        <div>
          <p className="text-sm font-semibold text-ink/70">No orders assigned to you yet</p>
          <p className="mt-1 max-w-xs text-xs text-ink/45">Check back once orders are routed to your site.</p>
        </div>
      </div>
    )
  }

  if (hasAnyFilter) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-ink/15 bg-card px-4 py-16 text-center">
        <SearchX size={22} className="text-ink/25" />
        <div>
          <p className="text-sm font-semibold text-ink/70">Nothing matches this filter</p>
          <p className="mt-1 text-xs text-ink/45">Try a different search term or filter combination.</p>
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