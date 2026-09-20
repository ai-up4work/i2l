// app/admin/(common)/chat/page.tsx
'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCheck, ChevronDown, ChevronUp, MessageSquare, Paperclip, RefreshCw, Reply, Search, Send, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  type ChatMessageRow,
  buildReplyBody,
  fetchRecentThreadMessages,
  fetchOlderThreadMessages,
  fetchOrderMessages,
  inferAttachmentKind,
  markThreadRead,
  parseReplyBody,
  removeMessageAttachment,
  sendChatMessage,
  subscribeToThreadMessages,
  uploadChatAttachment,
} from '@/lib/supabase/chat'
import { deriveHandle } from '@/contexts/ChatContext'
import AttachmentMedia from '@/components/chat/AttachmentMedia'

type ThreadRow = {
  id: string
  user_id: string
  request_id: string | null
  order_id: string | null
  /** Rollup of the most recent TAGGED message in this thread — see
   * wishdrop-chat-threads-context-rollup.sql. Unlike request_id/order_id
   * above (set only at thread-creation time, and effectively always
   * null since threads are reused per-customer rather than created per
   * request/order), these stay current as the conversation goes on. */
  last_request_id: string | null
  last_order_id: string | null
  last_activity: string
  unread: boolean
  profiles: { full_name: string; email: string; chat_handle: string | null; avatar_url: string | null } | null
}

type ThreadListItem = ThreadRow & {
  lastMessage: ChatMessageRow | null
}

type ProfileLookupRow = {
  id: string
  full_name: string
  email: string
  chat_handle: string | null
  avatar_url: string | null
}

const AVATAR_COLORS = ['bg-teal-deep', 'bg-indigo', 'bg-gold-deep', 'bg-teal', 'bg-indigo-deep', 'bg-ink/60']
const PREVIEW_MESSAGE_LIMIT = 500 // recent messages fetched across all threads to derive previews
const THREAD_QUERY_PARAM = 'thread'

function initialsFor(name: string) {
  const cleaned = name.replace(/^@/, '')
  const parts = cleaned.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : ''
  return (first + last).toUpperCase()
}

function displayHandle(row: { full_name: string; email: string; chat_handle: string | null } | null | undefined) {
  if (!row) return ''
  const raw = row.chat_handle?.trim() || deriveHandle(row.full_name || row.email || 'Customer')
  return raw.startsWith('@') ? raw : `@${raw}`
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDateLabel(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (sameDay(d, today)) return 'Today'
  if (sameDay(d, yesterday)) return 'Yesterday'
  return d.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function groupByDate(messages: ChatMessageRow[]) {
  const groups: { label: string; messages: ChatMessageRow[] }[] = []
  for (const m of messages) {
    const label = formatDateLabel(m.created_at)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.messages.push(m)
    else groups.push({ label, messages: [m] })
  }
  return groups
}

// threadLabel (Request thread / Order thread, derived from
// chat_threads.request_id/order_id) is gone — those columns are only
// ever set at thread-CREATION time, and since a customer's thread is
// reused for their whole lifetime rather than created per request/
// order, they're effectively always null now. The order pill rendered
// in the thread list below reads last_order_id (the live rollup)
// instead — see wishdrop-chat-threads-context-rollup.sql.

function Avatar({
  name,
  avatarUrl,
  colorClass,
  sizeClass = 'h-10 w-10',
  textClass = 'text-sm',
}: {
  name: string
  avatarUrl?: string | null
  colorClass: string
  sizeClass?: string
  textClass?: string
}) {
  const [broken, setBroken] = useState(false)
  const showImage = Boolean(avatarUrl) && !broken

  if (showImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl ?? undefined}
        alt={name}
        onError={() => setBroken(true)}
        className={`flex-none rounded-full object-cover ${sizeClass}`}
      />
    )
  }

  return (
    <span
      className={`grid flex-none place-items-center rounded-full font-semibold text-white ${colorClass} ${sizeClass} ${textClass}`}
    >
      {initialsFor(name)}
    </span>
  )
}

