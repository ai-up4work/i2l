// app/account/messages/page.tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCheck,
  MessageCircle,
  Mic,
  Paperclip,
  Reply,
  Send,
  Smile,
  X,
} from 'lucide-react'
import { FaWhatsapp } from 'react-icons/fa'
import {
  type ChatAttachment,
  type ChatMessage,
  type ReplyPreview,
  appendMessage,
  fileToAttachment,
  toReplyPreview,
  uid,
  useChat,
} from '@/contexts/ChatContext'
import { useAuth } from '@/contexts/AuthContext'
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
 * Customer-facing "My Messages" section of the account area.
 *
 * MOBILE COMPOSER FIX: this page used to try to own a bounded,
 * device-viewport-sized panel (h-[100dvh] + its own internal
 * overflow-y-auto message list), on the assumption that it was mounted
 * at the true root of the screen. It isn't — app/account/layout.tsx
 * renders it inside <section>, BELOW the WelcomeBanner, and <section>
 * is itself the real scroll container (overflow-y-auto), already
 * correctly reserving space for MobileBottomNav via its own
 * paddingBottom. Stacking a self-claimed 100dvh box on top of the
 * banner inside that scroller made the total content taller than the
 * visible viewport by exactly the banner's height, so `section`
 * scrolled and dragged this page's sticky composer down below the
 * fold, behind the nav bar.
 *
 * Fix: this page no longer tries to create its own scroll region or
 * claim any explicit height. It just renders as normal content inside
 * `section`. The composer uses `sticky bottom-0`, which sticks to the
 * bottom of the nearest scrolling ancestor — `section` — automatically
 * clearing the bottom nav because `section`'s paddingBottom already
 * reserves that space. No guessing at viewport math, no dependency on
 * banner height, works correctly whether the banner is showing or not.
 */
