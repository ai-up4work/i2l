'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  CheckCheck,
  MessageSquare,
  Mic,
  Paperclip,
  RefreshCw,
  Reply,
  Search,
  Send,
  Smile,
  Users,
  X,
} from 'lucide-react'
import {
  type ChatAttachment,
  type ChatMessage,
  type ReplyPreview,
  appendMessage,
  fileToAttachment,
  readAllMessages,
  removeAttachmentFromMessage,
  storageKeyFor,
  toReplyPreview,
  uid,
} from '@/contexts/ChatContext'
import { MOCK_CUSTOMERS, initialsFor } from '@/lib/chat/mockCustomers'
import AttachmentMedia from '@/components/chat/AttachmentMedia'

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDateLabel(ts: number) {
  const d = new Date(ts)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (sameDay(d, today)) return 'Today'
  if (sameDay(d, yesterday)) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'long' }) === d.toLocaleDateString()
    ? d.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' })
    : d.toLocaleDateString([], { weekday: 'long' })
}

// Group a flat message list into { dateLabel, messages }[] so we can
// render WhatsApp-style centered date pills between days.
function groupByDate(messages: ChatMessage[]) {
  const groups: { label: string; messages: ChatMessage[] }[] = []
  for (const m of messages) {
    const label = formatDateLabel(m.createdAt)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.messages.push(m)
    else groups.push({ label, messages: [m] })
  }
  return groups
}

const AVATAR_COLORS = ['bg-emerald-700', 'bg-sky-700', 'bg-amber-700', 'bg-fuchsia-800', 'bg-rose-700', 'bg-indigo-700']

