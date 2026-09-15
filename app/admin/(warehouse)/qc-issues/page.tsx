"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, ChevronRight, History, Inbox, RotateCcw } from "lucide-react"

import { fetchOpenQcIssuesWithContext, type QcIssueWithContext } from "@/lib/supabase/qc-issues"

const ISSUE_TYPE_LABEL: Record<string, string> = {
  faulty_unit: "Faulty unit",
  inventory_rejected: "Inventory rejected",
  customer_declined: "Customer declined",
}

const RESOLUTION_LABEL: Record<string, string> = {
  coupon_issued: "Coupon issued",
  shipped_as_is: "Shipped as-is",
  replacement_resolved: "Replacement passed QC",
}

function timeAgo(iso: string): string {
  const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000
  if (hours < 1) return "<1h ago"
  if (hours < 24) return `${Math.floor(hours)}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function IssueRow({ issue, tone, trailing }: { issue: QcIssueWithContext; tone: "rose" | "gold" | "teal"; trailing?: string }) {
  const hoverClass = tone === "rose" ? "hover:bg-rose-50/40" : tone === "gold" ? "hover:bg-gold/[0.06]" : "hover:bg-teal/[0.05]"
  const typeChipClass =
    tone === "rose"
      ? "bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-200"
      : tone === "gold"
        ? "bg-gold/15 text-gold-deep ring-1 ring-inset ring-gold/30"
        : "bg-teal/10 text-teal-deep ring-1 ring-inset ring-teal/25"
  return (
    <Link
      href={`/admin/qc-issues/${issue.id}`}
      className={`flex items-center gap-4 border-b border-ink/[0.06] px-5 py-4 transition-colors last:border-b-0 ${hoverClass}`}
    >
      {issue.itemImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={issue.itemImage} alt="" className="h-12 w-12 flex-none rounded-lg object-cover" />
      ) : (
        <div className="h-12 w-12 flex-none rounded-lg bg-parchment" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold text-ink">{issue.orderDisplayId}</span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${typeChipClass}`}>
            {ISSUE_TYPE_LABEL[issue.issueType] ?? issue.issueType}
          </span>
          {trailing && (
            <span className="rounded-full bg-ink/[0.04] px-2 py-0.5 text-[11px] font-medium text-ink/50 ring-1 ring-inset ring-ink/10">
              {trailing}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-sm text-ink/70">{issue.itemTitle}</p>
        <p className="truncate text-xs text-ink/45">{issue.customerName}</p>
      </div>
      <span className="hidden flex-none text-xs text-ink/40 sm:block">{timeAgo(issue.createdAt)}</span>
      <ChevronRight size={16} className="flex-none text-ink/25" />
    </Link>
  )
}

