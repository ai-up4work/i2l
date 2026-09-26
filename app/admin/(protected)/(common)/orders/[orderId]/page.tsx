// app/admin/orders/[orderId]/page.tsx
"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { AlertTriangle, ArrowLeft, Check, ChevronRight, ExternalLink, ImagePlus, Loader2, MessageSquare, PencilLine, Send, Trash2, X } from "lucide-react"

import { useAdminData, hoursSince, formatAge } from "@/contexts/AdminDataContext"
import { STAGE_ORDER, CHANNEL_LABEL, type Channel, type Order, type OrderStage } from "@/types/admin"
import type { StatusTone } from "@/components/admin/warehouse/status-pill"
import { AnimatedItemCardStack } from "@/components/admin/orders/AnimatedItemCardStack"
import { fetchQcIssuesForItems, type CustomerVisibleQcIssue } from "@/lib/supabase/qc-issues"
import QcIssueBanner from "@/components/shared/QcIssueBanner"
import { createClient } from "@/lib/supabase/client"
import { subscribeToOrderMessages, type ChatMessageRow } from "@/lib/supabase/chat"
import { useImageUpload } from "@/lib/upload/useImageUpload"

/* ---------- tokens ---------- */

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
const CHANNEL_TONE: Record<Channel, StatusTone | "ink"> = { 1: "teal", 2: "ink", 3: "amber" }
const STAGE_TONE: Record<OrderStage, StatusTone | "ink"> = {
  Ordered: "ink",
  "Quality check": "amber",
  Shipped: "teal",
  Delivered: "teal",
}
const STAGE_ACCENT: Record<OrderStage, string> = {
  Ordered: "border-l-ink/15",
  "Quality check": "border-l-gold-deep",
  Shipped: "border-l-teal-deep",
  Delivered: "border-l-teal-deep",
}

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40"
const BTN_PRIMARY = `inline-flex items-center justify-center gap-1.5 rounded-xl bg-teal-deep px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`
const BTN_OUTLINE = `inline-flex items-center justify-center gap-1.5 rounded-xl border border-ink/15 bg-card px-4 py-2 text-sm font-medium text-ink/70 transition-colors hover:bg-ink/[0.04] hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`
const FIELD = `rounded-lg border border-ink/10 bg-card px-3 py-2 text-sm text-ink placeholder:text-ink/35 outline-none focus:border-teal/50 focus:ring-2 focus:ring-teal/15 disabled:opacity-60`

const FALLBACK_PRODUCT_IMAGE =
  "https://images.pexels.com/photos/5632402/pexels-photo-5632402.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop"

/* ---------- helpers ---------- */

// Same distinct-channel derivation as /admin/orders' orderChannels() —
// kept in sync so a mixed order shows the same badges in the list and here.
function orderChannels(o: Order): Channel[] {
  const set = new Set<Channel>(o.items.map((i) => i.channel ?? o.channel))
  return ([1, 2, 3] as Channel[]).filter((c) => set.has(c))
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })

/* ---------- small components ---------- */

function Pill({
  tone,
  icon,
  children,
}: {
  tone: StatusTone | "ink"
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${TONE_PILL[tone]}`}
    >
      {icon ?? <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[tone]}`} />}
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
  count,
  className = "",
  children,
}: {
  title: string
  count?: number
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={`flex flex-col rounded-2xl border border-ink/10 bg-card ${className}`}>
      <header className="flex items-baseline gap-2 px-5 pt-5">
        <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
        {count !== undefined && <span className="text-sm text-ink/40">{count}</span>}
      </header>
      <div className="flex-1 p-5 pt-4">{children}</div>
    </section>
  )
}

