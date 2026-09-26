// app/admin/qc-issues/[issueId]/page.tsx
"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  MessageCircle,
  RotateCcw,
  Ticket,
  Truck,
  XCircle,
} from "lucide-react"

import { useAdminData } from "@/contexts/AdminDataContext"
import type { StatusTone } from "@/components/admin/warehouse/status-pill"
import {
  fetchQcIssueWithContext,
  fetchOrderItemPrice,
  setSellerRefundOutcome,
  markQcIssueWhatsappSent,
  issueCompensationCoupon,
  resolveShippedAsIs,
  resolveRetrySame,
  type QcIssueWithContext,
} from "@/lib/supabase/qc-issues"

// RESTYLE (2026-09): brought in line with /admin/orders/[orderId] and the
// other detail pages (same tokens, Pill/Meta/SectionCard, sticky
// breadcrumb top bar, colored left-edge accent, stretched last cards so
// both columns end level). The resolution workflow is the main column;
// what QC found (notes, photo) is the sidebar. Every handler and piece
// of state below is unchanged, except that the old blocking alert()
// calls for failures are now an inline error banner (actionError).

/* ---------- tokens (same as the order detail page) ---------- */

const TONE_PILL: Record<StatusTone, string> = {
  teal: "bg-teal/12 text-teal-deep ring-teal/25",
  amber: "bg-gold/15 text-gold-deep ring-gold/30",
  rose: "bg-rose-50 text-rose-700 ring-rose-200",
}
const TONE_DOT: Record<StatusTone, string> = {
  teal: "bg-teal-deep",
  amber: "bg-gold-deep",
  rose: "bg-rose-600",
}

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40"
const BTN_PRIMARY = `inline-flex items-center justify-center gap-1.5 rounded-xl bg-teal-deep px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal disabled:cursor-not-allowed disabled:bg-ink/15 disabled:text-ink/35 ${FOCUS}`
const BTN_OUTLINE = `inline-flex items-center justify-center gap-1.5 rounded-xl border border-ink/15 bg-card px-4 py-2 text-sm font-medium text-ink/70 transition-colors hover:bg-ink/[0.04] hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`
const FIELD = `rounded-lg border border-ink/10 bg-card px-3 py-2 text-sm text-ink placeholder:text-ink/35 outline-none focus:border-teal/50 focus:ring-2 focus:ring-teal/15 disabled:opacity-60`

const ISSUE_TYPE_LABEL: Record<string, string> = {
  faulty_unit: "Faulty unit",
  inventory_rejected: "Inventory rejected",
  customer_declined: "Customer declined",
}

function buildCustomerWhatsAppLink(phone: string | null, message: string): string | null {
  if (!phone) return null
  const digits = phone.replace(/[^\d]/g, "")
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}

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
        {description && <p className="mt-0.5 text-sm text-ink/55">{description}</p>}
      </header>
      <div className="flex flex-1 flex-col p-5 pt-4">{children}</div>
    </section>
  )
}