// QC Issues — items flagged faulty during Quality Check.
//
// Three sections:
//   - Needs a decision (resolution: pending) — nobody has decided what
//     to do about this yet.
//   - Awaiting replacement (resolution: retry_same) — ops chose "retry
//     with a new unit"; the item is back on the Purchases queue or
//     already re-bought and sitting in QC again. A row here moves
//     itself to Resolved below the moment /admin/qc/[id]'s save()
//     records a "passed" verdict for it — that's what calls
//     closeRetryIssue, which is what actually removes it from THIS
//     query (resolution changes to 'replacement_resolved', which this
//     section's fetch no longer matches). Nothing here does that
//     filtering client-side anymore.
//   - Resolved (collapsed by default) — coupon_issued, shipped_as_is,
//     and replacement_resolved rows. Nothing here ever gets deleted —
//     this section exists specifically so a fully-resolved issue stays
//     visible for analytics/future reference (which order, which
//     product, how it got resolved) instead of just quietly existing
//     in the database with no UI pointing at it.
//
// Created automatically the moment a QC line is flagged (see
// app/admin/(warehouse)/qc/[id]/page.tsx's save()); resolved here by
// recording whether WishDrop got a real refund from the seller, then
// either issuing a compensation coupon, shipping the item as-is, or
// retrying with a new unit — see lib/supabase/qc-issues.ts for the full
// reasoning.
export default function QcIssuesPage() {
  const [needsDecision, setNeedsDecision] = useState<QcIssueWithContext[]>([])
  const [awaitingReplacement, setAwaitingReplacement] = useState<QcIssueWithContext[]>([])
  const [resolved, setResolved] = useState<QcIssueWithContext[]>([])
  const [loading, setLoading] = useState(true)
  const [showResolved, setShowResolved] = useState(false)

  useEffect(() => {
    Promise.all([
      fetchOpenQcIssuesWithContext(["pending"]),
      fetchOpenQcIssuesWithContext(["retry_same"]),
      fetchOpenQcIssuesWithContext(["coupon_issued", "shipped_as_is", "replacement_resolved"]),
    ]).then(([pending, retrying, done]) => {
      setNeedsDecision(pending)
      setAwaitingReplacement(retrying)
      setResolved(done)
      setLoading(false)
    })
  }, [])

  const activeCount = needsDecision.length + awaitingReplacement.length

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      <div className="mx-auto max-w-6xl px-6 pb-24 pt-10 lg:px-10">
        <div className="flex items-start gap-4">
          <div className="grid h-14 w-14 flex-none place-items-center rounded-2xl border border-ink/10 bg-white text-rose-600 shadow-[0_1px_2px_rgba(32,36,43,0.04),0_16px_40px_-24px_rgba(220,38,38,0.35)]">
            <AlertTriangle size={22} strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="font-display text-3xl font-semibold text-ink">QC Issues</h1>
            <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink/60">
              Faulty items awaiting resolution — decide whether the seller refunded us, then compensate the
              customer or ship as-is. Retried items stay listed until their replacement actually clears QC.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="mt-8 flex flex-col gap-3 rounded-2xl border border-ink/10 bg-white p-5">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-ink/[0.04]" />
            ))}
          </div>
        ) : (
          <>
            {activeCount === 0 && (
              <div className="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-ink/10 bg-white px-4 py-16 text-center">
                <Inbox size={22} className="text-ink/25" />
                <p className="text-sm font-semibold text-ink/70">Nothing waiting on resolution</p>
                <p className="max-w-xs text-xs text-ink/45">
                  Items show up here the moment they're flagged faulty during Quality Check.
                </p>
              </div>
            )}

            {needsDecision.length > 0 && (
              <div className="mt-8">
                <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink/40">
                  <AlertTriangle size={13} /> Needs a decision ({needsDecision.length})
                </h2>
                <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white">
                  {needsDecision.map((issue) => (
                    <IssueRow key={issue.id} issue={issue} tone="rose" />
                  ))}
                </div>
              </div>
            )}

            {awaitingReplacement.length > 0 && (
              <div className="mt-8">
                <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink/40">
                  <RotateCcw size={13} /> Awaiting replacement ({awaitingReplacement.length})
                </h2>
                <div className="overflow-hidden rounded-2xl border border-gold/25 bg-white">
                  {awaitingReplacement.map((issue) => (
                    <IssueRow key={issue.id} issue={issue} tone="gold" />
                  ))}
                </div>
              </div>
            )}

            {resolved.length > 0 && (
              <div className="mt-8">
                <button
                  type="button"
                  onClick={() => setShowResolved((v) => !v)}
                  className="mb-3 flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink/40 hover:text-ink/60"
                >
                  <History size={13} />
                  Resolved ({resolved.length})
                  <ChevronRight size={12} className={`transition-transform ${showResolved ? "rotate-90" : ""}`} />
                </button>
                {showResolved && (
                  <div className="overflow-hidden rounded-2xl border border-teal/20 bg-white">
                    {resolved.map((issue) => (
                      <IssueRow key={issue.id} issue={issue} tone="teal" trailing={RESOLUTION_LABEL[issue.resolution] ?? issue.resolution} />
                    ))}
                  </div>
                )}
                {!showResolved && (
                  <p className="text-xs text-ink/40">
                    Kept for reference — which orders and products had quality issues, and how each was resolved.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}