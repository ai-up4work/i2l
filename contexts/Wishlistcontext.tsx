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

type WishlistContextValue = {
  items: WishlistEntry[]
  count: number
  addItem: (product: WishlistProduct) => void
  removeItem: (id: string) => void
  /** Adds if absent, removes if present — what a heart/save button wants. */
  toggleItem: (product: WishlistProduct) => void
  isInWishlist: (id: string) => boolean
  clearWishlist: () => void
}

const WishlistContext = createContext<WishlistContextValue | null>(null)

const STORAGE_KEY = 'wishdrop:wishlist'

function loadInitialItems(): WishlistEntry[] {
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

export function WishlistProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<WishlistEntry[]>(loadInitialItems)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {
      // ignore — losing persistence shouldn't crash the wishlist
    }
  }, [items, hydrated])

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

  const isInWishlist = useCallback(
    (id: string) => items.some((entry) => entry.id === id),
    [items],
  )

  const clearWishlist = useCallback(() => setItems([]), [])

  const value = useMemo<WishlistContextValue>(
    () => ({
      items,
      count: items.length,
      addItem,
      removeItem,
      toggleItem,
      isInWishlist,
      clearWishlist,
    }),
    [items, addItem, removeItem, toggleItem, isInWishlist, clearWishlist],
  )

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>
}

export function useWishlist() {
  const ctx = useContext(WishlistContext)
  if (!ctx) throw new Error('useWishlist must be used within a <WishlistProvider>')
  return ctx
}