export default function AccountMessagesPage() {
  const { messages, sendMessage, markRead, isLocked, handle, getWhatsAppLink } = useChat()
  const { login } = useAuth()

  const [draft, setDraft] = useState('')
  const [replyingTo, setReplyingTo] = useState<ReplyPreview | null>(null)
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([])
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [highlightedId, setHighlightedId] = useState<string | null>(null)

  const bottomSentinelRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const customerId = (handle ?? 'guest').replace(/^@/, '')

  useEffect(() => {
    if (!isLocked) markRead()
  }, [isLocked, markRead])

  // scrollIntoView finds whichever ancestor actually scrolls (section,
  // in this layout) on its own — no ref to a private scroll container
  // needed, unlike the old scrollRef.current.scrollTo() approach, which
  // assumed this component owned the scroller.
  useEffect(() => {
    bottomSentinelRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  const dateGroups = useMemo(() => groupByDate(messages as ChatMessage[]), [messages])

  const handleSend = () => {
    const trimmed = draft.trim()
    if (!trimmed && pendingAttachments.length === 0) return

    if (pendingAttachments.length > 0 || replyingTo) {
      const message: ChatMessage = {
        id: uid(),
        sender: 'customer',
        text: trimmed,
        createdAt: Date.now(),
        requestId: null,
        replyTo: replyingTo,
        attachments: pendingAttachments,
      }
      appendMessage(message, customerId)
    } else {
      sendMessage(trimmed)
    }

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

  const jumpToMessage = (id: string) => {
    const el = messageRefs.current[id]
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightedId(id)
    setTimeout(() => setHighlightedId((cur) => (cur === id ? null : cur)), 1200)
  }

  return (
    // No h-*, no overflow-hidden, no flex height tricks. This is just
    // normal-flow content inside the layout's <section>, which is the
    // actual scroll container. Sizing/scrolling is entirely delegated
    // to it — that's what makes the sticky composer below land in the
    // right place with zero knowledge of banner/header/nav heights.
    <div className="flex w-full flex-col bg-parchment px-8">
      {/* Sticky header — sticks to the top of `section`'s scrollport
          once scrolled past the banner. z-20 keeps it above message
          bubbles and the sticky composer's own z-10. */}
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

      {isLocked ? (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-6 text-center">
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
          {/* Message list — plain flow, no overflow-y-auto here anymore.
              `section` (the layout's real scroller) handles scrolling
              for the whole page, header included. */}
          <div className="space-y-1 py-4">
            {messages.length === 0 ? (
              <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-center">
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
                    const isHighlighted = highlightedId === m.id
                    return (
                      <div
                        key={m.id}
                        className={`group my-0.5 flex items-center gap-1.5 ${isMine ? 'justify-end' : 'justify-start'}`}
                      >
                        {isMine && (
                          <button
                            type="button"
                            onClick={() => setReplyingTo(toReplyPreview(m))}
                            aria-label="Reply"
                            className="flex-none rounded-full p-1.5 text-ink/30 opacity-0 transition-opacity hover:bg-ink/[0.05] hover:text-ink/60 group-hover:opacity-100"
                          >
                            <Reply size={14} />
                          </button>
                        )}

                        <div
                          ref={(el) => {
                            messageRefs.current[m.id] = el
                          }}
                          className={`max-w-[80%] rounded-2xl px-3.5 py-2 font-body text-sm transition-colors duration-500 sm:max-w-[60%] ${
                            isMine
                              ? 'bg-teal-deep text-parchment'
                              : 'bg-card text-ink border border-ink/10'
                          } ${isHighlighted ? 'ring-2 ring-teal-deep' : ''}`}
                        >
                          {m.replyTo && (
                            <button
                              type="button"
                              onClick={() => jumpToMessage(m.replyTo!.id)}
                              className={`mb-1.5 block w-full rounded-lg border-l-[3px] px-2 py-1 text-left ${
                                isMine
                                  ? 'border-parchment/50 bg-black/10'
                                  : 'border-teal-deep bg-ink/[0.04]'
                              }`}
                            >
                              <p
                                className={`text-[11.5px] font-semibold ${
                                  isMine ? 'text-parchment/90' : 'text-teal-deep'
                                }`}
                              >
                                {m.replyTo.sender === 'customer' ? 'You' : 'WishDrop Support'}
                              </p>
                              <p className={`truncate text-[11.5px] ${isMine ? 'text-parchment/70' : 'text-ink/50'}`}>
                                {m.replyTo.text ||
                                  (m.replyTo.attachmentType === 'video' ? '📹 Video' : '📷 Photo')}
                              </p>
                            </button>
                          )}

                          {m.attachments && m.attachments.length > 0 && (
                            <div
                              className={`mb-1.5 grid gap-1 ${
                                m.attachments.length > 1 ? 'grid-cols-2' : 'grid-cols-1'
                              }`}
                            >
                              {m.attachments.map((a) => (
                                <AttachmentMedia
                                  key={a.id}
                                  attachment={a}
                                  className="max-h-64 w-full rounded-lg object-cover"
                                />
                              ))}
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

                        {!isMine && (
                          <button
                            type="button"
                            onClick={() => setReplyingTo(toReplyPreview(m))}
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
            {/* Scroll target for "jump to latest message" — replaces the
                old scrollRef.current.scrollTo() call, which assumed this
                component owned a private scroll container. */}
            <div ref={bottomSentinelRef} />
          </div>

          {/* Sticky footer: attachment previews + reply preview + composer.
              `sticky bottom-0` sticks to the bottom of the nearest
              scrolling ancestor — `section`, from the layout — which
              already reserves MobileBottomNav's height via its own
              paddingBottom. No nav-height padding needed here anymore;
              duplicating it would double-count the clearance. -mx-8/px-8
              cancel this page's own side padding so the sticky bar's
              background spans edge-to-edge under the scrolling content. */}
          <div className="sticky bottom-0 z-10 -mx-8 bg-parchment px-8 pb-3">
            {pendingAttachments.length > 0 && (
              <div className="flex gap-2 overflow-x-auto border-t border-ink/10 pt-3">
                {pendingAttachments.map((a) => (
                  <div key={a.id} className="relative flex-none">
                    <AttachmentMedia attachment={a} className="h-16 w-16 rounded-lg object-cover" />
                    <button
                      type="button"
                      onClick={() => setPendingAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                      aria-label="Remove attachment"
                      className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-ink text-parchment"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {uploadError && <p className="border-t border-ink/10 pt-2 font-body text-xs text-red-600">{uploadError}</p>}

            {replyingTo && (
              <div className="flex items-center gap-2 border-t border-ink/10 pt-3">
                <div className="flex-1 rounded-lg border-l-[3px] border-teal-deep bg-ink/[0.04] px-3 py-1.5">
                  <p className="text-[12px] font-semibold text-teal-deep">
                    Replying to {replyingTo.sender === 'customer' ? 'yourself' : 'WishDrop Support'}
                  </p>
                  <p className="truncate text-xs text-ink/50">
                    {replyingTo.text || (replyingTo.attachmentType === 'video' ? '📹 Video' : '📷 Photo')}
                  </p>
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

            {/* Composer */}
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
              <button
                type="button"
                aria-label="Emoji"
                className="grid h-9 w-9 flex-none place-items-center rounded-full text-ink/40 transition-colors hover:bg-ink/[0.05] hover:text-ink/70"
              >
                <Smile size={18} />
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
                aria-label={draft.trim() || pendingAttachments.length ? 'Send message' : 'Record voice message'}
                className="grid h-10 w-10 flex-none place-items-center rounded-full bg-teal-deep text-parchment transition-colors hover:bg-indigo-deep"
              >
                {draft.trim() || pendingAttachments.length > 0 ? <Send size={15} /> : <Mic size={16} />}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}