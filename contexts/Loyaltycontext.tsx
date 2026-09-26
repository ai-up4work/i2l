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
// Types (unchanged from the mock version — every consumer keeps working)
// ---------------------------------------------------------------------------

export type { Tier, MilestoneKey }
export { TIER_ORDER, TIER_THRESHOLDS, CHECK_IN_POINTS, MILESTONE_POINTS }

export type PointsTransactionKind = 'earned' | 'used' | 'expired'
export type CreditTransactionKind = 'refund' | 'referral' | 'gift_card' | 'used' | 'adjustment'

export type PointsTransaction = {
  id: string
  kind: PointsTransactionKind
  label: string
  timestamp: number
  amount: number
}

export type CreditTransaction = {
  id: string
  kind: CreditTransactionKind
  label: string
  timestamp: number
  amount: number
}

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

export const REFERRAL_REWARD_TIERS: ReferralRewardTier[] = [
  { friendCount: 1, label: '€5 credit', creditAmount: 5 },
  { friendCount: 5, label: '€30 credit', creditAmount: 30 },
  { friendCount: 10, label: '€75 credit + free shipping voucher', creditAmount: 75 },
]

const REFERRAL_LINK_BASE = 'https://Wishdrop.app'

export type GiftCardProduct = {
  id: string
  name: string
  image: string
  value: number
  price: number
  currency: string
}

export const GIFT_CARD_CATALOG: GiftCardProduct[] = [
  { id: 'gc-classic', name: 'Wishdrop Classic', image: '', value: 100, price: 93, currency: '€' },
  { id: 'gc-amazing', name: "You're Amazing", image: '', value: 100, price: 93, currency: '€' },
  { id: 'gc-floral', name: 'Wishdrop Floral', image: '', value: 100, price: 93, currency: '€' },
  { id: 'gc-wishes', name: 'Best Wishes', image: '', value: 100, price: 93, currency: '€' },
  { id: 'gc-thanks', name: 'Thank You', image: '', value: 100, price: 93, currency: '€' },
]

export type CouponDiscountType = 'percent' | 'fixed'
export type CouponScope = 'all' | 'selected'
export type CouponCategory = 'discount' | 'shipping'
export type CouponUsageLimit = 'one-time' | 'multi-use'
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

export function effectiveCouponStatus(coupon: Coupon, now: number = Date.now()): CouponEffectiveStatus {
  if (coupon.usedAt !== null) return 'used'
  if (coupon.expiresAt < now) return 'expired'
  return 'unused'
}

const EXPIRING_SOON_WINDOW_MS = 3 * 24 * 60 * 60 * 1000
const NEW_WINDOW_MS = 3 * 24 * 60 * 60 * 1000

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

  referralCode: string
  referralLink: string
  referredFriends: ReferralEntry[]
  rewardTiers: ReferralRewardTier[]
  inviteFriend: (name: string) => string
  markFriendJoined: (id: string) => void
  rewardReferral: (id: string) => number

  giftCardCatalog: GiftCardProduct[]
  /** Now a REAL redemption against the `gift_cards` table — returns the
   *  credited amount (0 on failure: not found, already redeemed, expired,
   *  or not logged in). Requires migration 0004. */
  redeemGiftCard: (code: string) => Promise<number>

  coupons: Coupon[]
  grantCoupon: (params: GrantCouponParams) => string
  useCoupon: (id: string) => boolean

  resetLoyalty: () => void
}

const LoyaltyContext = createContext<LoyaltyContextValue | null>(null)

