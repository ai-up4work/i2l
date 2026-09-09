// VipPage.tsx
'use client'

import { useState } from 'react'
import type { ComponentType } from 'react'
import {
  Crown,
  Ticket,
  Shield,
  Zap,
  Headphones,
  Calendar,
  BookOpen,
  Percent,
  MoreHorizontal,
  ChevronDown,
  Lock,
  ChevronRight,
} from 'lucide-react'

type IconComponent = ComponentType<{
  size?: number
  strokeWidth?: number
  className?: string
}>

type Tier = 'V0' | 'V1' | 'V2' | 'V3'

const TIER_ORDER: Tier[] = ['V0', 'V1', 'V2', 'V3']

// Literal (non-concatenated) class strings per tier, so Tailwind's static
// scanner picks all of them up regardless of which tier renders at
// runtime. Each tier gets one accent used consistently across the hero
// glow, the tier chip, and the lock badges in the rewards grid — this is
// what makes climbing tiers *read* as climbing, rather than every tier
// sharing the same teal accent.
const TIER_ACCENT: Record<Tier, { glow: string; chip: string; ring: string }> = {
  V0: { glow: 'bg-ink/15', chip: 'bg-white/10 text-white/70', ring: 'ring-white/15' },
  V1: { glow: 'bg-teal/40', chip: 'bg-teal/20 text-teal-deep', ring: 'ring-teal/30' },
  V2: { glow: 'bg-indigo-deep/40', chip: 'bg-indigo-deep/20 text-white', ring: 'ring-indigo-deep/30' },
  V3: { glow: 'bg-gold/50', chip: 'bg-gold/25 text-gold-deep', ring: 'ring-gold/40' },
}

type Reward = {
  id: string
  label: string
  icon: IconComponent
  requiredTier: Tier
  description: string
  comingSoon?: boolean
}

// Default reward catalog — same shape as SHEIN's "My Rewards" grid (icon +
// label tile, locked until the required tier), reskinned with this app's
// icon set and copy. Passed as a prop default so callers can override the
// whole catalog without editing this file, but most integrations will
// just use this as-is.
const DEFAULT_REWARDS: Reward[] = [
  { id: 'badge', label: 'Exclusive Badge', icon: Crown, requiredTier: 'V1', description: 'A visible badge on your profile and reviews once you reach V1.' },
  { id: 'coupon', label: 'Level-Up Coupon', icon: Ticket, requiredTier: 'V2', description: 'A one-time coupon issued automatically the moment you level up.' },
  { id: 'priority', label: 'Priority Handling', icon: Shield, requiredTier: 'V2', description: 'Your requests jump the queue for sourcing and quality checks.' },
  { id: 'speedy', label: 'Speedy Refund', icon: Zap, requiredTier: 'V3', description: 'Refunds are processed same-day instead of the standard window.' },
  { id: 'service', label: 'VIP Support', icon: Headphones, requiredTier: 'V3', description: 'A dedicated support line that skips the general queue.' },
  { id: 'gifts', label: 'Festival Gifts', icon: Calendar, requiredTier: 'V3', description: 'Seasonal surprise gifts sent to V3 members automatically.' },
  { id: 'magazine', label: 'Insider Digest', icon: BookOpen, requiredTier: 'V3', description: 'A quarterly roundup of new stores and deals, V3-only.' },
  { id: 'promos', label: 'V3-Only Promotions', icon: Percent, requiredTier: 'V3', description: 'Pricing only V3 members see, applied automatically at checkout.' },
  { id: 'soon', label: 'Coming Soon', icon: MoreHorizontal, requiredTier: 'V3', description: 'More perks are on the way for top-tier members.', comingSoon: true },
]

