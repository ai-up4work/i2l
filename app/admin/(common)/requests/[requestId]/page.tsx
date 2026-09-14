// app/admin/(common)/requests/[requestId]/page.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, ExternalLink, ImageOff, MessageSquare, RotateCw } from "lucide-react"

import { useAdminData } from "@/contexts/AdminDataContext"
import { REQUEST_STATUS_LABEL, type RequestStatus } from "@/types/admin"
import { panelClass } from "@/components/admin/seller/shared"

// Work one Channel 3 request through to a priced, confirmable state.
// Manager + Sales & Purchase only.
//
// A Request is items: RequestItemAsk[] — each with its own link, note,
// screenshot, quote, and quoteHistory — not a single link/note/quote
// triple. This page renders one card per item, since each is priced and
// retried independently, and only gates the request-level "Confirm"
// action on every item having a quote (allItemsQuoted, computed in
// AdminDataContext). setQuote/retryScrape both take an item id now, not
// just the request id.

const STATUS_STYLE: Record<RequestStatus, string> = {
  sent_for_review: "bg-ink/8 text-ink/70",
  quoted: "bg-teal-deep/15 text-teal-deep",
  confirmed: "bg-emerald-600/15 text-emerald-700",
  declined: "bg-ink/5 text-ink/35",
}

