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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Tier = 'V0' | 'V1' | 'V2' | 'V3'

export const TIER_ORDER: Tier[] = ['V0', 'V1', 'V2', 'V3']

/**
 * Points needed to REACH each tier (not "points needed to advance from the
 * previous one"). V0 is 0 by definition — every account starts there.
 * These are placeholder numbers; swap them for whatever the real business
 * rule ends up being (e.g. driven by cumulative order spend instead of a
 * generic points balance).
 */
export const TIER_THRESHOLDS: Record<Tier, number> = {
  V0: 0,
  V1: 500,
  V2: 2000,
  V3: 5000,
}

/** How many points a same-day check-in awards. */
export const CHECK_IN_POINTS = 10

type LoyaltyState = {
  username: string
  points: number
  /** Epoch ms of the last successful check-in, or null if never checked in. */
  lastCheckInAt: number | null
}

type LoyaltyContextValue = {
  /**
   * False until the initial localStorage read has completed. Consumers
   * should render a loading/skeleton state while this is false instead of
   * treating the default points/tier as real data.
   */
  hydrated: boolean

  username: string
  points: number
  lastCheckInAt: number | null

  /** Derived from `points` against TIER_THRESHOLDS — never stored directly. */
  tier: Tier
  /** 0–100, how far through the current tier's segment `points` sits. 100 at max tier. */
  progressToNext: number
  /** Plain-language requirements for the next tier, empty at max tier. */
  nextTierRequirements: string[]
  /** True once per calendar day — false again after `checkIn()` until the next day. */
  canCheckInToday: boolean

  setUsername: (name: string) => void
  /** Adds (or subtracts, if negative) to the points balance. Never goes below 0. */
  addPoints: (delta: number) => void
  setPoints: (value: number) => void
  /** Awards CHECK_IN_POINTS and records the check-in. No-ops (returns false) if already checked in today. */
  checkIn: () => boolean
  resetLoyalty: () => void
}

const LoyaltyContext = createContext<LoyaltyContextValue | null>(null)

// ---------------------------------------------------------------------------
// Derived-value helpers
// ---------------------------------------------------------------------------

function tierForPoints(points: number): Tier {
  let result: Tier = 'V0'
  for (const tier of TIER_ORDER) {
    if (points >= TIER_THRESHOLDS[tier]) result = tier
  }
  return result
}

function progressForPoints(points: number, tier: Tier): number {
  const currentIndex = TIER_ORDER.indexOf(tier)
  if (currentIndex === TIER_ORDER.length - 1) return 100 // max tier

  const nextTier = TIER_ORDER[currentIndex + 1]
  const floor = TIER_THRESHOLDS[tier]
  const ceiling = TIER_THRESHOLDS[nextTier]
  const span = ceiling - floor
  if (span <= 0) return 100

  const pct = ((points - floor) / span) * 100
  return Math.min(100, Math.max(0, Math.round(pct)))
}

function requirementsForPoints(points: number, tier: Tier): string[] {
  const currentIndex = TIER_ORDER.indexOf(tier)
  if (currentIndex === TIER_ORDER.length - 1) return []

  const nextTier = TIER_ORDER[currentIndex + 1]
  const remaining = Math.max(0, TIER_THRESHOLDS[nextTier] - points)
  return [`Earn ${remaining.toLocaleString()} more points to reach ${nextTier}`]
}

function isSameCalendarDay(a: number, b: number): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate()
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'wishdrop:loyalty'

/**
 * MOCK DATA — there's no real points-earning flow wired up yet from actual
 * checkout, so this seeds a plausible mid-journey member instead of a blank
 * "Member / 0 points" on first load. 1,240 sits partway through the
 * V1→V2 segment (500–2000), a more useful default to design/test against
 * than the V0 floor. Delete/replace this once real account + order data
 * exists.
 */
const MOCK_STATE: LoyaltyState = {
  username: 'Ava Chen',
  points: 1240,
  lastCheckInAt: null,
}

const DEFAULT_STATE: LoyaltyState = MOCK_STATE

