// app/demo/chat/page.tsx
'use client'

import { useState } from 'react'
import { useChat } from '@/contexts/ChatContext'

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function AdminChatDemo() {
  const { messages, sendOpsMessage } = useChat()
  const [draft, setDraft] = useState('')

  const handleSend = () => {
    if (!draft.trim()) return
    sendOpsMessage(draft)
    setDraft('')
  }

  return (
    <div className="mx-auto flex h-screen max-w-2xl flex-col bg-parchment">
      <div className="border-b border-ink/10 bg-indigo px-4 py-3">
        <p className="font-display text-sm font-semibold text-parchment">
          Ops console (demo) — replying as WishDrop Support
        </p>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.sender === 'ops' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[75%] rounded-2xl px-3.5 py-2 font-body text-sm ${
                m.sender === 'ops' ? 'bg-teal-deep text-parchment' : 'bg-card text-ink border border-ink/10'
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide opacity-60">
                {m.sender === 'ops' ? 'Ops' : 'Customer'}
              </p>
              <p className="whitespace-pre-wrap">{m.text}</p>
              <p className="mt-1 text-right text-[10px] opacity-50">{formatTime(m.createdAt)}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 border-t border-ink/10 p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Reply as ops..."
          className="flex-1 rounded-full border border-ink/15 bg-card px-4 py-2.5 font-body text-sm"
        />
        <button
          onClick={handleSend}
          disabled={!draft.trim()}
          className="rounded-full bg-teal-deep px-4 py-2.5 font-body text-sm font-semibold text-parchment disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  )
}