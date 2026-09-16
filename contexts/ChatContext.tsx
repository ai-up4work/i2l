// contexts/ChatContext.tsx
'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { createClient } from '@/lib/supabase/client'
import {
  type ChatMessageRow,
  type ChatSender,
  buildReplyBody,
  getMostRecentOrGeneralThread,
  inferAttachmentKind,
  fetchThreadMessages,
  markThreadRead,
  parseReplyBody,
  sendChatMessage,
  subscribeToThreadMessages,
  uploadChatAttachment,
} from '@/lib/supabase/chat'

// Real UI-facing message shape. `attachment` is singular (one URL,
// matching chat_messages.attachment_url exactly) — see lib/supabase/chat.ts
// for why this replaced the old plural `attachments` array. `replyTo` is
// derived by parsing the stored quote prefix out of `text`, not a
// separate column — same file, same reasoning.
export type ChatAttachment = { url: string; kind: 'image' | 'video' }
export type ReplyPreview = { id: string; sender: ChatSender; text: string }
export type ChatMessage = {
  id: string
  sender: ChatSender
  text: string
  createdAt: number
  attachment: ChatAttachment | null
  replyTo: ReplyPreview | null
}

const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '94755354830' // fallback for dev

export function deriveHandle(name: string) {
  const first = name.trim().split(/\s+/)[0] ?? name
  return `@${first.toLowerCase()}`
}

export function buildWhatsAppLink(handle: string | null, prefillText?: string) {
  const text =
    prefillText ??
    (handle
      ? `Hi, this is ${handle} continuing from the WishDrop chat.`
      : `Hi, I'd like to talk to WishDrop support.`)
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`
}

function rowToMessage(row: ChatMessageRow): ChatMessage {
  const { quoted, text } = parseReplyBody(row.text ?? '')
  return {
    id: row.id,
    sender: row.sender as ChatSender,
    text,
    createdAt: new Date(row.created_at).getTime(),
    attachment: row.attachment_url ? { url: row.attachment_url, kind: inferAttachmentKind(row.attachment_url) } : null,
    replyTo: quoted ? { id: '', sender: row.sender === 'customer' ? 'ops' : 'customer', text: quoted } : null,
  }
}

// Purely a per-device "have I seen the latest ops reply" marker, NOT the
// conversation itself — that's entirely server-side now. Losing this key
// just means one stale unread badge on a new device, not lost messages.
function lastReadKey(threadId: string) {
  return `wishdrop:chat:lastReadAt:${threadId}`
}

function readLastReadAt(threadId: string): number {
  if (typeof window === 'undefined') return 0
  try {
    return Number(localStorage.getItem(lastReadKey(threadId))) || 0
  } catch {
    return 0
  }
}

function writeLastReadAt(threadId: string, ts: number) {
  try {
    localStorage.setItem(lastReadKey(threadId), String(ts))
  } catch {
    // non-fatal
  }
}



type SendOptions = {
  replyTo?: ReplyPreview | null
  files?: File[]
}

interface ChatContextValue {
  isOpen: boolean
  openChat: () => void
  closeChat: () => void
  toggleChat: () => void
  messages: ChatMessage[]
  sending: boolean
  sendError: string | null
  sendMessage: (text: string, options?: SendOptions) => Promise<void>
  unreadCount: number
  markRead: () => void
  isLocked: boolean
  handle: string | null
  getWhatsAppLink: (prefillText?: string) => string
}

const ChatContext = createContext<ChatContextValue | null>(null)

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth()
  const handle = user ? user.chatHandle ?? deriveHandle(user.name) : null

  const [isOpen, setIsOpen] = useState(false)
  const [threadId, setThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [lastReadAt, setLastReadAt] = useState(0)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const supabaseRef = useRef(createClient())

  // Resolve (or create) this customer's general support thread and load
  // its history once we know who's logged in.
  //
  // Keyed on `user?.id` (a primitive), not `user` (an object). If
  // useAuth()'s `user` isn't a stable reference across renders, keying
  // on the object itself re-fires this effect on every render — each
  // run re-hits resolveGeneralThreadId, which is what was spamming the
  // "multiple general threads" warning repeatedly for the same user.
  // Keying on the id avoids that regardless of upstream memoization.
  useEffect(() => {
    if (!user) {
      setThreadId(null)
      setMessages([])
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const id = await getMostRecentOrGeneralThread(supabaseRef.current, user.id)
        if (cancelled) return
        setThreadId(id)
        setLastReadAt(readLastReadAt(id))
        const rows = await fetchThreadMessages(supabaseRef.current, id)
        if (!cancelled) setMessages(rows.map(rowToMessage))
      } catch (err) {
        console.error('[chat] failed to load thread', err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  // Realtime: append anything new (from either side) that arrives while
  // this thread is open, deduping against our own optimistic inserts.
  useEffect(() => {
    if (!threadId) return
    const unsubscribe = subscribeToThreadMessages(supabaseRef.current, threadId, (row) => {
      setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, rowToMessage(row)]))
    })
    return unsubscribe
  }, [threadId])

  const sendMessage = useCallback(
    async (text: string, options?: SendOptions) => {
      const trimmed = text.trim()
      const files = options?.files ?? []
      if (!trimmed && files.length === 0) return
      if (!threadId || !user) return

      setSending(true)
      setSendError(null)
      try {
        const senderName = user.name
        const firstText = options?.replyTo ? buildReplyBody(options.replyTo.text, trimmed) : trimmed

        if (files.length === 0) {
          const row = await sendChatMessage(supabaseRef.current, {
            threadId,
            sender: 'customer',
            senderName,
            text: firstText,
          })
          setMessages((prev) => [...prev, rowToMessage(row)])
        } else {
          for (let i = 0; i < files.length; i++) {
            const url = await uploadChatAttachment(supabaseRef.current, threadId, files[i])
            const row = await sendChatMessage(supabaseRef.current, {
              threadId,
              sender: 'customer',
              senderName,
              text: i === 0 ? firstText : '',
              attachmentUrl: url,
            })
            setMessages((prev) => [...prev, rowToMessage(row)])
          }
        }
      } catch (err) {
        setSendError(err instanceof Error ? err.message : 'Failed to send. Please try again.')
      } finally {
        setSending(false)
      }
    },
    [threadId, user],
  )

  const markRead = useCallback(() => {
    if (!threadId) return
    const now = Date.now()
    setLastReadAt(now)
    writeLastReadAt(threadId, now)
    markThreadRead(supabaseRef.current, threadId).catch(() => {
      // Non-fatal — worst case the admin badge stays lit a bit longer.
    })
  }, [threadId])

  const unreadCount = useMemo(
    () => messages.filter((m) => m.sender === 'ops' && m.createdAt > lastReadAt).length,
    [messages, lastReadAt],
  )

  const getWhatsAppLink = useCallback((prefillText?: string) => buildWhatsAppLink(handle, prefillText), [handle])

  const value: ChatContextValue = {
    isOpen,
    openChat: () => setIsOpen(true),
    closeChat: () => setIsOpen(false),
    toggleChat: () => setIsOpen((v) => !v),
    messages,
    sending,
    sendError,
    sendMessage,
    unreadCount,
    markRead,
    isLocked: !isAuthenticated,
    handle,
    getWhatsAppLink,
  }

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useChat() {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChat must be used within a ChatProvider')
  return ctx
}