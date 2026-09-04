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
  /**
   * Stable identity for a line item. Use the *listing URL* (the exact
   * variant the shopper was looking at) so re-adding the same variant
   * bumps quantity instead of creating a duplicate row, while a different
   * variant of the same product becomes its own line item.
   */
  id: string
  url: string
  site?: string | null
  title: string
  image?: string | null
  currencyCode?: string | null
  /** Original price as shown on the source site, for reference/audit. */
  sourcePrice?: string | null
  /** WishDrop's converted/estimated price at the moment it was added. */
  estimatedPrice?: string | null
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
  // Lazy initializer avoids a flash of an empty cart -> populated cart on
  // mount for the common case where this runs client-side anyway.
  const [items, setItems] = useState<CartLineItem[]>(loadInitialItems)
  const [hydrated, setHydrated] = useState(false)

  // Mark hydrated after first render so we don't stomp localStorage with an
  // empty array during SSR before the real state has loaded client-side.
  useEffect(() => {
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