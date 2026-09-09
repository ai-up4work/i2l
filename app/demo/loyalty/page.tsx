// app/demo/loyalty/page.tsx
'use client'

import { useState } from 'react'
import {
  Sparkles,
  Smartphone,
  Share2,
  CalendarCheck,
  PackageCheck,
  Gift,
  RotateCcw,
  Undo2,
  Users,
  Wallet,
  UserPlus,
  UserCheck,
  Award,
  Ticket,
  TicketCheck,
  Trophy,
} from 'lucide-react'

import {
  useLoyalty,
  CHECK_IN_POINTS,
  MILESTONE_POINTS,
  TIER_ORDER,
  effectiveCouponStatus,
  type ReferralEntry,
} from '@/contexts/Loyaltycontext'
import { POINTS_PER_CURRENCY_UNIT } from '@/lib/loyaltyPoints'

// ---------------------------------------------------------------------------
// Every trigger here maps 1:1 to a real earning rule from lib/loyaltyPoints.ts
// or a real action on LoyaltyContext. Nothing on this page computes its own
// numbers — it only calls context handlers and logs what they return, so
// this page doubles as a manual test harness for the context.
//
// Sections, top to bottom:
//   1. Points — spend-linked, one-time milestones, daily recurring, broadcast
//   2. Credits — refunds, referral bonuses, spend, manual adjust
//   3. Referrals — the full invited -> joined -> rewarded pipeline
//   4. Gift cards — redeem a mock code into credits
//   5. Coupons — manual grant/redeem, plus proof that tier-up auto-grants one
// ---------------------------------------------------------------------------

const MOCK_ORDER_TOTAL = 48 // pretend delivered-order total
const MOCK_REFUND_AMOUNT = 25 // pretend refunded-order credit
const MOCK_REFERRAL_CREDIT = 10 // pretend referral bonus credit
const MOCK_FRIEND_NAMES = ['Amara', 'Devon', 'Priya', 'Noah', 'Sofia', 'Kai', 'Leila', 'Théo']
const MOCK_GIFT_CARD_CODE = 'WD7X9K2M' // any code >=6 chars "succeeds" against the mock validator

type LogEntry = {
  id: string
  label: string
  delta: number
  at: number
  blocked?: boolean
  kind?: 'points' | 'credits' | 'referral' | 'giftcard' | 'coupon'
}

