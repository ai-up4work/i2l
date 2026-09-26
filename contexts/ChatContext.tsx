// contexts/ChatContext.tsx
'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useOrders, isLiveOrder, type Order } from '@/contexts/Ordercontexts'
import { createClient } from '@/lib/supabase/client'
import { buildWhatsAppLink, deriveHandle, formatHandle } from '@/lib/chat/waLink'
import {
  type ChatMessageRow,
  type ChatSender,
  buildReplyBody,
  getMostRecentOrGeneralThread,
  inferAttachmentKind,
  fetchRecentThreadMessages,
  fetchOlderThreadMessages,
  markThreadRead,
  parseReplyBody,
  sendChatMessage,
  subscribeToThreadMessages,
  uploadChatAttachment,
} from '@/lib/supabase/chat'

// Real UI-facing message shape. `attachment` is singular (one URL,
// matching chat_messages.attachment_url exactly) — see lib/supabase/chat.ts
// for why this replaced the old plural `attachments` array. `replyTo` is
// derived by parsing the stored quote prefix out of `text`, not a
// separate column — same file, same reasoning.
export type ChatAttachment = { url: string; kind: 'image' | 'video' }
export type ReplyPreview = { id: string; sender: ChatSender; text: string }
export type ChatMessage = {
  id: string
  sender: ChatSender
  text: string
  createdAt: number
  /** Raw ISO string from the DB row — kept alongside the numeric
   * `createdAt` specifically as the pagination cursor for
   * fetchOlderThreadMessages. Converting the numeric ms-precision
   * timestamp back to an ISO string for that query would lose
   * Postgres's sub-millisecond precision, which could in rare cases
   * (two messages in the same millisecond) skip or duplicate a row at
   * the page boundary — keeping the original string sidesteps that
   * entirely. */
  createdAtIso: string
  attachment: ChatAttachment | null
  replyTo: ReplyPreview | null
  /** Raw order/request uuid this message was tagged to (chat_messages
   * .order_id / .request_id) — null for a general message. Same field
   * admin's /admin/chat already shows a badge for on every message; a
   * customer with more than one order in flight has exactly the same
   * "which one is this about" problem reading their own chat back, so
   * this needs the same treatment here. Resolved to a human-readable
   * label (order display id / request display id) by
   * ChatPanel/account-messages via orderLabelById/requestLabelById
   * below — kept as raw ids here since ChatMessage itself has no
   * reason to know how to resolve either. */
  orderId: string | null
  requestId: string | null
}

// Re-exported so existing imports from '@/contexts/ChatContext' (the
// admin chat page's `deriveHandle`, this file's own use of both below)
// keep working unchanged — see lib/chat/waLink.ts's own comment for why
// these moved out of this 'use client' file in the first place.
export { buildWhatsAppLink, deriveHandle }

function rowToMessage(row: ChatMessageRow): ChatMessage {
  const { quoted, text } = parseReplyBody(row.text ?? '')
  return {
    id: row.id,
    sender: row.sender as ChatSender,
    text,
    createdAt: new Date(row.created_at).getTime(),
    createdAtIso: row.created_at,
    attachment: row.attachment_url ? { url: row.attachment_url, kind: inferAttachmentKind(row.attachment_url) } : null,
    replyTo: quoted ? { id: '', sender: row.sender === 'customer' ? 'ops' : 'customer', text: quoted } : null,
    orderId: row.order_id,
    requestId: row.request_id,
  }
}

// Purely a per-device "have I seen the latest ops reply" marker, NOT the
// conversation itself — that's entirely server-side now. Losing this key
// just means one stale unread badge on a new device, not lost messages.
function lastReadKey(threadId: string) {
  return `Wishdrop:chat:lastReadAt:${threadId}`
}

function readLastReadAt(threadId: string): number {
  if (typeof window === 'undefined') return 0
  try {
    return Number(localStorage.getItem(lastReadKey(threadId))) || 0
  } catch {
    return 0
  }
}

function writeLastReadAt(threadId: string, ts: number) {
  try {
    localStorage.setItem(lastReadKey(threadId), String(ts))
  } catch {
    // non-fatal
  }
}



type SendOptions = {
  replyTo?: ReplyPreview | null
  files?: File[]
}

/** What a message gets tagged with. A specific order (dbId = the real
 * `orders.id` uuid — see Ordercontexts.tsx's own comment on why `Order.id`
 * itself isn't that value), or 'general' meaning the customer explicitly
 * isn't attaching one. */
