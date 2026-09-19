// app/admin/(common)/requests/page.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertTriangle, ChevronRight, Inbox, Ruler, Search, SearchX } from "lucide-react"

import { useAdminData } from "@/contexts/AdminDataContext"
import { REQUEST_SLA_HOURS, REQUEST_STATUS_LABEL, type RequestStatus } from "@/types/admin"
import { RequestSourceMark } from "@/components/admin/requests/RequestSourceMark"

// Requests: the Channel 3 manual-review queue. Each request is a card, in the
// same style as /admin/orders. The visual anchor is RequestSourceMark rather
// than an item photo, because a request has no photo yet, just a link a human
// hasn't opened. Only requests past their SLA get a red edge.
//
// A Request is items: RequestItemAsk[] (each with its own link, note and
// quote), so the card uses the first item's domain for the mark (with a count
// badge for multi-item requests) and allItemsQuoted / totalQuote for pricing,
// falling back to "Partially quoted" when only some items have a quote.
//
// Clicking a card (or the customer name) opens the request.

type StatusFilter = "all" | "open" | RequestStatus

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "all", label: "All" },
  { key: "sent_for_review", label: REQUEST_STATUS_LABEL.sent_for_review },
  { key: "quoted", label: REQUEST_STATUS_LABEL.quoted },
  { key: "confirmed", label: REQUEST_STATUS_LABEL.confirmed },
  { key: "declined", label: REQUEST_STATUS_LABEL.declined },
]

const STATUS_TONE: Record<RequestStatus, { pill: string; dot: string }> = {
  sent_for_review: { pill: "bg-ink/[0.04] text-ink/60 ring-1 ring-inset ring-ink/10", dot: "bg-ink/30" },
  quoted: { pill: "bg-teal/12 text-teal-deep ring-1 ring-inset ring-teal/25", dot: "bg-teal-deep" },
  confirmed: { pill: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200", dot: "bg-emerald-600" },
  declined: { pill: "bg-ink/[0.03] text-ink/40 ring-1 ring-inset ring-ink/10", dot: "bg-ink/20" },
}

const isOpen = (status: RequestStatus) => status === "sent_for_review" || status === "quoted"
const inFilter = (status: RequestStatus, f: StatusFilter) =>
  f === "all" ? true : f === "open" ? isOpen(status) : status === f

function StatusPill({ status }: { status: RequestStatus }) {
  const tone = STATUS_TONE[status]
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${tone.pill}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
      {REQUEST_STATUS_LABEL[status]}
    </span>
  )
}

