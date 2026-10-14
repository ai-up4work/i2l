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
import { cacheKeyFor, isUuid, newUuid, readCache, removeCache, useAccountRefresh, writeCache } from '@/lib/account-sync'
import type { Json } from '@/lib/supabase/types'

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
// Account-based wishlist and boards (lib/account-sync.ts).
//
// Signed in: the database is the source of truth — wishlist_items for the
// flat wishlist, and one `boards` row per board (its items saved inside
// it). The local copy (per account) is only a cache shown instantly on
// load, then replaced with the database's version. Every change is applied
// on screen and written to the database at once; other devices pick it up
// through Realtime or when their tab is focused. Removing or clearing is a
// real delete in the database, so it stays gone on every device.
//
// Signed out: everything lives on this device as a guest copy. On sign-in
// guest wishlist items and boards are added to the account once, then the
// guest copy is emptied.
//
// Needs data/wishdrop-account-sync.sql.
// ---------------------------------------------------------------------------

const BASE_KEY = 'Wishdrop:wishlist'
/** Before this change: one device-wide key for items + boards. */
const LEGACY_KEY = 'Wishdrop:wishlist-data'

type PersistedShape = {
  items: WishlistEntry[]
  boards: Board[]
  boardCounter: number
}

const EMPTY: PersistedShape = { items: [], boards: [], boardCounter: 0 }

function readShape(key: string): PersistedShape {
  const parsed = readCache<Partial<PersistedShape> | null>(key, null)
  if (!parsed || typeof parsed !== 'object') return { ...EMPTY }
  return {
    items: Array.isArray(parsed.items) ? parsed.items : [],
    boards: Array.isArray(parsed.boards) ? parsed.boards : [],
    boardCounter: typeof parsed.boardCounter === 'number' ? parsed.boardCounter : 0,
  }
}

function makeShareToken() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10)
}

type WishlistRow = { item_key: string; product: WishlistProduct | null; added_at: string }
type BoardRow = {
  id: string
  name: string
  description: string | null
  visibility: BoardVisibility
  share_token: string | null
  position: number
  items: BoardItem[] | null
  created_at: string
  updated_at: string
}

function rowToEntry(row: WishlistRow): WishlistEntry | null {
  if (!row.product || !row.item_key) return null
  return { ...row.product, id: row.item_key, addedAt: new Date(row.added_at).getTime() }
}

function entryToRow(entry: WishlistEntry, userId: string) {
  const { addedAt, ...product } = entry
  return {
    user_id: userId,
    item_key: entry.id,
    product: product as unknown as Json,
    added_at: new Date(addedAt).toISOString(),
  }
}

function rowToBoard(row: BoardRow): Board {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    visibility: row.visibility,
    shareToken: row.share_token,
    position: row.position,
    items: Array.isArray(row.items) ? row.items : [],
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  }
}

function boardToRow(board: Board, userId: string) {
  return {
    id: board.id,
    user_id: userId,
    name: board.name,
    description: board.description ?? null,
    visibility: board.visibility,
    share_token: board.shareToken ?? null,
    position: board.position,
    items: board.items as unknown as Json,
    created_at: new Date(board.createdAt).toISOString(),
    updated_at: new Date(board.updatedAt).toISOString(),
  }
}