function AdminChatPageInner() {
  const supabaseRef = useRef(createClient())
  const router = useRouter()
  const searchParams = useSearchParams()

  const [staffName, setStaffName] = useState('Support')

  const [threads, setThreads] = useState<ThreadListItem[]>([])
  const [threadsLoading, setThreadsLoading] = useState(true)
  // Maps an order's real uuid (chat_threads.last_order_id) to its
  // human-readable display_id ("WD-1044") — chat_threads only ever
  // stores the uuid FK, never the display string, so this is what the
  // thread-list pill and the order search filter both read from.
  const [orderDisplayById, setOrderDisplayById] = useState<Map<string, string>>(new Map())
  // Same idea, for requests — needed for the per-message request badge
  // (chat_messages.request_id) the same way orderDisplayById backs the
  // per-message order badge. requests.display_id is its own human id
  // (e.g. "REQ-10005"), same pattern as orders.display_id.
  const [requestDisplayById, setRequestDisplayById] = useState<Map<string, string>>(new Map())
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get(THREAD_QUERY_PARAM))
  const [messages, setMessages] = useState<ChatMessageRow[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)

  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'all' | 'unread' | 'order'>('all')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [listCollapsed, setListCollapsed] = useState(false)

  const [draft, setDraft] = useState('')
  const [replyingTo, setReplyingTo] = useState<{ id: string; sender: string; text: string } | null>(null)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [fileError, setFileError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [hasMoreMessages, setHasMoreMessages] = useState(false)
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isLoadingOlderRef = useRef(false)
  const prevScrollHeightRef = useRef(0)

  useEffect(() => {
    ;(async () => {
      const supabase = supabaseRef.current
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      const { data: staff } = await supabase.from('staff_accounts').select('name').eq('user_id', user.id).maybeSingle()
      setStaffName(staff?.name ?? user.email ?? 'Support')
    })()
  }, [])

  const loadThreads = useCallback(async () => {
    const supabase = supabaseRef.current
    setThreadsLoading(true)
    const [{ data: threadRows, error: threadsError }, { data: recentMessages, error: messagesError }] =
      await Promise.all([
        supabase
          .from('chat_threads')
          .select('id, user_id, request_id, order_id, last_request_id, last_order_id, last_activity, unread')
          .order('last_activity', { ascending: false }),
        supabase
          .from('chat_messages')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(PREVIEW_MESSAGE_LIMIT),
      ])

    if (threadsError) {
      console.error('[admin chat] failed to load threads', threadsError)
      setThreadsLoading(false)
      return
    }

    const userIds = Array.from(
      new Set(((threadRows ?? []) as Array<Pick<ThreadRow, 'user_id'>>).map((t) => t.user_id)),
    )

    let profileRows: ProfileLookupRow[] = []
    let profilesError: unknown = null

    if (userIds.length > 0) {
      const res = await supabase
        .from('profiles')
        .select('id, full_name, email, chat_handle, avatar_url')
        .in('id', userIds)
      profileRows = res.data ?? []
      profilesError = res.error
    }

    if (profilesError) console.error('[admin chat] failed to load customer profiles', profilesError)
    const profileById = new Map(
      profileRows.map((p) => [
        p.id,
        { full_name: p.full_name, email: p.email, chat_handle: p.chat_handle, avatar_url: p.avatar_url },
      ]),
    )

    const latestByThread = new Map<string, ChatMessageRow>()
    for (const m of (recentMessages ?? []) as ChatMessageRow[]) {
      if (!latestByThread.has(m.thread_id)) latestByThread.set(m.thread_id, m)
    }
    if (messagesError) console.error('[admin chat] failed to load message previews', messagesError)

    // Resolve last_order_id (a uuid) -> its human display_id ("WD-1044")
    // for the thread-list pill and the search filter. One small IN
    // query, not a join on every thread row.
    const orderIds = Array.from(
      new Set(
        ((threadRows ?? []) as Array<Pick<ThreadRow, 'last_order_id'>>)
          .map((t) => t.last_order_id)
          .filter((id): id is string => Boolean(id)),
      ),
    )
    if (orderIds.length > 0) {
      const { data: orderRows, error: ordersError } = await supabase
        .from('orders')
        .select('id, display_id')
        .in('id', orderIds)
      if (ordersError) {
        console.error('[admin chat] failed to resolve order display ids', ordersError)
      } else {
        setOrderDisplayById(new Map((orderRows ?? []).map((o) => [o.id as string, o.display_id as string])))
      }
    } else {
      setOrderDisplayById(new Map())
    }

    setThreads(
      (threadRows ?? []).map((t) => ({
        ...t,
        profiles: profileById.get(t.user_id) ?? null,
        lastMessage: latestByThread.get(t.id) ?? null,
      })),
    )
    setThreadsLoading(false)
  }, [])

  useEffect(() => {
    loadThreads()
  }, [loadThreads])

  useEffect(() => {
    if (threadsLoading || !selectedId) return
    const stillExists = threads.some((t) => t.id === selectedId)
    if (!stillExists) setSelectedId(null)
  }, [threadsLoading, threads, selectedId])

  const loadThreadMessages = useCallback(async (threadId: string) => {
    setMessagesLoading(true)
    try {
      const { messages: rows, hasMore } = await fetchRecentThreadMessages(supabaseRef.current, threadId)
      setMessages(rows)
      setHasMoreMessages(hasMore)
    } catch (err) {
      console.error('[admin chat] failed to load messages', err)
    } finally {
      setMessagesLoading(false)
    }
  }, [])

  const loadOlderMessages = useCallback(async () => {
    if (!selectedId || !hasMoreMessages || loadingMoreMessages) return
    const oldest = messages[0]
    if (!oldest) return
    setLoadingMoreMessages(true)
    const el = scrollRef.current
    if (el) {
      isLoadingOlderRef.current = true
      prevScrollHeightRef.current = el.scrollHeight
    }
    try {
      const { messages: rows, hasMore } = await fetchOlderThreadMessages(supabaseRef.current, selectedId, oldest.created_at)
      setMessages((prev) => [...rows, ...prev])
      setHasMoreMessages(hasMore)
    } catch (err) {
      console.error('[admin chat] failed to load older messages', err)
    } finally {
      setLoadingMoreMessages(false)
    }
  }, [selectedId, hasMoreMessages, loadingMoreMessages, messages])

  // Resolves order_id/request_id -> their human display ids (WD-1044 /
  // REQ-10005) for whatever's actually in the currently loaded message
  // list — not just the thread-level last_order_id/last_request_id
  // rollup, since an OLDER message in a long-running thread can be
  // tagged to a different order/request than whatever the thread was
  // "last" about. Only fetches ids not already resolved.
  useEffect(() => {
    const missingOrderIds = Array.from(
      new Set(messages.map((m) => m.order_id).filter((id): id is string => id != null && !orderDisplayById.has(id))),
    )
    const missingRequestIds = Array.from(
      new Set(
        messages.map((m) => m.request_id).filter((id): id is string => id != null && !requestDisplayById.has(id)),
      ),
    )
    if (missingOrderIds.length === 0 && missingRequestIds.length === 0) return

    const supabase = supabaseRef.current
    if (missingOrderIds.length > 0) {
      supabase
        .from('orders')
        .select('id, display_id')
        .in('id', missingOrderIds)
        .then(({ data }) => {
          if (!data || data.length === 0) return
          setOrderDisplayById((prev) => {
            const next = new Map(prev)
            for (const o of data) next.set(o.id, o.display_id)
            return next
          })
        })
    }
    if (missingRequestIds.length > 0) {
      supabase
        .from('requests')
        .select('id, display_id')
        .in('id', missingRequestIds)
        .then(({ data }) => {
          if (!data || data.length === 0) return
          setRequestDisplayById((prev) => {
            const next = new Map(prev)
            for (const r of data) next.set(r.id, r.display_id)
            return next
          })
        })
    }
  }, [messages, orderDisplayById, requestDisplayById])

  // Filters the open thread down to messages tagged to ONE order —
  // reuses fetchOrderMessages (already existed for the order detail
  // page's own mini chat panel, just never wired into the main inbox).
  // null = no filter (the normal paginated fetchRecentThreadMessages
  // view). Resets whenever a different thread is opened.
  const [messageOrderFilter, setMessageOrderFilter] = useState<string | null>(null)
  useEffect(() => {
    setMessageOrderFilter(null)
  }, [selectedId])

  // Deliberately NOT derived from `messages` directly — once a filter is
  // applied, `messages` only holds that one order's messages, which
  // would collapse the filter dropdown down to just the option
  // currently selected. This only ever grows (per open thread), fed by
  // every unfiltered load (recent/older), so every order the thread has
  // touched stays selectable regardless of which filter is active.
  const [orderIdsInOpenThread, setOrderIdsInOpenThread] = useState<string[]>([])
  useEffect(() => {
    setOrderIdsInOpenThread([])
  }, [selectedId])
  useEffect(() => {
    if (messageOrderFilter) return // this load was itself filtered — not the full picture
    const found = messages.map((m) => m.order_id).filter((id): id is string => Boolean(id))
    if (found.length === 0) return
    setOrderIdsInOpenThread((prev) => Array.from(new Set([...prev, ...found])))
  }, [messages, messageOrderFilter])

  const applyMessageOrderFilter = useCallback(
    async (orderId: string | null) => {
      if (!selectedId) return
      setMessageOrderFilter(orderId)
      setMessagesLoading(true)
      try {
        if (orderId) {
          const rows = await fetchOrderMessages(supabaseRef.current, selectedId, orderId)
          setMessages(rows)
          setHasMoreMessages(false) // fetchOrderMessages returns every matching message, not a page
        } else {
          await loadThreadMessages(selectedId)
        }
      } catch (err) {
        console.error('[admin chat] failed to filter by order', err)
      } finally {
        setMessagesLoading(false)
      }
    },
    [selectedId, loadThreadMessages],
  )

  useEffect(() => {
    if (!selectedId) return
    loadThreadMessages(selectedId)
    markThreadRead(supabaseRef.current, selectedId).catch(() => {})
    setThreads((prev) => prev.map((t) => (t.id === selectedId ? { ...t, unread: false } : t)))
  }, [selectedId, loadThreadMessages])



  useEffect(() => {
    if (!selectedId) return
    const unsubscribe = subscribeToThreadMessages(supabaseRef.current, selectedId, (row) => {
      setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]))
    })
    return unsubscribe
  }, [selectedId])

  useEffect(() => {
    const supabase = supabaseRef.current
    const topic = `chat_messages:admin-inbox:${Math.random().toString(36).slice(2)}`
    const channel = supabase
      .channel(topic)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => {
          const row = payload.new as ChatMessageRow
          // Keep the rollup live too — mirrors what sendChatMessage just
          // wrote to chat_threads.last_order_id/last_request_id server-
          // side, so the pill/filter don't go stale until someone hits
          // refresh. Only overwrite when THIS message actually carries a
          // tag, same "don't erase on an untagged follow-up" rule
          // sendChatMessage itself follows.
          if (row.order_id) {
            supabase
              .from('orders')
              .select('id, display_id')
              .eq('id', row.order_id)
              .maybeSingle()
              .then(({ data }) => {
                if (!data) return
                setOrderDisplayById((prev) => (prev.has(data.id) ? prev : new Map(prev).set(data.id, data.display_id)))
              })
          }
          setThreads((prev) =>
            prev
              .map((t) =>
                t.id === row.thread_id
                  ? {
                      ...t,
                      lastMessage: row,
                      last_activity: row.created_at,
                      last_order_id: row.order_id ?? t.last_order_id,
                      last_request_id: row.request_id ?? t.last_request_id,
                      unread: row.sender === 'customer' && t.id !== selectedId ? true : t.unread,
                    }
                  : t,
              )
              .sort((a, b) => +new Date(b.last_activity) - +new Date(a.last_activity)),
          )
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (isLoadingOlderRef.current) {
      el.scrollTop = el.scrollHeight - prevScrollHeightRef.current
      isLoadingOlderRef.current = false
      return
    }
    el.scrollTo({ top: el.scrollHeight })
  }, [messages, selectedId])

  const selectedThread = threads.find((t) => t.id === selectedId) ?? null

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return threads
      .filter((t) => {
        if (!q) return true
        const name = t.profiles?.full_name ?? t.profiles?.email ?? ''
        const orderDisplayId = t.last_order_id ? orderDisplayById.get(t.last_order_id) ?? '' : ''
        return name.toLowerCase().includes(q) || orderDisplayId.toLowerCase().includes(q)
      })
      .filter((t) => (tab === 'unread' ? t.unread : tab === 'order' ? Boolean(t.last_order_id) : true))
  }, [threads, search, tab, orderDisplayById])

  const totalUnread = useMemo(() => threads.filter((t) => t.unread).length, [threads])

  const handleSelect = (id: string) => {
    setSelectedId(id)
    setReplyingTo(null)
    setPendingFiles([])
    setFileError(null)

    const params = new URLSearchParams(searchParams.toString())
    params.set(THREAD_QUERY_PARAM, id)
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await loadThreads()
    if (selectedId) await loadThreadMessages(selectedId)
    setIsRefreshing(false)
  }

  const handleFilesPicked = (files: FileList | null) => {
    if (!files || files.length === 0) return
    setFileError(null)
    const picked = Array.from(files)
    const tooBig = picked.find((f) => f.size > 8 * 1024 * 1024)
    if (tooBig) {
      setFileError(`${tooBig.name} is larger than 8MB`)
      return
    }
    setPendingFiles((prev) => [...prev, ...picked])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSend = async () => {
    const trimmed = draft.trim()
    if (!trimmed && pendingFiles.length === 0) return
    if (!selectedId) return

    setSending(true)
    setFileError(null)
    try {
      const supabase = supabaseRef.current
      const firstText = replyingTo ? buildReplyBody(replyingTo.text, trimmed) : trimmed

      if (pendingFiles.length === 0) {
        const row = await sendChatMessage(supabase, {
          threadId: selectedId,
          sender: 'ops',
          senderName: staffName,
          text: firstText,
        })
        // FIX: same race as the customer-side ChatContext.tsx had —
        // this unconditional append could land AFTER the realtime
        // subscription (below, line ~293) already added this exact row,
        // producing two array entries with the same id and the
        // "two children with the same key" React warning. Guard it the
        // same way the realtime handler already does.
        setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]))
      } else {
        for (let i = 0; i < pendingFiles.length; i++) {
          const url = await uploadChatAttachment(supabase, selectedId, pendingFiles[i])
          const row = await sendChatMessage(supabase, {
            threadId: selectedId,
            sender: 'ops',
            senderName: staffName,
            text: i === 0 ? firstText : '',
            attachmentUrl: url,
          })
          // Same race, same fix — see the single-message branch above.
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]))
        }
      }
      setDraft('')
      setReplyingTo(null)
      setPendingFiles([])
      setThreads((prev) =>
        prev
          .map((t) => (t.id === selectedId ? { ...t, last_activity: new Date().toISOString() } : t))
          .sort((a, b) => +new Date(b.last_activity) - +new Date(a.last_activity)),
      )
    } catch (err) {
      console.error('[admin chat] send failed', err)
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message: unknown }).message)
            : 'Failed to send. Please try again.'
      setFileError(message)
    } finally {
      setSending(false)
    }
  }

  const handleDeleteAttachment = async (messageId: string) => {
    try {
      await removeMessageAttachment(supabaseRef.current, messageId)
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, attachment_url: null } : m)))
    } catch (err) {
      console.error('[admin chat] failed to remove attachment', err)
    }
  }

  const dateGroups = useMemo(() => groupByDate(messages), [messages])

  return (
    <div className="flex h-full w-full flex-col overflow-hidden text-ink">
      <div className="flex-none bg-parchment">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-ink/10">
          <div className="flex items-center gap-2">
            <p className="text-lg font-medium text-ink">Chats</p>
            {totalUnread > 0 && (
              <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-teal-deep px-1.5 text-[11px] font-bold text-card">
                {totalUnread > 9 ? '9+' : totalUnread}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg bg-parchment/70 px-3 py-1.5">
              <Search size={14} className="text-ink/45" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search chats or order ID"
                className="w-36 bg-transparent text-sm text-ink placeholder:text-ink/50 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => setTab('all')}
              className={`rounded-full px-3 py-1 text-[13px] font-medium transition-colors ${
                tab === 'all' ? 'bg-teal-deep/15 text-teal-deep' : 'text-ink/45 hover:bg-ink/5'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setTab('unread')}
              className={`rounded-full px-3 py-1 text-[13px] font-medium transition-colors ${
                tab === 'unread' ? 'bg-teal-deep/15 text-teal-deep' : 'text-ink/45 hover:bg-ink/5'
              }`}
            >
              Unread {totalUnread > 0 ? totalUnread : ''}
            </button>
            <button
              type="button"
              onClick={() => setTab('order')}
              title="Threads whose most recent tagged message was about an order"
              className={`rounded-full px-3 py-1 text-[13px] font-medium transition-colors ${
                tab === 'order' ? 'bg-teal-deep/15 text-teal-deep' : 'text-ink/45 hover:bg-ink/5'
              }`}
            >
              Has order
            </button>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              aria-label="Refresh conversations"
              title="Refresh conversations"
              className="rounded-full p-1.5 text-ink/45 transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-50"
            >
              <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              onClick={() => setListCollapsed((prev) => !prev)}
              aria-label={listCollapsed ? 'Expand conversation list' : 'Collapse conversation list'}
              title={listCollapsed ? 'Expand conversation list' : 'Collapse conversation list'}
              className="rounded-full p-1.5 text-ink/45 transition-colors hover:bg-ink/5 hover:text-ink"
            >
              {listCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </button>
          </div>
        </div>

        {!listCollapsed && (
        <div className="scrollbar-none flex gap-2 overflow-x-auto px-4 pb-2 border-b border-ink/10 mt-2">
          {threadsLoading ? (
            <p className="px-1 py-2 text-sm text-ink/40">Loading conversations…</p>
          ) : rows.length === 0 ? (
            <p className="px-1 py-2 text-sm text-ink/40">No conversations yet.</p>
          ) : (
            rows.map((t, i) => {
              const isSelected = t.id === selectedId
              // Mirrors displayHandle's own fallback order (chat_handle
              // before giving up) rather than jumping straight to the
              // generic 'Customer' the moment full_name/email are both
              // empty — that gap is exactly why two customers with no
              // name on file but a real chat_handle were both showing
              // as identical, indistinguishable "Customer" cards.
              const name =
                t.profiles?.full_name ||
                t.profiles?.email ||
                (t.profiles?.chat_handle ? `@${t.profiles.chat_handle.replace(/^@/, '')}` : 'Customer')
              const preview = t.lastMessage ? parseReplyBody(t.lastMessage.text ?? '').text || (t.lastMessage.attachment_url ? '📷 Attachment' : '') : ''
              const orderDisplayId = t.last_order_id ? orderDisplayById.get(t.last_order_id) : null
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleSelect(t.id)}
                  className={`flex w-60 flex-none items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    isSelected ? 'border-teal-deep bg-teal/10' : 'border-ink/10 bg-parchment/50 hover:bg-parchment/70'
                  }`}
                >
                  <Avatar
                    name={name}
                    avatarUrl={t.profiles?.avatar_url}
                    colorClass={AVATAR_COLORS[i % AVATAR_COLORS.length]}
                    sizeClass="h-10 w-10"
                    textClass="text-sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <p className="truncate text-[13px] font-medium text-ink">{name}</p>
                        {/* Skipped when `name` already IS the handle (see
                            its own fallback above) — otherwise this would
                            render the identical @handle twice in a row. */}
                        {displayHandle(t.profiles) !== name && (
                          <span className="flex-none rounded-full bg-ink/5 px-1.5 py-[1px] text-[10px] font-medium text-ink/45">
                            {displayHandle(t.profiles)}
                          </span>
                        )}
                        {orderDisplayId && (
                          <span
                            title="Most recent tagged message in this thread was about this order"
                            className="flex-none rounded-full bg-teal/12 px-1.5 py-[1px] text-[10px] font-semibold text-teal-deep"
                          >
                            {orderDisplayId}
                          </span>
                        )}
                      </div>
                      {t.lastMessage && (
                        <span className={`flex-none text-[10px] ${t.unread ? 'text-teal-deep' : 'text-ink/40'}`}>
                          {formatTime(t.lastMessage.created_at)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-1.5">
                      <p className="truncate text-[11.5px] text-ink/50">
                        {t.lastMessage?.sender === 'ops' ? 'You: ' : ''}
                        {preview}
                      </p>
                      {t.unread && <span className="h-2 w-2 flex-none rounded-full bg-teal-deep" />}
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
        )}
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col bg-parchment">
        {selectedThread ? (
          <>
            {orderIdsInOpenThread.length > 0 && (
              <div className="flex flex-none flex-wrap items-center gap-1.5 border-b border-ink/10 bg-parchment px-4 py-2">
                <span className="font-body text-[11px] font-medium text-ink/40">Filter by order:</span>
                <button
                  type="button"
                  onClick={() => applyMessageOrderFilter(null)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    messageOrderFilter === null ? 'bg-teal-deep/15 text-teal-deep' : 'text-ink/50 hover:bg-ink/5'
                  }`}
                >
                  All messages
                </button>
                {orderIdsInOpenThread.map((orderId) => (
                  <button
                    key={orderId}
                    type="button"
                    onClick={() => applyMessageOrderFilter(orderId)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                      messageOrderFilter === orderId ? 'bg-teal-deep/15 text-teal-deep' : 'text-ink/50 hover:bg-ink/5'
                    }`}
                  >
                    {orderDisplayById.get(orderId) ?? orderId}
                  </button>
                ))}
              </div>
            )}
            <div
              ref={scrollRef}
              onScroll={(e) => {
                if (!hasMoreMessages || loadingMoreMessages) return
                if (e.currentTarget.scrollTop < 40) loadOlderMessages()
              }}
              className="scrollbar-none min-h-0 flex-1 space-y-1 overflow-y-auto px-4 py-4"
              style={{
                backgroundImage: 'radial-gradient(rgba(32,36,43,0.045) 1px, transparent 1px)',
                backgroundSize: '18px 18px',
              }}
            >
              {messagesLoading ? (
                <div className="flex h-full items-center justify-center">
                  <p className="text-sm text-ink/40">Loading messages…</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                  <MessageSquare size={28} className="text-ink/15" strokeWidth={1.4} />
                  <p className="text-sm text-ink/50">No messages yet.</p>
                </div>
              ) : (
                <>
                  {hasMoreMessages && (
                    <div className="flex justify-center pb-2">
                      {loadingMoreMessages ? (
                        <span className="text-xs text-ink/35">Loading older messages…</span>
                      ) : (
                        <button
                          type="button"
                          onClick={loadOlderMessages}
                          className="text-xs font-semibold text-teal-deep hover:underline"
                        >
                          Load older messages
                        </button>
                      )}
                    </div>
                  )}
                  {dateGroups.map((group) => (
                    <div key={group.label}>
                      <div className="my-3 flex justify-center">
                        <span className="rounded-lg bg-card px-3 py-1 text-xs text-ink/50 shadow">{group.label}</span>
                      </div>
                      {group.messages.map((m) => {
                      const isOps = m.sender === 'ops'
                      const { quoted, text } = parseReplyBody(m.text ?? '')
                      const attachmentKind = m.attachment_url ? inferAttachmentKind(m.attachment_url) : null
                      const orderTag = m.order_id ? orderDisplayById.get(m.order_id) : null
                      const requestTag = m.request_id ? requestDisplayById.get(m.request_id) : null
                      return (
                        <div key={m.id} className={`group my-0.5 flex items-center gap-1.5 ${isOps ? 'justify-end' : 'justify-start'}`}>
                          {isOps && (
                            <button
                              type="button"
                              onClick={() => setReplyingTo({ id: m.id, sender: m.sender, text })}
                              aria-label="Reply"
                              className="flex-none rounded-full p-1.5 text-ink/50 opacity-0 transition-opacity hover:bg-ink/5 group-hover:opacity-100"
                            >
                              <Reply size={14} />
                            </button>
                          )}

                          <div className={`flex max-w-[65%] flex-col ${isOps ? 'items-end' : 'items-start'}`}>
                          <span className="mb-0.5 flex items-center gap-1 px-1 text-[11px] font-medium text-ink/45">
                            {isOps ? (m.sender_name || 'Staff') : displayHandle(selectedThread.profiles)}
                            {orderTag && (
                              <span
                                title="This message was tagged to this order"
                                className="rounded-full bg-teal/12 px-1.5 py-[1px] text-[9.5px] font-semibold text-teal-deep"
                              >
                                {orderTag}
                              </span>
                            )}
                            {requestTag && (
                              <span
                                title="This message was tagged to this request"
                                className="rounded-full bg-gold/15 px-1.5 py-[1px] text-[9.5px] font-semibold text-gold-deep"
                              >
                                {requestTag}
                              </span>
                            )}
                          </span>
                          <div
                            className={`w-full rounded-lg px-2.5 py-[6px] text-[14.2px] shadow ${
                              isOps ? 'bg-teal-deep text-white' : 'bg-card text-ink'
                            }`}
                          >
                            {quoted && (
                              <div className="mb-1 rounded border-l-[3px] border-teal-deep bg-ink/5 px-2 py-1 text-[12.5px] text-ink/60">
                                {quoted}
                              </div>
                            )}

                            {attachmentKind && m.attachment_url && (
                              <div className="group/attachment relative mb-1">
                                <AttachmentMedia
                                  url={m.attachment_url}
                                  kind={attachmentKind}
                                  className="max-h-64 w-full rounded-md object-cover"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleDeleteAttachment(m.id)}
                                  aria-label="Delete attachment"
                                  title="Delete attachment"
                                  className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white opacity-0 transition-opacity hover:bg-black/80 group-hover/attachment:opacity-100"
                                >
                                  <X size={13} />
                                </button>
                              </div>
                            )}

                            <div className="flex items-end gap-1.5">
                              {text && <p className="whitespace-pre-wrap break-words">{text}</p>}
                              <span className={`ml-auto flex flex-none items-center gap-0.5 pb-[1px] text-[11px] ${isOps ? 'text-white/75' : 'text-ink/50'}`}>
                                {formatTime(m.created_at)}
                                {isOps && <CheckCheck size={14} className="text-gold" />}
                              </span>
                            </div>
                          </div>
                          </div>

                          {!isOps && (
                            <button
                              type="button"
                              onClick={() => setReplyingTo({ id: m.id, sender: m.sender, text })}
                              aria-label="Reply"
                              className="flex-none rounded-full p-1.5 text-ink/50 opacity-0 transition-opacity hover:bg-ink/5 group-hover:opacity-100"
                            >
                              <Reply size={14} />
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
                </>
              )}
            </div>

            {pendingFiles.length > 0 && (
              <div className="flex flex-none gap-2 overflow-x-auto bg-parchment px-3 pt-3">
                {pendingFiles.map((f, i) => (
                  <div key={`${f.name}-${i}`} className="relative flex-none">
                    <div className="grid h-16 w-16 place-items-center rounded-lg border border-ink/10 bg-parchment text-[10px] text-ink/50">
                      {f.type.startsWith('video/') ? 'Video' : 'Image'}
                    </div>
                    <button
                      type="button"
                      onClick={() => setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))}
                      aria-label="Remove attachment"
                      className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-ink text-white"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {fileError && <p className="flex-none bg-parchment px-3 pt-2 text-xs text-red-600">{fileError}</p>}

            {replyingTo && (
              <div className="flex flex-none items-center gap-2 bg-parchment px-3 pt-3">
                <div className="flex-1 rounded-lg border-l-[3px] border-teal-deep bg-ink/5 px-3 py-1.5">
                  <p className="text-[12.5px] font-medium text-teal-deep">
                    Replying to {replyingTo.sender === 'ops' ? 'yourself' : 'customer'}
                  </p>
                  <p className="truncate text-xs text-ink/55">{replyingTo.text}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyingTo(null)}
                  aria-label="Cancel reply"
                  className="flex-none rounded-full p-1.5 text-ink/50 hover:bg-ink/5"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            <div className="flex flex-none items-center gap-3 bg-parchment px-4 py-2.5">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={(e) => handleFilesPicked(e.target.files)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Attach image or video"
                className="grid h-9 w-9 flex-none place-items-center rounded-full text-ink/50 transition-colors hover:bg-ink/5 hover:text-ink"
              >
                <Paperclip size={20} className="rotate-[-45deg]" />
              </button>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Type a message"
                className="flex-1 rounded-full border border-ink/10 bg-parchment px-4 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-teal/50 focus:outline-none focus:ring-2 focus:ring-teal/15"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || (!draft.trim() && pendingFiles.length === 0)}
                aria-label="Send message"
                className="grid h-9 w-9 flex-none place-items-center rounded-full bg-teal-deep text-white transition-colors hover:bg-teal disabled:bg-ink/10 disabled:text-ink/30"
              >
                <Send size={18} />
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-ink/50">
            {threadsLoading ? 'Loading…' : 'Select a conversation'}
          </div>
        )}
      </div>
    </div>
  )
}

export default function AdminChatPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full items-center justify-center text-ink/50">Loading…</div>
      }
    >
      <AdminChatPageInner />
    </Suspense>
  )
}