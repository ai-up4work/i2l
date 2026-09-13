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

/**
 * A trimmed, serializable snapshot of whatever product the shopper added —
 * NOT the full `ScrapeResult`. We only keep what the cart UI (mini-cart,
 * cart page, checkout summary) actually needs to render a line item.
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

// Only ever holds a GUEST cart now. A logged-in user's cart lives solely
// in `cart_items` in Supabase — nothing about it is ever written to, or
// read back from, localStorage. This key is only touched while `user` is
// null, and is cleared the moment a guest cart gets merged into an
// account on login.
const STORAGE_KEY = 'wishdrop:cart'

function loadInitialItems(): CartLineItem[] {
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

export function CartProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const supabase = useMemo(() => createClient(), [])

  const [items, setItems] = useState<CartLineItem[]>([])
  const [hydrated, setHydrated] = useState(false)

  // Which user's DB cart is currently reflected in `items` (null = no one
  // yet / guest). Used only to (a) avoid re-fetching on every re-render
  // and (b) detect a logged-in -> logged-out transition so we can drop
  // that account's data out of memory rather than let it linger and look
  // like a "guest cart".
  const loadedUserIdRef = useRef<string | null>(null)

  // Guest-only hydration: read whatever's in localStorage immediately so
  // there's something to show before auth resolves. If the user turns out
  // to be logged in, the effect below replaces this with their real DB
  // cart right after.
  useEffect(() => {
    setItems(loadInitialItems())
    setHydrated(true)
  }, [])

  // Guest-only persistence. Deliberately gated on `!user` — a logged-in
  // user's cart is never written to localStorage, so there's nothing here
  // for a different account to accidentally inherit later.
  useEffect(() => {
    if (!hydrated || user) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {
      // Storage can fail (quota, private mode) — losing persistence isn't
      // worth crashing the cart over.
    }
  }, [items, hydrated, user])

  // Guest-only cross-tab sync. Ignored while logged in, since a logged-in
  // tab's source of truth is the DB fetch below, not localStorage.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (user) return
      if (e.key !== STORAGE_KEY) return
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

  // ---- Supabase sync -------------------------------------------------
  const pushLineToDb = useCallback(
    async (line: CartLineItem, userId: string) => {
      try {
        const snapshotId = await ensureProductSnapshot(supabase, {
          id: line.product.id,
          title: line.product.title,
          image: line.product.image,
          currencyCode: line.product.currencyCode,
          price: line.product.sourcePrice,
          site: line.product.site,
        })
        await supabase.from('cart_items').upsert(
          {
            user_id: userId,
            product_snapshot_id: snapshotId,
            quantity: line.qty,
            selected_options: line.product.selectedOptions ?? null,
          },
          { onConflict: 'user_id,product_snapshot_id' },
        )
      } catch (err) {
        console.error('[cart] failed to sync line to db', err)
      }
    },
    [supabase],
  )

  const removeLineFromDb = useCallback(
    async (productId: string, userId: string) => {
      try {
        const snapshotId = await findSnapshotId(supabase, productId)
        if (!snapshotId) return
        await supabase.from('cart_items').delete().eq('user_id', userId).eq('product_snapshot_id', snapshotId)
      } catch (err) {
        console.error('[cart] failed to remove line from db', err)
      }
    },
    [supabase],
  )

  // Single effect covering both directions:
  //   - guest -> logged in: push whatever's in the (guest) local cart up
  //     to the DB once, wipe localStorage so it can't resurface later,
  //     then load the DB cart as the new source of truth.
  //   - logged in -> logged out: drop that account's data out of memory
  //     (it was never in localStorage to begin with) and fall back to
  //     the guest's own localStorage cart, untouched this whole time.
  useEffect(() => {
    if (authLoading || !hydrated) return

    if (!user) {
      // Was logged in a moment ago -> now logged out. `items` currently
      // still holds the previous account's DB cart; replace it with
      // whatever's actually in the guest's local cart instead.
      if (loadedUserIdRef.current !== null) {
        setItems(loadInitialItems())
      }
      loadedUserIdRef.current = null
      return
    }

    // Already loaded this account's DB cart — nothing to do.
    if (loadedUserIdRef.current === user.id) return

    let cancelled = false
    const guestItemsAtLogin = items // whatever was showing right before login (guest cart)

    ;(async () => {
      for (const line of guestItemsAtLogin) {
        await pushLineToDb(line, user.id)
      }
      // Merged server-side now — clear it so a future guest session on
      // this browser doesn't inherit an already-claimed cart.
      if (guestItemsAtLogin.length) {
        try {
          window.localStorage.removeItem(STORAGE_KEY)
        } catch {
          // best-effort
        }
      }

      const { data, error } = await supabase
        .from('cart_items')
        .select(
          'quantity, selected_options, added_at, product_snapshots(url, site, title, image_url, currency, price)',
        )
        .eq('user_id', user.id)

      if (cancelled) return

      if (error || !data) {
        loadedUserIdRef.current = user.id
        return
      }

      const merged: CartLineItem[] = data
        .filter((row: any) => row.product_snapshots?.url)
        .map((row: any) => ({
          product: {
            id: row.product_snapshots.url,
            url: row.product_snapshots.url,
            site: row.product_snapshots.site,
            title: row.product_snapshots.title,
            image: row.product_snapshots.image_url,
            currencyCode: row.product_snapshots.currency,
            sourcePrice: row.product_snapshots.price != null ? String(row.product_snapshots.price) : null,
            selectedOptions: row.selected_options ?? undefined,
            source: 'link' as const,
          },
          qty: row.quantity,
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
    (product: CartProduct, qty: number = 1) => {
      if (qty <= 0) return
      let nextLine: CartLineItem | null = null
      setItems((prev) => {
        const existingIndex = prev.findIndex((line) => line.product.id === product.id)
        if (existingIndex === -1) {
          nextLine = { product, qty, addedAt: Date.now() }
          return [...prev, nextLine]
        }
        const next = [...prev]
        const existing = next[existingIndex]
        nextLine = { ...existing, product, qty: existing.qty + qty }
        next[existingIndex] = nextLine
        return next
      })
      if (user && nextLine) pushLineToDb(nextLine, user.id)
    },
    [user, pushLineToDb],
  )

  const removeItem = useCallback(
    (id: string) => {
      setItems((prev) => prev.filter((line) => line.product.id !== id))
      if (user) removeLineFromDb(id, user.id)
    },
    [user, removeLineFromDb],
  )

  const updateQty = useCallback(
    (id: string, qty: number) => {
      if (qty <= 0) {
        removeItem(id)
        return
      }
      let updatedLine: CartLineItem | undefined
      setItems((prev) =>
        prev.map((line) => {
          if (line.product.id !== id) return line
          updatedLine = { ...line, qty }
          return updatedLine
        }),
      )
      if (user && updatedLine) pushLineToDb(updatedLine, user.id)
    },
    [user, pushLineToDb, removeItem],
  )

  const clearCart = useCallback(() => {
    const idsToRemove = items.map((line) => line.product.id)
    setItems([])
    if (user) {
      idsToRemove.forEach((id) => removeLineFromDb(id, user.id))
    }
  }, [items, user, removeLineFromDb])

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