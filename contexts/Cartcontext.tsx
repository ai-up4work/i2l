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
import { cacheKeyFor, readCache, removeCache, useAccountRefresh, writeCache } from '@/lib/account-sync'
import type { Json } from '@/lib/supabase/types'

/**
 * A trimmed, serializable snapshot of whatever product the shopper added —
 * NOT the full `ScrapeResult`. We only keep what the cart UI (mini-cart,
 * cart page, checkout summary) actually needs to render a line item. This
 * also means the cart survives fine in localStorage without dragging along
 * every scraped field (item specifics, description, etc).
 */
export type CartProduct = {
  id: string
  url: string
  site?: string | null
  title: string
  image?: string | null
  currencyCode?: string | null
  sourcePrice?: string | null
  estimatedPrice?: string | null
  weightKg?: number | null
  source?: 'catalogue' | 'link'
  selectedOptions?: Record<string, string>
  /** Store location when added ('LK' = local Sri Lankan shop). The cart
   *  re-checks the live store list (hooks/useStorePricingLookup.ts). */
  origin?: 'IN' | 'LK' | null
  /** Price already includes Wishdrop's margin (social stores). */
  marginIncluded?: boolean
  /** Store product handle/id, so checkout can look the price up from the
   *  store itself on the server (lib/checkout/server.ts). */
  productHandle?: string | null
}

export type CartLineItem = {
  product: CartProduct
  qty: number
  addedAt: number
}

type CartContextValue = {
  hydrated: boolean
  items: CartLineItem[]
  itemCount: number
  lineCount: number
  addItem: (product: CartProduct, qty?: number) => void
  removeItem: (id: string) => void
  updateQty: (id: string, qty: number) => void
  clearCart: () => void
  isInCart: (id: string) => boolean
  getQty: (id: string) => number
}

const CartContext = createContext<CartContextValue | null>(null)

// ---------------------------------------------------------------------------
// Account-based cart (lib/account-sync.ts).
//
// Signed in: cart_items in the database is the source of truth. The local
// copy (per account) is only a cache shown instantly on load, then replaced
// with the database's version. Every add / quantity change / remove is
// applied on screen and written to the database at once (the exact
// quantity, never a merge of the whole local cart), and other devices pick
// it up through Realtime or when their tab is focused.
//
// Signed out: a guest cart on this device. On sign-in, guest lines are
// added to the account once (lines already in the account are left as they
// are) and the guest cart is emptied.
//
// Needs data/wishdrop-account-sync.sql.
// ---------------------------------------------------------------------------

const BASE_KEY = 'Wishdrop:cart'
/** Before this change the cart was one device-wide key. */
const LEGACY_KEY = 'Wishdrop:cart'

type CartRow = {
  line_key: string
  quantity: number
  product: CartProduct | null
  selected_options: Record<string, string> | null
  source: string | null
  added_at: string
}

function rowToLine(row: CartRow): CartLineItem | null {
  if (!row.product || !row.line_key) return null
  return {
    product: {
      ...row.product,
      id: row.line_key,
      selectedOptions: row.product.selectedOptions ?? row.selected_options ?? undefined,
      source: row.product.source ?? ((row.source as CartProduct['source']) || 'link'),
    },
    qty: Math.max(1, row.quantity),
    addedAt: new Date(row.added_at).getTime(),
  }
}

function lineToRow(line: CartLineItem, userId: string) {
  return {
    user_id: userId,
    line_key: line.product.id,
    quantity: line.qty,
    product: line.product as unknown as Json,
    selected_options: line.product.selectedOptions ?? null,
    source: line.product.source ?? 'link',
    added_at: new Date(line.addedAt).toISOString(),
    updated_at: new Date().toISOString(),
  }
}