export default function RequestDetailPage() {
  const router = useRouter()
  const params = useParams<{ requestId: string }>()
  const {
    currentUser,
    getRequestLine,
    canWorkRequestLine,
    canReassignRequestLine,
    canCloseRequestLine,
    setQuote,
    confirmRequest,
    declineRequest,
    reassignRequest,
    retryScrape,
    staffDirectory,
    dataLoading,
  } = useAdminData()

  // Per-item quote drafts, keyed by RequestItemAsk.id — a request can
  // have several items, each priced independently, so this can't be a
  // single string the way the old single-link page used.
  const [quoteInputs, setQuoteInputs] = useState<Record<string, string>>({})
  const [retryResult, setRetryResult] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    if (currentUser.role === "warehouse") router.replace("/admin/dashboard")
  }, [currentUser.role, router])

  const request = getRequestLine(params.requestId)

  // Seed each item's draft input from its current quote once, without
  // fighting an in-progress edit — same "only fill when empty" rule the
  // old single-quote version used, just per item now.
  useEffect(() => {
    if (!request) return
    setQuoteInputs((prev) => {
      const next = { ...prev }
      let changed = false
      for (const item of request.items) {
        if (item.quote !== undefined && (next[item.id] === undefined || next[item.id] === "")) {
          next[item.id] = String(item.quote)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [request])

  const staffOnly = useMemo(
    () => staffDirectory.filter((s) => s.role === "sales" || s.role === "manager"),
    [staffDirectory]
  )

  if (currentUser.role === "warehouse") return null

  if (dataLoading) {
    return (
      <div className="h-full overflow-y-auto bg-parchment">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <div className="h-40 animate-pulse rounded-2xl border border-ink/10 bg-card/60" />
        </div>
      </div>
    )
  }

  if (!request) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <p className="text-sm text-ink/50">Request not found.</p>
        <button
          type="button"
          onClick={() => router.push("/admin/requests")}
          className="mt-4 text-sm font-semibold text-teal-deep hover:underline"
        >
          Back to Requests
        </button>
      </div>
    )
  }

  const canWork = canWorkRequestLine(request)
  const isOpen = request.status === "sent_for_review" || request.status === "quoted"

  const handleSetQuote = (itemId: string) => {
    const amount = Number(quoteInputs[itemId])
    if (!Number.isFinite(amount) || amount <= 0) return
    setQuote(request.id, itemId, amount)
  }

  const handleConfirm = () => {
    confirmRequest(request.id)
  }

  const handleRetryScrape = () => {
    setRetryResult(retryScrape(request.id))
  }

  return (
    <div className="mx-auto max-w-8xl px-6 pb-20 pt-8 lg:px-10">
      <button
        type="button"
        onClick={() => router.push("/admin/requests")}
        className="flex items-center gap-1.5 text-sm font-medium text-ink/50 hover:text-ink"
      >
        <ArrowLeft size={14} /> Requests
      </button>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl text-ink">{request.customerName}</h1>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[request.status]}`}>
              {REQUEST_STATUS_LABEL[request.status]}
            </span>
            {request.slaBreached && (
              <span className="rounded-full bg-red-600/10 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-red-700">
                Past SLA
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-ink/45">
            {request.id} · submitted {request.ageLabel} ago · assigned to {request.assignedStaffName} ·{" "}
            {request.items.length} item{request.items.length === 1 ? "" : "s"}
          </p>
        </div>

        {request.linkedOrderId && (
          <button
            type="button"
            onClick={() => router.push(`/admin/orders/${request.linkedOrderId}`)}
            className="rounded-lg border border-ink/15 bg-card px-3 py-2 text-xs font-semibold text-ink/70 hover:bg-parchment/60"
          >
            View order {request.linkedOrderId} →
          </button>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: one card per item ask */}
        <div className="space-y-5 lg:col-span-2">
          {request.items.map((item, idx) => (
            <div key={item.id} className={`overflow-hidden ${panelClass}`}>
              <div className="flex items-center justify-between border-b border-ink/10 px-5 py-3.5">
                <h2 className="text-sm font-semibold text-ink/70">
                  Item {idx + 1} of {request.items.length}
                </h2>
                {item.quote !== undefined && (
                  <span className="rounded-full bg-teal/10 px-2.5 py-1 text-xs font-semibold text-teal-deep">
                    Quoted · Rs. {item.quote.toLocaleString()}
                  </span>
                )}
              </div>

              <div className="space-y-4 px-5 py-4">
                <div>
                  <p className="text-xs font-semibold text-ink/45">Link</p>
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 flex items-center gap-1.5 text-sm font-medium text-teal-deep hover:underline"
                  >
                    {item.link} <ExternalLink size={12} />
                  </a>
                  <p className="mt-0.5 text-xs text-ink/40">Source: {item.sourceDomain}</p>
                </div>

                <div>
                  <p className="text-xs font-semibold text-ink/45">Customer's note</p>
                  <p className="mt-1 text-sm leading-relaxed text-ink/80">{item.note}</p>
                </div>

                <div>
                  <p className="text-xs font-semibold text-ink/45">Screenshot</p>
                  {item.screenshotUrl ? (
                    <img
                      src={item.screenshotUrl}
                      alt="Customer-submitted screenshot"
                      className="mt-2 max-h-64 rounded-lg border border-ink/10 object-cover"
                    />
                  ) : (
                    <div className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-ink/15 px-3 py-4 text-xs text-ink/40">
                      <ImageOff size={14} /> No screenshot attached
                    </div>
                  )}
                </div>

                {/* Quote — per item */}
                <div className="border-t border-ink/10 pt-4">
                  <label className="text-xs font-semibold text-ink/50">Amount (Rs.)</label>
                  <div className="mt-1 flex gap-2">
                    <input
                      type="number"
                      min={0}
                      value={quoteInputs[item.id] ?? ""}
                      onChange={(e) => setQuoteInputs((prev) => ({ ...prev, [item.id]: e.target.value }))}
                      disabled={!canWork || !isOpen}
                      placeholder="No price set yet"
                      className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal/50 disabled:bg-ink/5 disabled:text-ink/40"
                    />
                    {canWork && isOpen && (
                      <button
                        type="button"
                        onClick={() => handleSetQuote(item.id)}
                        className="flex-none rounded-lg bg-teal px-3.5 py-2 text-sm font-semibold text-white hover:bg-teal-deep"
                      >
                        {item.quote !== undefined ? "Update" : "Set"}
                      </button>
                    )}
                  </div>

                  {item.quoteHistory.length > 0 && (
                    <div className="mt-3 border-t border-ink/10 pt-3">
                      <p className="text-xs font-semibold text-ink/45">Revision history</p>
                      <div className="mt-1.5 space-y-1">
                        {item.quoteHistory.map((q, i) => (
                          <div key={i} className="flex items-center justify-between text-xs text-ink/60">
                            <span>Rs. {q.amount.toLocaleString()} — {q.by}</span>
                            <span className="text-ink/35">{new Date(q.at).toLocaleDateString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {canWork && isOpen && (
            <div className={`overflow-hidden ${panelClass}`}>
              <div className="px-5 py-4">
                <button
                  type="button"
                  onClick={handleRetryScrape}
                  className="flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-xs font-semibold text-ink/70 hover:bg-parchment/60"
                >
                  <RotateCw size={12} /> Retry scrape
                </button>
                {retryResult && (
                  <p className={`mt-2 text-xs ${retryResult.success ? "text-emerald-700" : "text-ink/50"}`}>
                    {retryResult.message}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: request-level actions */}
        <div className="flex flex-col gap-6">
          {canWork && isOpen && (
            <div className={`overflow-hidden ${panelClass}`}>
              <div className="border-b border-ink/10 px-5 py-3.5">
                <h2 className="text-sm font-semibold text-ink/70">Move status</h2>
              </div>
              <div className="flex flex-col gap-2 px-5 py-4">
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={!request.allItemsQuoted}
                  className="w-full rounded-lg bg-teal-deep px-3 py-2 text-sm font-semibold text-white hover:bg-teal-deep/90 disabled:cursor-not-allowed disabled:bg-ink/10 disabled:text-ink/35"
                >
                  Confirm → creates order
                </button>
                {!request.allItemsQuoted && (
                  <p className="text-xs text-ink/40">
                    {request.items.length > 1
                      ? "Every item needs a quote before this request can be confirmed."
                      : "Set a quote before this request can be confirmed."}
                  </p>
                )}
                {request.allItemsQuoted && request.totalQuote !== undefined && (
                  <p className="text-xs text-ink/45">
                    Total across all items: <span className="font-semibold text-ink/70">Rs. {request.totalQuote.toLocaleString()}</span>
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => declineRequest(request.id)}
                  className="w-full rounded-lg border border-red-600/25 bg-red-600/5 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-600/10"
                >
                  Decline
                </button>
              </div>
            </div>
          )}

          {canCloseRequestLine() && isOpen && (
            <div className={`overflow-hidden ${panelClass}`}>
              <div className="border-b border-ink/10 px-5 py-3.5">
                <h2 className="text-sm font-semibold text-ink/70">Manager actions</h2>
              </div>
              <div className="flex flex-col gap-3 px-5 py-4">
                {canReassignRequestLine() && (
                  <div>
                    <label className="text-xs font-semibold text-ink/50">Reassign to</label>
                    <select
                      value={request.assignedStaffId ?? ""}
                      onChange={(e) => reassignRequest(request.id, e.target.value)}
                      className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal/50"
                    >
                      <option value="" disabled>Choose staff member</option>
                      {staffOnly.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => declineRequest(request.id)}
                  className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm font-semibold text-ink/70 hover:bg-parchment/60"
                >
                  Close request
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => router.push(`/admin/chat?thread=${request.chatThreadId}`)}
            className="flex items-center justify-center gap-2 rounded-xl border border-ink/10 bg-card px-4 py-3 text-sm font-semibold text-teal-deep hover:bg-parchment/60"
          >
            <MessageSquare size={16} /> Open chat thread
          </button>
        </div>
      </div>
    </div>
  )
}