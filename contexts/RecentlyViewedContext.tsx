// contexts/RecentlyViewedContext.tsx
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
  const { user, loading: authLoading } = useAuth()
  const supabase = useMemo(() => createClient(), [])

  const [items, setItems] = useState<RecentlyViewedEntry[]>([])
  const [hydrated, setHydrated] = useState(false)
  const dbSyncedForUserId = useRef<string | null>(null)

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

  const pushToDb = useCallback(
    async (product: RecentlyViewedProduct, userId: string) => {
      try {
        const snapshotId = await ensureProductSnapshot(supabase, {
          id: product.id,
          title: product.title,
          image: product.image,
          currencyCode: product.currencyCode,
          price: product.estimatedPrice,
        })
        // Touching viewed_at on conflict is the whole point here (unlike
        // cart/wishlist, there's no quantity/selection to preserve) — a
        // plain upsert with default merge does that since viewed_at has a
        // default of now() and isn't excluded from the update.
        await supabase
          .from('recently_viewed')
          .upsert(
            { user_id: userId, product_snapshot_id: snapshotId, viewed_at: new Date().toISOString() },
            { onConflict: 'user_id,product_snapshot_id' },
          )
      } catch (err) {
        console.error('[recently-viewed] failed to sync to db', err)
      }
    },
    [supabase],
  )

  const removeFromDb = useCallback(
    async (productId: string, userId: string) => {
      try {
        const snapshotId = await findSnapshotId(supabase, productId)
        if (!snapshotId) return
        await supabase
          .from('recently_viewed')
          .delete()
          .eq('user_id', userId)
          .eq('product_snapshot_id', snapshotId)
      } catch (err) {
        console.error('[recently-viewed] failed to remove from db', err)
      }
    },
    [supabase],
  )

  // On login: push local history up, then pull the merged (most-recent 30)
  // server-side list back down.
  useEffect(() => {
    if (authLoading || !hydrated) return
    if (!user) {
      dbSyncedForUserId.current = null
      return
    }
    if (dbSyncedForUserId.current === user.id) return
    dbSyncedForUserId.current = user.id

    let cancelled = false
    ;(async () => {
      for (const entry of items) {
        await pushToDb(entry.product, user.id)
      }

      const { data, error } = await supabase
        .from('recently_viewed')
        .select('viewed_at, product_snapshots(url, title, image_url, currency, price)')
        .eq('user_id', user.id)
        .order('viewed_at', { ascending: false })
        .limit(MAX_ITEMS)

      if (cancelled || error || !data) return

      const merged: RecentlyViewedEntry[] = data
        .filter((row: any) => row.product_snapshots?.url)
        .map((row: any) => ({
          product: {
            id: row.product_snapshots.url,
            title: row.product_snapshots.title,
            image: row.product_snapshots.image_url,
            currencyCode: row.product_snapshots.currency,
            estimatedPrice: row.product_snapshots.price != null ? String(row.product_snapshots.price) : null,
          },
          viewedAt: new Date(row.viewed_at).getTime(),
        }))

      setItems(merged)
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, hydrated])

  const markViewed = useCallback(
    (product: RecentlyViewedProduct) => {
      setItems((prev) => {
        const withoutDupe = prev.filter((e) => e.product.id !== product.id)
        const next = [{ product, viewedAt: Date.now() }, ...withoutDupe]
        return next.slice(0, MAX_ITEMS)
      })
      if (user) pushToDb(product, user.id)
    },
    [user, pushToDb],
  )

  const removeItem = useCallback(
    (id: string) => {
      setItems((prev) => prev.filter((e) => e.product.id !== id))
      if (user) removeFromDb(id, user.id)
    },
    [user, removeFromDb],
  )

  const clearAll = useCallback(() => {
    const idsToRemove = items.map((e) => e.product.id)
    setItems([])
    if (user) idsToRemove.forEach((id) => removeFromDb(id, user.id))
  }, [items, user, removeFromDb])

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
