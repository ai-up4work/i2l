// app/admin/(common)/chat/page.tsx
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCheck, MessageSquare, Paperclip, RefreshCw, Reply, Search, Send, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  type ChatMessageRow,
  buildReplyBody,
  fetchThreadMessages,
  inferAttachmentKind,
  markThreadRead,
  parseReplyBody,
  removeMessageAttachment,
  sendChatMessage,
  subscribeToThreadMessages,
  uploadChatAttachment,
} from '@/lib/supabase/chat'
import AttachmentMedia from '@/components/chat/AttachmentMedia'

// ---------------------------------------------------------------------------
// Real data, real-time. Replaces the old MOCK_CUSTOMERS + localStorage
// version entirely.
//
// Thread list: `chat_threads` joined to `profiles` for the customer's
// name/email. Includes every thread, not just "general support" ones —
// a customer's per-request thread (created at Channel-3 request time,
// see DashboardContext's confirmRequest) shows up here too, labeled by
// whichever of request_id/order_id is set.
//
// Preview text: there's no "latest message per thread" view/RPC in this
// schema, so this fetches recent messages across ALL threads once and
// derives each thread's preview client-side. Fine at current scale; the
// real upgrade path is a Postgres view or RPC once thread count grows.
//
// Sender identity: looks up staff_accounts by the logged-in user's id
// for a real name, falling back to their email. Not gated by role yet —
// same open caveat as every other /api/admin/** route in this codebase.
//
// Selected thread lives in the URL (?thread=<id>), not just component
// state — a hard refresh, a shared link, or browser back/forward should
// all land back on the same open conversation instead of dropping to
// "Select a conversation". State is still the source of truth for
// rendering; the query param is read once on mount to seed it and
// written on every selection change, one-way sync (URL <- selection),
// not a two-way binding that would fight the router on every keystroke
// elsewhere in the page.
//
// Realtime: two separate subscriptions, not one.
//   1. Per-open-thread (subscribeToThreadMessages, filtered by thread_id)
//      — appends new messages into the currently open conversation.
//   2. Inbox-wide (unfiltered INSERT on chat_messages) — patches the
//      thread strip's preview/last_activity/unread/ordering for EVERY
//      thread, including ones not currently open. Without this, a
//      message landing in a thread you're not looking at would never
//      update its preview or re-sort it to the top until a manual
//      refresh.
// Both require Realtime to be enabled for chat_messages in the Supabase
// dashboard (Database > Replication), and for the staff/admin role's
// SELECT policy on chat_messages to actually permit reading rows across
// threads it doesn't "own" — Realtime enforces RLS same as a normal
// query, so a policy scoped only to `auth.uid() = customer_id` would
// silently deliver nothing to staff even with replication enabled.
//
// Layout: no rounded panel / border wrapper here — the admin shell
// already frames this page, so this component just fills that frame
// edge-to-edge instead of drawing a second outline inside it. Height is
// `h-full` (not a hardcoded `calc(100vh-...)`) so it exactly matches
// `main`'s real flex-computed height inside AdminContentShell, however
// tall the header ends up being — and `-m-6` (negative MARGIN, not
// padding — CSS padding can't go negative, browsers just clamp it to
// zero) cancels out `main`'s own `p-6` on all four sides so this
// bleeds flush to the shell's edges.
//
// Surfaces: the thread strip, thread header, and composer all sit on
// the SAME `bg-parchment` backdrop as the message canvas now — no
// `bg-card` white panels and no `border-ink/10` seams between zones.
// Earlier revisions gave each zone its own white `bg-card` surface for
// visual separation, but in practice that read as a white frame boxing
// in the parchment message area rather than a deliberate section
// break, so it's gone. Individual message BUBBLES still use `bg-card`
// (see the message row rendering below) — that's contrast for
// legibility against the parchment background and against the teal
// `bg-teal-deep` ops bubbles, not a container frame, so it stays.
//
// Scrollbar: `scrollbar-none` on the messages pane hides the native
// scrollbar chrome without removing scroll behavior — `overflow-y-auto`
// still does its job, the track/thumb is just not painted. Same
// utility the horizontal thread strip already used.
//
// FLEXBOX HEIGHT FIX (see comments inline below marked "min-h-0"):
// Without an explicit `min-h-0` on every flex ancestor between the
// scrollable messages div and this page's outer `overflow-hidden`
// wrapper, flex items default to `min-height: auto` — meaning they
// refuse to shrink below their content's natural height. That let the
// messages div grow to fit ALL messages instead of scrolling internally,
// which pushed the composer (input + send button) below the visible
// frame, where the outer `overflow-hidden` silently clipped it off.
// Adding `min-h-0` on the thread-pane flex container (and keeping it on
// the scrollable messages div itself) tells the browser it's allowed to
// constrain their height, so overflow-y-auto actually takes effect and
// the composer stays pinned at the bottom, visible.
// ---------------------------------------------------------------------------

