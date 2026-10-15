// app/account/referrals/page.tsx
//
// Refer a friend: your link, what you both get, and the friends who joined
// with it. Everything comes from the server (/api/referrals/me →
// lib/referrals/server.ts): the link carries your referral code, friends
// are linked when they sign up, and rewards are issued as coupons when the
// friend's first order is paid — nothing here can be changed from the
// browser. Shares the account pages' look (AccountPageKit).
'use client'

import { useEffect, useState } from 'react'
import { Check, Copy, Gift, Link2, Share2, ShoppingBag, UserPlus, Users } from 'lucide-react'
import { AccountCard, AccountPage, AccountPageHeader } from '@/components/account/AccountPageKit'

type FriendStatus = 'joined' | 'rewarded' | 'void'

type ReferralData = {
  enabled: boolean
  code: string
  link: string
  friendReward: string
  friendMinOrderLKR: number
  referrerReward: string
  qualifyingOrderLKR: number
  stats: { joined: number; rewarded: number }
  friends: { id: string; name: string; status: FriendStatus; joinedAt: string | null; rewardedAt: string | null; rewardLabel: string | null }[]
}

const STATUS: Record<FriendStatus, { label: string; className: string }> = {
  joined: { label: 'Joined', className: 'bg-teal/12 text-teal-deep' },
  rewarded: { label: 'Rewarded', className: 'bg-gold/20 text-gold-deep' },
  void: { label: 'Not eligible', className: 'bg-ink/8 text-ink/50' },
}

const lkr = (n: number) => `Rs. ${Math.round(n).toLocaleString('en-LK')}`

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

