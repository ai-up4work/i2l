// lib/account-sync.ts
//
// Shared plumbing for account-based cart, wishlist and boards
// (contexts/Cartcontext.tsx, contexts/Wishlistcontext.tsx).
//
// The rule: when signed in, the DATABASE is the source of truth. Local
// storage is only a cache, kept per account, shown instantly on load and
// then replaced with what the database says. Every add / change / remove
// updates the screen and the cache at once and is written to the database
// straight away. Other devices pick changes up through Supabase Realtime,
// and every tab re-reads the database when it comes back into focus.
//
// Signed out, everything lives in a guest cache on this device. On sign-in
// the guest items are added to the account once (never removing or
// overwriting anything already there), then the guest cache is emptied.

'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

export function cacheKeyFor(base: string, userId: string | null): string {
  return userId ? `${base}:u:${userId}` : `${base}:guest`
}

export function readCache<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function writeCache(key: string, value: unknown): void {
  try {
    const json = JSON.stringify(value)
    // Unchanged writes are skipped, so tabs don't wake each other up for nothing.
    if (window.localStorage.getItem(key) !== json) window.localStorage.setItem(key, json)
  } catch {
    /* quota / private mode: the database still has it */
  }
}

export function removeCache(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

/** The column the migration adds doesn't exist yet (data/wishdrop-account-sync.sql not run). */
export function isMissingSyncColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === '42703' || error.code === 'PGRST204' || /line_key|item_key|column .* does not exist|schema cache/i.test(error.message ?? '')
}

/**
 * Re-reads the account's data when it may have changed elsewhere:
 *  - a row in one of `tables` changed for this user (Supabase Realtime);
 *  - the tab comes back into focus or becomes visible again;
 *  - another tab of this browser wrote the cache (`storage` event).
 * Calls are debounced so a burst of changes means one read.
 */
export function useAccountRefresh(opts: {
  userId: string | null
  tables: string[]
  cacheKey: string | null
  refresh: () => void
}) {
  const { userId, tables, cacheKey, refresh } = opts
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  const tablesKey = tables.join(',')

  useEffect(() => {
    if (!userId) return
    let timer: ReturnType<typeof setTimeout> | null = null
    let lastFocusRead = 0
    const schedule = (delay = 300) => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => refreshRef.current(), delay)
    }

    const onFocus = () => {
      if (document.visibilityState === 'hidden') return
      // At most one focus-triggered read every 5 seconds.
      if (Date.now() - lastFocusRead < 5000) return
      lastFocusRead = Date.now()
      schedule(0)
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)

    const supabase = createClient()
    const channel = supabase.channel(`account-sync:${tablesKey}:${userId}`)
    for (const table of tablesKey.split(',')) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` }, () => schedule())
    }
    channel.subscribe()

    return () => {
      if (timer) clearTimeout(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
      supabase.removeChannel(channel)
    }
  }, [userId, tablesKey])

  // Another tab of this browser changed the cache: re-read the database.
  useEffect(() => {
    if (!cacheKey) return
    const onStorage = (e: StorageEvent) => {
      if (e.key === cacheKey) refreshRef.current()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [cacheKey])
}

/** A random UUID (boards are saved with uuid ids). */
export function newUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}
