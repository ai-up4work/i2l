'use client'

import { useEffect, useState } from 'react'
import { Check, Copy, Gift, Send, Users } from 'lucide-react'
import { referralCode, referralLink, referralStats, referredFriends, rewardTiers } from './data'
import type { ReferralStatus } from './types'

const statusStyles: Record<ReferralStatus, string> = {
  Invited: 'bg-ink/5 text-ink/60',
  Joined: 'bg-teal/10 text-teal',
  Rewarded: 'bg-gold/10 text-gold-deep',
}

function useCountUp(target: number, duration = 800) {
  const [value, setValue] = useState(0)

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) {
      setValue(target)
      return
    }

    let start: number | null = null
    let raf: number

    const step = (timestamp: number) => {
      if (start === null) start = timestamp
      const progress = Math.min((timestamp - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(eased * target))
      if (progress < 1) raf = requestAnimationFrame(step)
    }

    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])

  return value
}

export default function ReferralsPage() {
  const [copied, setCopied] = useState(false)

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(referralLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Ignore — the link is still visible to copy by hand.
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 pb-16 pt-8 lg:px-10">
      <div className="motion-safe:[animation:fadeUp_0.4s_ease-out_both]">
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">Invite &amp; earn</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink/60">
          Share your link — every friend who ships their first parcel earns you both a reward.
        </p>
      </div>

      <div className="relative mt-8 overflow-hidden rounded-2xl bg-gold/10 px-8 py-9 motion-safe:[animation:fadeUp_0.4s_ease-out_0.05s_both]">
        <div
          className="pointer-events-none absolute -right-14 -top-14 h-48 w-48 rounded-full bg-gold/20 blur-3xl"
          aria-hidden
        />
        <div className="relative">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink/70">
            <Gift size={16} className="text-gold-deep" /> Your referral link
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <div className="flex-1 truncate rounded-xl border border-ink/10 bg-parchment px-4 py-3.5 font-mono text-sm text-ink/80">
              {referralLink}
            </div>
            <button
              onClick={copyLink}
              className={`flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold text-parchment transition-all duration-200 active:scale-95 ${
                copied ? 'bg-gold-deep' : 'bg-ink hover:bg-teal-deep'
              }`}
            >
              {copied ? (
                <>
                  <Check size={16} className="motion-safe:[animation:scaleIn_0.25s_ease-out_both]" /> Copied
                </>
              ) : (
                <>
                  <Copy size={16} /> Copy link
                </>
              )}
            </button>
          </div>
          <p className="mt-3 font-mono text-xs uppercase tracking-widest text-ink/40">Code: {referralCode}</p>

          <div className="mt-6 flex flex-wrap gap-3">
            {['WhatsApp', 'Facebook', 'X', 'Email'].map((channel) => (
              <button
                key={channel}
                className="flex items-center gap-2 rounded-full border border-ink/15 bg-parchment px-4 py-2 text-sm font-semibold text-ink transition-colors duration-200 hover:border-ink/25 hover:bg-ink/5 active:scale-95"
              >
                <Send size={14} /> {channel}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Stat label="Friends invited" value={referralStats.invited} delay={0} />
        <Stat label="Friends joined" value={referralStats.joined} delay={80} />
        <Stat label="Credits earned" value={referralStats.creditsEarned} delay={160} />
      </div>

      <h2 className="mt-11 font-display text-2xl text-ink">Reward tiers</h2>
      <div className="mt-5 grid gap-5 sm:grid-cols-3">
        {rewardTiers.map((tier, i) => (
          <div
            key={tier.friends}
            className="rounded-2xl border border-dashed border-ink/20 bg-card p-6 transition-colors duration-300 hover:border-gold-deep/40 hover:bg-ink/[0.015] motion-safe:[animation:fadeUp_0.4s_ease-out_both]"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <p className="font-display text-xl text-ink">{tier.friends}</p>
            <p className="mt-1.5 text-sm font-semibold text-gold-deep">{tier.reward}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-11 font-display text-2xl text-ink">Your referrals</h2>
      <div className="mt-5">
        {referredFriends.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-ink/25 px-6 py-14 text-center motion-safe:[animation:fadeUp_0.4s_ease-out_0.1s_both]">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ink/5 motion-safe:[animation:scaleIn_0.4s_ease-out_0.05s_both]">
              <Users size={22} className="text-ink/40" />
            </div>
            <h3 className="mt-4 font-display text-lg text-ink">No referrals yet</h3>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-ink/60">
              Share your link above — everyone you invite shows up here once they sign up.
            </p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-ink/10 rounded-2xl border border-ink/10 bg-card">
            {referredFriends.map((friend, i) => (
              <div
                key={friend.name}
                className="flex items-center justify-between gap-4 px-6 py-4 transition-colors duration-200 hover:bg-ink/[0.02] motion-safe:[animation:fadeUp_0.35s_ease-out_both]"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div>
                  <p className="text-sm font-semibold text-ink">{friend.name}</p>
                  <span className="text-xs text-ink/40">{friend.date}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-ink/60">{friend.reward}</span>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[friend.status]}`}>
                    {friend.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, delay }: { label: string; value: number; delay: number }) {
  const animatedValue = useCountUp(value)

  return (
    <div
      className="rounded-2xl border border-ink/10 bg-card p-6 transition-colors duration-300 hover:bg-ink/[0.015] motion-safe:[animation:fadeUp_0.4s_ease-out_both]"
      style={{ animationDelay: `${delay}ms` }}
    >
      <p className="font-display text-3xl tabular-nums text-ink">{animatedValue}</p>
      <p className="mt-1 text-sm font-semibold text-ink/60">{label}</p>
    </div>
  )
}