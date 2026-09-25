// app/account/messages/page.tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCheck, MessageCircle, Paperclip, Reply, Send, X } from 'lucide-react'
import { FaWhatsapp } from 'react-icons/fa'
import { useChat, type ChatMessage, type ReplyPreview } from '@/contexts/ChatContext'
import { useAuth } from '@/contexts/AuthContext'
import AttachmentMedia from '@/components/chat/AttachmentMedia'
import ChatOrderContextBar from '@/components/shared/Chatordercontextbar'
import PushOptIn from '@/components/pwa/PushOptIn'

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
  return d.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' })
}

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

/**
 * Customer-facing "My Messages" section of the account area — the
 * full-page counterpart to the floating ChatButton/ChatPanel widget.
 * Same thread, same ChatContext, just laid out for a full page instead
 * of a popup. See ChatPanel.tsx for the mobile-composer layout notes
 * this inherited (sticky footer, no owned scroll container — `section`
 * from app/account/layout.tsx is the real scroller).
 *
 * LAYOUT: app/account/layout.tsx makes that `section` a flex column, so
 * this page's root uses `flex-1` to fill all the height left under the
 * banner. The message list also uses `flex-1`, which soaks up the spare
 * space and pushes the composer to the bottom — even with 0 or 1
 * messages. Once messages overflow, the composer's `sticky bottom-0`
 * keeps it pinned while the section scrolls.
 *
 * Real data now: messages come from Supabase (chat_threads/chat_messages)
 * via ChatContext, not localStorage. Reply quoting is preserved as a
 * text convention (see lib/supabase/chat.ts's buildReplyBody) rather than
 * a real foreign key, so there's no "jump to the original message" left —
 * the quoted snippet is shown inline instead, which is what it actually is.
 */