export default function RequestsPage() {
  const router = useRouter()
  const { role, requestLines } = useAdminData()
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open")

  useEffect(() => {
    // Effective `role`, not currentUser.role. Otherwise "Preview as Warehouse"
    // (see RolePreviewMenu.tsx) would still show Requests, since a real
    // super_admin's currentUser.role is never "warehouse" whatever is previewed.
    if (role === "warehouse") router.replace("/admin/dashboard")
  }, [role, router])

  // Search scopes everything, including the tab counts, so a count always
  // matches what the tab would show.
  const searched = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return requestLines
    return requestLines.filter(
      (r) =>
        r.customerName.toLowerCase().includes(q) ||
        r.items.some((i) => i.sourceDomain.toLowerCase().includes(q)) ||
        r.displayId.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q),
    )
  }, [requestLines, search])

  const counts = useMemo(() => {
    const base = {} as Record<StatusFilter, number>
    for (const f of FILTERS) base[f.key] = searched.filter((r) => inFilter(r.status, f.key)).length
    return base
  }, [searched])

  const filtered = useMemo(
    () =>
      searched
        .filter((r) => inFilter(r.status, statusFilter))
        .sort((a, b) => {
          // Past-SLA first, then oldest first within the same state.
          if (a.slaBreached !== b.slaBreached) return a.slaBreached ? -1 : 1
          return b.ageHours - a.ageHours
        }),
    [searched, statusFilter],
  )

  const openCount = requestLines.filter((r) => isOpen(r.status)).length
  const breachedCount = requestLines.filter((r) => r.slaBreached).length
  const hasSearch = search.trim() !== ""

  if (role === "warehouse") return null

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      <div className="mx-auto max-w-[1560px] px-6 pb-20 pt-10 lg:px-10">
        {/* ── Header ── */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-teal-deep text-parchment">
              <Inbox size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-display text-3xl font-semibold leading-tight">Requests</h1>
              <p className="mt-1 max-w-md text-sm leading-relaxed text-ink/60">
                Channel 3 links the scraper couldn&rsquo;t parse. Quote, confirm or decline each one. Requests past the{" "}
                {REQUEST_SLA_HOURS}h SLA come first.
              </p>
            </div>
          </div>

          <dl className="flex divide-x divide-ink/10 overflow-x-auto rounded-2xl border border-ink/10 bg-card">
            <div className="px-5 py-3">
              <dt className="whitespace-nowrap text-xs font-medium text-ink/45">Open requests</dt>
              <dd className="mt-0.5 font-display text-xl text-ink">{openCount}</dd>
            </div>
            <div className="px-5 py-3">
              <dt className="whitespace-nowrap text-xs font-medium text-ink/45">Past SLA</dt>
              <dd className={`mt-0.5 font-display text-xl ${breachedCount > 0 ? "text-rose-700" : "text-ink"}`}>{breachedCount}</dd>
            </div>
            <div className="px-5 py-3">
              <dt className="whitespace-nowrap text-xs font-medium text-ink/45">In queue</dt>
              <dd className="mt-0.5 font-display text-xl text-ink">{requestLines.length}</dd>
            </div>
          </dl>
        </div>

        {/* ── Filters ── */}
        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div role="tablist" aria-label="Filter by status" className="flex flex-wrap gap-1 rounded-full border border-ink/10 bg-card p-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={statusFilter === f.key}
                onClick={() => setStatusFilter(f.key)}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-teal/40 ${
                  statusFilter === f.key ? "bg-teal-deep text-parchment" : "text-ink/55 hover:text-ink/80"
                }`}
              >
                {f.label}
                <span className={statusFilter === f.key ? "text-parchment/70" : "text-ink/35"}>{counts[f.key]}</span>
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
              aria-label="Search customer, domain or request ID"
              className="w-full rounded-full border border-ink/10 bg-card py-2.5 pl-9 pr-4 text-sm placeholder:text-ink/35 outline-none transition-colors focus:border-teal/50 focus:ring-2 focus:ring-teal/15"
            />
          </div>
        </div>

        {/* ── Result count ── */}
        <p className="mt-4 text-xs text-ink/45">
          {filtered.length} of {requestLines.length} requests shown
          {hasSearch && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="ml-2 font-semibold text-teal-deep underline decoration-dotted underline-offset-4 hover:text-teal"
            >
              Clear search
            </button>
          )}
        </p>

        {/* ── Request cards ── */}
        <div className="mt-3 space-y-3">
          {filtered.length === 0 ? (
            <EmptyState
              hasSearch={hasSearch}
              filterLabel={FILTERS.find((f) => f.key === statusFilter)?.label ?? ""}
              filterIsAll={statusFilter === "all"}
              queueIsEmpty={requestLines.length === 0}
              onClearSearch={() => setSearch("")}
              onShowAll={() => setStatusFilter("all")}
            />
          ) : (
            filtered.map((r) => {
              const primaryDomain = r.items[0]?.sourceDomain ?? ""
              const someQuoted = r.items.some((i) => i.quote !== undefined)
              const isPriced = r.allItemsQuoted && r.totalQuote !== undefined
              // Set at request creation (confirmRequest in DashboardContext.tsx)
              // when the scrape behind this item's draft was ogOnly, meaning the
              // size or colour options were never checked with the customer.
              // Hides itself once confirmedVariant is set, i.e. once resolved.
              const needsVariantConfirmation = r.items.some((i) => i.needsVariantConfirmation && !i.confirmedVariant)

              return (
                <div
                  key={r.id}
                  onClick={() => router.push(`/admin/requests/${r.id}`)}
                  className="relative flex cursor-pointer flex-col gap-4 overflow-hidden rounded-2xl border border-ink/10 bg-card p-4 transition-colors hover:border-ink/20 sm:flex-row sm:items-center"
                >
                  {r.slaBreached && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-rose-500" />}

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
                        <Link
                          href={`/admin/requests/${r.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded font-display text-sm font-semibold outline-none hover:text-teal-deep hover:underline focus-visible:ring-2 focus-visible:ring-teal/40"
                        >
                          {r.customerName}
                        </Link>
                        <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink/55">
                          <span>{r.displayId}</span>
                          <span className="min-w-0 truncate">
                            <span className="font-mono">{primaryDomain}</span>
                            {r.items.length > 1 && <span className="text-ink/45"> +{r.items.length - 1} more</span>}
                          </span>
                        </p>
                      </div>
                      <StatusPill status={r.status} />
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      {r.slaBreached && (
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
                          <AlertTriangle size={11} aria-hidden />
                          Past SLA
                        </span>
                      )}
                      {needsVariantConfirmation && (
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-gold/15 px-2.5 py-1 text-xs font-semibold text-gold-deep ring-1 ring-inset ring-gold/30">
                          <Ruler size={11} aria-hidden />
                          Confirm variant
                        </span>
                      )}
                      <span className="text-xs tabular-nums text-ink/50">{r.ageLabel}</span>
                      <span className="text-xs text-ink/50">
                        Assigned to <span className="text-ink/75">{r.assignedStaffName}</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-none items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-center sm:gap-1.5">
                    <span className={isPriced ? "font-display text-base tabular-nums text-ink" : "text-sm text-ink/50"}>
                      {isPriced ? `Rs. ${r.totalQuote!.toLocaleString()}` : someQuoted ? "Partially quoted" : "No quote yet"}
                    </span>
                    <ChevronRight size={16} className="hidden text-ink/25 sm:block" aria-hidden />
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

function EmptyState({
  hasSearch,
  filterLabel,
  filterIsAll,
  queueIsEmpty,
  onClearSearch,
  onShowAll,
}: {
  hasSearch: boolean
  filterLabel: string
  filterIsAll: boolean
  queueIsEmpty: boolean
  onClearSearch: () => void
  onShowAll: () => void
}) {
  const shell = "flex flex-col items-center gap-3 rounded-2xl border border-ink/10 bg-card px-4 py-16 text-center"
  const linkButton =
    "text-xs font-semibold text-teal-deep underline decoration-dotted underline-offset-4 hover:text-teal"

  if (hasSearch) {
    return (
      <div className={shell}>
        <SearchX size={22} className="text-ink/25" />
        <div>
          <p className="text-sm font-semibold text-ink/70">No requests match this search</p>
          <p className="mt-1 text-xs text-ink/50">Check the customer name, domain or request ID.</p>
        </div>
        <button type="button" onClick={onClearSearch} className={linkButton}>
          Clear search
        </button>
      </div>
    )
  }

  // The default tab is "Open", so an empty tab is not the same as an empty queue.
  if (!queueIsEmpty && !filterIsAll) {
    return (
      <div className={shell}>
        <Inbox size={22} className="text-ink/25" />
        <div>
          <p className="text-sm font-semibold text-ink/70">No requests in &ldquo;{filterLabel}&rdquo;</p>
          <p className="mt-1 text-xs text-ink/50">Other requests are in the queue under a different status.</p>
        </div>
        <button type="button" onClick={onShowAll} className={linkButton}>
          Show all requests
        </button>
      </div>
    )
  }

  return (
    <div className={shell}>
      <Inbox size={22} className="text-ink/25" />
      <div>
        <p className="text-sm font-semibold text-ink/70">No requests yet</p>
        <p className="mt-1 max-w-xs text-xs text-ink/50">
          Requests appear here when a customer sends a link the scraper couldn&rsquo;t parse.
        </p>
      </div>
    </div>
  )
}