// One tile in the rewards grid — icon over label, boxed, with a lock
// affordance for tiers the user hasn't reached yet. Locked tiles stay
// visible (dimmed, with the tier needed) rather than hidden — seeing
// what's still ahead is part of what makes this page motivating. Built as
// a real <button> so the description surfaces on keyboard focus too, not
// only mouse hover.
function RewardTile({ reward, unlocked }: { reward: Reward; unlocked: boolean }) {
  const Icon = reward.icon
  return (
    <div className="group relative">
      <button
        type="button"
        className={`flex w-full flex-col items-center gap-2 rounded-2xl border p-4 text-center transition-colors duration-150 ${
          unlocked
            ? 'border-ink/10 bg-card hover:border-teal/30 focus-visible:border-teal/30'
            : 'border-ink/5 bg-ink/[0.02]'
        } outline-none focus-visible:ring-2 focus-visible:ring-teal/40`}
      >
        <span
          className={`grid size-11 place-items-center rounded-xl ${
            unlocked ? 'bg-teal/12 text-teal-deep' : 'bg-ink/5 text-ink/25'
          }`}
        >
          {reward.comingSoon ? (
            <MoreHorizontal size={18} strokeWidth={1.8} />
          ) : (
            <Icon size={18} strokeWidth={1.8} />
          )}
        </span>
        <span className={`text-xs font-semibold leading-tight ${unlocked ? 'text-ink' : 'text-ink/35'}`}>
          {reward.label}
        </span>
        {!unlocked && !reward.comingSoon && (
          <span className="absolute right-2 top-2 flex items-center gap-0.5 rounded-full bg-ink/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            <Lock size={9} strokeWidth={2} />
            {reward.requiredTier}
          </span>
        )}
      </button>

      {/* Description popover — shown on hover or keyboard focus. */}
      <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-48 -translate-x-1/2 rounded-xl border border-ink/10 bg-card p-3 text-left text-[11px] leading-snug text-ink/70 opacity-0 shadow-lg shadow-ink/10 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
        {reward.description}
      </div>
    </div>
  )
}

