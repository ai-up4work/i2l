// app/admin/purchases/[PurchaseId]/page.tsx
"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { AlertTriangle, ArrowLeft, Check, ChevronRight, ClipboardCopy, ExternalLink, Store } from "lucide-react"

import { STATUS_LABEL, CHANNEL_LABEL } from "@/data/purchases/data"
import { useAdminData } from "@/contexts/AdminDataContext"
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
// order link in the summary strip goes straight back to the real order.
//
// RESTYLE (2026-09): brought in line with /admin/orders/[orderId] and
// /admin/requests/[requestId] (same tokens, Pill/Meta/SectionCard, sticky
// breadcrumb top bar, a colored left-edge accent matching the list row's
// tone system, stretched last cards so both columns end level). Every
// handler and piece of state below is unchanged — only markup/styling.
//
// NOTE: folder is [PurchaseId], not [id] — must match the key destructured
// from useParams() below.

/* ---------- tokens (same as the order detail page) ---------- */

const STATUS_TONE: Record<PurchaseStatus, StatusTone> = {
  needs_purchase: "amber",
  purchased: "teal",
  unavailable: "rose",
}

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
const TONE_ACCENT: Record<StatusTone, string> = {
  teal: "border-l-teal-deep",
  amber: "border-l-gold-deep",
  rose: "border-l-rose-600",
}

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40"
const BTN_PRIMARY = `inline-flex items-center justify-center gap-1.5 rounded-xl bg-teal-deep px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal disabled:cursor-not-allowed disabled:bg-ink/10 disabled:text-ink/35 ${FOCUS}`
const BTN_OUTLINE = `inline-flex items-center justify-center gap-1.5 rounded-xl border border-ink/15 bg-card px-4 py-2 text-sm font-medium text-ink/70 transition-colors hover:bg-ink/[0.04] hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`
const BTN_DANGER = `inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-600/25 bg-red-600/5 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-600/10 ${FOCUS}`
const BTN_DANGER_SOLID = `inline-flex items-center justify-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-ink/10 disabled:text-ink/35 ${FOCUS}`
const FIELD = `rounded-lg border border-ink/10 bg-card px-3 py-2 text-sm text-ink placeholder:text-ink/35 outline-none focus:border-teal/50 focus:ring-2 focus:ring-teal/15 disabled:opacity-60`

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
  className = "",
  children,
}: {
  title: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={`flex flex-col rounded-2xl border border-ink/10 bg-card ${className}`}>
      <header className="px-5 pt-5">
        <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
      </header>
      <div className="flex flex-1 flex-col p-5 pt-4">{children}</div>
    </section>
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
          <h1 className="font-display text-xl text-ink">Purchase not found</h1>
          <p className="mt-1.5 text-sm text-ink/50">We couldn't find a purchase line with that ID.</p>
          <button type="button" onClick={() => router.push("/admin/purchases")} className={`${BTN_OUTLINE} mt-5`}>
            <ArrowLeft size={14} />
            Back to purchases
          </button>
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
  const tone = STATUS_TONE[currentStatus]
  const accent = TONE_ACCENT[tone]

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      {/* Top bar */}
      <div className="sticky top-0 z-20 border-b border-ink/[0.07] bg-parchment/90 backdrop-blur">
        <div className="mx-auto flex max-w-8xl items-center justify-between gap-4 px-6 py-3 lg:px-10">
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
            <Link
              href="/admin/purchases"
              className={`inline-flex items-center gap-1.5 rounded-md font-medium text-ink/55 hover:text-ink ${FOCUS}`}
            >
              <ArrowLeft size={15} />
              Purchases
            </Link>
            <ChevronRight size={14} className="text-ink/25" />
            <span className="truncate font-medium text-ink">{line.productTitle}</span>
          </nav>
        </div>
      </div>

      <div className="mx-auto max-w-8xl px-6 pb-8 pt-6 lg:px-10">
        {/* Summary */}
        <div className={`overflow-hidden rounded-2xl border border-l-4 border-ink/10 bg-card ${accent}`}>
          <div className="flex flex-col gap-5 p-5 sm:flex-row sm:p-6">
            <span className="h-24 w-24 flex-none overflow-hidden rounded-2xl border border-ink/10 bg-parchment/60">
              <Image src={line.productImage} alt="" width={96} height={96} className="h-full w-full object-cover" />
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h1 className="font-display text-2xl leading-tight text-ink">{line.productTitle}</h1>
                <Pill tone={tone}>{STATUS_LABEL[currentStatus]}</Pill>
              </div>
              {line.variant && <p className="mt-1 text-sm text-ink/55">{line.variant}</p>}

              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-ink/[0.07] pt-4 sm:grid-cols-5">
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
                <Meta label="Quantity">{line.quantity}</Meta>
                <Meta label="Channel">{CHANNEL_LABEL[line.channel]}</Meta>
                <Meta label="Age">{line.ageLabel}</Meta>
              </dl>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left: seller, pricing, outcome */}
          <div className="flex flex-col gap-6 lg:col-span-2">
            <SectionCard title="Seller">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-ink/[0.05] text-ink/45">
                    <Store size={18} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{line.sellerName}</p>
                    {/* FIX: was `sellerType === "feed" ? "Feed-integrated" :
                        "Manual-mode"` — but order_seller_type only has two
                        real values ('store'/'individual'), and 'store' maps
                        to "feed" here regardless of whether the seller is
                        actually one of Wishdrop's own onboarded affiliate
                        feeds or just any real online store a customer's
                        link happened to point at (e.g. Amazon). itemSource
                        is already correctly derived from requestLink's
                        presence (see its own doc comment above) and
                        distinguishes exactly this case — a genuine
                        catalogue listing vs a scraped link — so it's the
                        accurate label to use here, not sellerType. */}
                    <p className="text-xs text-ink/50">
                      {line.itemSource === "catalogue" ? "Feed-integrated" : "Scraped link"}
                    </p>
                  </div>
                </div>

                {line.storeUrl ? (
                  <a href={line.storeUrl} target="_blank" rel="noopener noreferrer" className={BTN_PRIMARY}>
                    Open seller page <ExternalLink size={13} />
                  </a>
                ) : line.requestLink ? (
                  // FIX: this is the actual bug report — a Channel 2 item's
                  // real, successfully-scraped link genuinely exists in the
                  // database (order_items.request_link) but PurchaseLine
                  // never carried it through at all (see its own
                  // requestLink doc comment), so this branch never had
                  // anything to render before now.
                  <a href={line.requestLink} target="_blank" rel="noopener noreferrer" className={BTN_PRIMARY}>
                    Open scraped link <ExternalLink size={13} />
                  </a>
                ) : (
                  <span className="text-sm text-ink/45">No store link. Coordinate with the seller directly.</span>
                )}
              </div>
            </SectionCard>

            <SectionCard title="Pricing" className={currentStatus === "needs_purchase" ? "flex-1" : ""}>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-ink/[0.08]">
                <div className="sm:pr-5">
                  <dt className="text-xs text-ink/45">Quoted to customer</dt>
                  <dd className="mt-1 font-display text-xl tabular-nums text-ink">{lkr(line.quotedUnitPriceLKR)}</dd>
                  <p className="text-xs text-ink/40">per unit</p>
                </div>
                <div className="sm:px-5">
                  <dt className="text-xs text-ink/45">Quoted line total</dt>
                  <dd className="mt-1 font-display text-xl tabular-nums text-ink">
                    {lkr(line.quotedUnitPriceLKR * line.quantity)}
                  </dd>
                  <p className="text-xs text-ink/40">
                    {line.quantity} {line.quantity === 1 ? "unit" : "units"}
                  </p>
                </div>
                <div className="sm:pl-5">
                  <dt className="text-xs text-ink/45">Actually paid</dt>
                  <dd className="mt-1 font-display text-xl tabular-nums text-ink">
                    {currentStatus !== "needs_purchase" && line.actualUnitPriceINR != null
                      ? lkr(line.actualUnitPriceINR)
                      : "—"}
                  </dd>
                  <p className="text-xs text-ink/40">per unit</p>
                </div>
              </dl>

              {/* FIX: this banner used to compare actualUnitPriceINR
                  directly against quotedUnitPriceINR (now
                  quotedUnitPriceLKR) as if they were the same currency —
                  see priceDrift's own comment above for why that
                  comparison was meaningless and has been disabled rather
                  than displayed. Removed here for the same reason rather
                  than left showing a number that doesn't mean anything. */}
            </SectionCard>

            {currentStatus !== "needs_purchase" && (
              <SectionCard title="Outcome" className="flex-1">
                {currentStatus === "purchased" ? (
                  <p className="flex items-center gap-2 rounded-xl bg-teal/10 px-4 py-3 text-sm font-medium text-teal-deep">
                    <ClipboardCopy size={15} className="shrink-0" />
                    Purchased{line.purchasedBy ? ` by ${line.purchasedBy}` : ""}
                    {line.purchasedAt ? ` on ${new Date(line.purchasedAt).toLocaleDateString()}` : ""}.
                  </p>
                ) : (
                  <div className="rounded-xl bg-rose-50 px-4 py-3">
                    <p className="flex items-center gap-2 text-sm font-semibold text-rose-700">
                      <AlertTriangle size={15} className="shrink-0" /> Flagged unavailable
                    </p>
                    {line.issueNote && (
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink/70">
                        {line.issueNote}
                      </p>
                    )}
                  </div>
                )}
              </SectionCard>
            )}
          </div>

          {/* Right: actions */}
          <aside className="flex flex-col gap-6">
            <SectionCard title="Action" className="flex-1">
              <div>
                {!canAct && currentStatus === "needs_purchase" && (
                  <p className="text-sm text-ink/50">
                    This line belongs to a different site. You can view it but not act on it.
                  </p>
                )}

                {canAct && currentStatus === "needs_purchase" && mode === "idle" && (
                  <div className="flex flex-col gap-2">
                    <button type="button" onClick={() => setMode("confirming_purchase")} className={`w-full ${BTN_PRIMARY}`}>
                      Mark as purchased
                    </button>
                    <button type="button" onClick={() => setMode("confirming_issue")} className={`w-full ${BTN_DANGER}`}>
                      Flag as unavailable
                    </button>
                  </div>
                )}

                {mode === "confirming_purchase" && (
                  <div>
                    <label htmlFor="actual-price" className="text-sm font-medium text-ink/70">
                      Actual price paid (per unit)
                    </label>
                    <div className="relative mt-1.5">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink/40">
                        Rs
                      </span>
                      <input
                        id="actual-price"
                        type="number"
                        value={actualPrice}
                        onChange={(e) => setActualPrice(e.target.value)}
                        className={`w-full pl-9 ${FIELD}`}
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
                        className={`flex-1 ${BTN_PRIMARY}`}
                      >
                        <Check size={14} /> Confirm
                      </button>
                      <button type="button" onClick={() => setMode("idle")} className={BTN_OUTLINE}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {mode === "confirming_issue" && (
                  <div>
                    <label htmlFor="issue-note" className="text-sm font-medium text-ink/70">
                      What happened?
                    </label>
                    <textarea
                      id="issue-note"
                      value={issueNote}
                      onChange={(e) => setIssueNote(e.target.value)}
                      rows={3}
                      placeholder="e.g. Out of stock on seller site, no restock date"
                      className={`mt-1.5 w-full resize-none ${FIELD}`}
                    />
                    <p className="mt-1.5 text-xs text-ink/45">
                      {line.chatThreadId
                        ? "You'll get a chance to review the message to the customer before it sends."
                        : "This customer has no chat thread on file yet, so no message can be sent automatically. Follow up with them directly."}
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
                        className={`flex-1 ${BTN_DANGER_SOLID}`}
                      >
                        Confirm unavailable
                      </button>
                      <button type="button" onClick={() => setMode("idle")} className={BTN_OUTLINE}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {currentStatus === "purchased" && mode === "idle" && (
                  <p className="flex items-center gap-2 rounded-xl bg-teal/10 px-4 py-3 text-sm font-medium text-teal-deep">
                    <Check size={15} className="shrink-0" /> Resolved. No further action needed.
                  </p>
                )}

                {currentStatus === "unavailable" && mode === "idle" && (
                  <p className="text-sm text-ink/55">
                    Marked unavailable. Coordinate a re-quote or refund with the customer directly for now.
                  </p>
                )}
              </div>

              <div className="mt-auto border-t border-ink/[0.07] pt-4">
                <Link href={`/admin/orders/${line.orderId}`} className={`w-full ${BTN_OUTLINE}`}>
                  View full order <ExternalLink size={14} />
                </Link>
              </div>
            </SectionCard>
          </aside>
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
  )
}