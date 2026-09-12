// app/admin/orders/page.tsx
"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronRight, Inbox, Package, Search, SearchX } from "lucide-react"

import { useAdminData, hoursSince, formatAge } from "@/contexts/AdminDataContext"
import type { Channel, OrderStage } from "@/types/admin"
import { STAGE_ORDER, STAGE_AGE_THRESHOLD_HOURS, CHANNEL_LABEL } from "@/types/admin"
import type { StatusTone } from "@/components/admin/warehouse/status-pill"
import { panelClass } from "@/components/admin/seller/shared"

// Orders — every order across all three channels, independent of the
// warehouse queue. Restyled to match the Purchases screen deliberately:
// same panelClass table shell, same ink/parchment/card palette, same
// pill-tab + edge-bar tone system — ops moves between Orders and
// Purchases constantly in the course of a shift, so the two should read
// as one product, not two.
//
// Data comes from useAdminData() — the same store /admin/orders/[orderId]
// and the Purchases pages read from — so nothing here is a local copy.
//
// The stage dropdown here is the OVERRIDE control, not the normal way an
// order progresses — that's what the QC/Pack & label/Export bin/In
// transit pages are for, and canMutateOrderStage (Warehouse-at-own-site +
// Manager-anywhere) still governs those. This page's dropdown/override
// column is gated on the separate `canOverrideOrderStage` permission
// (Manager only), enforced both here and centrally in
// AdminDataContext.updateOrderStage, so a Warehouse user can't skip an
// order past Quality check without ever going through the real Pack &
// label workflow.

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
const TONE_EDGE: Record<StatusTone, string> = {
  teal: "before:bg-teal-deep/70",
  amber: "before:bg-gold-deep",
  rose: "before:bg-rose-600/70",
}
// One neutral tone on top of the shared teal/amber/rose set — local to
// this file, not part of the shared StatusTone type, since only Orders
// needs a "nothing to flag" pill (e.g. the Ordered stage, channel 2).
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

