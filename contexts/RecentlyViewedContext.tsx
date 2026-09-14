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
 * Deliberately minimal — just enough to re-fetch the real product later.
 * NO title/price/image/discount here anymore. Those are always looked up
 * live (see hooks/useLiveProductData.ts) so the Recently Viewed page never
 * shows stale data. This context's only job is remembering *which*
 * products were viewed and *when* — a pointer, not a snapshot.
 */
export type RecentlyViewedRef = {
  id: string
  url: string
  source?: 'catalogue' | 'link'
}

export type RecentlyViewedEntry = {
  ref: RecentlyViewedRef
  viewedAt: number
}

type RecentlyViewedContextValue = {
  hydrated: boolean
  items: RecentlyViewedEntry[]
  markViewed: (ref: RecentlyViewedRef) => void
  removeItem: (id: string) => void
  clearAll: () => void
}

const RecentlyViewedContext = createContext<RecentlyViewedContextValue | null>(null)

const STORAGE_KEY = 'wishdrop:recently-viewed'
const MAX_ITEMS = 100

function dedupeById(entries: RecentlyViewedEntry[]): RecentlyViewedEntry[] {
  const seen = new Set<string>()
  const result: RecentlyViewedEntry[] = []
  for (const entry of entries) {
    if (!entry?.ref?.id) continue
    if (seen.has(entry.ref.id)) continue
    seen.add(entry.ref.id)
    result.push(entry)
  }
  return result
}

function loadInitialItems(): RecentlyViewedEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? dedupeById(parsed) : []
  } catch {
    return []
  }
}

export function RecentlyViewedProvider({ children }: { children: ReactNode }) {
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
        setItems(Array.isArray(parsed) ? dedupeById(parsed) : [])
      } catch {
        // ignore malformed cross-tab payloads
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const markViewed = useCallback((ref: RecentlyViewedRef) => {
    setItems((prev) => {
      const withoutDupe = prev.filter((e) => e.ref.id !== ref.id)
      const next = [{ ref, viewedAt: Date.now() }, ...withoutDupe]
      return next.slice(0, MAX_ITEMS)
    })
  }, [])

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((e) => e.ref.id !== id))
  }, [])

  const clearAll = useCallback(() => {
    setItems([])
  }, [])

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