// Tier progress, styled for the dark hero card: filled dots up through the
// current tier, an in-progress fill on the segment leading to the next
// one. No digits inside the dots — the tier labels underneath already say
// V0/V1/V2/V3, so a number would just repeat that.
function TierProgress({ currentTier, progressToNext }: { currentTier: Tier; progressToNext: number }) {
  const currentIndex = TIER_ORDER.indexOf(currentTier)
  return (
    <div className="flex items-center gap-1.5">
      {TIER_ORDER.map((tier, i) => {
        const reached = i <= currentIndex
        const isNextSegmentStart = i === currentIndex && i < TIER_ORDER.length - 1
        return (
          <div key={tier} className="flex flex-1 items-center gap-1.5 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <span className={`size-2.5 rounded-full ${reached ? 'bg-white' : 'bg-white/25'}`} />
              <span className={`text-[10px] font-semibold ${reached ? 'text-white/80' : 'text-white/35'}`}>
                {tier}
              </span>
            </div>
            {i < TIER_ORDER.length - 1 && (
              <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-white transition-all duration-300"
                  style={{
                    width: reached && !isNextSegmentStart ? '100%' : isNextSegmentStart ? `${progressToNext}%` : '0%',
                  }}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Single collapsible FAQ row.
function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-ink/5 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center justify-between py-3.5 text-left text-sm font-semibold text-ink outline-none focus-visible:text-teal-deep"
      >
        {question}
        <ChevronDown
          size={16}
          className={`shrink-0 text-ink/40 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <p className="pb-3.5 text-sm text-ink/60">{answer}</p>}
    </div>
  )
}

type VipPageProps = {
  /**
   * All of these are optional and defended against at render time. The
   * VIP page is commonly rendered before its account/loyalty data source
   * has finished loading (no `hydrated` gate upstream, a slow fetch, a
   * caller that hasn't wired every field yet) — this component must never
   * crash on that, it should just show sensible placeholders until the
   * real values arrive.
   */
  username?: string
  currentTier?: Tier
  points?: number
  /** 0–100, progress from currentTier toward the next tier. Ignored at V3 (max tier). */
  progressToNext?: number
  nextTierRequirements?: string[]
  rewards?: Reward[]
  faqs?: { question: string; answer: string }[]
  onViewRules?: () => void
  onViewRedemptionRecord?: () => void
  onViewAllStores?: () => void
}

const DEFAULT_FAQS = [
  { question: 'How do I join?', answer: 'Every account is automatically enrolled at V0 — there\u2019s nothing separate to sign up for.' },
  { question: 'What do I get if I level up?', answer: 'Each tier unlocks the rewards shown above, plus tier-exclusive pricing on select items.' },
  { question: 'How can I find out my tier?', answer: 'Your current tier is shown at the top of this page, next to your name.' },
  { question: 'How do I level up?', answer: 'Tiers are based on your order count and total spend over a rolling period — see the requirements above.' },
]

export default function VipPage({
  username,
  currentTier,
  points,
  progressToNext = 0,
  nextTierRequirements = [],
  rewards = DEFAULT_REWARDS,
  faqs = DEFAULT_FAQS,
  onViewRules,
  onViewRedemptionRecord,
  onViewAllStores,
}: VipPageProps) {
  // Every one of these can legitimately arrive undefined/malformed while
  // the caller's loyalty data is still loading, or hasn't been wired up —
  // default each one rather than letting the first render crash.
  const safeUsername = username ?? 'Member'
  const safePoints = typeof points === 'number' && Number.isFinite(points) ? points : 0
  const safeProgress = Math.min(100, Math.max(0, Number.isFinite(progressToNext) ? progressToNext : 0))
  const safeTier: Tier = currentTier && TIER_ORDER.includes(currentTier) ? currentTier : 'V0'
  const currentIndex = TIER_ORDER.indexOf(safeTier)
  const isMaxTier = currentIndex === TIER_ORDER.length - 1
  const accent = TIER_ACCENT[safeTier]

  return (
    <div className="mx-auto max-w-6xl px-6 pb-8 lg:px-10">
      {/* Membership card — the one bold move on this page. Everything
          else stays quiet by comparison. */}
      <div className="relative mt-6 overflow-hidden rounded-2xl bg-ink px-6 py-7 text-white">
        <div className={`pointer-events-none absolute -right-16 -top-16 size-64 rounded-full blur-3xl ${accent.glow}`} />
        <span className="pointer-events-none absolute bottom-2 right-4 font-display text-[7rem] leading-none text-white/[0.05]">
          {safeTier.charAt(1)}
        </span>

        <div className="relative">
          <h1 className="font-display text-2xl uppercase tracking-wide">VIP</h1>
          <p className="mt-1 text-sm text-white/55">Your tier, points, and rewards in one place.</p>

          <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-display text-lg">{safeUsername}</p>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${accent.chip}`}>
                  <Crown size={11} strokeWidth={2} />
                  {safeTier}
                </span>
              </div>
              <p className="mt-3 font-display text-4xl tabular-nums">{safePoints.toLocaleString()}</p>
              <p className="text-xs text-white/50">points balance</p>
            </div>

            {onViewRules && (
              <button
                type="button"
                onClick={onViewRules}
                className="text-xs font-semibold text-white/70 underline underline-offset-2 hover:text-white"
              >
                View full rules
              </button>
            )}
          </div>

          <div className="mt-6">
            <TierProgress currentTier={safeTier} progressToNext={safeProgress} />
            <p className="mt-2 text-xs text-white/50">
              {isMaxTier
                ? "You've reached the top tier."
                : `${safeProgress}% of the way to ${TIER_ORDER[currentIndex + 1]}`}
            </p>
          </div>
        </div>
      </div>

      {/* Tier requirements — quiet panel, no competing color. */}
      <div className="mt-4 rounded-2xl border border-ink/10 bg-card p-6">
        <h2 className="font-display text-sm text-ink">Tier requirements</h2>
        {nextTierRequirements.length > 0 ? (
          <ul className="mt-2 space-y-1.5 text-sm text-ink/65">
            {nextTierRequirements.map((req) => (
              <li key={req}>{req}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ink/50">You&apos;re at the highest tier — no further requirements.</p>
        )}
      </div>

      {/* Rewards grid */}
      <div className="mt-4 rounded-2xl border border-ink/10 bg-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm text-ink">My rewards</h2>
          {onViewRedemptionRecord && (
            <button
              type="button"
              onClick={onViewRedemptionRecord}
              className="text-xs font-semibold text-ink/55 underline underline-offset-2 hover:text-teal-deep"
            >
              Redemption record
            </button>
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {rewards.map((reward) => (
            <RewardTile
              key={reward.id}
              reward={reward}
              unlocked={!reward.comingSoon && TIER_ORDER.indexOf(reward.requiredTier) <= currentIndex}
            />
          ))}
        </div>
      </div>

      {/* Tier-exclusive promo */}
      {!isMaxTier && (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-2xl border border-gold/30 bg-gold/8 px-6 py-6 text-center">
          <div>
            <p className="font-display text-sm text-gold-deep">
              {TIER_ORDER[TIER_ORDER.length - 1]}-only promotions
            </p>
            <p className="mt-1 text-sm text-ink/60">Unlock exclusive pricing when you reach the top tier.</p>
          </div>
          {onViewAllStores && (
            <button
              type="button"
              onClick={onViewAllStores}
              className="inline-flex items-center gap-1 rounded-none bg-ink px-6 py-2.5 text-sm font-bold tracking-wide text-white transition-opacity hover:opacity-90"
            >
              Browse stores <ChevronRight size={14} />
            </button>
          )}
        </div>
      )}

      {/* FAQ */}
      <div className="mt-4 rounded-2xl border border-ink/10 bg-card p-6">
        <h2 className="font-display text-sm text-ink">FAQs</h2>
        <div className="mt-2">
          {faqs.map((faq) => (
            <FaqItem key={faq.question} question={faq.question} answer={faq.answer} />
          ))}
        </div>
      </div>
    </div>
  )
}