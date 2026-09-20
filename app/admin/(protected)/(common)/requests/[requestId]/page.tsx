// app/admin/(common)/requests/[requestId]/page.tsx
"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  ArrowLeft,
  ChevronRight,
  ExternalLink,
  ImageOff,
  ImagePlus,
  Loader2,
  MessageSquare,
  RotateCw,
  Send,
  X,
} from "lucide-react"

import { useAdminData } from "@/contexts/AdminDataContext"
import { REQUEST_STATUS_LABEL, type RequestStatus, type RequestItemAsk } from "@/types/admin"
import type { StatusTone } from "@/components/admin/warehouse/status-pill"
import { useImageUpload } from "@/lib/upload/useImageUpload"
import { SendMessageModal } from "@/components/admin/SendMessageModal"
import { createClient } from "@/lib/supabase/client"
import { subscribeToThreadMessages, type ChatMessageRow } from "@/lib/supabase/chat"
import {
  quoteMessage,
  paymentConfirmedMessage,
  orderConfirmedMessage,
  requestDeclinedMessage,
  formatItemLabel,
  cleanRequestItemNote,
} from "@/lib/chat/customerMessageTemplates"

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
//
// REDESIGN: brought in line with /admin/orders/[orderId]'s visual
// language (same tokens, Pill/SectionCard components, sticky breadcrumb
// top bar, flex-1-stretched sidebar) instead of the older bordered-panel
// look this page used before — every handler and piece of state below
// is unchanged from that version, only the markup/styling around it.

/* ---------- tokens (same as the order detail page) ---------- */

const TONE_PILL: Record<StatusTone | "ink", string> = {
  teal: "bg-teal/12 text-teal-deep ring-teal/25",
  amber: "bg-gold/15 text-gold-deep ring-gold/30",
  rose: "bg-rose-50 text-rose-700 ring-rose-200",
  ink: "bg-ink/[0.04] text-ink/60 ring-ink/10",
}
const TONE_DOT: Record<StatusTone | "ink", string> = {
  teal: "bg-teal-deep",
  amber: "bg-gold-deep",
  rose: "bg-rose-600",
  ink: "bg-ink/30",
}
const STATUS_TONE: Record<RequestStatus, StatusTone | "ink"> = {
  sent_for_review: "ink",
  quoted: "amber",
  confirmed: "teal",
  declined: "ink",
}

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40"
const BTN_PRIMARY = `inline-flex items-center justify-center gap-1.5 rounded-xl bg-teal-deep px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`
const BTN_OUTLINE = `inline-flex items-center justify-center gap-1.5 rounded-xl border border-ink/15 bg-card px-4 py-2 text-sm font-medium text-ink/70 transition-colors hover:bg-ink/[0.04] hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`
const FIELD = `rounded-lg border border-ink/10 bg-card px-3 py-2 text-sm text-ink placeholder:text-ink/35 outline-none focus:border-teal/50 focus:ring-2 focus:ring-teal/15 disabled:opacity-60`

/* ---------- small components (same as the order detail page) ---------- */

function Pill({ tone, children }: { tone: StatusTone | "ink"; children: React.ReactNode }) {
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
  right,
  className = "",
  children,
}: {
  title: string
  right?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={`flex flex-col rounded-2xl border border-ink/10 bg-card ${className}`}>
      <header className="flex items-center justify-between gap-2 px-5 pt-5">
        <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
        {right}
      </header>
      <div className="flex-1 p-5 pt-4">{children}</div>
    </section>
  )
}