function StageTracker({
  current,
  history,
}: {
  current: OrderStage
  history: { stage: string; at: string }[]
}) {
  const currentIdx = STAGE_ORDER.indexOf(current)
  return (
    <ol className="grid" style={{ gridTemplateColumns: `repeat(${STAGE_ORDER.length}, minmax(0, 1fr))` }}>
      {STAGE_ORDER.map((stage, i) => {
        const done = i < currentIdx
        const active = i === currentIdx
        const reached = [...history].reverse().find((e) => e.stage === stage)
        return (
          <li key={stage} aria-current={active ? "step" : undefined} className="relative flex flex-col items-center text-center">
            {i > 0 && (
              <span
                aria-hidden
                className={`absolute right-1/2 top-3.5 h-0.5 w-full ${i <= currentIdx ? "bg-teal-deep/50" : "bg-ink/10"}`}
              />
            )}
            <span
              className={`relative z-10 grid h-7 w-7 place-items-center rounded-full text-xs font-semibold ring-4 ring-card ${
                active
                  ? "bg-teal-deep text-white"
                  : done
                  ? "bg-teal-deep/15 text-teal-deep"
                  : "bg-ink/[0.06] text-ink/35"
              }`}
            >
              {done ? <Check size={14} strokeWidth={3} /> : i + 1}
            </span>
            <span className={`mt-2 text-sm ${active ? "font-semibold text-ink" : done ? "font-medium text-ink/70" : "text-ink/40"}`}>
              {stage}
            </span>
            <span className="mt-0.5 h-4 text-xs text-ink/40">{reached ? shortDate(reached.at) : ""}</span>
          </li>
        )
      })}
    </ol>
  )
}

// Shows a chat attachment inline. Click opens the full-size image in a new
// tab. If the file isn't a displayable image, falls back to a plain link.
// Same component as the request detail page's own drawer uses.
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

/* ---------- page ---------- */

