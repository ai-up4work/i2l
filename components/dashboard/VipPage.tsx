// VipPage.tsx
'use client'

import { useState } from 'react'
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

type IconComponent = React.ComponentType<{
  size?: number
  strokeWidth?: number
  className?: string
}>

type Tier = 'V0' | 'V1' | 'V2' | 'V3'

const TIER_ORDER: Tier[] = ['V0', 'V1', 'V2', 'V3']

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

// One tile in the rewards grid — mirrors HomePage's IconOnlyColumn shape
// (icon over label) but bigger, boxed, and with a lock affordance for
// tiers the user hasn't reached yet. Locked tiles are dimmed and show a
// small lock badge + the tier needed, rather than being hidden entirely —
// seeing what's still ahead is part of what makes a VIP page motivating.
function RewardTile({ reward, unlocked }: { reward: Reward; unlocked: boolean }) {
  const Icon = reward.icon
  return (
    <div
      className={`group relative flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition-colors duration-150 ${
        unlocked
          ? 'border-ink/10 bg-card hover:border-teal/30'
          : 'border-ink/5 bg-ink/[0.02]'
      }`}
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

      {/* Hover/tap tooltip with the reward description — keeps the grid
          scannable at a glance while still explaining each perk, same
          idea as SHEIN's "SHEINISTA Magazine" popover in the reference. */}
      <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-48 -translate-x-1/2 rounded-xl border border-ink/10 bg-card p-3 text-left text-[11px] leading-snug text-ink/70 opacity-0 shadow-lg shadow-ink/10 transition-opacity duration-150 group-hover:opacity-100">
        {reward.description}
      </div>
    </div>
  )
}

// Horizontal tier progress bar — dots for each tier, filled up to the
// user's current tier, with the in-between segment showing % progress
// toward the next one. Deliberately not animated/bouncy since this is a
// status indicator someone will glance at often, not a celebratory moment.
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
              <span
                className={`grid size-6 place-items-center rounded-full text-[10px] font-bold ${
                  reached ? 'bg-teal-deep text-white' : 'border border-ink/15 bg-parchment text-ink/40'
                }`}
              >
                {i}
              </span>
              <span className="text-[10px] font-semibold text-ink/50">{tier}</span>
            </div>
            {i < TIER_ORDER.length - 1 && (
              <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-ink/10">
                <div
                  className="h-full rounded-full bg-teal-deep transition-all duration-300"
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
        className="flex w-full items-center justify-between py-3.5 text-left text-sm font-semibold text-ink"
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
  username: string
  currentTier: Tier
  points: number
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
  const currentIndex = TIER_ORDER.indexOf(currentTier)
  const isMaxTier = currentIndex === TIER_ORDER.length - 1

  return (
    <div className="mx-auto max-w-5xl px-6 pb-8 lg:px-10">
      {/* Hero banner */}
      <div className="mt-6 rounded-2xl bg-ink px-6 py-8 text-white">
        <h1 className="font-display text-2xl">VIP</h1>
      </div>

      {/* Level card */}
      <div className="mt-4 grid gap-6 rounded-2xl border border-ink/10 bg-card p-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-14 place-items-center rounded-full border border-ink/10 bg-teal/10 font-display text-xl text-teal-deep">
              {currentTier.charAt(0)}
            </span>
            <div>
              <p className="font-display text-lg text-ink">{username}</p>
              <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-ink/5 px-2 py-0.5 text-xs font-semibold text-ink/60">
                <Crown size={11} strokeWidth={2} />
                {currentTier}
              </span>
            </div>
          </div>

          <TierProgress currentTier={currentTier} progressToNext={progressToNext} />

          {isMaxTier ? (
            <p className="text-xs font-semibold text-teal-deep">You&apos;ve reached the top tier.</p>
          ) : (
            <p className="text-xs text-ink/50">
              {progressToNext}% of the way to {TIER_ORDER[currentIndex + 1]}
            </p>
          )}
        </div>

        <div className="rounded-xl bg-ink/[0.02] p-5">
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
          {onViewRules && (
            <button
              type="button"
              onClick={onViewRules}
              className="mt-3 text-xs font-semibold text-teal-deep underline underline-offset-2 hover:text-indigo-deep"
            >
              View full rules
            </button>
          )}
        </div>
      </div>

      {/* Rewards grid */}
      <div className="mt-4 rounded-2xl border border-ink/10 bg-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base text-ink">My Rewards</h2>
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

      {/* Tier-exclusive promo banner */}
      {!isMaxTier && (
        <div className="mt-4 rounded-2xl border border-gold/30 bg-gold/8 px-6 py-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-gold-deep">
            {TIER_ORDER[TIER_ORDER.length - 1]}-Only Promotions
          </p>
          <p className="mt-1 text-sm text-ink/60">Unlock exclusive pricing when you reach the top tier.</p>
          {onViewAllStores && (
            <button
              type="button"
              onClick={onViewAllStores}
              className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-teal-deep hover:text-indigo-deep"
            >
              Browse stores <ChevronRight size={14} />
            </button>
          )}
        </div>
      )}

      {/* FAQ */}
      <div className="mt-4 rounded-2xl border border-ink/10 bg-card p-6">
        <h2 className="font-display text-base text-ink">FAQs</h2>
        <div className="mt-2">
          {faqs.map((faq) => (
            <FaqItem key={faq.question} question={faq.question} answer={faq.answer} />
          ))}
        </div>
      </div>
    </div>
  )
}