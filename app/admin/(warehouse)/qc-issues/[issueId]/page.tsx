"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  CheckCircle2,
  MessageCircle,
  PackageCheck,
  RotateCcw,
  Ticket,
  Truck,
  XCircle,
} from "lucide-react"

import { useAdminData } from "@/contexts/AdminDataContext"
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

export default function QcIssueDetailPage() {
  const params = useParams<{ issueId: string }>()
  const router = useRouter()
  const { currentUser, addInternalNote } = useAdminData()

  const [issue, setIssue] = useState<QcIssueWithContext | null>(null)
  const [itemPrice, setItemPrice] = useState<number | null>(null)
  const [customerPhone, setCustomerPhone] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [couponAmount, setCouponAmount] = useState("")
  const [issuedCode, setIssuedCode] = useState<string | null>(null)

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
        <div className="mx-auto max-w-3xl px-6 py-16">
          <div className="h-64 animate-pulse rounded-2xl border border-ink/10 bg-white" />
        </div>
      </div>
    )
  }

  if (!issue) {
    return (
      <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
        <div className="mx-auto max-w-3xl px-6 py-16 text-center">
          <p className="text-sm text-ink/50">Issue not found.</p>
          <Link href="/admin/qc-issues" className="mt-3 inline-block text-sm font-semibold text-teal-deep underline">
            Back to QC Issues
          </Link>
        </div>
      </div>
    )
  }

  const alreadyResolved = issue.resolution !== "pending"
  const whatsappMessage =
    issue.sellerRefundObtained === true
      ? `Hi ${issue.customerName}, one item from your order ${issue.orderDisplayId} (${issue.itemTitle}) didn't pass our quality check. We've arranged a refund from the seller, so we'll add a coupon of equal value to your account for your next order. Sorry for the inconvenience!`
      : issue.sellerRefundObtained === false
        ? `Hi ${issue.customerName}, one item from your order ${issue.orderDisplayId} (${issue.itemTitle}) had a quality issue during inspection. We weren't able to get a refund or replacement from the seller for it, so it will ship as originally sourced. Let us know if you'd like to discuss.`
        : `Hi ${issue.customerName}, one item from your order ${issue.orderDisplayId} (${issue.itemTitle}) didn't pass our quality check — we're getting a replacement unit from the same seller. This may add a short delay.`
  const waLink = buildCustomerWhatsAppLink(customerPhone, whatsappMessage)

  async function handleRefundOutcome(obtained: boolean) {
    setBusy(true)
    await setSellerRefundOutcome(issue!.id, obtained)
    await load()
    setBusy(false)
  }

  async function handleMarkWhatsappSent() {
    setBusy(true)
    await markQcIssueWhatsappSent(issue!.id)
    await load()
    setBusy(false)
  }

  async function handleIssueCoupon() {
    const amount = Number(couponAmount)
    if (!Number.isFinite(amount) || amount <= 0) return
    setBusy(true)
    const res = await issueCompensationCoupon(issue!.id, issue!.userId, amount, issue!.orderDisplayId)
    setBusy(false)
    if (res.ok && res.code) setIssuedCode(res.code)
    else if (!res.ok) alert(res.error ?? "Could not issue coupon")
  }

  async function handleShipAsIs() {
    setBusy(true)
    const res = await resolveShippedAsIs(issue!.id, issue!.userId, issue!.orderDisplayId)
    setBusy(false)
    if (res.ok) router.push("/admin/qc-issues")
    else alert(res.error ?? "Could not resolve")
  }

  async function handleRetrySame() {
    setBusy(true)
    const res = await resolveRetrySame(issue!.id, issue!.userId, issue!.orderDisplayId)
    setBusy(false)
    if (!res.ok) {
      alert(res.error ?? "Could not resolve")
      return
    }
    // The customer is already notified by resolveRetrySame above. This
    // note is the other half: a visible, actionable trail on the order
    // itself for Sales & Purchase to actually go re-buy the item — the
    // real `purchases` table has no per-item column to open a proper
    // re-purchase record against (see mapToPurchases' GRANULARITY NOTE),
    // so an internal note is the most honest thing to write today
    // without a schema change. Once the replacement is bought and
    // physically arrives, this item falls back to "pending" on
    // /admin/qc automatically (loadRealOrders excludes resolved issues
    // from flaggedItemIds) — no separate "mark received" step needed,
    // ops just inspects it again like any other arrival. If ALL of this
    // order's items (including this one, once re-inspected) end up
    // "passed", the order surfaces on Pack & Label the same way any
    // fully-passed order already does — that gating was already
    // order-level ("every item passed"), so nothing else changes there.
    addInternalNote(
      issue!.orderDisplayId,
      `🔁 Replacement needed: "${issue!.itemTitle}" didn't pass QC — re-buy from the same seller. Once it arrives, it'll show back up in Quality check for a fresh inspection.`
    )
    router.push("/admin/qc-issues")
  }

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      <div className="mx-auto max-w-3xl px-6 pb-24 pt-10 lg:px-10">
        <button onClick={() => router.push("/admin/qc-issues")} className="inline-flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink">
          <ArrowLeft size={14} /> Back to QC Issues
        </button>

        {/* Header */}
        <div className="mt-6 flex items-start gap-4 rounded-2xl border border-ink/10 bg-white p-6">
          {issue.itemImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={issue.itemImage} alt="" className="h-16 w-16 flex-none rounded-xl object-cover" />
          ) : (
            <div className="h-16 w-16 flex-none rounded-xl bg-parchment" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-base font-semibold text-ink">{issue.orderDisplayId}</span>
              <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-600 ring-1 ring-inset ring-rose-200">
                {ISSUE_TYPE_LABEL[issue.issueType] ?? issue.issueType}
              </span>
              {alreadyResolved && (
                <span className="rounded-full bg-teal/10 px-2.5 py-0.5 text-xs font-semibold text-teal-deep ring-1 ring-inset ring-teal/25">
                  Resolved: {issue.resolution.replace("_", " ")}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-ink/70">{issue.itemTitle}</p>
            <p className="text-xs text-ink/45">{issue.customerName}</p>

            {issue.staffNote && (
              <div className="mt-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/35">Internal note (ops only)</p>
                <p className="mt-1 rounded-lg bg-parchment/70 p-2.5 text-xs text-ink/60">{issue.staffNote}</p>
              </div>
            )}

            {issue.customerNote && (
              <div className="mt-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/35">Note shown to customer</p>
                <p className="mt-1 rounded-lg bg-teal/[0.06] p-2.5 text-xs text-teal-deep">{issue.customerNote}</p>
              </div>
            )}

            {issue.photoUrl && (
              <div className="mt-3">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink/35">Inspection photo</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={issue.photoUrl}
                  alt="Quality check inspection photo"
                  className="h-28 w-28 rounded-xl border border-ink/10 object-cover"
                />
              </div>
            )}
          </div>
        </div>

        {alreadyResolved ? (
          <div className="mt-6 rounded-2xl border border-teal/25 bg-teal/[0.06] p-6 text-center">
            <CheckCircle2 className="mx-auto text-teal-deep" size={24} />
            <p className="mt-2 text-sm font-semibold text-teal-deep">
              This issue was resolved via {issue.resolution.replace("_", " ")}.
            </p>
          </div>
        ) : (
          <>
            {/* Option: retry same item — no refund decision needed at all */}
            <div className="mt-6 rounded-2xl border border-ink/10 bg-white p-6">
              <h2 className="font-display text-base font-semibold text-ink">Inventory is otherwise fine?</h2>
              <p className="mt-1 text-sm text-ink/60">Just this one unit was defective — re-buy from the same seller, no compensation needed.</p>
              <button
                type="button"
                disabled={busy}
                onClick={handleRetrySame}
                className="mt-3 inline-flex items-center gap-2 rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-ink/[0.04] disabled:opacity-40"
              >
                <RotateCcw size={14} /> Retry with a new unit
              </button>
            </div>

            {/* Seller refund decision */}
            <div className="mt-6 rounded-2xl border border-ink/10 bg-white p-6">
              <h2 className="font-display text-base font-semibold text-ink">Entire inventory rejected?</h2>
              <p className="mt-1 text-sm text-ink/60">Did WishDrop get a real refund from the seller for this item?</p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleRefundOutcome(true)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-40 ${
                    issue.sellerRefundObtained === true ? "border-teal-deep bg-teal/10 text-teal-deep" : "border-ink/15 text-ink/60 hover:bg-ink/[0.04]"
                  }`}
                >
                  <CheckCircle2 size={14} /> Yes, seller refunded us
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleRefundOutcome(false)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-40 ${
                    issue.sellerRefundObtained === false ? "border-rose-500 bg-rose-50 text-rose-600" : "border-ink/15 text-ink/60 hover:bg-ink/[0.04]"
                  }`}
                >
                  <XCircle size={14} /> No refund from seller
                </button>
              </div>
            </div>

            {/* WhatsApp — required before either compensation path finalizes */}
            {issue.sellerRefundObtained !== null && (
              <div className="mt-6 rounded-2xl border border-ink/10 bg-white p-6">
                <h2 className="font-display text-base font-semibold text-ink">Tell the customer first</h2>
                <p className="mt-1 text-sm text-ink/60">Send this via WhatsApp before finalizing — required before the action below unlocks.</p>
                <p className="mt-3 rounded-lg bg-parchment/70 p-3 text-sm text-ink/70">{whatsappMessage}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {waLink ? (
                    <a
                      href={waLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                    >
                      <MessageCircle size={14} /> Open WhatsApp
                    </a>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        value={customerPhone ?? ""}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="Customer phone number"
                        className="rounded-lg border border-ink/15 px-3 py-2 text-sm text-ink outline-none focus:border-teal"
                      />
                    </div>
                  )}
                  {issue.whatsappSent ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-deep">
                      <CheckCircle2 size={13} /> Sent
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleMarkWhatsappSent}
                      className="text-xs font-semibold text-ink/50 underline decoration-dotted underline-offset-2 hover:text-ink disabled:opacity-40"
                    >
                      Mark sent
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Final action, gated on WhatsApp being sent */}
            {issue.sellerRefundObtained === true && (
              <div className="mt-6 rounded-2xl border border-teal/25 bg-teal/[0.05] p-6">
                <h2 className="font-display text-base font-semibold text-ink">Issue compensation coupon</h2>
                <p className="mt-1 text-sm text-ink/60">
                  Product value only — never shipping or other items. {itemPrice != null && <>Item price: Rs. {itemPrice.toLocaleString("en-LK")}.</>}
                </p>
                {issuedCode ? (
                  <p className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-teal-deep">
                    <Ticket size={14} /> Coupon issued: {issuedCode}
                  </p>
                ) : (
                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex items-center gap-1 rounded-lg border border-ink/15 bg-white px-3 py-2">
                      <span className="text-sm text-ink/50">Rs.</span>
                      <input
                        value={couponAmount}
                        onChange={(e) => setCouponAmount(e.target.value)}
                        type="number"
                        className="w-24 bg-transparent text-sm text-ink outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={busy || !issue.whatsappSent}
                      title={!issue.whatsappSent ? "Send the WhatsApp message first" : undefined}
                      onClick={handleIssueCoupon}
                      className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-parchment disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Ticket size={14} /> Issue coupon
                    </button>
                  </div>
                )}
              </div>
            )}

            {issue.sellerRefundObtained === false && (
              <div className="mt-6 rounded-2xl border border-ink/10 bg-white p-6">
                <h2 className="font-display text-base font-semibold text-ink">Ship as originally sourced</h2>
                <p className="mt-1 text-sm text-ink/60">No coupon — WishDrop can't absorb a cost it didn't recover from the seller.</p>
                <button
                  type="button"
                  disabled={busy || !issue.whatsappSent}
                  title={!issue.whatsappSent ? "Send the WhatsApp message first" : undefined}
                  onClick={handleShipAsIs}
                  className="mt-3 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-parchment disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Truck size={14} /> Ship as-is
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}