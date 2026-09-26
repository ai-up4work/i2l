// components/shared/ChatPanel.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Paperclip, Reply, Send, X } from 'lucide-react'
import { FaWhatsapp } from 'react-icons/fa'
import { useChat, type ChatMessage, type ReplyPreview } from '@/contexts/ChatContext'
import { useAuth } from '@/contexts/AuthContext'
import AttachmentMedia from '@/components/chat/AttachmentMedia'
import ChatOrderContextBar from '@/components/shared/Chatordercontextbar'

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
  const { isOpen, closeChat, messages, sending, sendError, sendMessage, markRead, isLocked, handle, getWhatsAppLink, hasMoreMessages, loadingMoreMessages, loadOlderMessages, orderChoicePending, allOrders, requestDisplayById } =
    useChat()
  const { login } = useAuth()
  const [draft, setDraft] = useState('')
  const [replyingTo, setReplyingTo] = useState<ReplyPreview | null>(null)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [fileError, setFileError] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
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

  // Jump to the most recent message whenever the panel is opened,
  // independent of the message-count effect above — covers the case
  // where the panel opens showing messages that were already loaded
  // (no change in messages.length to trigger that effect) but the
  // scroll container itself is a fresh mount sitting at the top.
  // A single scroll-to-bottom right after mount isn't enough on its
  // own: attachment thumbnails and other content can still be loading
  // and growing the list's height *after* that first scroll runs, which
  // leaves the panel appearing scrolled up from the true bottom. A
  // ResizeObserver keeps re-pinning to the bottom for a short settle
  // window (while the user hasn't scrolled away) so it reliably lands
  // on the latest message once everything's finished laying out.
  useEffect(() => {
    if (!isOpen) return
    const el = scrollRef.current
    if (!el) return

    let userScrolledAway = false
    const handleUserScroll = () => {
      // Bottom within ~24px still counts as "at the bottom" — anything
      // further up means the user is deliberately reading history and
      // the observer should stop overriding their scroll position.
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      if (distanceFromBottom > 24) userScrolledAway = true
    }

    const scrollToEnd = () => {
      if (isLoadingOlderRef.current || userScrolledAway) return
      el.scrollTop = el.scrollHeight
    }

    scrollToEnd()
    el.addEventListener('scroll', handleUserScroll)
    const observer = new ResizeObserver(scrollToEnd)
    observer.observe(el)
    const settleTimeout = setTimeout(() => observer.disconnect(), 800)

    return () => {
      observer.disconnect()
      clearTimeout(settleTimeout)
      el.removeEventListener('scroll', handleUserScroll)
    }
  }, [isOpen])

  // Close the panel when the user clicks/taps anywhere outside it.
  //
  // Two things count as "inside" and are ignored:
  //  1. the panel itself (panelRef), and
  //  2. the floating chat bubble (ChatButton marks itself with
  //     `data-chat-bubble`). Without this, pressing the bubble while the
  //     panel is open would close it here on pointerdown and then
  //     ChatButton's own toggleChat would re-open it on click.
  //
  // `pointerdown` covers mouse, touch and pen in one listener. This must
  // stay above the `if (!isOpen || hidden) return null` early return
  // below, since hooks can't be called after a conditional return.
  useEffect(() => {
    if (!isOpen || hidden) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (!target) return
      if (panelRef.current?.contains(target)) return
      if (target.closest('[data-chat-bubble]')) return
      closeChat()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isOpen, hidden, closeChat])

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
      ref={panelRef}
      className={`fixed z-80 flex flex-col overflow-hidden border border-ink/10 bg-parchment shadow-lift h-[40rem] w-[27rem] max-w-[calc(100vw-3rem)] rounded-3xl max-sm:!inset-x-0 max-sm:!top-[max(0.75rem,env(safe-area-inset-top))] max-sm:!bottom-0 max-sm:!h-auto max-sm:!w-auto max-sm:!max-w-none max-sm:!rounded-none max-sm:!border-0 ${positionClassName}`}
      role="dialog"
      aria-modal="true"
      aria-label="Chat with Wishdrop support"
    >
      <div className="flex items-center justify-between bg-indigo px-4 py-3.5">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-teal-deep text-parchment">
            <MessageCircle size={18} />
          </span>
          <div>
            <p className="font-display text-sm font-semibold text-parchment">Wishdrop Support</p>
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

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="nav-scroll flex-1 space-y-1 overflow-y-auto overflow-x-hidden bg-parchment p-3"
      >
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
                // Same problem the admin inbox already solves per-message
                // (see /admin/chat): with more than one order in flight, a
                // flat message list reading "your order is confirmed" /
                // "here's the tracking" with nothing to anchor them to a
                // specific order is genuinely ambiguous from the customer's
                // side too, not just the admin's.
                const orderTag = m.orderId ? allOrders.find((o) => o.dbId === m.orderId)?.id : null
                const requestTag = m.requestId ? requestDisplayById.get(m.requestId) : null

                // Reply button. Two things changed vs. the old version:
                //  - `hidden [@media(hover:hover)]:flex` — on touch devices
                //    (no hover) the button used to be opacity-0 but still
                //    occupied ~24px of layout beside every bubble, which
                //    squeezed the row and made the bubble sit unevenly
                //    against the edges. Now it only exists in layout on
                //    devices that can actually hover.
                //  - It's rendered once, positioned before/after the
                //    bubble via `order`, instead of two copies.
                const replyButton = (
                  <button
                    type="button"
                    onClick={() => setReplyingTo({ id: m.id, sender: m.sender, text: m.text })}
                    aria-label="Reply"
                    className={`hidden flex-none self-center rounded-full p-1 text-ink/35 opacity-0 transition-opacity hover:bg-ink/5 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:hover)]:flex ${
                      isCustomer ? 'ml-1' : 'mr-1'
                    }`}
                  >
                    <Reply size={12} />
                  </button>
                )

                return (
                  <div key={m.id} className={`group flex ${isCustomer ? 'justify-end' : 'justify-start'} py-0.5`}>
                    {!isCustomer && replyButton}
                    {/*
                      min-w-0 is required here: this is a flex item inside
                      the `group flex` row above. Flex items default to
                      min-width: auto, which lets their content refuse to
                      shrink below its intrinsic width — that can win out
                      over max-w-[80%] and break-words below when the
                      message text is one long unbroken token (e.g. a
                      pasted URL), letting the bubble grow past its cap
                      and get silently clipped by the scroll container's
                      overflow-x-hidden instead of wrapping.
                    */}
                    <div className={`max-w-[80%] min-w-0 ${isCustomer ? 'items-end' : 'items-start'} flex flex-col`}>
                      {(orderTag || requestTag) && (
                        <span
                          className={`mb-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            isCustomer ? 'self-end' : 'self-start'
                          } ${orderTag ? 'bg-teal/15 text-teal-deep' : 'bg-gold/20 text-gold-deep'}`}
                        >
                          {orderTag ?? requestTag}
                        </span>
                      )}
                      {/*
                        The bubble is itself a flex item (column flex parent
                        above), so the same min-width: auto problem applies
                        to it: an attachment's intrinsic width can force the
                        bubble wider than the 80% wrapper, and because the
                        row is right-aligned the overflow spills off the
                        LEFT edge where overflow-x-hidden clips it.
                        min-w-0 + max-w-full clamps the bubble to the wrapper,
                        and overflow-hidden keeps the media inside the
                        bubble's rounded corners.
                      */}
                      <div
                        className={`min-w-0 max-w-full overflow-hidden rounded-2xl px-3.5 py-2 font-body text-sm ${
                          isCustomer ? 'bg-teal-deep text-parchment' : 'bg-card text-ink border border-ink/10'
                        }`}
                      >
                        {m.replyTo && (
                          <div
                            className={`mb-1.5 rounded-lg border-l-[3px] px-2 py-1 text-xs break-words ${
                              isCustomer ? 'border-parchment/50 bg-black/10 text-parchment/80' : 'border-teal-deep bg-ink/5 text-ink/60'
                            }`}
                          >
                            {m.replyTo.text}
                          </div>
                        )}
                        {m.attachment && (
                          <div className="mb-1.5 min-w-0 max-w-full">
                            <AttachmentMedia
                              url={m.attachment.url}
                              kind={m.attachment.kind}
                              className="block max-h-56 w-full max-w-full rounded-lg object-cover"
                            />
                          </div>
                        )}
                        {/*
                          break-words (overflow-wrap: break-word) lets long
                          unbroken strings like pasted product URLs wrap
                          inside the bubble instead of forcing it wider than
                          max-w-[80%] and bleeding off the left edge under
                          the message list's overflow-x-hidden.
                        */}
                        {m.text && <p className="whitespace-pre-wrap break-words">{m.text}</p>}
                        <p className={`mt-1 text-right text-[10px] ${isCustomer ? 'text-parchment/70' : 'text-ink/40'}`}>
                          {formatTime(m.createdAt)}
                        </p>
                      </div>
                    </div>
                    {isCustomer && replyButton}
                  </div>
                )
              })}
            </div>
          ))
        )}
      </div>

      {isLocked ? (
        <div className="flex flex-col gap-2 border-t border-ink/10 bg-parchment p-3 max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
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
          <ChatOrderContextBar />
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
          <div className="flex items-center gap-2 p-2.5 max-sm:pb-[max(0.625rem,env(safe-area-inset-bottom))]">
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
              disabled={sending || orderChoicePending || (!draft.trim() && pendingFiles.length === 0)}
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