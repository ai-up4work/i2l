// app/account/coupons/page.tsx
//
// My coupons. Reads /api/coupons (lib/coupons/server.ts): every coupon this
// customer can use — ones given to them, campaign coupons for everyone /
// new customers, referral rewards, QC compensation — each with a signed
// code bound to their account. "Use now" sends the code to the cart, where
// the server applies it. Pasting a shared campaign code (or opening a
// /account/coupons?add=<code> link) adds it to the account.
'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Check, Copy, Plus, Ticket } from 'lucide-react'
import { AccountEmpty, AccountPage, AccountPageHeader } from '@/components/account/AccountPageKit'

type CustomerCoupon = {
  id: string
  title: string
  description: string | null
  discountLabel: string
  minOrderLKR: number
  stores: string[] | null
  endsAt: string | null
  status: 'available' | 'used' | 'expired' | 'unavailable'
  usesLeft: number
  token: string
  via: string
}

type Tab = 'available' | 'used' | 'expired'

const TABS: { key: Tab; label: string }[] = [
  { key: 'available', label: 'Available' },
  { key: 'used', label: 'Used' },
  { key: 'expired', label: 'Expired' },
]

const VIA_LABEL: Record<string, string> = {
  referral: 'Referral reward',
  compensation: 'Quality-check credit',
  campaign: 'For everyone',
  claimed: 'Added by you',
  admin: 'Just for you',
  migrated: 'Just for you',
}

function storeLabel(slug: string) {
  return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function daysLeft(endsAt: string | null): string | null {
  if (!endsAt) return null
  const d = Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86_400_000)
  if (d < 0) return `Expired ${new Date(endsAt).toLocaleDateString('en-LK', { day: 'numeric', month: 'short' })}`
  if (d === 0) return 'Ends today'
  if (d === 1) return 'Ends tomorrow'
  if (d <= 7) return `${d} days left`
  return `Until ${new Date(endsAt).toLocaleDateString('en-LK', { day: 'numeric', month: 'short', year: 'numeric' })}`
}

function CouponTicket({ coupon }: { coupon: CustomerCoupon }) {
  const [copied, setCopied] = useState(false)
  const usable = coupon.status === 'available'
  const [amount, ...rest] = coupon.discountLabel.split(' off')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(coupon.token)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard blocked */
    }
  }

  const ending = daysLeft(coupon.endsAt)
  const soon = usable && coupon.endsAt && new Date(coupon.endsAt).getTime() - Date.now() < 3 * 86_400_000

  return (
    <article
      className={`relative flex flex-col overflow-hidden rounded-3xl bg-card ring-1 sm:flex-row ${
        usable ? 'ring-ink/10' : 'opacity-60 ring-ink/5'
      }`}
    >
      {/* Stub */}
      <div
        className={`flex flex-none flex-col justify-center gap-1 px-6 py-5 sm:w-48 ${
          usable ? 'bg-indigo text-parchment' : 'bg-ink/10 text-ink/60'
        }`}
      >
        <p className="font-display text-3xl leading-none">{amount}</p>
        <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${usable ? 'text-gold' : ''}`}>
          off{rest.join(' off')}
        </p>
        {coupon.minOrderLKR > 0 && (
          <p className={`mt-1 text-xs ${usable ? 'text-parchment/60' : ''}`}>
            On Rs. {Math.round(coupon.minOrderLKR).toLocaleString('en-LK')}+
          </p>
        )}
      </div>

      {/* Perforation */}
      <div aria-hidden className="hidden w-0 border-l-2 border-dashed border-ink/10 sm:block" />

      <div className="flex min-w-0 flex-1 flex-col gap-3 p-5 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-teal/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-teal-deep">
              {VIA_LABEL[coupon.via] ?? 'Coupon'}
            </span>
            {ending && (
              <span className={`text-xs ${soon ? 'font-semibold text-gold-deep' : 'text-ink/50'}`}>{ending}</span>
            )}
          </div>
          <h3 className="mt-1.5 font-semibold text-ink">{coupon.title}</h3>
          {coupon.description && <p className="mt-0.5 text-sm text-ink/55">{coupon.description}</p>}
          <p className="mt-1 text-xs text-ink/50">
            {coupon.stores?.length ? `Only on ${coupon.stores.map(storeLabel).join(', ')}` : 'On any store'}
            {usable && coupon.usesLeft > 1 ? ` · ${coupon.usesLeft} uses left` : ''}
            {coupon.status === 'unavailable' ? ' · Not active right now' : ''}
          </p>
        </div>

        {usable && (
          <div className="flex flex-none gap-2">
            <button
              type="button"
              onClick={copy}
              aria-label="Copy coupon code"
              className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 px-3.5 py-2 text-xs font-semibold text-ink/70 transition-colors hover:bg-ink/[0.04]"
            >
              {copied ? <Check size={14} className="text-teal-deep" /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Code'}
            </button>
            <Link
              href={`/account/cart?coupon=${encodeURIComponent(coupon.token)}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-teal-deep px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo"
            >
              Use now
            </Link>
          </div>
        )}
      </div>
    </article>
  )
}

