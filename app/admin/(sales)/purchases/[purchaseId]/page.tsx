// app/admin/purchases/[PurchaseId]/page.tsx
"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { ArrowLeft, ExternalLink, Store, ClipboardCopy, AlertTriangle } from "lucide-react"

import {
  getPurchaseLine,
  STATUS_LABEL,
  STATUS_TONE,
  CHANNEL_LABEL,
  type PurchaseStatus,
} from "@/data/purchases/data"
import { StatusPill } from "@/components/admin/warehouse/status-pill"

// Purchase detail — everything ops needs to go buy one line item and record
// the outcome. Two terminal actions: mark purchased (records actual price
// paid, since quoted vs. paid can drift — see pl_3 in the mock data) or
// flag unavailable (free-text reason; this is what should eventually notify
// the Channel 3 request thread / trigger a customer follow-up, per the
// chat design in the requirements doc — not wired up here since chat isn't
// built yet).
//
// NOTE: folder is [PurchaseId], not [id] — must match the key destructured
// from useParams() below, since Next.js takes the params key from the
// folder name literally. If you rename one, rename the other. (QC's detail
// route uses [id] instead — the two aren't required to match each other,
// just worth knowing they're named differently if you go looking.)
//
// TODO: replace local useState with a real mutation once there's an API.
// Right now marking an action only updates this page's own state — it does
// not write back to the list page, since there's no shared store yet.