export type OrderChatTag = { dbId: string; displayId: string } | 'general'

interface ChatContextValue {
  isOpen: boolean
  openChat: () => void
  closeChat: () => void
  toggleChat: () => void
  messages: ChatMessage[]
  sending: boolean
  sendError: string | null
  sendMessage: (text: string, options?: SendOptions) => Promise<void>
  unreadCount: number
  markRead: () => void
  isLocked: boolean
  handle: string | null
  getWhatsAppLink: (prefillText?: string) => string
  /** True once the initial page of messages has loaded and there's older
   * history beyond it — gates whether the UI shows a "load older
   * messages" affordance at all. */
  hasMoreMessages: boolean
  /** True while a loadOlderMessages() call is in flight — use this to
   * show a spinner at the top of the list, not `sending` (that's for
   * the composer). */
  loadingMoreMessages: boolean
  /** Fetches the next page of older messages and prepends them. No-ops
   * if hasMoreMessages is false or a load is already in flight — safe
   * to wire directly to a "scrolled to top" handler without your own
   * guard. */
  loadOlderMessages: () => Promise<void>

  // ---- Order context tagging ----
  // See ChatOrderContextBar.tsx for the UI this backs, and
  // lib/supabase/chat.ts's sendChatMessage for how `activeOrder`
  // ultimately becomes chat_messages.order_id.

  /** Every order this customer has (live and completed) — for the "change
   * order" picker, which deliberately shows everything, not just live
   * ones. */
  allOrders: Order[]
  /** request_id -> display id ("REQ-10005"), for the per-message tag
   * pill — see the resolution effect's own comment above. */
  requestDisplayById: Map<string, string>
  /** null = not yet decided this session (only possible while
   * orderChoicePending is true — see below); 'general' = explicitly no
   * order attached; an object = a specific order is pinned. */
  activeOrder: OrderChatTag | null
  /** True exactly when the customer has more than one live (open) order
   * and hasn't picked one yet this session — the UI should show the
   * "which order is this about?" prompt (choices below) instead of the
   * normal pill, and sendMessage refuses to send until this resolves
   * (mirrors how you can't miss tagging on the admin side, where the
   * order/request page always knows which record it's on). */
  orderChoicePending: boolean
  /** The live orders to choose from while orderChoicePending is true. */
  pendingOrderChoices: Order[]
  /** Pins a specific order, or pass 'general' to explicitly detach —
   * available any time, not just while orderChoicePending. */
  setActiveOrder: (tag: OrderChatTag) => void
}

