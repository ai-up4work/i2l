// app/admin/orders/page.tsx
"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronRight, Flag, Inbox, MapPinned, MessageCircle, Package, Search, SearchX, X } from "lucide-react"

import { useAdminData, hoursSince, formatAge } from "@/contexts/AdminDataContext"
import type { Channel, Order, OrderStage } from "@/types/admin"
import { STAGE_ORDER, STAGE_AGE_THRESHOLD_HOURS, CHANNEL_LABEL } from "@/types/admin"
import type { StatusTone } from "@/components/admin/warehouse/status-pill"
import { AnimatedItemCardStack } from "@/components/admin/orders/AnimatedItemCardStack"

// Orders: every order across all three channels, independent of the warehouse
// queue. Each order is a card. Only problem orders (delayed, or over their
// stage's time limit) get a red edge, so the eye goes straight to them.
//
// Clicking a card (or the order number) opens the order. The override strip
// under a card is for staff who can change the stage, reassign the site or flag
// the order as delayed.

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

const SORT_OPTIONS: { key: SortMode; label: string }[] = [
  { key: "recent", label: "Newest first" },
  { key: "stuck", label: "Oldest in stage" },
]

function Pill({ tone, children }: { tone: StatusTone | "ink"; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${
        tone === "ink" ? INK_PILL : TONE_PILL[tone]
      }`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone === "ink" ? INK_DOT : TONE_DOT[tone]}`} aria-hidden />
      {children}
    </span>
  )
}