// The reject-inventory path really is a sequence (seller refund, then
// telling the customer, then the final action), so its blocks are numbered.
function Step({
  n,
  done,
  title,
  description,
  children,
}: {
  n: number
  done?: boolean
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-4 py-5 first:pt-0 last:pb-0">
      <span
        className={`grid h-7 w-7 flex-none place-items-center rounded-full text-xs font-semibold ${
          done ? "bg-teal-deep text-white" : "bg-ink/[0.06] text-ink/55"
        }`}
      >
        {done ? <Check size={14} strokeWidth={3} /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-ink/55">{description}</p>}
        <div className="mt-3">{children}</div>
      </div>
    </div>
  )
}

export default function QcIssueDetailPage() {
  const params = useParams<{ issueId: string }>()
  const router = useRouter()
  const { currentUser, addInternalNote, reorderFaultyItem, purchases } = useAdminData()

  const [issue, setIssue] = useState<QcIssueWithContext | null>(null)
  const [itemPrice, setItemPrice] = useState<number | null>(null)
  const [customerPhone, setCustomerPhone] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [couponAmount, setCouponAmount] = useState("")
  const [issuedCode, setIssuedCode] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function load() {
    const data = await fetchQcIssueWithContext(params.issueId)
    setIssue(data)
    if (data) {
      const price = await fetchOrderItemPrice(data.orderItemId)
      setItemPrice(price)
      setCouponAmount(price != null ? String(price) : "")
      // BUG FIX: this used to stay null forever — the real phone number
      // comes back on `data.customerPhone` (joined from `profiles.phone`
      // in fetchQcIssueWithContext), but nothing ever copied it into the
      // editable `customerPhone` field below, so the WhatsApp deep-link
      // button silently never rendered and every issue looked like it
      // needed a manually-typed number. Only fill it on the first load
      // so a staffer's own manual correction isn't clobbered by a
      // background refresh.
      setCustomerPhone((prev) => prev ?? data.customerPhone)
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.issueId])

  if (loading) {
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

  if (!issue) {
    return (
      <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
        <div className="mx-auto max-w-3xl px-6 py-24 text-center lg:px-10">
          <h1 className="font-display text-xl text-ink">Issue not found</h1>
          <p className="mt-1.5 text-sm text-ink/50">We couldn&apos;t find a QC issue with that ID.</p>
          <Link href="/admin/qc-issues" className={`${BTN_OUTLINE} mt-5`}>
            <ArrowLeft size={14} />
            Back to QC issues
          </Link>
        </div>
      </div>
    )
  }

  const alreadyResolved = issue.resolution !== "pending"
  // For a 'retry_same' issue specifically: is the replacement done yet?
  // Cross-references this item's CURRENT local purchase state (not the
  // issue row itself, which never changes once written) — "purchased"
  // means it's been bought again and is either awaiting delivery or
  // sitting in QC; "passed" means it's fully done. Reading straight off
  // `purchases` here (rather than re-deriving from order.stage) is what
  // lets this page describe the live in-progress state instead of a
  // static "resolved" badge — matching "that qc issue has to be there
  // so I can see [it]" until the replacement is actually through.
  const replacementPurchase =
    issue.resolution === "retry_same"
      ? purchases.find((p) => p.orderId === issue.orderDisplayId && p.orderItemId === issue.orderItemId)
      : undefined
  const replacementStatus: "awaiting_purchase" | "awaiting_qc" | "passed" | "flagged_again" | null =
    replacementPurchase == null
      ? null
      : replacementPurchase.qcStatus === "passed"
        ? "passed"
        : replacementPurchase.qcStatus === "flagged"
          ? "flagged_again"
          : replacementPurchase.status === "purchased"
            ? "awaiting_qc"
            : "awaiting_purchase"
  const whatsappMessage =
    issue.sellerRefundObtained === true
      ? `Hi ${issue.customerName}, one item from your order ${issue.orderDisplayId} (${issue.itemTitle}) didn't pass our quality check. We've arranged a refund from the seller, so we'll add a coupon of equal value to your account for your next order. Sorry for the inconvenience!`
      : issue.sellerRefundObtained === false
        ? `Hi ${issue.customerName}, one item from your order ${issue.orderDisplayId} (${issue.itemTitle}) had a quality issue during inspection. We weren't able to get a refund or replacement from the seller for it, so it will ship as originally sourced. Let us know if you'd like to discuss.`
        : `Hi ${issue.customerName}, one item from your order ${issue.orderDisplayId} (${issue.itemTitle}) didn't pass our quality check — we're getting a replacement unit from the same seller. This may add a short delay.`
  const waLink = buildCustomerWhatsAppLink(customerPhone, whatsappMessage)

  async function handleRefundOutcome(obtained: boolean) {
    setActionError(null)
    setBusy(true)
    await setSellerRefundOutcome(issue!.id, obtained)
    await load()
    setBusy(false)
  }

  async function handleMarkWhatsappSent() {
    setActionError(null)
    setBusy(true)
    await markQcIssueWhatsappSent(issue!.id)
    await load()
    setBusy(false)
  }

  async function handleIssueCoupon() {
    const amount = Number(couponAmount)
    if (!Number.isFinite(amount) || amount <= 0) return
    setActionError(null)
    setBusy(true)
    const res = await issueCompensationCoupon(issue!.id, issue!.userId, amount, issue!.orderDisplayId)
    setBusy(false)
    if (res.ok && res.code) setIssuedCode(res.code)
    else if (!res.ok) setActionError(res.error ?? "Could not issue coupon")
  }

  async function handleShipAsIs() {
    setActionError(null)
    setBusy(true)
    const res = await resolveShippedAsIs(issue!.id, issue!.userId, issue!.orderDisplayId)
    setBusy(false)
    if (res.ok) router.push("/admin/qc-issues")
    else setActionError(res.error ?? "Could not resolve")
  }

  async function handleRetrySame() {
    setActionError(null)
    setBusy(true)
    const res = await resolveRetrySame(issue!.id, issue!.userId, issue!.orderDisplayId)
    setBusy(false)
    if (!res.ok) {
      setActionError(res.error ?? "Could not resolve")
      return
    }
    // The customer is already notified by resolveRetrySame above. This
    // is the real per-item mechanism: resets this ONE item's purchase
    // record so it reappears on the Purchases queue as its own
    // actionable "needs_purchase" line (see reorderFaultyItem's own doc
    // comment for exactly what it does and doesn't persist). The order
    // itself doesn't advance anywhere else — this item alone drops back
    // out of QC/Pack & label until it's bought again and re-inspected,
    // so the rest of the order can keep moving (or sit ready) without
    // this one faulty item silently slipping through.
    reorderFaultyItem(
      issue!.orderDisplayId,
      issue!.orderItemId,
      `Faulty — QC flagged this unit (issue ${issue!.id.slice(0, 8)}). Re-buying a replacement from the same seller.`
    )
    // Internal note is a secondary, permanent trail on the order itself
    // (unlike the Purchases-queue reset above, this one IS a real write
    // — see addInternalNote — so it survives even a hard refresh).
    addInternalNote(
      issue!.orderDisplayId,
      `🔁 Replacement needed: "${issue!.itemTitle}" didn't pass QC — now back on the Purchases queue for re-buying from the same seller.`
    )
    router.push("/admin/qc-issues")
  }

  const hasDetails = !!(issue.staffNote || issue.customerNote || issue.photoUrl)

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      {/* Top bar */}
      <div className="sticky top-0 z-20 border-b border-ink/[0.07] bg-parchment/90 backdrop-blur">
        <div className="mx-auto flex max-w-8xl items-center justify-between gap-4 px-6 py-3 lg:px-10">
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
            <Link
              href="/admin/qc-issues"
              className={`inline-flex items-center gap-1.5 rounded-md font-medium text-ink/55 hover:text-ink ${FOCUS}`}
            >
              <ArrowLeft size={15} />
              QC issues
            </Link>
            <ChevronRight size={14} className="text-ink/25" />
            <span className="truncate font-medium text-ink">{issue.orderDisplayId}</span>
          </nav>

          <Link href={`/admin/orders/${issue.orderDisplayId}`} className={BTN_OUTLINE}>
            View order
            <ExternalLink size={13} />
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-8xl px-6 pb-8 pt-6 lg:px-10">
        {/* Summary */}
        <div
          className={`overflow-hidden rounded-2xl border border-l-4 border-ink/10 bg-card ${
            alreadyResolved ? "border-l-teal-deep" : "border-l-rose-600"
          }`}
        >
          <div className="flex flex-col gap-5 p-5 sm:flex-row sm:p-6">
            {issue.itemImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={issue.itemImage}
                alt=""
                className="h-24 w-24 flex-none rounded-2xl border border-ink/10 bg-parchment/60 object-cover"
              />
            ) : (
              <div className="h-24 w-24 flex-none rounded-2xl border border-ink/10 bg-parchment/60" />
            )}

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h1 className="font-display text-2xl leading-tight text-ink">{issue.itemTitle}</h1>
                <Pill tone="rose">{ISSUE_TYPE_LABEL[issue.issueType] ?? issue.issueType}</Pill>
                {alreadyResolved ? (
                  <Pill tone="teal">Resolved: {issue.resolution.replace("_", " ")}</Pill>
                ) : (
                  <Pill tone="amber">Needs a decision</Pill>
                )}
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-ink/[0.07] pt-4 sm:grid-cols-5">
                <Meta label="Order">
                  <Link
                    href={`/admin/orders/${issue.orderDisplayId}`}
                    className={`inline-flex max-w-full items-center gap-1 rounded text-teal-deep hover:underline ${FOCUS}`}
                  >
                    <span className="truncate">{issue.orderDisplayId}</span>
                    <ExternalLink size={12} className="shrink-0" />
                  </Link>
                </Meta>
                <Meta label="Customer">{issue.customerName}</Meta>
                <Meta label="Item price">{itemPrice != null ? `Rs. ${itemPrice.toLocaleString("en-LK")}` : "—"}</Meta>
                <Meta label="Seller refund">
                  {issue.sellerRefundObtained === true
                    ? "Refunded by seller"
                    : issue.sellerRefundObtained === false
                      ? "No refund"
                      : "Not decided yet"}
                </Meta>
                <Meta label="Customer told">{issue.whatsappSent ? "Sent on WhatsApp" : "Not yet"}</Meta>
              </dl>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Main column: resolution */}
          <div className="flex flex-col gap-6 lg:col-span-2">
            {actionError && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
              >
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                {actionError}
              </p>
            )}

            {alreadyResolved ? (
              issue.resolution === "retry_same" ? (
                <SectionCard title="Replacement" className="flex-1">
                  <div
                    className={`rounded-xl px-4 py-4 text-center ${
                      replacementStatus === "passed"
                        ? "bg-teal/10"
                        : replacementStatus === "flagged_again"
                          ? "bg-rose-50"
                          : "bg-gold/10"
                    }`}
                  >
                    {replacementStatus === "passed" ? (
                      <>
                        <CheckCircle2 className="mx-auto text-teal-deep" size={24} />
                        <p className="mt-2 text-sm font-semibold text-teal-deep">
                          The replacement unit passed QC. This item is clear.
                        </p>
                      </>
                    ) : replacementStatus === "flagged_again" ? (
                      <>
                        <XCircle className="mx-auto text-rose-600" size={24} />
                        <p className="mt-2 text-sm font-semibold text-rose-700">
                          The replacement unit was flagged again on QC. See /admin/qc for the new inspection.
                        </p>
                      </>
                    ) : (
                      <>
                        <RotateCcw className="mx-auto text-gold-deep" size={24} />
                        <p className="mt-2 text-sm font-semibold text-gold-deep">
                          {replacementStatus === "awaiting_qc"
                            ? "Replacement bought. Waiting for it to clear Quality check."
                            : "Waiting on a replacement. It's back on the Purchases queue."}
                        </p>
                      </>
                    )}
                    <p className="mt-1.5 text-sm text-ink/55">
                      This item&apos;s order and its other items aren&apos;t blocked. Only &quot;{issue.itemTitle}&quot;
                      itself is held back from Pack &amp; label until this replacement clears QC.
                    </p>
                  </div>
                  <div className="mt-auto pt-5">
                    <Link href="/admin/purchases" className={BTN_OUTLINE}>
                      View in Purchases
                      <ChevronRight size={14} />
                    </Link>
                  </div>
                </SectionCard>
              ) : (
                <SectionCard title="Resolution" className="flex-1">
                  <p className="flex items-center gap-2 rounded-xl bg-teal/10 px-4 py-3 text-sm font-semibold text-teal-deep">
                    <CheckCircle2 size={16} className="shrink-0" />
                    This issue was resolved via {issue.resolution.replace("_", " ")}.
                  </p>
                </SectionCard>
              )
            ) : (
              <>
                {/* Option: retry same item — no refund decision needed at all */}
                <SectionCard
                  title="Replace the unit"
                  description="Inventory is otherwise fine? Just this one unit was defective. Re-buy from the same seller, no compensation needed."
                >
                  <div>
                    <button type="button" disabled={busy} onClick={handleRetrySame} className={BTN_OUTLINE}>
                      <RotateCcw size={14} /> Retry with a new unit
                    </button>
                  </div>
                </SectionCard>

                {/* Seller refund decision, then WhatsApp, then the final action */}
                <SectionCard
                  title="Reject the inventory"
                  description="Use this when the entire inventory was rejected, not just one unit."
                  className="flex-1"
                >
                  <div className="divide-y divide-ink/[0.07]">
                    <Step
                      n={1}
                      done={issue.sellerRefundObtained !== null}
                      title="Seller refund"
                      description="Did Wishdrop get a real refund from the seller for this item?"
                    >
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleRefundOutcome(true)}
                          aria-pressed={issue.sellerRefundObtained === true}
                          className={`inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-40 ${FOCUS} ${
                            issue.sellerRefundObtained === true
                              ? "border-teal-deep/30 bg-teal/10 text-teal-deep ring-2 ring-teal/20"
                              : "border-ink/15 text-ink/60 hover:bg-ink/[0.04]"
                          }`}
                        >
                          <CheckCircle2 size={14} /> Yes, seller refunded us
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleRefundOutcome(false)}
                          aria-pressed={issue.sellerRefundObtained === false}
                          className={`inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-40 ${FOCUS} ${
                            issue.sellerRefundObtained === false
                              ? "border-rose-300 bg-rose-50 text-rose-700 ring-2 ring-rose-200"
                              : "border-ink/15 text-ink/60 hover:bg-ink/[0.04]"
                          }`}
                        >
                          <XCircle size={14} /> No refund from seller
                        </button>
                      </div>
                    </Step>

                    {/* WhatsApp — required before either compensation path finalizes */}
                    {issue.sellerRefundObtained !== null && (
                      <Step
                        n={2}
                        done={issue.whatsappSent}
                        title="Tell the customer first"
                        description="Send this via WhatsApp before finalizing. It's required before the last step unlocks."
                      >
                        <p className="rounded-xl bg-parchment/60 p-3.5 text-sm leading-relaxed text-ink/75">
                          {whatsappMessage}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          {waLink ? (
                            <a
                              href={waLink}
                              target="_blank"
                              rel="noreferrer"
                              className={`inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 ${FOCUS}`}
                            >
                              <MessageCircle size={14} /> Open WhatsApp
                            </a>
                          ) : (
                            <input
                              value={customerPhone ?? ""}
                              onChange={(e) => setCustomerPhone(e.target.value)}
                              placeholder="Customer phone number"
                              aria-label="Customer phone number"
                              className={`w-56 ${FIELD}`}
                            />
                          )}
                          {issue.whatsappSent ? (
                            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-deep">
                              <CheckCircle2 size={14} /> Sent
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={handleMarkWhatsappSent}
                              className={`rounded-md text-sm font-medium text-ink/55 underline decoration-dotted underline-offset-2 hover:text-ink disabled:opacity-40 ${FOCUS}`}
                            >
                              Mark sent
                            </button>
                          )}
                        </div>
                      </Step>
                    )}

                    {/* Final action, gated on WhatsApp being sent */}
                    {issue.sellerRefundObtained === true && (
                      <Step
                        n={3}
                        done={!!issuedCode}
                        title="Issue compensation coupon"
                        description={`Product value only, never shipping or other items.${
                          itemPrice != null ? ` Item price: Rs. ${itemPrice.toLocaleString("en-LK")}.` : ""
                        }`}
                      >
                        {issuedCode ? (
                          <p className="inline-flex items-center gap-2 rounded-xl bg-teal/10 px-4 py-2.5 text-sm font-semibold text-teal-deep">
                            <Ticket size={14} /> Coupon issued: {issuedCode}
                          </p>
                        ) : (
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-1.5 rounded-lg border border-ink/10 bg-card px-3 py-2 focus-within:border-teal/50 focus-within:ring-2 focus-within:ring-teal/15">
                              <span className="text-sm text-ink/50">Rs.</span>
                              <input
                                value={couponAmount}
                                onChange={(e) => setCouponAmount(e.target.value)}
                                type="number"
                                aria-label="Coupon amount"
                                className="w-28 bg-transparent text-sm tabular-nums text-ink outline-none"
                              />
                            </div>
                            <button
                              type="button"
                              disabled={busy || !issue.whatsappSent}
                              title={!issue.whatsappSent ? "Send the WhatsApp message first" : undefined}
                              onClick={handleIssueCoupon}
                              className={BTN_PRIMARY}
                            >
                              <Ticket size={14} /> Issue coupon
                            </button>
                          </div>
                        )}
                      </Step>
                    )}

                    {issue.sellerRefundObtained === false && (
                      <Step
                        n={3}
                        title="Ship as originally sourced"
                        description="No coupon. Wishdrop can't absorb a cost it didn't recover from the seller."
                      >
                        <button
                          type="button"
                          disabled={busy || !issue.whatsappSent}
                          title={!issue.whatsappSent ? "Send the WhatsApp message first" : undefined}
                          onClick={handleShipAsIs}
                          className={BTN_PRIMARY}
                        >
                          <Truck size={14} /> Ship as-is
                        </button>
                      </Step>
                    )}
                  </div>
                </SectionCard>
              </>
            )}
          </div>

          {/* Sidebar: what QC found */}
          <aside className="flex flex-col gap-6">
            <SectionCard title="What QC found" className="flex-1">
              {hasDetails ? (
                <div className="space-y-5">
                  {issue.staffNote && (
                    <div>
                      <p className="text-sm font-medium text-ink/70">Internal note (ops only)</p>
                      <p className="mt-1.5 whitespace-pre-wrap break-words rounded-xl bg-parchment/60 p-3 text-sm text-ink/70">
                        {issue.staffNote}
                      </p>
                    </div>
                  )}

                  {issue.customerNote && (
                    <div>
                      <p className="text-sm font-medium text-ink/70">Note shown to customer</p>
                      <p className="mt-1.5 whitespace-pre-wrap break-words rounded-xl bg-teal/[0.07] p-3 text-sm text-teal-deep">
                        {issue.customerNote}
                      </p>
                    </div>
                  )}

                  {issue.photoUrl && (
                    <div>
                      <p className="text-sm font-medium text-ink/70">Inspection photo</p>
                      <a
                        href={issue.photoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1.5 block w-fit max-w-full"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={issue.photoUrl}
                          alt="Quality check inspection photo"
                          className="max-h-72 w-auto max-w-full rounded-xl border border-ink/10 object-cover"
                        />
                      </a>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-ink/45">No notes or photo were attached to this issue.</p>
              )}
            </SectionCard>
          </aside>
        </div>
      </div>
    </div>
  )
}