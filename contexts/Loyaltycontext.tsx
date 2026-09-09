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

export type PointsTransactionKind = 'earned' | 'used' | 'expired'
export type CreditTransactionKind = 'refund' | 'referral' | 'used' | 'adjustment'

export type PointsTransaction = {
  id: string
  kind: PointsTransactionKind
  label: string
  /** Epoch ms — page-level code formats this for display. */
  timestamp: number
  /** Positive for earned, negative for used/expired. */
  amount: number
}

export type CreditTransaction = {
  id: string
  kind: CreditTransactionKind
  label: string
  timestamp: number
  /** Positive for refund/referral/adjustment-in, negative for spend. */
  amount: number
}

type LoyaltyState = {
  points: number
  credits: number
  lastCheckInAt: number | null
  claimedMilestones: MilestoneKey[]
  claimedOrderIds: string[]
  claimedCampaignIds: string[]
  transactions: PointsTransaction[]
  creditTransactions: CreditTransaction[]
}

type LoyaltyContextValue = {
  hydrated: boolean

  points: number
  lastCheckInAt: number | null
  transactions: PointsTransaction[]

  /**
   * Non-expiring wallet balance. Sourced from refunds, referrals, and
   * manual adjustments — never from activity (check-ins, reviews, etc.),
   * and never affects `tier`. There is deliberately no withdraw action:
   * like Shein's real wallet, credits can only be spent on future
   * purchases here, never sent back out to a bank/card.
   */
  credits: number
  creditTransactions: CreditTransaction[]

  tier: Tier
  progressToNext: number
  nextTierRequirements: string[]
  canCheckInToday: boolean

  addPoints: (delta: number, label?: string) => void
  setPoints: (value: number) => void

  /** Refunds, referral bonuses, manual credit grants. Never touches tier. */
  addCredits: (amount: number, label: string) => void
  /** Spend credits at checkout. Returns false if balance is insufficient. */
  useCredits: (amount: number, label: string) => boolean

  addOrderPoints: (order: Order) => number
  claimMilestone: (key: Exclude<MilestoneKey, 'fiveOrdersCompleted'>) => number
  claimFiveOrdersMilestoneIfReached: (eligibleOrderCount: number) => number
  checkIn: () => boolean
  grantBroadcastPoints: (campaignId: string, points: number) => number
  usePoints: (amount: number, label: string) => boolean

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

function makeTxId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'wishdrop:loyalty'

/**
 * Genuinely empty starting state — NOT sample/demo data. A brand-new or
 * not-yet-loaded member has zero points, zero credits, and no history.
 * If you render this, the UI should already be behind the `hydrated`
 * gate, so nobody ever actually sees these zeros as "their" data.
 */
const EMPTY_STATE: LoyaltyState = {
  points: 0,
  credits: 0,
  lastCheckInAt: null,
  claimedMilestones: [],
  claimedOrderIds: [],
  claimedCampaignIds: [],
  transactions: [],
  creditTransactions: [],
}

function parseStoredState(raw: string): LoyaltyState {
  try {
    const parsed = JSON.parse(raw)
    return {
      points: typeof parsed.points === 'number' && Number.isFinite(parsed.points) ? Math.max(0, parsed.points) : EMPTY_STATE.points,
      credits: typeof parsed.credits === 'number' && Number.isFinite(parsed.credits) ? Math.max(0, parsed.credits) : EMPTY_STATE.credits,
      lastCheckInAt: typeof parsed.lastCheckInAt === 'number' ? parsed.lastCheckInAt : null,
      claimedMilestones: Array.isArray(parsed.claimedMilestones) ? parsed.claimedMilestones : [],
      claimedOrderIds: Array.isArray(parsed.claimedOrderIds) ? parsed.claimedOrderIds : [],
      claimedCampaignIds: Array.isArray(parsed.claimedCampaignIds) ? parsed.claimedCampaignIds : [],
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      creditTransactions: Array.isArray(parsed.creditTransactions) ? parsed.creditTransactions : [],
    }
  } catch {
    return EMPTY_STATE
  }
}

/**
 * Loads the member's real loyalty state. Replace the body of this
 * function with your actual API call (e.g. `fetch('/api/loyalty')`).
 * It's async on purpose — that's what makes `hydrated` a truthful signal
 * instead of a formality that resolves before the first paint.
 *
 * Falls back to localStorage for now (still async, since it's opened
 * with `await` below) so the app keeps working before the API exists.
 */
async function fetchInitialState(): Promise<LoyaltyState> {
  if (typeof window === 'undefined') return EMPTY_STATE

  // --- Swap this block for your real API call ---
  // const res = await fetch('/api/loyalty', { credentials: 'include' })
  // if (!res.ok) return EMPTY_STATE
  // const data = await res.json()
  // return parseStoredState(JSON.stringify(data))
  // ------------------------------------------------

  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return EMPTY_STATE
  return parseStoredState(raw)
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function LoyaltyProvider({ children }: { children: ReactNode }) {
  const [points, setPointsState] = useState(EMPTY_STATE.points)
  const [credits, setCreditsState] = useState(EMPTY_STATE.credits)
  const [lastCheckInAt, setLastCheckInAt] = useState<number | null>(EMPTY_STATE.lastCheckInAt)
  const [claimedMilestones, setClaimedMilestones] = useState<MilestoneKey[]>(EMPTY_STATE.claimedMilestones)
  const [claimedOrderIds, setClaimedOrderIds] = useState<string[]>(EMPTY_STATE.claimedOrderIds)
  const [claimedCampaignIds, setClaimedCampaignIds] = useState<string[]>(EMPTY_STATE.claimedCampaignIds)
  const [transactions, setTransactions] = useState<PointsTransaction[]>(EMPTY_STATE.transactions)
  const [creditTransactions, setCreditTransactions] = useState<CreditTransaction[]>(EMPTY_STATE.creditTransactions)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    let cancelled = false

    fetchInitialState()
      .then((initial) => {
        if (cancelled) return
        setPointsState(initial.points)
        setCreditsState(initial.credits)
        setLastCheckInAt(initial.lastCheckInAt)
        setClaimedMilestones(initial.claimedMilestones)
        setClaimedOrderIds(initial.claimedOrderIds)
        setClaimedCampaignIds(initial.claimedCampaignIds)
        setTransactions(initial.transactions)
        setCreditTransactions(initial.creditTransactions)
      })
      .catch(() => {
        // Real data failed to load — stay on EMPTY_STATE rather than
        // showing stale or fabricated numbers.
      })
      .finally(() => {
        if (!cancelled) setHydrated(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      const payload: LoyaltyState = {
        points,
        credits,
        lastCheckInAt,
        claimedMilestones,
        claimedOrderIds,
        claimedCampaignIds,
        transactions,
        creditTransactions,
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // Storage can fail (quota, private mode) — losing persistence isn't
      // worth crashing the loyalty feature over.
    }
  }, [points, credits, lastCheckInAt, claimedMilestones, claimedOrderIds, claimedCampaignIds, transactions, creditTransactions, hydrated])

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return
      try {
        const parsed = e.newValue ? JSON.parse(e.newValue) : null
        if (!parsed) return
        if (typeof parsed.points === 'number') setPointsState(Math.max(0, parsed.points))
        if (typeof parsed.credits === 'number') setCreditsState(Math.max(0, parsed.credits))
        if (typeof parsed.lastCheckInAt === 'number' || parsed.lastCheckInAt === null) {
          setLastCheckInAt(parsed.lastCheckInAt)
        }
        if (Array.isArray(parsed.claimedMilestones)) setClaimedMilestones(parsed.claimedMilestones)
        if (Array.isArray(parsed.claimedOrderIds)) setClaimedOrderIds(parsed.claimedOrderIds)
        if (Array.isArray(parsed.claimedCampaignIds)) setClaimedCampaignIds(parsed.claimedCampaignIds)
        if (Array.isArray(parsed.transactions)) setTransactions(parsed.transactions)
        if (Array.isArray(parsed.creditTransactions)) setCreditTransactions(parsed.creditTransactions)
      } catch {
        // ignore malformed cross-tab payloads
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const logTransaction = useCallback((kind: PointsTransactionKind, label: string, amount: number) => {
    setTransactions((prev) => [{ id: makeTxId('tx'), kind, label, timestamp: Date.now(), amount }, ...prev])
  }, [])

  const logCreditTransaction = useCallback((kind: CreditTransactionKind, label: string, amount: number) => {
    setCreditTransactions((prev) => [{ id: makeTxId('ctx'), kind, label, timestamp: Date.now(), amount }, ...prev])
  }, [])

  const addPoints = useCallback(
    (delta: number, label = 'Manual adjustment') => {
      if (!Number.isFinite(delta) || delta === 0) return
      setPointsState((prev) => Math.max(0, prev + delta))
      logTransaction(delta > 0 ? 'earned' : 'used', label, delta)
    },
    [logTransaction],
  )

  const setPoints = useCallback((value: number) => {
    setPointsState(Number.isFinite(value) ? Math.max(0, value) : 0)
  }, [])

  // Credits: refunds, referrals, manual grants. Deliberately never
  // affects `points` or `tier` — see LoyaltyContextValue['credits'] doc.
  const addCredits = useCallback(
    (amount: number, label: string) => {
      if (!Number.isFinite(amount) || amount <= 0) return
      setCreditsState((prev) => prev + amount)
      const kind: CreditTransactionKind = /referral/i.test(label)
        ? 'referral'
        : /refund/i.test(label)
          ? 'refund'
          : 'adjustment'
      logCreditTransaction(kind, label, amount)
    },
    [logCreditTransaction],
  )

  const useCreditsFn = useCallback(
    (amount: number, label: string): boolean => {
      if (!Number.isFinite(amount) || amount <= 0) return false
      if (credits < amount) return false
      setCreditsState((prev) => Math.max(0, prev - amount))
      logCreditTransaction('used', label, -amount)
      return true
    },
    [credits, logCreditTransaction],
  )

  const addOrderPoints = useCallback(
    (order: Order): number => {
      if (claimedOrderIds.includes(order.id)) return 0
      const awarded = pointsForOrder(order)
      if (!awarded) return 0
      setPointsState((prev) => prev + awarded)
      setClaimedOrderIds((prev) => [...prev, order.id])
      logTransaction('earned', `Order #${order.id} delivered`, awarded)
      return awarded
    },
    [claimedOrderIds, logTransaction],
  )

  const claimMilestone = useCallback(
    (key: Exclude<MilestoneKey, 'fiveOrdersCompleted'>): number => {
      const alreadyClaimed = claimedMilestones.includes(key)
      const awarded = pointsForMilestone(key, alreadyClaimed)
      if (awarded <= 0) return 0
      setPointsState((prev) => prev + awarded)
      setClaimedMilestones((prev) => [...prev, key])
      logTransaction('earned', milestoneLabel(key), awarded)
      return awarded
    },
    [claimedMilestones, logTransaction],
  )

  const claimFiveOrdersMilestoneIfReached = useCallback(
    (eligibleOrderCount: number): number => {
      const key: MilestoneKey = 'fiveOrdersCompleted'
      const alreadyClaimed = claimedMilestones.includes(key)
      if (alreadyClaimed || !hasReachedFiveOrdersMilestone(eligibleOrderCount)) return 0
      const awarded = pointsForMilestone(key, false)
      setPointsState((prev) => prev + awarded)
      setClaimedMilestones((prev) => [...prev, key])
      logTransaction('earned', milestoneLabel(key), awarded)
      return awarded
    },
    [claimedMilestones, logTransaction],
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
    logTransaction('earned', 'Daily check-in', CHECK_IN_POINTS)
    return true
  }, [lastCheckInAt, logTransaction])

  const grantBroadcastPoints = useCallback(
    (campaignId: string, campaignPoints: number): number => {
      if (!canGrantCampaign(campaignId, claimedCampaignIds)) return 0
      setPointsState((prev) => prev + campaignPoints)
      setClaimedCampaignIds((prev) => [...prev, campaignId])
      logTransaction('earned', `Campaign reward (${campaignId})`, campaignPoints)
      return campaignPoints
    },
    [claimedCampaignIds, logTransaction],
  )

  const usePointsFn = useCallback(
    (amount: number, label: string): boolean => {
      if (!Number.isFinite(amount) || amount <= 0) return false
      if (points < amount) return false
      setPointsState((prev) => Math.max(0, prev - amount))
      logTransaction('used', label, -amount)
      return true
    },
    [points, logTransaction],
  )

  const resetLoyalty = useCallback(() => {
    setPointsState(EMPTY_STATE.points)
    setCreditsState(EMPTY_STATE.credits)
    setLastCheckInAt(EMPTY_STATE.lastCheckInAt)
    setClaimedMilestones(EMPTY_STATE.claimedMilestones)
    setClaimedOrderIds(EMPTY_STATE.claimedOrderIds)
    setClaimedCampaignIds(EMPTY_STATE.claimedCampaignIds)
    setTransactions(EMPTY_STATE.transactions)
    setCreditTransactions(EMPTY_STATE.creditTransactions)
  }, [])

  // Tier is derived from `points` only — `credits` never factors in, by
  // design, so refunding an order can never be used to rank up.
  const tier = useMemo(() => tierForPoints(points), [points])
  const progressToNext = useMemo(() => progressForPoints(points, tier), [points, tier])
  const nextTierRequirements = useMemo(() => requirementsForPoints(points, tier), [points, tier])

  const value = useMemo<LoyaltyContextValue>(
    () => ({
      hydrated,
      points,
      lastCheckInAt,
      transactions,
      credits,
      creditTransactions,
      tier,
      progressToNext,
      nextTierRequirements,
      canCheckInToday,
      addPoints,
      setPoints,
      addCredits,
      useCredits: useCreditsFn,
      addOrderPoints,
      claimMilestone,
      claimFiveOrdersMilestoneIfReached,
      checkIn,
      grantBroadcastPoints,
      usePoints: usePointsFn,
      resetLoyalty,
    }),
    [
      hydrated,
      points,
      lastCheckInAt,
      transactions,
      credits,
      creditTransactions,
      tier,
      progressToNext,
      nextTierRequirements,
      canCheckInToday,
      addPoints,
      setPoints,
      addCredits,
      useCreditsFn,
      addOrderPoints,
      claimMilestone,
      claimFiveOrdersMilestoneIfReached,
      checkIn,
      grantBroadcastPoints,
      usePointsFn,
      resetLoyalty,
    ],
  )

  return <LoyaltyContext.Provider value={value}>{children}</LoyaltyContext.Provider>
}

function milestoneLabel(key: MilestoneKey): string {
  switch (key) {
    case 'firstPurchase':
      return 'First purchase bonus'
    case 'mobileVerified':
      return 'Phone verified bonus'
    case 'firstBoardShared':
      return 'First board shared bonus'
    case 'fiveOrdersCompleted':
      return '5 orders completed bonus'
    default:
      return 'Milestone bonus'
  }
}

export function useLoyalty() {
  const ctx = useContext(LoyaltyContext)
  if (!ctx) throw new Error('useLoyalty must be used within a <LoyaltyProvider>')
  return ctx
}