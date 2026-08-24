'use client'

import { useState } from 'react'
import { Check, Copy, Gift, Send, Users } from 'lucide-react'
import { referralCode, referralLink, referralStats, referredFriends, rewardTiers } from './data'
import type { ReferralStatus } from './types'

const statusStyles: Record<ReferralStatus, string> = {
  Invited: 'bg-ink/5 text-ink/60',
  Joined: 'bg-blue/10 text-blue',
  Rewarded: 'bg-gold-soft text-rust',
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
      <h1 className="font-display text-4xl text-ink sm:text-5xl">Invite &amp; earn</h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink/60">
        Share your link — every friend who ships their first parcel earns you both a reward.
      </p>

      <div className="mt-8 rounded-2xl bg-gold-soft px-8 py-9">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink/70">
          <Gift size={16} className="text-rust" /> Your referral link
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <div className="flex-1 truncate rounded-xl border border-ink/10 bg-paper px-4 py-3.5 font-mono text-sm text-ink/80">
            {referralLink}
          </div>
          <button
            onClick={copyLink}
            className="flex items-center justify-center gap-2 rounded-xl bg-ink px-6 py-3.5 text-sm font-semibold text-paper transition-colors hover:bg-blue-deep"
          >
            {copied ? (
              <>
                <Check size={16} /> Copied
              </>
            ) : (
              <>
                <Copy size={16} /> Copy link
              </>
            )}
          </button>
        </div>
        <p className="mt-3 font-mono text-xs uppercase tracking-widest text-muted">Code: {referralCode}</p>

        <div className="mt-6 flex flex-wrap gap-3">
          {['WhatsApp', 'Facebook', 'X', 'Email'].map((channel) => (
            <button
              key={channel}
              className="flex items-center gap-2 rounded-full border border-ink/15 bg-paper px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-ink/5"
            >
              <Send size={14} /> {channel}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Stat label="Friends invited" value={referralStats.invited} />
        <Stat label="Friends joined" value={referralStats.joined} />
        <Stat label="Credits earned" value={referralStats.creditsEarned} />
      </div>

      <h2 className="mt-11 font-display text-2xl text-ink">Reward tiers</h2>
      <div className="mt-5 grid gap-5 sm:grid-cols-3">
        {rewardTiers.map((tier) => (
          <div key={tier.friends} className="rounded-2xl border border-dashed border-ink/20 bg-card p-6">
            <p className="font-display text-xl text-ink">{tier.friends}</p>
            <p className="mt-1.5 text-sm font-semibold text-rust">{tier.reward}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-11 font-display text-2xl text-ink">Your referrals</h2>
      <div className="mt-5">
        {referredFriends.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-ink/25 px-6 py-14 text-center">
            <Users size={26} className="mx-auto text-muted" />
            <h3 className="mt-4 font-display text-lg text-ink">No referrals yet</h3>
            <p className="mt-2 text-sm text-ink/60">
              Share your link above — everyone you invite shows up here once they sign up.
            </p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-ink/10 rounded-2xl border border-ink/10 bg-card">
            {referredFriends.map((friend) => (
              <div key={friend.name} className="flex items-center justify-between gap-4 px-6 py-4">
                <div>
                  <p className="text-sm font-semibold text-ink">{friend.name}</p>
                  <span className="text-xs text-muted">{friend.date}</span>
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-ink/10 bg-card p-6">
      <p className="font-display text-3xl text-ink">{value}</p>
      <p className="mt-1 text-sm font-semibold text-ink/60">{label}</p>
    </div>
  )
}