type ThreadRow = {
  id: string
  user_id: string
  request_id: string | null
  order_id: string | null
  last_activity: string
  unread: boolean
  profiles: { full_name: string; email: string } | null
}

type ThreadListItem = ThreadRow & {
  lastMessage: ChatMessageRow | null
}

// Explicit shape for the profiles lookup — keeping this as a named type
// (rather than letting it be inferred inline from the ternary below)
// is what avoids the "Property 'id' does not exist on type 'never'"
// error. When a ternary's two branches return differently-shaped
// objects (a real PostgrestResponse vs. a bare `{ data: [], error: null }`
// literal), TS can fail to unify `data`'s array element type and
// silently degrade it to `never` for everything read from it downstream.
type ProfileLookupRow = { id: string; full_name: string; email: string }

const AVATAR_COLORS = ['bg-teal-deep', 'bg-indigo', 'bg-gold-deep', 'bg-teal', 'bg-indigo-deep', 'bg-ink/60']
const PREVIEW_MESSAGE_LIMIT = 500 // recent messages fetched across all threads to derive previews
const THREAD_QUERY_PARAM = 'thread'

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : ''
  return (first + last).toUpperCase()
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

function threadLabel(t: ThreadRow) {
  if (t.request_id) return 'Request thread'
  if (t.order_id) return 'Order thread'
  return null
}

