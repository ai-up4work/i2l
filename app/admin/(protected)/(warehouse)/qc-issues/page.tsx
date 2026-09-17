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
  if (hours < 1) return "Just now"
  if (hours < 24) return `${Math.floor(hours)}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

const TONE = {
  rose: {
    row: "hover:bg-rose-50/50",
    chip: "bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-200",
    rail: "bg-rose-500",
    icon: "text-rose-600 bg-rose-50",
  },
  gold: {
    row: "hover:bg-gold/[0.07]",
    chip: "bg-gold/15 text-gold-deep ring-1 ring-inset ring-gold/30",
    rail: "bg-gold",
    icon: "text-gold-deep bg-gold/15",
  },
  teal: {
    row: "hover:bg-teal/[0.06]",
    chip: "bg-teal/10 text-teal-deep ring-1 ring-inset ring-teal/25",
    rail: "bg-teal",
    icon: "text-teal-deep bg-teal/10",
  },
} as const

function IssueRow({
  issue,
  tone,
  trailing,
}: {
  issue: QcIssueWithContext
  tone: keyof typeof TONE
  trailing?: string
}) {
  const t = TONE[tone]
  return (
    <Link
      href={`/admin/qc-issues/${issue.id}`}
      className={`group relative flex items-center gap-4 py-4 pl-6 pr-5 transition-colors ${t.row}`}
    >
      <span className={`absolute inset-y-2 left-0 w-[3px] rounded-full opacity-0 transition-opacity group-hover:opacity-100 ${t.rail}`} />

      {issue.itemImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={issue.itemImage} alt="" className="h-12 w-12 flex-none rounded-lg object-cover ring-1 ring-ink/[0.06]" />
      ) : (
        <div className="h-12 w-12 flex-none rounded-lg bg-parchment ring-1 ring-ink/[0.06]" />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[13px] font-semibold tracking-tight text-ink">{issue.orderDisplayId}</span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${t.chip}`}>
            {ISSUE_TYPE_LABEL[issue.issueType] ?? issue.issueType}
          </span>
        </div>
        <p className="mt-1 truncate text-[14px] leading-snug text-ink/75">{issue.itemTitle}</p>
        <p className="truncate text-[12.5px] text-ink/40">{issue.customerName}</p>
      </div>

      <div className="hidden flex-none flex-col items-end gap-1.5 sm:flex">
        {trailing && (
          <span className="rounded-full bg-ink/[0.04] px-2 py-0.5 text-[11px] font-medium text-ink/50 ring-1 ring-inset ring-ink/10">
            {trailing}
          </span>
        )}
        <span className="text-[12px] text-ink/35">{timeAgo(issue.createdAt)}</span>
      </div>

      <ChevronRight size={16} className="flex-none text-ink/20 transition-colors group-hover:text-ink/45" />
    </Link>
  )
}

function Section({
  title,
  count,
  icon,
  tone,
  hint,
  children,
}: {
  title: string
  count: number
  icon: React.ReactNode
  tone: keyof typeof TONE
  hint?: string
  children: React.ReactNode
}) {
  const t = TONE[tone]
  return (
    <section className="mt-9">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold text-ink/70">
          <span className={`grid h-5 w-5 place-items-center rounded-full ${t.icon}`}>{icon}</span>
          {title}
          <span className="text-ink/35">— {count}</span>
        </h2>
        {hint && <p className="hidden text-[12px] text-ink/35 sm:block">{hint}</p>}
      </div>
      <div className="divide-y divide-ink/[0.06] overflow-hidden rounded-2xl border border-ink/[0.08] bg-white shadow-[0_1px_2px_rgba(32,36,43,0.03)]">
        {children}
      </div>
    </section>
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
  const [showResolved, setShowResolved] = useState(true)

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
      <div className="mx-auto max-w-8xl px-6 pb-24 pt-10 lg:px-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 flex-none place-items-center rounded-2xl border border-ink/10 bg-white text-rose-600 shadow-[0_1px_2px_rgba(32,36,43,0.04),0_16px_40px_-24px_rgba(220,38,38,0.35)]">
              <AlertTriangle size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-display text-3xl font-semibold text-ink">QC Issues</h1>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink/60">
                Faulty items awaiting resolution — decide whether the seller refunded us, then compensate the
                customer or ship as-is.
              </p>
            </div>
          </div>

          {!loading && activeCount > 0 && (
            <div className="flex gap-5 rounded-2xl border border-ink/[0.08] bg-white px-5 py-3.5 sm:gap-8">
              <div>
                <p className="text-2xl font-semibold text-rose-600">{needsDecision.length}</p>
                <p className="text-[12px] text-ink/45">Need a decision</p>
              </div>
              <div className="w-px bg-ink/[0.08]" />
              <div>
                <p className="text-2xl font-semibold text-gold-deep">{awaitingReplacement.length}</p>
                <p className="text-[12px] text-ink/45">Awaiting replacement</p>
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <div className="mt-9 flex flex-col gap-3 rounded-2xl border border-ink/10 bg-white p-5">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-ink/[0.04]" />
            ))}
          </div>
        ) : (
          <>
            {activeCount === 0 && (
              <div className="mt-9 flex flex-col items-center gap-3 rounded-2xl border border-ink/10 bg-white px-4 py-16 text-center">
                <Inbox size={22} className="text-ink/25" />
                <p className="text-sm font-semibold text-ink/70">Nothing waiting on resolution</p>
                <p className="max-w-xs text-xs text-ink/45">
                  Items show up here the moment they're flagged faulty during Quality Check.
                </p>
              </div>
            )}

            {needsDecision.length > 0 && (
              <Section title="Needs a decision" count={needsDecision.length} tone="rose" icon={<AlertTriangle size={11} />}>
                {needsDecision.map((issue) => (
                  <IssueRow key={issue.id} issue={issue} tone="rose" />
                ))}
              </Section>
            )}

            {awaitingReplacement.length > 0 && (
              <Section
                title="Awaiting replacement"
                count={awaitingReplacement.length}
                tone="gold"
                icon={<RotateCcw size={11} />}
                hint="Moves to Resolved once the new unit clears QC"
              >
                {awaitingReplacement.map((issue) => (
                  <IssueRow key={issue.id} issue={issue} tone="gold" />
                ))}
              </Section>
            )}

            {resolved.length > 0 && (
              <section className="mt-9">
                <button
                  type="button"
                  onClick={() => setShowResolved((v) => !v)}
                  className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-ink/70 transition-colors hover:text-ink"
                >
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-teal/10 text-teal-deep">
                    <History size={11} />
                  </span>
                  Resolved
                  <span className="text-ink/35">— {resolved.length}</span>
                  <ChevronRight size={13} className={`text-ink/40 transition-transform ${showResolved ? "rotate-90" : ""}`} />
                </button>
                {showResolved ? (
                  <div className="divide-y divide-ink/[0.06] overflow-hidden rounded-2xl border border-ink/[0.08] bg-white shadow-[0_1px_2px_rgba(32,36,43,0.03)]">
                    {resolved.map((issue) => (
                      <IssueRow
                        key={issue.id}
                        issue={issue}
                        tone="teal"
                        trailing={RESOLUTION_LABEL[issue.resolution] ?? issue.resolution}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-ink/40">
                    Kept for reference — which orders and products had quality issues, and how each was resolved.
                  </p>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}