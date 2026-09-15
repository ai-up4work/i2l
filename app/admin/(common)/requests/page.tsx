// app/admin/(common)/requests/page.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, ChevronRight, Inbox, Ruler, Search, SearchX } from "lucide-react"

import { useAdminData } from "@/contexts/AdminDataContext"
import { REQUEST_SLA_HOURS, REQUEST_STATUS_LABEL, type RequestStatus } from "@/types/admin"
import { RequestSourceMark } from "@/components/admin/requests/RequestSourceMark"

// Requests — Channel 3 manual-review queue. Restyled (2026-09) to match
// the card language /admin/orders moved to: a left-edge status accent,
// a fixed-size visual anchor, and a flexible info row instead of a grid
// table. The anchor here is RequestSourceMark rather than
// OrderItemImageStack — a request has no item photo yet, just a link a
// human hasn't opened, so the card leans on a domain monogram instead.
//
// A Request is items: RequestItemAsk[] (own link/note/quote per item),
// not a single link/quote pair — so the card uses the first item's
// domain for the mark (with a count badge for multi-item requests) and
// allItemsQuoted/totalQuote for pricing, falling back to a "partially
// quoted" state when only some items have a quote set.

type StatusFilter = "all" | "open" | RequestStatus

const STATUS_TONE: Record<RequestStatus, { pill: string; dot: string; accent: string }> = {
  sent_for_review: { pill: "bg-ink/[0.04] text-ink/60 ring-1 ring-inset ring-ink/10", dot: "bg-ink/30", accent: "border-l-ink/15" },
  quoted: { pill: "bg-teal/12 text-teal-deep ring-1 ring-inset ring-teal/25", dot: "bg-teal-deep", accent: "border-l-teal-deep" },
  confirmed: { pill: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200", dot: "bg-emerald-600", accent: "border-l-emerald-500" },
  declined: { pill: "bg-ink/[0.03] text-ink/35 ring-1 ring-inset ring-ink/10", dot: "bg-ink/20", accent: "border-l-ink/10" },
}

function Pill({ status }: { status: RequestStatus }) {
  const tone = STATUS_TONE[status]
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${tone.pill}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
      {REQUEST_STATUS_LABEL[status]}
    </span>
  )
}

// Visible while scanning the queue, not just after opening a request —
// this item's price came from a scrape that never had a chance to check
// for a size/color picker (see Draft.needsVariantConfirmation's doc
// comment in components/dashboard/types.ts), so it needs confirming
// with the customer before this gets quoted/confirmed as a real order.
function VariantConfirmPill() {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-gold/15 px-2.5 py-1 text-xs font-semibold text-gold-deep ring-1 ring-inset ring-gold/30">
      <Ruler size={11} />
      Confirm variant
    </span>
  )
}

function SlaPill() {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
      <AlertTriangle size={11} />
      Past SLA
    </span>
  )
}

function StatCard({ label, value, tone = "default" }: { label: string; value: string | number; tone?: "default" | "warning" }) {
  return (
    <div className={`rounded-2xl border p-5 ${tone === "warning" ? "border-rose-100 bg-rose-50/40" : "border-ink/10 bg-card"}`}>
      <p className="text-xs font-medium text-ink/45">{label}</p>
      <p className={`mt-1 font-display text-2xl ${tone === "warning" ? "text-rose-700" : "text-ink"}`}>{value}</p>
    </div>
  )
}

