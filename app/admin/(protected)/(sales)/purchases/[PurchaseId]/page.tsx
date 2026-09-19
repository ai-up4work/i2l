// app/admin/purchases/[PurchaseId]/page.tsx
"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ClipboardCopy,
  ExternalLink,
  ShoppingBag,
  Store,
} from "lucide-react"

import { STATUS_LABEL, CHANNEL_LABEL } from "@/data/purchases/data"
import { useAdminData } from "@/contexts/AdminDataContext"
import { panelClass } from "@/components/admin/seller/shared"
import type { PurchaseStatus } from "@/types/admin"
import type { StatusTone } from "@/components/admin/warehouse/status-pill"
import { SendMessageModal } from "@/components/admin/SendMessageModal"
import { purchaseFailedMessage, formatItemLabel } from "@/lib/chat/customerMessageTemplates"

// Purchase detail — everything ops needs to go buy one line item and record
// the outcome. Two terminal actions: mark purchased (records actual price
// paid, since quoted vs. paid can drift) or flag unavailable (free-text
// reason). Flagging unavailable now offers a SendMessageModal draft to the
// customer's chat thread (line.chatThreadId — set for every order at
// creation regardless of channel now; see Order.chatThreadId's doc comment
// in types/admin.ts), editable before it sends, same pattern as the
// request detail page's quote/payment messages.
//
// Backed by AdminDataContext, same as the order detail page — marking a
// line here is immediately reflected on the Purchases list, and the
// order-context strip above links straight back to the real order.
//
// RESTYLE (2026-09): brought in line with the Requests/Reports detail
// pages — icon header, panelClass panels, a colored left-edge accent
// matching the list row's tone system, and actions moved into a
// dedicated sidebar instead of stacked under the pricing panel.
//
// NOTE: folder is [PurchaseId], not [id] — must match the key destructured
// from useParams() below.

const STATUS_TONE: Record<PurchaseStatus, StatusTone> = {
  needs_purchase: "amber",
  purchased: "teal",
  unavailable: "rose",
}

const TONE_PILL: Record<StatusTone, string> = {
  teal: "bg-teal/12 text-teal-deep ring-1 ring-inset ring-teal/25",
  amber: "bg-gold/15 text-gold-deep ring-1 ring-inset ring-gold/30",
  rose: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200",
}
const TONE_DOT: Record<StatusTone, string> = {
  teal: "bg-teal-deep",
  amber: "bg-gold-deep",
  rose: "bg-rose-600",
}
const TONE_ACCENT: Record<StatusTone, string> = {
  teal: "border-l-teal-deep",
  amber: "border-l-gold-deep",
  rose: "border-l-rose-600",
}

