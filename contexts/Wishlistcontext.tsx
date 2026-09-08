// contexts/Wishlistcontext.tsx
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A saved variant selection — size/color/whatever the product supports. */
export type ProductVariant = {
  label: string // e.g. "Size / Color"
  value: string // e.g. "M / Black"
}

/** Same idea as CartProduct — a small serializable snapshot, not the full scrape result. */
export type WishlistProduct = {
  /** Stable identity — use the listing URL, same convention as the cart. */
  id: string
  url: string
  site?: string | null
  title: string
  image?: string | null
  currencyCode?: string | null
  price?: string | null
}

export type WishlistEntry = WishlistProduct & { addedAt: number }

/** A product as saved inside a board — adds variant/qty/ordering on top of the base product. */
export type BoardProduct = WishlistProduct & {
  variant?: ProductVariant | null
  quantity?: number
}

export type BoardItem = BoardProduct & {
  addedAt: number
  /** Snapshot of price at the moment it was saved — compare to live price to detect drops. */
  priceAtSave?: string | null
  /** Sort position within the board (lower = earlier). Kept dense on every reorder. */
  position: number
}

export type BoardVisibility = 'private' | 'link' | 'public'

export type Board = {
  id: string
  name: string
  description?: string | null
  items: BoardItem[]
  visibility: BoardVisibility
  /** Opaque token used in shareable URLs. Only present once a share link has been generated. */
  shareToken?: string | null
  createdAt: number
  updatedAt: number
  /** Sort position among the user's boards (for drag-reordering the board list). */
  position: number
}

/** Result of pushing an entire board into the cart in one action. */
export type AddBoardToCartResult = {
  added: BoardItem[]
  skipped: BoardItem[]
}

type WishlistContextValue = {
  // ---- flat wishlist -------------------------------------------------
  items: WishlistEntry[]
  count: number
  addItem: (product: WishlistProduct) => void
  removeItem: (id: string) => void
  /** Adds if absent, removes if present — what a heart/save button wants. */
  toggleItem: (product: WishlistProduct) => void
  isInWishlist: (id: string) => boolean
  clearWishlist: () => void

  // ---- boards: CRUD ----------------------------------------------------
  boards: Board[]
  createBoard: (name?: string, initialItems?: BoardProduct[]) => Board
  renameBoard: (boardId: string, name: string) => void
  updateBoardDescription: (boardId: string, description: string) => void
  deleteBoard: (boardId: string) => void
  duplicateBoard: (boardId: string, newName?: string) => Board | undefined
  reorderBoards: (orderedIds: string[]) => void
  getBoard: (boardId: string) => Board | undefined

  // ---- boards: items -----------------------------------------------------
  addItemToBoard: (boardId: string, product: BoardProduct) => void
  removeItemFromBoard: (boardId: string, itemId: string) => void
  /** Moves an item out of one board and into another (not a copy). */
  moveItem: (fromBoardId: string, toBoardId: string, itemId: string) => void
  /** Adds the same item to another board without removing it from the first. */
  copyItemToBoard: (boardId: string, itemId: string, toBoardId: string) => void
  updateItemQuantity: (boardId: string, itemId: string, quantity: number) => void
  updateItemVariant: (boardId: string, itemId: string, variant: ProductVariant | null) => void
  /** Reorders items within a board — pass the full item-id order after a drag. */
  reorderBoardItems: (boardId: string, orderedItemIds: string[]) => void
  isInBoard: (boardId: string, itemId: string) => boolean
  /** Every board (name + id) that currently contains this item — for a multi-board picker UI. */
  getBoardsForItem: (itemId: string) => Board[]

  // ---- boards: sharing -----------------------------------------------------
  setBoardVisibility: (boardId: string, visibility: BoardVisibility) => void
  /** Generates (or returns the existing) share token and flips visibility to 'link'. */
  generateShareLink: (boardId: string) => string
  revokeShareLink: (boardId: string) => void

  // ---- boards: cart -----------------------------------------------------
  /**
   * Pushes every item in a board through `addToCart`. Items are only counted
   * as "skipped" if `addToCart` throws or returns false — the context itself
   * has no notion of stock/availability, that lives with the caller.
   */
  addBoardToCart: (
    boardId: string,
    addToCart: (item: BoardItem) => boolean | void,
  ) => AddBoardToCartResult
}

const WishlistContext = createContext<WishlistContextValue | null>(null)

