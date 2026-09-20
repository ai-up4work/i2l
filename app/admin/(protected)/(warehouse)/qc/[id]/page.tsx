// app/admin/qc/[id]/page.tsx
"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { useParams, useRouter } from "next/navigation"
import {
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Flag,
  Loader2,
  Store,
  X,
} from "lucide-react"

import { useAdminData, isOrderAgeBreached } from "@/contexts/AdminDataContext"
import { fetchOrderIdentity } from "@/lib/supabase/orders-admin"
import { createQcIssue, closeRetryIssue, fetchQcIssuesForItems, fetchQcIssuesForOrder, type CustomerVisibleQcIssue } from "@/lib/supabase/qc-issues"
import { useImageUpload } from "@/lib/upload/useImageUpload"
import { CHANNEL_LABEL, QC_STATUS_LABEL, type QCStatus } from "@/types/admin"
import type { StatusTone } from "@/components/admin/warehouse/status-pill"
import { SendMessageModal } from "@/components/admin/SendMessageModal"
import { qcFlaggedMessage, replacementPassedMessage, formatItemLabel } from "@/lib/chat/customerMessageTemplates"

// QCStatus only ever holds pending | passed | flagged — there's no separate
// "failed" state — so the verdict control below is a single Pass/Flag pair
// rather than three overlapping buttons. Flagging is the escalation *and*
// the negative verdict at once; the note attached to it is what actually
// lands on the order (see submitQcResult in AdminDataContext) — passing
// advances the order straight to Shipped, flagging keeps it at Quality
// check and writes the note as an internal note ops can see immediately.
//
// Previously this screen faked a save with a setTimeout and a TODO
// comment. It now calls submitQcResult(), which is a real mutation on the
// shared store, so the result is reflected on /admin/qc, the order detail
// page, and anywhere else that reads the same order.
//
// NOTE on the purchase-record link below: PurchaseLine.id is now a
// composite `${orderId}:${orderItemId}` key (not the raw Purchase.id),
// so this page has to build that key itself from line.orderId +
// line.orderItemId rather than reusing line.purchaseId (which is still
// the underlying Purchase's real id, used only for submitQcResult /
// addQcPhoto — those two operate on the actual Purchase record, not the
// joined PurchaseLine, so they're unaffected).
//
// RESTYLE (2026-09): brought in line with /admin/orders/[orderId] and the
// other detail pages (same tokens, Pill/Meta/SectionCard, sticky
// breadcrumb top bar, colored left-edge accent, stretched last cards so
// both columns end level). Every handler and piece of state below is
// unchanged — only markup/styling.

/* ---------- tokens (same as the order detail page) ---------- */

const TONE_DOT: Record<StatusTone, string> = {
  teal: "bg-teal-deep",
  amber: "bg-gold-deep",
  rose: "bg-rose-600",
}
const TONE_PILL: Record<StatusTone, string> = {
  teal: "bg-teal/12 text-teal-deep ring-teal/25",
  amber: "bg-gold/15 text-gold-deep ring-gold/30",
  rose: "bg-rose-50 text-rose-700 ring-rose-200",
}
const TONE_ACCENT: Record<StatusTone, string> = {
  teal: "border-l-teal-deep",
  amber: "border-l-gold-deep",
  rose: "border-l-rose-600",
}
const STATUS_TONE_FOR: Record<QCStatus, StatusTone> = {
  pending: "amber",
  passed: "teal",
  flagged: "rose",
}

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40"
const BTN_PRIMARY = `inline-flex items-center justify-center gap-1.5 rounded-xl bg-teal-deep px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal disabled:cursor-not-allowed disabled:bg-ink/15 disabled:text-ink/35 ${FOCUS}`
const BTN_OUTLINE = `inline-flex items-center justify-center gap-1.5 rounded-xl border border-ink/15 bg-card px-4 py-2 text-sm font-medium text-ink/70 transition-colors hover:bg-ink/[0.04] hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`
const FIELD = `w-full resize-none rounded-lg border border-ink/10 bg-card px-3 py-2 text-sm text-ink placeholder:text-ink/35 outline-none focus:border-teal/50 focus:ring-2 focus:ring-teal/15 disabled:opacity-60`

