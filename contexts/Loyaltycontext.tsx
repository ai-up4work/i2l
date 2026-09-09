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
export type CreditTransactionKind = 'refund' | 'referral' | 'gift_card' | 'used' | 'adjustment'

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
  /** Positive for refund/referral/gift-card/adjustment-in, negative for spend. */
  amount: number
}

// --- Referrals -------------------------------------------------------------

export type ReferralStatus = 'invited' | 'joined' | 'rewarded'

export type ReferralEntry = {
  id: string
  name: string
  status: ReferralStatus
  rewardLabel: string | null
  rewardAmount: number | null
  invitedAt: number
  joinedAt: number | null
  rewardedAt: number | null
}

export type ReferralRewardTier = {
  friendCount: number
  label: string
  creditAmount: number
}

/**
 * Referral reward ladder — business config, single source of truth.
 * A bonus fires when your cumulative rewarded-friend count first hits
 * one of these thresholds (1st, 5th, 10th), not on every referral.
 */
export const REFERRAL_REWARD_TIERS: ReferralRewardTier[] = [
  { friendCount: 1, label: '€5 credit', creditAmount: 5 },
  { friendCount: 5, label: '€30 credit', creditAmount: 30 },
  { friendCount: 10, label: '€75 credit + free shipping voucher', creditAmount: 75 },
]

const REFERRAL_LINK_BASE =
  // Swap for your real domain / env var, e.g. process.env.NEXT_PUBLIC_APP_URL
  'https://wishdrop.app'

// --- Gift cards --------------------------------------------------------

export type GiftCardProduct = {
  id: string
  name: string
  image: string
  /** Face value credited when redeemed, e.g. 100 for a "100.00€" card. */
  value: number
  /** What it costs to buy, e.g. 93 for a discounted "93.00€" price. */
  price: number
  currency: string
}

/**
 * Gift card catalog — business config, single source of truth. Purely
 * display/purchase data; redeeming a card is what actually moves money,
 * via the same `credits` wallet refunds and referrals use. There is no
 * separate "gift card balance" — a redeemed card is a credit grant with
 * a distinct transaction label.
 */
export const GIFT_CARD_CATALOG: GiftCardProduct[] = [
  { id: 'gc-classic', name: 'WishDrop Classic', image: '', value: 100, price: 93, currency: '€' },
  { id: 'gc-amazing', name: "You're Amazing", image: '', value: 100, price: 93, currency: '€' },
  { id: 'gc-floral', name: 'WishDrop Floral', image: '', value: 100, price: 93, currency: '€' },
  { id: 'gc-wishes', name: 'Best Wishes', image: '', value: 100, price: 93, currency: '€' },
  { id: 'gc-thanks', name: 'Thank You', image: '', value: 100, price: 93, currency: '€' },
]

// --- Coupons -------------------------------------------------------------

export type CouponDiscountType = 'percent' | 'fixed'
export type CouponScope = 'all' | 'selected'
export type CouponCategory = 'discount' | 'shipping'
export type CouponUsageLimit = 'one-time' | 'multi-use'
/** Derived, not stored — see effectiveCouponStatus. Matches the page's tab keys. */
export type CouponEffectiveStatus = 'unused' | 'used' | 'expired'

export type Coupon = {
  id: string
  code: string
  title: string
  discountType: CouponDiscountType
  discountValue: number
  minOrderValue: number
  maxDiscount: number | null
  scope: CouponScope
  category: CouponCategory
  usageLimit: CouponUsageLimit
  issuedAt: number
  expiresAt: number
  /** Set once redeemed. A coupon's *used* state is authoritative here; expiry is derived at read time instead of stored, so it never goes stale. */
  usedAt: number | null
}

type GrantCouponParams = {
  title: string
  discountType: CouponDiscountType
  discountValue: number
  minOrderValue: number
  maxDiscount?: number
  scope: CouponScope
  category: CouponCategory
  usageLimit: CouponUsageLimit
  validForDays: number
}

/** A coupon's status is computed, not stored, so it can never be stale relative to the clock. */
export function effectiveCouponStatus(coupon: Coupon, now: number = Date.now()): CouponEffectiveStatus {
  if (coupon.usedAt !== null) return 'used'
  if (coupon.expiresAt < now) return 'expired'
  return 'unused'
}