// ---------------------------------------------------------------------------
// Persistence — one storage key for the whole feature (items + boards +
// naming counter), since they're always read/written together on load.
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'wishdrop:wishlist-data'

type PersistedShape = {
  items: WishlistEntry[]
  boards: Board[]
  boardCounter: number
}

function loadInitialState(): PersistedShape {
  if (typeof window === 'undefined') return { items: [], boards: [], boardCounter: 0 }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { items: [], boards: [], boardCounter: 0 }
    const parsed = JSON.parse(raw)
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      boards: Array.isArray(parsed.boards) ? parsed.boards : [],
      boardCounter: typeof parsed.boardCounter === 'number' ? parsed.boardCounter : 0,
    }
  } catch {
    return { items: [], boards: [], boardCounter: 0 }
  }
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function makeShareToken() {
  // Opaque, non-sequential — don't let people enumerate boards by guessing ids.
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10)
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function WishlistProvider({ children }: { children: ReactNode }) {
  const initial = loadInitialState()
  const [items, setItems] = useState<WishlistEntry[]>(initial.items)
  const [boards, setBoards] = useState<Board[]>(initial.boards)
  const [boardCounter, setBoardCounter] = useState(initial.boardCounter)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  // Persist on any change, once hydrated (avoids clobbering storage with the
  // SSR-time empty state before we've actually read it back).
  useEffect(() => {
    if (!hydrated) return
    try {
      const payload: PersistedShape = { items, boards, boardCounter }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // Storage can fail (quota, private mode) — losing persistence isn't
      // worth crashing the wishlist/boards feature over.
    }
  }, [items, boards, boardCounter, hydrated])

  // Keep multiple tabs in sync.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return
      try {
        const parsed = e.newValue ? JSON.parse(e.newValue) : null
        if (!parsed) return
        if (Array.isArray(parsed.items)) setItems(parsed.items)
        if (Array.isArray(parsed.boards)) setBoards(parsed.boards)
        if (typeof parsed.boardCounter === 'number') setBoardCounter(parsed.boardCounter)
      } catch {
        // ignore malformed cross-tab payloads
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // ---- flat wishlist -----------------------------------------------------

  const addItem = useCallback((product: WishlistProduct) => {
    setItems((prev) => {
      if (prev.some((entry) => entry.id === product.id)) return prev
      return [...prev, { ...product, addedAt: Date.now() }]
    })
  }, [])

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((entry) => entry.id !== id))
  }, [])

  const toggleItem = useCallback((product: WishlistProduct) => {
    setItems((prev) => {
      const exists = prev.some((entry) => entry.id === product.id)
      if (exists) return prev.filter((entry) => entry.id !== product.id)
      return [...prev, { ...product, addedAt: Date.now() }]
    })
  }, [])

  const isInWishlist = useCallback((id: string) => items.some((entry) => entry.id === id), [items])

  const clearWishlist = useCallback(() => setItems([]), [])

  // ---- boards: CRUD -----------------------------------------------------

  const createBoard = useCallback(
    (name?: string, initialItems: BoardProduct[] = []): Board => {
      const trimmed = name?.trim()
      const now = Date.now()

      let nextCounterValue = 0
      setBoardCounter((prev) => {
        nextCounterValue = prev + 1
        return nextCounterValue
      })

      const board: Board = {
        id: makeId('board'),
        name: trimmed || `Board ${1000 + nextCounterValue}`,
        description: null,
        visibility: 'private',
        shareToken: null,
        createdAt: now,
        updatedAt: now,
        position: boards.length,
        items: initialItems.map((product, index) => ({
          ...product,
          addedAt: now,
          priceAtSave: product.price ?? null,
          position: index,
        })),
      }

      setBoards((prev) => [...prev, board])
      return board
    },
    [boards.length],
  )

  const renameBoard = useCallback((boardId: string, name: string) => {
    setBoards((prev) =>
      prev.map((b) => (b.id === boardId ? { ...b, name, updatedAt: Date.now() } : b)),
    )
  }, [])

  const updateBoardDescription = useCallback((boardId: string, description: string) => {
    setBoards((prev) =>
      prev.map((b) => (b.id === boardId ? { ...b, description, updatedAt: Date.now() } : b)),
    )
  }, [])

  const deleteBoard = useCallback((boardId: string) => {
    setBoards((prev) => prev.filter((b) => b.id !== boardId))
  }, [])

  const duplicateBoard = useCallback(
    (boardId: string, newName?: string) => {
      const source = boards.find((b) => b.id === boardId)
      if (!source) return undefined

      const now = Date.now()
      const copy: Board = {
        ...source,
        id: makeId('board'),
        name: newName?.trim() || `${source.name} (Copy)`,
        shareToken: null,
        visibility: 'private',
        createdAt: now,
        updatedAt: now,
        position: boards.length,
        items: source.items.map((item) => ({ ...item, addedAt: now })),
      }
      setBoards((prev) => [...prev, copy])
      return copy
    },
    [boards],
  )

  const reorderBoards = useCallback((orderedIds: string[]) => {
    setBoards((prev) => {
      const byId = new Map(prev.map((b) => [b.id, b]))
      const reordered = orderedIds
        .map((id, index) => {
          const board = byId.get(id)
          return board ? { ...board, position: index } : null
        })
        .filter((b): b is Board => b !== null)

      // Any boards not mentioned (shouldn't normally happen) keep their
      // relative order, appended after the explicitly ordered ones.
      const remaining = prev.filter((b) => !orderedIds.includes(b.id))
      return [...reordered, ...remaining]
    })
  }, [])

  const getBoard = useCallback((boardId: string) => boards.find((b) => b.id === boardId), [boards])

  // ---- boards: items -----------------------------------------------------

  const addItemToBoard = useCallback((boardId: string, product: BoardProduct) => {
    setBoards((prev) =>
      prev.map((b) => {
        if (b.id !== boardId) return b
        if (b.items.some((item) => item.id === product.id)) return b
        const newItem: BoardItem = {
          ...product,
          addedAt: Date.now(),
          priceAtSave: product.price ?? null,
          position: b.items.length,
        }
        return { ...b, items: [...b.items, newItem], updatedAt: Date.now() }
      }),
    )
  }, [])

  const removeItemFromBoard = useCallback((boardId: string, itemId: string) => {
    setBoards((prev) =>
      prev.map((b) =>
        b.id === boardId
          ? { ...b, items: b.items.filter((i) => i.id !== itemId), updatedAt: Date.now() }
          : b,
      ),
    )
  }, [])

  const moveItem = useCallback((fromBoardId: string, toBoardId: string, itemId: string) => {
    if (fromBoardId === toBoardId) return
    setBoards((prev) => {
      const source = prev.find((b) => b.id === fromBoardId)
      const item = source?.items.find((i) => i.id === itemId)
      if (!item) return prev

      const now = Date.now()
      return prev.map((b) => {
        if (b.id === fromBoardId) {
          return { ...b, items: b.items.filter((i) => i.id !== itemId), updatedAt: now }
        }
        if (b.id === toBoardId) {
          if (b.items.some((i) => i.id === itemId)) return b // already there
          return {
            ...b,
            items: [...b.items, { ...item, position: b.items.length, addedAt: now }],
            updatedAt: now,
          }
        }
        return b
      })
    })
  }, [])

  const copyItemToBoard = useCallback((boardId: string, itemId: string, toBoardId: string) => {
    setBoards((prev) => {
      const source = prev.find((b) => b.id === boardId)
      const item = source?.items.find((i) => i.id === itemId)
      if (!item) return prev

      const now = Date.now()
      return prev.map((b) => {
        if (b.id !== toBoardId) return b
        if (b.items.some((i) => i.id === itemId)) return b // no duplicates within one board
        return {
          ...b,
          items: [...b.items, { ...item, position: b.items.length, addedAt: now }],
          updatedAt: now,
        }
      })
    })
  }, [])

  const updateItemQuantity = useCallback((boardId: string, itemId: string, quantity: number) => {
    const safeQty = Math.max(1, Math.floor(quantity) || 1)
    setBoards((prev) =>
      prev.map((b) =>
        b.id === boardId
          ? {
              ...b,
              items: b.items.map((i) => (i.id === itemId ? { ...i, quantity: safeQty } : i)),
              updatedAt: Date.now(),
            }
          : b,
      ),
    )
  }, [])

  const updateItemVariant = useCallback(
    (boardId: string, itemId: string, variant: ProductVariant | null) => {
      setBoards((prev) =>
        prev.map((b) =>
          b.id === boardId
            ? {
                ...b,
                items: b.items.map((i) => (i.id === itemId ? { ...i, variant } : i)),
                updatedAt: Date.now(),
              }
            : b,
        ),
      )
    },
    [],
  )

  const reorderBoardItems = useCallback((boardId: string, orderedItemIds: string[]) => {
    setBoards((prev) =>
      prev.map((b) => {
        if (b.id !== boardId) return b
        const byId = new Map(b.items.map((i) => [i.id, i]))
        const reordered = orderedItemIds
          .map((id, index) => {
            const item = byId.get(id)
            return item ? { ...item, position: index } : null
          })
          .filter((i): i is BoardItem => i !== null)
        const remaining = b.items.filter((i) => !orderedItemIds.includes(i.id))
        return { ...b, items: [...reordered, ...remaining], updatedAt: Date.now() }
      }),
    )
  }, [])

  const isInBoard = useCallback(
    (boardId: string, itemId: string) => {
      const board = boards.find((b) => b.id === boardId)
      return board ? board.items.some((i) => i.id === itemId) : false
    },
    [boards],
  )

  const getBoardsForItem = useCallback(
    (itemId: string) => boards.filter((b) => b.items.some((i) => i.id === itemId)),
    [boards],
  )

  // ---- boards: sharing -----------------------------------------------------

  const setBoardVisibility = useCallback((boardId: string, visibility: BoardVisibility) => {
    setBoards((prev) =>
      prev.map((b) => (b.id === boardId ? { ...b, visibility, updatedAt: Date.now() } : b)),
    )
  }, [])

  const generateShareLink = useCallback(
    (boardId: string): string => {
      const existing = boards.find((b) => b.id === boardId)
      if (existing?.shareToken) return existing.shareToken

      const token = makeShareToken()
      setBoards((prev) =>
        prev.map((b) =>
          b.id === boardId
            ? { ...b, shareToken: token, visibility: 'link', updatedAt: Date.now() }
            : b,
        ),
      )
      return token
    },
    [boards],
  )

  const revokeShareLink = useCallback((boardId: string) => {
    setBoards((prev) =>
      prev.map((b) =>
        b.id === boardId
          ? { ...b, shareToken: null, visibility: 'private', updatedAt: Date.now() }
          : b,
      ),
    )
  }, [])

  // ---- boards: cart -----------------------------------------------------

  const addBoardToCart = useCallback(
    (boardId: string, addToCart: (item: BoardItem) => boolean | void): AddBoardToCartResult => {
      const board = boards.find((b) => b.id === boardId)
      if (!board) return { added: [], skipped: [] }

      const added: BoardItem[] = []
      const skipped: BoardItem[] = []

      for (const item of board.items) {
        try {
          const result = addToCart(item)
          if (result === false) {
            skipped.push(item)
          } else {
            added.push(item)
          }
        } catch {
          skipped.push(item)
        }
      }

      return { added, skipped }
    },
    [boards],
  )

  // ---- context value -----------------------------------------------------

  const value = useMemo<WishlistContextValue>(
    () => ({
      items,
      count: items.length,
      addItem,
      removeItem,
      toggleItem,
      isInWishlist,
      clearWishlist,

      boards,
      createBoard,
      renameBoard,
      updateBoardDescription,
      deleteBoard,
      duplicateBoard,
      reorderBoards,
      getBoard,

      addItemToBoard,
      removeItemFromBoard,
      moveItem,
      copyItemToBoard,
      updateItemQuantity,
      updateItemVariant,
      reorderBoardItems,
      isInBoard,
      getBoardsForItem,

      setBoardVisibility,
      generateShareLink,
      revokeShareLink,

      addBoardToCart,
    }),
    [
      items,
      addItem,
      removeItem,
      toggleItem,
      isInWishlist,
      clearWishlist,
      boards,
      createBoard,
      renameBoard,
      updateBoardDescription,
      deleteBoard,
      duplicateBoard,
      reorderBoards,
      getBoard,
      addItemToBoard,
      removeItemFromBoard,
      moveItem,
      copyItemToBoard,
      updateItemQuantity,
      updateItemVariant,
      reorderBoardItems,
      isInBoard,
      getBoardsForItem,
      setBoardVisibility,
      generateShareLink,
      revokeShareLink,
      addBoardToCart,
    ],
  )

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>
}

export function useWishlist() {
  const ctx = useContext(WishlistContext)
  if (!ctx) throw new Error('useWishlist must be used within a <WishlistProvider>')
  return ctx
}