/** Boards made before they were saved to the database had non-uuid ids. */
function withUuid(board: Board): Board {
  return isUuid(board.id) ? board : { ...board, id: newUuid() }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  const userId = user?.id ?? null

  const [state, setState] = useState<PersistedShape & { key: string | null }>({ ...EMPTY, key: null })
  const { items, boards } = state
  const hydrated = state.key !== null

  const stateRef = useRef(state)
  stateRef.current = state
  const userIdRef = useRef<string | null>(null)
  userIdRef.current = userId
  // See contexts/Cartcontext.tsx: reads that overlap a local change or an
  // unfinished write are thrown away and repeated.
  const version = useRef(0)
  const pending = useRef(0)
  // Boards changed on screen but not yet written (writes are batched).
  const dirtyBoards = useRef(new Set<string>())
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (state.key) writeCache(state.key, { items: state.items, boards: state.boards, boardCounter: state.boardCounter })
  }, [state])

  const refreshFromDb = useCallback(async () => {
    const uid = userIdRef.current
    if (!uid) {
      const key = cacheKeyFor(BASE_KEY, null)
      setState({ ...readShape(key), key })
      return
    }
    if (pending.current > 0 || dirtyBoards.current.size > 0) {
      setTimeout(() => void refreshFromDb(), 400)
      return
    }
    const started = version.current
    const [wl, bd] = await Promise.all([
      supabase.from('wishlist_items').select('item_key, product, added_at').eq('user_id', uid).order('added_at', { ascending: true }),
      supabase.from('boards').select('id, name, description, visibility, share_token, position, items, created_at, updated_at').eq('user_id', uid).order('position', { ascending: true }),
    ])
    if (wl.error || bd.error) {
      console.error('[wishlist] could not read', (wl.error ?? bd.error)?.message)
      return // keep showing the cache
    }
    if (userIdRef.current !== uid) return
    if (version.current !== started || pending.current > 0 || dirtyBoards.current.size > 0) {
      setTimeout(() => void refreshFromDb(), 400)
      return
    }
    const nextItems = ((wl.data ?? []) as unknown as WishlistRow[]).map(rowToEntry).filter((e): e is WishlistEntry => e !== null)
    const nextBoards = ((bd.data ?? []) as unknown as BoardRow[]).map(rowToBoard)
    setState((cur) => ({ key: cacheKeyFor(BASE_KEY, uid), items: nextItems, boards: nextBoards, boardCounter: cur.boardCounter }))
  }, [supabase])

  // ---- writes ------------------------------------------------------------

  const run = useCallback(
    async (label: string, op: () => PromiseLike<{ error: { message: string } | null }>) => {
      pending.current++
      const { error } = await Promise.resolve(op()).then(
        (r) => r,
        (e: unknown) => ({ error: { message: e instanceof Error ? e.message : String(e) } }),
      )
      pending.current--
      if (error) {
        console.error(`[wishlist] could not ${label}`, error.message)
        void refreshFromDb()
      }
    },
    [refreshFromDb],
  )

  const flushBoards = useCallback(async () => {
    flushTimer.current = null
    const uid = userIdRef.current
    const ids = [...dirtyBoards.current]
    dirtyBoards.current.clear()
    if (!uid || !ids.length) return
    const current = new Map(stateRef.current.boards.map((b) => [b.id, b]))
    const upserts = ids.map((id) => current.get(id)).filter((b): b is Board => Boolean(b))
    const deletes = ids.filter((id) => !current.has(id))
    if (upserts.length) {
      await run('save boards', () => supabase.from('boards').upsert(upserts.map((b) => boardToRow(b, uid)), { onConflict: 'id' }))
    }
    if (deletes.length) {
      await run('delete boards', () => supabase.from('boards').delete().eq('user_id', uid).in('id', deletes))
    }
  }, [supabase, run])

  /** Changes boards on screen, then saves the touched ones (batched). */
  const updateBoards = useCallback(
    (fn: (prev: Board[]) => Board[], touched: string[] | 'all') => {
      version.current++
      const prev = stateRef.current.boards
      const next = fn(prev)
      const ids = touched === 'all' ? [...new Set([...prev, ...next].map((b) => b.id))] : touched
      stateRef.current = { ...stateRef.current, boards: next }
      setState((cur) => ({ ...cur, boards: next }))
      if (!userIdRef.current) return
      ids.forEach((id) => dirtyBoards.current.add(id))
      if (flushTimer.current) clearTimeout(flushTimer.current)
      flushTimer.current = setTimeout(() => void flushBoards(), 400)
    },
    [flushBoards],
  )

  // Write any unsaved board changes before the page goes away.
  useEffect(() => {
    const onHide = () => {
      if (dirtyBoards.current.size) void flushBoards()
    }
    window.addEventListener('pagehide', onHide)
    return () => window.removeEventListener('pagehide', onHide)
  }, [flushBoards])

  const setItems = useCallback((next: WishlistEntry[]) => {
    version.current++
    stateRef.current = { ...stateRef.current, items: next }
    setState((cur) => ({ ...cur, items: next }))
  }, [])

  // ---- load: cache first, then the database --------------------------------

  useEffect(() => {
    if (authLoading) return
    const key = cacheKeyFor(BASE_KEY, userId)
    const legacy = readShape(LEGACY_KEY)

    if (!userId) {
      // The old device-wide copy becomes this device's guest copy.
      if ((legacy.items.length || legacy.boards.length) && !readShape(key).items.length && !readShape(key).boards.length) {
        writeCache(key, legacy)
      }
      removeCache(LEGACY_KEY)
      setState({ ...readShape(key), key })
      return
    }

    setState({ ...readShape(key), key })

    let cancelled = false
    ;(async () => {
      const guestKey = cacheKeyFor(BASE_KEY, null)
      const guest = readShape(guestKey)
      // The old code already saved a signed-in account's wishlist to the
      // database, so its old device-wide items are NOT re-added (that is
      // what brought removed items back). Its boards were never saved, so
      // they're added once.
      const boardsToAdd = [...guest.boards, ...legacy.boards].map(withUuid)
      const itemsToAdd = guest.items

      let ok = true
      if (itemsToAdd.length) {
        const { error } = await supabase
          .from('wishlist_items')
          .upsert(itemsToAdd.map((e) => entryToRow(e, userId)), { onConflict: 'user_id,item_key', ignoreDuplicates: true })
        if (error) {
          ok = false
          console.error('[wishlist] could not add guest items', error.message)
        }
      }
      if (boardsToAdd.length) {
        const { count } = await supabase.from('boards').select('id', { count: 'exact', head: true }).eq('user_id', userId)
        const base = count ?? 0
        const { error } = await supabase
          .from('boards')
          .upsert(boardsToAdd.map((b, i) => boardToRow({ ...b, position: base + i, shareToken: null, visibility: 'private' }, userId)), { onConflict: 'id', ignoreDuplicates: true })
        if (error) {
          ok = false
          console.error('[wishlist] could not add boards', error.message)
        }
      }
      if (ok) {
        removeCache(guestKey)
        removeCache(LEGACY_KEY)
      }
      if (!cancelled) await refreshFromDb()
    })()
    return () => {
      cancelled = true
    }
  }, [userId, authLoading, supabase, refreshFromDb])

  useAccountRefresh({ userId, tables: ['wishlist_items', 'boards'], cacheKey: state.key, refresh: () => void refreshFromDb() })

  // ---- flat wishlist ----------------------------------------------------------

  const addItem = useCallback(
    (product: WishlistProduct) => {
      const prev = stateRef.current.items
      if (prev.some((entry) => entry.id === product.id)) return
      const entry: WishlistEntry = { ...product, addedAt: Date.now() }
      setItems([...prev, entry])
      const uid = userIdRef.current
      if (uid) void run('save', () => supabase.from('wishlist_items').upsert(entryToRow(entry, uid), { onConflict: 'user_id,item_key' }))
    },
    [setItems, run, supabase],
  )

  const removeItem = useCallback(
    (id: string) => {
      setItems(stateRef.current.items.filter((entry) => entry.id !== id))
      const uid = userIdRef.current
      if (uid) void run('remove', () => supabase.from('wishlist_items').delete().eq('user_id', uid).eq('item_key', id))
    },
    [setItems, run, supabase],
  )

  const toggleItem = useCallback(
    (product: WishlistProduct) => {
      if (stateRef.current.items.some((entry) => entry.id === product.id)) removeItem(product.id)
      else addItem(product)
    },
    [addItem, removeItem],
  )

  const isInWishlist = useCallback((id: string) => items.some((entry) => entry.id === id), [items])

  const clearWishlist = useCallback(() => {
    setItems([])
    const uid = userIdRef.current
    if (uid) void run('clear', () => supabase.from('wishlist_items').delete().eq('user_id', uid))
  }, [setItems, run, supabase])

  // ---- boards: CRUD ---------------------------------------------------------------

  const createBoard = useCallback(
    (name?: string, initialItems: BoardProduct[] = []): Board => {
      const trimmed = name?.trim()
      const now = Date.now()
      const counter = stateRef.current.boardCounter + 1
      stateRef.current = { ...stateRef.current, boardCounter: counter }
      setState((cur) => ({ ...cur, boardCounter: counter }))

      const board: Board = {
        id: newUuid(),
        name: trimmed || `Board ${1000 + counter}`,
        description: null,
        visibility: 'private',
        shareToken: null,
        createdAt: now,
        updatedAt: now,
        position: stateRef.current.boards.length,
        items: initialItems.map((product, index) => ({
          ...product,
          addedAt: now,
          priceAtSave: product.price ?? null,
          position: index,
        })),
      }

      updateBoards((prev) => [...prev, board], [board.id])
      return board
    },
    [updateBoards],
  )

  const renameBoard = useCallback(
    (boardId: string, name: string) => {
      updateBoards((prev) => prev.map((b) => (b.id === boardId ? { ...b, name, updatedAt: Date.now() } : b)), [boardId])
    },
    [updateBoards],
  )

  const updateBoardDescription = useCallback(
    (boardId: string, description: string) => {
      updateBoards((prev) => prev.map((b) => (b.id === boardId ? { ...b, description, updatedAt: Date.now() } : b)), [boardId])
    },
    [updateBoards],
  )

  const deleteBoard = useCallback(
    (boardId: string) => {
      updateBoards((prev) => prev.filter((b) => b.id !== boardId), [boardId])
    },
    [updateBoards],
  )

  const duplicateBoard = useCallback(
    (boardId: string, newName?: string) => {
      const all = stateRef.current.boards
      const source = all.find((b) => b.id === boardId)
      if (!source) return undefined

      const now = Date.now()
      const copy: Board = {
        ...source,
        id: newUuid(),
        name: newName?.trim() || `${source.name} (Copy)`,
        shareToken: null,
        visibility: 'private',
        createdAt: now,
        updatedAt: now,
        position: all.length,
        items: source.items.map((item) => ({ ...item, addedAt: now })),
      }
      updateBoards((prev) => [...prev, copy], [copy.id])
      return copy
    },
    [updateBoards],
  )

  const reorderBoards = useCallback(
    (orderedIds: string[]) => {
      updateBoards((prev) => {
        const byId = new Map(prev.map((b) => [b.id, b]))
        const reordered = orderedIds
          .map((id, index) => {
            const board = byId.get(id)
            return board ? { ...board, position: index } : null
          })
          .filter((b): b is Board => b !== null)
        const remaining = prev.filter((b) => !orderedIds.includes(b.id)).map((b, i) => ({ ...b, position: reordered.length + i }))
        return [...reordered, ...remaining]
      }, 'all')
    },
    [updateBoards],
  )

  const getBoard = useCallback((boardId: string) => boards.find((b) => b.id === boardId), [boards])

  const addItemToBoard = useCallback(
    (boardId: string, product: BoardProduct) => {
      updateBoards(
        (prev) =>
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
        [boardId],
      )
    },
    [updateBoards],
  )

  const removeItemFromBoard = useCallback(
    (boardId: string, itemId: string) => {
      updateBoards(
        (prev) => prev.map((b) => (b.id === boardId ? { ...b, items: b.items.filter((i) => i.id !== itemId), updatedAt: Date.now() } : b)),
        [boardId],
      )
    },
    [updateBoards],
  )

  const moveItem = useCallback(
    (fromBoardId: string, toBoardId: string, itemId: string) => {
      if (fromBoardId === toBoardId) return
      updateBoards(
        (prev) => {
          const source = prev.find((b) => b.id === fromBoardId)
          const item = source?.items.find((i) => i.id === itemId)
          if (!item) return prev
          const now = Date.now()
          return prev.map((b) => {
            if (b.id === fromBoardId) return { ...b, items: b.items.filter((i) => i.id !== itemId), updatedAt: now }
            if (b.id === toBoardId) {
              if (b.items.some((i) => i.id === itemId)) return b
              return { ...b, items: [...b.items, { ...item, position: b.items.length, addedAt: now }], updatedAt: now }
            }
            return b
          })
        },
        [fromBoardId, toBoardId],
      )
    },
    [updateBoards],
  )

  const copyItemToBoard = useCallback(
    (boardId: string, itemId: string, toBoardId: string) => {
      updateBoards(
        (prev) => {
          const source = prev.find((b) => b.id === boardId)
          const item = source?.items.find((i) => i.id === itemId)
          if (!item) return prev
          const now = Date.now()
          return prev.map((b) => {
            if (b.id !== toBoardId) return b
            if (b.items.some((i) => i.id === itemId)) return b
            return { ...b, items: [...b.items, { ...item, position: b.items.length, addedAt: now }], updatedAt: now }
          })
        },
        [toBoardId],
      )
    },
    [updateBoards],
  )

  const updateItemQuantity = useCallback(
    (boardId: string, itemId: string, quantity: number) => {
      const safeQty = Math.max(1, Math.floor(quantity) || 1)
      updateBoards(
        (prev) =>
          prev.map((b) =>
            b.id === boardId
              ? { ...b, items: b.items.map((i) => (i.id === itemId ? { ...i, quantity: safeQty } : i)), updatedAt: Date.now() }
              : b,
          ),
        [boardId],
      )
    },
    [updateBoards],
  )

  const updateItemVariant = useCallback(
    (boardId: string, itemId: string, variant: ProductVariant | null) => {
      updateBoards(
        (prev) =>
          prev.map((b) =>
            b.id === boardId ? { ...b, items: b.items.map((i) => (i.id === itemId ? { ...i, variant } : i)), updatedAt: Date.now() } : b,
          ),
        [boardId],
      )
    },
    [updateBoards],
  )

  const reorderBoardItems = useCallback(
    (boardId: string, orderedItemIds: string[]) => {
      updateBoards(
        (prev) =>
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
        [boardId],
      )
    },
    [updateBoards],
  )

  const isInBoard = useCallback(
    (boardId: string, itemId: string) => {
      const board = boards.find((b) => b.id === boardId)
      return board ? board.items.some((i) => i.id === itemId) : false
    },
    [boards],
  )

  const getBoardsForItem = useCallback((itemId: string) => boards.filter((b) => b.items.some((i) => i.id === itemId)), [boards])

  const setBoardVisibility = useCallback(
    (boardId: string, visibility: BoardVisibility) => {
      updateBoards((prev) => prev.map((b) => (b.id === boardId ? { ...b, visibility, updatedAt: Date.now() } : b)), [boardId])
    },
    [updateBoards],
  )

  const generateShareLink = useCallback(
    (boardId: string): string => {
      const existing = stateRef.current.boards.find((b) => b.id === boardId)
      if (existing?.shareToken) return existing.shareToken
      const token = makeShareToken()
      updateBoards(
        (prev) => prev.map((b) => (b.id === boardId ? { ...b, shareToken: token, visibility: 'link', updatedAt: Date.now() } : b)),
        [boardId],
      )
      return token
    },
    [updateBoards],
  )

  const revokeShareLink = useCallback(
    (boardId: string) => {
      updateBoards(
        (prev) => prev.map((b) => (b.id === boardId ? { ...b, shareToken: null, visibility: 'private', updatedAt: Date.now() } : b)),
        [boardId],
      )
    },
    [updateBoards],
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
