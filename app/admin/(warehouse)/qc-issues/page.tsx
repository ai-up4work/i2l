"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, ChevronRight, Inbox } from "lucide-react"

import { useAdminData } from "@/contexts/AdminDataContext"
import { fetchOpenQcIssuesWithContext, type QcIssueWithContext } from "@/lib/supabase/qc-issues"

const ISSUE_TYPE_LABEL: Record<string, string> = {
  faulty_unit: "Faulty unit",
  inventory_rejected: "Inventory rejected",
  customer_declined: "Customer declined",
}

function timeAgo(iso: string): string {
  const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000
  if (hours < 1) return "<1h ago"
  if (hours < 24) return `${Math.floor(hours)}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

// QC Issues — items flagged faulty during Quality Check, waiting on a
// resolution decision. Created automatically the moment a QC line is
// flagged (see app/admin/(warehouse)/qc/[id]/page.tsx's save()); resolved
// here by recording whether WishDrop got a real refund from the seller,
// then either issuing a compensation coupon or shipping the item as-is —
// see lib/supabase/qc-issues.ts for the full reasoning.
export default function QcIssuesPage() {
  const { currentUser } = useAdminData()
  const [issues, setIssues] = useState<QcIssueWithContext[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchOpenQcIssuesWithContext().then((data) => {
      setIssues(data)
      setLoading(false)
    })
  }, [])

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
              customer or ship as-is.
            </p>
          </div>
        </div>

        <div className="mt-8 overflow-hidden rounded-2xl border border-ink/10 bg-white">
          {loading ? (
            <div className="flex flex-col gap-3 p-5">
              {[1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-ink/[0.04]" />
              ))}
            </div>
          ) : issues.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
              <Inbox size={22} className="text-ink/25" />
              <p className="text-sm font-semibold text-ink/70">Nothing waiting on resolution</p>
              <p className="max-w-xs text-xs text-ink/45">
                Items show up here the moment they're flagged faulty during Quality Check.
              </p>
            </div>
          ) : (
            issues.map((issue) => (
              <Link
                key={issue.id}
                href={`/admin/qc-issues/${issue.id}`}
                className="flex items-center gap-4 border-b border-ink/[0.06] px-5 py-4 transition-colors last:border-b-0 hover:bg-rose-50/40"
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
                    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-600 ring-1 ring-inset ring-rose-200">
                      {ISSUE_TYPE_LABEL[issue.issueType] ?? issue.issueType}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-ink/70">{issue.itemTitle}</p>
                  <p className="truncate text-xs text-ink/45">{issue.customerName}</p>
                </div>
                <span className="hidden flex-none text-xs text-ink/40 sm:block">{timeAgo(issue.createdAt)}</span>
                <ChevronRight size={16} className="flex-none text-ink/25" />
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  )
}