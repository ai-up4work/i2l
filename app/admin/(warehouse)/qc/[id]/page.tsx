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
import { panelClass, groupClass, SectionHeading } from "@/components/admin/seller/shared"

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
const STATUS_TONE_FOR: Record<QCStatus, StatusTone> = {
  pending: "amber",
  passed: "teal",
  flagged: "rose",
}

export default function QCDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { getQcLine, canActOnQcLine, submitQcResult, addQcPhoto, dataLoading, currentUser, addInternalNote, setOrderDelayedExplicit } = useAdminData()
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
        <div className="mx-auto max-w-2xl px-6 pb-20 pt-8">
          <div className="h-40 animate-pulse rounded-2xl border border-ink/10 bg-card/60" />
        </div>
      </div>
    )
  }

  if (!line) {
    return (
      <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
        <div className="mx-auto max-w-2xl px-6 pb-20 pt-8 text-center lg:px-10">
          <p className="mt-16 text-sm text-ink/50">
            This QC line doesn&rsquo;t exist, or isn&rsquo;t in your site&rsquo;s queue.{" "}
            <Link href="/admin/qc" className="font-semibold text-teal-deep underline underline-offset-2">
              Back to Quality check
            </Link>
          </p>
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

    window.setTimeout(() => {
      setSaving(false)
      setSaved(true)
      window.setTimeout(() => router.push("/admin/qc"), 700)
    }, 400)
  }

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      <div className="mx-auto max-w-[1560px] px-6 pb-24 pt-10 lg:px-10">
        <Link
          href="/admin/qc"
          className="flex items-center gap-1.5 text-sm font-semibold text-ink/50 transition-colors hover:text-ink"
        >
          <ArrowLeft size={14} />
          Quality check
        </Link>

        {/* ---------------- Header ---------------- */}
        <div className={`mt-4 flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between ${panelClass}`}>
          <div className="flex items-center gap-4">
            <span className="h-14 w-14 flex-none overflow-hidden rounded-xl border border-ink/10 bg-ink/[0.04]">
              <Image src={line.productImage} alt="" width={56} height={56} className="h-full w-full object-cover" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="font-display text-2xl leading-tight text-ink">{line.productTitle}</h1>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE_PILL[tone]}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} />
                  {QC_STATUS_LABEL[status]}
                </span>
              </div>
              {line.variant && <p className="mt-1 text-sm text-ink/50">{line.variant}</p>}
              {openRetryIssue && (
                <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-gold/15 px-2.5 py-1 text-xs font-semibold text-gold-deep ring-1 ring-inset ring-gold/30">
                  Replacement unit — a fresh pass here closes out the original QC issue
                </p>
              )}
            </div>
          </div>

          {breached && (
            <span className="inline-flex flex-none items-center gap-1.5 self-start rounded-full bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200 sm:self-center">
              {line.orderAgeLabel} old — over SLA
            </span>
          )}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* ---------------- Order details ---------------- */}
          <section className={`flex flex-col gap-5 p-6 lg:col-span-2 ${panelClass}`}>
            <SectionHeading title="Order details" subtitle="What arrived, from where, and how long it's been waiting." />

            <dl className="grid grid-cols-1 gap-3.5 text-sm sm:grid-cols-2">
              <SummaryRow term="Order" value={line.orderNumber} />
              <SummaryRow term="Customer" value={line.customerName} />
              <SummaryRow
                term="Seller"
                value={
                  <span className="flex items-center gap-1.5">
                    <Store size={13} className="text-ink/30" />
                    {line.sellerName}
                  </span>
                }
              />
              <SummaryRow term="Channel" value={CHANNEL_LABEL[line.channel]} />
              <SummaryRow term="Quantity" value={String(line.quantity)} />
              <SummaryRow term="Arrived at QC" value={`${line.arrivedAgo} ago · ${line.site}`} />
              <SummaryRow
                term="Order age"
                value={<span className={breached ? "font-semibold text-rose-700" : ""}>{line.orderAgeLabel} since placed</span>}
              />
            </dl>

            <Link
              href={`/admin/purchases/${purchaseLineId}`}
              className="flex w-fit items-center gap-1 text-xs font-semibold text-teal-deep hover:underline"
            >
              View purchase record
              <ExternalLink size={11} />
            </Link>

            <div className="border-t border-ink/10 pt-5">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink/35">
                Inspection note <span className="normal-case font-normal text-ink/35">(internal only — ops eyes only)</span>
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                disabled={!canAct}
                placeholder="Describe any defect for the internal record — this never reaches the customer"
                className="w-full resize-none rounded-xl border border-ink/10 bg-white/60 p-3 text-sm text-ink placeholder:text-ink/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/40 disabled:opacity-60"
              />
              {status === "flagged" && !note.trim() && (
                <p className="mt-1.5 text-xs text-gold-deep">
                  Add a note describing the issue — this becomes an internal note on the order.
                </p>
              )}
            </div>

            {status === "flagged" && (
              <div className="border-t border-ink/10 pt-5">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink/35">
                  Note for the customer <span className="normal-case font-normal text-ink/35">(optional — they will see this)</span>
                </label>
                <textarea
                  value={customerNote}
                  onChange={(e) => setCustomerNote(e.target.value)}
                  rows={2}
                  disabled={!canAct}
                  placeholder="Plain-language explanation the customer will see on their order page, e.g. “The zipper on this item arrived stuck.”"
                  className="w-full resize-none rounded-xl border border-ink/10 bg-white/60 p-3 text-sm text-ink placeholder:text-ink/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/40 disabled:opacity-60"
                />
              </div>
            )}

            <div className="border-t border-ink/10 pt-5">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink/35">
                Inspection photo
              </label>

              {photoUrl ? (
                <div className="relative w-fit">
                  <Image
                    src={photoUrl}
                    alt="QC inspection photo"
                    width={120}
                    height={120}
                    className="h-28 w-28 rounded-xl border border-ink/10 object-cover"
                  />
                  {canAct && (
                    <button
                      type="button"
                      onClick={() => setPhotoUrl(null)}
                      aria-label="Remove photo"
                      className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-ink text-parchment shadow-[0_2px_6px_rgba(32,36,43,0.3)] transition-opacity hover:opacity-90"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              ) : (
                <label
                  className={`flex items-center gap-2 p-3 text-left text-sm text-ink/50 transition-colors hover:bg-ink/[0.02] hover:text-ink border-dashed ${
                    !canAct || uploading ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                  } ${groupClass}`}
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
              {uploadError && <p className="mt-1.5 text-xs text-rose-600">{uploadError}</p>}
              {status === "flagged" && (
                <p className="mt-1.5 text-xs text-ink/40">
                  If attached, this photo is shown to the customer alongside the note above.
                </p>
              )}
            </div>
          </section>

          {/* ---------------- Verdict ---------------- */}
          <section className={`flex flex-col gap-5 p-6 ${panelClass}`}>
            <SectionHeading title="Result" subtitle="Pick one — flagging leaves a note on the order for ops." />

            {!canAct && (
              <p className="rounded-xl bg-ink/[0.04] px-3.5 py-2.5 text-xs text-ink/50">
                This item belongs to a different site — you can view it but not act on it.
              </p>
            )}

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => canAct && setStatus("passed")}
                disabled={!canAct}
                className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  status === "passed"
                    ? "border-teal-deep/25 bg-teal/[0.1] text-teal-deep"
                    : "border-ink/10 text-ink/60 hover:bg-ink/[0.04]"
                }`}
              >
                <CheckCircle2 size={15} /> Pass
              </button>
              <button
                type="button"
                onClick={() => canAct && setStatus("flagged")}
                disabled={!canAct}
                className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  status === "flagged"
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : "border-ink/10 text-ink/60 hover:bg-ink/[0.04]"
                }`}
              >
                <Flag size={15} /> Flag issue
              </button>
            </div>

            <button
              type="button"
              onClick={save}
              disabled={status === "pending" || saving || !canAct}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-teal-deep px-4 py-2.5 text-sm font-semibold text-parchment shadow-[0_10px_28px_-10px_rgba(11,114,128,0.55)] transition-all hover:bg-teal active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-ink/20 disabled:shadow-none disabled:active:scale-100"
            >
              {saved ? (
                <>
                  <Check size={14} /> Saved — back to queue
                </>
              ) : saving ? (
                "Saving…"
              ) : (
                "Save QC result"
              )}
            </button>
            {saveError && (
              <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">
                {saveError}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function SummaryRow({ term, value }: { term: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink/35">{term}</dt>
      <dd className="mt-0.5 text-ink/80">{value}</dd>
    </div>
  )
}