'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from './AuthContext'
import { createClient } from '@/lib/supabase/client'
import { ensureProductSnapshot, findSnapshotId } from '@/lib/supabase/product-snapshots'

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
  hydrated: boolean

  // ---- flat wishlist -------------------------------------------------
  items: WishlistEntry[]
  count: number
  addItem: (product: WishlistProduct) => void
  removeItem: (id: string) => void
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
  moveItem: (fromBoardId: string, toBoardId: string, itemId: string) => void
  copyItemToBoard: (boardId: string, itemId: string, toBoardId: string) => void
  updateItemQuantity: (boardId: string, itemId: string, quantity: number) => void
  updateItemVariant: (boardId: string, itemId: string, variant: ProductVariant | null) => void
  reorderBoardItems: (boardId: string, orderedItemIds: string[]) => void
  isInBoard: (boardId: string, itemId: string) => boolean
  getBoardsForItem: (itemId: string) => Board[]

  // ---- boards: sharing -----------------------------------------------------
  setBoardVisibility: (boardId: string, visibility: BoardVisibility) => void
  generateShareLink: (boardId: string) => string
  revokeShareLink: (boardId: string) => void

  // ---- boards: cart -----------------------------------------------------
  addBoardToCart: (
    boardId: string,
    addToCart: (item: BoardItem) => boolean | void,
  ) => AddBoardToCartResult
}

const WishlistContext = createContext<WishlistContextValue | null>(null)

// ---------------------------------------------------------------------------
// Persistence — one storage key for the whole feature (items + boards +
// naming counter), since they're always read/written together on load.
//
// NOTE ON SUPABASE SYNC: only the flat `items` list below is synced to the
// `wishlist_items` table for logged-in users. Boards (`boards` state) are
// NOT yet synced — they stay localStorage-only, matching how they already
// worked before. Boards need their own migration path (create/rename/
// delete/reorder/share-token generation all need server round-trips, and
// getting the share-link flow right needs its own pass) — flagged here
// rather than done partially/incorrectly. `board_items`/`boards` tables
// already exist in the schema and are ready for this when it's built.
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
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10)
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const supabase = useMemo(() => createClient(), [])

  const [items, setItems] = useState<WishlistEntry[]>([])
  const [boards, setBoards] = useState<Board[]>([])
  const [boardCounter, setBoardCounter] = useState(0)
  const [hydrated, setHydrated] = useState(false)
  const dbSyncedForUserId = useRef<string | null>(null)

  useEffect(() => {
    const initial = loadInitialState()
    setItems(initial.items)
    setBoards(initial.boards)
    setBoardCounter(initial.boardCounter)
    setHydrated(true)
  }, [])

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

  // ---- flat wishlist: Supabase sync --------------------------------------

  const pushItemToDb = useCallback(
    async (product: WishlistProduct, userId: string) => {
      try {
        const snapshotId = await ensureProductSnapshot(supabase, {
          id: product.id,
          title: product.title,
          image: product.image,
          currencyCode: product.currencyCode,
          price: product.price,
          site: product.site,
        })
        await supabase
          .from('wishlist_items')
          .upsert(
            { user_id: userId, product_snapshot_id: snapshotId },
            { onConflict: 'user_id,product_snapshot_id' },
          )
      } catch (err) {
        console.error('[wishlist] failed to sync item to db', err)
      }
    },
    [supabase],
  )

  const removeItemFromDb = useCallback(
    async (productId: string, userId: string) => {
      try {
        const snapshotId = await findSnapshotId(supabase, productId)
        if (!snapshotId) return
        await supabase
          .from('wishlist_items')
          .delete()
          .eq('user_id', userId)
          .eq('product_snapshot_id', snapshotId)
      } catch (err) {
        console.error('[wishlist] failed to remove item from db', err)
      }
    },
    [supabase],
  )

  // On login: push local (guest) wishlist items up, then replace local
  // state with the merged server-side list. Boards are intentionally left
  // untouched here — see the note above the storage-key section.
  useEffect(() => {
    if (authLoading || !hydrated) return
    if (!user) {
      dbSyncedForUserId.current = null
      return
    }
    if (dbSyncedForUserId.current === user.id) return
    dbSyncedForUserId.current = user.id

    let cancelled = false
    ;(async () => {
      for (const entry of items) {
        await pushItemToDb(entry, user.id)
      }

      const { data, error } = await supabase
        .from('wishlist_items')
        .select('added_at, product_snapshots(url, site, title, image_url, currency, price)')
        .eq('user_id', user.id)

      if (cancelled || error || !data) return

      const merged: WishlistEntry[] = data
        .filter((row: any) => row.product_snapshots?.url)
        .map((row: any) => ({
          id: row.product_snapshots.url,
          url: row.product_snapshots.url,
          site: row.product_snapshots.site,
          title: row.product_snapshots.title,
          image: row.product_snapshots.image_url,
          currencyCode: row.product_snapshots.currency,
          price: row.product_snapshots.price != null ? String(row.product_snapshots.price) : null,
          addedAt: new Date(row.added_at).getTime(),
        }))

      setItems(merged)
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, hydrated])

  const addItem = useCallback(
    (product: WishlistProduct) => {
      setItems((prev) => {
        if (prev.some((entry) => entry.id === product.id)) return prev
        return [...prev, { ...product, addedAt: Date.now() }]
      })
      if (user) pushItemToDb(product, user.id)
    },
    [user, pushItemToDb],
  )

  const removeItem = useCallback(
    (id: string) => {
      setItems((prev) => prev.filter((entry) => entry.id !== id))
      if (user) removeItemFromDb(id, user.id)
    },
    [user, removeItemFromDb],
  )

  const toggleItem = useCallback(
    (product: WishlistProduct) => {
      let added = false
      setItems((prev) => {
        const exists = prev.some((entry) => entry.id === product.id)
        if (exists) return prev.filter((entry) => entry.id !== product.id)
        added = true
        return [...prev, { ...product, addedAt: Date.now() }]
      })
      if (user) {
        if (added) pushItemToDb(product, user.id)
        else removeItemFromDb(product.id, user.id)
      }
    },
    [user, pushItemToDb, removeItemFromDb],
  )

  const isInWishlist = useCallback((id: string) => items.some((entry) => entry.id === id), [items])

  const clearWishlist = useCallback(() => {
    const idsToRemove = items.map((entry) => entry.id)
    setItems([])
    if (user) idsToRemove.forEach((id) => removeItemFromDb(id, user.id))
  }, [items, user, removeItemFromDb])

  // ---- boards: CRUD (unchanged — localStorage only, see note above) -----

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

      const remaining = prev.filter((b) => !orderedIds.includes(b.id))
      return [...reordered, ...remaining]
    })
  }, [])

  const getBoard = useCallback((boardId: string) => boards.find((b) => b.id === boardId), [boards])

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
          if (b.items.some((i) => i.id === itemId)) return b
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
        if (b.items.some((i) => i.id === itemId)) return b
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

  const value = useMemo<WishlistContextValue>(
    () => ({
      hydrated,
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
      hydrated,
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