function readLines(key: string): CartLineItem[] {
  const v = readCache<unknown>(key, [])
  return Array.isArray(v) ? (v as CartLineItem[]) : []
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  const userId = user?.id ?? null

  // Items together with the cache key they belong to, so switching account
  // can never write one account's cart into another's cache.
  const [state, setState] = useState<{ key: string | null; items: CartLineItem[] }>({ key: null, items: [] })
  const items = state.items
  const hydrated = state.key !== null
  const itemsRef = useRef<CartLineItem[]>([])
  itemsRef.current = items
  // Bumped on every local change: a database read that started before a
  // change is thrown away (and read again), so it can't undo that change.
  const version = useRef(0)
  // Writes still on their way to the database. A read is only trusted
  // when none are in flight, or it could show the old value for a moment.
  const pending = useRef(0)
  const userIdRef = useRef<string | null>(null)
  userIdRef.current = userId

  const setItems = useCallback((next: CartLineItem[]) => {
    setState((cur) => ({ ...cur, items: next }))
  }, [])

  // Keep the cache in step with what's on screen.
  useEffect(() => {
    if (state.key) writeCache(state.key, state.items)
  }, [state])

  const refreshFromDb = useCallback(async () => {
    const uid = userIdRef.current
    if (!uid) {
      setState({ key: cacheKeyFor(BASE_KEY, null), items: readLines(cacheKeyFor(BASE_KEY, null)) })
      return
    }
    if (pending.current > 0) {
      setTimeout(() => void refreshFromDb(), 300)
      return
    }
    const started = version.current
    const { data, error } = await supabase
      .from('cart_items')
      .select('line_key, quantity, product, selected_options, source, added_at')
      .eq('user_id', uid)
      .order('added_at', { ascending: true })
    if (error) {
      console.error('[cart] could not read the cart', error.message)
      return // keep showing the cache
    }
    if (userIdRef.current !== uid) return
    if (version.current !== started || pending.current > 0) {
      // Something changed while reading: read again so nothing is lost.
      setTimeout(() => void refreshFromDb(), 250)
      return
    }
    const lines = ((data ?? []) as unknown as CartRow[]).map(rowToLine).filter((l): l is CartLineItem => l !== null)
    setState({ key: cacheKeyFor(BASE_KEY, uid), items: lines })
  }, [supabase])

  // Load: cache first (instant), then the database.
  useEffect(() => {
    if (authLoading) return
    const key = cacheKeyFor(BASE_KEY, userId)

    if (!userId) {
      // Old device-wide cart (before accounts were the source of truth)
      // becomes this device's guest cart.
      const legacy = readLines(LEGACY_KEY)
      if (legacy.length && !readLines(key).length) writeCache(key, legacy)
      removeCache(LEGACY_KEY)
      setState({ key, items: readLines(key) })
      return
    }

    // A signed-in account already had its cart saved to the database by
    // the old code, so the old device-wide copy is dropped, not re-added
    // (re-adding it is what brought removed items back).
    removeCache(LEGACY_KEY)
    setState({ key, items: readLines(key) })

    let cancelled = false
    ;(async () => {
      const guestKey = cacheKeyFor(BASE_KEY, null)
      const guest = readLines(guestKey)
      if (guest.length) {
        // Add what the shopper put in the bag before signing in; lines the
        // account already has are left as they are.
        const { error } = await supabase
          .from('cart_items')
          .upsert(guest.map((l) => lineToRow(l, userId)), { onConflict: 'user_id,line_key', ignoreDuplicates: true })
        if (!error) removeCache(guestKey)
        else console.error('[cart] could not add the guest cart to the account', error.message)
      }
      if (!cancelled) await refreshFromDb()
    })()
    return () => {
      cancelled = true
    }
  }, [userId, authLoading, supabase, refreshFromDb])

  useAccountRefresh({ userId, tables: ['cart_items'], cacheKey: state.key, refresh: () => void refreshFromDb() })

  // ---- writes ------------------------------------------------------------

  const saveLine = useCallback(
    async (line: CartLineItem) => {
      const uid = userIdRef.current
      if (!uid) return
      pending.current++
      const { error } = await supabase
        .from('cart_items')
        .upsert(lineToRow(line, uid), { onConflict: 'user_id,line_key' })
        .then((r) => r, (e) => ({ error: e as { message: string } }))
      pending.current--
      if (error) {
        console.error('[cart] could not save', error.message)
        void refreshFromDb()
      }
    },
    [supabase, refreshFromDb],
  )

  const deleteLines = useCallback(
    async (ids: string[] | 'all') => {
      const uid = userIdRef.current
      if (!uid) return
      let q = supabase.from('cart_items').delete().eq('user_id', uid)
      if (ids !== 'all') q = q.in('line_key', ids)
      pending.current++
      const { error } = await q.then((r) => r, (e) => ({ error: e as { message: string } }))
      pending.current--
      if (error) {
        console.error('[cart] could not remove', error.message)
        void refreshFromDb()
      }
    },
    [supabase, refreshFromDb],
  )

  const addItem = useCallback(
    (product: CartProduct, qty: number = 1) => {
      if (qty <= 0) return
      version.current++
      const prev = itemsRef.current
      const i = prev.findIndex((line) => line.product.id === product.id)
      const line: CartLineItem = i === -1 ? { product, qty, addedAt: Date.now() } : { ...prev[i], product, qty: prev[i].qty + qty }
      const next = i === -1 ? [...prev, line] : prev.map((l, j) => (j === i ? line : l))
      itemsRef.current = next
      setItems(next)
      void saveLine(line)
    },
    [setItems, saveLine],
  )

  const removeItem = useCallback(
    (id: string) => {
      version.current++
      const next = itemsRef.current.filter((line) => line.product.id !== id)
      itemsRef.current = next
      setItems(next)
      void deleteLines([id])
    },
    [setItems, deleteLines],
  )

  const updateQty = useCallback(
    (id: string, qty: number) => {
      if (qty <= 0) {
        removeItem(id)
        return
      }
      const cur = itemsRef.current.find((line) => line.product.id === id)
      if (!cur || cur.qty === qty) return
      version.current++
      const line = { ...cur, qty }
      const next = itemsRef.current.map((l) => (l.product.id === id ? line : l))
      itemsRef.current = next
      setItems(next)
      void saveLine(line)
    },
    [setItems, saveLine, removeItem],
  )

  const clearCart = useCallback(() => {
    version.current++
    itemsRef.current = []
    setItems([])
    void deleteLines('all')
  }, [setItems, deleteLines])

  const isInCart = useCallback(
    (id: string) => items.some((line) => line.product.id === id),
    [items],
  )

  const getQty = useCallback(
    (id: string) => items.find((line) => line.product.id === id)?.qty ?? 0,
    [items],
  )

  const value = useMemo<CartContextValue>(
    () => ({
      hydrated,
      items,
      itemCount: items.reduce((sum, line) => sum + line.qty, 0),
      lineCount: items.length,
      addItem,
      removeItem,
      updateQty,
      clearCart,
      isInCart,
      getQty,
    }),
    [hydrated, items, addItem, removeItem, updateQty, clearCart, isInCart, getQty],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within a <CartProvider>')
  return ctx
}