// app/admin/(common)/requests/[requestId]/page.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, ExternalLink, ImageOff, ImagePlus, Loader2, MessageSquare, RotateCw, X } from "lucide-react"

import { useAdminData } from "@/contexts/AdminDataContext"
import { REQUEST_STATUS_LABEL, type RequestStatus, type RequestItemAsk } from "@/types/admin"
import { panelClass } from "@/components/admin/seller/shared"
import { useImageUpload } from "@/lib/upload/useImageUpload"
import { SendMessageModal } from "@/components/admin/SendMessageModal"
import { quoteMessage, paymentConfirmedMessage, orderConfirmedMessage, requestDeclinedMessage, formatItemLabel, cleanRequestItemNote } from "@/lib/chat/customerMessageTemplates"

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
    role,
    currentUser,
    getRequestLine,
    canWorkRequestLine,
    canReassignRequestLine,
    canCloseRequestLine,
    setQuote,
    setRequestScreenshot,
    setRequestVariant,
    updateRequestItemDetails,
    confirmPayment,
    confirmRequest,
    declineRequest,
    reassignRequest,
    retryScrape,
    staffDirectory,
    sendChatMessage,
    dataLoading,
  } = useAdminData()

  // Per-item quote drafts, keyed by RequestItemAsk.id — a request can
  // have several items, each priced independently, so this can't be a
  // single string the way the old single-link page used.
  const [quoteInputs, setQuoteInputs] = useState<Record<string, string>>({})
  const [variantInputs, setVariantInputs] = useState<Record<string, string>>({})
  const [variantDropdownSelections, setVariantDropdownSelections] = useState<Record<string, Record<string, string>>>({})
  const [productDetailDrafts, setProductDetailDrafts] = useState<
    Record<
      string,
      { title: string; imageUrl: string; sellerName: string; quantity: string; variantRows: { dimension: string; valuesText: string }[] }
    >
  >({})
  const [editingProductDetails, setEditingProductDetails] = useState<Record<string, boolean>>({})
  const [retryResult, setRetryResult] = useState<{ success: boolean; message: string } | null>(null)
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer")
  const [paymentReference, setPaymentReference] = useState("")
  const [paymentAmountInput, setPaymentAmountInput] = useState("")
  const { uploading: uploadingScreenshot, error: screenshotUploadError, upload: uploadScreenshot } = useImageUpload()

  // Single shared piece of state for the "review before sending" modal —
  // whichever trigger fires (quote, payment, order-confirm, decline)
  // populates this, and SendMessageModal below renders it generically.
  // Only one of these is ever open at a time in practice (a human does
  // one action, reviews it, then does the next), so one slot is enough.
  const [pendingMessage, setPendingMessage] = useState<{ title: string; text: string } | null>(null)
  // handleConfirm now awaits the real order-creation write (see its own
  // comment below) before it can put a real order id in the
  // confirmation message — these back that brief wait with a visible
  // busy state / error surface on the Confirm button itself.
  const [confirmingOrder, setConfirmingOrder] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  // Same reasoning, same pattern, for "Confirm payment received" — see
  // confirmPayment's own doc comment in AdminDataContext.tsx.
  const [confirmingPayment, setConfirmingPayment] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)

  useEffect(() => {
    // Effective `role`, not currentUser.role — same fix/reasoning as
    // requests/page.tsx.
    if (role === "warehouse") router.replace("/admin/dashboard")
  }, [role, router])

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

  // Same "only fill when empty" seeding as quoteInputs above.
  useEffect(() => {
    if (!request) return
    setVariantInputs((prev) => {
      const next = { ...prev }
      let changed = false
      for (const item of request.items) {
        if (item.confirmedVariant && (next[item.id] === undefined || next[item.id] === "")) {
          next[item.id] = item.confirmedVariant
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [request])

  // Seed the payment amount input from the request's total quote once
  // it's known, same "only fill when empty" rule as the per-item quote
  // inputs above — so it doesn't fight typing if the admin adjusts it.
  useEffect(() => {
    if (!request || request.totalQuote === undefined) return
    setPaymentAmountInput((prev) => (prev === "" ? String(request.totalQuote) : prev))
  }, [request])

  const staffOnly = useMemo(
    () => staffDirectory.filter((s) => s.role === "sales" || s.role === "manager"),
    [staffDirectory]
  )

  if (role === "warehouse") return null

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
      <div className="h-full overflow-y-auto bg-parchment">
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
      </div>
    )
  }

  const canWork = canWorkRequestLine(request)
  const isOpen = request.status === "sent_for_review" || request.status === "quoted"

  // Every customer-facing message needs to name the actual item, not a
  // bare "your item" — this is the one place that composes that label
  // (cleaned note + confirmed variant, if any) so every trigger below
  // builds it the same way. See formatItemLabel/cleanRequestItemNote's
  // own doc comments in customerMessageTemplates.ts.
  //
  // FIX #1: this used to always build the label from item.note,
  // completely ignoring item.productTitle — so editing the "Product
  // details" title for an item the admin had cleaned up never showed up
  // in the actual quote/confirmed/declined messages sent to the
  // customer, only in the admin's own view of the request. Same
  // fallback order confirmRequestReal already uses for the real order's
  // title (productTitle first, raw note as the fallback), so what the
  // customer is told now matches what the order actually ends up named.
  //
  // FIX #2: variant was only ever pulled from item.confirmedVariant —
  // the value AFTER clicking that section's own Save button — never
  // from whatever the admin currently has picked out but hasn't
  // explicitly saved yet. In practice the admin decides the variant
  // (picks the dropdowns, or types the freeform box) and immediately
  // triggers a message (Send quote, say) without a separate "confirm
  // this first" step in between, since to them it's already decided —
  // so the message went out without it despite the choice existing on
  // screen. Now falls back to the live, not-yet-saved selection: the
  // dropdown combination (only once every dimension has a pick — a
  // half-chosen combination is genuinely undecided, not just unsaved)
  // or the freeform draft text, in that order, before giving up and
  // omitting the variant the way it correctly does when nothing at all
  // has been picked.
  const pendingVariantFor = (item: RequestItemAsk): string | undefined => {
    if (item.confirmedVariant) return item.confirmedVariant
    if (item.variantOptions?.length) {
      const selections = variantDropdownSelections[item.id] ?? {}
      const allPicked = item.variantOptions.every((d) => selections[d.dimension])
      if (allPicked) return item.variantOptions.map((d) => `${d.dimension}: ${selections[d.dimension]}`).join(", ")
      return undefined
    }
    return variantInputs[item.id]?.trim() || undefined
  }

  const itemLabelFor = (itemId: string): string => {
    const item = request.items.find((i) => i.id === itemId)
    if (!item) return "your item"
    const baseLabel = item.productTitle?.trim() || cleanRequestItemNote(item.note)
    const pendingVariant = pendingVariantFor(item)
    // The moment a not-yet-explicitly-saved variant is actually used in
    // a real outgoing message, persist it as the real confirmedVariant
    // right then — otherwise the customer gets told a variant that the
    // request's own record (and, later, the real order's title, via
    // confirmRequestReal's existing.confirmed_variant) never actually
    // reflects, since nothing forces the admin to also click that
    // section's Save button before or after sending the message.
    if (pendingVariant && pendingVariant !== item.confirmedVariant) {
      setRequestVariant(request.id, item.id, pendingVariant)
    }
    return formatItemLabel(baseLabel, pendingVariant)
  }

  const handleSetQuote = (itemId: string) => {
    const amount = Number(quoteInputs[itemId])
    if (!Number.isFinite(amount) || amount <= 0) return
    const hadQuoteBefore = request.items.find((i) => i.id === itemId)?.quote !== undefined
    setQuote(request.id, itemId, amount)
    setPendingMessage({ title: "Send quote to customer?", text: quoteMessage(request.displayId, itemLabelFor(itemId), amount, hadQuoteBefore) })
  }

  const handleSaveVariant = (itemId: string) => {
    const variant = (variantInputs[itemId] ?? "").trim()
    if (!variant) return
    setRequestVariant(request.id, itemId, variant)
  }

  const handleSaveVariantFromDropdowns = (itemId: string, dimensions: { dimension: string; values: string[] }[]) => {
    const selections = variantDropdownSelections[itemId] ?? {}
    // Composes e.g. "Size: M, Color: Beige" — one segment per defined
    // dimension, in the order the admin defined them. Every dimension
    // must have a selection (enforced by the Save button's disabled
    // state below) so a half-picked combination can never get saved as
    // the customer's confirmed choice.
    const joined = dimensions.map((d) => `${d.dimension}: ${selections[d.dimension] ?? ""}`).join(", ")
    setRequestVariant(request.id, itemId, joined)
  }

  const openProductDetails = (item: (typeof request.items)[number]) => {
    setProductDetailDrafts((prev) => ({
      ...prev,
      [item.id]: {
        title: item.productTitle ?? "",
        imageUrl: item.productImageUrl ?? "",
        sellerName: item.sellerName ?? "",
        quantity: String(item.quantity ?? 1),
        variantRows: (item.variantOptions ?? []).map((v) => ({ dimension: v.dimension, valuesText: v.values.join(", ") })),
      },
    }))
    setEditingProductDetails((prev) => ({ ...prev, [item.id]: true }))
  }

  const handleSaveProductDetails = (itemId: string) => {
    const draft = productDetailDrafts[itemId]
    if (!draft) return
    const quantity = Number(draft.quantity)
    // Blank dimension names/empty value lists are dropped rather than
    // saved as noise — a half-filled-in "+ Add dimension" row the admin
    // never finished typing shouldn't turn into a real, empty variant
    // option shown to anyone.
    const variantOptions = draft.variantRows
      .map((row) => ({
        dimension: row.dimension.trim(),
        values: row.valuesText
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
      }))
      .filter((row) => row.dimension && row.values.length > 0)
    updateRequestItemDetails(request.id, itemId, {
      productTitle: draft.title.trim() || undefined,
      productImageUrl: draft.imageUrl.trim() || undefined,
      sellerName: draft.sellerName.trim() || undefined,
      quantity: Number.isFinite(quantity) && quantity > 0 ? Math.round(quantity) : undefined,
      variantOptions,
    })
    setEditingProductDetails((prev) => ({ ...prev, [itemId]: false }))
  }

  const addVariantRow = (itemId: string) =>
    setProductDetailDrafts((prev) => {
      const draft = prev[itemId]
      if (!draft) return prev
      return { ...prev, [itemId]: { ...draft, variantRows: [...draft.variantRows, { dimension: "", valuesText: "" }] } }
    })

  const updateVariantRow = (itemId: string, index: number, field: "dimension" | "valuesText", value: string) =>
    setProductDetailDrafts((prev) => {
      const draft = prev[itemId]
      if (!draft) return prev
      const rows = draft.variantRows.map((row, i) => (i === index ? { ...row, [field]: value } : row))
      return { ...prev, [itemId]: { ...draft, variantRows: rows } }
    })

  const removeVariantRow = (itemId: string, index: number) =>
    setProductDetailDrafts((prev) => {
      const draft = prev[itemId]
      if (!draft) return prev
      return { ...prev, [itemId]: { ...draft, variantRows: draft.variantRows.filter((_, i) => i !== index) } }
    })

  const handleScreenshotSelected = async (itemId: string, file: File) => {
    const url = await uploadScreenshot(file, "products")
    if (url) setRequestScreenshot(request.id, itemId, url)
  }

  const handleConfirm = async () => {
    setConfirmError(null)
    setConfirmingOrder(true)
    // Awaited now — the real order id only exists once confirmRequest's
    // own real write actually lands (see that function's doc comment in
    // AdminDataContext.tsx). A brief wait here is the tradeoff for never
    // telling a customer a made-up order number they can't look up.
    const result = await confirmRequest(request.id)
    setConfirmingOrder(false)
    if (!result.ok || !result.orderDisplayId) {
      setConfirmError(result.error ?? "Could not confirm this request. Please try again.")
      return
    }
    setPendingMessage({
      title: "Send order confirmation to customer?",
      text: orderConfirmedMessage(result.orderDisplayId, itemLabelFor(request.items[0].id), request.totalQuote ?? 0, request.items.length),
    })
  }

  const handleConfirmPayment = async () => {
    const amount = Number(paymentAmountInput)
    if (!Number.isFinite(amount) || amount <= 0) return
    setPaymentError(null)
    setConfirmingPayment(true)
    // Awaited now — see confirmPayment's own doc comment in
    // AdminDataContext.tsx for why: the message below must never send
    // on the strength of a payment confirmation that might not have
    // actually been written for real.
    const result = await confirmPayment(request.id, {
      amount,
      method: paymentMethod,
      reference: paymentReference.trim() || undefined,
    })
    setConfirmingPayment(false)
    if (!result.ok) {
      setPaymentError(result.error ?? "Could not record this payment. Please try again.")
      return
    }
    setPendingMessage({
      title: "Send payment confirmation to customer?",
      text: paymentConfirmedMessage(request.displayId, itemLabelFor(request.items[0].id), amount, paymentMethod),
    })
  }

  const handleDecline = () => {
    declineRequest(request.id)
    setPendingMessage({ title: "Let the customer know?", text: requestDeclinedMessage(request.displayId, itemLabelFor(request.items[0].id)) })
  }

  const handleRetryScrape = () => {
    setRetryResult(retryScrape(request.id))
  }

  return (
    <div className="h-full overflow-y-auto bg-parchment">
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

                {(item.needsVariantConfirmation || !!item.variantOptions?.length) && (
                  <div className="rounded-lg border border-gold/30 bg-gold/5 px-3.5 py-3">
                    <p className="text-xs font-semibold text-ink/60">
                      {item.needsVariantConfirmation
                        ? "Size/color unclear from the link — confirm with the customer over chat, then record it here."
                        : "Pick the customer's confirmed choice from the options you defined above."}
                    </p>
                    {item.confirmedVariant ? (
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="rounded-full bg-teal/10 px-2.5 py-1 text-xs font-semibold text-teal-deep">
                          Confirmed: {item.confirmedVariant}
                        </span>
                        <button
                          type="button"
                          onClick={() => setVariantInputs((prev) => ({ ...prev, [item.id]: item.confirmedVariant ?? "" }))}
                          className="text-xs font-semibold text-ink/50 hover:text-ink"
                        >
                          Edit
                        </button>
                      </div>
                    ) : item.variantOptions?.length ? (
                      <div className="mt-2 space-y-2">
                        <div className="flex flex-wrap gap-2">
                          {item.variantOptions.map((dim) => (
                            <select
                              key={dim.dimension}
                              value={variantDropdownSelections[item.id]?.[dim.dimension] ?? ""}
                              onChange={(e) =>
                                setVariantDropdownSelections((prev) => ({
                                  ...prev,
                                  [item.id]: { ...prev[item.id], [dim.dimension]: e.target.value },
                                }))
                              }
                              className="rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-sm text-ink outline-none focus:border-teal/50"
                            >
                              <option value="">{dim.dimension}...</option>
                              {dim.values.map((v) => (
                                <option key={v} value={v}>
                                  {v}
                                </option>
                              ))}
                            </select>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSaveVariantFromDropdowns(item.id, item.variantOptions!)}
                          disabled={item.variantOptions.some((dim) => !variantDropdownSelections[item.id]?.[dim.dimension])}
                          className="rounded-lg bg-teal-deep px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-deep/90 disabled:cursor-not-allowed disabled:bg-ink/10 disabled:text-ink/35"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <div className="mt-2 flex gap-2">
                        <input
                          type="text"
                          value={variantInputs[item.id] ?? ""}
                          onChange={(e) => setVariantInputs((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          placeholder="e.g. Size M, Black"
                          className="flex-1 rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-sm text-ink outline-none focus:border-teal/50"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveVariant(item.id)}
                          disabled={!variantInputs[item.id]?.trim()}
                          className="rounded-lg bg-teal-deep px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-deep/90 disabled:cursor-not-allowed disabled:bg-ink/10 disabled:text-ink/35"
                        >
                          Save
                        </button>
                      </div>
                    )}
                    <p className="mt-1.5 text-[11px] text-ink/35">
                      Once saved, this gets added to the item name — e.g. "
                      {item.variantOptions?.length
                        ? item.variantOptions.map((d) => `${d.dimension}: ${variantDropdownSelections[item.id]?.[d.dimension] || "..."}`).join(", ")
                        : variantInputs[item.id]?.trim() || "Size M, Black"}{" "}
                      -{" "}
                      {item.note.length > 30 ? `${item.note.slice(0, 30)}...` : item.note}" — instead of just going out unnamed.
                    </p>
                  </div>
                )}

                {/* Everything a Channel 1/2 item gets automatically from a
                    real scrape or catalogue listing — a real title, photo,
                    seller name, and quantity — a Channel 3 item has none of
                    by default (see confirmRequestReal's own comments on
                    exactly what that costs the resulting order). This is
                    where the admin fills it in by hand for a link the
                    scraper genuinely couldn't read, so the order that comes
                    out the other end looks and behaves like any other. */}
                <div className="rounded-lg border border-ink/10 bg-parchment/40 px-3.5 py-3">
                  <p className="text-xs font-semibold text-ink/60">Product details</p>
                  {editingProductDetails[item.id] ? (
                    <div className="mt-2 space-y-2">
                      <input
                        type="text"
                        value={productDetailDrafts[item.id]?.title ?? ""}
                        onChange={(e) =>
                          setProductDetailDrafts((prev) => ({
                            ...prev,
                            [item.id]: { ...prev[item.id], title: e.target.value } as (typeof prev)[string],
                          }))
                        }
                        placeholder="Product title"
                        className="w-full rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-sm text-ink outline-none focus:border-teal/50"
                      />
                      <input
                        type="url"
                        value={productDetailDrafts[item.id]?.imageUrl ?? ""}
                        onChange={(e) =>
                          setProductDetailDrafts((prev) => ({
                            ...prev,
                            [item.id]: { ...prev[item.id], imageUrl: e.target.value } as (typeof prev)[string],
                          }))
                        }
                        placeholder="Product photo URL"
                        className="w-full rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-sm text-ink outline-none focus:border-teal/50"
                      />
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={productDetailDrafts[item.id]?.sellerName ?? ""}
                          onChange={(e) =>
                            setProductDetailDrafts((prev) => ({
                              ...prev,
                              [item.id]: { ...prev[item.id], sellerName: e.target.value } as (typeof prev)[string],
                            }))
                          }
                          placeholder="Seller / store name"
                          className="flex-1 rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-sm text-ink outline-none focus:border-teal/50"
                        />
                        <input
                          type="number"
                          min={1}
                          value={productDetailDrafts[item.id]?.quantity ?? "1"}
                          onChange={(e) =>
                            setProductDetailDrafts((prev) => ({
                              ...prev,
                              [item.id]: { ...prev[item.id], quantity: e.target.value } as (typeof prev)[string],
                            }))
                          }
                          placeholder="Qty"
                          className="w-20 rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-sm text-ink outline-none focus:border-teal/50"
                        />
                      </div>

                      <div className="space-y-1.5 rounded-lg border border-ink/10 bg-white/60 p-2.5">
                        <p className="text-[11px] font-semibold text-ink/50">
                          Variant options <span className="font-normal text-ink/35">(e.g. Size, Color — predefined choices)</span>
                        </p>
                        {(productDetailDrafts[item.id]?.variantRows ?? []).map((row, idx) => (
                          <div key={idx} className="flex gap-1.5">
                            <input
                              type="text"
                              value={row.dimension}
                              onChange={(e) => updateVariantRow(item.id, idx, "dimension", e.target.value)}
                              placeholder="Dimension (e.g. Size)"
                              className="w-28 flex-none rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-xs text-ink outline-none focus:border-teal/50"
                            />
                            <input
                              type="text"
                              value={row.valuesText}
                              onChange={(e) => updateVariantRow(item.id, idx, "valuesText", e.target.value)}
                              placeholder="Values, comma-separated (e.g. S, M, L, XL)"
                              className="flex-1 rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-xs text-ink outline-none focus:border-teal/50"
                            />
                            <button
                              type="button"
                              onClick={() => removeVariantRow(item.id, idx)}
                              aria-label="Remove this dimension"
                              className="flex-none rounded-lg border border-ink/15 bg-white px-2 text-ink/40 hover:bg-rose-50 hover:text-rose-600"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => addVariantRow(item.id)}
                          className="text-xs font-semibold text-teal-deep hover:underline"
                        >
                          + Add dimension
                        </button>
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleSaveProductDetails(item.id)}
                          className="rounded-lg bg-teal-deep px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-deep/90"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingProductDetails((prev) => ({ ...prev, [item.id]: false }))}
                          className="rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-xs font-semibold text-ink/60 hover:bg-parchment/60"
                        >
                          Cancel
                        </button>
                      </div>
                      <p className="text-[11px] text-ink/35">
                        Every field is optional — leave any blank to keep the customer's own note/link as the fallback.
                        Confirming the request without filling these in still works exactly as before.
                      </p>
                    </div>
                  ) : item.productTitle || item.productImageUrl || item.sellerName || item.variantOptions?.length ? (
                    <div className="mt-2 flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        {item.productImageUrl && (
                          <img
                            src={item.productImageUrl}
                            alt=""
                            className="h-14 w-14 flex-none rounded-lg border border-ink/10 object-cover"
                          />
                        )}
                        <div className="text-xs text-ink/60">
                          {item.productTitle && <p className="font-medium text-ink/80">{item.productTitle}</p>}
                          {item.sellerName && <p className="mt-0.5">{item.sellerName}</p>}
                          <p className="mt-0.5">Qty {item.quantity ?? 1}</p>
                          {item.variantOptions?.map((v) => (
                            <p key={v.dimension} className="mt-0.5">
                              {v.dimension}: {v.values.join(", ")}
                            </p>
                          ))}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => openProductDetails(item)}
                        className="flex-none text-xs font-semibold text-ink/50 hover:text-ink"
                      >
                        Edit
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openProductDetails(item)}
                      className="mt-1.5 text-xs font-semibold text-teal-deep hover:underline"
                    >
                      + Add title, photo, seller &amp; quantity
                    </button>
                  )}
                </div>

                <div>
                  <p className="text-xs font-semibold text-ink/45">
                    Customer's screenshot <span className="font-normal text-ink/30">(separate from the product photo above)</span>
                  </p>
                  {item.screenshotUrl ? (
                    <div className="mt-2 flex items-start gap-3">
                      <img
                        src={item.screenshotUrl}
                        alt="Product photo"
                        className="max-h-64 rounded-lg border border-ink/10 object-cover"
                      />
                      {canWork && isOpen && (
                        <label
                          className={`flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-xs font-semibold text-ink/70 hover:bg-parchment/60 ${
                            uploadingScreenshot ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                          }`}
                        >
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            disabled={uploadingScreenshot}
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              e.target.value = ""
                              if (file) handleScreenshotSelected(item.id, file)
                            }}
                            className="hidden"
                          />
                          {uploadingScreenshot ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} />}
                          Replace
                        </label>
                      )}
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-col gap-2">
                      <div className="flex items-center gap-2 rounded-lg border border-dashed border-ink/15 px-3 py-4 text-xs text-ink/40">
                        <ImageOff size={14} /> No photo found automatically for this link
                      </div>
                      {canWork && isOpen && (
                        <label
                          className={`flex w-fit items-center gap-1.5 rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-xs font-semibold text-ink/70 hover:bg-parchment/60 ${
                            uploadingScreenshot ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                          }`}
                        >
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            disabled={uploadingScreenshot}
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              e.target.value = ""
                              if (file) handleScreenshotSelected(item.id, file)
                            }}
                            className="hidden"
                          />
                          {uploadingScreenshot ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} />}
                          {uploadingScreenshot ? "Uploading…" : "Upload a photo"}
                        </label>
                      )}
                      <p className="text-[11px] text-ink/35">
                        Until a photo is set, this item shows a placeholder everywhere — on the order, in the customer's
                        account, and in your admin views.
                      </p>
                    </div>
                  )}
                  {screenshotUploadError && <p className="mt-1.5 text-xs text-red-700">{screenshotUploadError}</p>}
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
          {canWork && isOpen && request.allItemsQuoted && (
            <div className={`overflow-hidden ${panelClass}`}>
              <div className="border-b border-ink/10 px-5 py-3.5">
                <h2 className="text-sm font-semibold text-ink/70">Payment</h2>
              </div>
              <div className="flex flex-col gap-3 px-5 py-4">
                {request.payment ? (
                  <div className="rounded-lg border border-emerald-600/20 bg-emerald-600/5 px-3 py-2.5">
                    <p className="text-xs font-semibold text-emerald-700">
                      Payment confirmed · Rs. {request.payment.amount.toLocaleString()}
                    </p>
                    <p className="mt-1 text-xs text-ink/50">
                      {request.payment.method.replace("_", " ")}
                      {request.payment.reference ? ` · Ref: ${request.payment.reference}` : ""}
                    </p>
                    <p className="mt-0.5 text-[11px] text-ink/40">
                      Confirmed by {request.payment.confirmedByName ?? "Staff"} on{" "}
                      {new Date(request.payment.confirmedAt).toLocaleDateString()}
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-ink/50">
                      Once the customer accepts the quote over chat or WhatsApp, record their payment here before confirming the request.
                    </p>
                    <div>
                      <label className="text-xs font-semibold text-ink/50">Amount received (Rs.)</label>
                      <input
                        type="number"
                        min={0}
                        value={paymentAmountInput}
                        onChange={(e) => setPaymentAmountInput(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal/50"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-ink/50">Method</label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal/50"
                      >
                        <option value="bank_transfer">Bank transfer</option>
                        <option value="cash">Cash</option>
                        <option value="card">Card</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-ink/50">Reference (optional)</label>
                      <input
                        type="text"
                        value={paymentReference}
                        onChange={(e) => setPaymentReference(e.target.value)}
                        placeholder="Transaction ID, slip number, etc."
                        className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal/50"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleConfirmPayment}
                      disabled={!paymentAmountInput || Number(paymentAmountInput) <= 0 || confirmingPayment}
                      className="w-full rounded-lg bg-teal px-3 py-2 text-sm font-semibold text-white hover:bg-teal-deep disabled:cursor-not-allowed disabled:bg-ink/10 disabled:text-ink/35"
                    >
                      {confirmingPayment ? "Confirming…" : "Confirm payment received"}
                    </button>
                    {paymentError && <p className="mt-2 text-xs font-semibold text-red-600">{paymentError}</p>}
                  </>
                )}
              </div>
            </div>
          )}

          {canWork && isOpen && (
            <div className={`overflow-hidden ${panelClass}`}>
              <div className="border-b border-ink/10 px-5 py-3.5">
                <h2 className="text-sm font-semibold text-ink/70">Move status</h2>
              </div>
              <div className="flex flex-col gap-2 px-5 py-4">
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={!request.allItemsQuoted || !request.payment || confirmingOrder}
                  className="w-full rounded-lg bg-teal-deep px-3 py-2 text-sm font-semibold text-white hover:bg-teal-deep/90 disabled:cursor-not-allowed disabled:bg-ink/10 disabled:text-ink/35"
                >
                  {confirmingOrder ? "Confirming…" : "Confirm → creates order"}
                </button>
                {confirmError && <p className="text-xs font-semibold text-red-600">{confirmError}</p>}
                {!request.allItemsQuoted && (
                  <p className="text-xs text-ink/40">
                    {request.items.length > 1
                      ? "Every item needs a quote before this request can be confirmed."
                      : "Set a quote before this request can be confirmed."}
                  </p>
                )}
                {request.allItemsQuoted && !request.payment && (
                  <p className="text-xs text-ink/40">Record the customer's payment above before this request can be confirmed.</p>
                )}
                {request.allItemsQuoted && request.totalQuote !== undefined && (
                  <p className="text-xs text-ink/45">
                    Total across all items: <span className="font-semibold text-ink/70">Rs. {request.totalQuote.toLocaleString()}</span>
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleDecline}
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
                  onClick={handleDecline}
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

    <SendMessageModal
      open={pendingMessage !== null}
      title={pendingMessage?.title ?? ""}
      defaultMessage={pendingMessage?.text ?? ""}
      onSend={async (text, attachmentUrl) => {
        const result = await sendChatMessage(request.chatThreadId, text, attachmentUrl)
        // Only close on success — a failure (e.g. RLS rejecting the
        // insert) keeps the modal open with the error shown, instead of
        // closing and silently pretending the customer got the message.
        if (result.ok) setPendingMessage(null)
        return result
      }}
      onSkip={() => setPendingMessage(null)}
    />
    </div>
  )
}