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

const STORAGE_KEY = 'Wishdrop:cart'

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
      // Storage can fail (quota, private mode) — losing persistence isn't
      // worth crashing the cart over.
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

  // ---- Supabase sync -------------------------------------------------
  // Pushes a single line up to cart_items (creating/reusing its
  // product_snapshot). Fire-and-forget from the caller's point of view —
  // local state is the source of truth for rendering; this just keeps the
  // account's server-side cart in step so it survives a device switch.
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
            source: line.product.source ?? 'link',
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

  // On login: push whatever's currently in the local (possibly guest) cart
  // up to the DB first — so nothing added before signing in is lost — then
  // pull the merged server-side cart back down as the new source of truth.
  // Skips only while local state is non-empty and already synced for this
  // user — see the guard below for why "synced once" alone isn't enough.
  useEffect(() => {
    if (authLoading || !hydrated) return
    if (!user) {
      dbSyncedForUserId.current = null
      return
    }
    // Only skip if we've already synced AND there's still something in
    // local state. Previously this compared dbSyncedForUserId.current
    // to user.id alone, which meant that once synced, this effect would
    // NEVER check the DB again for the rest of the session — even if
    // local state later ended up empty (cleared storage, a bug, etc)
    // while the DB still had real data. Requiring items.length > 0 too
    // means a future run of this effect (e.g. a fresh mount) will still
    // re-sync instead of trusting a stale "already done" flag.
    if (dbSyncedForUserId.current === user.id && items.length > 0) return
    dbSyncedForUserId.current = user.id

    let cancelled = false
    ;(async () => {
      for (const line of items) {
        await pushLineToDb(line, user.id)
      }

      const { data, error } = await supabase
        .from('cart_items')
        .select(
          'quantity, selected_options, added_at, source, product_snapshots(url, site, title, image_url, currency, price)',
        )
        .eq('user_id', user.id)

      if (cancelled || error || !data) return

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
            // Was hardcoded to 'link' here — cart_items now has a real
            // source column (see Wishdrop-cart-items-source-column.sql)
            // to read back instead. Rows written before that migration
            // still have source = null, hence the 'link' fallback (the
            // same default this always used, just now only applied to
            // genuinely unknown/pre-migration rows instead of everything).
            source: (row.source as 'catalogue' | 'link' | null) ?? 'link',
          },
          qty: row.quantity,
          addedAt: new Date(row.added_at).getTime(),
        }))

      setItems(merged)
    })()

    return () => {
      cancelled = true
    }
    // Keyed on user?.id, not user — see ChatContext.tsx / Ordercontexts.tsx
    // for the full explanation: AuthContext hands out a brand-new user
    // object on every auth event, including the session refresh Supabase
    // fires on tab-focus, so keying on the object itself refetched the
    // whole cart every time the tab regained focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, authLoading, hydrated])

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