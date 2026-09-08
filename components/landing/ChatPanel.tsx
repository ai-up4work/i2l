// components/landing/ChatPanel.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Send, X } from 'lucide-react'
import { useChat } from '@/contexts/ChatContext'

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDateLabel(ts: number) {
  const date = new Date(ts)
  const today = new Date()
  const isToday = date.toDateString() === today.toDateString()
  if (isToday) return 'Today'

  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

/** Groups messages under date-separator labels, WhatsApp-style. */
function groupByDay(messages: { id: string; createdAt: number }[]) {
  const groups: { label: string; ids: string[] }[] = []
  for (const m of messages) {
    const label = formatDateLabel(m.createdAt)
    const last = groups[groups.length - 1]
    if (last && last.label === label) {
      last.ids.push(m.id)
    } else {
      groups.push({ label, ids: [m.id] })
    }
  }
  return groups
}

export default function ChatPanel({
  positionClassName = 'bottom-24 right-6',
  hidden = false,
}: {
  positionClassName?: string
  hidden?: boolean
}) {
  const { isOpen, closeChat, messages, sendMessage, markRead } = useChat()
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) markRead()
  }, [isOpen, markRead])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages.length])

  if (!isOpen || hidden) return null

  const handleSend = () => {
    if (!draft.trim()) return
    sendMessage(draft)
    setDraft('')
  }

  const dayGroups = groupByDay(messages)
  const byId = Object.fromEntries(messages.map((m) => [m.id, m]))

  return (
    <div
      className={`fixed z-40 flex h-[32rem] w-[22rem] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-3xl border border-ink/10 bg-parchment shadow-lift ${positionClassName}`}
      role="dialog"
      aria-modal="true"
      aria-label="Chat with WishDrop support"
    >
      {/* Single-contact header, WhatsApp-style — an avatar + name + status,
          not a thread picker, since there's only ever one conversation. */}
      <div className="flex items-center justify-between bg-indigo px-4 py-3.5">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-teal-deep text-parchment">
            <MessageCircle size={18} />
          </span>
          <div>
            <p className="font-display text-sm font-semibold text-parchment">WishDrop Support</p>
            <p className="font-body text-[11px] text-parchment/55">Typically replies within a few hours</p>
          </div>
        </div>
        <button
          type="button"
          onClick={closeChat}
          aria-label="Close chat"
          className="rounded-full p-1.5 text-parchment/70 transition-colors hover:bg-parchment/10 hover:text-parchment"
        >
          <X size={16} />
        </button>
      </div>

      {/* One continuous scrollback — every request/link/question the
          customer has ever sent lives in this same timeline, the way a
          real WhatsApp conversation with a single business contact
          would, rather than being split into separate thread screens. */}
      <div ref={scrollRef} className="flex-1 space-y-1 overflow-y-auto bg-parchment p-3">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <MessageCircle size={28} className="text-ink/20" strokeWidth={1.4} />
            <p className="font-body text-sm text-ink/50">
              Send us a message, or paste a product link — we'll take it from there.
            </p>
          </div>
        ) : (
          dayGroups.map((group) => (
            <div key={group.label}>
              <div className="my-2 flex justify-center">
                <span className="rounded-full bg-ink/[0.05] px-3 py-1 font-body text-[10px] font-semibold uppercase tracking-wide text-ink/40">
                  {group.label}
                </span>
              </div>
              {group.ids.map((id) => {
                const m = byId[id]
                return (
                  <div key={m.id} className={`flex ${m.sender === 'customer' ? 'justify-end' : 'justify-start'} py-0.5`}>
                    <div
                      className={`max-w-[80%] rounded-2xl px-3.5 py-2 font-body text-sm ${
                        m.sender === 'customer'
                          ? 'bg-teal-deep text-parchment'
                          : 'bg-card text-ink border border-ink/10'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{m.text}</p>
                      <p
                        className={`mt-1 text-right text-[10px] ${
                          m.sender === 'customer' ? 'text-parchment/70' : 'text-ink/40'
                        }`}
                      >
                        {formatTime(m.createdAt)}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          ))
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-ink/10 bg-parchment p-2.5">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Type a message, or paste a link..."
          className="flex-1 rounded-full border border-ink/15 bg-card px-4 py-2.5 font-body text-sm text-ink placeholder:text-ink/35 focus:border-teal-deep focus:outline-none focus:ring-2 focus:ring-teal/20"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!draft.trim()}
          aria-label="Send message"
          className="grid h-10 w-10 flex-none place-items-center rounded-full bg-teal-deep text-parchment transition-colors hover:bg-indigo-deep disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  )
}