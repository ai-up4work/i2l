/**
 * lib/loyaltyPoints.ts
 *
 * Single source of truth for every point value and earning rule in the
 * loyalty program. Nothing here writes state — these are pure constants +
 * pure functions. Call sites (checkout, mobile-verification flow, the
 * board-share handler, an admin campaign tool) import from here and pass
 * the result into `useLoyalty()`'s award functions.
 *
 * DESIGN PRINCIPLE — every source below is exploit-resistant BY
 * CONSTRUCTION, not by a cap bolted on afterward:
 *
 *   - Spend-linked points (pointsForOrder) cost real money to farm, so no
 *     cap is needed — the points cost scales with what was actually paid.
 *   - Milestone bonuses (first purchase, mobile verified, first board
 *     shared, 5 orders) can each be claimed AT MOST ONCE per account,
 *     forever. A one-time claim flag *is* the cap — there's no rolling
 *     counter to game, because repeat attempts after the first always
 *     award 0.
 *   - The one genuinely recurring source (daily check-in) is capped by
 *     "once per calendar day", which is the cap — no separate point-value
 *     cap needed since it's a single small fixed amount.
 *   - Broadcast/admin grants (festival gifts, promo credits issued to a
 *     defined audience) are NOT "earned" by a user action at all, so they
 *     never touch the per-account earning caps above. They live on a
 *     separate path (see BroadcastGrant below) idempotent per campaign id,
 *     so re-running an admin batch job can't double-grant to the same
 *     account.
 *
 * What got REMOVED from an earlier version of this file, and why:
 *   - Add-to-cart, create-board, share-board (repeatable) points — these
 *     were the easiest actions to farm (create -> delete -> recreate, add
 *     -> remove -> add) and carried the weakest signal of real engagement.
 *     Replaced by one-time bonuses tied to genuinely first-time actions
 *     (first board shared) instead of a repeatable per-action award.
 *   - The shared DAILY_ENGAGEMENT_CAP across multiple actions — no longer
 *     needed once only one action (check-in) is recurring; "once per day"
 *     already is that action's cap.
 */

import type { Order } from '@/contexts/Ordercontexts'
import { orderTotal } from '@/contexts/Ordercontexts'

// ---------------------------------------------------------------------------
// Tiers
// ---------------------------------------------------------------------------

export type Tier = 'V0' | 'V1' | 'V2' | 'V3'
export const TIER_ORDER: Tier[] = ['V0', 'V1', 'V2', 'V3']

/** Points needed to REACH each tier (cumulative, not incremental). */
export const TIER_THRESHOLDS: Record<Tier, number> = {
  V0: 0,
  V1: 500,
  V2: 2000,
  V3: 5000,
}

// ---------------------------------------------------------------------------
// Spend-linked points — the only *repeatable* earning source, and safe to
// repeat because each award costs the customer real money.
// ---------------------------------------------------------------------------

/** Points earned per whole currency unit spent. */
export const POINTS_PER_CURRENCY_UNIT = 1

/**
 * Points for an order, or null if not eligible. Only fires once an order
 * has actually reached 'Delivered' — not on placement, not on 'Shipped' —
 * so there's no window where cancelling after the fact requires a
 * clawback. Caller must still track "already awarded this order id" (see
 * Loyaltycontext's `claimedOrderIds`) so this doesn't get called twice for
 * the same order.
 */
export function pointsForOrder(order: Order): number | null {
  if (order.status !== 'Delivered') return null
  const total = orderTotal(order)
  if (total <= 0) return null
  return Math.floor(total * POINTS_PER_CURRENCY_UNIT)
}

// ---------------------------------------------------------------------------
// One-time milestone bonuses — each claimable exactly once per account,
// ever. The lib only defines the flat values; the "has this account
// already claimed X" check lives in Loyaltycontext (a Set of claimed
// milestone keys, same shape as an order-id dedup set).
// ---------------------------------------------------------------------------

export type MilestoneKey = 'firstPurchase' | 'mobileVerified' | 'firstBoardShared' | 'fiveOrdersCompleted'

