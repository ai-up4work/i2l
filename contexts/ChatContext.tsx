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
  threadId: string
  sender: 'customer' | 'ops'
  text: string
  createdAt: number
}

export type ChatThread = {
  id: string
  title: string // e.g. the pasted link, or a short description
  link?: string
  status: 'pending_quote' | 'quoted' | 'closed'
  createdAt: number
  lastMessageAt: number
}

type ChatState = {
  threads: ChatThread[]
  messages: ChatMessage[]
}

const STORAGE_KEY = 'wishdrop_platform_chat'

// ── Storage layer ────────────────────────────────────────────────────
// PLACEHOLDER: localStorage only, so nothing here is visible to ops yet.
// Swap readState/writeState for real API calls (e.g. GET/POST
// /api/chat/threads, /api/chat/messages) once the backend exists — no
// component below needs to change when that happens, since they only
// ever talk to the context, never to storage directly.
function readState(): ChatState {
  if (typeof window === 'undefined') return { threads: [], messages: [] }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : { threads: [], messages: [] }
  } catch {
    return { threads: [], messages: [] }
  }
}

function writeState(state: ChatState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  window.dispatchEvent(new Event('wishdrop_chat_updated'))
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

interface ChatContextValue {
  isOpen: boolean
  openChat: () => void
  closeChat: () => void
  toggleChat: () => void

  threads: ChatThread[]
  messages: ChatMessage[]
  activeThreadId: string | null
  setActiveThreadId: (id: string | null) => void

  startThread: (input: { title: string; link?: string; firstMessage: string }) => string
  sendMessage: (threadId: string, text: string) => void

  unreadCount: number
  markThreadRead: (threadId: string) => void
}

const ChatContext = createContext<ChatContextValue | null>(null)

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [state, setState] = useState<ChatState>({ threads: [], messages: [] })
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [readThreadIds, setReadThreadIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    setState(readState())
    const sync = () => setState(readState())
    window.addEventListener('wishdrop_chat_updated', sync)
    return () => window.removeEventListener('wishdrop_chat_updated', sync)
  }, [])

  const persist = useCallback((next: ChatState) => {
    setState(next)
    writeState(next)
  }, [])

  const startThread = useCallback<ChatContextValue['startThread']>(
    ({ title, link, firstMessage }) => {
      const threadId = uid()
      const now = Date.now()
      const thread: ChatThread = {
        id: threadId,
        title,
        link,
        status: 'pending_quote',
        createdAt: now,
        lastMessageAt: now,
      }
      const message: ChatMessage = {
        id: uid(),
        threadId,
        sender: 'customer',
        text: firstMessage,
        createdAt: now,
      }
      persist({
        threads: [thread, ...state.threads],
        messages: [...state.messages, message],
      })
      setActiveThreadId(threadId)
      return threadId
    },
    [state, persist]
  )

  const sendMessage = useCallback<ChatContextValue['sendMessage']>(
    (threadId, text) => {
      const now = Date.now()
      const message: ChatMessage = {
        id: uid(),
        threadId,
        sender: 'customer',
        text,
        createdAt: now,
      }
      persist({
        threads: state.threads.map((t) =>
          t.id === threadId ? { ...t, lastMessageAt: now } : t
        ),
        messages: [...state.messages, message],
      })
    },
    [state, persist]
  )

  const markThreadRead = useCallback((threadId: string) => {
    setReadThreadIds((prev) => new Set(prev).add(threadId))
  }, [])

  const unreadCount = useMemo(() => {
    // Placeholder: with no ops backend yet, there are no incoming ops
    // messages to count. Wired up now so the badge on ChatButton is
    // correct the moment real ops replies start existing.
    return state.messages.filter(
      (m) => m.sender === 'ops' && !readThreadIds.has(m.threadId)
    ).length
  }, [state.messages, readThreadIds])

  const value: ChatContextValue = {
    isOpen,
    openChat: () => setIsOpen(true),
    closeChat: () => setIsOpen(false),
    toggleChat: () => setIsOpen((v) => !v),
    threads: state.threads,
    messages: state.messages,
    activeThreadId,
    setActiveThreadId,
    startThread,
    sendMessage,
    unreadCount,
    markThreadRead,
  }

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useChat() {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChat must be used within a ChatProvider')
  return ctx
}