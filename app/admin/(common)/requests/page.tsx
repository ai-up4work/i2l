// app/admin/(common)/requests/page.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, Inbox, Search } from "lucide-react"

import { useAdminData } from "@/contexts/AdminDataContext"
import { REQUEST_SLA_HOURS, REQUEST_STATUS_LABEL, type RequestStatus } from "@/types/admin"
import { panelClass } from "@/components/admin/seller/shared"

// Queue of incoming Channel 3 (unscrapeable-link) requests — the
// manual-review funnel. Manager + Sales & Purchase only; Warehouse
// never reaches this page (per spec, requests aren't a warehouse
// concern), so it bounces back through the role-based redirector the
// same way the Sales dashboard does for a non-Sales visitor.

const STATUS_STYLE: Record<RequestStatus, string> = {
  sent_for_review: "bg-ink/8 text-ink/70",
  quoted: "bg-teal-deep/15 text-teal-deep",
  confirmed: "bg-emerald-600/15 text-emerald-700",
  declined: "bg-ink/5 text-ink/35",
}

type StatusFilter = "all" | "open" | RequestStatus

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
          r.sourceDomain.toLowerCase().includes(q) ||
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

  if (currentUser.role === "warehouse") return null

  return (
    <div className="mx-auto max-w-6xl px-6 pb-20 pt-8 lg:px-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-3xl text-ink">Requests</h1>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink/60">
            Channel 3 links the scraper couldn&rsquo;t parse — quote, confirm, or decline each one
            through to a priced order.
          </p>
        </div>
        <div className="flex gap-3">
          <div className="rounded-xl border border-ink/10 bg-card px-4 py-2.5 text-center">
            <p className="text-xl font-semibold text-ink">{openCount}</p>
            <p className="text-[11px] text-ink/50">open</p>
          </div>
          <div
            className={`rounded-xl border px-4 py-2.5 text-center ${
              breachedCount > 0 ? "border-red-600/25 bg-red-600/5" : "border-ink/10 bg-card"
            }`}
          >
            <p className={`text-xl font-semibold ${breachedCount > 0 ? "text-red-700" : "text-ink"}`}>
              {breachedCount}
            </p>
            <p className={`text-[11px] ${breachedCount > 0 ? "text-red-700/70" : "text-ink/50"}`}>
              past {REQUEST_SLA_HOURS}h SLA
            </p>
          </div>
        </div>
      </header>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {(["open", "all", "sent_for_review", "quoted", "confirmed", "declined"] as StatusFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setStatusFilter(f)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                statusFilter === f ? "bg-ink text-white" : "bg-ink/5 text-ink/60 hover:bg-ink/10"
              }`}
            >
              {f === "all" ? "All" : f === "open" ? "Open" : REQUEST_STATUS_LABEL[f]}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-56">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer, domain, ID"
            className="w-full rounded-lg border border-ink/15 bg-white py-1.5 pl-8 pr-3 text-sm text-ink outline-none focus:border-teal/50"
          />
        </div>
      </div>

      <div className={`mt-4 overflow-hidden ${panelClass}`}>
        <div className="hidden grid-cols-[1.3fr_1.6fr_0.9fr_0.8fr_0.9fr_1fr] gap-2 border-b border-ink/10 px-4 py-2.5 text-xs font-semibold text-ink/45 sm:grid">
          <span>Customer</span>
          <span>Source</span>
          <span>Status</span>
          <span className="text-right">Quote</span>
          <span>Age</span>
          <span>Assigned to</span>
        </div>

        {filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
            <Inbox size={20} className="text-ink/25" />
            <p className="text-sm text-ink/45">No requests match this filter.</p>
          </div>
        )}

        {filtered.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => router.push(`/admin/requests/${r.id}`)}
            className="grid w-full grid-cols-2 items-center gap-2 border-b border-ink/10 px-4 py-3.5 text-left transition-colors last:border-b-0 hover:bg-parchment/60 sm:grid-cols-[1.3fr_1.6fr_0.9fr_0.8fr_0.9fr_1fr]"
          >
            <div className="col-span-2 sm:col-span-1">
              <p className="truncate text-sm font-semibold text-ink">{r.customerName}</p>
              <p className="text-xs text-ink/45">{r.id}</p>
            </div>

            <div className="col-span-2 flex items-center gap-1.5 sm:col-span-1">
              <span className="truncate font-mono text-xs text-ink/70">{r.sourceDomain}</span>
              {r.slaBreached && (
                <span className="flex flex-none items-center gap-1 rounded-full bg-red-600/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700">
                  <AlertTriangle size={10} /> SLA
                </span>
              )}
            </div>

            <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[r.status]}`}>
              {REQUEST_STATUS_LABEL[r.status]}
            </span>

            <span className="hidden text-right text-sm text-ink/70 sm:block">
              {r.quote !== undefined ? `Rs. ${r.quote.toLocaleString()}` : "—"}
            </span>

            <span className="hidden text-xs text-ink/50 sm:block">{r.ageLabel}</span>

            <span className="hidden truncate text-xs text-ink/60 sm:block">{r.assignedStaffName}</span>
          </button>
        ))}
      </div>
    </div>
  )
}