export default function AccountMessagesPage() {
  const { messages, sending, sendError, sendMessage, markRead, isLocked, handle, getWhatsAppLink, hasMoreMessages, loadingMoreMessages, loadOlderMessages, orderChoicePending, allOrders, requestDisplayById } = useChat()
  const { login } = useAuth()

  const [draft, setDraft] = useState('')
  const [replyingTo, setReplyingTo] = useState<ReplyPreview | null>(null)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [fileError, setFileError] = useState<string | null>(null)

  const bottomSentinelRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isLoadingOlderRef = useRef(false)

  useEffect(() => {
    if (!isLocked) markRead()
  }, [isLocked, markRead])

  useEffect(() => {
    if (isLoadingOlderRef.current) return
    bottomSentinelRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  // Land on the latest message once the page loads, and keep re-landing
  // there for a short settle window — attachment thumbnails and other
  // content can still be loading right after mount, growing the page's
  // height *after* the effect above already scrolled, which leaves the
  // page looking scrolled up from the true bottom. Stops overriding as
  // soon as the user scrolls away on their own (e.g. to read history),
  // and skips entirely while an older-messages load is preserving its
  // own scroll position.
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return

    let userScrolledAway = false
    const handleUserScroll = () => {
      const distanceFromBottom = document.documentElement.scrollHeight - window.scrollY - window.innerHeight
      if (distanceFromBottom > 24) userScrolledAway = true
    }

    const scrollToEnd = () => {
      if (userScrolledAway || isLoadingOlderRef.current) return
      bottomSentinelRef.current?.scrollIntoView({ block: 'end' })
    }

    scrollToEnd()
    window.addEventListener('scroll', handleUserScroll)
    const observer = new ResizeObserver(scrollToEnd)
    observer.observe(container)
    const settleTimeout = setTimeout(() => observer.disconnect(), 800)

    return () => {
      observer.disconnect()
      clearTimeout(settleTimeout)
      window.removeEventListener('scroll', handleUserScroll)
    }
  }, [])

  const dateGroups = useMemo(() => groupByDate(messages), [messages])

  // Page-level scroll (not a bounded container like the floating
  // ChatPanel), so "keep the same messages in view after prepending" is
  // done against document height instead of a local div's scrollTop.
  const handleLoadOlder = async () => {
    isLoadingOlderRef.current = true
    const prevHeight = document.documentElement.scrollHeight
    await loadOlderMessages()
    requestAnimationFrame(() => {
      const newHeight = document.documentElement.scrollHeight
      window.scrollTo({ top: window.scrollY + (newHeight - prevHeight) })
      isLoadingOlderRef.current = false
    })
  }

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

  return (
    // `flex-1` (not `min-h-full`) — the parent section is a flex column,
    // so this stretches to fill the space under the banner.
    <div className="flex w-full flex-1 flex-col bg-parchment px-8">
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-ink/10 bg-parchment pb-4 pt-6">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-teal-deep text-parchment">
            <MessageCircle size={18} />
          </span>
          <div>
            <h1 className="font-display text-lg font-semibold text-ink">My Messages</h1>
            <p className="font-body text-xs text-ink/50">
              {handle ? `Chatting as ${handle}` : 'Usually replies within a few hours'}
            </p>
          </div>
        </div>
        <a
          href={getWhatsAppLink()}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Continue on WhatsApp"
          title="Continue on WhatsApp"
          className="rounded-full p-2 text-ink/40 transition-colors hover:bg-ink/[0.05] hover:text-teal-deep"
        >
          <FaWhatsapp size={18} />
        </a>
      </div>

      {/* Ask for notifications here, where "tell me when they reply" is
          obviously useful. Renders nothing once on, blocked, or dismissed. */}
      {!isLocked && <PushOptIn className="mt-4" />}

      {isLocked ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <MessageCircle size={32} className="text-ink/20" strokeWidth={1.4} />
          <p className="font-body text-sm text-ink/50">
            Sign in to chat with us — or continue the conversation on WhatsApp instead.
          </p>
          <button
            type="button"
            onClick={login}
            className="rounded-full bg-teal-deep px-6 py-2 font-body text-sm font-semibold text-parchment transition-colors hover:bg-indigo-deep"
          >
            Log in to chat
          </button>
          <a
            href={getWhatsAppLink()}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-ink/15 px-6 py-2 font-body text-sm font-semibold text-ink/70 transition-colors hover:bg-ink/[0.03]"
          >
            Continue on WhatsApp
          </a>
        </div>
      ) : (
        <>
          {/* flex-1 = takes every spare pixel between the header and the
              composer, which is what pins the composer to the bottom.
              It's also a flex column so the empty state can fill it. */}
          <div ref={messagesContainerRef} className="flex flex-1 flex-col space-y-1 py-4">
            {hasMoreMessages && messages.length > 0 && (
              <div className="flex justify-center pb-3">
                {loadingMoreMessages ? (
                  <span className="text-xs text-ink/35">Loading older messages…</span>
                ) : (
                  <button
                    type="button"
                    onClick={handleLoadOlder}
                    className="text-xs font-semibold text-teal-deep hover:underline"
                  >
                    Load older messages
                  </button>
                )}
              </div>
            )}
            {messages.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
                <MessageCircle size={28} className="text-ink/20" strokeWidth={1.4} />
                <p className="font-body text-sm text-ink/50">
                  Send us a message, or paste a product link — we'll take it from there.
                </p>
              </div>
            ) : (
              dateGroups.map((group) => (
                <div key={group.label}>
                  <div className="my-3 flex justify-center">
                    <span className="rounded-full bg-ink/[0.05] px-3 py-1 font-body text-[10px] font-semibold uppercase tracking-wide text-ink/40">
                      {group.label}
                    </span>
                  </div>
                  {group.messages.map((m) => {
                    const isMine = m.sender === 'customer'
                    // Same per-message context problem/fix as ChatPanel.tsx —
                    // see its own comment for why this matters here too.
                    const orderTag = m.orderId ? allOrders.find((o) => o.dbId === m.orderId)?.id : null
                    const requestTag = m.requestId ? requestDisplayById.get(m.requestId) : null
                    return (
                      <div key={m.id} className={`group my-0.5 flex items-center gap-1.5 ${isMine ? 'justify-end' : 'justify-start'}`}>
                        {isMine && (
                          <button
                            type="button"
                            onClick={() => setReplyingTo({ id: m.id, sender: m.sender, text: m.text })}
                            aria-label="Reply"
                            className="flex-none rounded-full p-1.5 text-ink/30 opacity-0 transition-opacity hover:bg-ink/[0.05] hover:text-ink/60 group-hover:opacity-100"
                          >
                            <Reply size={14} />
                          </button>
                        )}

                        <div className={`flex max-w-[80%] flex-col sm:max-w-[60%] ${isMine ? 'items-end' : 'items-start'}`}>
                        {(orderTag || requestTag) && (
                          <span
                            className={`mb-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              orderTag ? 'bg-teal/15 text-teal-deep' : 'bg-gold/20 text-gold-deep'
                            }`}
                          >
                            {orderTag ?? requestTag}
                          </span>
                        )}
                        <div
                          className={`w-full rounded-2xl px-3.5 py-2 font-body text-sm ${
                            isMine ? 'bg-teal-deep text-parchment' : 'bg-card text-ink border border-ink/10'
                          }`}
                        >
                          {m.replyTo && (
                            <div
                              className={`mb-1.5 rounded-lg border-l-[3px] px-2 py-1 ${
                                isMine ? 'border-parchment/50 bg-black/10' : 'border-teal-deep bg-ink/[0.04]'
                              }`}
                            >
                              <p className={`text-[11.5px] font-semibold ${isMine ? 'text-parchment/90' : 'text-teal-deep'}`}>
                                {m.replyTo.sender === 'customer' ? 'You' : 'WishDrop Support'}
                              </p>
                              <p className={`truncate text-[11.5px] ${isMine ? 'text-parchment/70' : 'text-ink/50'}`}>
                                {m.replyTo.text}
                              </p>
                            </div>
                          )}

                          {m.attachment && (
                            <div className="mb-1.5">
                              <AttachmentMedia
                                url={m.attachment.url}
                                kind={m.attachment.kind}
                                className="max-h-64 w-full rounded-lg object-cover"
                              />
                            </div>
                          )}

                          {m.text && <p className="whitespace-pre-wrap break-words">{m.text}</p>}

                          <div className="mt-1 flex items-center justify-end gap-1">
                            <span className={`text-[10px] ${isMine ? 'text-parchment/70' : 'text-ink/40'}`}>
                              {formatTime(m.createdAt)}
                            </span>
                            {isMine && <CheckCheck size={13} className="text-parchment/70" />}
                          </div>
                        </div>
                        </div>

                        {!isMine && (
                          <button
                            type="button"
                            onClick={() => setReplyingTo({ id: m.id, sender: m.sender, text: m.text })}
                            aria-label="Reply"
                            className="flex-none rounded-full p-1.5 text-ink/30 opacity-0 transition-opacity hover:bg-ink/[0.05] hover:text-ink/60 group-hover:opacity-100"
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
            <div ref={bottomSentinelRef} />
          </div>

          {/* Composer: sits at the bottom of the (now full-height) page
              root, and `sticky bottom-0` keeps it pinned once messages
              overflow and the section starts scrolling. `shrink-0` so it
              is never squeezed by the flex-1 message list. */}
          <div className="sticky bottom-0 z-10 -mx-8 shrink-0 bg-parchment px-8 pb-1">
            <ChatOrderContextBar className="mt-2.5" />
            {pendingFiles.length > 0 && (
              <div className="flex gap-2 overflow-x-auto border-t border-ink/10 pt-3">
                {pendingFiles.map((f, i) => (
                  <div key={`${f.name}-${i}`} className="relative flex-none">
                    <div className="grid h-16 w-16 place-items-center rounded-lg border border-ink/10 bg-card text-[10px] text-ink/50">
                      {f.type.startsWith('video/') ? 'Video' : 'Image'}
                    </div>
                    <button
                      type="button"
                      onClick={() => setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))}
                      aria-label="Remove attachment"
                      className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-ink text-parchment"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {fileError && <p className="border-t border-ink/10 pt-2 font-body text-xs text-red-600">{fileError}</p>}
            {sendError && <p className="border-t border-ink/10 pt-2 font-body text-xs text-red-600">{sendError}</p>}

            {replyingTo && (
              <div className="flex items-center gap-2 border-t border-ink/10 pt-3">
                <div className="flex-1 rounded-lg border-l-[3px] border-teal-deep bg-ink/[0.04] px-3 py-1.5">
                  <p className="text-[12px] font-semibold text-teal-deep">
                    Replying to {replyingTo.sender === 'customer' ? 'yourself' : 'WishDrop Support'}
                  </p>
                  <p className="truncate text-xs text-ink/50">{replyingTo.text}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyingTo(null)}
                  aria-label="Cancel reply"
                  className="flex-none rounded-full p-1.5 text-ink/40 hover:bg-ink/[0.05]"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            <div className="flex items-center gap-2 border-t border-ink/10 py-3">
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
                className="grid h-9 w-9 flex-none place-items-center rounded-full text-ink/40 transition-colors hover:bg-ink/[0.05] hover:text-ink/70"
              >
                <Paperclip size={18} className="rotate-[-45deg]" />
              </button>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Type a message, or paste a link..."
                className="flex-1 rounded-full border border-ink/15 bg-card px-4 py-2.5 font-body text-sm text-ink placeholder:text-ink/35 focus:border-teal-deep focus:outline-none focus:ring-2 focus:ring-teal/20"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || orderChoicePending || (!draft.trim() && pendingFiles.length === 0)}
                aria-label="Send message"
                className="grid h-10 w-10 flex-none place-items-center rounded-full bg-teal-deep text-parchment transition-colors hover:bg-indigo-deep disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send size={15} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}