/* ---------- small components (same as the order detail page) ---------- */

function Pill({ tone, children }: { tone: StatusTone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${TONE_PILL[tone]}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[tone]}`} />
      {children}
    </span>
  )
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink/45">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium text-ink">{children}</dd>
    </div>
  )
}

function SectionCard({
  title,
  description,
  className = "",
  children,
}: {
  title: string
  description?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={`flex flex-col rounded-2xl border border-ink/10 bg-card ${className}`}>
      <header className="px-5 pt-5">
        <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink/50">{description}</p>}
      </header>
      <div className="flex flex-1 flex-col p-5 pt-4">{children}</div>
    </section>
  )
}

export default function QCDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { getQcLine, canActOnQcLine, submitQcResult, addQcPhoto, dataLoading, currentUser, addInternalNote, setOrderDelayedExplicit, sendChatMessage } = useAdminData()
  // qcLines[].id is `${orderUuid}:${itemUuid}` (see AdminDataContext's
  // purchaseLines/qcLines derivation) — the colon can arrive
  // percent-encoded depending on how it was navigated to, exactly like
  // purchases/[PurchaseId]/page.tsx already accounts for with the same
  // id shape. This page never did, which is why a line that
  // demonstrably exists in the list (same qcLines array) could still
  // fail to be found here.
  const qcLineId = decodeURIComponent(params.id)
  const line = getQcLine(qcLineId)

  const [status, setStatus] = useState<QCStatus>(line?.status ?? "pending")
  const [note, setNote] = useState(line?.note ?? "")
  // Customer-facing note — distinct from `note` above (the internal
  // inspection note). Written to order_item_issues.customer_note and
  // surfaced verbatim on the customer's order tracking page via
  // QcIssueBanner. Never mix these two into one field/input: the
  // internal note can freely mention supplier names, costs, or ops
  // shorthand that should never reach a customer.
  const [customerNote, setCustomerNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Real upload, not the old local-only photoCount bump. One photo per
  // QC issue (order_item_issues.photo_url is a single text column), so
  // this holds the most recently uploaded photo rather than a list.
  const { uploading, error: uploadError, upload } = useImageUpload()
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [pendingMessage, setPendingMessage] = useState<{ title: string; text: string; threadId: string } | null>(null)

  // Is this item currently mid-reorder — i.e. does it have an open
  // 'retry_same' issue on file already? Fetched unconditionally
  // (before the early returns below) same as every other hook here.
  // Used two ways: (1) a small banner telling the inspector this is a
  // replacement unit, not the original, and (2) on a "passed" verdict,
  // save() closes this issue out for real (closeRetryIssue) instead of
  // leaving it silently stuck on 'retry_same' forever — see that
  // function's own doc comment for why that matters to the customer.
  const [openRetryIssue, setOpenRetryIssue] = useState<CustomerVisibleQcIssue | null>(null)
  useEffect(() => {
    if (!line) return
    fetchQcIssuesForItems([line.orderItemId]).then((map) => {
      const issue = map.get(line.orderItemId)
      setOpenRetryIssue(issue && issue.resolution === "retry_same" ? issue : null)
    })
  }, [line])

  async function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = "" // allow re-selecting the same file later
    if (!file || !line) return
    const url = await upload(file, "qc")
    if (url) {
      setPhotoUrl(url)
      addQcPhoto(line.purchaseId) // keeps the existing local photoCount UI in sync
    }
  }

  if (dataLoading) {
    return (
      <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
        <div className="mx-auto max-w-8xl space-y-6 px-6 py-10 lg:px-10">
          <div className="h-6 w-40 animate-pulse rounded bg-ink/10" />
          <div className="h-40 animate-pulse rounded-2xl border border-ink/10 bg-card/60" />
          <div className="h-56 animate-pulse rounded-2xl border border-ink/10 bg-card/60" />
        </div>
      </div>
    )
  }

  if (!line) {
    return (
      <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
        <div className="mx-auto max-w-3xl px-6 py-24 text-center lg:px-10">
          <h1 className="font-display text-xl text-ink">QC line not found</h1>
          <p className="mt-1.5 text-sm text-ink/50">
            This QC line doesn&rsquo;t exist, or isn&rsquo;t in your site&rsquo;s queue.
          </p>
          <Link href="/admin/qc" className={`${BTN_OUTLINE} mt-5`}>
            <ArrowLeft size={14} />
            Back to Quality check
          </Link>
        </div>
      </div>
    )
  }

  const canAct = canActOnQcLine(line)
  const breached = isOrderAgeBreached(line.orderAgeHours)
  const tone = STATUS_TONE_FOR[status]
  const purchaseLineId = `${line.orderId}:${line.orderItemId}`

  async function save() {
    if (status === "pending" || !canAct) return
    setSaveError(null)
    setSaving(true)
    submitQcResult(line!.purchaseId, status, note)

    // The real per-item record (order_item_issues) only gets written
    // when flagging — this used to fire-and-forget with no await and no
    // error handling at all, so a failed insert (RLS, a bad staff-id FK,
    // an order lookup miss) looked identical to success: the UI still
    // said "Saved" and navigated back, while /admin/qc-issues silently
    // never got the row. Now this genuinely blocks on the real write and
    // surfaces a failure instead of pretending it worked.
    if (status === "flagged") {
      const identity = await fetchOrderIdentity(line!.orderId)
      if (!identity) {
        setSaving(false)
        setSaveError("Could not find this order in the database — nothing was saved. Try again, or check the order still exists.")
        return
      }
      const result = await createQcIssue({
        orderId: identity.orderId,
        orderItemId: line!.orderItemId,
        userId: identity.userId,
        issueType: "faulty_unit",
        staffNote: note,
        customerNote: customerNote.trim() || undefined,
        photoUrl: photoUrl ?? undefined,
        staffId: currentUser.id,
      })
      if (!result.ok) {
        setSaving(false)
        setSaveError(result.error ?? "Could not save this QC issue. It won't show up on QC Issues or the customer's order until this succeeds.")
        return
      }

      // This is a SECOND fault on an item that was already mid-reorder
      // — createQcIssue above just created a fresh issue row for it, so
      // leave the OLD retry_same row exactly as it is (still real
      // history that a first replacement was needed too) and just note
      // it on the order for whoever picks this up next.
      if (openRetryIssue) {
        addInternalNote(
          line!.orderId,
          `⚠️ Replacement for "${line!.productTitle}" also failed QC — see the new QC issue for details.`
        )
      }
    }

    // The replacement unit passed — if this item had an open retry_same
    // issue, close it out for real. This is the durable signal the
    // customer-facing order pages read to stop showing "there was an
    // issue with this item" (see closeRetryIssue's own doc comment) —
    // without this, that banner would otherwise never go away on its
    // own. Also leaves a real, permanent trail on the order itself
    // (unlike the Purchases-queue state, addInternalNote is a real DB
    // write) so /admin/orders/[orderId] shows the full arc: flagged →
    // reordered → replacement passed.
    if (status === "passed" && openRetryIssue) {
      const closeResult = await closeRetryIssue(openRetryIssue.id)
      if (!closeResult.ok) {
        setSaving(false)
        setSaveError(closeResult.error ?? "QC result saved, but couldn't close out the original QC issue — it may still show as awaiting replacement.")
        return
      }
      addInternalNote(
        line!.orderId,
        `✅ Replacement for "${line!.productTitle}" passed QC — quality issue resolved.`
      )

      // "Delayed" was set the moment the ORIGINAL fault was flagged
      // (see submitQcResult's flagged branch) and nothing ever clears
      // it back — so without this, the order keeps reading as
      // "Delayed" on /admin/orders forever, even once it's sitting
      // correctly in Pack & label. Only clear it if THIS was the only
      // open issue on the order — a sibling item could still have its
      // own unresolved fault, and this shouldn't paper over that.
      const identity = await fetchOrderIdentity(line!.orderId)
      if (identity) {
        const allIssues = await fetchQcIssuesForOrder(identity.orderId)
        const otherOpenIssues = allIssues.some(
          (i) => i.id !== openRetryIssue.id && (i.resolution === "pending" || i.resolution === "retry_same")
        )
        if (!otherOpenIssues) setOrderDelayedExplicit(line!.orderId, false)
      }
    }

    // Flagging, or a replacement passing, with a real chat thread on
    // file: offer to tell the customer before navigating away, same
    // review-before-send pattern as the request detail page —
    // navigation happens once the modal is dismissed (send or skip)
    // instead of on a fixed timer, so the SendMessageModal below isn't
    // yanked away mid-decision. Every order gets a real chat thread at
    // creation now, regardless of channel (see confirmCartOrder in
    // DashboardContext.tsx and Order.chatThreadId's doc comment in
    // types/admin.ts) — line!.chatThreadId being falsy here would now
    // mean something upstream failed to set it, not an expected gap for
    // a Channel 1/2 order.
    if (status === "flagged" && line!.chatThreadId) {
      setSaving(false)
      setSaved(true)
      setPendingMessage({
        title: "Let the customer know about this issue?",
        text: qcFlaggedMessage(line!.orderId, formatItemLabel(line!.productTitle, line!.variant), customerNote),
        threadId: line!.chatThreadId,
      })
      return
    }
    if (status === "passed" && openRetryIssue && line!.chatThreadId) {
      setSaving(false)
      setSaved(true)
      setPendingMessage({
        title: "Let the customer know the replacement passed?",
        text: replacementPassedMessage(line!.orderId, formatItemLabel(line!.productTitle, line!.variant)),
        threadId: line!.chatThreadId,
      })
      return
    }

    window.setTimeout(() => {
      setSaving(false)
      setSaved(true)
      window.setTimeout(() => router.push("/admin/qc"), 700)
    }, 400)
  }

  return (
    <>
      <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
        {/* Top bar */}
        <div className="sticky top-0 z-20 border-b border-ink/[0.07] bg-parchment/90 backdrop-blur">
          <div className="mx-auto flex max-w-8xl items-center justify-between gap-4 px-6 py-3 lg:px-10">
            <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
              <Link
                href="/admin/qc"
                className={`inline-flex items-center gap-1.5 rounded-md font-medium text-ink/55 hover:text-ink ${FOCUS}`}
              >
                <ArrowLeft size={15} />
                Quality check
              </Link>
              <ChevronRight size={14} className="text-ink/25" />
              <span className="truncate font-medium text-ink">{line.productTitle}</span>
            </nav>

            <Link href={`/admin/purchases/${purchaseLineId}`} className={BTN_OUTLINE}>
              View purchase record
              <ExternalLink size={13} />
            </Link>
          </div>
        </div>

        <div className="mx-auto max-w-8xl px-6 pb-8 pt-6 lg:px-10">
          {/* Summary */}
          <div className={`overflow-hidden rounded-2xl border border-l-4 border-ink/10 bg-card ${TONE_ACCENT[tone]}`}>
            <div className="flex flex-col gap-5 p-5 sm:flex-row sm:p-6">
              <span className="h-24 w-24 flex-none overflow-hidden rounded-2xl border border-ink/10 bg-parchment/60">
                <Image src={line.productImage} alt="" width={96} height={96} className="h-full w-full object-cover" />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <h1 className="font-display text-2xl leading-tight text-ink">{line.productTitle}</h1>
                  <Pill tone={tone}>{QC_STATUS_LABEL[status]}</Pill>
                  {breached && <Pill tone="rose">{line.orderAgeLabel} old, over SLA</Pill>}
                </div>
                {line.variant && <p className="mt-1 text-sm text-ink/55">{line.variant}</p>}
                {openRetryIssue && (
                  <p className="mt-2 inline-flex items-center rounded-full bg-gold/15 px-2.5 py-1 text-xs font-semibold text-gold-deep ring-1 ring-inset ring-gold/30">
                    Replacement unit. A fresh pass here closes out the original QC issue.
                  </p>
                )}

                <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-ink/[0.07] pt-4 sm:grid-cols-4">
                  <Meta label="Order">
                    <Link
                      href={`/admin/orders/${line.orderId}`}
                      className={`inline-flex max-w-full items-center gap-1 rounded text-teal-deep hover:underline ${FOCUS}`}
                    >
                      <span className="truncate">{line.orderNumber}</span>
                      <ExternalLink size={12} className="shrink-0" />
                    </Link>
                  </Meta>
                  <Meta label="Customer">{line.customerName}</Meta>
                  <Meta label="Seller">
                    <span className="inline-flex max-w-full items-center gap-1.5">
                      <Store size={13} className="shrink-0 text-ink/35" />
                      <span className="truncate">{line.sellerName}</span>
                    </span>
                  </Meta>
                  <Meta label="Channel">{CHANNEL_LABEL[line.channel]}</Meta>
                  <Meta label="Quantity">{line.quantity}</Meta>
                  <Meta label="Arrived at QC">
                    {line.arrivedAgo} ago at {line.site}
                  </Meta>
                  <Meta label="Order age">
                    <span className={breached ? "font-semibold text-rose-700" : ""}>{line.orderAgeLabel} since placed</span>
                  </Meta>
                </dl>
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Main column: inspection */}
            <div className="flex flex-col gap-6 lg:col-span-2">
              <SectionCard
                title="Inspection"
                description="Record what you found. Internal notes stay with ops."
                className={status === "flagged" ? "" : "flex-1"}
              >
                <div className="space-y-5">
                  <div>
                    <label htmlFor="qc-note" className="text-sm font-medium text-ink/70">
                      Inspection note <span className="font-normal text-ink/45">(internal only, never shown to the customer)</span>
                    </label>
                    <textarea
                      id="qc-note"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={4}
                      disabled={!canAct}
                      placeholder="Describe any defect for the internal record — this never reaches the customer"
                      className={`mt-1.5 ${FIELD}`}
                    />
                    {status === "flagged" && !note.trim() && (
                      <p className="mt-1.5 text-xs text-gold-deep">
                        Add a note describing the issue — this becomes an internal note on the order.
                      </p>
                    )}
                  </div>

                  <div>
                    <p className="text-sm font-medium text-ink/70">Inspection photo</p>

                    <div className="mt-1.5">
                      {photoUrl ? (
                        <div className="relative w-fit">
                          <Image
                            src={photoUrl}
                            alt="QC inspection photo"
                            width={160}
                            height={160}
                            className="h-36 w-36 rounded-xl border border-ink/10 object-cover"
                          />
                          {canAct && (
                            <button
                              type="button"
                              onClick={() => setPhotoUrl(null)}
                              aria-label="Remove photo"
                              className={`absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-ink text-parchment shadow-[0_2px_6px_rgba(32,36,43,0.3)] transition-opacity hover:opacity-90 ${FOCUS}`}
                            >
                              <X size={12} />
                            </button>
                          )}
                        </div>
                      ) : (
                        <label
                          className={`flex items-center justify-center gap-2 rounded-xl border border-dashed border-ink/20 px-4 py-6 text-sm text-ink/55 transition-colors hover:bg-ink/[0.02] hover:text-ink ${
                            !canAct || uploading ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                          }`}
                        >
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            onChange={handlePhotoSelected}
                            disabled={!canAct || uploading}
                            className="hidden"
                          />
                          {uploading ? <Loader2 size={15} className="flex-none animate-spin" /> : <Camera size={15} className="flex-none" />}
                          {uploading ? "Uploading…" : "Attach inspection photo"}
                        </label>
                      )}
                    </div>
                    {uploadError && <p className="mt-1.5 text-xs text-rose-600">{uploadError}</p>}
                    {status === "flagged" && (
                      <p className="mt-1.5 text-xs text-ink/45">
                        If attached, this photo is shown to the customer alongside the note below.
                      </p>
                    )}
                  </div>
                </div>
              </SectionCard>

              {status === "flagged" && (
                <SectionCard
                  title="Note for the customer"
                  description="Optional. The customer sees this on their order page."
                  className="flex-1"
                >
                  <label htmlFor="qc-customer-note" className="sr-only">
                    Note for the customer
                  </label>
                  <textarea
                    id="qc-customer-note"
                    value={customerNote}
                    onChange={(e) => setCustomerNote(e.target.value)}
                    rows={3}
                    disabled={!canAct}
                    placeholder="Plain-language explanation the customer will see on their order page, e.g. “The zipper on this item arrived stuck.”"
                    className={FIELD}
                  />
                </SectionCard>
              )}
            </div>

            {/* Sidebar: verdict */}
            <aside className="flex flex-col gap-6">
              <SectionCard
                title="Result"
                description="Pick one. Flagging leaves a note on the order for ops."
                className="flex-1"
              >
                {!canAct && (
                  <p className="mb-4 rounded-xl bg-ink/[0.04] px-3.5 py-2.5 text-sm text-ink/55">
                    This item belongs to a different site. You can view it but not act on it.
                  </p>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => canAct && setStatus("passed")}
                    disabled={!canAct}
                    aria-pressed={status === "passed"}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS} ${
                      status === "passed"
                        ? "border-teal-deep/30 bg-teal/10 text-teal-deep ring-2 ring-teal/20"
                        : "border-ink/10 text-ink/60 hover:bg-ink/[0.04]"
                    }`}
                  >
                    <CheckCircle2 size={20} /> Pass
                  </button>
                  <button
                    type="button"
                    onClick={() => canAct && setStatus("flagged")}
                    disabled={!canAct}
                    aria-pressed={status === "flagged"}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS} ${
                      status === "flagged"
                        ? "border-rose-300 bg-rose-50 text-rose-700 ring-2 ring-rose-200"
                        : "border-ink/10 text-ink/60 hover:bg-ink/[0.04]"
                    }`}
                  >
                    <Flag size={20} /> Flag issue
                  </button>
                </div>

                <div className="mt-auto space-y-3 pt-5">
                  {saveError && (
                    <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
                      {saveError}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={save}
                    disabled={status === "pending" || saving || !canAct}
                    className={`w-full ${BTN_PRIMARY}`}
                  >
                    {saved ? (
                      <>
                        <Check size={14} /> Saved, back to queue
                      </>
                    ) : saving ? (
                      "Saving…"
                    ) : (
                      "Save QC result"
                    )}
                  </button>
                </div>
              </SectionCard>
            </aside>
          </div>
        </div>
      </div>

      <SendMessageModal
        open={pendingMessage !== null}
        title={pendingMessage?.title ?? ""}
        defaultMessage={pendingMessage?.text ?? ""}
        defaultAttachmentUrl={photoUrl ?? undefined}
        onSend={async (text, attachmentUrl) => {
          if (!pendingMessage) return { ok: false, error: "Nothing to send." }
          const result = await sendChatMessage(pendingMessage.threadId, text, attachmentUrl)
          if (result.ok) {
            setPendingMessage(null)
            router.push("/admin/qc")
          }
          return result
        }}
        onSkip={() => {
          setPendingMessage(null)
          router.push("/admin/qc")
        }}
      />
    </>
  )
}