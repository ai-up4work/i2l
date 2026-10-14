// app/account/referrals/page.tsx
//
// Refer a friend: your link, how it works, reward tiers with progress,
// and the friends you've invited. Shares the account pages' look
// (components/account/AccountPageKit.tsx).
'use client'

import { useState } from 'react'
import { Check, Copy, Gift, Link2, Share2, ShoppingBag, UserPlus, Users } from 'lucide-react'
import { useLoyalty, type ReferralStatus as ContextReferralStatus } from '@/contexts/Loyaltycontext'
import { AccountCard, AccountPage, AccountPageHeader } from '@/components/account/AccountPageKit'

const STATUS: Record<ContextReferralStatus, { label: string; className: string }> = {
  invited: { label: 'Invited', className: 'bg-ink/8 text-ink/60' },
  joined: { label: 'Joined', className: 'bg-teal/12 text-teal-deep' },
  rewarded: { label: 'Rewarded', className: 'bg-gold/20 text-gold-deep' },
}

const STEPS = [
  { icon: Link2, title: 'Share your link', body: 'Send it on WhatsApp, Instagram or anywhere.' },
  { icon: UserPlus, title: 'They join Wishdrop', body: 'Your friend signs up with your link.' },
  { icon: ShoppingBag, title: 'You both get rewarded', body: 'When they place their first order.' },
]

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

