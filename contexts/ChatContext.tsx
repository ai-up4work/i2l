'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { putAttachmentBlob } from '@/lib/chat/attachmentDb'

export type ChatAttachment = {
  id: string
  type: 'image' | 'video'
  // In-memory only. Populated right after a file is picked (object URL)
  // so the sender sees an instant preview. NEVER persisted — reload or
  // cross-tab reads get '' here and must resolve the blob from
  // IndexedDB (see AttachmentMedia / useAttachmentUrl).
  url: string
  name: string
}

export type ReplyPreview = {
  id: string
  sender: 'customer' | 'ops'
  text: string
  attachmentType?: 'image' | 'video' | null
}

export type ChatMessage = {
  id: string
  sender: 'customer' | 'ops'
  text: string
  createdAt: number
  requestId?: string | null
  attachments?: ChatAttachment[]
  replyTo?: ReplyPreview | null
}

const STORAGE_PREFIX = 'wishdrop_platform_chat_v2'
const LAST_READ_PREFIX = 'wishdrop_platform_chat_last_read_v1'
const DISPLAY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000
const WHATSAPP_NUMBER = '94770000000'

// Attachments themselves live in IndexedDB now (see lib/chat/attachmentDb.ts).
// This cap just guards against pathologically large picks.
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024 // 8MB

export function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function storageKeyFor(userId: string) {
  return `${STORAGE_PREFIX}:${userId}`
}

export function lastReadKeyFor(userId: string) {
  return `${LAST_READ_PREFIX}:${userId}`
}

// Strip in-memory attachment urls before writing to localStorage — only
// the IndexedDB pointer (id/type/name) should ever be persisted there.
function forStorage(message: ChatMessage): ChatMessage {
  if (!message.attachments || message.attachments.length === 0) return message
  return {
    ...message,
    attachments: message.attachments.map((a) => ({ ...a, url: '' })),
  }
}

export function readAllMessages(userId: string): ChatMessage[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(storageKeyFor(userId))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function appendMessage(message: ChatMessage, userId: string): ChatMessage[] {
  const next = [...readAllMessages(userId), forStorage(message)]
  try {
    localStorage.setItem(storageKeyFor(userId), JSON.stringify(next))
  } catch {
    // Storage full/blocked — caller's own state still has the message,
    // it just won't persist or cross-tab sync. Attachments themselves
    // are in IndexedDB regardless, so this is now just message text/metadata.
  }
  return next
}

function readLastReadAt(userId: string): number {
  if (typeof window === 'undefined') return 0
  try {
    const raw = localStorage.getItem(lastReadKeyFor(userId))
    return raw ? Number(raw) || 0 : 0
  } catch {
    return 0
  }
}

function writeLastReadAt(ts: number, userId: string) {
  try {
    localStorage.setItem(lastReadKeyFor(userId), String(ts))
  } catch {
    // Non-fatal.
  }
}

function withinDisplayWindow(messages: ChatMessage[]): ChatMessage[] {
  const cutoff = Date.now() - DISPLAY_WINDOW_MS
  return messages.filter((m) => m.createdAt >= cutoff)
}

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

// Snapshot a message into the compact quote shown above a reply.
export function toReplyPreview(message: ChatMessage): ReplyPreview {
  return {
    id: message.id,
    sender: message.sender,
    text: message.text.slice(0, 160),
    attachmentType: message.attachments?.[0]?.type ?? null,
  }
}

// File -> attachment. The blob is written straight to IndexedDB; only
// a lightweight pointer (id/type/name) plus a throwaway object URL for
// this session's own preview is kept in memory.
export function fileToAttachment(file: File): Promise<ChatAttachment> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      reject(new Error(`${file.name} is larger than 8MB`))
      return
    }
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      reject(new Error(`${file.name} isn't an image or video`))
      return
    }
    const type: ChatAttachment['type'] = file.type.startsWith('video/') ? 'video' : 'image'
    const id = uid()
    putAttachmentBlob({ id, type, name: file.name, blob: file, createdAt: Date.now() })
      .then(() => {
        resolve({ id, type, name: file.name, url: URL.createObjectURL(file) })
      })
      .catch((err) => reject(err instanceof Error ? err : new Error('Failed to store attachment')))
  })
}