const ChatContext = createContext<ChatContextValue | null>(null)

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth()
  const { orders } = useOrders()

  const [isOpen, setIsOpen] = useState(false)
  const [threadId, setThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [lastReadAt, setLastReadAt] = useState(0)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [hasMoreMessages, setHasMoreMessages] = useState(false)
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false)

  // null = undecided (fresh this session — only reachable state while
  // there's more than one live order, see the effect below).
  const [activeOrder, setActiveOrder] = useState<OrderChatTag | null>(null)

  const supabaseRef = useRef(createClient())

  // The customer's UNIQUE handle lives on their profile (assigned by the
  // database — see data/Wishdrop-unique-chat-handles.sql). Deriving it
  // from the first name gave every Kavindi the same "@kavindi".
  const [profileHandle, setProfileHandle] = useState<string | null>(null)
  useEffect(() => {
    setProfileHandle(null)
    if (!user?.id) return
    let cancelled = false
    supabaseRef.current
      .from('profiles')
      .select('chat_handle')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setProfileHandle(formatHandle(data?.chat_handle))
      })
    return () => {
      cancelled = true
    }
  }, [user?.id])
  const handle = user ? profileHandle ?? formatHandle(user.chatHandle) ?? deriveHandle(user.name) : null

  const liveOrders = useMemo(() => orders.filter((o) => o.dbId && isLiveOrder(o)), [orders])

  // Default/prompt logic — runs whenever the order list resolves (login,
  // or the customer's orders finish loading) and only while nothing's
  // been decided yet this session:
  //   - exactly one live order -> auto-pin it, no prompt
  //   - zero live orders -> nothing sensible to default to -> general
  //   - more than one live order -> leave undecided; orderChoicePending
  //     (below) surfaces the "which order?" prompt instead of guessing
  useEffect(() => {
    setActiveOrder((prev) => {
      if (prev !== null) return prev // already decided (or already pending) this session
      if (liveOrders.length === 1) {
        const only = liveOrders[0]
        return { dbId: only.dbId!, displayId: only.id }
      }
      if (liveOrders.length === 0) return 'general'
      return null // multiple live orders — stays undecided, prompts below
    })
  }, [liveOrders])

  // A fresh login (different user) should re-run the default/prompt
  // logic against THEIR orders, not inherit whatever the previous
  // session on this device had pinned or explicitly set to general.
  useEffect(() => {
    setActiveOrder(null)
  }, [user?.id])

  const orderChoicePending = activeOrder === null && liveOrders.length > 1

  // Resolves a message's request_id (a uuid) to its human display id
  // ("REQ-10005") for the per-message tag pill — mirrors what
  // orderDisplayById does on the admin side (/admin/chat), just here
  // instead of there. There's no customer-facing useRequests() hook to
  // piggyback on the way order tags reuse allOrders below, so this
  // resolves lazily off whatever request ids actually show up in the
  // loaded messages, same "only fetch what's missing" pattern the admin
  // inbox uses. RLS-wise this relies on the customer's own "select my
  // own requests" policy — the same one that already lets them see
  // their own request rows anywhere else in the account area.
  const [requestDisplayById, setRequestDisplayById] = useState<Map<string, string>>(new Map())
  useEffect(() => {
    const missing = Array.from(
      new Set(messages.map((m) => m.requestId).filter((id): id is string => id != null && !requestDisplayById.has(id))),
    )
    if (missing.length === 0) return
    supabaseRef.current
      .from('requests')
      .select('id, display_id')
      .in('id', missing)
      .then(({ data }) => {
        if (!data || data.length === 0) return
        setRequestDisplayById((prev) => {
          const next = new Map(prev)
          for (const r of data) next.set(r.id, r.display_id)
          return next
        })
      })
  }, [messages, requestDisplayById])

  // Resolve (or create) this customer's general support thread and load
  // its history once we know who's logged in.
  //
  // Keyed on `user?.id` (a primitive), not `user` (an object). If
  // useAuth()'s `user` isn't a stable reference across renders, keying
  // on the object itself re-fires this effect on every render — each
  // run re-hits resolveGeneralThreadId, which is what was spamming the
  // "multiple general threads" warning repeatedly for the same user.
  // Keying on the id avoids that regardless of upstream memoization.
  useEffect(() => {
    if (!user) {
      setThreadId(null)
      setMessages([])
      setHasMoreMessages(false)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const id = await getMostRecentOrGeneralThread(supabaseRef.current, user.id)
        if (cancelled) return
        setThreadId(id)
        setLastReadAt(readLastReadAt(id))
        // Only the most recent page loads up front — see
        // fetchRecentThreadMessages's own doc comment for why an
        // unbounded fetch here was a real bug once a thread grew past a
        // few hundred messages, not just a performance nicety.
        const { messages: rows, hasMore } = await fetchRecentThreadMessages(supabaseRef.current, id)
        if (!cancelled) {
          setMessages(rows.map(rowToMessage))
          setHasMoreMessages(hasMore)
        }
      } catch (err) {
        console.error('[chat] failed to load thread', err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const loadOlderMessages = useCallback(async () => {
    if (!threadId || !hasMoreMessages || loadingMoreMessages) return
    const oldest = messages[0]
    if (!oldest) return
    setLoadingMoreMessages(true)
    try {
      const { messages: rows, hasMore } = await fetchOlderThreadMessages(supabaseRef.current, threadId, oldest.createdAtIso)
      setMessages((prev) => [...rows.map(rowToMessage), ...prev])
      setHasMoreMessages(hasMore)
    } catch (err) {
      console.error('[chat] failed to load older messages', err)
    } finally {
      setLoadingMoreMessages(false)
    }
  }, [threadId, hasMoreMessages, loadingMoreMessages, messages])

  // Realtime: append anything new (from either side) that arrives while
  // this thread is open. Dedupes by id both here AND on sendMessage's
  // own optimistic appends below — this side can't assume it's always
  // the one arriving second (see sendMessage's comment for why), so
  // both sides guard against the other having already added the row.
  useEffect(() => {
    if (!threadId) return
    const unsubscribe = subscribeToThreadMessages(supabaseRef.current, threadId, (row) => {
      setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, rowToMessage(row)]))
    })
    return unsubscribe
  }, [threadId])

  const sendMessage = useCallback(
    async (text: string, options?: SendOptions) => {
      const trimmed = text.trim()
      const files = options?.files ?? []
      if (!trimmed && files.length === 0) return
      if (!threadId || !user) return
      if (orderChoicePending) {
        setSendError('Which order is this about? Pick one (or General) above before sending.')
        return
      }

      setSending(true)
      setSendError(null)
      // Hoisted above the try block on purpose — a `const` declared
      // inside try{} isn't visible inside its own catch{}, and this is
      // needed there too for the debug log on failure.
      const orderId = activeOrder && activeOrder !== 'general' ? activeOrder.dbId : undefined
      try {
        const senderName = user.name
        const firstText = options?.replyTo ? buildReplyBody(options.replyTo.text, trimmed) : trimmed

        if (files.length === 0) {
          const row = await sendChatMessage(supabaseRef.current, {
            threadId,
            sender: 'customer',
            senderName,
            text: firstText,
            ...(orderId ? { orderId } : {}),
          })
          // FIX: was an unconditional append — the realtime subscription
          // above already dedupes against "our own optimistic inserts"
          // per its comment, but that assumes this append always lands
          // FIRST. It doesn't: the realtime event for this exact insert
          // can (and, empirically, sometimes does — reliably right after
          // an attachment upload adds extra latency to the await below)
          // reach the client and run its own setMessages before this
          // line's await even resolves. When that happens, the realtime
          // handler adds the row first (correctly, nothing to dedupe
          // against yet), and this unconditional append then adds the
          // SAME row a second time — two array entries with the same
          // `id`, which is exactly the "two children with the same key"
          // warning. Same guard as the realtime handler now applies here
          // too, so whichever of the two effects runs second is always
          // the one that's a no-op, regardless of ordering.
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, rowToMessage(row)]))
        } else {
          for (let i = 0; i < files.length; i++) {
            const url = await uploadChatAttachment(supabaseRef.current, threadId, files[i])
            const row = await sendChatMessage(supabaseRef.current, {
              threadId,
              sender: 'customer',
              senderName,
              text: i === 0 ? firstText : '',
              attachmentUrl: url,
              ...(orderId ? { orderId } : {}),
            })
            // Same race, same fix — see the single-message branch above.
            setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, rowToMessage(row)]))
          }
        }
      } catch (err) {
        // DEBUG: the UI-facing setSendError below only ever shows
        // err.message (or a generic fallback if err isn't even a real
        // Error) — never enough on its own to tell a missing-column
        // error (see this session's SQL migrations) apart from an RLS
        // rejection, a network failure, or anything else. This is the
        // one place a customer (or whoever's looking at their browser
        // console) can see the actual raw error Supabase returned.
        console.error('[ChatContext] sendMessage failed', { threadId, orderId, err })
        setSendError(err instanceof Error ? err.message : 'Failed to send. Please try again.')
      } finally {
        setSending(false)
      }
    },
    [threadId, user, orderChoicePending, activeOrder],
  )

  const markRead = useCallback(() => {
    if (!threadId) return
    const now = Date.now()
    setLastReadAt(now)
    writeLastReadAt(threadId, now)
    markThreadRead(supabaseRef.current, threadId).catch(() => {
      // Non-fatal — worst case the admin badge stays lit a bit longer.
    })
  }, [threadId])

  const unreadCount = useMemo(
    () => messages.filter((m) => m.sender === 'ops' && m.createdAt > lastReadAt).length,
    [messages, lastReadAt],
  )

  const getWhatsAppLink = useCallback((prefillText?: string) => buildWhatsAppLink(handle, prefillText), [handle])

  const value: ChatContextValue = {
    isOpen,
    openChat: () => setIsOpen(true),
    closeChat: () => setIsOpen(false),
    toggleChat: () => setIsOpen((v) => !v),
    messages,
    sending,
    sendError,
    sendMessage,
    unreadCount,
    markRead,
    isLocked: !isAuthenticated,
    handle,
    getWhatsAppLink,
    hasMoreMessages,
    loadingMoreMessages,
    loadOlderMessages,
    allOrders: orders,
    requestDisplayById,
    activeOrder,
    orderChoicePending,
    pendingOrderChoices: liveOrders,
    setActiveOrder,
  }

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useChat() {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChat must be used within a ChatProvider')
  return ctx
}