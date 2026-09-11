// app/admin/qc/[id]/page.tsx
"use client"

import { useState } from "react"
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
  Store,
} from "lucide-react"

import {
  getQCRows,
  isOrderAgeBreached,
  QC_STATUS_LABEL,
  type QCStatus,
} from "@/data/qc/data"
import { CHANNEL_LABEL } from "@/data/purchases/data"
import type { StatusTone } from "@/components/admin/warehouse/status-pill"
import { panelClass, groupClass, SectionHeading } from "@/components/admin/seller/shared"

// QCStatus only ever holds pending | passed | flagged — there's no separate
// "failed" state — so the verdict control below is a single Pass/Flag pair
// rather than three overlapping buttons. Flagging is the escalation *and*
// the negative verdict at once; the note attached to it is what feeds the
// customer chat thread (see TODO in save()).

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
  const row = getQCRows().find((r) => r.id === params.id)

  const [status, setStatus] = useState<QCStatus>(row?.status ?? "pending")
  const [note, setNote] = useState(row?.note ?? "")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  if (!row) {
    return (
      <div className="min-h-screen bg-parchment font-body text-ink">
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

  const { purchase } = row
  const breached = isOrderAgeBreached(row.orderAgeHours)
  const tone = STATUS_TONE_FOR[status]

  function save() {
    // TODO: PATCH /api/admin/qc/{row.id} { status, note, siteId }
    // A "flagged" result should route into the customer chat thread tied to
    // this order (§4.5) rather than sit silently — surfacing that is ops'
    // job from here, not this screen's.
    setSaving(true)
    window.setTimeout(() => {
      setSaving(false)
      setSaved(true)
      window.setTimeout(() => router.push("/admin/qc"), 700)
    }, 400)
  }

  return (
    <div className="min-h-screen bg-parchment font-body text-ink">
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
              <Image
                src={purchase.productImage}
                alt=""
                width={56}
                height={56}
                className="h-full w-full object-cover"
              />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="font-display text-2xl leading-tight text-ink">{purchase.productTitle}</h1>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE_PILL[tone]}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} />
                  {QC_STATUS_LABEL[status]}
                </span>
              </div>
              {purchase.variant && <p className="mt-1 text-sm text-ink/50">{purchase.variant}</p>}
            </div>
          </div>

          {breached && (
            <span className="inline-flex flex-none items-center gap-1.5 self-start rounded-full bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200 sm:self-center">
              {row.orderAgeLabel} old — over SLA
            </span>
          )}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* ---------------- Order details ---------------- */}
          <section className={`flex flex-col gap-5 p-6 lg:col-span-2 ${panelClass}`}>
            <SectionHeading title="Order details" subtitle="What arrived, from where, and how long it's been waiting." />

            <dl className="grid grid-cols-1 gap-3.5 text-sm sm:grid-cols-2">
              <SummaryRow term="Order" value={purchase.orderNumber} />
              <SummaryRow term="Customer" value={purchase.customerName} />
              <SummaryRow
                term="Seller"
                value={
                  <span className="flex items-center gap-1.5">
                    <Store size={13} className="text-ink/30" />
                    {purchase.sellerName}
                  </span>
                }
              />
              <SummaryRow term="Channel" value={CHANNEL_LABEL[purchase.channel]} />
              <SummaryRow term="Quantity" value={String(purchase.quantity)} />
              <SummaryRow term="Arrived at QC" value={`${row.arrivedAgo} ago · ${row.site}`} />
              <SummaryRow
                term="Order age"
                value={<span className={breached ? "font-semibold text-rose-700" : ""}>{row.orderAgeLabel} since placed</span>}
              />
            </dl>

            <Link
              href={`/admin/purchases/${purchase.id}`}
              className="flex w-fit items-center gap-1 text-xs font-semibold text-teal-deep hover:underline"
            >
              View purchase record
              <ExternalLink size={11} />
            </Link>

            <div className="border-t border-ink/10 pt-5">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink/35">
                Inspection note
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Describe any defect, or leave a note for the customer chat"
                className="w-full resize-none rounded-xl border border-ink/10 bg-white/60 p-3 text-sm text-ink placeholder:text-ink/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/40"
              />
              {status === "flagged" && !note.trim() && (
                <p className="mt-1.5 text-xs text-gold-deep">
                  Add a note describing the issue — this is what shows up in the customer chat thread.
                </p>
              )}
            </div>

            <button
              type="button"
              className={`flex items-center gap-2 p-3 text-left text-sm text-ink/50 transition-colors hover:bg-ink/[0.02] hover:text-ink border-dashed ${groupClass}`}
            >
              <Camera size={15} className="flex-none" />
              {row.photoCount > 0
                ? `${row.photoCount} photo${row.photoCount > 1 ? "s" : ""} attached — add more`
                : "Attach inspection photo"}
            </button>
          </section>

          {/* ---------------- Verdict ---------------- */}
          <section className={`flex flex-col gap-5 p-6 ${panelClass}`}>
            <SectionHeading title="Result" subtitle="Pick one — flagging routes this to the customer chat thread." />

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setStatus("passed")}
                className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition-colors ${
                  status === "passed"
                    ? "border-teal-deep/25 bg-teal/[0.1] text-teal-deep"
                    : "border-ink/10 text-ink/60 hover:bg-ink/[0.04]"
                }`}
              >
                <CheckCircle2 size={15} /> Pass
              </button>
              <button
                type="button"
                onClick={() => setStatus("flagged")}
                className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition-colors ${
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
              disabled={status === "pending" || saving}
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