export default function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>()
  const router = useRouter()
  const {
    getOrder,
    sites,
    currentUser,
    permissions,
    advanceStage,
    rollbackStage,
    canAdvanceStage,
    reassignSite,
    addInternalNote,
    deleteOrder,
    dataLoading,
    sendChatMessage,
    fetchMessagesForOrder,
    resolveOrderId,
    markOrderReplied,
  } = useAdminData()

  const order = getOrder(orderId)
  const [noteDraft, setNoteDraft] = useState("")
  const [stageError, setStageError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [qcIssuesByItemId, setQcIssuesByItemId] = useState<Map<string, CustomerVisibleQcIssue>>(new Map())

  // ---- embedded order-chat panel state ----
  // See data/Wishdrop-chat-messages-order-id.sql for why this can show
  // messages at all: chat_messages had no order_id column before, so
  // there was no way to isolate "just the conversation about THIS
  // order" out of a thread that carries a customer's whole history.
  const [orderMessages, setOrderMessages] = useState<ChatMessageRow[]>([])
  const [loadingMessages, setLoadingMessages] = useState(true)
  const [messageDraft, setMessageDraft] = useState("")
  const [messageAttachmentUrl, setMessageAttachmentUrl] = useState<string | null>(null)
  const [sendingMessage, setSendingMessage] = useState(false)
  const messageListRef = useRef<HTMLDivElement>(null)
  // Same drawer pattern as the request detail page's "Chat" button — a
  // slide-over instead of the old always-visible inline card, which
  // freed up the Pipeline card to use the full row width (see below).
  const [chatOpen, setChatOpen] = useState(false)
  const { uploading: uploadingAttachment, upload: uploadMessageAttachment } = useImageUpload()

  // The conversation this order's messages are sent into. Normally
  // order.chatThreadId; if the order was never linked (older orders, and
  // "paste a link → confirm" orders before that was fixed), the drawer
  // repairs the link itself via /api/admin/orders/[id]/chat-thread
  // instead of dead-ending.
  const [healedThreadId, setHealedThreadId] = useState<string | null>(null)
  const [threadLinkError, setThreadLinkError] = useState<string | null>(null)
  const threadId = order?.chatThreadId ?? healedThreadId
  useEffect(() => {
    setHealedThreadId(null)
    setThreadLinkError(null)
    if (!order || order.chatThreadId) return
    let cancelled = false
    fetch(`/api/admin/orders/${encodeURIComponent(order.id)}/chat-thread`, { method: "POST" })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error || "Could not link this order to the customer’s chat.")
        if (!cancelled) setHealedThreadId(d.threadId)
      })
      .catch((err) => !cancelled && setThreadLinkError(err.message))
    return () => {
      cancelled = true
    }
  }, [order?.id, order?.chatThreadId])

  // Messages are loaded by their ORDER TAG, from any of the customer's
  // threads — not only the one linked above — so a correctly tagged
  // message always shows here.
  useEffect(() => {
    if (!order) {
      setLoadingMessages(false)
      return
    }
    let cancelled = false
    setLoadingMessages(true)
    fetchMessagesForOrder(order.id, threadId ?? "").then((rows) => {
      if (!cancelled) {
        setOrderMessages(rows)
        setLoadingMessages(false)
      }
    })
    return () => {
      cancelled = true
    }
    // threadId deliberately not a dependency: loading doesn't use it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, fetchMessagesForOrder])

  // Live: new messages tagged to this order, from any thread.
  useEffect(() => {
    if (!order) return
    const realOrderId = resolveOrderId(order.id)
    if (!realOrderId) return
    const supabase = createClient()
    const unsubscribe = subscribeToOrderMessages(supabase, realOrderId, (row) => {
      setOrderMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]))
    })
    return unsubscribe
  }, [order?.id, resolveOrderId])

  // Keep the panel scrolled to the newest message (also on open, since the
  // drawer's list only mounts while it's open).
  useEffect(() => {
    messageListRef.current?.scrollTo({ top: messageListRef.current.scrollHeight })
  }, [orderMessages, chatOpen])

  const handleAttachMessageImage = async (file: File) => {
    // 'products' is the closest existing bucket — no dedicated chat-
    // attachments folder exists in UploadFolder yet (see
    // lib/upload/useImageUpload.ts); reusing it rather than adding a
    // new folder value, which would also need the /api/upload route's
    // own allowlist updated.
    const url = await uploadMessageAttachment(file, "products")
    if (url) setMessageAttachmentUrl(url)
  }

  const handleSendOrderMessage = async () => {
    if (!order || !threadId || (!messageDraft.trim() && !messageAttachmentUrl) || sendingMessage) return
    setSendingMessage(true)
    const res = await sendChatMessage(threadId, messageDraft, messageAttachmentUrl ?? undefined, order.id)
    if (res.ok) {
      const sentAttachment = messageAttachmentUrl
      setMessageDraft("")
      setMessageAttachmentUrl(null)
      // Optimistic append — the realtime subscription above will also
      // see this insert and no-op (same id already present) rather
      // than duplicate it.
      setOrderMessages((prev) => [
        ...prev,
        {
          id: `optimistic-${Date.now()}`,
          thread_id: threadId,
          sender: "ops",
          sender_name: currentUser.name,
          text: messageDraft || null,
          attachment_url: sentAttachment,
          request_id: null,
          order_id: resolveOrderId(order.id) ?? null,
          sent_via_whatsapp: false,
          channel: null,
          created_at: new Date().toISOString(),
        },
      ])
    } else {
      console.error("[handleSendOrderMessage]", res.error)
    }
    setSendingMessage(false)
  }

  // Depend on the item ids, not the order object, so unrelated order updates
  // (notes, stage changes) don't refetch QC issues.
  const itemIdsKey = useMemo(
    () => (order ? order.items.map((i) => i.id).filter(Boolean).join(",") : ""),
    [order],
  )
  useEffect(() => {
    if (!itemIdsKey) return
    let cancelled = false
    fetchQcIssuesForItems(itemIdsKey.split(",")).then((m) => {
      if (!cancelled) setQcIssuesByItemId(m)
    })
    return () => {
      cancelled = true
    }
  }, [itemIdsKey])

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

  if (!order) {
    return (
      <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
        <div className="mx-auto max-w-3xl px-6 py-24 text-center lg:px-10">
          <h1 className="font-display text-xl text-ink">Order not found</h1>
          <p className="mt-1.5 text-sm text-ink/50">We couldn't find an order with the ID {orderId}.</p>
          <button type="button" onClick={() => router.push("/admin/orders")} className={`${BTN_OUTLINE} mt-5`}>
            <ArrowLeft size={14} />
            Back to orders
          </button>
        </div>
      </div>
    )
  }

  const canOverride = permissions.canOverrideOrderStage
  const canAddNote =
    permissions.canMutateOrderStage && (!permissions.ordersScopedToOwnSite || order.siteId === currentUser.siteId)

  const siteName = sites.find((s) => s.id === order.siteId)?.name ?? order.siteId
  const stageIdx = STAGE_ORDER.indexOf(order.stage)
  const advanceCheck = canAdvanceStage(order.id)
  const channels = orderChannels(order)
  const isMixedOrder = channels.length > 1
  const hasOpenQcIssue = [...qcIssuesByItemId.values()].some((issue) => issue.resolution === "pending")
  const blockedReason = stageIdx < STAGE_ORDER.length - 1 && !advanceCheck.allowed ? advanceCheck.reason : null

  const handleAdvance = () => {
    const r = advanceStage(order.id)
    setStageError(r.allowed ? null : r.reason ?? "This order can't advance yet.")
  }
  const handleRollback = () => {
    const r = rollbackStage(order.id)
    setStageError(r.allowed ? null : r.reason ?? "This order can't roll back.")
  }
  const handleDelete = () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true)
      return
    }
    deleteOrder(order.id)
    router.push("/admin/orders")
  }
  const submitNote = () => {
    if (!noteDraft.trim()) return
    addInternalNote(order.id, noteDraft)
    setNoteDraft("")
  }

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      {/* Top bar */}
      <div className="sticky top-0 z-20 border-b border-ink/[0.07] bg-parchment/90 backdrop-blur">
        <div className="mx-auto flex max-w-8xl items-center justify-between gap-4 px-6 py-3 lg:px-10">
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
            <Link
              href="/admin/orders"
              className={`inline-flex items-center gap-1.5 rounded-md font-medium text-ink/55 hover:text-ink ${FOCUS}`}
            >
              <ArrowLeft size={15} />
              Orders
            </Link>
            <ChevronRight size={14} className="text-ink/25" />
            <span className="truncate font-medium text-ink">{order.id}</span>
          </nav>

          <div className="flex items-center gap-2">
            {/* Always clickable — "no need to link with the thread" per
                the person's own instruction: this doesn't gate on
                order.chatThreadId existing (every order gets one at
                creation now anyway — see the comment on Order.chatThreadId
                in types/admin.ts — but if an old order somehow lacks
                one, the drawer itself explains that inline rather than
                hiding the button entirely). */}
            <button
              type="button"
              onClick={() => setChatOpen(true)}
              className={`relative ${BTN_OUTLINE} ${
                order.hasUnrepliedMessage ? "border-gold/50 bg-gold/10 text-gold-deep hover:bg-gold/15" : ""
              }`}
            >
              <MessageSquare size={14} />
              Open chat
              {orderMessages.length > 0 && (
                <span
                  className={`rounded-full px-1.5 text-xs font-semibold tabular-nums ${
                    order.hasUnrepliedMessage ? "bg-gold/20 text-gold-deep" : "bg-teal-deep/10 text-teal-deep"
                  }`}
                >
                  {orderMessages.length}
                </span>
              )}
            </button>
            {/* Sibling, not nested in the button above — it needs its
                own clickable "Dismiss", and a button can't contain
                another button. */}
            {order.hasUnrepliedMessage && (
              <span className="flex items-center gap-1 rounded-full bg-gold/20 py-1 pl-2 pr-1 text-xs font-semibold text-gold-deep">
                <span className="h-1.5 w-1.5 flex-none animate-pulse rounded-full bg-gold-deep" />
                Awaiting reply
                <button
                  type="button"
                  onClick={() => markOrderReplied(order.id)}
                  title="Mark as replied — dismisses this without sending a message"
                  className="ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-gold-deep/70 hover:bg-gold-deep/10 hover:text-gold-deep"
                >
                  Dismiss
                </button>
              </span>
            )}
            {permissions.canDelete && (
            <button
              type="button"
              onClick={handleDelete}
              onBlur={() => setConfirmingDelete(false)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${FOCUS} ${
                confirmingDelete
                  ? "border-red-600 bg-red-600 text-white hover:bg-red-700"
                  : "border-red-600/25 bg-red-600/5 text-red-700 hover:bg-red-600/10"
              }`}
            >
              <Trash2 size={13} />
              {confirmingDelete ? "Click again to delete permanently" : "Delete order"}
            </button>
          )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-8xl px-6 pb-20 pt-6 lg:px-10">
        {/* Summary */}
        <div className={`overflow-hidden rounded-2xl border border-l-4 border-ink/10 bg-card ${order.delayed ? "border-l-rose-500" : STAGE_ACCENT[order.stage]}`}>
          <div className="flex flex-col gap-6 p-5 sm:p-6 md:flex-row md:items-center">
            <div className="h-32 w-full flex-none md:w-60">
              <AnimatedItemCardStack items={order.items} className="h-full" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h1 className="font-display text-3xl leading-none text-ink">{order.id}</h1>
                <Pill tone={STAGE_TONE[order.stage]}>{order.stage}</Pill>
                {order.delayed && <Pill tone="rose">Delayed</Pill>}
                {hasOpenQcIssue && (
                  <Pill tone="rose" icon={<AlertTriangle size={11} className="shrink-0" />}>
                    QC issue open
                  </Pill>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {channels.map((ch) => (
                  <Pill key={ch} tone={CHANNEL_TONE[ch]}>
                    Channel {ch}: {CHANNEL_LABEL[ch]}
                  </Pill>
                ))}
                {order.isManualQuote && <Pill tone="amber">Manual quote</Pill>}
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-ink/[0.07] pt-4 sm:grid-cols-4">
                <Meta label="Customer">{order.customerName}</Meta>
                <Meta label="Site">{siteName}</Meta>
                <Meta label="Placed">{formatAge(hoursSince(order.placedAt))} ago</Meta>
                <div className="min-w-0">
                  <dt className="text-xs text-ink/45">Order total</dt>
                  <dd className="mt-0.5 font-display text-xl leading-tight tabular-nums text-ink">
                    Rs. {order.totalValue.toLocaleString("en-US")}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>

        {/*
          LAYOUT: one 3-column grid, laid out in two rows.
            Row 1: Pipeline, now full width — it used to share this row
                   with the Customer chat card, which moved into the
                   header's "Open chat" slide-over (matches the request
                   detail page's own chat drawer) instead of sitting
                   inline here.
            Row 2: Items + Stage history (2 cols, stacked) + Internal notes (1 col).
          On screens below `lg` everything simply stacks in this order.
        */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Row 1: Pipeline */}
          <SectionCard title="Pipeline" className="lg:col-span-3">
            <StageTracker current={order.stage} history={order.stageHistory} />

            {canOverride ? (
              <div className="mt-6 rounded-xl bg-ink/[0.03] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="max-w-md text-sm text-ink/55">
                    Manager override. Orders normally advance on their own through Quality check, Pack &amp; label
                    and In transit.
                  </p>
                  <div className="flex gap-2">
                    <button type="button" onClick={handleRollback} disabled={stageIdx <= 0} className={BTN_OUTLINE}>
                      Roll back
                    </button>
                    <button
                      type="button"
                      onClick={handleAdvance}
                      disabled={stageIdx >= STAGE_ORDER.length - 1 || !advanceCheck.allowed}
                      title={!advanceCheck.allowed ? advanceCheck.reason : undefined}
                      className={BTN_PRIMARY}
                    >
                      Advance to next stage
                    </button>
                  </div>
                </div>
                {(blockedReason || stageError) && (
                  <p role="alert" className="mt-3 flex items-start gap-1.5 text-sm text-rose-700">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    {stageError ?? blockedReason}
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-6 rounded-xl bg-ink/[0.03] p-4 text-sm text-ink/50">
                This order moves forward automatically as it clears Purchases, Quality check, Pack &amp; label and
                In transit. Only a manager can change its stage directly.
              </p>
            )}

            {permissions.canReassignSite && (
              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
                <label htmlFor="reassign-site" className="text-sm font-medium text-ink/70">
                  Fulfilling site
                </label>
                <select
                  id="reassign-site"
                  value={order.siteId}
                  onChange={(e) => reassignSite(order.id, e.target.value)}
                  className={FIELD}
                >
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-ink/45">Changing the site restarts QC if the order is mid-QC.</span>
              </div>
            )}
          </SectionCard>

          {/* Row 2, left: Items + Stage history */}
          <div className="flex flex-col gap-6 lg:col-span-2">
            <SectionCard title="Items" count={order.items.length}>
              <ul className="divide-y divide-ink/[0.07]">
                {order.items.map((item) => {
                  const issue = qcIssuesByItemId.get(item.id)
                  const itemChannel = item.channel ?? order.channel
                  return (
                    <li key={item.id} className="py-4 first:pt-0 last:pb-0">
                      <div className="flex gap-4">
                        <img
                          src={item.productImage ?? FALLBACK_PRODUCT_IMAGE}
                          alt={item.title}
                          className="h-20 w-20 flex-none rounded-xl border border-ink/[0.06] bg-parchment/60 object-contain"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <p className="line-clamp-2 break-words text-sm font-semibold text-ink">{item.title}</p>
                            <span className="shrink-0 rounded-md bg-ink/[0.05] px-2 py-0.5 text-xs font-medium tabular-nums text-ink/60">
                              Qty {item.quantity}
                            </span>
                          </div>

                          {(isMixedOrder || item.variant) && (
                            <div className="mt-1.5 flex flex-wrap items-center gap-2">
                              {isMixedOrder && (
                                <Pill tone={CHANNEL_TONE[itemChannel]}>
                                  Channel {itemChannel}: {CHANNEL_LABEL[itemChannel]}
                                </Pill>
                              )}
                              {item.variant && <span className="text-xs text-ink/55">{item.variant}</span>}
                            </div>
                          )}

                          <dl className="mt-2 space-y-1 text-xs text-ink/50">
                            {item.sku && (
                              <div className="flex gap-1.5">
                                <dt className="text-ink/40">Catalog SKU</dt>
                                <dd className="font-medium text-ink/70">{item.sku}</dd>
                              </div>
                            )}
                            {item.sourceSnapshot && (
                              <div className="flex gap-1.5">
                                <dt className="text-ink/40">Source snapshot</dt>
                                <dd className="text-ink/70">{item.sourceSnapshot}</dd>
                              </div>
                            )}
                            {item.requestLink && (
                              <div className="flex gap-1.5">
                                <dt className="shrink-0 text-ink/40">Request link</dt>
                                <dd className="min-w-0">
                                  <a
                                    href={item.requestLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex max-w-full items-center gap-1 text-teal-deep hover:underline"
                                  >
                                    <span className="truncate">{item.requestLink}</span>
                                    <ExternalLink size={11} className="shrink-0" />
                                  </a>
                                </dd>
                              </div>
                            )}
                          </dl>
                        </div>
                      </div>

                      {issue && (
                        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50/50 p-3">
                          <QcIssueBanner issue={issue} />
                          <Link
                            href={`/admin/qc-issues/${issue.id}`}
                            className={`mt-2 inline-flex items-center gap-1 rounded text-xs font-semibold text-teal-deep hover:underline ${FOCUS}`}
                          >
                            Manage this QC issue <ChevronRight size={12} />
                          </Link>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>

              <div className="mt-4 border-t border-ink/[0.07] pt-3">
                <Link
                  href="/admin/purchases"
                  className={`inline-flex items-center gap-1 rounded text-sm font-medium text-teal-deep hover:underline ${FOCUS}`}
                >
                  Manage purchasing for these items <ChevronRight size={14} />
                </Link>
              </div>
            </SectionCard>

            <SectionCard title="Stage history" className="flex-1">
              <ol className="ml-1 border-l border-ink/10">
                {[...order.stageHistory].reverse().map((ev, i) => (
                  <li key={i} className="relative pb-5 pl-6 last:pb-0">
                    <span
                      className={`absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-card ${
                        i === 0 ? "bg-teal-deep" : "bg-ink/25"
                      }`}
                    />
                    <p className={`text-sm ${i === 0 ? "font-semibold text-ink" : "font-medium text-ink/75"}`}>
                      {ev.stage}
                    </p>
                    <p className="text-xs text-ink/45">
                      {new Date(ev.at).toLocaleString()} by {ev.by}
                    </p>
                  </li>
                ))}
              </ol>
            </SectionCard>
          </div>

          {/* Row 2, right: Internal notes (stretches to match the Items +
              Stage history column beside it) */}
          <aside className="flex flex-col lg:col-span-1">
            <section className="flex flex-1 flex-col rounded-2xl border border-gold/30 bg-gold/[0.07] p-5">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
                <PencilLine size={16} className="text-gold-deep" />
                Internal notes
              </h2>
              <p className="mt-1 text-xs text-ink/50">Only ops can see these. Customers never do.</p>

              <ul className="mt-4 max-h-[28rem] space-y-2 overflow-y-auto">
                {order.internalNotes.map((n) => (
                  <li key={n.id} className="rounded-xl bg-card p-3 text-sm shadow-[0_1px_0_rgba(0,0,0,0.03)]">
                    <p className="whitespace-pre-wrap break-words text-ink/80">{n.body}</p>
                    <p className="mt-1.5 text-xs text-ink/45">
                      {n.author}, {new Date(n.at).toLocaleString()}
                    </p>
                  </li>
                ))}
                {order.internalNotes.length === 0 && <li className="text-sm text-ink/45">No notes yet.</li>}
              </ul>

              <div className="mt-auto space-y-2 pt-4">
                <label htmlFor="note-draft" className="sr-only">
                  Add a note for ops
                </label>
                <textarea
                  id="note-draft"
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canAddNote) submitNote()
                  }}
                  rows={3}
                  placeholder="Add a note for ops…"
                  disabled={!canAddNote}
                  className={`${FIELD} w-full resize-none`}
                />
                {canAddNote ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-ink/40">Ctrl or ⌘ + Enter to save</span>
                    <button type="button" onClick={submitNote} disabled={!noteDraft.trim()} className={BTN_PRIMARY}>
                      Add note
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-ink/50">
                    This order belongs to a different site. You can read its notes but not add one.
                  </p>
                )}
              </div>
            </section>
          </aside>
        </div>
      </div>

      {/* Chat drawer: slides over the page from the right — same pattern
          as the request detail page's own drawer. Always openable (not
          gated on order.chatThreadId — every order gets a thread at
          creation now regardless of channel, see the comment on
          Order.chatThreadId in types/admin.ts, but an old pre-fix order
          without one still gets a working button; the drawer explains
          that case inline instead). */}
      {chatOpen && (
        <div
          className="fixed inset-0 z-40 flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-label={`Chat with ${order.customerName}`}
        >
          <div className="absolute inset-0 bg-ink/30" onClick={() => setChatOpen(false)} aria-hidden />

          <div className="relative flex h-full w-full max-w-xl flex-col bg-card shadow-2xl">
            <header className="flex items-start justify-between gap-3 border-b border-ink/[0.07] px-5 py-4">
              <div className="min-w-0">
                <h2 className="truncate font-display text-lg font-semibold text-ink">{order.customerName}</h2>
                <p className="mt-0.5 text-xs text-ink/50">
                  {order.id} — only messages tagged to this order, not the customer's full chat history.
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

            {!threadId ? (
              <div className="flex flex-1 items-center justify-center px-5 text-center">
                {threadLinkError ? (
                  <p className="text-sm font-semibold text-red-600">{threadLinkError}</p>
                ) : (
                  <p className="text-sm text-ink/45">Linking this order to the customer’s chat…</p>
                )}
              </div>
            ) : (
              <>
                <div
                  ref={messageListRef}
                  className="flex-1 space-y-3 overflow-y-auto overscroll-contain bg-parchment/40 px-5 py-4"
                >
                  {loadingMessages ? (
                    <p className="text-sm text-ink/40">Loading messages…</p>
                  ) : orderMessages.length === 0 ? (
                    <p className="text-sm text-ink/45">No messages about this order yet.</p>
                  ) : (
                    orderMessages.map((m) => {
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
                  <label htmlFor="order-drawer-message-draft" className="sr-only">
                    Send a message about this order
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
                    id="order-drawer-message-draft"
                    value={messageDraft}
                    onChange={(e) => setMessageDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSendOrderMessage()
                    }}
                    rows={3}
                    placeholder="Message the customer about this order…"
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
                      onClick={handleSendOrderMessage}
                      disabled={(!messageDraft.trim() && !messageAttachmentUrl) || sendingMessage}
                      className={`whitespace-nowrap ${BTN_PRIMARY}`}
                    >
                      <Send size={13} />
                      Send
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}