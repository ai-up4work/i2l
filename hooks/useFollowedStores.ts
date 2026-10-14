// hooks/useFollowedStores.ts
//
// The signed-in shopper's followed stores (public.store_follows, made by
// data/wishdrop-social-stores.sql). One shared copy per browser tab: every
// component using this hook sees the same list, and FollowButton tells
// them all when a store is followed or unfollowed (notifyFollowChange),
// so "Stores for you", the stores list and the Following page update
// straight away.

'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'

export type FollowState = {
  /** platform_slug -> when it was followed (ISO). Newest first when listed. */
  followedAt: Map<string, string>
  loading: boolean
  /** False when the follows table can't be read (migration not run). */
  available: boolean
}

const EMPTY: FollowState = { followedAt: new Map(), loading: false, available: true }

let cache: { userId: string; state: FollowState } | null = null
let inflight: { userId: string; promise: Promise<FollowState> } | null = null
const listeners = new Set<(s: FollowState) => void>()

function emit(state: FollowState) {
  for (const l of listeners) l(state)
}

async function load(userId: string): Promise<FollowState> {
  if (inflight?.userId === userId) return inflight.promise
  const promise = (async () => {
    const { data, error } = await createClient()
      .from('store_follows')
      .select('platform_slug, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    const state: FollowState = error
      ? { followedAt: new Map(), loading: false, available: false }
      : {
          followedAt: new Map(((data ?? []) as { platform_slug: string; created_at: string }[]).map((r) => [r.platform_slug, r.created_at])),
          loading: false,
          available: true,
        }
    cache = { userId, state }
    inflight = null
    emit(state)
    return state
  })()
  inflight = { userId, promise }
  return promise
}

/** Called by FollowButton after a follow / unfollow is saved. */
export function notifyFollowChange(userId: string, slug: string, following: boolean) {
  const base = cache?.userId === userId ? cache.state : { ...EMPTY }
  const followedAt = new Map(base.followedAt)
  if (following) {
    // Newest first.
    followedAt.delete(slug)
    const next = new Map<string, string>([[slug, new Date().toISOString()]])
    for (const [k, v] of followedAt) next.set(k, v)
    cache = { userId, state: { ...base, followedAt: next } }
  } else {
    followedAt.delete(slug)
    cache = { userId, state: { ...base, followedAt } }
  }
  emit(cache.state)
}

export function useFollowedStores(): FollowState & { isFollowing: (slug: string) => boolean; slugs: string[] } {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [state, setState] = useState<FollowState>(() =>
    userId && cache?.userId === userId ? cache.state : { ...EMPTY, loading: Boolean(userId) },
  )

  useEffect(() => {
    if (!userId) {
      setState(EMPTY)
      return
    }
    const listener = (s: FollowState) => setState(s)
    listeners.add(listener)
    if (cache?.userId === userId) setState(cache.state)
    else {
      setState({ ...EMPTY, loading: true })
      load(userId)
    }
    return () => {
      listeners.delete(listener)
    }
  }, [userId])

  return {
    ...state,
    isFollowing: (slug: string) => state.followedAt.has(slug),
    slugs: [...state.followedAt.keys()],
  }
}

/** Followed stores first (most recently followed first), the rest in
 *  their original order. */
export function followedFirst<T>(items: T[], slugOf: (t: T) => string, followedAt: Map<string, string>): T[] {
  if (!followedAt.size) return items
  const order = [...followedAt.keys()]
  const followed = items.filter((i) => followedAt.has(slugOf(i))).sort((a, b) => order.indexOf(slugOf(a)) - order.indexOf(slugOf(b)))
  return [...followed, ...items.filter((i) => !followedAt.has(slugOf(i)))]
}