export default function PurchaseDetailPage() {
  const params = useParams<{ PurchaseId: string }>()
  const router = useRouter()
  const initial = getPurchaseLine(params.PurchaseId)

  const [status, setStatus] = useState<PurchaseStatus | undefined>(initial?.status)
  const [actualPrice, setActualPrice] = useState(initial?.quotedUnitPriceINR?.toString() ?? "")
  const [issueNote, setIssueNote] = useState(initial?.issueNote ?? "")
  const [mode, setMode] = useState<"idle" | "confirming_purchase" | "confirming_issue">("idle")

  if (!initial) {
    return (
      <div className="px-6 py-10 lg:px-10">
        <p className="text-sm text-ink/50">Purchase not found.</p>
        <Link href="/admin/purchases" className="mt-2 inline-block text-sm font-medium text-teal-deep">
          Back to Purchases
        </Link>
      </div>
    )
  }

  const line = initial
  const currentStatus = status ?? line.status
  const trimmedPrice = actualPrice.trim()
  const priceDrift = trimmedPrice === "" ? null : Number(trimmedPrice) - line.quotedUnitPriceINR

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 lg:px-10">
      <button
        type="button"
        onClick={() => router.push("/admin/purchases")}
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink/50 hover:text-ink"
      >
        <ArrowLeft size={15} />
        Back to Purchases
      </button>

      {/* Order context */}
      <div className="mb-4 flex items-center justify-between rounded-2xl border border-ink/10 bg-card px-4 py-3 text-sm">
        <div>
          <span className="font-medium text-ink">{line.orderNumber}</span>
          <span className="mx-1.5 text-ink/25">·</span>
          <span className="text-ink/60">{line.customerName}</span>
        </div>
        <span className="rounded-full bg-ink/[0.04] px-2.5 py-1 text-xs font-medium text-ink/50">
          {CHANNEL_LABEL[line.channel]}
        </span>
      </div>

      {/* Product + seller */}
      <div className="rounded-2xl border border-ink/10 bg-card p-5">
        <div className="flex gap-4">
          <span className="h-20 w-20 flex-none overflow-hidden rounded-xl bg-ink/[0.04]">
            <Image src={line.productImage} alt="" width={80} height={80} className="h-full w-full object-cover" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-lg font-semibold text-ink">{line.productTitle}</h1>
            {line.variant && <p className="mt-0.5 text-sm text-ink/50">{line.variant}</p>}
            <p className="mt-1 text-sm text-ink/50">Qty {line.quantity}</p>
          </div>
          <StatusPill label={STATUS_LABEL[currentStatus]} tone={STATUS_TONE[currentStatus]} />
        </div>

        <div className="mt-5 flex items-center justify-between rounded-xl border border-ink/[0.06] bg-parchment/40 px-4 py-3">
          <span className="flex items-center gap-2 text-sm text-ink/70">
            <Store size={15} className="text-ink/35" />
            {line.sellerName}
            <span className="text-ink/30">·</span>
            <span className="text-ink/45">{line.sellerType === "feed" ? "Feed-integrated" : "Manual-mode"}</span>
          </span>
          {line.storeUrl ? (
            <a
              href={line.storeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-deep"
            >
              Open seller page
              <ExternalLink size={13} />
            </a>
          ) : (
            <span className="text-xs text-ink/40">No store link — coordinate with seller directly</span>
          )}
        </div>
      </div>

      {/* Pricing */}
      <div className="mt-4 rounded-2xl border border-ink/10 bg-card p-5">
        <h2 className="font-display text-base font-semibold text-ink">Pricing</h2>
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-ink/50">Quoted to customer</span>
          <span className="font-medium text-ink">₹{line.quotedUnitPriceINR.toLocaleString("en-IN")} / unit</span>
        </div>

        {currentStatus !== "needs_purchase" && (
          <div className="mt-1 flex items-center justify-between text-sm">
            <span className="text-ink/50">Actually paid</span>
            <span className="font-medium text-ink">
              {line.actualUnitPriceINR != null
                ? `₹${line.actualUnitPriceINR.toLocaleString("en-IN")} / unit`
                : "—"}
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="mt-4 rounded-2xl border border-ink/10 bg-card p-5">
        {currentStatus === "needs_purchase" && mode === "idle" && (
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => setMode("confirming_purchase")}
              className="rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-deep"
            >
              Mark as purchased
            </button>
            <button
              type="button"
              onClick={() => setMode("confirming_issue")}
              className="rounded-xl border border-ink/10 px-4 py-2 text-sm font-medium text-ink/60 hover:bg-ink/[0.04] hover:text-ink"
            >
              Flag as unavailable
            </button>
          </div>
        )}

        {mode === "confirming_purchase" && (
          <div>
            <label className="block text-sm font-medium text-ink/70">Actual price paid (per unit)</label>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-sm text-ink/40">₹</span>
              <input
                type="number"
                value={actualPrice}
                onChange={(e) => setActualPrice(e.target.value)}
                className="w-32 rounded-lg border border-ink/10 bg-parchment/40 px-3 py-1.5 text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/40"
              />
            </div>
            {priceDrift !== null && priceDrift !== 0 && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700">
                <AlertTriangle size={13} />
                {priceDrift > 0
                  ? `₹${priceDrift.toLocaleString("en-IN")} more than quoted — this won't be passed to the customer automatically.`
                  : `₹${Math.abs(priceDrift).toLocaleString("en-IN")} less than quoted.`}
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  // TODO: PATCH /api/admin/purchases/{line.id}
                  //   { status: "purchased", actualUnitPriceINR: Number(actualPrice), purchasedBy, purchasedAt }
                  setStatus("purchased")
                  setMode("idle")
                }}
                disabled={trimmedPrice === ""}
                className="rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-deep disabled:opacity-40"
              >
                Confirm purchase
              </button>
              <button
                type="button"
                onClick={() => setMode("idle")}
                className="rounded-xl px-4 py-2 text-sm font-medium text-ink/50 hover:bg-ink/[0.04]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {mode === "confirming_issue" && (
          <div>
            <label className="block text-sm font-medium text-ink/70">What happened?</label>
            <textarea
              value={issueNote}
              onChange={(e) => setIssueNote(e.target.value)}
              rows={3}
              placeholder="e.g. Out of stock on seller site, no restock date"
              className="mt-1.5 w-full resize-none rounded-lg border border-ink/10 bg-parchment/40 px-3 py-2 text-sm text-ink placeholder:text-ink/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/40"
            />
            <p className="mt-1.5 text-xs text-ink/40">
              This will need a follow-up with the customer — chat/notification hookup isn't wired up yet.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  // TODO: PATCH /api/admin/purchases/{line.id} { status: "unavailable", issueNote }
                  setStatus("unavailable")
                  setMode("idle")
                }}
                disabled={!issueNote.trim()}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-40"
              >
                Confirm unavailable
              </button>
              <button
                type="button"
                onClick={() => setMode("idle")}
                className="rounded-xl px-4 py-2 text-sm font-medium text-ink/50 hover:bg-ink/[0.04]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {currentStatus === "purchased" && mode === "idle" && (
          <p className="flex items-center gap-2 text-sm text-teal-deep">
            <ClipboardCopy size={15} />
            Purchased{line.purchasedBy ? ` by ${line.purchasedBy}` : ""}
            {line.purchasedAt ? ` on ${new Date(line.purchasedAt).toLocaleDateString()}` : ""}.
          </p>
        )}

        {currentStatus === "unavailable" && mode === "idle" && (
          <div>
            <p className="flex items-center gap-2 text-sm text-rose-700">
              <AlertTriangle size={15} />
              Flagged unavailable
            </p>
            {(issueNote || line.issueNote) && (
              <p className="mt-1.5 text-sm text-ink/60">{issueNote || line.issueNote}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}