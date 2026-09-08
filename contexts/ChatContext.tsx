// contexts/ChatContext.tsx
'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

export type ChatMessage = {
  id: string
  sender: 'customer' | 'ops'
  text: string
  createdAt: number
  // null/undefined = general support message.
  // A string ties this message to a specific Channel 3 request record,
  // so Account → Requests (and the future ops console) can reconstruct
  // a per-request thread even though the customer sees one continuous
  // scrollback. Set on the first message of a failed-scrape flow, then
  // inherited by everything in that exchange.
  requestId?: string | null
}

const STORAGE_KEY = 'wishdrop_platform_chat_v2'
const LAST_READ_KEY = 'wishdrop_platform_chat_last_read_v1'

// Rolling display window per the requirements doc: full history stays
// in the database (localStorage here, standing in for it) indefinitely
// — never hard-deleted — but the UI only ever renders the last 30 days.
const DISPLAY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// ── Storage layer ────────────────────────────────────────────────────
// PLACEHOLDER: localStorage only, standing in for a real backend. This
// is the one place to change when moving to WebSocket: swap
// readAllMessages/appendMessage for a socket connection (connect on
// mount, push new messages in via the socket's onmessage handler
// instead of the 'storage' event below, and have sendMessage /
// sendOpsMessage emit over the socket instead of writing here). No
// component needs to change — they only ever call useChat().

function readAllMessages(): ChatMessage[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    // Corrupt or blocked storage — fail soft to an empty conversation
    // rather than throwing and blanking the whole provider.
    return []
  }
}

// Pure write, no side effects beyond the write itself — deliberately
// does NOT dispatch any custom event. Cross-tab sync is handled by the
// native `storage` event, which only ever fires in *other* tabs, so it
// can never race with the setMessages call that triggered this write.
function appendMessage(message: ChatMessage): ChatMessage[] {
  const next = [...readAllMessages(), message]
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage full/blocked (e.g. private browsing quota). The message
    // still lives in this tab's React state via setMessages, it just
    // won't persist across reloads or sync to other tabs.
  }
  return next
}

function readLastReadAt(): number {
  if (typeof window === 'undefined') return 0
  try {
    const raw = localStorage.getItem(LAST_READ_KEY)
    return raw ? Number(raw) || 0 : 0
  } catch {
    return 0
  }
}

function writeLastReadAt(ts: number) {
  try {
    localStorage.setItem(LAST_READ_KEY, String(ts))
  } catch {
    // Non-fatal — unread count just won't survive a reload this time.
  }
}

function withinDisplayWindow(messages: ChatMessage[]): ChatMessage[] {
  const cutoff = Date.now() - DISPLAY_WINDOW_MS
  return messages.filter((m) => m.createdAt >= cutoff)
}

interface ChatContextValue {
  isOpen: boolean
  openChat: () => void
  closeChat: () => void
  toggleChat: () => void

  // Already trimmed to the 30-day display window — components never
  // need to filter this themselves.
  messages: ChatMessage[]

  sendMessage: (text: string, requestId?: string | null) => void
  // Ops-side reply, kept on the same hook/storage so a demo admin
  // console can reuse it without a second context or backend.
  sendOpsMessage: (text: string, requestId?: string | null) => void

  unreadCount: number
  markRead: () => void
}

const ChatContext = createContext<ChatContextValue | null>(null)

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [allMessages, setAllMessages] = useState<ChatMessage[]>([])
  const [lastReadAt, setLastReadAt] = useState(0)

  // Initial load, once per mount.
  useEffect(() => {
    setAllMessages(readAllMessages())
    setLastReadAt(readLastReadAt())
  }, [])

  // Cross-tab sync only. `storage` never fires in the tab that made the
  // change, so this can't create the render-loop the custom-event
  // approach did — sending a message in this tab updates this tab's
  // state directly (see sendMessage/sendOpsMessage below), and other
  // open tabs pick it up here.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setAllMessages(readAllMessages())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const appendAndSetLocal = useCallback((message: ChatMessage) => {
    // Update this tab's state immediately (pure — no side effects in
    // the updater itself)...
    setAllMessages((prev) => [...prev, message])
    // ...then persist as a separate statement outside the updater, so
    // it can't fire during React's render/commit of the state update.
    appendMessage(message)
  }, [])

  const sendMessage = useCallback(
    (text: string, requestId: string | null = null) => {
      const trimmed = text.trim()
      if (!trimmed) return
      appendAndSetLocal({
        id: uid(),
        sender: 'customer',
        text: trimmed,
        createdAt: Date.now(),
        requestId,
      })
    },
    [appendAndSetLocal]
  )

  const sendOpsMessage = useCallback(
    (text: string, requestId: string | null = null) => {
      const trimmed = text.trim()
      if (!trimmed) return
      appendAndSetLocal({
        id: uid(),
        sender: 'ops',
        text: trimmed,
        createdAt: Date.now(),
        requestId,
      })
    },
    [appendAndSetLocal]
  )

  const markRead = useCallback(() => {
    const now = Date.now()
    setLastReadAt(now)
    writeLastReadAt(now)
  }, [])

  const messages = useMemo(() => withinDisplayWindow(allMessages), [allMessages])

  const unreadCount = useMemo(
    () => messages.filter((m) => m.sender === 'ops' && m.createdAt > lastReadAt).length,
    [messages, lastReadAt]
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
  }

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useChat() {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChat must be used within a ChatProvider')
  return ctx
}