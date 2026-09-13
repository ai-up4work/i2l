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
// Types (unchanged)
// ---------------------------------------------------------------------------

export type ProductVariant = {
  label: string
  value: string
}

export type WishlistProduct = {
  id: string
  url: string
  site?: string | null
  title: string
  image?: string | null
  currencyCode?: string | null
  price?: string | null
}

export type WishlistEntry = WishlistProduct & { addedAt: number }

export type BoardProduct = WishlistProduct & {
  variant?: ProductVariant | null
  quantity?: number
}

export type BoardItem = BoardProduct & {
  addedAt: number
  priceAtSave?: string | null
  position: number
}

export type BoardVisibility = 'private' | 'link' | 'public'

export type Board = {
  id: string
  name: string
  description?: string | null
  items: BoardItem[]
  visibility: BoardVisibility
  shareToken?: string | null
  createdAt: number
  updatedAt: number
  position: number
}

export type AddBoardToCartResult = {
  added: BoardItem[]
  skipped: BoardItem[]
}

type WishlistContextValue = {
  hydrated: boolean
  items: WishlistEntry[]
  count: number
  addItem: (product: WishlistProduct) => void
  removeItem: (id: string) => void
  toggleItem: (product: WishlistProduct) => void
  isInWishlist: (id: string) => boolean
  clearWishlist: () => void

  boards: Board[]
  createBoard: (name?: string, initialItems?: BoardProduct[]) => Board
  renameBoard: (boardId: string, name: string) => void
  updateBoardDescription: (boardId: string, description: string) => void
  deleteBoard: (boardId: string) => void
  duplicateBoard: (boardId: string, newName?: string) => Board | undefined
  reorderBoards: (orderedIds: string[]) => void
  getBoard: (boardId: string) => Board | undefined

  addItemToBoard: (boardId: string, product: BoardProduct) => void
  removeItemFromBoard: (boardId: string, itemId: string) => void
  moveItem: (fromBoardId: string, toBoardId: string, itemId: string) => void
  copyItemToBoard: (boardId: string, itemId: string, toBoardId: string) => void
  updateItemQuantity: (boardId: string, itemId: string, quantity: number) => void
  updateItemVariant: (boardId: string, itemId: string, variant: ProductVariant | null) => void
  reorderBoardItems: (boardId: string, orderedItemIds: string[]) => void
  isInBoard: (boardId: string, itemId: string) => boolean
  getBoardsForItem: (itemId: string) => Board[]

  setBoardVisibility: (boardId: string, visibility: BoardVisibility) => void
  generateShareLink: (boardId: string) => string
  revokeShareLink: (boardId: string) => void

  addBoardToCart: (
    boardId: string,
    addToCart: (item: BoardItem) => boolean | void,
  ) => AddBoardToCartResult
}

const WishlistContext = createContext<WishlistContextValue | null>(null)

// ---------------------------------------------------------------------------
// Persistence
//
// Two SEPARATE keys now, because the two halves of this context have
// different truth sources:
//
// - `wishdrop:wishlist-items` — GUEST-ONLY. A logged-in user's flat
//   wishlist lives solely in the `wishlist_items` table; nothing about it
//   is ever written to, or read back from, localStorage once logged in.
//
// - `wishdrop:wishlist-boards` — ALWAYS local, for every user, logged in
//   or not. Boards have no DB table wired up yet (see below), so there's
//   no "fetch from DB" option to fall back to — losing this on login/out
//   would mean losing all board data on every device switch. Because it's
//   still just sitting in the browser regardless of who's logged in, it
//   keeps its own account-switch wipe so User A's boards can't leak into
//   User B's session on a shared device.
// ---------------------------------------------------------------------------

const ITEMS_STORAGE_KEY = 'wishdrop:wishlist-items'
const BOARDS_STORAGE_KEY = 'wishdrop:wishlist-boards'

type PersistedBoardsShape = {
  boards: Board[]
  boardCounter: number
}