function StatusChip({ status }: { status: PurchaseStatus }) {
  const tone = STATUS_TONE[status]
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${TONE_PILL[tone]}`}>
      <span className={`h-1.5 w-1.5 flex-none rounded-full ${TONE_DOT[tone]}`} />
      {STATUS_LABEL[status]}
    </span>
  )
}

function inr(n: number) {
  return `₹${n.toLocaleString("en-IN")}`
}

// FIX: "Quoted to customer" was using inr() — but that value
// (quotedUnitPriceLKR) is the real LKR price quoted to the customer,
// not an INR seller cost. Matches the "Rs. X,XXX" format used
// everywhere else in the admin panel for a genuine LKR amount. Kept
// distinct from inr() above, which stays correct for actualUnitPriceINR
// — a real, separately-captured INR value for what was actually paid to
// the Indian seller.
function lkr(n: number) {
  return `Rs. ${n.toLocaleString()}`
}

export default function PurchaseDetailPage() {
  const params = useParams<{ PurchaseId: string }>()
  const router = useRouter()
  const { getPurchaseLine, canActOnPurchaseLine, markPurchased, flagUnavailable, sendChatMessage, dataLoading } = useAdminData()

  const purchaseId = decodeURIComponent(params.PurchaseId)
  const line = getPurchaseLine(purchaseId)

  // Pre-fills with quotedUnitPriceLKR — a deliberate product decision,
  // not an oversight: staff want a starting number to edit rather than
  // typing from scratch, even though it's technically a different
  // currency (LKR quoted vs. INR actually paid — see
  // PurchaseLine.quotedUnitPriceLKR's own doc comment). No real
  // INR<->LKR conversion rate exists in this codebase to pre-fill a
  // genuinely converted estimate instead, so this is the quoted number
  // as-is, edited by hand to the real amount paid.
  const [actualPrice, setActualPrice] = useState(line?.quotedUnitPriceLKR?.toString() ?? "")
  const [issueNote, setIssueNote] = useState(line?.issueNote ?? "")
  const [mode, setMode] = useState<"idle" | "confirming_purchase" | "confirming_issue">("idle")
  const [pendingMessage, setPendingMessage] = useState<{ title: string; text: string; threadId: string } | null>(null)

  if (dataLoading) {
    return (
      <div className="h-full overflow-y-auto bg-parchment">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <div className="h-40 animate-pulse rounded-2xl border border-ink/10 bg-card/60" />
        </div>
      </div>
    )
  }

  if (!line) {
    return (
      <div className="h-full overflow-y-auto bg-parchment">
        <div className="mx-auto max-w-3xl px-6 py-16 text-center">
          <p className="text-sm text-ink/50">Purchase not found.</p>
          <Link href="/admin/purchases" className="mt-4 inline-block text-sm font-semibold text-teal-deep hover:underline">
            Back to Purchases
          </Link>
        </div>
      </div>
    )
  }

  const currentStatus = line.status
  const canAct = canActOnPurchaseLine(line)
  const trimmedPrice = actualPrice.trim()
  // FIX: this used to be `Number(trimmedPrice) - line.quotedUnitPriceINR`
  // — subtracting a real INR amount (what the admin is typing in, the
  // actual price paid to the seller) from a real LKR amount (the
  // customer-facing quote), as if they were the same currency. Every
  // "X more/less than quoted" banner this fed was therefore a
  // meaningless number, not a genuine price comparison. Disabled rather
  // than "fixed" — a real version of this needs an actual INR<->LKR
  // conversion rate, which doesn't exist anywhere in this codebase (see
  // lib/currency.ts) to convert one side before comparing. Kept as a
  // named `null` (not deleted outright) so the JSX below, which already
  // correctly no-ops when this is null, needs no further changes, and
  // so reviving this later is a one-line change once a real rate exists.
  const priceDrift = null as number | null
  const accent = TONE_ACCENT[STATUS_TONE[currentStatus]]

  return (
    <div className="h-full overflow-y-auto bg-parchment">
    <div className="mx-auto max-w-8xl px-6 pb-20 pt-8 lg:px-10">
      <button
        type="button"
        onClick={() => router.push("/admin/purchases")}
        className="flex items-center gap-1.5 text-sm font-medium text-ink/50 hover:text-ink"
      >
        <ArrowLeft size={14} /> Purchases
      </button>

      {/* ── Header / summary strip ── */}
      <div className={`mt-4 overflow-hidden border-l-4 ${accent} ${panelClass}`}>
        <div className="flex flex-col gap-5 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 flex-none place-items-center rounded-2xl border border-ink/10 bg-card text-teal-deep">
              <ShoppingBag size={22} strokeWidth={1.75} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-xl text-ink">{line.productTitle}</h1>
                <StatusChip status={currentStatus} />
              </div>
              {line.variant && <p className="mt-1 text-sm text-ink/50">{line.variant}</p>}
              <p className="mt-1 text-xs text-ink/45">
                Qty {line.quantity} · {CHANNEL_LABEL[line.channel]}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 border-t border-ink/10 pt-4 text-sm lg:border-t-0 lg:border-l lg:pl-6 lg:pt-0">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/35">Order</p>
              <Link
                href={`/admin/orders/${line.orderId}`}
                className="mt-0.5 flex items-center gap-1 font-display text-lg text-teal-deep hover:underline"
              >
                {line.orderNumber} <ExternalLink size={13} />
              </Link>
              <p className="text-xs text-ink/45">{line.customerName}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/35">Age</p>
              <p className="mt-0.5 font-display text-lg text-ink">{line.ageLabel}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: product, seller, pricing, history */}
        <div className="space-y-5 lg:col-span-2">
          {/* Product + seller */}
          <div className={`overflow-hidden ${panelClass}`}>
            <div className="border-b border-ink/10 px-5 py-3.5">
              <h2 className="text-sm font-semibold text-ink/70">Product</h2>
            </div>
            <div className="flex gap-4 px-5 py-4">
              <span className="h-20 w-20 flex-none overflow-hidden rounded-xl border border-ink/10 bg-ink/[0.04]">
                <Image src={line.productImage} alt="" width={80} height={80} className="h-full w-full object-cover" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-base font-semibold text-ink">{line.productTitle}</p>
                {line.variant && <p className="mt-0.5 text-sm text-ink/50">{line.variant}</p>}
                <p className="mt-1 text-sm text-ink/50">Qty {line.quantity}</p>
              </div>
            </div>

            <div className="mx-5 mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/[0.08] bg-parchment/50 px-4 py-3">
              <span className="flex items-center gap-2 text-sm text-ink/70">
                <Store size={15} className="text-ink/35" />
                {line.sellerName}
                <span className="text-ink/25">·</span>
                {/* FIX: was `sellerType === "feed" ? "Feed-integrated" :
                    "Manual-mode"` — but order_seller_type only has two
                    real values ('store'/'individual'), and 'store' maps
                    to "feed" here regardless of whether the seller is
                    actually one of WishDrop's own onboarded affiliate
                    feeds or just any real online store a customer's
                    link happened to point at (e.g. Amazon). itemSource
                    is already correctly derived from requestLink's
                    presence (see its own doc comment above) and
                    distinguishes exactly this case — a genuine
                    catalogue listing vs a scraped link — so it's the
                    accurate label to use here, not sellerType. */}
                <span className="text-ink/45">{line.itemSource === "catalogue" ? "Feed-integrated" : "Scraped link"}</span>
              </span>
              {line.storeUrl ? (
                <a
                  href={line.storeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-deep"
                >
                  Open seller page <ExternalLink size={13} />
                </a>
              ) : line.requestLink ? (
                // FIX: this is the actual bug report — a Channel 2 item's
                // real, successfully-scraped link genuinely exists in the
                // database (order_items.request_link) but PurchaseLine
                // never carried it through at all (see its own
                // requestLink doc comment), so this branch never had
                // anything to render before now.
                <a
                  href={line.requestLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-deep"
                >
                  Open scraped link <ExternalLink size={13} />
                </a>
              ) : (
                <span className="text-xs text-ink/40">No store link — coordinate with seller directly</span>
              )}
            </div>
          </div>

          {/* Pricing */}
          <div className={`overflow-hidden ${panelClass}`}>
            <div className="border-b border-ink/10 px-5 py-3.5">
              <h2 className="text-sm font-semibold text-ink/70">Pricing</h2>
            </div>
            <div className="grid grid-cols-2 divide-x divide-ink/10 px-5 py-4">
              <div>
                <p className="text-xs font-semibold text-ink/40">Quoted to customer</p>
                <p className="mt-1 font-display text-lg text-ink">{lkr(line.quotedUnitPriceLKR)}</p>
                <p className="text-xs text-ink/35">per unit</p>
              </div>
              <div className="pl-5">
                <p className="text-xs font-semibold text-ink/40">Actually paid</p>
                <p className="mt-1 font-display text-lg text-ink">
                  {currentStatus !== "needs_purchase" && line.actualUnitPriceINR != null
                    ? lkr(line.actualUnitPriceINR)
                    : "—"}
                </p>
                <p className="text-xs text-ink/35">per unit</p>
              </div>
            </div>

            {/* FIX: this banner used to compare actualUnitPriceINR
                directly against quotedUnitPriceINR (now
                quotedUnitPriceLKR) as if they were the same currency —
                see priceDrift's own comment above for why that
                comparison was meaningless and has been disabled rather
                than displayed. Removed here for the same reason rather
                than left showing a number that doesn't mean anything. */}
          </div>

          {/* Outcome / history */}
          {currentStatus !== "needs_purchase" && (
            <div className={`overflow-hidden ${panelClass}`}>
              <div className="border-b border-ink/10 px-5 py-3.5">
                <h2 className="text-sm font-semibold text-ink/70">Outcome</h2>
              </div>
              <div className="px-5 py-4">
                {currentStatus === "purchased" ? (
                  <p className="flex items-center gap-2 text-sm text-teal-deep">
                    <ClipboardCopy size={15} />
                    Purchased{line.purchasedBy ? ` by ${line.purchasedBy}` : ""}
                    {line.purchasedAt ? ` on ${new Date(line.purchasedAt).toLocaleDateString()}` : ""}.
                  </p>
                ) : (
                  <div>
                    <p className="flex items-center gap-2 text-sm font-medium text-rose-700">
                      <AlertTriangle size={15} /> Flagged unavailable
                    </p>
                    {line.issueNote && (
                      <p className="mt-2 rounded-lg bg-rose-50/60 px-3 py-2 text-sm leading-relaxed text-ink/70">
                        {line.issueNote}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: actions sidebar */}
        <div className="flex flex-col gap-6">
          <div className={`overflow-hidden ${panelClass}`}>
            <div className="border-b border-ink/10 px-5 py-3.5">
              <h2 className="text-sm font-semibold text-ink/70">Action</h2>
            </div>
            <div className="px-5 py-4">
              {!canAct && currentStatus === "needs_purchase" && (
                <p className="text-sm text-ink/40">
                  This line belongs to a different site — you can view it but not act on it.
                </p>
              )}

              {canAct && currentStatus === "needs_purchase" && mode === "idle" && (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setMode("confirming_purchase")}
                    className="w-full rounded-lg bg-teal px-3.5 py-2 text-sm font-semibold text-white hover:bg-teal-deep"
                  >
                    Mark as purchased
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("confirming_issue")}
                    className="w-full rounded-lg border border-red-600/25 bg-red-600/5 px-3.5 py-2 text-sm font-semibold text-red-700 hover:bg-red-600/10"
                  >
                    Flag as unavailable
                  </button>
                </div>
              )}

              {mode === "confirming_purchase" && (
                <div>
                  <label className="text-xs font-semibold text-ink/50">Actual price paid (per unit)</label>
                  <div className="relative mt-1">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink/35">
                      Rs
                    </span>
                    <input
                      type="number"
                      value={actualPrice}
                      onChange={(e) => setActualPrice(e.target.value)}
                      className="w-full rounded-lg border border-ink/15 bg-white py-2 pl-8 pr-3 text-sm text-ink outline-none focus:border-teal/50"
                    />
                  </div>
                  {priceDrift !== null && priceDrift !== 0 && (
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700">
                      <AlertTriangle size={12} className="mt-0.5 flex-none" />
                      {priceDrift > 0
                        ? `${inr(priceDrift)} more than quoted.`
                        : `${inr(Math.abs(priceDrift))} less than quoted.`}
                    </p>
                  )}
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        markPurchased(line.orderId, line.orderItemId, Number(actualPrice))
                        setMode("idle")
                      }}
                      disabled={trimmedPrice === ""}
                      className="flex-1 rounded-lg bg-teal px-3.5 py-2 text-sm font-semibold text-white hover:bg-teal-deep disabled:cursor-not-allowed disabled:bg-ink/10 disabled:text-ink/35"
                    >
                      <span className="flex items-center justify-center gap-1.5">
                        <Check size={14} /> Confirm
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("idle")}
                      className="rounded-lg border border-ink/15 bg-white px-3.5 py-2 text-sm font-semibold text-ink/60 hover:bg-parchment/60"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {mode === "confirming_issue" && (
                <div>
                  <label className="text-xs font-semibold text-ink/50">What happened?</label>
                  <textarea
                    value={issueNote}
                    onChange={(e) => setIssueNote(e.target.value)}
                    rows={3}
                    placeholder="e.g. Out of stock on seller site, no restock date"
                    className="mt-1 w-full resize-none rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none placeholder:text-ink/35 focus:border-teal/50"
                  />
                  <p className="mt-1.5 text-xs text-ink/40">
                    {line.chatThreadId
                      ? "You'll get a chance to review the message to the customer before it sends."
                      : "This customer has no chat thread on file yet, so no message can be sent automatically — follow up with them directly."}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        flagUnavailable(line.orderId, line.orderItemId, issueNote)
                        setMode("idle")
                        if (line.chatThreadId) {
                          setPendingMessage({
                            title: "Let the customer know?",
                            text: purchaseFailedMessage(line.orderId, formatItemLabel(line.productTitle, line.variant), issueNote),
                            threadId: line.chatThreadId,
                          })
                        }
                      }}
                      disabled={!issueNote.trim()}
                      className="flex-1 rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-ink/10 disabled:text-ink/35"
                    >
                      Confirm unavailable
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("idle")}
                      className="rounded-lg border border-ink/15 bg-white px-3.5 py-2 text-sm font-semibold text-ink/60 hover:bg-parchment/60"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {currentStatus === "purchased" && mode === "idle" && (
                <p className="flex items-center gap-2 text-sm text-teal-deep">
                  <Check size={15} /> Resolved — no further action needed.
                </p>
              )}

              {currentStatus === "unavailable" && mode === "idle" && (
                <p className="text-sm text-ink/50">
                  Marked unavailable. Coordinate a re-quote or refund with the customer directly for now.
                </p>
              )}
            </div>
          </div>

          <Link
            href={`/admin/orders/${line.orderId}`}
            className="flex items-center justify-center gap-2 rounded-xl border border-ink/10 bg-card px-4 py-3 text-sm font-semibold text-teal-deep hover:bg-parchment/60"
          >
            View full order <ExternalLink size={14} />
          </Link>
        </div>
      </div>

      <SendMessageModal
        open={pendingMessage !== null}
        title={pendingMessage?.title ?? ""}
        defaultMessage={pendingMessage?.text ?? ""}
        onSend={async (text, attachmentUrl) => {
          if (!pendingMessage) return { ok: false, error: "Nothing to send." }
          const result = await sendChatMessage(pendingMessage.threadId, text, attachmentUrl)
          if (result.ok) setPendingMessage(null)
          return result
        }}
        onSkip={() => setPendingMessage(null)}
      />
    </div>
    </div>
  )
}