// ---------------------------------------------------------------------------
// Derived-value helpers (unchanged)
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
  return `WISH-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
}

function generateCouponCode(): string {
  return `WD${Math.random().toString(36).slice(2, 8).toUpperCase()}`
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

// ---------------------------------------------------------------------------
// Guest (localStorage) persistence — unauthenticated visitors still get a
// working (if not very meaningful) loyalty experience, same as before.
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'Wishdrop:loyalty'

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

function loadGuestState(): LoyaltyState {
  if (typeof window === 'undefined') return { ...EMPTY_STATE, referralCode: generateReferralCode() }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...EMPTY_STATE, referralCode: generateReferralCode() }
    const parsed = JSON.parse(raw)
    return {
      points: typeof parsed.points === 'number' ? Math.max(0, parsed.points) : 0,
      credits: typeof parsed.credits === 'number' ? Math.max(0, parsed.credits) : 0,
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

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function LoyaltyProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const supabase = useMemo(() => createClient(), [])

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

  // ---- Guest load (localStorage) — only takes effect while logged out ----
  useEffect(() => {
    if (user) return
    const initial = loadGuestState()
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
    setHydrated(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!hydrated || user) return
    try {
      const payload: LoyaltyState = {
        points, credits, lastCheckInAt, claimedMilestones, claimedOrderIds,
        claimedCampaignIds, transactions, creditTransactions, referralCode,
        referredFriends, coupons,
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // not worth crashing over
    }
  }, [points, credits, lastCheckInAt, claimedMilestones, claimedOrderIds, claimedCampaignIds, transactions, creditTransactions, referralCode, referredFriends, coupons, hydrated, user])

  // ---- Real load from Supabase on login ----
  useEffect(() => {
    if (authLoading) return
    if (!user) return

    let cancelled = false
    ;(async () => {
      setHydrated(false)

      const [
        { data: account },
        { data: milestones },
        { data: txRows },
        { data: wallet },
        { data: creditTxRows },
        { data: profile },
        { data: referralRows },
        { data: couponRows },
      ] = await Promise.all([
        supabase.from('loyalty_accounts').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('loyalty_milestones_claimed').select('milestone_key').eq('user_id', user.id),
        supabase.from('loyalty_transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('credit_wallets').select('balance').eq('user_id', user.id).maybeSingle(),
        supabase.from('credit_transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('profiles').select('referral_code').eq('id', user.id).maybeSingle(),
        supabase.from('referrals').select('*').eq('referrer_id', user.id).order('created_at', { ascending: false }),
        supabase.from('personal_coupons').select('*').eq('user_id', user.id).order('issued_at', { ascending: false }),
      ])

      if (cancelled) return

      setPointsState(account?.points ?? 0)
      setLastCheckInAt(account?.last_check_in_at ? new Date(account.last_check_in_at).getTime() : null)
      setClaimedOrderIds(account?.claimed_order_ids ?? [])
      setClaimedCampaignIds(account?.claimed_campaign_ids ?? [])
      setClaimedMilestones(((milestones ?? []) as any[]).map((m) => m.milestone_key as MilestoneKey))
      setTransactions(
        ((txRows ?? []) as any[]).map((t) => ({
          id: t.id,
          kind: (t.delta >= 0 ? 'earned' : 'used') as PointsTransactionKind,
          label: t.label ?? t.source,
          timestamp: new Date(t.created_at).getTime(),
          amount: t.delta,
        })),
      )
      setCreditsState(Number(wallet?.balance ?? 0))
      setCreditTransactions(
        ((creditTxRows ?? []) as any[]).map((t) => ({
          id: t.id,
          kind: t.type as CreditTransactionKind,
          label: t.label ?? '',
          timestamp: new Date(t.created_at).getTime(),
          amount: Number(t.amount),
        })),
      )

      // Ensure a stable referral code exists for this account.
      let code = profile?.referral_code as string | undefined
      if (!code) {
        code = generateReferralCode()
        await supabase.from('profiles').update({ referral_code: code }).eq('id', user.id)
      }
      setReferralCode(code)

      setReferredFriends(
        ((referralRows ?? []) as any[]).map((r) => ({
          id: r.id,
          name: r.referred_contact ?? 'Friend',
          status: r.status as ReferralStatus,
          rewardLabel: r.reward_label,
          rewardAmount: r.reward_amount != null ? Number(r.reward_amount) : null,
          invitedAt: new Date(r.created_at).getTime(),
          joinedAt: r.joined_at ? new Date(r.joined_at).getTime() : null,
          rewardedAt: r.rewarded_at ? new Date(r.rewarded_at).getTime() : null,
        })),
      )

      setCoupons(
        ((couponRows ?? []) as any[]).map((c) => ({
          id: c.id,
          code: c.code,
          title: c.title,
          discountType: c.discount_type,
          discountValue: Number(c.discount_value),
          minOrderValue: Number(c.min_order_value),
          maxDiscount: c.max_discount != null ? Number(c.max_discount) : null,
          scope: c.scope,
          category: c.category,
          usageLimit: c.usage_limit,
          issuedAt: new Date(c.issued_at).getTime(),
          expiresAt: new Date(c.expires_at).getTime(),
          usedAt: c.used_at ? new Date(c.used_at).getTime() : null,
        })),
      )

      setHydrated(true)
    })()

    return () => {
      cancelled = true
    }
    // Keyed on user?.id, not user — same fix as the other contexts (see
    // Ordercontexts.tsx for the full explanation of why the object
    // itself is an unstable dependency).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, authLoading])

  // ---- DB write helpers — no-op (return immediately) when logged out ----

  const persistPoints = useCallback(
    async (next: number) => {
      if (!user) return
      await supabase.from('loyalty_accounts').update({ points: Math.max(0, next) }).eq('user_id', user.id)
    },
    [user, supabase],
  )

  const persistCredits = useCallback(
    async (next: number) => {
      if (!user) return
      await supabase.from('credit_wallets').update({ balance: Math.max(0, next) }).eq('user_id', user.id)
    },
    [user, supabase],
  )

  const logTransaction = useCallback(
    (kind: PointsTransactionKind, label: string, amount: number, source: string = 'admin', sourceRef?: string) => {
      const entry: PointsTransaction = { id: makeTxId('tx'), kind, label, timestamp: Date.now(), amount }
      setTransactions((prev) => [entry, ...prev])
      if (user) {
        supabase
          .from('loyalty_transactions')
          .insert({ user_id: user.id, delta: amount, source, source_ref: sourceRef ?? null, label })
          .then(() => {})
      }
    },
    [user, supabase],
  )

  const logCreditTransaction = useCallback(
    (kind: CreditTransactionKind, label: string, amount: number) => {
      const entry: CreditTransaction = { id: makeTxId('ctx'), kind, label, timestamp: Date.now(), amount }
      setCreditTransactions((prev) => [entry, ...prev])
      if (user) {
        supabase
          .from('credit_transactions')
          .insert({ user_id: user.id, amount, type: kind, label })
          .then(() => {})
      }
    },
    [user, supabase],
  )

  // ---- Points ----

  const addPoints = useCallback(
    (delta: number, label = 'Manual adjustment') => {
      if (!Number.isFinite(delta) || delta === 0) return
      const next = Math.max(0, points + delta)
      setPointsState(next)
      logTransaction(delta > 0 ? 'earned' : 'used', label, delta)
      persistPoints(next)
    },
    [points, logTransaction, persistPoints],
  )

  const setPoints = useCallback(
    (value: number) => {
      const next = Number.isFinite(value) ? Math.max(0, value) : 0
      setPointsState(next)
      persistPoints(next)
    },
    [persistPoints],
  )

  const addCredits = useCallback(
    (amount: number, label: string) => {
      if (!Number.isFinite(amount) || amount <= 0) return
      const next = credits + amount
      setCreditsState(next)
      const kind: CreditTransactionKind = /gift card/i.test(label)
        ? 'gift_card'
        : /referral/i.test(label)
          ? 'referral'
          : /refund/i.test(label)
            ? 'refund'
            : 'adjustment'
      logCreditTransaction(kind, label, amount)
      persistCredits(next)
    },
    [credits, logCreditTransaction, persistCredits],
  )

  const useCreditsFn = useCallback(
    (amount: number, label: string): boolean => {
      if (!Number.isFinite(amount) || amount <= 0) return false
      if (credits < amount) return false
      const next = Math.max(0, credits - amount)
      setCreditsState(next)
      logCreditTransaction('used', label, -amount)
      persistCredits(next)
      return true
    },
    [credits, logCreditTransaction, persistCredits],
  )

  const addOrderPoints = useCallback(
    (order: Order): number => {
      if (claimedOrderIds.includes(order.id)) return 0
      const awarded = pointsForOrder(order)
      if (!awarded) return 0
      const next = points + awarded
      setPointsState(next)
      const nextClaimed = [...claimedOrderIds, order.id]
      setClaimedOrderIds(nextClaimed)
      logTransaction('earned', `Order #${order.id} delivered`, awarded, 'order', order.id)
      persistPoints(next)
      if (user) supabase.from('loyalty_accounts').update({ claimed_order_ids: nextClaimed }).eq('user_id', user.id).then(() => {})
      return awarded
    },
    [claimedOrderIds, points, logTransaction, persistPoints, user, supabase],
  )

  const claimMilestone = useCallback(
    (key: Exclude<MilestoneKey, 'fiveOrdersCompleted'>): number => {
      const alreadyClaimed = claimedMilestones.includes(key)
      const awarded = pointsForMilestone(key, alreadyClaimed)
      if (awarded <= 0) return 0
      const next = points + awarded
      setPointsState(next)
      setClaimedMilestones((prev) => [...prev, key])
      logTransaction('earned', milestoneLabel(key), awarded, 'milestone', key)
      persistPoints(next)
      if (user) supabase.from('loyalty_milestones_claimed').insert({ user_id: user.id, milestone_key: key }).then(() => {})
      return awarded
    },
    [claimedMilestones, points, logTransaction, persistPoints, user, supabase],
  )

  const claimFiveOrdersMilestoneIfReached = useCallback(
    (eligibleOrderCount: number): number => {
      const key: MilestoneKey = 'fiveOrdersCompleted'
      const alreadyClaimed = claimedMilestones.includes(key)
      if (alreadyClaimed || !hasReachedFiveOrdersMilestone(eligibleOrderCount)) return 0
      const awarded = pointsForMilestone(key, false)
      const next = points + awarded
      setPointsState(next)
      setClaimedMilestones((prev) => [...prev, key])
      logTransaction('earned', milestoneLabel(key), awarded, 'milestone', key)
      persistPoints(next)
      if (user) supabase.from('loyalty_milestones_claimed').insert({ user_id: user.id, milestone_key: key }).then(() => {})
      return awarded
    },
    [claimedMilestones, points, logTransaction, persistPoints, user, supabase],
  )

  const canCheckInToday = useMemo(() => {
    if (lastCheckInAt === null) return true
    return !isSameCalendarDay(lastCheckInAt, Date.now())
  }, [lastCheckInAt])

  const checkIn = useCallback((): boolean => {
    const now = Date.now()
    if (lastCheckInAt !== null && isSameCalendarDay(lastCheckInAt, now)) return false
    const next = points + CHECK_IN_POINTS
    setPointsState(next)
    setLastCheckInAt(now)
    logTransaction('earned', 'Daily check-in', CHECK_IN_POINTS, 'checkin')
    persistPoints(next)
    if (user) {
      supabase
        .from('loyalty_accounts')
        .update({ last_check_in_at: new Date(now).toISOString().slice(0, 10) })
        .eq('user_id', user.id)
        .then(() => {})
    }
    return true
  }, [lastCheckInAt, points, logTransaction, persistPoints, user, supabase])

  const grantBroadcastPoints = useCallback(
    (campaignId: string, campaignPoints: number): number => {
      if (!canGrantCampaign(campaignId, claimedCampaignIds)) return 0
      const next = points + campaignPoints
      setPointsState(next)
      const nextCampaigns = [...claimedCampaignIds, campaignId]
      setClaimedCampaignIds(nextCampaigns)
      logTransaction('earned', `Campaign reward (${campaignId})`, campaignPoints, 'broadcast', campaignId)
      persistPoints(next)
      if (user) supabase.from('loyalty_accounts').update({ claimed_campaign_ids: nextCampaigns }).eq('user_id', user.id).then(() => {})
      return campaignPoints
    },
    [claimedCampaignIds, points, logTransaction, persistPoints, user, supabase],
  )

  const usePointsFn = useCallback(
    (amount: number, label: string): boolean => {
      if (!Number.isFinite(amount) || amount <= 0) return false
      if (points < amount) return false
      const next = Math.max(0, points - amount)
      setPointsState(next)
      logTransaction('used', label, -amount)
      persistPoints(next)
      return true
    },
    [points, logTransaction, persistPoints],
  )

  // ---- Referrals ----

  const inviteFriend = useCallback(
    (name: string): string => {
      const id = makeTxId('ref')
      const entry: ReferralEntry = {
        id, name, status: 'invited', rewardLabel: null, rewardAmount: null,
        invitedAt: Date.now(), joinedAt: null, rewardedAt: null,
      }
      setReferredFriends((prev) => [entry, ...prev])
      if (user) {
        supabase
          .from('referrals')
          .insert({ referrer_id: user.id, referred_contact: name, code: generateCouponCode(), status: 'invited' })
          .select('id')
          .single()
          .then(({ data }) => {
            // Reconcile the client-generated id with the real DB id so
            // later markFriendJoined/rewardReferral calls (which match on
            // id) hit the right row.
            if (data) setReferredFriends((prev) => prev.map((f) => (f.id === id ? { ...f, id: data.id } : f)))
          })
      }
      return id
    },
    [user, supabase],
  )

  const markFriendJoined = useCallback(
    (id: string) => {
      setReferredFriends((prev) =>
        prev.map((f) => (f.id === id && f.status === 'invited' ? { ...f, status: 'joined', joinedAt: Date.now() } : f)),
      )
      if (user) {
        supabase
          .from('referrals')
          .update({ status: 'joined', joined_at: new Date().toISOString() })
          .eq('id', id)
          .then(() => {})
      }
    },
    [user, supabase],
  )

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
          f.id === id ? { ...f, status: 'rewarded', rewardedAt: Date.now(), rewardAmount: awarded, rewardLabel: label } : f,
        ),
      )

      if (user) {
        supabase
          .from('referrals')
          .update({ status: 'rewarded', rewarded_at: new Date().toISOString(), reward_label: label, reward_amount: awarded || null })
          .eq('id', id)
          .then(() => {})
      }

      if (awarded > 0) addCredits(awarded, `Referral bonus — ${target.name} (${label})`)
      return awarded
    },
    [referredFriends, addCredits, user, supabase],
  )

  // ---- Gift cards ----

  const redeemGiftCard = useCallback(
    async (code: string): Promise<number> => {
      const trimmed = code.trim()
      if (!user || trimmed.length < 6) return 0

      const { data: card, error } = await supabase
        .from('gift_cards')
        .select('id, balance, redeemed, expires_at')
        .eq('code', trimmed)
        .eq('redeemed', false)
        .maybeSingle()

      if (error || !card) return 0
      if (card.expires_at && new Date(card.expires_at).getTime() < Date.now()) return 0

      const { error: redeemError } = await supabase
        .from('gift_cards')
        .update({ redeemed: true, redeemed_by: user.id })
        .eq('id', card.id)
        .eq('redeemed', false) // extra guard against a race between two redeem attempts

      if (redeemError) return 0

      const amount = Number(card.balance)
      addCredits(amount, `Gift card redeemed (${trimmed})`)
      return amount
    },
    [user, supabase, addCredits],
  )

  // ---- Coupons ----

  const grantCoupon = useCallback(
    (params: GrantCouponParams): string => {
      const id = makeTxId('cpn')
      const now = Date.now()
      const code = generateCouponCode()
      const coupon: Coupon = {
        id, code, title: params.title, discountType: params.discountType, discountValue: params.discountValue,
        minOrderValue: params.minOrderValue, maxDiscount: params.maxDiscount ?? null, scope: params.scope,
        category: params.category, usageLimit: params.usageLimit, issuedAt: now,
        expiresAt: now + params.validForDays * 24 * 60 * 60 * 1000, usedAt: null,
      }
      setCoupons((prev) => [coupon, ...prev])
      if (user) {
        supabase
          .from('personal_coupons')
          .insert({
            user_id: user.id,
            code,
            title: params.title,
            discount_type: params.discountType,
            discount_value: params.discountValue,
            min_order_value: params.minOrderValue,
            max_discount: params.maxDiscount ?? null,
            scope: params.scope,
            category: params.category,
            usage_limit: params.usageLimit,
            expires_at: new Date(coupon.expiresAt).toISOString(),
          })
          .select('id')
          .single()
          .then(({ data }) => {
            if (data) setCoupons((prev) => prev.map((c) => (c.id === id ? { ...c, id: data.id } : c)))
          })
      }
      return id
    },
    [user, supabase],
  )

  const useCoupon = useCallback(
    (id: string): boolean => {
      const target = coupons.find((c) => c.id === id)
      if (!target) return false
      if (effectiveCouponStatus(target) !== 'unused') return false
      setCoupons((prev) => prev.map((c) => (c.id === id ? { ...c, usedAt: Date.now() } : c)))
      if (user) {
        supabase.from('personal_coupons').update({ used_at: new Date().toISOString() }).eq('id', id).then(() => {})
      }
      return true
    },
    [coupons, user, supabase],
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
    // Local reset only — intentionally does NOT touch the database. This
    // was a "wipe the demo" button for mock data; wired to real accounts,
    // resetting someone's real point/credit balance needs to be a
    // deliberate admin action, not something this button does silently.
  }, [])

  const tier = useMemo(() => tierForPoints(points), [points])
  const progressToNext = useMemo(() => progressForPoints(points, tier), [points, tier])
  const nextTierRequirements = useMemo(() => requirementsForPoints(points, tier), [points, tier])
  const referralLink = useMemo(() => `${REFERRAL_LINK_BASE}/join?ref=${referralCode}`, [referralCode])

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
      hydrated, points, lastCheckInAt, transactions, credits, creditTransactions,
      tier, progressToNext, nextTierRequirements, canCheckInToday,
      addPoints, setPoints, addCredits, useCredits: useCreditsFn, addOrderPoints,
      claimMilestone, claimFiveOrdersMilestoneIfReached, checkIn, grantBroadcastPoints,
      usePoints: usePointsFn, referralCode, referralLink, referredFriends,
      rewardTiers: REFERRAL_REWARD_TIERS, inviteFriend, markFriendJoined, rewardReferral,
      giftCardCatalog: GIFT_CARD_CATALOG, redeemGiftCard, coupons, grantCoupon, useCoupon,
      resetLoyalty,
    }),
    [
      hydrated, points, lastCheckInAt, transactions, credits, creditTransactions,
      tier, progressToNext, nextTierRequirements, canCheckInToday,
      addPoints, setPoints, addCredits, useCreditsFn, addOrderPoints,
      claimMilestone, claimFiveOrdersMilestoneIfReached, checkIn, grantBroadcastPoints,
      usePointsFn, referralCode, referralLink, referredFriends, inviteFriend,
      markFriendJoined, rewardReferral, redeemGiftCard, coupons, grantCoupon, useCoupon,
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