// app/admin/qc-issues/page.tsx
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, ChevronRight, History, Inbox, RotateCcw } from "lucide-react"

import { fetchOpenQcIssuesWithContext, type QcIssueWithContext } from "@/lib/supabase/qc-issues"

// QC Issues: items flagged faulty during Quality Check. Created automatically
// when a QC line is flagged (see save() in the qc/[id] page) and resolved by
// recording whether WishDrop got a real refund from the seller, then issuing a
// compensation coupon, shipping the item as-is, or retrying with a new unit.
// See lib/supabase/qc-issues.ts for the full reasoning.
//
// Three sections:
//   - Needs a decision (resolution: pending): nobody has decided yet.
//   - Awaiting replacement (resolution: retry_same): ops chose a new unit. A row
//     leaves this section the moment /admin/qc/[id] records a "passed" verdict
//     for it (closeRetryIssue changes the resolution to 'replacement_resolved',
//     which this section's fetch no longer matches). No client-side filtering.
//   - Resolved: coupon_issued, shipped_as_is and replacement_resolved. Nothing
//     is ever deleted, so a fully resolved issue stays visible for analytics and
//     future reference. Shown expanded by default; set showResolved's initial
//     value to false to start collapsed.

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
    chip: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200",
    dot: "bg-rose-500",
    icon: "text-rose-600 bg-rose-50",
  },
  gold: {
    chip: "bg-gold/15 text-gold-deep ring-1 ring-inset ring-gold/30",
    dot: "bg-gold-deep",
    icon: "text-gold-deep bg-gold/15",
  },
  teal: {
    chip: "bg-teal/12 text-teal-deep ring-1 ring-inset ring-teal/25",
    dot: "bg-teal-deep",
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
  const trailingPill = trailing ? (
    <span className="rounded-full bg-ink/[0.04] px-2.5 py-1 text-xs font-semibold text-ink/55 ring-1 ring-inset ring-ink/10">
      {trailing}
    </span>
  ) : null

  return (
    <Link
      href={`/admin/qc-issues/${issue.id}`}
      className="group flex items-center gap-4 px-5 py-4 outline-none transition-colors hover:bg-ink/[0.02] focus-visible:bg-teal/[0.06] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-teal/40"
    >
      {issue.itemImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={issue.itemImage} alt="" className="h-12 w-12 flex-none rounded-xl object-cover ring-1 ring-ink/10" />
      ) : (
        <div className="h-12 w-12 flex-none rounded-xl bg-ink/[0.04] ring-1 ring-ink/10" />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-sm font-semibold">{issue.orderDisplayId}</span>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${t.chip}`}>
            <span className={`h-1.5 w-1.5 flex-none rounded-full ${t.dot}`} aria-hidden />
            {ISSUE_TYPE_LABEL[issue.issueType] ?? issue.issueType}
          </span>
        </div>
        <p className="mt-1 truncate text-sm text-ink/75">{issue.itemTitle}</p>
        <p className="truncate text-xs text-ink/50">{issue.customerName}</p>

        {/* mobile: the right-hand column is hidden, so it moves under the text */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink/45 sm:hidden">
          {trailingPill}
          <span>{timeAgo(issue.createdAt)}</span>
        </div>
      </div>

      <div className="hidden flex-none flex-col items-end gap-1.5 sm:flex">
        {trailingPill}
        <span className="text-xs tabular-nums text-ink/45">{timeAgo(issue.createdAt)}</span>
      </div>

      <ChevronRight size={16} className="flex-none text-ink/25 transition-colors group-hover:text-ink/50" aria-hidden />
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
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink/75">
          <span className={`grid h-6 w-6 place-items-center rounded-full ${t.icon}`}>{icon}</span>
          {title}
          <span className="rounded-full bg-ink/[0.05] px-2 py-0.5 text-xs font-semibold tabular-nums text-ink/55">{count}</span>
        </h2>
        {hint && <p className="hidden text-xs text-ink/45 sm:block">{hint}</p>}
      </div>
      <div className="divide-y divide-ink/[0.06] overflow-hidden rounded-2xl border border-ink/10 bg-white">{children}</div>
    </section>
  )
}

export default function QcIssuesPage() {
  const [needsDecision, setNeedsDecision] = useState<QcIssueWithContext[]>([])
  const [awaitingReplacement, setAwaitingReplacement] = useState<QcIssueWithContext[]>([])
  const [resolved, setResolved] = useState<QcIssueWithContext[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [showResolved, setShowResolved] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setFailed(false)

    Promise.all([
      fetchOpenQcIssuesWithContext(["pending"]),
      fetchOpenQcIssuesWithContext(["retry_same"]),
      fetchOpenQcIssuesWithContext(["coupon_issued", "shipped_as_is", "replacement_resolved"]),
    ])
      .then(([pending, retrying, done]) => {
        if (cancelled) return
        setNeedsDecision(pending)
        setAwaitingReplacement(retrying)
        setResolved(done)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const activeCount = needsDecision.length + awaitingReplacement.length
  const stat = (n: number) => (loading || failed ? "—" : String(n))

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      <div className="mx-auto max-w-8xl px-6 pb-24 pt-10 lg:px-10">
        {/* ── Header ── */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-red-500/80 text-parchment">
              <AlertTriangle size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-display text-3xl font-semibold leading-tight">QC issues</h1>
              <p className="mt-1 max-w-md text-sm leading-relaxed text-ink/60">
                Faulty items waiting on a decision. Confirm whether the seller refunded us, then compensate the
                customer or ship as-is.
              </p>
            </div>
          </div>

          <dl className="flex divide-x divide-ink/10 overflow-x-auto rounded-2xl border border-ink/10 bg-white">
            <div className="px-5 py-3">
              <dt className="whitespace-nowrap text-xs font-medium text-ink/45">Need a decision</dt>
              <dd className={`mt-0.5 font-display text-xl ${!loading && needsDecision.length > 0 ? "text-rose-700" : "text-ink"}`}>
                {stat(needsDecision.length)}
              </dd>
            </div>
            <div className="px-5 py-3">
              <dt className="whitespace-nowrap text-xs font-medium text-ink/45">Awaiting replacement</dt>
              <dd className={`mt-0.5 font-display text-xl ${!loading && awaitingReplacement.length > 0 ? "text-amber-700" : "text-ink"}`}>
                {stat(awaitingReplacement.length)}
              </dd>
            </div>
            <div className="px-5 py-3">
              <dt className="whitespace-nowrap text-xs font-medium text-ink/45">Resolved</dt>
              <dd className="mt-0.5 font-display text-xl text-ink">{stat(resolved.length)}</dd>
            </div>
          </dl>
        </div>

        {loading ? (
          <div className="mt-8 flex flex-col gap-3 rounded-2xl border border-ink/10 bg-white p-5" aria-busy="true">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-ink/[0.04]" />
            ))}
          </div>
        ) : failed ? (
          <div className="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-ink/10 bg-white px-4 py-16 text-center">
            <AlertTriangle size={22} className="text-rose-500" />
            <div>
              <p className="text-sm font-semibold text-ink/70">Couldn&rsquo;t load QC issues</p>
              <p className="mt-1 max-w-xs text-xs text-ink/50">Check your connection, then try again.</p>
            </div>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="text-xs font-semibold text-teal-deep underline decoration-dotted underline-offset-4 hover:text-teal"
            >
              Try again
            </button>
          </div>
        ) : (
          <>
            {activeCount === 0 && (
              <div className="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-ink/10 bg-white px-4 py-16 text-center">
                <Inbox size={22} className="text-ink/25" />
                <div>
                  <p className="text-sm font-semibold text-ink/70">Nothing waiting on resolution</p>
                  <p className="mt-1 max-w-xs text-xs text-ink/50">
                    Items appear here as soon as they&rsquo;re flagged faulty during Quality check.
                  </p>
                </div>
                <Link
                  href="/admin/qc"
                  className="text-xs font-semibold text-teal-deep underline decoration-dotted underline-offset-4 hover:text-teal"
                >
                  Go to Quality check
                </Link>
              </div>
            )}

            {needsDecision.length > 0 && (
              <Section title="Needs a decision" count={needsDecision.length} tone="rose" icon={<AlertTriangle size={12} />}>
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
                icon={<RotateCcw size={12} />}
                hint="Moves to Resolved once the new unit clears QC"
              >
                {awaitingReplacement.map((issue) => (
                  <IssueRow key={issue.id} issue={issue} tone="gold" />
                ))}
              </Section>
            )}

            {resolved.length > 0 && (
              <section className="mt-8">
                <button
                  type="button"
                  aria-expanded={showResolved}
                  aria-controls="resolved-issues"
                  onClick={() => setShowResolved((v) => !v)}
                  className="mb-3 flex items-center gap-2 rounded text-sm font-semibold text-ink/75 outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-teal/40"
                >
                  <span className={`grid h-6 w-6 place-items-center rounded-full ${TONE.teal.icon}`}>
                    <History size={12} />
                  </span>
                  Resolved
                  <span className="rounded-full bg-ink/[0.05] px-2 py-0.5 text-xs font-semibold tabular-nums text-ink/55">
                    {resolved.length}
                  </span>
                  <ChevronRight size={14} className={`text-ink/40 transition-transform ${showResolved ? "rotate-90" : ""}`} aria-hidden />
                </button>
                {showResolved ? (
                  <div
                    id="resolved-issues"
                    className="divide-y divide-ink/[0.06] overflow-hidden rounded-2xl border border-ink/10 bg-white"
                  >
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
                  <p id="resolved-issues" className="text-xs text-ink/45">
                    Kept for reference: which orders and products had quality issues, and how each was resolved.
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