export default function LoyaltyDemoPage() {
  const loyalty = useLoyalty()
  const [log, setLog] = useState<LogEntry[]>([])
  const [manualAmount, setManualAmount] = useState('100')
  const [manualCreditAmount, setManualCreditAmount] = useState('20')
  const [deliveredOrderCount, setDeliveredOrderCount] = useState(0)
  const [giftCardCode, setGiftCardCode] = useState(MOCK_GIFT_CARD_CODE)
  const [pendingReferralId, setPendingReferralId] = useState<string | null>(null)

  const pushLog = (
    label: string,
    delta: number,
    opts?: { blocked?: boolean; kind?: LogEntry['kind'] },
  ) => {
    setLog((prev) =>
      [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          label,
          delta,
          at: Date.now(),
          blocked: opts?.blocked,
          kind: opts?.kind ?? 'points',
        },
        ...prev,
      ].slice(0, 20),
    )
  }

  // --- Points triggers ----------------------------------------------------

  const runDeliveredOrder = () => {
    const fakeOrder = {
      id: `WD-DEMO-${Date.now()}`,
      date: new Date().toLocaleDateString(),
      status: 'Delivered' as const,
      currency: 'INR' as const,
      items: [{ name: 'Demo item', qty: 1, unitPrice: MOCK_ORDER_TOTAL, image: '' }],
    }
    const isFirst = deliveredOrderCount === 0
    const awarded = loyalty.addOrderPoints(fakeOrder)
    pushLog(`Order delivered ($${MOCK_ORDER_TOTAL})`, awarded)

    if (isFirst) {
      const bonus = loyalty.claimMilestone('firstPurchase')
      if (bonus > 0) pushLog('Milestone: first purchase', bonus)
    }

    const nextCount = deliveredOrderCount + 1
    setDeliveredOrderCount(nextCount)
    const milestoneBonus = loyalty.claimFiveOrdersMilestoneIfReached(nextCount)
    if (milestoneBonus > 0) pushLog('Milestone: 5 orders completed', milestoneBonus)
  }

  const runMobileVerified = () => {
    const awarded = loyalty.claimMilestone('mobileVerified')
    pushLog('Mobile number verified', awarded, { blocked: awarded === 0 })
  }

  const runFirstBoardShared = () => {
    const awarded = loyalty.claimMilestone('firstBoardShared')
    pushLog('Shared first board', awarded, { blocked: awarded === 0 })
  }

  const runCheckIn = () => {
    const succeeded = loyalty.checkIn()
    if (succeeded) pushLog('Daily check-in', CHECK_IN_POINTS)
  }

  const runFestivalGift = () => {
    const awarded = loyalty.grantBroadcastPoints('demo-festival-2026', 150)
    pushLog('Festival gift (broadcast)', awarded, { blocked: awarded === 0 })
  }

  const runManual = (sign: 1 | -1) => {
    const amount = Math.round(Number(manualAmount))
    if (!Number.isFinite(amount) || amount === 0) return
    loyalty.addPoints(sign * amount)
    pushLog(sign === 1 ? `+${amount} manual` : `−${amount} manual`, sign * amount)
  }

  // --- Credits triggers -----------------------------------------------

  const runRefund = () => {
    loyalty.addCredits(MOCK_REFUND_AMOUNT, `Refund: order #WD-DEMO-${Date.now()}`)
    pushLog(`Refund credited ($${MOCK_REFUND_AMOUNT})`, MOCK_REFUND_AMOUNT, { kind: 'credits' })
  }

  const runReferralCredit = () => {
    loyalty.addCredits(MOCK_REFERRAL_CREDIT, 'Referral bonus')
    pushLog(`Referral bonus ($${MOCK_REFERRAL_CREDIT})`, MOCK_REFERRAL_CREDIT, { kind: 'credits' })
  }

  const runSpendCredits = () => {
    const amount = 15
    const succeeded = loyalty.useCredits(amount, 'Demo checkout spend')
    pushLog(succeeded ? `Spent $${amount} credits at checkout` : `Spend failed — insufficient credits`, succeeded ? -amount : 0, {
      kind: 'credits',
      blocked: !succeeded,
    })
  }

  const runManualCredits = (sign: 1 | -1) => {
    const amount = Math.round(Number(manualCreditAmount))
    if (!Number.isFinite(amount) || amount <= 0) return
    if (sign === 1) {
      loyalty.addCredits(amount, 'Manual credit adjustment')
      pushLog(`+${amount} manual credits`, amount, { kind: 'credits' })
    } else {
      const succeeded = loyalty.useCredits(amount, 'Manual credit adjustment')
      pushLog(succeeded ? `−${amount} manual credits` : `Subtract failed — insufficient credits`, succeeded ? -amount : 0, {
        kind: 'credits',
        blocked: !succeeded,
      })
    }
  }

  // --- Referral pipeline triggers ------------------------------------------
  // Exercises the full invited -> joined -> rewarded flow. "Invite" always
  // creates a new entry (repeatable). "Mark joined" and "Reward" act on the
  // single most-recently-created entry that's eligible, tracked via
  // pendingReferralId, so clicking through the three buttons in order walks
  // one friend through the whole pipeline.

  const runInviteFriend = () => {
    const name = MOCK_FRIEND_NAMES[loyalty.referredFriends.length % MOCK_FRIEND_NAMES.length]
    const id = loyalty.inviteFriend(name)
    setPendingReferralId(id)
    pushLog(`Invited ${name}`, 0, { kind: 'referral' })
  }

  const runMarkJoined = () => {
    if (!pendingReferralId) {
      pushLog('Mark joined — invite a friend first', 0, { kind: 'referral', blocked: true })
      return
    }
    loyalty.markFriendJoined(pendingReferralId)
    const friend = loyalty.referredFriends.find((f: ReferralEntry) => f.id === pendingReferralId)
    pushLog(`${friend?.name ?? 'Friend'} joined`, 0, { kind: 'referral' })
  }

  const runRewardReferral = () => {
    if (!pendingReferralId) {
      pushLog('Reward referral — invite and join a friend first', 0, { kind: 'referral', blocked: true })
      return
    }
    const friend = loyalty.referredFriends.find((f: ReferralEntry) => f.id === pendingReferralId)
    const awarded = loyalty.rewardReferral(pendingReferralId)
    pushLog(
      awarded > 0
        ? `${friend?.name ?? 'Friend'} rewarded — hit milestone`
        : `${friend?.name ?? 'Friend'} rewarded — no milestone yet (between tiers)`,
      awarded,
      { kind: 'referral', blocked: awarded === 0 },
    )
    setPendingReferralId(null)
  }

  // --- Gift card trigger -----------------------------------------------

  const runRedeemGiftCard = () => {
    const awarded = loyalty.redeemGiftCard(giftCardCode)
    pushLog(
      awarded > 0 ? `Gift card redeemed (${giftCardCode})` : `Gift card redeem failed — invalid code`,
      awarded,
      { kind: 'giftcard', blocked: awarded === 0 },
    )
  }

  // --- Coupon triggers ---------------------------------------------------

  const runGrantManualCoupon = () => {
    const id = loyalty.grantCoupon({
      title: 'Demo 10% off',
      discountType: 'percent',
      discountValue: 10,
      minOrderValue: 20,
      maxDiscount: 15,
      scope: 'all',
      category: 'discount',
      usageLimit: 'one-time',
      validForDays: 14,
    })
    pushLog('Manual coupon granted (10% off)', 0, { kind: 'coupon' })
    return id
  }

  const runRedeemFirstUnusedCoupon = () => {
    const unused = loyalty.coupons.find((c) => effectiveCouponStatus(c) === 'unused')
    if (!unused) {
      pushLog('Redeem coupon — none available (grant one first)', 0, { kind: 'coupon', blocked: true })
      return
    }
    const succeeded = loyalty.useCoupon(unused.id)
    pushLog(succeeded ? `Redeemed coupon: ${unused.title}` : 'Redeem failed', 0, {
      kind: 'coupon',
      blocked: !succeeded,
    })
  }

  const runBumpTierForCouponTest = () => {
    // Jumps points to the next tier threshold to prove the auto-grant
    // effect in the context (level-up coupon) actually fires — this is
    // the one button on the page that indirectly tests context-internal
    // logic rather than calling a single handler directly.
    const currentIndex = TIER_ORDER.indexOf(loyalty.tier)
    if (currentIndex === TIER_ORDER.length - 1) {
      pushLog('Already at max tier — no level-up coupon to test', 0, { kind: 'coupon', blocked: true })
      return
    }
    const nextTier = TIER_ORDER[currentIndex + 1]
    loyalty.addPoints(500, `Manual bump toward ${nextTier} (coupon test)`)
    pushLog(`Bumped points toward ${nextTier} — check coupons for auto-grant`, 500)
  }

  const runReset = () => {
    loyalty.resetLoyalty()
    setLog([])
    setDeliveredOrderCount(0)
    setPendingReferralId(null)
  }

  if (!loyalty.hydrated) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="h-40 animate-pulse rounded-2xl bg-ink/5" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-6 pb-16 pt-8 lg:px-10">
      <div className="rounded-2xl border border-dashed border-ink/20 bg-ink/[0.02] px-5 py-4">
        <p className="text-sm font-semibold text-ink">Loyalty demo</p>
        <p className="mt-1 text-sm text-ink/60">
          Every trigger below calls a real handler on <code className="rounded bg-ink/8 px-1 py-0.5 text-xs">useLoyalty()</code> — this
          page is a manual test harness for the whole context, not just points. Milestones and gift-card/coupon actions log
          &ldquo;blocked&rdquo; when the underlying rule refuses (already claimed, insufficient balance, no eligible target).
        </p>
      </div>

      {/* Live balances */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-ink/10 bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">Points</p>
          <p className="mt-1 font-display text-2xl tabular-nums text-ink">{loyalty.points.toLocaleString()}</p>
          <p className="mt-0.5 text-xs text-ink/45">Tier: {loyalty.tier}</p>
        </div>
        <div className="rounded-2xl border border-ink/10 bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">Credits</p>
          <p className="mt-1 font-display text-2xl tabular-nums text-ink">${loyalty.credits.toLocaleString()}</p>
          <p className="mt-0.5 text-xs text-ink/45">Spend-only</p>
        </div>
        <div className="rounded-2xl border border-ink/10 bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">Referrals</p>
          <p className="mt-1 font-display text-2xl tabular-nums text-ink">{loyalty.referredFriends.length}</p>
          <p className="mt-0.5 text-xs text-ink/45">
            {loyalty.referredFriends.filter((f) => f.status === 'rewarded').length} rewarded
          </p>
        </div>
        <div className="rounded-2xl border border-ink/10 bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">Coupons</p>
          <p className="mt-1 font-display text-2xl tabular-nums text-ink">
            {loyalty.coupons.filter((c) => effectiveCouponStatus(c) === 'unused').length}
          </p>
          <p className="mt-0.5 text-xs text-ink/45">unused of {loyalty.coupons.length}</p>
        </div>
      </div>

      {/* --- Points --- */}
      <div className="mt-4 rounded-2xl border border-ink/10 bg-card p-6">
        <h2 className="font-display text-sm text-ink">Spend-linked (repeatable — costs real money each time)</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={runDeliveredOrder}
            className="flex items-center gap-3 rounded-xl border border-ink/10 bg-white px-4 py-3 text-left transition-colors hover:border-teal/30 hover:bg-teal/5"
          >
            <span className="grid size-9 flex-none place-items-center rounded-lg bg-teal/12 text-teal-deep">
              <PackageCheck size={16} strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">Order delivered (${MOCK_ORDER_TOTAL})</span>
              <span className="block truncate text-xs text-ink/45">
                {POINTS_PER_CURRENCY_UNIT} pt/$1 · triggers first-purchase / 5-orders milestones too
              </span>
            </span>
            <span className="flex-none text-sm font-bold tabular-nums text-teal-deep">
              +{MOCK_ORDER_TOTAL * POINTS_PER_CURRENCY_UNIT}
            </span>
          </button>
        </div>

        <h2 className="mt-6 font-display text-sm text-ink">One-time milestones (claimable once, ever)</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={runMobileVerified}
            className="flex items-center gap-3 rounded-xl border border-ink/10 bg-white px-4 py-3 text-left transition-colors hover:border-teal/30 hover:bg-teal/5"
          >
            <span className="grid size-9 flex-none place-items-center rounded-lg bg-indigo-deep/12 text-indigo-deep">
              <Smartphone size={16} strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">Mobile number verified</span>
              <span className="block truncate text-xs text-ink/45">OTP-verified, not just typed in</span>
            </span>
            <span className="flex-none text-sm font-bold tabular-nums text-indigo-deep">
              +{MILESTONE_POINTS.mobileVerified}
            </span>
          </button>

          <button
            type="button"
            onClick={runFirstBoardShared}
            className="flex items-center gap-3 rounded-xl border border-ink/10 bg-white px-4 py-3 text-left transition-colors hover:border-teal/30 hover:bg-teal/5"
          >
            <span className="grid size-9 flex-none place-items-center rounded-lg bg-teal/12 text-teal-deep">
              <Share2 size={16} strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">Shared first board</span>
              <span className="block truncate text-xs text-ink/45">Account-level — not per board, not per share</span>
            </span>
            <span className="flex-none text-sm font-bold tabular-nums text-teal-deep">
              +{MILESTONE_POINTS.firstBoardShared}
            </span>
          </button>
        </div>

        <h2 className="mt-6 font-display text-sm text-ink">Recurring (capped by &ldquo;once per day&rdquo;)</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={runCheckIn}
            disabled={!loyalty.canCheckInToday}
            className="flex items-center gap-3 rounded-xl border border-ink/10 bg-white px-4 py-3 text-left transition-colors hover:border-teal/30 hover:bg-teal/5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-ink/10 disabled:hover:bg-white"
          >
            <span className="grid size-9 flex-none place-items-center rounded-lg bg-gold/15 text-gold-deep">
              <CalendarCheck size={16} strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">Daily check-in</span>
              <span className="block truncate text-xs text-ink/45">
                {loyalty.canCheckInToday ? 'Once per calendar day' : 'Already checked in today'}
              </span>
            </span>
            <span className="flex-none text-sm font-bold tabular-nums text-gold-deep">+{CHECK_IN_POINTS}</span>
          </button>
        </div>

        <h2 className="mt-6 font-display text-sm text-ink">Broadcast grant (admin-issued, not user-earned)</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={runFestivalGift}
            className="flex items-center gap-3 rounded-xl border border-gold/30 bg-gold/5 px-4 py-3 text-left transition-colors hover:border-gold/50"
          >
            <span className="grid size-9 flex-none place-items-center rounded-lg bg-gold/15 text-gold-deep">
              <Gift size={16} strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">Festival gift (all customers)</span>
              <span className="block truncate text-xs text-ink/45">
                Idempotent per campaign id — no personal earning cap applies
              </span>
            </span>
            <span className="flex-none text-sm font-bold tabular-nums text-gold-deep">+150</span>
          </button>
        </div>

        {/* Manual adjuster, for testing arbitrary tier boundaries. */}
        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-ink/10 pt-4">
          <span className="text-xs font-semibold text-ink/50">Manual adjust (points)</span>
          <input
            type="number"
            value={manualAmount}
            onChange={(e) => setManualAmount(e.target.value)}
            className="w-24 rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-sm text-ink"
          />
          <button
            type="button"
            onClick={() => runManual(1)}
            className="rounded-lg bg-ink px-3 py-1.5 text-xs font-bold tracking-wide text-white transition-opacity hover:opacity-90"
          >
            ADD
          </button>
          <button
            type="button"
            onClick={() => runManual(-1)}
            className="rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-bold tracking-wide text-ink transition-colors hover:bg-ink/5"
          >
            SUBTRACT
          </button>

          <button
            type="button"
            onClick={runReset}
            className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-ink/50 hover:text-ink"
          >
            <RotateCcw size={13} />
            Reset to mock defaults
          </button>
        </div>
      </div>

      {/* --- Credits --- */}
      <div className="mt-4 rounded-2xl border border-ink/10 bg-card p-6">
        <div className="flex items-center gap-2">
          <Wallet size={15} className="text-ink/40" />
          <h2 className="font-display text-sm text-ink">Credits (refunds &amp; referrals)</h2>
        </div>
        <p className="mt-1 text-xs text-ink/45">
          Repeatable, non-expiring, never affects tier. No withdraw trigger here on purpose.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={runRefund}
            className="flex items-center gap-3 rounded-xl border border-ink/10 bg-white px-4 py-3 text-left transition-colors hover:border-teal/30 hover:bg-teal/5"
          >
            <span className="grid size-9 flex-none place-items-center rounded-lg bg-teal/12 text-teal-deep">
              <Undo2 size={16} strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">Refund order (${MOCK_REFUND_AMOUNT})</span>
              <span className="block truncate text-xs text-ink/45">Simulates a return refunded to wallet, not the bank</span>
            </span>
            <span className="flex-none text-sm font-bold tabular-nums text-teal-deep">+${MOCK_REFUND_AMOUNT}</span>
          </button>

          <button
            type="button"
            onClick={runReferralCredit}
            className="flex items-center gap-3 rounded-xl border border-ink/10 bg-white px-4 py-3 text-left transition-colors hover:border-teal/30 hover:bg-teal/5"
          >
            <span className="grid size-9 flex-none place-items-center rounded-lg bg-indigo-deep/12 text-indigo-deep">
              <Users size={16} strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">Referral bonus (${MOCK_REFERRAL_CREDIT})</span>
              <span className="block truncate text-xs text-ink/45">Flat grant — for the full pipeline see Referrals below</span>
            </span>
            <span className="flex-none text-sm font-bold tabular-nums text-indigo-deep">+${MOCK_REFERRAL_CREDIT}</span>
          </button>

          <button
            type="button"
            onClick={runSpendCredits}
            disabled={loyalty.credits < 15}
            className="flex items-center gap-3 rounded-xl border border-ink/10 bg-white px-4 py-3 text-left transition-colors hover:border-teal/30 hover:bg-teal/5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-ink/10 disabled:hover:bg-white sm:col-span-2"
          >
            <span className="grid size-9 flex-none place-items-center rounded-lg bg-gold/15 text-gold-deep">
              <Sparkles size={16} strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">Spend $15 credits at checkout</span>
              <span className="block truncate text-xs text-ink/45">
                {loyalty.credits < 15 ? 'Insufficient credits — add some above first' : 'Deducts from the wallet balance'}
              </span>
            </span>
            <span className="flex-none text-sm font-bold tabular-nums text-red-600">−$15</span>
          </button>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-ink/10 pt-4">
          <span className="text-xs font-semibold text-ink/50">Manual adjust (credits)</span>
          <input
            type="number"
            value={manualCreditAmount}
            onChange={(e) => setManualCreditAmount(e.target.value)}
            className="w-24 rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-sm text-ink"
          />
          <button
            type="button"
            onClick={() => runManualCredits(1)}
            className="rounded-lg bg-ink px-3 py-1.5 text-xs font-bold tracking-wide text-white transition-opacity hover:opacity-90"
          >
            ADD
          </button>
          <button
            type="button"
            onClick={() => runManualCredits(-1)}
            className="rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-bold tracking-wide text-ink transition-colors hover:bg-ink/5"
          >
            SUBTRACT
          </button>
        </div>
      </div>

      {/* --- Referrals --- */}
      <div className="mt-4 rounded-2xl border border-ink/10 bg-card p-6">
        <div className="flex items-center gap-2">
          <Users size={15} className="text-ink/40" />
          <h2 className="font-display text-sm text-ink">Referral pipeline</h2>
        </div>
        <p className="mt-1 text-xs text-ink/45">
          Click in order: invite → mark joined → reward. Reward only pays a credit bonus when the cumulative rewarded count lands on a
          tier threshold (1st / 5th / 10th) — otherwise it&apos;s logged as &ldquo;no milestone yet.&rdquo;
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={runInviteFriend}
            className="flex items-center gap-3 rounded-xl border border-ink/10 bg-white px-4 py-3 text-left transition-colors hover:border-teal/30 hover:bg-teal/5"
          >
            <span className="grid size-9 flex-none place-items-center rounded-lg bg-teal/12 text-teal-deep">
              <UserPlus size={16} strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">1. Invite friend</span>
              <span className="block truncate text-xs text-ink/45">Repeatable — new entry each time</span>
            </span>
          </button>

          <button
            type="button"
            onClick={runMarkJoined}
            disabled={!pendingReferralId}
            className="flex items-center gap-3 rounded-xl border border-ink/10 bg-white px-4 py-3 text-left transition-colors hover:border-teal/30 hover:bg-teal/5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-ink/10 disabled:hover:bg-white"
          >
            <span className="grid size-9 flex-none place-items-center rounded-lg bg-indigo-deep/12 text-indigo-deep">
              <UserCheck size={16} strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">2. Mark joined</span>
              <span className="block truncate text-xs text-ink/45">Acts on the most recent invite</span>
            </span>
          </button>

          <button
            type="button"
            onClick={runRewardReferral}
            disabled={!pendingReferralId}
            className="flex items-center gap-3 rounded-xl border border-ink/10 bg-white px-4 py-3 text-left transition-colors hover:border-teal/30 hover:bg-teal/5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-ink/10 disabled:hover:bg-white"
          >
            <span className="grid size-9 flex-none place-items-center rounded-lg bg-gold/15 text-gold-deep">
              <Award size={16} strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">3. Reward referral</span>
              <span className="block truncate text-xs text-ink/45">Grants credits only on a milestone hit</span>
            </span>
          </button>
        </div>

        {loyalty.referredFriends.length > 0 && (
          <ul className="mt-4 flex flex-col gap-1.5 border-t border-ink/10 pt-4">
            {loyalty.referredFriends.slice(0, 5).map((f) => (
              <li key={f.id} className="flex items-center justify-between text-xs text-ink/60">
                <span>{f.name}</span>
                <span className="rounded-full bg-ink/8 px-2 py-0.5 font-semibold uppercase tracking-wide text-ink/50">
                  {f.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* --- Gift cards --- */}
      <div className="mt-4 rounded-2xl border border-ink/10 bg-card p-6">
        <div className="flex items-center gap-2">
          <Gift size={15} className="text-ink/40" />
          <h2 className="font-display text-sm text-ink">Gift card redemption</h2>
        </div>
        <p className="mt-1 text-xs text-ink/45">
          Mock validator only — any code 6+ characters &ldquo;succeeds&rdquo; and credits the first catalog card&apos;s face value.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={giftCardCode}
            onChange={(e) => setGiftCardCode(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-sm text-ink"
            placeholder="Gift card code"
          />
          <button
            type="button"
            onClick={runRedeemGiftCard}
            className="rounded-lg bg-ink px-3 py-1.5 text-xs font-bold tracking-wide text-white transition-opacity hover:opacity-90"
          >
            REDEEM
          </button>
          <button
            type="button"
            onClick={() => setGiftCardCode('bad')}
            className="rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-bold tracking-wide text-ink transition-colors hover:bg-ink/5"
          >
            Use invalid code
          </button>
        </div>
      </div>

      {/* --- Coupons --- */}
      <div className="mt-4 rounded-2xl border border-ink/10 bg-card p-6">
        <div className="flex items-center gap-2">
          <Ticket size={15} className="text-ink/40" />
          <h2 className="font-display text-sm text-ink">Coupons</h2>
        </div>
        <p className="mt-1 text-xs text-ink/45">
          Coupons can be granted manually here, or auto-granted by the context itself when tier increases (the &ldquo;Level-Up
          Coupon&rdquo; reward from the VIP page). The third button proves that auto-grant actually fires.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={runGrantManualCoupon}
            className="flex items-center gap-3 rounded-xl border border-ink/10 bg-white px-4 py-3 text-left transition-colors hover:border-teal/30 hover:bg-teal/5"
          >
            <span className="grid size-9 flex-none place-items-center rounded-lg bg-teal/12 text-teal-deep">
              <Ticket size={16} strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">Grant coupon manually</span>
              <span className="block truncate text-xs text-ink/45">10% off, 14-day expiry</span>
            </span>
          </button>

          <button
            type="button"
            onClick={runRedeemFirstUnusedCoupon}
            className="flex items-center gap-3 rounded-xl border border-ink/10 bg-white px-4 py-3 text-left transition-colors hover:border-teal/30 hover:bg-teal/5"
          >
            <span className="grid size-9 flex-none place-items-center rounded-lg bg-indigo-deep/12 text-indigo-deep">
              <TicketCheck size={16} strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">Redeem first unused coupon</span>
              <span className="block truncate text-xs text-ink/45">Marks it used — check /account/coupons after</span>
            </span>
          </button>

          <button
            type="button"
            onClick={runBumpTierForCouponTest}
            className="flex items-center gap-3 rounded-xl border border-gold/30 bg-gold/5 px-4 py-3 text-left transition-colors hover:border-gold/50"
          >
            <span className="grid size-9 flex-none place-items-center rounded-lg bg-gold/15 text-gold-deep">
              <Trophy size={16} strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">Bump tier (test auto-grant)</span>
              <span className="block truncate text-xs text-ink/45">+500 points — watch coupon count above tick up</span>
            </span>
          </button>
        </div>

        {loyalty.coupons.length > 0 && (
          <ul className="mt-4 flex flex-col gap-1.5 border-t border-ink/10 pt-4">
            {loyalty.coupons.slice(0, 5).map((c) => (
              <li key={c.id} className="flex items-center justify-between text-xs text-ink/60">
                <span>{c.title}</span>
                <span className="rounded-full bg-ink/8 px-2 py-0.5 font-semibold uppercase tracking-wide text-ink/50">
                  {effectiveCouponStatus(c)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {log.length > 0 && (
        <div className="mt-4 rounded-2xl border border-ink/10 bg-card p-6">
          <h2 className="font-display text-sm text-ink">Recent simulated events</h2>
          <ul className="mt-3 flex flex-col gap-1.5">
            {log.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between text-sm">
                <span className="text-ink/70">
                  {entry.label}
                  {entry.kind && entry.kind !== 'points' && (
                    <span className="ml-2 rounded-full bg-teal/10 px-2 py-0.5 text-[10px] font-semibold text-teal-deep">
                      {entry.kind}
                    </span>
                  )}
                  {entry.blocked && (
                    <span className="ml-2 rounded-full bg-ink/8 px-2 py-0.5 text-[10px] font-semibold text-ink/50">blocked</span>
                  )}
                </span>
                {entry.delta !== 0 && (
                  <span className={`font-semibold tabular-nums ${entry.delta >= 0 ? 'text-teal-deep' : 'text-red-600'}`}>
                    {entry.kind === 'credits' || entry.kind === 'giftcard' ? '$' : ''}
                    {entry.delta >= 0 ? '+' : ''}
                    {entry.delta}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}