export default function ReferralsPage() {
  const [data, setData] = useState<ReferralData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<'link' | 'code' | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/referrals/me')
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) setError(body.error ?? 'Couldn’t load your referrals.')
        else setData(body as ReferralData)
      })
      .catch(() => !cancelled && setError('Couldn’t load your referrals.'))
    return () => {
      cancelled = true
    }
  }, [])

  const copy = async (what: 'link' | 'code') => {
    if (!data) return
    try {
      await navigator.clipboard.writeText(what === 'link' ? data.link : data.code)
      setCopied(what)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      // Clipboard can be blocked; the link is still visible to copy by hand.
    }
  }

  const share = async () => {
    if (!data) return
    const text = `I shop from Indian stores with Wishdrop and get it delivered in Sri Lanka. Sign up with my link and get ${data.friendReward} your first order:`
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Join me on Wishdrop', text, url: data.link })
      } catch {
        /* cancelled */
      }
      return
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${data.link}`)}`, '_blank', 'noopener')
  }

  if (error) {
    return (
      <AccountPage>
        <AccountPageHeader eyebrow="Rewards" title="Refer a friend" />
        <p className="mt-6 rounded-2xl bg-card p-6 text-sm text-ink/60 ring-1 ring-ink/10">{error}</p>
      </AccountPage>
    )
  }

  if (!data) {
    return (
      <AccountPage>
        <div className="h-10 w-56 animate-pulse rounded-xl bg-ink/5" />
        <div className="mt-6 h-56 animate-pulse rounded-3xl bg-ink/5" />
        <div className="mt-4 h-40 animate-pulse rounded-3xl bg-ink/5" />
      </AccountPage>
    )
  }

  const steps = [
    { icon: Link2, title: 'Share your link', body: 'Send it on WhatsApp, Instagram or anywhere.' },
    {
      icon: UserPlus,
      title: 'They sign up',
      body: `Your friend gets ${data.friendReward} their first order${data.friendMinOrderLKR ? ` of ${lkr(data.friendMinOrderLKR)}+` : ''}.`,
    },
    {
      icon: ShoppingBag,
      title: 'You get rewarded',
      body: `When their first order${data.qualifyingOrderLKR ? ` of ${lkr(data.qualifyingOrderLKR)}+` : ''} is paid, you get ${data.referrerReward} your next one.`,
    },
  ]

  return (
    <AccountPage>
      <AccountPageHeader
        eyebrow="Rewards"
        title="Refer a friend"
        subtitle="Share Wishdrop with friends. They get a welcome discount, and you get a reward when they place their first order."
      />

      {!data.enabled && (
        <p className="mt-6 rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-ink">
          Referral rewards are paused right now. Your link still works, and we’ll let you know when rewards are back.
        </p>
      )}

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
            <p className="mt-4 font-display text-2xl text-white sm:text-3xl">
              They get {data.friendReward}. You get {data.referrerReward}.
            </p>
            <p className="mt-1.5 max-w-md text-sm text-parchment/65">
              {data.stats.rewarded > 0
                ? `You’ve earned ${data.stats.rewarded} ${data.stats.rewarded === 1 ? 'reward' : 'rewards'} so far. Thank you for spreading the word!`
                : 'No limit on how many friends you can invite.'}
            </p>
          </div>

          <div className="min-w-0 rounded-2xl bg-white/[0.07] p-4 ring-1 ring-white/10 backdrop-blur-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-parchment/55">Your link</p>
            <div className="mt-2 flex items-center gap-2 rounded-xl bg-indigo-deep/60 px-3 py-2.5 ring-1 ring-white/10">
              <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-parchment/90">{data.link}</span>
              <button
                type="button"
                onClick={() => copy('link')}
                aria-label="Copy link"
                className="grid h-8 w-8 flex-none place-items-center rounded-lg text-parchment/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                {copied === 'link' ? <Check size={16} className="text-gold" /> : <Copy size={16} />}
              </button>
            </div>
            <p className="mt-2 text-xs text-parchment/55">
              Your code:{' '}
              <button type="button" onClick={() => copy('code')} className="font-mono font-semibold text-parchment hover:text-gold">
                {data.code}
              </button>
              {copied === 'code' && <span className="ml-1 text-gold">copied</span>}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => copy('link')}
                className="inline-flex items-center justify-center gap-1.5 rounded-full bg-white/10 px-4 py-2.5 text-sm font-semibold text-parchment transition-colors hover:bg-white/15"
              >
                {copied === 'link' ? <Check size={15} /> : <Copy size={15} />} {copied === 'link' ? 'Copied' : 'Copy link'}
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
        {steps.map(({ icon: Icon, title, body }, i) => (
          <div key={title} className="flex items-start gap-3 rounded-3xl bg-card p-4 ring-1 ring-ink/10 sm:flex-col sm:p-5">
            <span className="relative grid h-10 w-10 flex-none place-items-center rounded-xl bg-teal/10 text-teal-deep">
              <Icon size={18} strokeWidth={1.9} />
              <span className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-indigo text-[10px] font-bold text-parchment">
                {i + 1}
              </span>
            </span>
            <div>
              <p className="font-semibold text-ink">{title}</p>
              <p className="mt-0.5 text-sm text-ink/55">{body}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Friends */}
      <AccountCard
        className="mt-4"
        icon={Users}
        title="Friends who joined"
        description={data.friends.length ? `${data.stats.joined} joined · ${data.stats.rewarded} rewarded` : undefined}
      >
        {data.friends.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl bg-parchment/60 px-6 py-10 text-center ring-1 ring-ink/5">
            <p className="text-sm text-ink/55">No one has joined with your link yet.</p>
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
            {data.friends.map((f) => (
              <li key={f.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-teal/10 text-sm font-bold text-teal-deep">
                  {initials(f.name) || '?'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">{f.name}</p>
                  <p className="text-xs text-ink/50">
                    {f.joinedAt
                      ? `Joined ${new Date(f.joinedAt).toLocaleDateString('en-LK', { day: 'numeric', month: 'short', year: 'numeric' })}`
                      : 'Joined'}
                    {f.status === 'rewarded' && f.rewardLabel
                      ? ` · You got ${f.rewardLabel}`
                      : f.status === 'joined'
                        ? ' · Waiting for their first order'
                        : ''}
                  </p>
                </div>
                <span className={`flex-none rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS[f.status].className}`}>
                  {STATUS[f.status].label}
                </span>
              </li>
            ))}
          </ul>
        )}
      </AccountCard>
    </AccountPage>
  )
}
