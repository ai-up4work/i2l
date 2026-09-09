'use client'

import { useState } from 'react'
import { Copy, Check, Share2 } from 'lucide-react'
import { useLoyalty, type ReferralStatus as ContextReferralStatus } from '@/contexts/Loyaltycontext'
import type { ReferralStatus } from '@/components/dashboard/types'

const STATUS_LABELS: Record<ContextReferralStatus, ReferralStatus> = {
  invited: 'Invited',
  joined: 'Joined',
  rewarded: 'Rewarded',
}

const STATUS_STYLES: Record<ReferralStatus, string> = {
  Invited: 'bg-ink/10 text-ink/60',
  Joined: 'bg-teal/15 text-teal-deep',
  Rewarded: 'bg-rose-500/15 text-rose-600',
}

function StatusPill({ status }: { status: ContextReferralStatus }) {
  const label = STATUS_LABELS[status]
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-bold leading-none ${STATUS_STYLES[label]}`}>
      {label}
    </span>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16">
      <p className="font-body text-sm text-ink/40">
        No referrals yet — share your link to get started.
      </p>
    </div>
  )
}

function ReferralsSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10 lg:px-10">
      <div className="h-48 animate-pulse rounded-2xl bg-ink/5" />
      <div className="mt-8 h-32 animate-pulse rounded-2xl bg-ink/5" />
      <div className="mt-8 h-56 animate-pulse rounded-2xl bg-ink/5" />
    </div>
  )
}

export default function ReferralsPage() {
  const loyalty = useLoyalty()
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(loyalty.referralLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API can fail (permissions, insecure context); fail silently
      // rather than throwing — the link is still visible to copy manually.
    }
  }

  if (!loyalty.hydrated) {
    return <ReferralsSkeleton />
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 lg:px-10">
      {/* Hero — mirrors the Gift Card page's gradient banner treatment */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-teal-deep to-teal p-8 sm:p-10">
        <div
          className="pointer-events-none absolute inset-0 select-none font-display text-[10rem] font-black leading-none text-white/10"
          aria-hidden="true"
        >
          INVITE
        </div>

        <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="font-display text-4xl font-bold text-white">Refer a Friend</h1>
            <p className="mt-3 max-w-md font-body text-white/85">
              Share your link — you both get rewarded when they place their first order.
            </p>
          </div>

          <div className="w-full max-w-md rounded-xl bg-gradient-to-br from-white to-teal/5 p-6 shadow-lift lg:w-96">
            <div className="font-body text-sm text-ink/70">Your referral link</div>

            <div className="mt-2 flex items-center gap-2 rounded-lg border border-ink/10 bg-parchment px-3 py-2.5">
              <span className="flex-1 truncate font-body text-sm text-ink/80">
                {loyalty.referralLink}
              </span>
              <button
                type="button"
                onClick={handleCopy}
                aria-label="Copy referral link"
                className="flex-none text-ink/50 transition-colors hover:text-ink"
              >
                {copied ? <Check className="h-4 w-4 text-teal-deep" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>

            <button
              type="button"
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-ink px-5 py-2.5 font-body text-sm font-bold text-parchment transition-colors hover:bg-ink/85"
            >
              <Share2 className="h-4 w-4" />
              Share Invite
            </button>
          </div>
        </div>
      </div>

      {/* Reward tiers */}
      <div className="mt-8 rounded-2xl border border-ink/10 bg-white p-6">
        <h2 className="font-body text-lg font-bold text-ink">Reward Tiers</h2>

        <div className="mt-4 grid grid-cols-1 divide-y divide-ink/10 rounded-xl bg-ink/[0.04] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {loyalty.rewardTiers.map((tier) => (
            <div key={tier.friendCount} className="flex flex-col items-center gap-1 px-6 py-8 text-center">
              <div className="font-body text-sm text-ink/70">
                {tier.friendCount} {tier.friendCount === 1 ? 'friend' : 'friends'}
              </div>
              <div className="font-display text-xl font-bold text-rose-600">{tier.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Referred friends */}
      <div className="mt-8 rounded-2xl border border-ink/10 bg-white p-6">
        <h2 className="font-body text-lg font-bold text-ink">Your Referrals</h2>

        <div className="mt-4 overflow-hidden rounded-xl border border-ink/10">
          <div className="grid grid-cols-4 bg-ink/[0.04]">
            {['Friend', 'Status', 'Reward', 'Date'].map((col) => (
              <div
                key={col}
                className="px-4 py-3 font-body text-xs font-bold uppercase tracking-wide text-ink/60"
              >
                {col}
              </div>
            ))}
          </div>

          {loyalty.referredFriends.length === 0 ? (
            <EmptyState />
          ) : (
            <div>
              {loyalty.referredFriends.map((friend) => (
                <div key={friend.id} className="grid grid-cols-4 items-center border-t border-ink/10">
                  <div className="px-4 py-3 font-body text-sm text-ink/80">{friend.name}</div>
                  <div className="px-4 py-3">
                    <StatusPill status={friend.status} />
                  </div>
                  <div className="px-4 py-3 font-body text-sm text-ink/80">
                    {friend.rewardLabel ?? '—'}
                  </div>
                  <div className="px-4 py-3 font-body text-sm text-ink/60">
                    {new Date(friend.invitedAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}