function DelayedDot({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <span className="inline-flex items-center" title="Delayed">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-600" />
        <span className="sr-only">Delayed</span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
      <span className="h-1.5 w-1.5 rounded-full bg-rose-600" />
      Delayed
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

function StageAgeBar({ stage, hours }: { stage: OrderStage; hours: number }) {
  const threshold = STAGE_AGE_THRESHOLD_HOURS[stage]
  const breach = threshold !== Infinity && hours > threshold
  const pct = threshold === Infinity ? 0 : Math.min(100, (hours / threshold) * 100)
  const barColor = breach ? "bg-rose-600" : pct > 70 ? "bg-gold-deep" : "bg-teal-deep"

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-ink/[0.06]">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={breach ? "font-medium text-rose-600" : "text-ink/60"}>{formatAge(hours)}</span>
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
  } = useAdminData()

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
    <div className="min-h-screen bg-parchment font-body text-ink">
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
          {/* Sort — pill tabs, same shape as the Purchases status tabs */}
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

          {/* Site filter hidden for Warehouse — their list is already scoped to one site */}
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

        {/* ── Table ── */}
        <div className={`mt-3 overflow-hidden ${panelClass}`}>
          <div className="sticky top-0 z-10 hidden grid-cols-[1fr_1fr_1.1fr_1fr_1fr_0.8fr_0.9fr_0.9fr_0.7fr_auto] gap-2 border-b border-ink/10 bg-parchment/70 px-5 py-3 text-[11px] font-semibold tracking-wide text-ink/45 sm:grid">
            {permissions.canBulkFlag && <span />}
            <span>Order</span>
            <span>Customer</span>
            <span>Channel</span>
            <span>Stage</span>
            <span>Site</span>
            <span>Order age</span>
            <span>Time in stage</span>
            <span className="text-right">Total</span>
            {permissions.canOverrideOrderStage && <span>Override</span>}
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              hasAnyFilter={hasActiveFilters}
              isEmptyOverall={visibleOrders.length === 0}
              onClearFilters={clearFilters}
            />
          ) : (
            filtered.map((o) => {
              const stageHours = hoursSince(o.stageEnteredAt)
              const breach = isOverThreshold(o.stage, stageHours)
              const edgeTone: StatusTone | "ink" = o.delayed || breach ? "rose" : STAGE_TONE[o.stage]
              const blockedReason = blockedReasons[o.id]

              return (
                <div
                  key={o.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/admin/orders/${o.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") router.push(`/admin/orders/${o.id}`)
                  }}
                  className={`group relative grid w-full cursor-pointer grid-cols-[1fr_auto] items-center gap-3 border-b border-ink/[0.06] px-5 py-3.5 pl-6 text-left outline-none transition-colors before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:content-[''] last:border-b-0 hover:bg-parchment/50 focus-visible:bg-teal/[0.08] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-teal/40 sm:grid-cols-[1fr_1fr_1.1fr_1fr_1fr_0.8fr_0.9fr_0.9fr_0.7fr_auto] ${TONE_EDGE[edgeTone === "ink" ? "teal" : edgeTone]}`}
                  style={edgeTone === "ink" ? undefined : undefined}
                >
                  {permissions.canBulkFlag && (
                    <span className="hidden sm:block" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(o.id)}
                        onChange={() => toggleSelect(o.id)}
                        className="h-4 w-4 rounded border-ink/20 text-teal-deep focus-visible:ring-2 focus-visible:ring-teal/40"
                      />
                    </span>
                  )}

                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">{o.id}</span>
                    {o.delayed && <span className="mt-0.5 block sm:hidden"><DelayedDot compact /></span>}
                  </span>

                  <span className="hidden truncate text-sm text-ink/70 sm:block">{o.customerName}</span>

                  <span className="hidden sm:block">
                    <Pill tone={CHANNEL_TONE[o.channel]}>
                      Ch. {o.channel} · {CHANNEL_LABEL[o.channel]}
                    </Pill>
                  </span>

                  <span className="hidden sm:block">
                    <Pill tone={STAGE_TONE[o.stage]}>{o.stage}</Pill>
                  </span>

                  <span className="hidden truncate text-sm text-ink/70 sm:block">{siteName(o.siteId)}</span>

                  <span className="hidden text-sm text-ink/50 sm:block">{formatAge(hoursSince(o.placedAt))}</span>

                  <span className="hidden sm:block">
                    <StageAgeBar stage={o.stage} hours={stageHours} />
                  </span>

                  <span className="hidden justify-self-end text-sm font-medium text-ink/80 sm:block">
                    ₹{o.totalValue.toLocaleString("en-IN")}
                  </span>

                  {/* Override controls — Manager only. Warehouse (and Sales)
                      never see this column at all, since the real way an
                      order moves forward is via QC / Pack & label / Export
                      bin / In transit, not a raw stage jump here. */}
                  {permissions.canOverrideOrderStage && (
                    <span className="hidden sm:block" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-col items-start gap-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <select
                            value={o.stage}
                            onChange={(e) => handleStageChange(o.id, e.target.value as OrderStage)}
                            className="rounded-lg border border-ink/10 bg-card px-1.5 py-1 text-xs text-ink outline-none focus:border-teal/50 focus:ring-2 focus:ring-teal/15"
                          >
                            {STAGE_ORDER.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>

                          {permissions.canReassignSite && (
                            <select
                              value={o.siteId}
                              onChange={(e) => reassignSite(o.id, e.target.value)}
                              title="Reassign site"
                              className="rounded-lg border border-ink/10 bg-card px-1.5 py-1 text-xs text-ink outline-none focus:border-teal/50 focus:ring-2 focus:ring-teal/15"
                            >
                              {sites.map((s) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                          )}

                          {permissions.canToggleDelayed && (
                            <button
                              type="button"
                              onClick={() => toggleDelayed(o.id)}
                              className="rounded-lg border border-ink/10 px-2 py-1 text-xs text-ink/60 hover:bg-ink/[0.04] hover:text-ink"
                            >
                              {o.delayed ? "Clear delay" : "Flag delayed"}
                            </button>
                          )}
                        </div>
                        {blockedReason && (
                          <p className="max-w-[220px] text-[11px] leading-snug text-rose-600">{blockedReason}</p>
                        )}
                      </div>
                    </span>
                  )}

                  <ChevronRight size={16} className="hidden flex-none text-ink/25 transition-colors group-hover:text-ink/50 sm:block" />

                  {/* mobile-only summary row, mirrors the Purchases card's collapsed layout */}
                  <span className="col-span-2 flex items-center justify-between gap-2 pl-13 sm:hidden">
                    <div className="flex items-center gap-1.5">
                      <Pill tone={STAGE_TONE[o.stage]}>{o.stage}</Pill>
                      {o.delayed && <DelayedDot compact />}
                    </div>
                    <span className="text-xs font-medium text-ink/60">₹{o.totalValue.toLocaleString("en-IN")}</span>
                  </span>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Same split as the Purchases queue: "nothing matches your filters"
 * (recoverable, offer to clear) vs. "you genuinely have no orders"
 * (a Warehouse account not yet assigned anything — no clear-filters CTA
 * makes sense there since there's nothing to clear).
 */
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
          <p className="text-sm font-semibold text-ink/70">No orders assigned to you yet</p>
          <p className="mt-1 max-w-xs text-xs text-ink/45">Check back once orders are routed to your site.</p>
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