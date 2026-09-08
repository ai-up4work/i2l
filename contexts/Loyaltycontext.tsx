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

import type { Order } from '@/contexts/Ordercontexts'
import {
  TIER_ORDER,
  TIER_THRESHOLDS,
  CHECK_IN_POINTS,
  MILESTONE_POINTS,
  pointsForOrder,
  pointsForMilestone,
  hasReachedFiveOrdersMilestone,
  canGrantCampaign,
  type Tier,
  type MilestoneKey,
} from '@/lib/loyaltyPoints'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type { Tier, MilestoneKey }
export { TIER_ORDER, TIER_THRESHOLDS, CHECK_IN_POINTS, MILESTONE_POINTS }

type LoyaltyState = {
  username: string
  points: number
  /** Epoch ms of the last successful check-in, or null if never checked in. */
  lastCheckInAt: number | null
  /** Milestone keys already claimed — each can only ever be claimed once. */
  claimedMilestones: MilestoneKey[]
  /** Order ids already awarded points for — prevents the same delivered
   *  order from paying out twice if the award job runs more than once. */
  claimedOrderIds: string[]
  /** Broadcast/admin campaign ids already granted to this account. */
  claimedCampaignIds: string[]
}

type LoyaltyContextValue = {
  hydrated: boolean

  username: string
  points: number
  lastCheckInAt: number | null

  tier: Tier
  progressToNext: number
  nextTierRequirements: string[]
  canCheckInToday: boolean

  setUsername: (name: string) => void
  /** Directly adds/subtracts points. Never goes below 0. Use only for
   *  manual/admin adjustments or amounts already computed elsewhere —
   *  prefer the rule-governed functions below for anything user-triggered. */
  addPoints: (delta: number) => void
  setPoints: (value: number) => void

  /**
   * Awards points for a real delivered order via lib's `pointsForOrder`.
   * No-ops (returns 0) if the order isn't 'Delivered', or if this order id
   * has already been awarded. Safe to call repeatedly on the same order —
   * only the first eligible call pays out.
   */
  addOrderPoints: (order: Order) => number
  /**
   * Claims a one-time milestone bonus (firstPurchase, mobileVerified,
   * firstBoardShared). Returns the amount awarded, or 0 if this account
   * has already claimed it. `mobileVerified` should only ever be called
   * after OTP verification succeeds, not on the raw form submit.
   */
  claimMilestone: (key: Exclude<MilestoneKey, 'fiveOrdersCompleted'>) => number
  /**
   * Checks the 5-orders milestone against the account's current count of
   * eligible (Delivered, non-cancelled) orders, and claims it if reached
   * and not already claimed. Pass the count from your orders data source.
   * Returns the amount awarded, or 0.
   */
  claimFiveOrdersMilestoneIfReached: (eligibleOrderCount: number) => number
  /** Awards CHECK_IN_POINTS once per calendar day. Returns false if already checked in today. */
  checkIn: () => boolean
  /**
   * Grants a broadcast/admin campaign's points (e.g. a festival gift sent
   * to all V3 members) — NOT subject to any per-account earning cap, since
   * this isn't triggered by user action. Idempotent per `campaignId`:
   * returns 0 if this account has already been granted that campaign,
   * however many times the admin job runs.
   */
  grantBroadcastPoints: (campaignId: string, points: number) => number

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
  if (currentIndex === TIER_ORDER.length - 1) return 100

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

const MOCK_STATE: LoyaltyState = {
  username: 'Ava Chen',
  points: 1240,
  lastCheckInAt: null,
  claimedMilestones: [],
  claimedOrderIds: [],
  claimedCampaignIds: [],
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
      claimedMilestones: Array.isArray(parsed.claimedMilestones) ? parsed.claimedMilestones : [],
      claimedOrderIds: Array.isArray(parsed.claimedOrderIds) ? parsed.claimedOrderIds : [],
      claimedCampaignIds: Array.isArray(parsed.claimedCampaignIds) ? parsed.claimedCampaignIds : [],
    }
  } catch {
    return DEFAULT_STATE
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function LoyaltyProvider({ children }: { children: ReactNode }) {
  const [username, setUsernameState] = useState(DEFAULT_STATE.username)
  const [points, setPointsState] = useState(DEFAULT_STATE.points)
  const [lastCheckInAt, setLastCheckInAt] = useState<number | null>(DEFAULT_STATE.lastCheckInAt)
  const [claimedMilestones, setClaimedMilestones] = useState<MilestoneKey[]>(DEFAULT_STATE.claimedMilestones)
  const [claimedOrderIds, setClaimedOrderIds] = useState<string[]>(DEFAULT_STATE.claimedOrderIds)
  const [claimedCampaignIds, setClaimedCampaignIds] = useState<string[]>(DEFAULT_STATE.claimedCampaignIds)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const initial = loadInitialState()
    setUsernameState(initial.username)
    setPointsState(initial.points)
    setLastCheckInAt(initial.lastCheckInAt)
    setClaimedMilestones(initial.claimedMilestones)
    setClaimedOrderIds(initial.claimedOrderIds)
    setClaimedCampaignIds(initial.claimedCampaignIds)
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      const payload: LoyaltyState = {
        username,
        points,
        lastCheckInAt,
        claimedMilestones,
        claimedOrderIds,
        claimedCampaignIds,
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // Storage can fail (quota, private mode) — losing persistence isn't
      // worth crashing the loyalty feature over.
    }
  }, [username, points, lastCheckInAt, claimedMilestones, claimedOrderIds, claimedCampaignIds, hydrated])

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
        if (Array.isArray(parsed.claimedMilestones)) setClaimedMilestones(parsed.claimedMilestones)
        if (Array.isArray(parsed.claimedOrderIds)) setClaimedOrderIds(parsed.claimedOrderIds)
        if (Array.isArray(parsed.claimedCampaignIds)) setClaimedCampaignIds(parsed.claimedCampaignIds)
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

  const addOrderPoints = useCallback(
    (order: Order): number => {
      if (claimedOrderIds.includes(order.id)) return 0
      const awarded = pointsForOrder(order)
      if (!awarded) return 0
      setPointsState((prev) => prev + awarded)
      setClaimedOrderIds((prev) => [...prev, order.id])
      return awarded
    },
    [claimedOrderIds],
  )

  const claimMilestone = useCallback(
    (key: Exclude<MilestoneKey, 'fiveOrdersCompleted'>): number => {
      const alreadyClaimed = claimedMilestones.includes(key)
      const awarded = pointsForMilestone(key, alreadyClaimed)
      if (awarded <= 0) return 0
      setPointsState((prev) => prev + awarded)
      setClaimedMilestones((prev) => [...prev, key])
      return awarded
    },
    [claimedMilestones],
  )

  const claimFiveOrdersMilestoneIfReached = useCallback(
    (eligibleOrderCount: number): number => {
      const key: MilestoneKey = 'fiveOrdersCompleted'
      const alreadyClaimed = claimedMilestones.includes(key)
      if (alreadyClaimed || !hasReachedFiveOrdersMilestone(eligibleOrderCount)) return 0
      const awarded = pointsForMilestone(key, false)
      setPointsState((prev) => prev + awarded)
      setClaimedMilestones((prev) => [...prev, key])
      return awarded
    },
    [claimedMilestones],
  )

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

  const grantBroadcastPoints = useCallback(
    (campaignId: string, campaignPoints: number): number => {
      if (!canGrantCampaign(campaignId, claimedCampaignIds)) return 0
      setPointsState((prev) => prev + campaignPoints)
      setClaimedCampaignIds((prev) => [...prev, campaignId])
      return campaignPoints
    },
    [claimedCampaignIds],
  )

  const resetLoyalty = useCallback(() => {
    setUsernameState(DEFAULT_STATE.username)
    setPointsState(DEFAULT_STATE.points)
    setLastCheckInAt(DEFAULT_STATE.lastCheckInAt)
    setClaimedMilestones(DEFAULT_STATE.claimedMilestones)
    setClaimedOrderIds(DEFAULT_STATE.claimedOrderIds)
    setClaimedCampaignIds(DEFAULT_STATE.claimedCampaignIds)
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
      addOrderPoints,
      claimMilestone,
      claimFiveOrdersMilestoneIfReached,
      checkIn,
      grantBroadcastPoints,
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
      addOrderPoints,
      claimMilestone,
      claimFiveOrdersMilestoneIfReached,
      checkIn,
      grantBroadcastPoints,
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