type SendOptions = {
  requestId?: string | null
  replyTo?: ReplyPreview | null
  attachments?: ChatAttachment[]
}

// Old callers pass a plain requestId string/null as the 2nd arg; new
// callers pass an options object. Normalize so both keep working.
function normalizeSendArg(arg?: string | null | SendOptions): SendOptions {
  if (arg == null) return {}
  if (typeof arg === 'string') return { requestId: arg }
  return arg
}

interface ChatContextValue {
  isOpen: boolean
  openChat: () => void
  closeChat: () => void
  toggleChat: () => void
  messages: ChatMessage[]
  sendMessage: (text: string, options?: string | null | SendOptions) => void
  sendOpsMessage: (text: string, options?: string | null | SendOptions) => void
  unreadCount: number
  markRead: () => void
  isLocked: boolean
  handle: string | null
  getWhatsAppLink: (prefillText?: string) => string
}

const ChatContext = createContext<ChatContextValue | null>(null)

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth()
  const userId = user?.email ?? null

  const handle = user ? user.chatHandle ?? deriveHandle(user.name) : null

  const [isOpen, setIsOpen] = useState(false)
  const [allMessages, setAllMessages] = useState<ChatMessage[]>([])
  const [lastReadAt, setLastReadAt] = useState(0)

  useEffect(() => {
    if (!userId) {
      setAllMessages([])
      setLastReadAt(0)
      return
    }
    setAllMessages(readAllMessages(userId))
    setLastReadAt(readLastReadAt(userId))
  }, [userId])

  useEffect(() => {
    if (!userId) return
    const key = storageKeyFor(userId)
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) setAllMessages(readAllMessages(userId))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [userId])

  const appendAndSetLocal = useCallback(
    (message: ChatMessage) => {
      if (!userId) return
      // Keep the full (attachment-url-bearing) message in local state for
      // instant preview; only the persisted copy has urls stripped.
      setAllMessages((prev) => [...prev, message])
      appendMessage(message, userId)
    },
    [userId]
  )

  const sendMessage = useCallback(
    (text: string, arg?: string | null | SendOptions) => {
      const options = normalizeSendArg(arg)
      const trimmed = text.trim()
      const attachments = options.attachments ?? []
      if (!trimmed && attachments.length === 0) return
      if (!userId) return
      appendAndSetLocal({
        id: uid(),
        sender: 'customer',
        text: trimmed,
        createdAt: Date.now(),
        requestId: options.requestId ?? null,
        replyTo: options.replyTo ?? null,
        attachments,
      })
    },
    [appendAndSetLocal, userId]
  )

  const sendOpsMessage = useCallback(
    (text: string, arg?: string | null | SendOptions) => {
      const options = normalizeSendArg(arg)
      const trimmed = text.trim()
      const attachments = options.attachments ?? []
      if (!trimmed && attachments.length === 0) return
      if (!userId) return
      appendAndSetLocal({
        id: uid(),
        sender: 'ops',
        text: trimmed,
        createdAt: Date.now(),
        requestId: options.requestId ?? null,
        replyTo: options.replyTo ?? null,
        attachments,
      })
    },
    [appendAndSetLocal, userId]
  )

  const markRead = useCallback(() => {
    if (!userId) return
    const now = Date.now()
    setLastReadAt(now)
    writeLastReadAt(now, userId)
  }, [userId])

  const messages = useMemo(() => withinDisplayWindow(allMessages), [allMessages])

  const unreadCount = useMemo(
    () => messages.filter((m) => m.sender === 'ops' && m.createdAt > lastReadAt).length,
    [messages, lastReadAt]
  )

  const getWhatsAppLink = useCallback(
    (prefillText?: string) => buildWhatsAppLink(handle, prefillText),
    [handle]
  )

  const value: ChatContextValue = {
    isOpen,
    openChat: () => setIsOpen(true),
    closeChat: () => setIsOpen(false),
    toggleChat: () => setIsOpen((v) => !v),
    messages,
    sendMessage,
    sendOpsMessage,
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