function loadInitialItems(): WishlistEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(ITEMS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function loadInitialBoards(): PersistedBoardsShape {
  if (typeof window === 'undefined') return { boards: [], boardCounter: 0 }
  try {
    const raw = window.localStorage.getItem(BOARDS_STORAGE_KEY)
    if (!raw) return { boards: [], boardCounter: 0 }
    const parsed = JSON.parse(raw)
    return {
      boards: Array.isArray(parsed.boards) ? parsed.boards : [],
      boardCounter: typeof parsed.boardCounter === 'number' ? parsed.boardCounter : 0,
    }
  } catch {
    return { boards: [], boardCounter: 0 }
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

  // Which user's DB wishlist is currently reflected in `items` (null =
  // no one yet / guest). Mirrors the same ref in CartContext.
  const loadedUserIdRef = useRef<string | null>(null)

  // Boards keep their own separate "whose boards are these" tracking,
  // since they follow the OLD local-only-with-account-switch-wipe model
  // regardless of login state.
  const loadedBoardsForUserRef = useRef<string | null | undefined>(undefined)

  // ---- initial hydration --------------------------------------------
  useEffect(() => {
    setItems(loadInitialItems())
    const initialBoards = loadInitialBoards()
    setBoards(initialBoards.boards)
    setBoardCounter(initialBoards.boardCounter)
    setHydrated(true)
  }, [])

  // ---- guest-only items persistence ----------------------------------
  useEffect(() => {
    if (!hydrated || user) return
    try {
      window.localStorage.setItem(ITEMS_STORAGE_KEY, JSON.stringify(items))
    } catch {
      // best-effort
    }
  }, [items, hydrated, user])

  // ---- boards persistence (always, regardless of login) -------------
  useEffect(() => {
    if (!hydrated) return
    try {
      const payload: PersistedBoardsShape = { boards, boardCounter }
      window.localStorage.setItem(BOARDS_STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // best-effort
    }
  }, [boards, boardCounter, hydrated])

  // ---- guest-only items cross-tab sync -------------------------------
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (user) return
      if (e.key !== ITEMS_STORAGE_KEY) return
      try {
        const parsed = e.newValue ? JSON.parse(e.newValue) : []
        setItems(Array.isArray(parsed) ? parsed : [])
      } catch {
        // ignore malformed cross-tab payloads
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [user])

  // ---- boards cross-tab sync (always) --------------------------------
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== BOARDS_STORAGE_KEY) return
      try {
        const parsed = e.newValue ? JSON.parse(e.newValue) : null
        if (!parsed) return
        if (Array.isArray(parsed.boards)) setBoards(parsed.boards)
        if (typeof parsed.boardCounter === 'number') setBoardCounter(parsed.boardCounter)
      } catch {
        // ignore malformed cross-tab payloads
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // ---- BOARDS: account-switch guard ----------------------------------
  // Boards have no DB backing, so this is the only thing standing between
  // "User A's boards" and "User B logs in on the same browser and sees
  // them". Kept from the original implementation, unchanged in spirit.
  useEffect(() => {
    if (authLoading || !hydrated) return
    const currentUserId = user?.id ?? null
    const isFirstRun = loadedBoardsForUserRef.current === undefined
    if (!isFirstRun && loadedBoardsForUserRef.current !== currentUserId) {
      setBoards([])
      setBoardCounter(0)
      try {
        window.localStorage.removeItem(BOARDS_STORAGE_KEY)
      } catch {
        // best-effort
      }
    }
    loadedBoardsForUserRef.current = currentUserId
  }, [user?.id, authLoading, hydrated])

  // ---- flat wishlist: Supabase sync ----------------------------------

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

  // Same guest<->logged-in load/merge pattern as CartContext.
  useEffect(() => {
    if (authLoading || !hydrated) return

    if (!user) {
      if (loadedUserIdRef.current !== null) {
        setItems(loadInitialItems())
      }
      loadedUserIdRef.current = null
      return
    }

    if (loadedUserIdRef.current === user.id) return

    let cancelled = false
    const guestItemsAtLogin = items

    ;(async () => {
      for (const entry of guestItemsAtLogin) {
        await pushItemToDb(entry, user.id)
      }
      if (guestItemsAtLogin.length) {
        try {
          window.localStorage.removeItem(ITEMS_STORAGE_KEY)
        } catch {
          // best-effort
        }
      }

      const { data, error } = await supabase
        .from('wishlist_items')
        .select('added_at, product_snapshots(url, site, title, image_url, currency, price)')
        .eq('user_id', user.id)

      if (cancelled) return

      if (error || !data) {
        loadedUserIdRef.current = user.id
        return
      }

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
      loadedUserIdRef.current = user.id
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

  // ---- boards: CRUD (unchanged — always local, see note above) ------

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