const EXPIRING_SOON_WINDOW_MS = 3 * 24 * 60 * 60 * 1000 // 3 days
const NEW_WINDOW_MS = 3 * 24 * 60 * 60 * 1000 // 3 days

export function isCouponExpiringSoon(coupon: Coupon, now: number = Date.now()): boolean {
  return effectiveCouponStatus(coupon, now) === 'unused' && coupon.expiresAt - now <= EXPIRING_SOON_WINDOW_MS
}

export function isCouponNew(coupon: Coupon, now: number = Date.now()): boolean {
  return now - coupon.issuedAt <= NEW_WINDOW_MS
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
  referralCode: string
  referredFriends: ReferralEntry[]
  coupons: Coupon[]
}

type LoyaltyContextValue = {
  hydrated: boolean

  points: number
  lastCheckInAt: number | null
  transactions: PointsTransaction[]

  /**
   * Non-expiring wallet balance. Sourced from refunds, referrals, gift
   * card redemptions, and manual adjustments — never from activity, and
   * never affects `tier`. No withdraw action exists on purpose: credits
   * can only be spent on future purchases, never cashed out.
   */
  credits: number
  creditTransactions: CreditTransaction[]

  tier: Tier
  progressToNext: number
  nextTierRequirements: string[]
  canCheckInToday: boolean

  addPoints: (delta: number, label?: string) => void
  setPoints: (value: number) => void

  addCredits: (amount: number, label: string) => void
  useCredits: (amount: number, label: string) => boolean

  addOrderPoints: (order: Order) => number
  claimMilestone: (key: Exclude<MilestoneKey, 'fiveOrdersCompleted'>) => number
  claimFiveOrdersMilestoneIfReached: (eligibleOrderCount: number) => number
  checkIn: () => boolean
  grantBroadcastPoints: (campaignId: string, points: number) => number
  usePoints: (amount: number, label: string) => boolean

  // --- Referrals ---
  referralCode: string
  referralLink: string
  referredFriends: ReferralEntry[]
  rewardTiers: ReferralRewardTier[]
  inviteFriend: (name: string) => string
  markFriendJoined: (id: string) => void
  rewardReferral: (id: string) => number

  // --- Gift cards ---
  giftCardCatalog: GiftCardProduct[]
  /**
   * Redeems a gift card code for its face value, crediting the wallet.
   * Returns the credited amount (0 on failure). Mock validator only —
   * see implementation note in the provider for what a real backend
   * check needs to cover (uniqueness, single-redemption, region).
   */
  redeemGiftCard: (code: string) => number

  // --- Coupons ---
  coupons: Coupon[]
  /** Issues a new coupon (admin grant, campaign, or internal reward trigger). Returns the new coupon's id. */
  grantCoupon: (params: GrantCouponParams) => string
  /** Redeems a coupon at checkout. Returns false if already used/expired/not found. */
  useCoupon: (id: string) => boolean

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

function generateReferralCode(): string {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `WISH-${random}`
}

function generateCouponCode(): string {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `WD${random}`
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'wishdrop:loyalty'

/**
 * Genuinely empty starting state — NOT sample/demo data. `referralCode`
 * is left blank here; it gets generated once inside fetchInitialState
 * (never inline in a component) and persisted from then on. If you
 * render this, the UI should already be behind `hydrated`, so nobody
 * ever sees these placeholders as "their" data.
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
  referralCode: '',
  referredFriends: [],
  coupons: [],
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
      referralCode: typeof parsed.referralCode === 'string' && parsed.referralCode ? parsed.referralCode : generateReferralCode(),
      referredFriends: Array.isArray(parsed.referredFriends) ? parsed.referredFriends : [],
      coupons: Array.isArray(parsed.coupons) ? parsed.coupons : [],
    }
  } catch {
    return { ...EMPTY_STATE, referralCode: generateReferralCode() }
  }
}

/**
 * Loads the member's real loyalty state. Replace the body with your
 * actual API call (e.g. `fetch('/api/loyalty')`). It's async on purpose
 * — that's what makes `hydrated` truthful instead of a formality that
 * resolves before the first paint. Falls back to localStorage for now.
 */
async function fetchInitialState(): Promise<LoyaltyState> {
  if (typeof window === 'undefined') return { ...EMPTY_STATE, referralCode: generateReferralCode() }

  // --- Swap this block for your real API call ---
  // const res = await fetch('/api/loyalty', { credentials: 'include' })
  // if (!res.ok) return { ...EMPTY_STATE, referralCode: generateReferralCode() }
  // const data = await res.json()
  // return parseStoredState(JSON.stringify(data))
  // ------------------------------------------------

  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return { ...EMPTY_STATE, referralCode: generateReferralCode() }
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
  const [referralCode, setReferralCode] = useState(EMPTY_STATE.referralCode)
  const [referredFriends, setReferredFriends] = useState<ReferralEntry[]>(EMPTY_STATE.referredFriends)
  const [coupons, setCoupons] = useState<Coupon[]>(EMPTY_STATE.coupons)
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
        setReferralCode(initial.referralCode)
        setReferredFriends(initial.referredFriends)
        setCoupons(initial.coupons)
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
        referralCode,
        referredFriends,
        coupons,
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // Storage can fail (quota, private mode) — losing persistence isn't
      // worth crashing the loyalty feature over.
    }
  }, [
    points,
    credits,
    lastCheckInAt,
    claimedMilestones,
    claimedOrderIds,
    claimedCampaignIds,
    transactions,
    creditTransactions,
    referralCode,
    referredFriends,
    coupons,
    hydrated,
  ])

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
        if (typeof parsed.referralCode === 'string' && parsed.referralCode) setReferralCode(parsed.referralCode)
        if (Array.isArray(parsed.referredFriends)) setReferredFriends(parsed.referredFriends)
        if (Array.isArray(parsed.coupons)) setCoupons(parsed.coupons)
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

  const addCredits = useCallback(
    (amount: number, label: string) => {
      if (!Number.isFinite(amount) || amount <= 0) return
      setCreditsState((prev) => prev + amount)
      const kind: CreditTransactionKind = /gift card/i.test(label)
        ? 'gift_card'
        : /referral/i.test(label)
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

  // --- Referrals -----------------------------------------------------------

  const inviteFriend = useCallback((name: string): string => {
    const id = makeTxId('ref')
    const entry: ReferralEntry = {
      id,
      name,
      status: 'invited',
      rewardLabel: null,
      rewardAmount: null,
      invitedAt: Date.now(),
      joinedAt: null,
      rewardedAt: null,
    }
    setReferredFriends((prev) => [entry, ...prev])
    return id
  }, [])

  const markFriendJoined = useCallback((id: string) => {
    setReferredFriends((prev) =>
      prev.map((f) => (f.id === id && f.status === 'invited' ? { ...f, status: 'joined', joinedAt: Date.now() } : f)),
    )
  }, [])

  const rewardReferral = useCallback(
    (id: string): number => {
      const target = referredFriends.find((f) => f.id === id)
      if (!target || target.status !== 'joined') return 0

      const alreadyRewardedCount = referredFriends.filter((f) => f.status === 'rewarded').length
      const ordinal = alreadyRewardedCount + 1
      const tier = REFERRAL_REWARD_TIERS.find((t) => t.friendCount === ordinal)

      const awarded = tier?.creditAmount ?? 0
      const label = tier?.label ?? 'Counted toward next reward tier'

      setReferredFriends((prev) =>
        prev.map((f) =>
          f.id === id
            ? { ...f, status: 'rewarded', rewardedAt: Date.now(), rewardAmount: awarded, rewardLabel: label }
            : f,
        ),
      )

      if (awarded > 0) {
        addCredits(awarded, `Referral bonus — ${target.name} (${label})`)
      }

      return awarded
    },
    [referredFriends, addCredits],
  )

  // --- Gift cards ------------------------------------------------------

  const redeemGiftCard = useCallback(
    (code: string): number => {
      const trimmed = code.trim()
      // Mock validation only. A real implementation MUST verify the
      // code server-side: that it exists, hasn't already been redeemed
      // (codes are bearer tokens — first redemption wins), and belongs
      // to a valid, unexpired batch. Never trust a client-side check
      // for something that grants real balance.
      if (trimmed.length < 6) return 0

      // Face value isn't derivable from an opaque code client-side in a
      // real system — the API response would return it directly. This
      // placeholder just exercises the credit + transaction wiring; wire
      // it to the API's returned amount once a real backend exists.
      const amount = GIFT_CARD_CATALOG[0]?.value ?? 0
      if (amount <= 0) return 0

      addCredits(amount, `Gift card redeemed (${trimmed})`)
      return amount
    },
    [addCredits],
  )

  // --- Coupons -----------------------------------------------------------

  const grantCoupon = useCallback((params: GrantCouponParams): string => {
    const id = makeTxId('cpn')
    const now = Date.now()
    const coupon: Coupon = {
      id,
      code: generateCouponCode(),
      title: params.title,
      discountType: params.discountType,
      discountValue: params.discountValue,
      minOrderValue: params.minOrderValue,
      maxDiscount: params.maxDiscount ?? null,
      scope: params.scope,
      category: params.category,
      usageLimit: params.usageLimit,
      issuedAt: now,
      expiresAt: now + params.validForDays * 24 * 60 * 60 * 1000,
      usedAt: null,
    }
    setCoupons((prev) => [coupon, ...prev])
    return id
  }, [])

  const useCoupon = useCallback(
    (id: string): boolean => {
      const target = coupons.find((c) => c.id === id)
      if (!target) return false
      if (effectiveCouponStatus(target) !== 'unused') return false
      setCoupons((prev) => prev.map((c) => (c.id === id ? { ...c, usedAt: Date.now() } : c)))
      return true
    },
    [coupons],
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
    setReferredFriends(EMPTY_STATE.referredFriends)
    setCoupons(EMPTY_STATE.coupons)
    // referralCode intentionally NOT reset — it's a stable identifier for
    // links already shared; regenerating it would break outstanding shares.
  }, [])

  // Tier is derived from `points` only — `credits` never factors in, by
  // design, so refunding an order can never be used to rank up.
  const tier = useMemo(() => tierForPoints(points), [points])
  const progressToNext = useMemo(() => progressForPoints(points, tier), [points, tier])
  const nextTierRequirements = useMemo(() => requirementsForPoints(points, tier), [points, tier])
  const referralLink = useMemo(() => `${REFERRAL_LINK_BASE}/join?ref=${referralCode}`, [referralCode])

  // Grants the VipPage-advertised "Level-Up Coupon" (V2 reward) the
  // moment tier actually increases — not on mount, and not on tier
  // decreases (there aren't any today, but this guards intent either
  // way). prevTierRef starts `null` so the *first* render after
  // hydration just records the baseline tier instead of firing a grant
  // for whatever tier the member already happened to be at.
  const prevTierRef = useRef<Tier | null>(null)
  useEffect(() => {
    if (!hydrated) return
    if (prevTierRef.current === null) {
      prevTierRef.current = tier
      return
    }
    const wentUp = TIER_ORDER.indexOf(tier) > TIER_ORDER.indexOf(prevTierRef.current)
    if (wentUp) {
      grantCoupon({
        title: `Level-up reward — welcome to ${tier}`,
        discountType: 'percent',
        discountValue: 15,
        minOrderValue: 29,
        maxDiscount: 30,
        scope: 'selected',
        category: 'discount',
        usageLimit: 'one-time',
        validForDays: 30,
      })
    }
    prevTierRef.current = tier
  }, [tier, hydrated, grantCoupon])

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
      referralCode,
      referralLink,
      referredFriends,
      rewardTiers: REFERRAL_REWARD_TIERS,
      inviteFriend,
      markFriendJoined,
      rewardReferral,
      giftCardCatalog: GIFT_CARD_CATALOG,
      redeemGiftCard,
      coupons,
      grantCoupon,
      useCoupon,
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
      referralCode,
      referralLink,
      referredFriends,
      inviteFriend,
      markFriendJoined,
      rewardReferral,
      redeemGiftCard,
      coupons,
      grantCoupon,
      useCoupon,
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