export default function ReferralsPage() {
  const loyalty = useLoyalty()
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(loyalty.referralLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard can be blocked; the link is still visible to copy by hand.
    }
  }

  const share = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: 'Join me on Wishdrop',
          text: 'Shop from Indian and local stores with Wishdrop. Use my link and we both get rewarded.',
          url: loyalty.referralLink,
        })
      } catch {
        /* cancelled */
      }
      return
    }
    await copy()
  }

  if (!loyalty.hydrated) {
    return (
      <AccountPage>
        <div className="h-10 w-56 animate-pulse rounded-xl bg-ink/5" />
        <div className="mt-6 h-56 animate-pulse rounded-3xl bg-ink/5" />
        <div className="mt-4 h-40 animate-pulse rounded-3xl bg-ink/5" />
      </AccountPage>
    )
  }

  const friends = loyalty.referredFriends
  const rewardedCount = friends.filter((f) => f.status === 'rewarded').length
  const joinedCount = friends.filter((f) => f.status !== 'invited').length
  const tiers = [...loyalty.rewardTiers].sort((a, b) => a.friendCount - b.friendCount)
  const nextTier = tiers.find((t) => t.friendCount > rewardedCount)

  return (
    <AccountPage>
      <AccountPageHeader eyebrow="Rewards" title="Refer a friend" subtitle="Share Wishdrop with friends. When they place their first order, you both get rewarded." />

      {/* Invite card: indigo like the account home's "Buy for me" */}
      <section className="relative mt-6 overflow-hidden rounded-3xl bg-indigo p-5 sm:p-7">
        <span className="absolute inset-x-0 top-0 h-[3px] bg-gold" aria-hidden />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(14,140,156,0.45),transparent_65%)]"
        />
        <div className="relative grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center">
          <div>
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gold/15 text-gold">
              <Gift size={22} strokeWidth={1.8} />
            </span>
            <p className="mt-4 font-display text-2xl text-white sm:text-3xl">Give a little, get a little</p>
            <p className="mt-1.5 max-w-md text-sm text-parchment/65">
              {nextTier
                ? `${nextTier.friendCount - rewardedCount} more ${nextTier.friendCount - rewardedCount === 1 ? 'friend' : 'friends'} to unlock ${nextTier.label}.`
                : 'You’ve unlocked every reward. Thank you for spreading the word!'}
            </p>
          </div>

          <div className="min-w-0 rounded-2xl bg-white/[0.07] p-4 ring-1 ring-white/10 backdrop-blur-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-parchment/55">Your link</p>
            <div className="mt-2 flex items-center gap-2 rounded-xl bg-indigo-deep/60 px-3 py-2.5 ring-1 ring-white/10">
              <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-parchment/90">{loyalty.referralLink}</span>
              <button
                type="button"
                onClick={copy}
                aria-label="Copy link"
                className="grid h-8 w-8 flex-none place-items-center rounded-lg text-parchment/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                {copied ? <Check size={16} className="text-gold" /> : <Copy size={16} />}
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={copy}
                className="inline-flex items-center justify-center gap-1.5 rounded-full bg-white/10 px-4 py-2.5 text-sm font-semibold text-parchment transition-colors hover:bg-white/15"
              >
                {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                type="button"
                onClick={share}
                className="inline-flex items-center justify-center gap-1.5 rounded-full bg-gold px-4 py-2.5 text-sm font-semibold text-indigo transition-colors hover:bg-parchment"
              >
                <Share2 size={15} /> Share invite
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, body }, i) => (
          <div key={title} className="flex items-start gap-3 rounded-3xl bg-card p-4 ring-1 ring-ink/10 sm:flex-col sm:p-5">
            <span className="relative grid h-10 w-10 flex-none place-items-center rounded-xl bg-teal/10 text-teal-deep">
              <Icon size={18} strokeWidth={1.9} />
              <span className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-indigo text-[10px] font-bold text-parchment">{i + 1}</span>
            </span>
            <div>
              <p className="font-semibold text-ink">{title}</p>
              <p className="mt-0.5 text-sm text-ink/55">{body}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tiers */}
      <AccountCard className="mt-4" icon={Gift} title="Reward tiers" description={`${rewardedCount} ${rewardedCount === 1 ? 'friend has' : 'friends have'} ordered so far.`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {tiers.map((tier) => {
            const done = rewardedCount >= tier.friendCount
            const pct = Math.min(100, Math.round((rewardedCount / tier.friendCount) * 100))
            return (
              <div key={tier.friendCount} className={`rounded-2xl p-4 ring-1 ${done ? 'bg-teal/[0.06] ring-teal/30' : 'bg-parchment/60 ring-ink/8'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-ink/60">
                    {tier.friendCount} {tier.friendCount === 1 ? 'friend' : 'friends'}
                  </span>
                  {done && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-teal px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                      <Check size={10} strokeWidth={3} /> Unlocked
                    </span>
                  )}
                </div>
                <p className="mt-1 font-display text-2xl text-ink">{tier.label}</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/8">
                  <div className="h-full rounded-full bg-gradient-to-r from-teal to-gold transition-[width] duration-500" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </AccountCard>

      {/* Friends */}
      <AccountCard
        className="mt-4"
        icon={Users}
        title="Your referrals"
        description={friends.length ? `${friends.length} invited · ${joinedCount} joined` : undefined}
      >
        {friends.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl bg-parchment/60 px-6 py-10 text-center ring-1 ring-ink/5">
            <p className="text-sm text-ink/55">No referrals yet. Share your link to get started.</p>
            <button
              type="button"
              onClick={share}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-indigo px-5 py-2.5 text-sm font-semibold text-parchment hover:bg-indigo-deep"
            >
              <Share2 size={15} /> Share invite
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-ink/8">
            {friends.map((f) => (
              <li key={f.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-teal/10 text-sm font-bold text-teal-deep">{initials(f.name) || '?'}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">{f.name}</p>
                  <p className="text-xs text-ink/50">
                    Invited {new Date(f.invitedAt).toLocaleDateString('en-LK', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {f.rewardLabel ? ` · ${f.rewardLabel}` : ''}
                  </p>
                </div>
                <span className={`flex-none rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS[f.status].className}`}>{STATUS[f.status].label}</span>
              </li>
            ))}
          </ul>
        )}
      </AccountCard>
    </AccountPage>
  )
}