export default function AdminChatDemo() {
  const [threads, setThreads] = useState<Record<string, ChatMessage[]>>({})
  const [selectedId, setSelectedId] = useState(MOCK_CUSTOMERS[0]?.id ?? '')
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'all' | 'unread'>('all')
  const [lastOpenedAt, setLastOpenedAt] = useState<Record<string, number>>(() =>
    Object.fromEntries(MOCK_CUSTOMERS.map((c) => [c.id, Date.now()]))
  )

  const [replyingTo, setReplyingTo] = useState<ReplyPreview | null>(null)
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([])
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [highlightedId, setHighlightedId] = useState<string | null>(null)

  // Bumped by the refresh button. Threaded into AttachmentMedia's key
  // so it force-remounts and re-hits IndexedDB — localStorage changes
  // cross-tab via the 'storage' event below, but IndexedDB writes don't
  // fire any equivalent event, so attachments need an explicit nudge.
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const loadThreads = useCallback(() => {
    const next: Record<string, ChatMessage[]> = {}
    for (const c of MOCK_CUSTOMERS) next[c.id] = readAllMessages(c.id)
    setThreads(next)
  }, [])

  useEffect(() => {
    loadThreads()
  }, [loadThreads])

  useEffect(() => {
    const keyToCustomerId = new Map(MOCK_CUSTOMERS.map((c) => [storageKeyFor(c.id), c.id]))
    const onStorage = (e: StorageEvent) => {
      const customerId = e.key ? keyToCustomerId.get(e.key) : undefined
      if (!customerId) return
      setThreads((prev) => ({ ...prev, [customerId]: readAllMessages(customerId) }))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [threads, selectedId])

  const selectedCustomer = MOCK_CUSTOMERS.find((c) => c.id === selectedId) ?? null
  const selectedMessages = threads[selectedId] ?? []
  const dateGroups = useMemo(() => groupByDate(selectedMessages), [selectedMessages])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return MOCK_CUSTOMERS.filter(
      (c) => !q || c.name.toLowerCase().includes(q) || c.handle.toLowerCase().includes(q)
    )
      .map((c, i) => {
        const msgs = threads[c.id] ?? []
        const last = msgs[msgs.length - 1]
        const unread = msgs.filter(
          (m) => m.sender === 'customer' && m.createdAt > (lastOpenedAt[c.id] ?? 0)
        ).length
        return { customer: c, last, unread, colorIdx: i % AVATAR_COLORS.length }
      })
      .filter((r) => (tab === 'unread' ? r.unread > 0 : true))
  }, [search, threads, lastOpenedAt, tab])

  const totalUnread = useMemo(
    () =>
      MOCK_CUSTOMERS.reduce((sum, c) => {
        const msgs = threads[c.id] ?? []
        return (
          sum +
          msgs.filter((m) => m.sender === 'customer' && m.createdAt > (lastOpenedAt[c.id] ?? 0)).length
        )
      }, 0),
    [threads, lastOpenedAt]
  )

  const handleSelect = (id: string) => {
    setSelectedId(id)
    setLastOpenedAt((prev) => ({ ...prev, [id]: Date.now() }))
    setReplyingTo(null)
    setPendingAttachments([])
    setUploadError(null)
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    loadThreads()
    setRefreshVersion((v) => v + 1)
    // Purely cosmetic delay so the spin is visible even on a fast local read.
    await new Promise((r) => setTimeout(r, 350))
    setIsRefreshing(false)
  }

  const handleSend = () => {
    const trimmed = draft.trim()
    if (!trimmed && pendingAttachments.length === 0) return
    if (!selectedId) return
    const message: ChatMessage = {
      id: uid(),
      sender: 'ops',
      text: trimmed,
      createdAt: Date.now(),
      requestId: null,
      replyTo: replyingTo,
      attachments: pendingAttachments,
    }
    appendMessage(message, selectedId)
    setThreads((prev) => ({ ...prev, [selectedId]: [...(prev[selectedId] ?? []), message] }))
    setDraft('')
    setReplyingTo(null)
    setPendingAttachments([])
  }

  const handleFilesPicked = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploadError(null)
    const results = await Promise.allSettled(Array.from(files).map(fileToAttachment))
    const ok: ChatAttachment[] = []
    let firstError: string | null = null
    for (const r of results) {
      if (r.status === 'fulfilled') ok.push(r.value)
      else firstError = firstError ?? r.reason?.message ?? 'Upload failed'
    }
    if (ok.length) setPendingAttachments((prev) => [...prev, ...ok])
    if (firstError) setUploadError(firstError)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Admin-only moderation action: remove one attachment from an
  // already-sent message. Updates local thread state immediately and
  // persists via ChatContext's removeAttachmentFromMessage helper.
  const handleDeleteAttachment = (messageId: string, attachmentId: string) => {
    if (!selectedId) return
    const next = removeAttachmentFromMessage(selectedId, messageId, attachmentId)
    setThreads((prev) => ({ ...prev, [selectedId]: next }))
  }

  const jumpToMessage = (id: string) => {
    const el = messageRefs.current[id]
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightedId(id)
    setTimeout(() => setHighlightedId((cur) => (cur === id ? null : cur)), 1200)
  }

  return (
    <div className="flex h-screen w-full bg-[#0b141a] text-[#e9edef]">
      {/* ── Far-left icon rail ── */}
      <div className="flex w-14 flex-none flex-col items-center justify-between bg-[#111b21] py-4">
        <div className="flex flex-col items-center gap-5">
          <div className="relative grid h-9 w-9 place-items-center rounded-lg text-[#00a884]">
            <MessageSquare size={22} fill="currentColor" strokeWidth={0} />
            {totalUnread > 0 && (
              <span className="absolute -right-1 -top-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-[#00a884] px-1 text-[10px] font-bold text-[#111b21]">
                {totalUnread > 9 ? '9+' : totalUnread}
              </span>
            )}
          </div>
          <Users size={20} className="text-[#aebac1]" />
        </div>
        <span className="grid h-8 w-8 place-items-center rounded-full bg-[#6b7c85] font-display text-[11px] font-semibold text-white">
          OP
        </span>
      </div>

      {/* ── Sidebar ── */}
      <div className="flex w-[26rem] flex-none flex-col border-r border-white/[0.06] bg-[#111b21]">
        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-lg font-medium text-[#e9edef]">Chats</p>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            aria-label="Refresh conversations"
            title="Refresh conversations"
            className="rounded-full p-1.5 text-[#aebac1] transition-colors hover:bg-white/5 hover:text-[#e9edef] disabled:opacity-50"
          >
            <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="px-3 pb-2">
          <div className="flex items-center gap-3 rounded-lg bg-[#202c33] px-3 py-1.5">
            <Search size={16} className="text-[#aebac1]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search or start a new chat"
              className="w-full bg-transparent py-1 text-sm text-[#e9edef] placeholder:text-[#8696a0] focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 pb-2">
          <button
            type="button"
            onClick={() => setTab('all')}
            className={`rounded-full px-3 py-1 text-[13px] font-medium transition-colors ${
              tab === 'all' ? 'bg-[#00a884]/15 text-[#00a884]' : 'text-[#aebac1] hover:bg-white/5'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setTab('unread')}
            className={`rounded-full px-3 py-1 text-[13px] font-medium transition-colors ${
              tab === 'unread' ? 'bg-[#00a884]/15 text-[#00a884]' : 'text-[#aebac1] hover:bg-white/5'
            }`}
          >
            Unread {totalUnread > 0 ? totalUnread : ''}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {rows.map(({ customer, last, unread, colorIdx }) => {
            const isSelected = customer.id === selectedId
            const lastPreview = last
              ? last.text ||
                (last.attachments?.length ? (last.attachments[0].type === 'video' ? '📹 Video' : '📷 Photo') : '')
              : customer.handle
            return (
              <button
                key={customer.id}
                type="button"
                onClick={() => handleSelect(customer.id)}
                className={`flex w-full items-center gap-3 px-3 py-3 text-left transition-colors ${
                  isSelected ? 'bg-[#2a3942]' : 'hover:bg-[#202c33]'
                }`}
              >
                <span
                  className={`grid h-12 w-12 flex-none place-items-center rounded-full text-sm font-semibold text-white ${AVATAR_COLORS[colorIdx]}`}
                >
                  {initialsFor(customer.name)}
                </span>
                <div className="min-w-0 flex-1 border-b border-white/[0.06] pb-3 pt-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[15px] text-[#e9edef]">{customer.name}</p>
                    {last && (
                      <span
                        className={`flex-none text-xs ${unread > 0 ? 'text-[#00a884]' : 'text-[#8696a0]'}`}
                      >
                        {formatTime(last.createdAt)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[13px] text-[#8696a0]">
                      {last?.sender === 'ops' ? 'You: ' : ''}
                      {lastPreview}
                    </p>
                    {unread > 0 && (
                      <span className="grid h-5 min-w-[20px] flex-none place-items-center rounded-full bg-[#00a884] px-1.5 text-[11px] font-bold text-[#111b21]">
                        {unread > 9 ? '9+' : unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Thread pane ── */}
      <div className="relative flex flex-1 flex-col">
        {selectedCustomer ? (
          <>
            <div className="flex items-center gap-3 border-b border-white/[0.06] bg-[#202c33] px-4 py-2.5">
              <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-emerald-700 text-xs font-semibold text-white">
                {initialsFor(selectedCustomer.name)}
              </span>
              <div>
                <p className="text-[15px] text-[#e9edef]">{selectedCustomer.name}</p>
                <p className="text-xs text-[#8696a0]">{selectedCustomer.handle}</p>
              </div>
            </div>

            {/* Dark wallpaper-style background, WhatsApp doodle stand-in */}
            <div
              ref={scrollRef}
              className="flex-1 space-y-1 overflow-y-auto px-6 py-4 sm:px-12 md:px-20"
              style={{
                backgroundColor: '#0b141a',
                backgroundImage:
                  'radial-gradient(rgba(255,255,255,0.025) 1px, transparent 1px)',
                backgroundSize: '18px 18px',
              }}
            >
              {selectedMessages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                  <MessageSquare size={28} className="text-white/15" strokeWidth={1.4} />
                  <p className="text-sm text-[#8696a0]">No messages yet with {selectedCustomer.name}.</p>
                </div>
              ) : (
                dateGroups.map((group) => (
                  <div key={group.label}>
                    <div className="my-3 flex justify-center">
                      <span className="rounded-lg bg-[#182229] px-3 py-1 text-xs text-[#8696a0] shadow">
                        {group.label}
                      </span>
                    </div>
                    {group.messages.map((m) => {
                      const isOps = m.sender === 'ops'
                      const isHighlighted = highlightedId === m.id
                      return (
                        <div
                          key={m.id}
                          className={`group my-0.5 flex items-center gap-1.5 ${isOps ? 'justify-end' : 'justify-start'}`}
                        >
                          {isOps && (
                            <button
                              type="button"
                              onClick={() => setReplyingTo(toReplyPreview(m))}
                              aria-label="Reply"
                              className="flex-none rounded-full p-1.5 text-[#8696a0] opacity-0 transition-opacity hover:bg-white/5 group-hover:opacity-100"
                            >
                              <Reply size={14} />
                            </button>
                          )}

                          <div
                            ref={(el) => {
                              messageRefs.current[m.id] = el
                            }}
                            className={`max-w-[65%] rounded-lg px-2.5 py-[6px] text-[14.2px] shadow transition-colors duration-500 ${
                              isOps ? 'bg-[#005c4b] text-[#e9edef]' : 'bg-[#202c33] text-[#e9edef]'
                            } ${isHighlighted ? 'ring-2 ring-[#00a884]' : ''}`}
                          >
                            {m.replyTo && (
                              <button
                                type="button"
                                onClick={() => jumpToMessage(m.replyTo!.id)}
                                className="mb-1 block w-full rounded border-l-[3px] border-[#00a884] bg-black/20 px-2 py-1 text-left"
                              >
                                <p className="text-[12.5px] font-medium text-[#00a884]">
                                  {m.replyTo.sender === 'ops' ? 'You' : selectedCustomer.name}
                                </p>
                                <p className="truncate text-[12.5px] text-[#c8ccce]">
                                  {m.replyTo.text ||
                                    (m.replyTo.attachmentType === 'video' ? '📹 Video' : '📷 Photo')}
                                </p>
                              </button>
                            )}

                            {m.attachments && m.attachments.length > 0 && (
                              <div
                                className={`mb-1 grid gap-1 ${
                                  m.attachments.length > 1 ? 'grid-cols-2' : 'grid-cols-1'
                                }`}
                              >
                                {m.attachments.map((a) => (
                                  <div key={`${a.id}-${refreshVersion}`} className="group/attachment relative">
                                    <AttachmentMedia
                                      attachment={a}
                                      refreshKey={refreshVersion}
                                      className="max-h-64 w-full rounded-md object-cover"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteAttachment(m.id, a.id)}
                                      aria-label="Delete attachment"
                                      title="Delete attachment"
                                      className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white opacity-0 transition-opacity hover:bg-black/80 group-hover/attachment:opacity-100"
                                    >
                                      <X size={13} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="flex items-end gap-1.5">
                              {m.text && <p className="whitespace-pre-wrap break-words">{m.text}</p>}
                              <span
                                className={`ml-auto flex flex-none items-center gap-0.5 pb-[1px] text-[11px] ${
                                  isOps ? 'text-[#8fd6c4]' : 'text-[#8696a0]'
                                }`}
                              >
                                {formatTime(m.createdAt)}
                                {isOps && <CheckCheck size={14} className="text-[#53bdeb]" />}
                              </span>
                            </div>
                          </div>

                          {!isOps && (
                            <button
                              type="button"
                              onClick={() => setReplyingTo(toReplyPreview(m))}
                              aria-label="Reply"
                              className="flex-none rounded-full p-1.5 text-[#8696a0] opacity-0 transition-opacity hover:bg-white/5 group-hover:opacity-100"
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

            {pendingAttachments.length > 0 && (
              <div className="flex gap-2 overflow-x-auto border-t border-white/[0.06] bg-[#202c33] px-3 pt-3">
                {pendingAttachments.map((a) => (
                  <div key={a.id} className="relative flex-none">
                    <AttachmentMedia attachment={a} className="h-16 w-16 rounded-lg object-cover" />
                    <button
                      type="button"
                      onClick={() => setPendingAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                      aria-label="Remove attachment"
                      className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-[#111b21] text-white"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {uploadError && (
              <p className="border-t border-white/[0.06] bg-[#202c33] px-3 pt-2 text-xs text-red-400">
                {uploadError}
              </p>
            )}

            {replyingTo && (
              <div className="flex items-center gap-2 border-t border-white/[0.06] bg-[#202c33] px-3 pt-3">
                <div className="flex-1 rounded-lg border-l-[3px] border-[#00a884] bg-black/20 px-3 py-1.5">
                  <p className="text-[12.5px] font-medium text-[#00a884]">
                    Replying to {replyingTo.sender === 'ops' ? 'yourself' : selectedCustomer.name}
                  </p>
                  <p className="truncate text-xs text-[#c8ccce]">
                    {replyingTo.text || (replyingTo.attachmentType === 'video' ? '📹 Video' : '📷 Photo')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyingTo(null)}
                  aria-label="Cancel reply"
                  className="flex-none rounded-full p-1.5 text-[#8696a0] hover:bg-white/5"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            <div className="flex items-center gap-3 bg-[#202c33] px-4 py-2.5">
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
                className="grid h-9 w-9 flex-none place-items-center rounded-full text-[#8696a0] transition-colors hover:bg-white/5 hover:text-[#aebac1]"
              >
                <Paperclip size={20} className="rotate-[-45deg]" />
              </button>
              <button
                type="button"
                aria-label="Emoji"
                className="grid h-9 w-9 flex-none place-items-center rounded-full text-[#8696a0] transition-colors hover:bg-white/5 hover:text-[#aebac1]"
              >
                <Smile size={20} />
              </button>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Type a message"
                className="flex-1 rounded-lg bg-[#2a3942] px-4 py-2 text-sm text-[#e9edef] placeholder:text-[#8696a0] focus:outline-none"
              />
              <button
                onClick={handleSend}
                aria-label={draft.trim() || pendingAttachments.length ? 'Send message' : 'Record voice message'}
                className="grid h-9 w-9 flex-none place-items-center rounded-full text-[#8696a0] transition-colors hover:bg-white/5 hover:text-[#aebac1]"
              >
                {draft.trim() || pendingAttachments.length > 0 ? <Send size={19} /> : <Mic size={20} />}
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center bg-[#0b141a] text-[#8696a0]">
            Select a conversation
          </div>
        )}
      </div>
    </div>
  )
}