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

export type ChatMessage = {
  id: string
  sender: 'customer' | 'ops'
  text: string
  createdAt: number
  requestId?: string | null
}

const STORAGE_PREFIX = 'wishdrop_platform_chat_v2'
const LAST_READ_PREFIX = 'wishdrop_platform_chat_last_read_v1'
const DISPLAY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000
const WHATSAPP_NUMBER = '94770000000'

export function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// Exported — the single-user useChat() hook uses these internally,
// but the ops/admin demo also needs to read and write OTHER
// customers' threads by id, which useChat() can't do since it's
// pinned to whoever is currently logged in on this tab.
export function storageKeyFor(userId: string) {
  return `${STORAGE_PREFIX}:${userId}`
}

export function lastReadKeyFor(userId: string) {
  return `${LAST_READ_PREFIX}:${userId}`
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
  const next = [...readAllMessages(userId), message]
  try {
    localStorage.setItem(storageKeyFor(userId), JSON.stringify(next))
  } catch {
    // Storage full/blocked — caller's own state still has the message,
    // it just won't persist or cross-tab sync.
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

interface ChatContextValue {
  isOpen: boolean
  openChat: () => void
  closeChat: () => void
  toggleChat: () => void
  messages: ChatMessage[]
  sendMessage: (text: string, requestId?: string | null) => void
  sendOpsMessage: (text: string, requestId?: string | null) => void
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

  // Prefer the customizable handle; fall back to deriving one from the
  // name if the account hasn't set one yet.
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
      setAllMessages((prev) => [...prev, message])
      appendMessage(message, userId)
    },
    [userId]
  )

  const sendMessage = useCallback(
    (text: string, requestId: string | null = null) => {
      const trimmed = text.trim()
      if (!trimmed || !userId) return
      appendAndSetLocal({
        id: uid(),
        sender: 'customer',
        text: trimmed,
        createdAt: Date.now(),
        requestId,
      })
    },
    [appendAndSetLocal, userId]
  )

  const sendOpsMessage = useCallback(
    (text: string, requestId: string | null = null) => {
      const trimmed = text.trim()
      if (!trimmed || !userId) return
      appendAndSetLocal({
        id: uid(),
        sender: 'ops',
        text: trimmed,
        createdAt: Date.now(),
        requestId,
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