export const MILESTONE_POINTS: Record<MilestoneKey, number> = {
  /** First order ever reaches 'Delivered'. Anchors the relationship early. */
  firstPurchase: 50,
  /** Mobile number added AND OTP-verified — verification is what makes this
   *  safe; an unverified "add/remove/re-add" loop must never reach here. */
  mobileVerified: 20,
  /** First board share link ever generated for this account (not per
   *  board — account-level, so delete/recreate/reshare loops can't repeat it). */
  firstBoardShared: 15,
  /** Fifth eligible ('Delivered', non-cancelled) order. A single flat bonus
   *  fired once when the count reaches 5, not a per-order repeat. */
  fiveOrdersCompleted: 100,
}

/**
 * Returns the milestone's point value if it hasn't been claimed yet, or 0
 * if `alreadyClaimed` is true. Trivial by design — the real protection is
 * the caller persisting `alreadyClaimed` durably (see Loyaltycontext).
 */
export function pointsForMilestone(key: MilestoneKey, alreadyClaimed: boolean): number {
  return alreadyClaimed ? 0 : MILESTONE_POINTS[key]
}

/** Convenience check for the 5-orders milestone: pass the account's count
 *  of eligible (Delivered, non-cancelled) orders. Only true at exactly 5,
 *  so a caller looping over orders one-by-one fires it exactly once. */
export function hasReachedFiveOrdersMilestone(eligibleOrderCount: number): boolean {
  return eligibleOrderCount === 5
}

// ---------------------------------------------------------------------------
// Recurring — the one source that repeats. Capped purely by "once per
// calendar day"; no separate point-value cap is needed for a single fixed
// small amount.
// ---------------------------------------------------------------------------

export const CHECK_IN_POINTS = 10

// ---------------------------------------------------------------------------
// Broadcast / admin grants — NOT earned by a user action, so these never
// touch the per-account earning logic above. A campaign is defined once
// (id + point value + audience), and each account can only be granted a
// given campaign id once, no matter how many times the admin job runs.
// ---------------------------------------------------------------------------

export type BroadcastGrant = {
  /** Stable id for this campaign, e.g. 'diwali-2026-gift'. Used as the
   *  idempotency key — an account can only ever be granted this id once. */
  campaignId: string
  points: number
  label: string
}

/**
 * Returns true if `campaignId` can still be granted to an account that has
 * already been granted `claimedCampaignIds`. Purely a set-membership check
 * — the actual granting call is a separate admin-tool concern, not part of
 * any user-facing flow.
 */
export function canGrantCampaign(campaignId: string, claimedCampaignIds: string[]): boolean {
  return !claimedCampaignIds.includes(campaignId)
}

// ---------------------------------------------------------------------------
// Reward costs — what a point is worth when redeemed. Unchanged in spirit
// from before: flag cost type per reward so it's visible which ones scale
// against margin as spend grows.
// ---------------------------------------------------------------------------

export type RewardCostType = 'free' | 'opsCost' | 'flatCost' | 'percentDiscount'

export type RewardDefinition = {
  id: string
  requiredTier: Tier
  costType: RewardCostType
  flatCostAmount?: number
  percentOff?: number
  usesPerMonthCap?: number
}

export const REWARD_DEFINITIONS: RewardDefinition[] = [
  { id: 'badge', requiredTier: 'V1', costType: 'free' },
  { id: 'earlyAccess', requiredTier: 'V1', costType: 'free' },
  { id: 'priority', requiredTier: 'V2', costType: 'opsCost' },
  { id: 'levelUpCoupon', requiredTier: 'V2', costType: 'flatCost', flatCostAmount: 200 },
  { id: 'speedyRefund', requiredTier: 'V3', costType: 'opsCost' },
  { id: 'festivalGift', requiredTier: 'V3', costType: 'flatCost', flatCostAmount: 150 },
  { id: 'insiderDigest', requiredTier: 'V3', costType: 'free' },
  { id: 'v3Promotions', requiredTier: 'V3', costType: 'percentDiscount', percentOff: 10, usesPerMonthCap: 2 },
]