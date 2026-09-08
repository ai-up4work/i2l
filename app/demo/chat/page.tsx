'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { MessageCircle, Search, Send } from 'lucide-react'
import {
  type ChatMessage,
  appendMessage,
  readAllMessages,
  storageKeyFor,
  uid,
} from '@/contexts/ChatContext'
import { MOCK_CUSTOMERS, initialsFor } from '@/lib/chat/mockCustomers'

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Same avatar-circle → indigo/teal palette as the customer-facing
// ChatPanel, just applied per-row instead of once in a header, so the
// sidebar reads as "one contact per row" the way WhatsApp Web does.
const AVATAR_COLORS = ['bg-indigo', 'bg-teal-deep', 'bg-gold', 'bg-ink/70']

export default function AdminChatDemo() {
  // NOTE: this is a single-browser demo standing in for a real ops
  // console. It reads/writes the same localStorage keys the customer
  // ChatPanel uses, per customer id, so you can see replies flow both
  // ways in this one browser. A real ops console needs a backend with
  // an actual customer directory and pushed updates (websocket) — this
  // page's job is just to preview the UI shape.
  const [threads, setThreads] = useState<Record<string, ChatMessage[]>>({})
  const [selectedId, setSelectedId] = useState(MOCK_CUSTOMERS[0]?.id ?? '')
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  // Per-customer "last opened" timestamp, session-only — enough to
  // show an unread badge in this demo without building real read
  // receipts. Selecting a thread marks it read immediately, same as
  // the customer-facing markRead().
  const [lastOpenedAt, setLastOpenedAt] = useState<Record<string, number>>(() =>
    Object.fromEntries(MOCK_CUSTOMERS.map((c) => [c.id, Date.now()]))
  )
  const scrollRef = useRef<HTMLDivElement>(null)

  // Initial load: pull every customer's thread once on mount.
  useEffect(() => {
    const initial: Record<string, ChatMessage[]> = {}
    for (const c of MOCK_CUSTOMERS) initial[c.id] = readAllMessages(c.id)
    setThreads(initial)
  }, [])

  // Cross-tab sync: if a customer sends from ChatPanel in another tab,
  // pick it up here. Same-tab ops sends update state directly instead
  // (storage events never fire in the tab that wrote them).
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

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return MOCK_CUSTOMERS.filter(
      (c) => !q || c.name.toLowerCase().includes(q) || c.handle.toLowerCase().includes(q)
    ).map((c, i) => {
      const msgs = threads[c.id] ?? []
      const last = msgs[msgs.length - 1]
      const unread = msgs.filter(
        (m) => m.sender === 'customer' && m.createdAt > (lastOpenedAt[c.id] ?? 0)
      ).length
      return { customer: c, last, unread, colorIdx: i % AVATAR_COLORS.length }
    })
  }, [search, threads, lastOpenedAt])

  const handleSelect = (id: string) => {
    setSelectedId(id)
    setLastOpenedAt((prev) => ({ ...prev, [id]: Date.now() }))
  }

  const handleSend = () => {
    const trimmed = draft.trim()
    if (!trimmed || !selectedId) return
    const message: ChatMessage = {
      id: uid(),
      sender: 'ops',
      text: trimmed,
      createdAt: Date.now(),
      requestId: null,
    }
    appendMessage(message, selectedId)
    setThreads((prev) => ({ ...prev, [selectedId]: [...(prev[selectedId] ?? []), message] }))
    setDraft('')
  }

  return (
    <div className="flex h-screen w-full bg-parchment">
      {/* ── Sidebar: one row per customer, WhatsApp-Web style ── */}
      <div className="flex w-[22rem] flex-none flex-col border-r border-ink/10 bg-card">
        <div className="flex items-center justify-between bg-indigo px-4 h-16">
          <p className="font-display text-sm font-semibold text-parchment">Ops console (demo)</p>
        </div>

        <div className="border-b border-ink/10 p-2.5">
          <div className="flex items-center gap-2 rounded-full bg-parchment px-3.5 py-2">
            <Search size={15} className="text-ink/35" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search or start new chat"
              className="w-full bg-transparent font-body text-sm text-ink placeholder:text-ink/35 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {rows.map(({ customer, last, unread, colorIdx }) => {
            const isSelected = customer.id === selectedId
            return (
              <button
                key={customer.id}
                type="button"
                onClick={() => handleSelect(customer.id)}
                className={`flex w-full items-center gap-3 border-b border-ink/[0.06] px-3.5 py-3 text-left transition-colors ${
                  isSelected ? 'bg-teal/10' : 'hover:bg-ink/[0.03]'
                }`}
              >
                <span
                  className={`grid h-11 w-11 flex-none place-items-center rounded-full font-display text-xs font-semibold text-parchment ${AVATAR_COLORS[colorIdx]}`}
                >
                  {initialsFor(customer.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-display text-sm font-semibold text-ink">{customer.name}</p>
                    {last && (
                      <span className="flex-none font-body text-[10px] text-ink/40">{formatTime(last.createdAt)}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-body text-xs text-ink/50">
                      {last ? `${last.sender === 'ops' ? 'You: ' : ''}${last.text}` : customer.handle}
                    </p>
                    {unread > 0 && (
                      <span className="grid h-5 min-w-[20px] flex-none place-items-center rounded-full bg-teal-deep px-1.5 font-body text-[10px] font-bold text-parchment">
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
      <div className="flex flex-1 flex-col">
        {selectedCustomer ? (
          <>
            <div className="flex items-center gap-3 border-b border-ink/10 bg-indigo px-5 h-16">
              <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-teal-deep font-display text-xs font-semibold text-parchment">
                {initialsFor(selectedCustomer.name)}
              </span>
              <div>
                <p className="font-display text-sm font-semibold text-parchment">{selectedCustomer.name}</p>
                <p className="font-body text-[11px] text-parchment/55">{selectedCustomer.handle}</p>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-1.5 overflow-y-auto bg-parchment p-5">
              {selectedMessages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                  <MessageCircle size={28} className="text-ink/20" strokeWidth={1.4} />
                  <p className="font-body text-sm text-ink/50">No messages yet with {selectedCustomer.name}.</p>
                </div>
              ) : (
                selectedMessages.map((m) => (
                  <div key={m.id} className={`flex ${m.sender === 'ops' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[65%] rounded-2xl px-3.5 py-2 font-body text-sm ${
                        m.sender === 'ops'
                          ? 'bg-teal-deep text-parchment'
                          : 'bg-card text-ink border border-ink/10'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{m.text}</p>
                      <p className={`mt-1 text-right text-[10px] ${m.sender === 'ops' ? 'text-parchment/70' : 'text-ink/40'}`}>
                        {formatTime(m.createdAt)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center gap-2 border-t border-ink/10 bg-parchment p-3">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder={`Reply to ${selectedCustomer.handle}...`}
                className="flex-1 rounded-full border border-ink/15 bg-card px-4 py-2.5 font-body text-sm text-ink placeholder:text-ink/35 focus:border-teal-deep focus:outline-none focus:ring-2 focus:ring-teal/20"
              />
              <button
                onClick={handleSend}
                disabled={!draft.trim()}
                aria-label="Send message"
                className="grid h-10 w-10 flex-none place-items-center rounded-full bg-teal-deep text-parchment transition-colors hover:bg-indigo-deep disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send size={15} />
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-ink/40">Select a conversation</div>
        )}
      </div>
    </div>
  )
}