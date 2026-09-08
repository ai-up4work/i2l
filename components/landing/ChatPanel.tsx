// components/landing/ChatPanel.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Link2, Plus, Send, X } from 'lucide-react'
import { useChat } from '@/contexts/ChatContext'

type View = 'list' | 'thread' | 'new'

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function NewRequestForm({ onCreated }: { onCreated: (threadId: string) => void }) {
  const { startThread } = useChat()
  const [link, setLink] = useState('')
  const [note, setNote] = useState('')

  const canSubmit = note.trim().length > 0

  const handleSubmit = () => {
    if (!canSubmit) return
    const title = link.trim() ? link.trim() : 'General request'
    const threadId = startThread({
      title,
      link: link.trim() || undefined,
      firstMessage: link.trim() ? `${note.trim()}\n\nLink: ${link.trim()}` : note.trim(),
    })
    onCreated(threadId)
  }

  return (
    <div className="flex h-full flex-col p-4">
      <p className="font-display text-base font-semibold text-ink">Tell us what you're looking for</p>
      <p className="mt-1 font-body text-xs text-ink/50">
        Paste a product link if you have one — we'll take it from here.
      </p>

      <div className="mt-4">
        <label className="mb-1.5 block font-body text-xs font-semibold text-ink/70">
          Product link <span className="text-ink/35">(optional)</span>
        </label>
        <div className="relative">
          <Link2 size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" />
          <input
            type="text"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://..."
            className="w-full rounded-xl border border-ink/15 bg-card py-2.5 pl-9 pr-3 font-body text-sm text-ink placeholder:text-ink/35 focus:border-teal-deep focus:outline-none focus:ring-2 focus:ring-teal/20"
          />
        </div>
      </div>

      <div className="mt-3 flex-1">
        <label className="mb-1.5 block font-body text-xs font-semibold text-ink/70">
          What do you need? <span className="text-gold-deep">*</span>
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          placeholder="Item name, size/color, or any details you have..."
          className="w-full resize-none rounded-xl border border-ink/15 bg-card p-3 font-body text-sm text-ink placeholder:text-ink/35 focus:border-teal-deep focus:outline-none focus:ring-2 focus:ring-teal/20"
        />
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-teal-deep py-3 font-body text-sm font-bold text-parchment transition-colors hover:bg-indigo-deep disabled:cursor-not-allowed disabled:opacity-40"
      >
        Send request
      </button>
    </div>
  )
}

function ThreadList({
  onSelect,
  onStartNew,
}: {
  onSelect: (id: string) => void
  onStartNew: () => void
}) {
  const { threads } = useChat()

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto p-2">
        {threads.length === 0 ? (
          <div className="px-3 py-10 text-center font-body text-sm text-ink/45">No requests yet.</div>
        ) : (
          threads
            .slice()
            .sort((a, b) => b.lastMessageAt - a.lastMessageAt)
            .map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelect(t.id)}
                className="flex w-full flex-col items-start gap-0.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-teal/[0.06]"
              >
                <span className="line-clamp-1 font-body text-sm font-semibold text-ink">{t.title}</span>
                <span className="font-body text-[11px] text-ink/40">
                  {t.status === 'pending_quote' ? 'Awaiting reply' : t.status === 'quoted' ? 'Quoted' : 'Closed'}
                  {' · '}
                  {formatTime(t.lastMessageAt)}
                </span>
              </button>
            ))
        )}
      </div>

      <div className="border-t border-ink/10 p-3">
        <button
          type="button"
          onClick={onStartNew}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-teal-deep/25 py-2.5 font-body text-sm font-semibold text-teal-deep transition-colors hover:bg-teal/[0.06]"
        >
          <Plus size={15} />
          New request
        </button>
      </div>
    </div>
  )
}

function ThreadView({ threadId, onBack }: { threadId: string; onBack: () => void }) {
  const { threads, messages, sendMessage, markThreadRead } = useChat()
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const thread = threads.find((t) => t.id === threadId)
  const threadMessages = messages
    .filter((m) => m.threadId === threadId)
    .sort((a, b) => a.createdAt - b.createdAt)

  useEffect(() => {
    markThreadRead(threadId)
  }, [threadId, markThreadRead])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [threadMessages.length])

  const handleSend = () => {
    if (!draft.trim()) return
    sendMessage(threadId, draft.trim())
    setDraft('')
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-ink/10 px-3 py-2.5">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to requests"
          className="rounded-full p-1.5 text-ink/60 transition-colors hover:bg-teal/[0.08]"
        >
          <ArrowLeft size={16} />
        </button>
        <span className="line-clamp-1 font-body text-sm font-semibold text-ink">{thread?.title ?? 'Request'}</span>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-2.5 overflow-y-auto p-3">
        {threadMessages.map((m) => (
          <div key={m.id} className={`flex ${m.sender === 'customer' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-3.5 py-2 font-body text-sm ${
                m.sender === 'customer' ? 'bg-teal-deep text-parchment' : 'bg-card text-ink border border-ink/10'
              }`}
            >
              <p className="whitespace-pre-wrap">{m.text}</p>
              <p className={`mt-1 text-[10px] ${m.sender === 'customer' ? 'text-parchment/70' : 'text-ink/40'}`}>
                {formatTime(m.createdAt)}
              </p>
            </div>
          </div>
        ))}

        {threadMessages.length <= 1 && (
          <div className="rounded-xl bg-teal/[0.08] px-3 py-2.5 font-body text-xs text-ink/60">
            We usually reply within a few hours. You'll see updates here as soon as we do.
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-ink/10 p-2.5">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Type a message..."
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

export default function ChatPanel({
  // Default matches the landing page's button (bottom-6) plus its own
  // height. AccountShell overrides this to clear MobileBottomNav on
  // mobile, same offset logic ChatButton now takes.
  positionClassName = 'bottom-24 right-6',
  hidden = false,
}: {
  positionClassName?: string
  hidden?: boolean
}) {
  const { isOpen, closeChat, threads, activeThreadId, setActiveThreadId } = useChat()
  const [view, setView] = useState<View>('list')

  useEffect(() => {
    if (!isOpen) return
    if (threads.length === 0) {
      setView('new')
    } else if (activeThreadId) {
      setView('thread')
    } else {
      setView('list')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  if (!isOpen || hidden) return null

  return (
    <div
      className={`fixed z-40 flex h-[32rem] w-[22rem] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-3xl border border-ink/10 bg-parchment shadow-lift ${positionClassName}`}
      role="dialog"
      aria-modal="true"
      aria-label="Chat with support"
    >
      <div className="flex items-center justify-between bg-indigo px-4 py-3.5">
        <div>
          <p className="font-display text-sm font-semibold text-parchment">WishDrop support</p>
          <p className="font-body text-[11px] text-parchment/55">Typically replies within a few hours</p>
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

      <div className="min-h-0 flex-1 bg-parchment">
        {view === 'new' && (
          <NewRequestForm
            onCreated={(id) => {
              setActiveThreadId(id)
              setView('thread')
            }}
          />
        )}
        {view === 'list' && (
          <ThreadList
            onSelect={(id) => {
              setActiveThreadId(id)
              setView('thread')
            }}
            onStartNew={() => setView('new')}
          />
        )}
        {view === 'thread' && activeThreadId && (
          <ThreadView threadId={activeThreadId} onBack={() => setView('list')} />
        )}
      </div>
    </div>
  )
}