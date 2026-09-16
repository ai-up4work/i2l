// components/shared/ChatPanel.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Paperclip, Reply, Send, X } from 'lucide-react'
import { FaWhatsapp } from 'react-icons/fa'
import { useChat, type ChatMessage, type ReplyPreview } from '@/contexts/ChatContext'
import { useAuth } from '@/contexts/AuthContext'
import AttachmentMedia from '@/components/chat/AttachmentMedia'

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

function groupByDay(messages: ChatMessage[]) {
  const groups: { label: string; ids: string[] }[] = []
  for (const m of messages) {
    const label = formatDateLabel(m.createdAt)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.ids.push(m.id)
    else groups.push({ label, ids: [m.id] })
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
  const { isOpen, closeChat, messages, sending, sendError, sendMessage, markRead, isLocked, handle, getWhatsAppLink, hasMoreMessages, loadingMoreMessages, loadOlderMessages } =
    useChat()
  const { login } = useAuth()
  const [draft, setDraft] = useState('')
  const [replyingTo, setReplyingTo] = useState<ReplyPreview | null>(null)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [fileError, setFileError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Distinguishes "a message was prepended (older history loaded)" from
  // "a message was appended (new message arrived)" for the scroll effect
  // below — those two cases need opposite behavior (keep the same
  // messages in view vs. jump to the newest one).
  const isLoadingOlderRef = useRef(false)
  const prevScrollHeightRef = useRef(0)

  useEffect(() => {
    if (isOpen && !isLocked) markRead()
  }, [isOpen, isLocked, markRead])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (isLoadingOlderRef.current) {
      // Older messages were just prepended above what's currently
      // visible — without this, the browser keeps scrollTop pinned to
      // the same pixel offset, which visually yanks the conversation
      // down by however tall the new content is. Restore the same
      // messages in view instead of jumping anywhere.
      el.scrollTop = el.scrollHeight - prevScrollHeightRef.current
      isLoadingOlderRef.current = false
      return
    }
    el.scrollTo({ top: el.scrollHeight })
  }, [messages.length])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el || !hasMoreMessages || loadingMoreMessages) return
    // Within ~40px of the top — close enough that a user scrolling up
    // to read history should trigger the next page, without requiring
    // them to hit the exact top pixel.
    if (el.scrollTop < 40) {
      isLoadingOlderRef.current = true
      prevScrollHeightRef.current = el.scrollHeight
      loadOlderMessages()
    }
  }

  if (!isOpen || hidden) return null

  const handleSend = async () => {
    if (!draft.trim() && pendingFiles.length === 0) return
    await sendMessage(draft, { replyTo: replyingTo, files: pendingFiles })
    setDraft('')
    setReplyingTo(null)
    setPendingFiles([])
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

  const dayGroups = groupByDay(messages)
  const byId = Object.fromEntries(messages.map((m) => [m.id, m]))

  return (
    <div
      className={`fixed z-40 flex h-[32rem] w-[22rem] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-3xl border border-ink/10 bg-parchment shadow-lift ${positionClassName}`}
      role="dialog"
      aria-modal="true"
      aria-label="Chat with WishDrop support"
    >
      <div className="flex items-center justify-between bg-indigo px-4 py-3.5">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-teal-deep text-parchment">
            <MessageCircle size={18} />
          </span>
          <div>
            <p className="font-display text-sm font-semibold text-parchment">WishDrop Support</p>
            <p className="font-body text-[11px] text-parchment/55">
              {handle ? `Chatting as ${handle}` : 'Typically replies within a few hours'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* Always-available WhatsApp handoff — visible whether logged
              in or locked out, per the requirement that this option
              isn't just a fallback for anonymous users. */}
          <a
            href={getWhatsAppLink()}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Continue on WhatsApp"
            title="Continue on WhatsApp"
            className="rounded-full p-1.5 text-parchment/70 transition-colors hover:bg-parchment/10 hover:text-parchment"
          >
            <FaWhatsapp size={16} />
          </a>
          <button
            type="button"
            onClick={closeChat}
            aria-label="Close chat"
            className="rounded-full p-1.5 text-parchment/70 transition-colors hover:bg-parchment/10 hover:text-parchment"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 space-y-1 overflow-y-auto bg-parchment p-3">
        {hasMoreMessages && (
          <div className="flex justify-center py-2">
            {loadingMoreMessages ? (
              <span className="text-[11px] text-ink/35">Loading older messages…</span>
            ) : (
              <button
                type="button"
                onClick={loadOlderMessages}
                className="text-[11px] font-semibold text-teal-deep hover:underline"
              >
                Load older messages
              </button>
            )}
          </div>
        )}
        {isLocked ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center px-4">
            <MessageCircle size={28} className="text-ink/20" strokeWidth={1.4} />
            <p className="font-body text-sm text-ink/50">
              Sign in to chat with us — or continue the conversation on WhatsApp instead.
            </p>
          </div>
        ) : messages.length === 0 ? (
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
                const isCustomer = m.sender === 'customer'
                return (
                  <div key={m.id} className={`group flex ${isCustomer ? 'justify-end' : 'justify-start'} py-0.5`}>
                    {!isCustomer && (
                      <button
                        type="button"
                        onClick={() => setReplyingTo({ id: m.id, sender: m.sender, text: m.text })}
                        aria-label="Reply"
                        className="mr-1 flex-none self-center rounded-full p-1 text-ink/35 opacity-0 transition-opacity hover:bg-ink/5 group-hover:opacity-100"
                      >
                        <Reply size={12} />
                      </button>
                    )}
                    <div
                      className={`max-w-[80%] rounded-2xl px-3.5 py-2 font-body text-sm ${
                        isCustomer ? 'bg-teal-deep text-parchment' : 'bg-card text-ink border border-ink/10'
                      }`}
                    >
                      {m.replyTo && (
                        <div
                          className={`mb-1.5 rounded-lg border-l-[3px] px-2 py-1 text-xs ${
                            isCustomer ? 'border-parchment/50 bg-black/10 text-parchment/80' : 'border-teal-deep bg-ink/5 text-ink/60'
                          }`}
                        >
                          {m.replyTo.text}
                        </div>
                      )}
                      {m.attachment && (
                        <div className="mb-1.5">
                          <AttachmentMedia
                            url={m.attachment.url}
                            kind={m.attachment.kind}
                            className="max-h-56 w-full rounded-lg object-cover"
                          />
                        </div>
                      )}
                      {m.text && <p className="whitespace-pre-wrap">{m.text}</p>}
                      <p className={`mt-1 text-right text-[10px] ${isCustomer ? 'text-parchment/70' : 'text-ink/40'}`}>
                        {formatTime(m.createdAt)}
                      </p>
                    </div>
                    {isCustomer && (
                      <button
                        type="button"
                        onClick={() => setReplyingTo({ id: m.id, sender: m.sender, text: m.text })}
                        aria-label="Reply"
                        className="ml-1 flex-none self-center rounded-full p-1 text-ink/35 opacity-0 transition-opacity hover:bg-ink/5 group-hover:opacity-100"
                      >
                        <Reply size={12} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          ))
        )}
      </div>

      {isLocked ? (
        <div className="flex flex-col gap-2 border-t border-ink/10 bg-parchment p-3">
          <button
            type="button"
            onClick={login}
            className="rounded-full bg-teal-deep py-2.5 font-body text-sm font-semibold text-parchment transition-colors hover:bg-indigo-deep"
          >
            Log in to chat
          </button>
          <a
            href={getWhatsAppLink()}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-ink/15 py-2.5 text-center font-body text-sm font-semibold text-ink/70 transition-colors hover:bg-ink/[0.03]"
          >
            Continue on WhatsApp
          </a>
        </div>
      ) : (
        <div className="border-t border-ink/10 bg-parchment">
          {pendingFiles.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto px-3 pt-2.5">
              {pendingFiles.map((f, i) => (
                <div key={`${f.name}-${i}`} className="relative flex-none">
                  <div className="grid h-12 w-12 place-items-center rounded-lg border border-ink/10 bg-card text-[9px] text-ink/50">
                    {f.type.startsWith('video/') ? 'Video' : 'Image'}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))}
                    aria-label="Remove"
                    className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-ink text-white"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {fileError && <p className="px-3 pt-2 text-xs text-red-600">{fileError}</p>}
          {sendError && <p className="px-3 pt-2 text-xs text-red-600">{sendError}</p>}
          {replyingTo && (
            <div className="mx-3 mt-2.5 flex items-center gap-2 rounded-lg border-l-[3px] border-teal-deep bg-ink/5 px-2.5 py-1.5">
              <p className="flex-1 truncate text-xs text-ink/60">Replying: {replyingTo.text}</p>
              <button type="button" onClick={() => setReplyingTo(null)} aria-label="Cancel reply">
                <X size={13} className="text-ink/40" />
              </button>
            </div>
          )}
          <div className="flex items-center gap-2 p-2.5">
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
              className="grid h-9 w-9 flex-none place-items-center rounded-full text-ink/40 transition-colors hover:bg-ink/5 hover:text-ink/60"
            >
              <Paperclip size={17} />
            </button>
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
              disabled={sending || (!draft.trim() && pendingFiles.length === 0)}
              aria-label="Send message"
              className="grid h-10 w-10 flex-none place-items-center rounded-full bg-teal-deep text-parchment transition-colors hover:bg-indigo-deep disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}