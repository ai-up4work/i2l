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
  /** How this line entered the cart — 'catalogue' via an affiliated
   * store's "Add to bag" (AddToBagButton.tsx), 'link' via a pasted URL
   * scraped through ItemInfoModal. Optional/undefined for any older
   * persisted cart data written before this field existed — the cart
   * page treats a missing source as 'link' since that's the harder case
   * to misattribute (a catalogue item always has a real `site`). */
  source?: 'catalogue' | 'link'
}

export type CartLineItem = {
  product: CartProduct
  qty: number
  addedAt: number
}

type CartContextValue = {
  items: CartLineItem[]
  /** Total units across all line items (sum of qty) — what a cart badge usually shows. */
  itemCount: number
  /** Number of distinct line items. */
  lineCount: number
  /** Adds `product`. If that id is already in the cart, increments qty by `qty` instead of duplicating. */
  addItem: (product: CartProduct, qty?: number) => void
  removeItem: (id: string) => void
  /** Setting qty to 0 or below removes the line item. */
  updateQty: (id: string, qty: number) => void
  clearCart: () => void
  isInCart: (id: string) => boolean
  getQty: (id: string) => number
}

const CartContext = createContext<CartContextValue | null>(null)

const STORAGE_KEY = 'wishdrop:cart'

function loadInitialItems(): CartLineItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    // Corrupt or pre-migration data shouldn't crash the app — just start empty.
    return []
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  // Start empty on BOTH server and client. Loading from localStorage during
  // the initial render (even via a lazy `useState` initializer) makes the
  // client's first render diverge from the server-rendered HTML the moment
  // anything is actually persisted — e.g. server renders "Cart (0)" while
  // the client's first render already says "Cart (3)" from localStorage,
  // which throws a hydration mismatch and forces React to discard and
  // re-render the whole subtree. Instead we render empty first, matching
  // the server exactly, then hydrate the real data in an effect below —
  // effects only run client-side, and only after the DOM has already been
  // reconciled against the server markup, so there's nothing left to
  // mismatch against.
  const [items, setItems] = useState<CartLineItem[]>([])
  const [hydrated, setHydrated] = useState(false)

  // Runs once on mount, client-only. Pulls in whatever was actually saved,
  // then flips `hydrated` so the persist-effect below is safe to start
  // writing (it must not fire before this, or it would overwrite storage
  // with the empty initial state).
  useEffect(() => {
    setItems(loadInitialItems())
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {
      // Storage can fail (quota, private mode) — losing persistence isn't
      // worth crashing the cart over.
    }
  }, [items, hydrated])

  // Keep multiple tabs in sync: if the cart changes in another tab, pick it up here.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
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
  }, [])

  const addItem = useCallback((product: CartProduct, qty: number = 1) => {
    if (qty <= 0) return
    setItems((prev) => {
      const existingIndex = prev.findIndex((line) => line.product.id === product.id)
      if (existingIndex === -1) {
        return [...prev, { product, qty, addedAt: Date.now() }]
      }
      const next = [...prev]
      const existing = next[existingIndex]
      next[existingIndex] = {
        ...existing,
        // Refresh the snapshot (price may have moved since it was first added)
        // but keep accumulating quantity.
        product,
        qty: existing.qty + qty,
      }
      return next
    })
  }, [])

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((line) => line.product.id !== id))
  }, [])

  const updateQty = useCallback((id: string, qty: number) => {
    setItems((prev) => {
      if (qty <= 0) return prev.filter((line) => line.product.id !== id)
      return prev.map((line) => (line.product.id === id ? { ...line, qty } : line))
    })
  }, [])

  const clearCart = useCallback(() => setItems([]), [])

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
    [items, addItem, removeItem, updateQty, clearCart, isInCart, getQty],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within a <CartProvider>')
  return ctx
}