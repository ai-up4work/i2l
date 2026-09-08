# WishDrop Loyalty Program — Design Reference

Status: demo/prototype. Point rules and reward catalog are placeholders — tune before launch. No real earning flow is wired into checkout, boards, or cart yet.

## Files

| File | Role |
|---|---|
| `lib/loyaltyPoints.ts` | Single source of truth for point values, tier thresholds, caps, and reward cost types. Pure constants/functions, no React dependency. |
| `contexts/Loyaltycontext.tsx` | React state layer. Persists to `localStorage`, exposes `useLoyalty()` with cap-aware award functions. |
| `app/demo/loyalty/page.tsx` | Manual test harness — simulates each trigger and shows the daily cap in action. |
| `components/VipPage.tsx` | Customer-facing tier/rewards page, reads from `useLoyalty()`. |

## Tiers

| Tier | Points threshold |
|---|---|
| V0 | 0 |
| V1 | 500 |
| V2 | 2,000 |
| V3 | 5,000 |

Tier is always *derived* from `points` — never stored directly. Progress-to-next and next-tier requirements are computed the same way.

## Point-earning rules

### Purchase-linked (uncapped)

These are tied to actual revenue events, so they're not subject to any daily limit.

| Rule | Value | Notes |
|---|---|---|
| Order points | `POINTS_PER_CURRENCY_UNIT` (currently 1) per currency unit spent | Only for non-cancelled orders. Award on a delay — `ORDER_POINTS_HOLD_DAYS` (7 days) after the order date — so refunded/cancelled orders never need a clawback. |
| Repeat-purchase bonus | `REPEAT_PURCHASE_BONUS` = 100 | If the customer has ≥1 prior eligible order within `REPEAT_PURCHASE_WINDOW_DAYS` (60 days). Not yet wired to a call site. |
| Referral conversion | Referrer: `REFERRAL_POINTS_REFERRER` = 300 · Referred: `REFERRAL_POINTS_REFERRED` = 150 | Pays out only once the referred friend's first order is itself eligible (passed the same hold/cancellation check) — never on signup alone. Not yet wired to a call site. |

### Engagement (capped)

Small, deliberately capped so these can't become a point-farming loop disconnected from spend.

| Action | Value |
|---|---|
| Add to cart | 5 |
| Create a board | 20 |
| Share a board | 15 |
| Write a verified review | 25 |
| Daily check-in | 10 |

**Daily cap:** `DAILY_ENGAGEMENT_CAP` = 60 points/day, shared across all engagement actions *and* check-in combined. Once an account hits the cap, further engagement awards return less than nominal (or 0) until the next calendar day. Tracked via `nonPurchasePointsToday` / `nonPurchaseTrackedAt`, which reset automatically on day rollover.

## Reward catalog & cost types

Rewards are tagged by cost type so it's visible at a glance which ones scale against margin as spend grows.

| Reward | Tier | Cost type | Notes |
|---|---|---|---|
| Exclusive badge | V1 | `free` | Vanity, zero marginal cost |
| Early access window | V1 | `free` | First pick before public launch — no discount given |
| Priority handling | V2 | `opsCost` | Costs staff attention, not COGS |
| Level-up coupon | V2 | `flatCost` | 200 currency units, fires once per tier-up event only |
| Speedy refund | V3 | `opsCost` | Operational, not margin |
| Festival gift | V3 | `flatCost` | 150 currency units, physical cost kept low |
| Insider digest | V3 | `free` | Content cost only |
| V3-only promotions | V3 | `percentDiscount` | 10% off, hard-capped at 2 uses/month per member — the only reward type that scales with order value, so it's the one to guard hardest |

**Rule of thumb:** `percentDiscount` rewards compound against margin as a member's spend grows — cap them hard or avoid them. `flatCost`, `opsCost`, and `free` rewards stay predictable regardless of how much a member spends.

## Function reference

### `useLoyalty()` — call these at real trigger points

| Function | Call when | Behavior |
|---|---|---|
| `addEngagementPoints(action)` | User adds to cart / creates a board / shares a board / leaves a verified review | Clamps nominal value against remaining daily cap, adds to `points`, returns amount actually awarded |
| `addOrderPoints(order)` | Scheduled job, `ORDER_POINTS_HOLD_DAYS` after order date, if not cancelled | Returns 0 for ineligible orders; otherwise awards `floor(total × POINTS_PER_CURRENCY_UNIT)`, uncapped. Caller must ensure it only fires once per order. |
| `checkIn()` | "Daily check-in" button | Returns `false` if already checked in today; otherwise awards `CHECK_IN_POINTS` through the capped path and records `lastCheckInAt` |
| `addPoints(delta)` | Manual/admin adjustment, or an already-computed purchase-linked amount (repeat-purchase bonus, referral bonus) | Directly adds `delta`, floored at 0. Not capped, not rule-governed. |
| `setPoints(value)` | Rare — force-setting a balance | Directly sets `points`, floored at 0 |
| `setUsername(name)` | Account name change | Trims, falls back to default if empty |
| `resetLoyalty()` | Testing | Resets all state to `MOCK_STATE` |

### Read-only values for UI

| Value | Meaning |
|---|---|
| `tier` | Current `Tier`, derived from `points` |
| `progressToNext` | 0–100 within current tier segment |
| `nextTierRequirements` | Plain-language string array |
| `canCheckInToday` | Whether `checkIn()` will succeed |
| `engagementPointsRemainingToday` | Cap headroom left today |
| `hydrated` | False until the localStorage read completes — gate real renders on this |

## Not yet wired (logic exists conceptually, no call site yet)

- **Repeat-purchase bonus** — needs an order-eligibility job that counts prior eligible orders in the trailing 60 days and calls `pointsForRepeatPurchase()` + `addPoints()`.
- **Referral conversion** — needs to trigger off the referred friend's first *eligible* order, calling `pointsForReferralConversion()` and awarding both sides via `addPoints()`.
- **Reward redemption + `usesPerMonthCap` enforcement** — needs a per-member monthly redemption counter (same pattern as the engagement-cap tracking already in `Loyaltycontext`), checked against `REWARD_DEFINITIONS` before letting a `percentDiscount` reward apply.

## Real integration checklist

- `Cartcontext.addItem` → `addEngagementPoints('addToCart')`
- `Wishlistcontext.createBoard` → `addEngagementPoints('createBoard')`
- `Wishlistcontext.generateShareLink` → `addEngagementPoints('shareBoard')`
- Verified-review submit handler → `addEngagementPoints('writeVerifiedReview')`
- Scheduled job over `OrdersProvider` data → `addOrderPoints(order)` + repeat-purchase check
- Referred user's first eligible order → `pointsForReferralConversion()` + two `addPoints()` calls
