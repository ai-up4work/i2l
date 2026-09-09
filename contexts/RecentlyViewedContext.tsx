// contexts/RecentlyViewedContext.tsx
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
 * Trimmed, serializable snapshot — same rationale as CartProduct: only what
 * the recently-viewed rail/page actually renders, so it survives fine in
 * localStorage. Price/title are a snapshot taken at view time, refreshed
 * whenever the product is viewed again (see markViewed) — same "refresh on
 * touch" pattern CartContext uses for addItem so nothing goes stale for a
 * shopper mid-session without needing a server lookup.
 */
export type RecentlyViewedProduct = {
  id: string
  title: string
  image?: string | null
  currencyCode?: string | null
  estimatedPrice?: string | null
  discountPct?: number | null
}

export type RecentlyViewedEntry = {
  product: RecentlyViewedProduct
  viewedAt: number
}

type RecentlyViewedContextValue = {
  hydrated: boolean
  items: RecentlyViewedEntry[]
  markViewed: (product: RecentlyViewedProduct) => void
  removeItem: (id: string) => void
  clearAll: () => void
}

const RecentlyViewedContext = createContext<RecentlyViewedContextValue | null>(null)

const STORAGE_KEY = 'wishdrop:recently-viewed'
const MAX_ITEMS = 30

function loadInitialItems(): RecentlyViewedEntry[] {
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

export function RecentlyViewedProvider({ children }: { children: ReactNode }) {
  // Same server/client divergence problem as CartProvider: start empty on
  // both, hydrate from localStorage in an effect, only start persisting
  // once hydrated is true.
  const [items, setItems] = useState<RecentlyViewedEntry[]>([])
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setItems(loadInitialItems())
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {
      // quota / private mode — losing persistence isn't worth crashing over
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

  const markViewed = useCallback((product: RecentlyViewedProduct) => {
    setItems((prev) => {
      const withoutDupe = prev.filter((e) => e.product.id !== product.id)
      const next = [{ product, viewedAt: Date.now() }, ...withoutDupe]
      return next.slice(0, MAX_ITEMS)
    })
  }, [])

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((e) => e.product.id !== id))
  }, [])

  const clearAll = useCallback(() => setItems([]), [])

  const value = useMemo<RecentlyViewedContextValue>(
    () => ({ hydrated, items, markViewed, removeItem, clearAll }),
    [hydrated, items, markViewed, removeItem, clearAll],
  )

  return (
    <RecentlyViewedContext.Provider value={value}>
      {children}
    </RecentlyViewedContext.Provider>
  )
}

export function useRecentlyViewed() {
  const ctx = useContext(RecentlyViewedContext)
  if (!ctx) throw new Error('useRecentlyViewed must be used within a <RecentlyViewedProvider>')
  return ctx
}