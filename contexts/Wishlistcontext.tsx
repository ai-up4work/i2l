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
// Persistence — GUEST-ONLY for both items and boards now. Boards are backed
// by `boards` / `board_items` in Supabase (RLS already in place), so they
// follow the exact same guest<->logged-in lifecycle as the flat wishlist and
// cart: localStorage while logged out, DB while logged in, merged once on
// login.
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

// Boards need a real uuid now (they're a Postgres `uuid` primary key), not
// the old "board-<timestamp>-<rand>" shorthand. Generated client-side so
// createBoard can still return a usable id synchronously, before the DB
// write resolves.
function makeBoardId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
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

  // Which user's DB wishlist/boards are currently reflected in state.
  const loadedItemsUserIdRef = useRef<string | null>(null)
  const loadedBoardsUserIdRef = useRef<string | null>(null)

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

  // ---- guest-only boards persistence ----------------------------------
  useEffect(() => {
    if (!hydrated || user) return
    try {
      const payload: PersistedBoardsShape = { boards, boardCounter }
      window.localStorage.setItem(BOARDS_STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // best-effort
    }
  }, [boards, boardCounter, hydrated, user])

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

  // ---- guest-only boards cross-tab sync -------------------------------
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (user) return
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
  }, [user])

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

  useEffect(() => {
    if (authLoading || !hydrated) return

    if (!user) {
      if (loadedItemsUserIdRef.current !== null) {
        setItems(loadInitialItems())
      }
      loadedItemsUserIdRef.current = null
      return
    }

    if (loadedItemsUserIdRef.current === user.id) return

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
        loadedItemsUserIdRef.current = user.id
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
      loadedItemsUserIdRef.current = user.id
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

  // ---- boards: Supabase sync ------------------------------------------

  const pushBoardToDb = useCallback(
    async (board: Board, userId: string) => {
      try {
        await supabase.from('boards').upsert(
          {
            id: board.id,
            user_id: userId,
            name: board.name,
            description: board.description ?? null,
            visibility: board.visibility,
            share_token: board.shareToken ?? null,
            position: board.position,
          },
          { onConflict: 'id' },
        )
      } catch (err) {
        console.error('[wishlist] failed to sync board to db', err)
      }
    },
    [supabase],
  )

  const updateBoardFieldsInDb = useCallback(
    async (
      boardId: string,
      fields: {
        name?: string
        description?: string | null
        visibility?: string
        share_token?: string | null
        position?: number
      },
    ) => {
      try {
        await supabase.from('boards').update(fields).eq('id', boardId)
      } catch (err) {
        console.error('[wishlist] failed to update board in db', err)
      }
    },
    [supabase],
  )

  const removeBoardFromDb = useCallback(
    async (boardId: string) => {
      try {
        // Explicit child-first delete rather than relying on an assumed
        // ON DELETE CASCADE that may not exist on this FK.
        await supabase.from('board_items').delete().eq('board_id', boardId)
        await supabase.from('boards').delete().eq('id', boardId)
      } catch (err) {
        console.error('[wishlist] failed to remove board from db', err)
      }
    },
    [supabase],
  )

  const pushBoardItemToDb = useCallback(
    async (boardId: string, item: BoardItem, userId: string) => {
      try {
        const snapshotId = await ensureProductSnapshot(supabase, {
          id: item.id,
          title: item.title,
          image: item.image,
          currencyCode: item.currencyCode,
          price: item.price,
          site: item.site,
        })
        await supabase.from('board_items').upsert(
          {
            board_id: boardId,
            product_snapshot_id: snapshotId,
            variant: item.variant ?? null,
            quantity: item.quantity ?? 1,
            price_at_save:
              item.priceAtSave == null ? null : Number(item.priceAtSave),
            position: item.position,
          },
          { onConflict: 'board_id,product_snapshot_id' },
        )
      } catch (err) {
        console.error('[wishlist] failed to sync board item to db', err)
      }
      // userId currently unused directly (ownership enforced via RLS through
      // board_id -> boards.user_id) but kept in the signature for parity
      // with the cart/wishlist push functions and in case per-user logic
      // is needed later.
      void userId
    },
    [supabase],
  )

  const removeBoardItemFromDb = useCallback(
    async (boardId: string, itemId: string) => {
      try {
        const snapshotId = await findSnapshotId(supabase, itemId)
        if (!snapshotId) return
        await supabase
          .from('board_items')
          .delete()
          .eq('board_id', boardId)
          .eq('product_snapshot_id', snapshotId)
      } catch (err) {
        console.error('[wishlist] failed to remove board item from db', err)
      }
    },
    [supabase],
  )

  // Guest -> logged-in merge (push local boards up, then load DB boards as
  // truth) / logged-in -> logged-out fallback (revert to localStorage).
  // Mirrors the flat-wishlist effect above.
  useEffect(() => {
    if (authLoading || !hydrated) return

    if (!user) {
      if (loadedBoardsUserIdRef.current !== null) {
        const local = loadInitialBoards()
        setBoards(local.boards)
        setBoardCounter(local.boardCounter)
      }
      loadedBoardsUserIdRef.current = null
      return
    }

    if (loadedBoardsUserIdRef.current === user.id) return

    let cancelled = false
    const guestBoardsAtLogin = boards

    ;(async () => {
      for (const board of guestBoardsAtLogin) {
        await pushBoardToDb(board, user.id)
        for (const item of board.items) {
          await pushBoardItemToDb(board.id, item, user.id)
        }
      }
      if (guestBoardsAtLogin.length) {
        try {
          window.localStorage.removeItem(BOARDS_STORAGE_KEY)
        } catch {
          // best-effort
        }
      }

      const { data, error } = await supabase
        .from('boards')
        .select(
          'id, name, description, visibility, share_token, position, created_at, updated_at, board_items(product_snapshot_id, variant, quantity, price_at_save, position, added_at, product_snapshots(url, site, title, image_url, currency, price))',
        )
        .eq('user_id', user.id)

      if (cancelled) return

      if (error || !data) {
        loadedBoardsUserIdRef.current = user.id
        return
      }

      const merged: Board[] = data.map((row: any) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        visibility: row.visibility,
        shareToken: row.share_token,
        createdAt: new Date(row.created_at).getTime(),
        updatedAt: new Date(row.updated_at).getTime(),
        position: row.position,
        items: (row.board_items ?? [])
          .filter((bi: any) => bi.product_snapshots?.url)
          .map((bi: any) => ({
            id: bi.product_snapshots.url,
            url: bi.product_snapshots.url,
            site: bi.product_snapshots.site,
            title: bi.product_snapshots.title,
            image: bi.product_snapshots.image_url,
            currencyCode: bi.product_snapshots.currency,
            price: bi.product_snapshots.price != null ? String(bi.product_snapshots.price) : null,
            variant: bi.variant ?? null,
            quantity: bi.quantity,
            priceAtSave: bi.price_at_save != null ? String(bi.price_at_save) : null,
            position: bi.position,
            addedAt: new Date(bi.added_at).getTime(),
          })),
      }))

      setBoards(merged)
      loadedBoardsUserIdRef.current = user.id
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, hydrated])

  // ---- boards: CRUD (local-first, syncs to db when logged in) --------

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
        id: makeBoardId(),
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

      if (user) {
        pushBoardToDb(board, user.id)
        board.items.forEach((item) => pushBoardItemToDb(board.id, item, user.id))
      }

      return board
    },
    [boards.length, user, pushBoardToDb, pushBoardItemToDb],
  )

  const renameBoard = useCallback(
    (boardId: string, name: string) => {
      setBoards((prev) =>
        prev.map((b) => (b.id === boardId ? { ...b, name, updatedAt: Date.now() } : b)),
      )
      if (user) updateBoardFieldsInDb(boardId, { name })
    },
    [user, updateBoardFieldsInDb],
  )

  const updateBoardDescription = useCallback(
    (boardId: string, description: string) => {
      setBoards((prev) =>
        prev.map((b) => (b.id === boardId ? { ...b, description, updatedAt: Date.now() } : b)),
      )
      if (user) updateBoardFieldsInDb(boardId, { description })
    },
    [user, updateBoardFieldsInDb],
  )

  const deleteBoard = useCallback(
    (boardId: string) => {
      setBoards((prev) => prev.filter((b) => b.id !== boardId))
      if (user) removeBoardFromDb(boardId)
    },
    [user, removeBoardFromDb],
  )

  const duplicateBoard = useCallback(
    (boardId: string, newName?: string) => {
      const source = boards.find((b) => b.id === boardId)
      if (!source) return undefined

      const now = Date.now()
      const copy: Board = {
        ...source,
        id: makeBoardId(),
        name: newName?.trim() || `${source.name} (Copy)`,
        shareToken: null,
        visibility: 'private',
        createdAt: now,
        updatedAt: now,
        position: boards.length,
        items: source.items.map((item) => ({ ...item, addedAt: now })),
      }
      setBoards((prev) => [...prev, copy])

      if (user) {
        pushBoardToDb(copy, user.id)
        copy.items.forEach((item) => pushBoardItemToDb(copy.id, item, user.id))
      }

      return copy
    },
    [boards, user, pushBoardToDb, pushBoardItemToDb],
  )

  const reorderBoards = useCallback(
    (orderedIds: string[]) => {
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
      if (user) {
        orderedIds.forEach((id, index) => updateBoardFieldsInDb(id, { position: index }))
      }
    },
    [user, updateBoardFieldsInDb],
  )

  const getBoard = useCallback((boardId: string) => boards.find((b) => b.id === boardId), [boards])

  const addItemToBoard = useCallback(
    (boardId: string, product: BoardProduct) => {
      let newItem: BoardItem | null = null
      setBoards((prev) =>
        prev.map((b) => {
          if (b.id !== boardId) return b
          if (b.items.some((item) => item.id === product.id)) return b
          newItem = {
            ...product,
            addedAt: Date.now(),
            priceAtSave: product.price ?? null,
            position: b.items.length,
          }
          return { ...b, items: [...b.items, newItem], updatedAt: Date.now() }
        }),
      )
      if (user && newItem) pushBoardItemToDb(boardId, newItem, user.id)
    },
    [user, pushBoardItemToDb],
  )

  const removeItemFromBoard = useCallback(
    (boardId: string, itemId: string) => {
      setBoards((prev) =>
        prev.map((b) =>
          b.id === boardId
            ? { ...b, items: b.items.filter((i) => i.id !== itemId), updatedAt: Date.now() }
            : b,
        ),
      )
      if (user) removeBoardItemFromDb(boardId, itemId)
    },
    [user, removeBoardItemFromDb],
  )

  const moveItem = useCallback(
    (fromBoardId: string, toBoardId: string, itemId: string) => {
      if (fromBoardId === toBoardId) return
      let movedItem: BoardItem | null = null
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
            movedItem = { ...item, position: b.items.length, addedAt: now }
            return {
              ...b,
              items: [...b.items, movedItem],
              updatedAt: now,
            }
          }
          return b
        })
      })
      if (user && movedItem) {
        removeBoardItemFromDb(fromBoardId, itemId)
        pushBoardItemToDb(toBoardId, movedItem, user.id)
      }
    },
    [user, removeBoardItemFromDb, pushBoardItemToDb],
  )

  const copyItemToBoard = useCallback(
    (boardId: string, itemId: string, toBoardId: string) => {
      let copiedItem: BoardItem | null = null
      setBoards((prev) => {
        const source = prev.find((b) => b.id === boardId)
        const item = source?.items.find((i) => i.id === itemId)
        if (!item) return prev

        const now = Date.now()
        return prev.map((b) => {
          if (b.id !== toBoardId) return b
          if (b.items.some((i) => i.id === itemId)) return b
          copiedItem = { ...item, position: b.items.length, addedAt: now }
          return {
            ...b,
            items: [...b.items, copiedItem],
            updatedAt: now,
          }
        })
      })
      if (user && copiedItem) pushBoardItemToDb(toBoardId, copiedItem, user.id)
    },
    [user, pushBoardItemToDb],
  )

  const updateItemQuantity = useCallback(
    (boardId: string, itemId: string, quantity: number) => {
      const safeQty = Math.max(1, Math.floor(quantity) || 1)
      let updatedItem: BoardItem | null = null
      setBoards((prev) =>
        prev.map((b) => {
          if (b.id !== boardId) return b
          return {
            ...b,
            items: b.items.map((i) => {
              if (i.id !== itemId) return i
              updatedItem = { ...i, quantity: safeQty }
              return updatedItem
            }),
            updatedAt: Date.now(),
          }
        }),
      )
      if (user && updatedItem) pushBoardItemToDb(boardId, updatedItem, user.id)
    },
    [user, pushBoardItemToDb],
  )

  const updateItemVariant = useCallback(
    (boardId: string, itemId: string, variant: ProductVariant | null) => {
      let updatedItem: BoardItem | null = null
      setBoards((prev) =>
        prev.map((b) => {
          if (b.id !== boardId) return b
          return {
            ...b,
            items: b.items.map((i) => {
              if (i.id !== itemId) return i
              updatedItem = { ...i, variant }
              return updatedItem
            }),
            updatedAt: Date.now(),
          }
        }),
      )
      if (user && updatedItem) pushBoardItemToDb(boardId, updatedItem, user.id)
    },
    [user, pushBoardItemToDb],
  )

  const reorderBoardItems = useCallback(
    (boardId: string, orderedItemIds: string[]) => {
      let reorderedItems: BoardItem[] = []
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
          reorderedItems = [...reordered, ...remaining]
          return { ...b, items: reorderedItems, updatedAt: Date.now() }
        }),
      )
      if (user) {
        reorderedItems.forEach((item) => pushBoardItemToDb(boardId, item, user.id))
      }
    },
    [user, pushBoardItemToDb],
  )

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

  const setBoardVisibility = useCallback(
    (boardId: string, visibility: BoardVisibility) => {
      setBoards((prev) =>
        prev.map((b) => (b.id === boardId ? { ...b, visibility, updatedAt: Date.now() } : b)),
      )
      if (user) updateBoardFieldsInDb(boardId, { visibility })
    },
    [user, updateBoardFieldsInDb],
  )

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
      if (user) updateBoardFieldsInDb(boardId, { share_token: token, visibility: 'link' })
      return token
    },
    [boards, user, updateBoardFieldsInDb],
  )

  const revokeShareLink = useCallback(
    (boardId: string) => {
      setBoards((prev) =>
        prev.map((b) =>
          b.id === boardId
            ? { ...b, shareToken: null, visibility: 'private', updatedAt: Date.now() }
            : b,
        ),
      )
      if (user) updateBoardFieldsInDb(boardId, { share_token: null, visibility: 'private' })
    },
    [user, updateBoardFieldsInDb],
  )

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