function loadInitialState(): LoyaltyState {
  if (typeof window === 'undefined') return DEFAULT_STATE
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STATE
    const parsed = JSON.parse(raw)
    return {
      username: typeof parsed.username === 'string' && parsed.username.trim() ? parsed.username : DEFAULT_STATE.username,
      points: typeof parsed.points === 'number' && Number.isFinite(parsed.points) ? Math.max(0, parsed.points) : DEFAULT_STATE.points,
      lastCheckInAt: typeof parsed.lastCheckInAt === 'number' ? parsed.lastCheckInAt : null,
    }
  } catch {
    return DEFAULT_STATE
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function LoyaltyProvider({ children }: { children: ReactNode }) {
  // Same SSR-safe hydration dance as Wishlistcontext/Cartcontext: render
  // the same default (the mock state) on server and client, then swap in
  // whatever's actually in localStorage in an effect (client-only,
  // post-reconcile), and flip `hydrated` so consumers know when it's safe
  // to trust the data.
  const [username, setUsernameState] = useState(DEFAULT_STATE.username)
  const [points, setPointsState] = useState(DEFAULT_STATE.points)
  const [lastCheckInAt, setLastCheckInAt] = useState<number | null>(DEFAULT_STATE.lastCheckInAt)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const initial = loadInitialState()
    setUsernameState(initial.username)
    setPointsState(initial.points)
    setLastCheckInAt(initial.lastCheckInAt)
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      const payload: LoyaltyState = { username, points, lastCheckInAt }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // Storage can fail (quota, private mode) — losing persistence isn't
      // worth crashing the loyalty feature over.
    }
  }, [username, points, lastCheckInAt, hydrated])

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return
      try {
        const parsed = e.newValue ? JSON.parse(e.newValue) : null
        if (!parsed) return
        if (typeof parsed.username === 'string') setUsernameState(parsed.username)
        if (typeof parsed.points === 'number') setPointsState(Math.max(0, parsed.points))
        if (typeof parsed.lastCheckInAt === 'number' || parsed.lastCheckInAt === null) {
          setLastCheckInAt(parsed.lastCheckInAt)
        }
      } catch {
        // ignore malformed cross-tab payloads
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setUsername = useCallback((name: string) => {
    setUsernameState(name.trim() || DEFAULT_STATE.username)
  }, [])

  const addPoints = useCallback((delta: number) => {
    if (!Number.isFinite(delta)) return
    setPointsState((prev) => Math.max(0, prev + delta))
  }, [])

  const setPoints = useCallback((value: number) => {
    setPointsState(Number.isFinite(value) ? Math.max(0, value) : 0)
  }, [])

  const canCheckInToday = useMemo(() => {
    if (lastCheckInAt === null) return true
    return !isSameCalendarDay(lastCheckInAt, Date.now())
  }, [lastCheckInAt])

  const checkIn = useCallback((): boolean => {
    const now = Date.now()
    if (lastCheckInAt !== null && isSameCalendarDay(lastCheckInAt, now)) {
      return false // already checked in today
    }
    setPointsState((prev) => prev + CHECK_IN_POINTS)
    setLastCheckInAt(now)
    return true
  }, [lastCheckInAt])

  const resetLoyalty = useCallback(() => {
    setUsernameState(DEFAULT_STATE.username)
    setPointsState(DEFAULT_STATE.points)
    setLastCheckInAt(DEFAULT_STATE.lastCheckInAt)
  }, [])

  const tier = useMemo(() => tierForPoints(points), [points])
  const progressToNext = useMemo(() => progressForPoints(points, tier), [points, tier])
  const nextTierRequirements = useMemo(() => requirementsForPoints(points, tier), [points, tier])

  const value = useMemo<LoyaltyContextValue>(
    () => ({
      hydrated,
      username,
      points,
      lastCheckInAt,
      tier,
      progressToNext,
      nextTierRequirements,
      canCheckInToday,
      setUsername,
      addPoints,
      setPoints,
      checkIn,
      resetLoyalty,
    }),
    [
      hydrated,
      username,
      points,
      lastCheckInAt,
      tier,
      progressToNext,
      nextTierRequirements,
      canCheckInToday,
      setUsername,
      addPoints,
      setPoints,
      checkIn,
      resetLoyalty,
    ],
  )

  return <LoyaltyContext.Provider value={value}>{children}</LoyaltyContext.Provider>
}

export function useLoyalty() {
  const ctx = useContext(LoyaltyContext)
  if (!ctx) throw new Error('useLoyalty must be used within a <LoyaltyProvider>')
  return ctx
}