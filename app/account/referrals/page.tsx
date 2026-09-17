'use client'

import { useState } from 'react'
import { Copy, Check, Share2, Gift } from 'lucide-react'
import { useLoyalty, type ReferralStatus as ContextReferralStatus } from '@/contexts/Loyaltycontext'
import type { ReferralStatus } from '@/components/dashboard/types'

const STATUS_LABELS: Record<ContextReferralStatus, ReferralStatus> = {
  invited: 'Invited',
  joined: 'Joined',
  rewarded: 'Rewarded',
}

// "Rewarded" previously shared the same rose/pink used for errors elsewhere
// in the app — a positive outcome shouldn't read as a warning. Amber reads
// as "earned/gold" without introducing a new hue to the palette.
const STATUS_STYLES: Record<ReferralStatus, string> = {
  Invited: 'bg-ink/10 text-ink/60',
  Joined: 'bg-teal/15 text-teal-deep',
  Rewarded: 'bg-amber-500/15 text-amber-700',
}

function StatusPill({ status }: { status: ContextReferralStatus }) {
  const label = STATUS_LABELS[status]
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold leading-none ${STATUS_STYLES[label]}`}>
      {label}
    </span>
  )
}

function EmptyState({ onCopy, copied }: { onCopy: () => void; copied: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-teal/10 text-teal-deep">
        <Gift className="h-5 w-5" strokeWidth={1.8} />
      </span>
      <p className="max-w-xs font-body text-sm text-ink/50">
        No referrals yet. Copy your link above and send it to a friend to get started.
      </p>
      <button
        type="button"
        onClick={onCopy}
        className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-ink/15 px-4 py-2 font-body text-xs font-bold text-ink/70 transition-colors hover:border-ink/30 hover:text-ink"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-teal-deep" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? 'Copied' : 'Copy link'}
      </button>
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
  const [shareFallbackCopied, setShareFallbackCopied] = useState(false)

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

  const handleShare = async () => {
    const shareData = {
      title: 'Join me on WildDrop',
      text: 'Use my link to sign up and we both get rewarded.',
      url: loyalty.referralLink,
    }

    // Prefer the native share sheet where available (mobile browsers,
    // installed PWAs). Fall back to clipboard on desktop browsers that
    // don't implement the Web Share API.
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share(shareData)
      } catch {
        // User cancelled the share sheet — not an error, do nothing.
      }
      return
    }

    try {
      await navigator.clipboard.writeText(loyalty.referralLink)
      setShareFallbackCopied(true)
      setTimeout(() => setShareFallbackCopied(false), 2000)
    } catch {
      // Same silent-fail rationale as handleCopy above.
    }
  }

  if (!loyalty.hydrated) {
    return <ReferralsSkeleton />
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 lg:px-10">
      {/* Hero */}
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
            {copied && (
              <p className="mt-1.5 font-body text-xs font-semibold text-teal-deep">Link copied</p>
            )}

            <button
              type="button"
              onClick={handleShare}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-ink px-5 py-2.5 font-body text-sm font-bold text-parchment transition-colors hover:bg-ink/85"
            >
              {shareFallbackCopied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
              {shareFallbackCopied ? 'Link copied' : 'Share Invite'}
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
              <div className="font-display text-xl font-bold text-teal-deep">{tier.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Referred friends */}
      <div className="mt-8 rounded-2xl border border-ink/10 bg-white p-6">
        <h2 className="font-body text-lg font-bold text-ink">Your Referrals</h2>

        {loyalty.referredFriends.length === 0 ? (
          <div className="mt-4 overflow-hidden rounded-xl border border-ink/10">
            <EmptyState onCopy={handleCopy} copied={copied} />
          </div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-xl border border-ink/10">
            {/* Column headers — desktop/tablet only; mobile switches to stacked cards */}
            <div className="hidden grid-cols-4 bg-ink/[0.04] sm:grid">
              {['Friend', 'Status', 'Reward', 'Date'].map((col) => (
                <div
                  key={col}
                  className="px-4 py-3 font-body text-xs font-bold uppercase tracking-wide text-ink/60"
                >
                  {col}
                </div>
              ))}
            </div>

            <div role="table" aria-label="Your referrals" className="divide-y divide-ink/10">
              {loyalty.referredFriends.map((friend) => (
                <div
                  key={friend.id}
                  role="row"
                  className="grid grid-cols-2 gap-y-2 px-4 py-4 sm:grid-cols-4 sm:items-center sm:gap-y-0 sm:px-0 sm:py-0"
                >
                  <div role="cell" className="col-span-2 font-body text-sm font-semibold text-ink/80 sm:col-span-1 sm:px-4 sm:py-3 sm:font-normal">
                    {friend.name}
                  </div>
                  <div role="cell" className="sm:px-4 sm:py-3">
                    <StatusPill status={friend.status} />
                  </div>
                  <div role="cell" className="font-body text-sm text-ink/80 sm:px-4 sm:py-3">
                    {friend.rewardLabel ?? '—'}
                  </div>
                  <div role="cell" className="text-right font-body text-sm text-ink/60 sm:px-4 sm:py-3 sm:text-left">
                    {new Date(friend.invitedAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}