export default function AdminChatPage() {
  const supabaseRef = useRef(createClient())
  const router = useRouter()
  const searchParams = useSearchParams()

  const [staffName, setStaffName] = useState('Support')

  const [threads, setThreads] = useState<ThreadListItem[]>([])
  const [threadsLoading, setThreadsLoading] = useState(true)
  // Seed from the URL so a hard refresh (or a shared/bookmarked link)
  // reopens the same conversation instead of dropping to the empty
  // state. Guarded against once threads load, in case the id in the
  // URL is stale/deleted — see the effect below.
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get(THREAD_QUERY_PARAM))
  const [messages, setMessages] = useState<ChatMessageRow[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)

  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'all' | 'unread'>('all')
  const [isRefreshing, setIsRefreshing] = useState(false)

  const [draft, setDraft] = useState('')
  const [replyingTo, setReplyingTo] = useState<{ id: string; sender: string; text: string } | null>(null)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [fileError, setFileError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Resolve a real display name for outgoing "ops" messages.
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
          .select('id, user_id, request_id, order_id, last_activity, unread')
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

    // No direct FK between chat_threads and profiles (both separately
    // reference auth.users), so PostgREST can't auto-embed profiles(...)
    // in the query above — fetch them separately and merge by id instead.
    //
    // Explicit `let` + `if` instead of a ternary between the query call
    // and a bare `{ data: [], error: null }` literal — see the
    // ProfileLookupRow comment above for why the ternary form caused
    // downstream `.id`/`.full_name`/`.email` reads to error as "does
    // not exist on type 'never'".
    const userIds = Array.from(
      new Set(((threadRows ?? []) as Array<Pick<ThreadRow, 'user_id'>>).map((t) => t.user_id)),
    )

    let profileRows: ProfileLookupRow[] = []
    let profilesError: unknown = null

    if (userIds.length > 0) {
      const res = await supabase.from('profiles').select('id, full_name, email').in('id', userIds)
      profileRows = res.data ?? []
      profilesError = res.error
    }

    if (profilesError) console.error('[admin chat] failed to load customer profiles', profilesError)
    const profileById = new Map(profileRows.map((p) => [p.id, { full_name: p.full_name, email: p.email }]))

    const latestByThread = new Map<string, ChatMessageRow>()
    for (const m of (recentMessages ?? []) as ChatMessageRow[]) {
      if (!latestByThread.has(m.thread_id)) latestByThread.set(m.thread_id, m)
    }
    if (messagesError) console.error('[admin chat] failed to load message previews', messagesError)

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

  // If the URL pointed at a thread id that no longer exists (deleted,
  // typo'd, stale link), drop back to the empty state instead of
  // showing a header for a thread we have no row for.
  useEffect(() => {
    if (threadsLoading || !selectedId) return
    const stillExists = threads.some((t) => t.id === selectedId)
    if (!stillExists) setSelectedId(null)
  }, [threadsLoading, threads, selectedId])

  const loadThreadMessages = useCallback(async (threadId: string) => {
    setMessagesLoading(true)
    try {
      const rows = await fetchThreadMessages(supabaseRef.current, threadId)
      setMessages(rows)
    } catch (err) {
      console.error('[admin chat] failed to load messages', err)
    } finally {
      setMessagesLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!selectedId) return
    loadThreadMessages(selectedId)
    markThreadRead(supabaseRef.current, selectedId).catch(() => {})
    setThreads((prev) => prev.map((t) => (t.id === selectedId ? { ...t, unread: false } : t)))
  }, [selectedId, loadThreadMessages])

  // Per-open-thread realtime — appends new rows into the conversation
  // that's currently on screen.
  useEffect(() => {
    if (!selectedId) return
    const unsubscribe = subscribeToThreadMessages(supabaseRef.current, selectedId, (row) => {
      setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]))
    })
    return unsubscribe
  }, [selectedId])

  // Inbox-wide realtime — unfiltered, so it fires for every thread, not
  // just the one currently open. Keeps the top strip's preview text,
  // last_activity ordering, and unread dot live without needing a
  // manual refresh. Topic includes a random suffix for the same reason
  // subscribeToThreadMessages does — avoids a channel-topic collision
  // if this effect's cleanup and a remount race each other.
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
          setThreads((prev) =>
            prev
              .map((t) =>
                t.id === row.thread_id
                  ? {
                      ...t,
                      lastMessage: row,
                      last_activity: row.created_at,
                      // Only flip unread on for threads the admin isn't
                      // currently looking at — the open-thread effect
                      // above already marks the active one read.
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
    // Deliberately no deps beyond mount — selectedId is read fresh via
    // the functional setThreads updater above rather than being a dep
    // here, so this subscription isn't torn down/recreated every time
    // the admin switches threads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, selectedId])

  const selectedThread = threads.find((t) => t.id === selectedId) ?? null

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return threads
      .filter((t) => {
        const name = t.profiles?.full_name ?? t.profiles?.email ?? ''
        return !q || name.toLowerCase().includes(q)
      })
      .filter((t) => (tab === 'unread' ? t.unread : true))
  }, [threads, search, tab])

  const totalUnread = useMemo(() => threads.filter((t) => t.unread).length, [threads])

  const handleSelect = (id: string) => {
    setSelectedId(id)
    setReplyingTo(null)
    setPendingFiles([])
    setFileError(null)

    // One-way sync: selection -> URL. Doesn't touch scroll position and
    // doesn't push a new history entry per click (replace, not push),
    // so back/forward through the admin section isn't cluttered with
    // one entry per conversation switch — but a hard refresh still
    // lands on whichever thread was open.
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
        setMessages((prev) => [...prev, row])
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
          setMessages((prev) => [...prev, row])
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
      {/* ── Conversation strip: a horizontal row of cards, not a side
          column — see chat page history for why this shape. This strip
          is `flex-none` (fixed height, sized by content) so it never
          competes with the thread pane below for the remaining space.
          Sits on the same `bg-parchment` as everything else now — no
          `bg-card` panel / `border-ink/10` seam, see the top-of-file
          note on "Surfaces". ── */}
      <div className="flex-none bg-parchment">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
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
                placeholder="Search chats"
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
              onClick={handleRefresh}
              disabled={isRefreshing}
              aria-label="Refresh conversations"
              title="Refresh conversations"
              className="rounded-full p-1.5 text-ink/45 transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-50"
            >
              <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        <div className="scrollbar-none flex gap-2 overflow-x-auto px-4 pb-3">
          {threadsLoading ? (
            <p className="px-1 py-2 text-sm text-ink/40">Loading conversations…</p>
          ) : rows.length === 0 ? (
            <p className="px-1 py-2 text-sm text-ink/40">No conversations yet.</p>
          ) : (
            rows.map((t, i) => {
              const isSelected = t.id === selectedId
              const name = t.profiles?.full_name ?? t.profiles?.email ?? 'Customer'
              const preview = t.lastMessage ? parseReplyBody(t.lastMessage.text ?? '').text || (t.lastMessage.attachment_url ? '📷 Attachment' : '') : ''
              const label = threadLabel(t)
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleSelect(t.id)}
                  className={`flex w-60 flex-none items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    isSelected ? 'border-teal-deep bg-teal/10' : 'border-ink/10 bg-parchment/50 hover:bg-parchment/70'
                  }`}
                >
                  <span
                    className={`grid h-10 w-10 flex-none place-items-center rounded-full text-sm font-semibold text-white ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}
                  >
                    {initialsFor(name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1.5">
                      <p className="truncate text-[13px] font-medium text-ink">{name}</p>
                      {t.lastMessage && (
                        <span className={`flex-none text-[10px] ${t.unread ? 'text-teal-deep' : 'text-ink/40'}`}>
                          {formatTime(t.lastMessage.created_at)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-1.5">
                      <p className="truncate text-[11.5px] text-ink/50">
                        {label ? `${label} — ` : ''}
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
      </div>

      {/* ── Thread pane ──
          `min-h-0` here is the actual fix: without it, this flex child
          defaults to min-height:auto and refuses to shrink to fit the
          remaining space, so its own children (header + scrollable
          messages + composer) overflow past the bottom of the page and
          get clipped by the outer container's overflow-hidden instead
          of the messages div scrolling internally like it's supposed
          to. `min-h-0` tells the browser this container's height is
          allowed to be constrained by its flex-1 basis, which is what
          lets the composer stay visible and pinned at the bottom. ── */}
      <div className="relative flex min-h-0 flex-1 flex-col bg-parchment">
        {selectedThread ? (
          <>
            <div className="flex flex-none items-center gap-3 bg-parchment px-4 py-2.5">
              <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-teal-deep text-xs font-semibold text-white">
                {initialsFor(selectedThread.profiles?.full_name ?? selectedThread.profiles?.email ?? 'Customer')}
              </span>
              <div>
                <p className="text-[15px] font-medium text-ink">
                  {selectedThread.profiles?.full_name ?? selectedThread.profiles?.email ?? 'Customer'}
                </p>
                <p className="text-xs text-ink/50">
                  {selectedThread.profiles?.email}
                  {threadLabel(selectedThread) ? ` · ${threadLabel(selectedThread)}` : ''}
                </p>
              </div>
            </div>

            {/* min-h-0 kept here too (in addition to flex-1) — belt and
                braces so this stays the one scrolling element in the
                column even if a future edit changes the header's or
                composer's height. `scrollbar-none` hides the native
                scrollbar track/thumb without touching scroll behavior
                — overflow-y-auto still scrolls, it's just not painted,
                same trick the horizontal thread strip already uses. */}
            <div
              ref={scrollRef}
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
                dateGroups.map((group) => (
                  <div key={group.label}>
                    <div className="my-3 flex justify-center">
                      <span className="rounded-lg bg-card px-3 py-1 text-xs text-ink/50 shadow">{group.label}</span>
                    </div>
                    {group.messages.map((m) => {
                      const isOps = m.sender === 'ops'
                      const { quoted, text } = parseReplyBody(m.text ?? '')
                      const attachmentKind = m.attachment_url ? inferAttachmentKind(m.attachment_url) : null
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

                          <div
                            className={`max-w-[65%] rounded-lg px-2.5 py-[6px] text-[14.2px] shadow ${
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
                ))
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