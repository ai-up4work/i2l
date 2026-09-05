// contexts/Boardscontext.tsx
'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type BoardProduct = {
  id: string
  url: string
  site?: string | null
  title: string
  image?: string | null
  currencyCode?: string | null
  price?: string | null
}

export type BoardItem = BoardProduct & { addedAt: number }

export type Board = {
  id: string
  name: string
  items: BoardItem[]
  createdAt: number
}

type BoardsContextValue = {
  boards: Board[]
  /**
   * Creates a board (auto-named "Board N" if no name given), optionally
   * seeded with `initialItems`. Returns the board with its final resolved
   * name and items already populated.
   */
  createBoard: (name?: string, initialItems?: BoardProduct[]) => Board
  renameBoard: (boardId: string, name: string) => void
  deleteBoard: (boardId: string) => void
  getBoard: (boardId: string) => Board | undefined
  addItemToBoard: (boardId: string, product: BoardProduct) => void
  removeItemFromBoard: (boardId: string, itemId: string) => void
  isInBoard: (boardId: string, itemId: string) => boolean
}

const BoardsContext = createContext<BoardsContextValue | null>(null)

const STORAGE_KEY = 'wishdrop:boards'

function loadInitialBoards(): Board[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function makeBoardId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

// Monotonically increasing counter for default board names, so deleting a
// board and creating a new one never reuses a previous default label
// (e.g. "Board 1002" appearing twice with different ids).
const COUNTER_KEY = 'wishdrop:boards:counter'

function loadCounter(): number {
  if (typeof window === 'undefined') return 0
  try {
    const raw = window.localStorage.getItem(COUNTER_KEY)
    const n = raw ? parseInt(raw, 10) : 0
    return Number.isFinite(n) ? n : 0
  } catch {
    return 0
  }
}

export function BoardsProvider({ children }: { children: ReactNode }) {
  const [boards, setBoards] = useState<Board[]>(loadInitialBoards)
  const [hydrated, setHydrated] = useState(false)
  const [counter, setCounter] = useState(loadCounter)

  useEffect(() => {
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(boards))
    } catch {
      // Storage can fail (quota, private mode) — losing persistence isn't
      // worth crashing the boards feature over.
    }
  }, [boards, hydrated])

  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(COUNTER_KEY, String(counter))
    } catch {
      // same as above
    }
  }, [counter, hydrated])

  // Keep multiple tabs in sync for both boards and the naming counter.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) {
        try {
          const parsed = e.newValue ? JSON.parse(e.newValue) : []
          setBoards(Array.isArray(parsed) ? parsed : [])
        } catch {
          // ignore malformed cross-tab payloads
        }
      }
      if (e.key === COUNTER_KEY) {
        const n = e.newValue ? parseInt(e.newValue, 10) : 0
        if (Number.isFinite(n)) setCounter(n)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const createBoard = useCallback(
    (name?: string, initialItems: BoardProduct[] = []): Board => {
      const trimmed = name?.trim()

      let nextCounterValue = 0
      setCounter((prev) => {
        nextCounterValue = prev + 1
        return nextCounterValue
      })

      const now = Date.now()
      const board: Board = {
        id: makeBoardId(),
        name: trimmed || `Board ${1000 + nextCounterValue}`,
        items: initialItems.map((product) => ({ ...product, addedAt: now })),
        createdAt: now,
      }

      setBoards((prev) => [...prev, board])
      return board
    },
    [],
  )

  const renameBoard = useCallback((boardId: string, name: string) => {
    setBoards((prev) => prev.map((b) => (b.id === boardId ? { ...b, name } : b)))
  }, [])

  const deleteBoard = useCallback((boardId: string) => {
    setBoards((prev) => prev.filter((b) => b.id !== boardId))
  }, [])

  const getBoard = useCallback((boardId: string) => boards.find((b) => b.id === boardId), [boards])

  const addItemToBoard = useCallback((boardId: string, product: BoardProduct) => {
    setBoards((prev) =>
      prev.map((b) => {
        if (b.id !== boardId) return b
        if (b.items.some((item) => item.id === product.id)) return b
        return { ...b, items: [...b.items, { ...product, addedAt: Date.now() }] }
      }),
    )
  }, [])

  const removeItemFromBoard = useCallback((boardId: string, itemId: string) => {
    setBoards((prev) =>
      prev.map((b) => (b.id === boardId ? { ...b, items: b.items.filter((i) => i.id !== itemId) } : b)),
    )
  }, [])

  const isInBoard = useCallback(
    (boardId: string, itemId: string) => {
      const board = boards.find((b) => b.id === boardId)
      return board ? board.items.some((i) => i.id === itemId) : false
    },
    [boards],
  )

  const value = useMemo<BoardsContextValue>(
    () => ({
      boards,
      createBoard,
      renameBoard,
      deleteBoard,
      getBoard,
      addItemToBoard,
      removeItemFromBoard,
      isInBoard,
    }),
    [boards, createBoard, renameBoard, deleteBoard, getBoard, addItemToBoard, removeItemFromBoard, isInBoard],
  )

  return <BoardsContext.Provider value={value}>{children}</BoardsContext.Provider>
}

export function useBoards() {
  const ctx = useContext(BoardsContext)
  if (!ctx) throw new Error('useBoards must be used within a <BoardsProvider>')
  return ctx
}