// Shows a chat attachment inline. Click opens the full-size image in a new
// tab. If the file isn't a displayable image, falls back to a plain link.
function MessageAttachment({
  url,
  className = "",
  onLoad,
}: {
  url: string
  className?: string
  onLoad?: () => void
}) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center gap-1 text-xs font-semibold text-teal-deep hover:underline ${className}`}
      >
        Open attachment <ExternalLink size={11} />
      </a>
    )
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={`block w-fit max-w-full ${className}`}>
      <img
        src={url}
        alt="Attachment"
        loading="lazy"
        onLoad={onLoad}
        onError={() => setFailed(true)}
        className="block max-h-64 w-auto max-w-full rounded-xl object-cover"
      />
    </a>
  )
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
    fetchMessagesForRequest,
    dataLoading,
    markRequestReplied,
  } = useAdminData()

  // ---- embedded request-chat panel state ----
  // Same idea as the order detail page's own panel: chat_messages.
  // request_id (already a real column, unlike order_id which needed a
  // migration — see earlier conversation) lets this isolate "just the
  // conversation about THIS request" out of a thread that can carry a
  // customer's whole history, many requests and orders over time.
  const [requestMessages, setRequestMessages] = useState<ChatMessageRow[]>([])
  const [loadingMessages, setLoadingMessages] = useState(true)
  const [messageDraft, setMessageDraft] = useState("")
  const [messageAttachmentUrl, setMessageAttachmentUrl] = useState<string | null>(null)
  const [sendingMessage, setSendingMessage] = useState(false)
  const messageListRef = useRef<HTMLDivElement>(null)
  const messageInputRef = useRef<HTMLTextAreaElement>(null)
  // The conversation lives in a slide-over drawer instead of the sidebar
  // column, which is too narrow to read or write in comfortably.
  const [chatOpen, setChatOpen] = useState(false)
  // Separate useImageUpload instance from uploadScreenshot below — they
  // have their own independent busy/error state, and a customer-photo
  // upload for one item shouldn't disable the Send button on a message
  // draft (or vice versa).
  const { uploading: uploadingAttachment, upload: uploadMessageAttachment } = useImageUpload()

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

  useEffect(() => {
    if (!request?.chatThreadId) {
      setLoadingMessages(false)
      return
    }
    let cancelled = false
    setLoadingMessages(true)
    fetchMessagesForRequest(request.id, request.chatThreadId).then((rows) => {
      if (!cancelled) {
        setRequestMessages(rows)
        setLoadingMessages(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [request?.id, request?.chatThreadId, fetchMessagesForRequest])

  // Live-receive: subscribeToThreadMessages fires for EVERY new message
  // on the thread (it can only filter by thread_id at the realtime
  // layer), so this filters client-side down to messages actually
  // tagged to this request before appending — same pattern as the order
  // detail page's own panel.
  useEffect(() => {
    if (!request?.chatThreadId) return
    const supabase = createClient()
    const unsubscribe = subscribeToThreadMessages(supabase, request.chatThreadId, (row) => {
      if (row.request_id !== request.id) return
      setRequestMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]))
    })
    return unsubscribe
  }, [request?.id, request?.chatThreadId])

  // Keep the panel scrolled to the newest message (also on open, since the
  // drawer's list only mounts while it's open).
  useEffect(() => {
    messageListRef.current?.scrollTo({ top: messageListRef.current.scrollHeight })
  }, [requestMessages, chatOpen])

  // Drawer: Escape closes it, and the message box gets focus on open.
  useEffect(() => {
    if (!chatOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setChatOpen(false)
    }
    window.addEventListener("keydown", onKey)
    messageInputRef.current?.focus()
    return () => window.removeEventListener("keydown", onKey)
  }, [chatOpen])

  const staffOnly = useMemo(
    () => staffDirectory.filter((s) => s.role === "sales" || s.role === "manager"),
    [staffDirectory]
  )

  if (role === "warehouse") return null

  if (dataLoading) {
    return (
      <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
        <div className="mx-auto max-w-8xl space-y-6 px-6 py-10 lg:px-10">
          <div className="h-6 w-40 animate-pulse rounded bg-ink/10" />
          <div className="h-44 animate-pulse rounded-2xl border border-ink/10 bg-card/60" />
          <div className="h-56 animate-pulse rounded-2xl border border-ink/10 bg-card/60" />
        </div>
      </div>
    )
  }

  if (!request) {
    return (
      <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
        <div className="mx-auto max-w-3xl px-6 py-24 text-center lg:px-10">
          <h1 className="font-display text-xl text-ink">Request not found</h1>
          <p className="mt-1.5 text-sm text-ink/50">We couldn't find a request with that ID.</p>
          <button type="button" onClick={() => router.push("/admin/requests")} className={`${BTN_OUTLINE} mt-5`}>
            <ArrowLeft size={14} />
            Back to requests
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

  const handleAttachMessageImage = async (file: File) => {
    // 'products' is the closest existing bucket — no dedicated chat-
    // attachments folder exists in UploadFolder yet (see
    // lib/upload/useImageUpload.ts); reusing it rather than adding a
    // new folder value, which would also need the /api/upload route's
    // own allowlist updated.
    const url = await uploadMessageAttachment(file, "products")
    if (url) setMessageAttachmentUrl(url)
  }

  const handleSendRequestMessage = async () => {
    if (!request.chatThreadId || (!messageDraft.trim() && !messageAttachmentUrl) || sendingMessage) return
    setSendingMessage(true)
    // requestIdOverride (5th arg) explicitly tags this message to THIS
    // request — not whatever thread.requestId happens to remember,
    // which could be stale once this thread has carried more than one
    // request over the customer's lifetime.
    const res = await sendChatMessage(request.chatThreadId, messageDraft, messageAttachmentUrl ?? undefined, undefined, request.id)
    if (res.ok) {
      const sentAttachment = messageAttachmentUrl
      setMessageDraft("")
      setMessageAttachmentUrl(null)
      // Optimistic append — the realtime subscription above will also
      // see this insert and no-op (same id already present) rather
      // than duplicate it.
      setRequestMessages((prev) => [
        ...prev,
        {
          id: `optimistic-${Date.now()}`,
          thread_id: request.chatThreadId!,
          sender: "ops",
          sender_name: currentUser.name,
          text: messageDraft || null,
          attachment_url: sentAttachment,
          request_id: request.id,
          order_id: null,
          sent_via_whatsapp: false,
          created_at: new Date().toISOString(),
        },
      ])
    } else {
      console.error("[handleSendRequestMessage]", res.error)
    }
    setSendingMessage(false)
  }

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      {/* Top bar */}
      <div className="sticky top-0 z-20 border-b border-ink/[0.07] bg-parchment/90 backdrop-blur">
        <div className="mx-auto flex max-w-8xl items-center justify-between gap-4 px-6 py-3 lg:px-10">
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
            <button
              type="button"
              onClick={() => router.push("/admin/requests")}
              className={`inline-flex items-center gap-1.5 rounded-md font-medium text-ink/55 hover:text-ink ${FOCUS}`}
            >
              <ArrowLeft size={15} />
              Requests
            </button>
            <ChevronRight size={14} className="text-ink/25" />
            <span className="truncate font-medium text-ink">{request.customerName}</span>
          </nav>

          <div className="flex items-center gap-2">
            {request.chatThreadId && (
              <button
                type="button"
                onClick={() => setChatOpen(true)}
                className={`relative ${BTN_OUTLINE} ${
                  request.hasUnrepliedMessage ? "border-gold/50 bg-gold/10 text-gold-deep hover:bg-gold/15" : ""
                }`}
              >
                <MessageSquare size={14} />
                Chat
                {requestMessages.length > 0 && (
                  <span
                    className={`rounded-full px-1.5 text-xs font-semibold tabular-nums ${
                      request.hasUnrepliedMessage ? "bg-gold/20 text-gold-deep" : "bg-teal-deep/10 text-teal-deep"
                    }`}
                  >
                    {requestMessages.length}
                  </span>
                )}
              </button>
            )}
            {/* Sibling, not nested in the button above — see the same
                note on the order detail page's chat button. */}
            {request.hasUnrepliedMessage && (
              <span className="flex items-center gap-1 rounded-full bg-gold/20 py-1 pl-2 pr-1 text-xs font-semibold text-gold-deep">
                <span className="h-1.5 w-1.5 flex-none animate-pulse rounded-full bg-gold-deep" />
                Awaiting reply
                <button
                  type="button"
                  onClick={() => markRequestReplied(request.id)}
                  title="Mark as replied — dismisses this without sending a message"
                  className="ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-gold-deep/70 hover:bg-gold-deep/10 hover:text-gold-deep"
                >
                  Dismiss
                </button>
              </span>
            )}
            {request.linkedOrderId && (
              <button
                type="button"
                onClick={() => router.push(`/admin/orders/${request.linkedOrderId}`)}
                className={BTN_OUTLINE}
              >
                View order {request.linkedOrderId}
                <ChevronRight size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* pb-8, not pb-20: the extra bottom padding was showing up as a
          long empty scroll area below the last cards. */}
      <div className="mx-auto max-w-8xl px-6 pb-8 pt-6 lg:px-10">
        {/* Summary */}
        <div className="overflow-hidden rounded-2xl border border-ink/10 bg-card">
          <div className="flex flex-col gap-4 p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="font-display text-3xl leading-none text-ink">{request.customerName}</h1>
              <Pill tone={STATUS_TONE[request.status]}>{REQUEST_STATUS_LABEL[request.status]}</Pill>
              {request.slaBreached && <Pill tone="rose">Past SLA</Pill>}
            </div>

            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-ink/[0.07] pt-4 sm:grid-cols-4">
              <Meta label="Request">{request.id}</Meta>
              <Meta label="Submitted">{request.ageLabel} ago</Meta>
              <Meta label="Assigned to">{request.assignedStaffName}</Meta>
              <Meta label="Items">{request.items.length}</Meta>
            </dl>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Main column: one card per item ask */}
          <div className="flex flex-col gap-6 lg:col-span-2">
            {request.items.map((item, idx) => (
              <SectionCard
                key={item.id}
                title={`Item ${idx + 1} of ${request.items.length}`}
                right={
                  item.quote !== undefined ? (
                    <Pill tone="teal">Quoted · Rs. {item.quote.toLocaleString()}</Pill>
                  ) : undefined
                }
              >
                <div className="space-y-4">
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
                    <div className="rounded-xl border border-gold/30 bg-gold/5 px-3.5 py-3">
                      <p className="text-xs font-semibold text-ink/60">
                        {item.needsVariantConfirmation
                          ? "Size/color unclear from the link — confirm with the customer over chat, then record it here."
                          : "Pick the customer's confirmed choice from the options you defined above."}
                      </p>
                      {item.confirmedVariant ? (
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <Pill tone="teal">Confirmed: {item.confirmedVariant}</Pill>
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
                                className={FIELD}
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
                            className={BTN_PRIMARY}
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
                            className={`flex-1 ${FIELD}`}
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveVariant(item.id)}
                            disabled={!variantInputs[item.id]?.trim()}
                            className={BTN_PRIMARY}
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
                  <div className="rounded-xl border border-ink/10 bg-parchment/40 px-3.5 py-3">
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
                          className={`w-full ${FIELD}`}
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
                          className={`w-full ${FIELD}`}
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
                            className={`flex-1 ${FIELD}`}
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
                            className={`w-20 ${FIELD}`}
                          />
                        </div>

                        <div className="space-y-1.5 rounded-lg border border-ink/10 bg-white/60 p-2.5">
                          <p className="text-[11px] font-semibold text-ink/50">
                            Variant options <span className="font-normal text-ink/35">(e.g. Size, Color — predefined choices)</span>
                          </p>
                          {(productDetailDrafts[item.id]?.variantRows ?? []).map((row, vi) => (
                            <div key={vi} className="flex gap-1.5">
                              <input
                                type="text"
                                value={row.dimension}
                                onChange={(e) => updateVariantRow(item.id, vi, "dimension", e.target.value)}
                                placeholder="Dimension (e.g. Size)"
                                className={`w-28 flex-none text-xs ${FIELD}`}
                              />
                              <input
                                type="text"
                                value={row.valuesText}
                                onChange={(e) => updateVariantRow(item.id, vi, "valuesText", e.target.value)}
                                placeholder="Values, comma-separated (e.g. S, M, L, XL)"
                                className={`flex-1 text-xs ${FIELD}`}
                              />
                              <button
                                type="button"
                                onClick={() => removeVariantRow(item.id, vi)}
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
                          <button type="button" onClick={() => handleSaveProductDetails(item.id)} className={BTN_PRIMARY}>
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingProductDetails((prev) => ({ ...prev, [item.id]: false }))}
                            className={BTN_OUTLINE}
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
                        className={`w-full ${FIELD}`}
                      />
                      {canWork && isOpen && (
                        <button type="button" onClick={() => handleSetQuote(item.id)} className={`flex-none ${BTN_PRIMARY}`}>
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
              </SectionCard>
            ))}

            {canWork && isOpen && (
              <SectionCard title="Scraper" className="flex-1">
                <button type="button" onClick={handleRetryScrape} className={BTN_OUTLINE}>
                  <RotateCw size={12} /> Retry scrape
                </button>
                {retryResult && (
                  <p className={`mt-2 text-xs ${retryResult.success ? "text-emerald-700" : "text-ink/50"}`}>
                    {retryResult.message}
                  </p>
                )}
              </SectionCard>
            )}
          </div>

          {/* Sidebar: request-level actions */}
          <aside className="flex flex-col gap-6">
            {canWork && isOpen && request.allItemsQuoted && (
              <SectionCard title="Payment">
                {request.payment ? (
                  <div className="rounded-xl border border-emerald-600/20 bg-emerald-600/5 px-3.5 py-3">
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
                  <div className="space-y-3">
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
                        className={`mt-1 w-full ${FIELD}`}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-ink/50">Method</label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className={`mt-1 w-full ${FIELD}`}
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
                        className={`mt-1 w-full ${FIELD}`}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleConfirmPayment}
                      disabled={!paymentAmountInput || Number(paymentAmountInput) <= 0 || confirmingPayment}
                      className={`w-full ${BTN_PRIMARY}`}
                    >
                      {confirmingPayment ? "Confirming…" : "Confirm payment received"}
                    </button>
                    {paymentError && <p className="text-xs font-semibold text-red-600">{paymentError}</p>}
                  </div>
                )}
              </SectionCard>
            )}

            {canWork && isOpen && (
              <SectionCard title="Move status">
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={!request.allItemsQuoted || !request.payment || confirmingOrder}
                    className={`w-full ${BTN_PRIMARY}`}
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
                  <button type="button" onClick={handleDecline} className="w-full rounded-xl border border-red-600/25 bg-red-600/5 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-600/10">
                    Decline
                  </button>
                </div>
              </SectionCard>
            )}

            {canCloseRequestLine() && isOpen && (
              <SectionCard title="Manager actions">
                <div className="space-y-3">
                  {canReassignRequestLine() && (
                    <div>
                      <label className="text-xs font-semibold text-ink/50">Reassign to</label>
                      <select
                        value={request.assignedStaffId ?? ""}
                        onChange={(e) => reassignRequest(request.id, e.target.value)}
                        className={`mt-1 w-full ${FIELD}`}
                      >
                        <option value="" disabled>Choose staff member</option>
                        {staffOnly.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <button type="button" onClick={handleDecline} className={`w-full ${BTN_OUTLINE}`}>
                    Close request
                  </button>
                </div>
              </SectionCard>
            )}

            <section className="flex flex-1 flex-col rounded-2xl border border-ink/10 bg-card p-5">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
                <MessageSquare size={16} className="text-teal-deep" />
                Customer chat
              </h2>

              {!request.chatThreadId ? (
                <p className="mt-3 text-sm text-ink/45">No chat thread linked to this request.</p>
              ) : (
                <>
                  <div className="mt-3 space-y-2">
                    {loadingMessages ? (
                      <p className="text-sm text-ink/40">Loading messages…</p>
                    ) : requestMessages.length === 0 ? (
                      <p className="text-sm text-ink/45">No messages about this request yet.</p>
                    ) : (
                      requestMessages.slice(-2).map((m) => (
                        <div
                          key={m.id}
                          className={`rounded-xl border-l-2 p-3 text-sm ${
                            m.sender === "customer" ? "border-l-ink/20 bg-parchment/50" : "border-l-teal-deep bg-teal/[0.05]"
                          }`}
                        >
                          <p className="line-clamp-2 break-words text-ink/80">{m.text ?? "Sent an attachment"}</p>
                          <p className="mt-1 text-xs text-ink/40">
                            {m.sender_name}, {new Date(m.created_at).toLocaleString()}
                          </p>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="mt-auto pt-4">
                    <button type="button" onClick={() => setChatOpen(true)} className={`w-full ${BTN_PRIMARY}`}>
                      <MessageSquare size={14} />
                      Open chat{requestMessages.length > 0 ? ` (${requestMessages.length})` : ""}
                    </button>
                  </div>
                </>
              )}
            </section>
          </aside>
        </div>
      </div>

      {/* Chat drawer: slides over the page from the right. */}
      {chatOpen && request.chatThreadId && (
        <div
          className="fixed inset-0 z-40 flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-label={`Chat with ${request.customerName}`}
        >
          <div className="absolute inset-0 bg-ink/30" onClick={() => setChatOpen(false)} aria-hidden />

          <div className="relative flex h-full w-full max-w-xl flex-col bg-card shadow-2xl">
            <header className="flex items-start justify-between gap-3 border-b border-ink/[0.07] px-5 py-4">
              <div className="min-w-0">
                <h2 className="truncate font-display text-lg font-semibold text-ink">{request.customerName}</h2>
                <p className="mt-0.5 text-xs text-ink/50">
                  Only messages tagged to this request — the customer's full thread may carry more history than shown here.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setChatOpen(false)}
                aria-label="Close chat"
                className={`flex-none rounded-lg p-1.5 text-ink/50 hover:bg-ink/[0.06] hover:text-ink ${FOCUS}`}
              >
                <X size={18} />
              </button>
            </header>

            <div ref={messageListRef} className="flex-1 space-y-3 overflow-y-auto overscroll-contain bg-parchment/40 px-5 py-4">
              {loadingMessages ? (
                <p className="text-sm text-ink/40">Loading messages…</p>
              ) : requestMessages.length === 0 ? (
                <p className="text-sm text-ink/45">No messages about this request yet.</p>
              ) : (
                requestMessages.map((m) => {
                  const fromCustomer = m.sender === "customer"
                  return (
                    <div key={m.id} className={`flex ${fromCustomer ? "justify-start" : "justify-end"}`}>
                      <div
                        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ring-1 ring-inset ${
                          fromCustomer
                            ? "rounded-tl-sm bg-card ring-ink/10"
                            : "rounded-tr-sm bg-teal/10 ring-teal/20"
                        }`}
                      >
                        {m.text && <p className="whitespace-pre-wrap break-words text-ink/85">{m.text}</p>}
                        {m.attachment_url && (
                          <MessageAttachment
                            url={m.attachment_url}
                            className={m.text ? "mt-2" : ""}
                            onLoad={() =>
                              messageListRef.current?.scrollTo({ top: messageListRef.current.scrollHeight })
                            }
                          />
                        )}
                        <p className="mt-1 text-[11px] text-ink/40">
                          {m.sender_name}, {new Date(m.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <div className="space-y-2 border-t border-ink/[0.07] bg-card p-4">
              <label htmlFor="request-message-draft" className="sr-only">
                Send a message about this request
              </label>
              {messageAttachmentUrl && (
                <div className="flex items-center gap-2 rounded-lg border border-ink/10 bg-parchment/40 p-2">
                  <img src={messageAttachmentUrl} alt="" className="h-10 w-10 rounded-md object-cover" />
                  <span className="flex-1 text-xs text-ink/50">Image attached</span>
                  <button
                    type="button"
                    onClick={() => setMessageAttachmentUrl(null)}
                    aria-label="Remove attachment"
                    className="rounded p-1 text-ink/40 hover:bg-ink/[0.06] hover:text-ink"
                  >
                    <X size={13} />
                  </button>
                </div>
              )}
              <textarea
                ref={messageInputRef}
                id="request-message-draft"
                value={messageDraft}
                onChange={(e) => setMessageDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSendRequestMessage()
                }}
                rows={3}
                placeholder="Message the customer about this request…"
                disabled={sendingMessage}
                className={`${FIELD} w-full resize-none`}
              />
              <div className="flex items-center justify-between gap-3">
                <label
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-xs font-semibold text-ink/60 hover:bg-parchment/60 ${
                    uploadingAttachment ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                  }`}
                >
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    disabled={uploadingAttachment}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      e.target.value = ""
                      if (file) handleAttachMessageImage(file)
                    }}
                    className="hidden"
                  />
                  {uploadingAttachment ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} />}
                  {uploadingAttachment ? "Uploading…" : "Attach image"}
                </label>
                <span className="hidden flex-1 text-right text-xs text-ink/40 sm:block">Ctrl or ⌘ + Enter to send</span>
                <button
                  type="button"
                  onClick={handleSendRequestMessage}
                  disabled={(!messageDraft.trim() && !messageAttachmentUrl) || sendingMessage}
                  className={`whitespace-nowrap ${BTN_PRIMARY}`}
                >
                  <Send size={13} />
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <SendMessageModal
        open={pendingMessage !== null}
        title={pendingMessage?.title ?? ""}
        defaultMessage={pendingMessage?.text ?? ""}
        onSend={async (text, attachmentUrl) => {
          const result = await sendChatMessage(request.chatThreadId, text, attachmentUrl, undefined, request.id)
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