export default function RequestsPage() {
  const router = useRouter()
  const { currentUser, requestLines } = useAdminData()
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open")

  useEffect(() => {
    if (currentUser.role === "warehouse") router.replace("/admin/dashboard")
  }, [currentUser.role, router])

  const filtered = useMemo(() => {
    return requestLines
      .filter((r) => {
        const q = search.trim().toLowerCase()
        if (!q) return true
        return (
          r.customerName.toLowerCase().includes(q) ||
          r.items.some((i) => i.sourceDomain.toLowerCase().includes(q)) ||
          r.id.toLowerCase().includes(q)
        )
      })
      .filter((r) => {
        if (statusFilter === "all") return true
        if (statusFilter === "open") return r.status === "sent_for_review" || r.status === "quoted"
        return r.status === statusFilter
      })
      .sort((a, b) => {
        // Breached-first, then oldest-first within the same breach state.
        if (a.slaBreached !== b.slaBreached) return a.slaBreached ? -1 : 1
        return b.ageHours - a.ageHours
      })
  }, [requestLines, search, statusFilter])

  const openCount = requestLines.filter((r) => r.status === "sent_for_review" || r.status === "quoted").length
  const breachedCount = requestLines.filter((r) => r.slaBreached).length
  const hasActiveFilters = search.trim() !== "" || statusFilter !== "open"

  if (currentUser.role === "warehouse") return null

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      <div className="mx-auto max-w-[1560px] px-6 pb-20 pt-10 lg:px-10">
        {/* ── Header ── */}
        <div className="flex items-start gap-4">
          <div className="grid h-14 w-14 flex-none place-items-center rounded-2xl border border-ink/10 bg-card text-teal-deep shadow-[0_1px_2px_rgba(32,36,43,0.04),0_16px_40px_-24px_rgba(14,140,156,0.4)]">
            <Inbox size={22} strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="font-display text-3xl text-ink">Requests</h1>
            <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink/60">
              Channel 3 links the scraper couldn&rsquo;t parse — quote, confirm, or decline each one
              through to a priced order.
            </p>
          </div>
        </div>

        {/* ── Stat strip ── */}
        <div className="mt-9 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Open requests" value={openCount} />
          <StatCard label="Past SLA" value={breachedCount} tone={breachedCount > 0 ? "warning" : "default"} />
          <StatCard label="SLA window" value={`${REQUEST_SLA_HOURS}h`} />
          <StatCard label="Total in queue" value={requestLines.length} />
        </div>

        {/* ── Filters ── */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1 rounded-full border border-ink/10 bg-card p-1">
            {(["open", "all", "sent_for_review", "quoted", "confirmed", "declined"] as StatusFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setStatusFilter(f)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal ${
                  statusFilter === f
                    ? "bg-teal-deep text-parchment shadow-[0_6px_18px_-8px_rgba(14,140,156,0.5)]"
                    : "text-ink/55 hover:text-ink/80"
                }`}
              >
                {f === "all" ? "All" : f === "open" ? "Open" : REQUEST_STATUS_LABEL[f]}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/35" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer, domain, ID"
              className="w-full rounded-full border border-ink/10 bg-card py-2.5 pl-9 pr-4 text-sm text-ink placeholder:text-ink/35 outline-none transition-colors focus:border-teal/50 focus:ring-2 focus:ring-teal/15"
            />
          </div>
        </div>

        {/* ── Result count ── */}
        <p className="mt-4 text-xs font-medium text-ink/40">
          {filtered.length} of {requestLines.length} requests
        </p>

        {/* ── Card list ── */}
        <div className="mt-3 space-y-3">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-ink/15 bg-card px-4 py-16 text-center">
              <SearchX size={22} className="text-ink/25" />
              <div>
                <p className="text-sm font-semibold text-ink/70">Nothing matches this filter</p>
                <p className="mt-1 text-xs text-ink/45">Try a different search term or status.</p>
              </div>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("")
                    setStatusFilter("open")
                  }}
                  className="mt-1 text-xs font-semibold text-teal-deep underline decoration-dotted underline-offset-4 hover:text-teal"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            filtered.map((r) => {
              const accent = r.slaBreached ? "border-l-rose-500" : STATUS_TONE[r.status].accent
              const primaryDomain = r.items[0]?.sourceDomain ?? ""
              const someQuoted = r.items.some((i) => i.quote !== undefined)
              // Set by confirmRequest in DashboardContext.tsx when the
              // scrape that produced this item's draft was ogOnly (see
              // Draft.needsVariantConfirmation's doc comment) — the item
              // may come in sizes/colors that were never confirmed with
              // the customer. Checked via the note prefix rather than a
              // dedicated column since this table has no such column yet
              // — see that same doc comment for the reasoning.
              const needsVariantConfirmation = r.items.some((i) => i.note?.startsWith("[Confirm size/color with customer]"))

              return (
                <div
                  key={r.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/admin/requests/${r.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") router.push(`/admin/requests/${r.id}`)
                  }}
                  className={`flex cursor-pointer flex-col gap-4 overflow-hidden rounded-2xl border border-ink/10 border-l-4 bg-card p-4 outline-none transition-colors hover:border-ink/20 focus-visible:bg-teal/[0.06] sm:flex-row sm:items-center ${accent}`}
                >
                  <div className="h-20 w-20 flex-none">
                    <RequestSourceMark
                      domain={primaryDomain}
                      screenshotUrl={r.items[0]?.screenshotUrl}
                      itemCount={r.items.length}
                      breached={r.slaBreached}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-display text-sm font-semibold text-ink">{r.customerName}</span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-ink/55">
                          {r.id} <span className="text-ink/25">·</span>{" "}
                          <span className="font-mono">{primaryDomain}</span>
                          {r.items.length > 1 && <span className="text-ink/40"> +{r.items.length - 1} more</span>}
                        </p>
                      </div>
                      <Pill status={r.status} />
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      {r.slaBreached && <SlaPill />}
                      {needsVariantConfirmation && <VariantConfirmPill />}
                      <span className="text-xs text-ink/45">{r.ageLabel}</span>
                      <span className="text-xs text-ink/45">
                        Assigned to <span className="text-ink/70">{r.assignedStaffName}</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-none items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-center sm:gap-1.5">
                    <span className="font-display text-base text-ink">
                      {r.allItemsQuoted && r.totalQuote !== undefined
                        ? `Rs. ${r.totalQuote.toLocaleString()}`
                        : someQuoted
                        ? "Partially quoted"
                        : "No quote yet"}
                    </span>
                    <ChevronRight size={16} className="hidden text-ink/25 sm:block" />
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}