function CouponsInner() {
  const searchParams = useSearchParams()
  const [coupons, setCoupons] = useState<CustomerCoupon[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('available')
  const [code, setCode] = useState('')
  const [adding, setAdding] = useState(false)
  const [addMsg, setAddMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/coupons')
    const body = await res.json().catch(() => ({}))
    if (!res.ok) setError(body.error ?? 'Couldn’t load your coupons.')
    else setCoupons(body.coupons ?? [])
  }, [])

  const add = useCallback(
    async (token: string) => {
      if (!token.trim()) return
      setAdding(true)
      setAddMsg(null)
      const res = await fetch('/api/coupons/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      })
      const body = await res.json().catch(() => ({}))
      setAdding(false)
      if (!res.ok) {
        setAddMsg({ tone: 'error', text: body.error ?? 'That code didn’t work.' })
        return
      }
      setAddMsg({ tone: 'ok', text: `Added: ${body.coupon?.title ?? 'coupon'} — ${body.coupon?.label ?? ''}` })
      setCode('')
      setTab('available')
      load()
    },
    [load],
  )

  useEffect(() => {
    load()
    const fromLink = searchParams.get('add')
    if (fromLink) add(fromLink)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const counts = useMemo(() => {
    const c = { available: 0, used: 0, expired: 0 }
    for (const x of coupons ?? []) {
      if (x.status === 'used') c.used++
      else if (x.status === 'expired') c.expired++
      else c.available++
    }
    return c
  }, [coupons])

  const visible = (coupons ?? []).filter((c) =>
    tab === 'available' ? c.status === 'available' || c.status === 'unavailable' : c.status === tab,
  )

  return (
    <AccountPage>
      <AccountPageHeader
        eyebrow="Rewards"
        title="My coupons"
        subtitle="Coupons on your account. Tap “Use now” and the discount is applied in your bag."
      />

      <form
        onSubmit={(e) => {
          e.preventDefault()
          add(code)
        }}
        className="mt-6 flex flex-col gap-2 rounded-3xl bg-card p-4 ring-1 ring-ink/10 sm:flex-row sm:items-center"
      >
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl bg-parchment/70 px-3.5 py-2.5 ring-1 ring-ink/10 focus-within:ring-teal/40">
          <Ticket size={16} className="flex-none text-ink/35" />
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Got a coupon code? Paste it here"
            className="w-full min-w-0 bg-transparent font-mono text-sm text-ink outline-none placeholder:font-body placeholder:text-ink/40"
          />
        </label>
        <button
          type="submit"
          disabled={adding || !code.trim()}
          className="inline-flex items-center justify-center gap-1.5 rounded-full bg-indigo px-5 py-2.5 text-sm font-semibold text-parchment transition-colors hover:bg-indigo-deep disabled:opacity-50"
        >
          <Plus size={15} /> {adding ? 'Adding…' : 'Add coupon'}
        </button>
      </form>
      {addMsg && (
        <p className={`mt-2 px-1 text-sm ${addMsg.tone === 'ok' ? 'text-teal-deep' : 'text-red-600'}`}>{addMsg.text}</p>
      )}

      <div role="tablist" className="mt-6 inline-flex rounded-full bg-card p-1 ring-1 ring-ink/10">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              tab === t.key ? 'bg-indigo text-parchment' : 'text-ink/55 hover:text-ink'
            }`}
          >
            {t.label}
            {coupons && <span className="ml-1.5 opacity-60">{counts[t.key]}</span>}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {error ? (
          <p className="rounded-2xl bg-card p-6 text-sm text-ink/60 ring-1 ring-ink/10">{error}</p>
        ) : !coupons ? (
          [0, 1].map((i) => <div key={i} className="h-32 animate-pulse rounded-3xl bg-ink/5" />)
        ) : visible.length === 0 ? (
          <AccountEmpty
            icon={Ticket}
            title={tab === 'available' ? 'No coupons right now' : tab === 'used' ? 'You haven’t used a coupon yet' : 'No expired coupons'}
            body={tab === 'available' ? 'Invite a friend to get one, or watch WhatsApp for our next offer.' : undefined}
            action={
              tab === 'available' ? (
                <Link href="/account/referrals" className="text-sm font-semibold text-teal-deep hover:underline">
                  Refer a friend
                </Link>
              ) : undefined
            }
          />
        ) : (
          visible.map((c) => <CouponTicket key={c.id} coupon={c} />)
        )}
      </div>
    </AccountPage>
  )
}

export default function CouponsPage() {
  return (
    <Suspense fallback={null}>
      <CouponsInner />
    </Suspense>
  )
}