function AgeReadout({ label, hours, threshold }: { label: string; hours: number; threshold: number }) {
  const hasLimit = threshold !== Infinity
  const breach = hasLimit && hours > threshold
  const pct = hasLimit ? Math.min(100, (hours / threshold) * 100) : 0
  const barColor = breach ? "bg-rose-600" : pct > 70 ? "bg-gold-deep" : "bg-teal-deep"

  return (
    <div
      className="flex items-center gap-1.5"
      title={breach ? `${formatAge(hours)}, over the ${formatAge(threshold)} limit` : undefined}
    >
      <span className="text-xs text-ink/40">{label}</span>
      {hasLimit && (
        <div className="h-1.5 w-8 shrink-0 overflow-hidden rounded-full bg-ink/[0.06]" aria-hidden>
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      <span className={`whitespace-nowrap text-xs tabular-nums ${breach ? "font-semibold text-rose-700" : "text-ink/60"}`}>
        {formatAge(hours)}
      </span>
    </div>
  )
}

// Every distinct channel on this order, in channel order (1, 2, 3). Reads each
// item's own `channel` first and falls back to the order-level channel, so a
// mixed cart (catalogue item plus pasted link) shows both badges.
function orderChannels(o: Order): Channel[] {
  const set = new Set<Channel>(o.items.map((i) => i.channel ?? o.channel))
  return ([1, 2, 3] as Channel[]).filter((c) => set.has(c))
}

const inputClass =
  "rounded-lg border border-ink/10 bg-card px-2.5 py-1.5 text-sm text-ink outline-none transition-colors focus:border-teal/50 focus:ring-2 focus:ring-teal/15"
const labelClass = "text-xs font-medium text-ink/50"

export default function OrdersPage() {
  const router = useRouter()
  const { visibleOrders, sites, permissions, updateOrderStage, reassignSite, toggleDelayed, bulkFlagDelayed, purchases } =
    useAdminData()

  const qcFlaggedOrderIds = useMemo(
    () => new Set(purchases.filter((p) => p.qcStatus === "flagged").map((p) => p.orderId)),
    [purchases],
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
    // Both dates are local and inclusive: "to" runs to the end of that day.
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null
    const to = dateTo ? new Date(`${dateTo}T23:59:59.999`) : null
    const q = search.trim().toLowerCase()

    const rows = visibleOrders.filter((o) => {
      if (q && !o.id.toLowerCase().includes(q) && !o.customerName.toLowerCase().includes(q)) return false
      if (channelFilter !== "all" && o.channel !== channelFilter) return false
      if (stageFilter !== "all" && o.stage !== stageFilter) return false
      if (siteFilter !== "all" && o.siteId !== siteFilter) return false
      if (delayedOnly && !o.delayed) return false
      if (from && new Date(o.placedAt) < from) return false
      if (to && new Date(o.placedAt) > to) return false
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

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      <div className="mx-auto max-w-[1560px] px-6 pb-28 pt-10 lg:px-10">
        {/* ── Header ── */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-teal-deep text-parchment">
              <Package size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-display text-3xl font-semibold leading-tight">Orders</h1>
              <p className="mt-1 max-w-md text-sm leading-relaxed text-ink/60">
                Every order across all three channels, independent of the warehouse queue.
              </p>
            </div>
          </div>

          <dl className="flex divide-x divide-ink/10 overflow-x-auto rounded-2xl border border-ink/10 bg-card">
            <div className="px-5 py-3">
              <dt className="whitespace-nowrap text-xs font-medium text-ink/45">Orders</dt>
              <dd className="mt-0.5 font-display text-xl text-ink">{visibleOrders.length}</dd>
            </div>
            <div className="px-5 py-3">
              <dt className="whitespace-nowrap text-xs font-medium text-ink/45">Delayed</dt>
              <dd className={`mt-0.5 font-display text-xl ${delayedCount > 0 ? "text-rose-700" : "text-ink"}`}>{delayedCount}</dd>
            </div>
            <div className="px-5 py-3">
              <dt className="whitespace-nowrap text-xs font-medium text-ink/45">Over time limit</dt>
              <dd className={`mt-0.5 font-display text-xl ${breachCount > 0 ? "text-rose-700" : "text-ink"}`}>{breachCount}</dd>
            </div>
            <div className="px-5 py-3" title="Channel 3, not yet delivered">
              <dt className="whitespace-nowrap text-xs font-medium text-ink/45">Open manual quotes</dt>
              <dd className="mt-0.5 font-display text-xl text-ink">{manualQuoteCount}</dd>
            </div>
          </dl>
        </div>

        {/* ── Sort + search ── */}
        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div role="radiogroup" aria-label="Sort orders" className="flex flex-wrap gap-1 rounded-full border border-ink/10 bg-card p-1">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                role="radio"
                aria-checked={sortMode === opt.key}
                onClick={() => setSortMode(opt.key)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-teal/40 ${
                  sortMode === opt.key ? "bg-teal-deep text-parchment" : "text-ink/55 hover:text-ink/80"
                }`}
              >
                {opt.label}
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
              aria-label="Search order or customer"
              className="w-full rounded-full border border-ink/10 bg-card py-2.5 pl-9 pr-4 text-sm placeholder:text-ink/35 outline-none transition-colors focus:border-teal/50 focus:ring-2 focus:ring-teal/15"
            />
          </div>
        </div>

        {/* ── Filters ── */}
        <div className="mt-3 flex flex-wrap items-end gap-3 rounded-2xl border border-ink/10 bg-card p-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="orders-channel" className={labelClass}>Channel</label>
            <select
              id="orders-channel"
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value === "all" ? "all" : (Number(e.target.value) as Channel))}
              className={inputClass}
            >
              <option value="all">All channels</option>
              {([1, 2, 3] as Channel[]).map((c) => (
                <option key={c} value={c}>
                  Channel {c}: {CHANNEL_LABEL[c]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="orders-stage" className={labelClass}>Stage</label>
            <select
              id="orders-stage"
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
              <label htmlFor="orders-site" className={labelClass}>Site</label>
              <select id="orders-site" value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)} className={inputClass}>
                <option value="all">All sites</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label htmlFor="orders-from" className={labelClass}>Placed from</label>
            <input id="orders-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputClass} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="orders-to" className={labelClass}>Placed to</label>
            <input id="orders-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputClass} />
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

        <p className="mt-4 text-xs text-ink/45">
          {filtered.length} of {visibleOrders.length} orders shown
        </p>

        {/* ── Order cards ── */}
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
              const problem = o.delayed || breach
              const blockedReason = blockedReasons[o.id]
              const siteMenuOpen = openSiteMenuFor === o.id
              const itemCount = o.items.reduce((sum, i) => sum + i.quantity, 0)
              const channels = orderChannels(o)

              return (
                <div
                  key={o.id}
                  className="relative overflow-hidden rounded-2xl border border-ink/10 bg-card transition-colors hover:border-ink/20"
                >
                  {problem && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-rose-500" />}

                  <div
                    onClick={() => router.push(`/admin/orders/${o.id}`)}
                    className="flex cursor-pointer flex-col gap-4 p-4 sm:flex-row sm:items-center"
                  >
                    {permissions.canBulkFlag && (
                      <span className="flex-none self-start sm:self-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${o.id}`}
                          checked={selected.has(o.id)}
                          onChange={() => toggleSelect(o.id)}
                          className="h-4 w-4 rounded border-ink/20 text-teal-deep focus-visible:ring-2 focus-visible:ring-teal/40"
                        />
                      </span>
                    )}

                    <div className="h-20 w-full flex-none sm:w-32">
                      <AnimatedItemCardStack items={o.items} className="h-full" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/admin/orders/${o.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="rounded font-display text-sm font-semibold outline-none hover:text-teal-deep hover:underline focus-visible:ring-2 focus-visible:ring-teal/40"
                            >
                              {o.id}
                            </Link>
                            {qcFlaggedOrderIds.has(o.id) && (
                              <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
                                <Flag size={11} className="shrink-0" aria-hidden />
                                QC issue
                              </span>
                            )}
                            {o.delayed && <Pill tone="rose">Delayed</Pill>}
                            {o.hasUnrepliedMessage && (
                              <span
                                title="The customer's last message about this order hasn't been replied to yet"
                                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-gold/15 px-2.5 py-1 text-xs font-semibold text-gold-deep ring-1 ring-inset ring-gold/30"
                              >
                                <MessageCircle size={11} className="shrink-0 animate-pulse" aria-hidden />
                                Awaiting reply
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink/55">
                            <span className="truncate">{o.customerName}</span>
                            <span className="truncate">{siteName(o.siteId)}</span>
                          </p>
                        </div>
                        <Pill tone={STAGE_TONE[o.stage]}>{o.stage}</Pill>
                      </div>

                      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        {channels.map((ch) => (
                          <Pill key={ch} tone={CHANNEL_TONE[ch]}>
                            Ch. {ch}: {CHANNEL_LABEL[ch]}
                          </Pill>
                        ))}
                        <span className="text-xs text-ink/50">
                          {itemCount} item{itemCount === 1 ? "" : "s"}
                        </span>
                        <AgeReadout label="Placed" hours={orderAgeHours} threshold={Infinity} />
                        <AgeReadout label="In stage" hours={stageHours} threshold={STAGE_AGE_THRESHOLD_HOURS[o.stage]} />
                      </div>
                    </div>

                    <div className="flex flex-none items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-center sm:gap-1.5">
                      <span className="font-display text-base tabular-nums text-ink">Rs. {o.totalValue.toLocaleString("en-US")}</span>
                      <ChevronRight size={16} className="hidden text-ink/25 sm:block" aria-hidden />
                    </div>
                  </div>

                  {permissions.canOverrideOrderStage && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-ink/[0.06] bg-parchment/40 px-4 py-2">
                      <label htmlFor={`stage-${o.id}`} className="text-xs font-medium text-ink/45">
                        Override stage
                      </label>
                      <select
                        id={`stage-${o.id}`}
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
                            aria-label={`Reassign site, currently ${siteName(o.siteId)}`}
                            aria-expanded={siteMenuOpen}
                            onClick={() => setOpenSiteMenuFor(siteMenuOpen ? null : o.id)}
                            className={`grid h-[26px] w-[26px] place-items-center rounded-lg border outline-none transition-colors hover:bg-ink/[0.04] hover:text-ink focus-visible:ring-2 focus-visible:ring-teal/40 ${
                              siteMenuOpen ? "border-teal/50 bg-teal/[0.08] text-teal-deep" : "border-ink/10 text-ink/55"
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
                          aria-label={o.delayed ? "Clear delayed flag" : "Flag as delayed"}
                          aria-pressed={o.delayed}
                          className={`grid h-[26px] w-[26px] place-items-center rounded-lg border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-teal/40 ${
                            o.delayed
                              ? "border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
                              : "border-ink/10 text-ink/45 hover:bg-ink/[0.04] hover:text-ink"
                          }`}
                        >
                          <Flag size={12} fill={o.delayed ? "currentColor" : "none"} />
                        </button>
                      )}

                      {blockedReason && (
                        <p role="alert" className="w-full text-xs leading-snug text-rose-700 sm:w-auto">
                          {blockedReason}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* ── Selection bar (sticks to the bottom while orders are ticked) ── */}
        {permissions.canBulkFlag && selected.size > 0 && (
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
                onClick={() => {
                  bulkFlagDelayed(Array.from(selected))
                  setSelected(new Set())
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-parchment px-3.5 py-2 text-xs font-semibold text-ink outline-none transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-parchment/50"
              >
                <Flag size={14} />
                Flag for review
              </button>
            </div>
          </div>
        )}
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
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-ink/10 bg-card px-4 py-16 text-center">
        <Inbox size={22} className="text-ink/25" />
        <div>
          <p className="text-sm font-semibold text-ink/70">No orders assigned to you yet</p>
          <p className="mt-1 max-w-xs text-xs text-ink/50">Check back once orders are routed to your site.</p>
        </div>
      </div>
    )
  }

  if (hasAnyFilter) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-ink/10 bg-card px-4 py-16 text-center">
        <SearchX size={22} className="text-ink/25" />
        <div>
          <p className="text-sm font-semibold text-ink/70">No orders match these filters</p>
          <p className="mt-1 text-xs text-ink/50">Try a different search or loosen the filters.</p>
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