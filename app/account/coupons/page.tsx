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
import DealCoupon from '@/components/shared/DealCoupon-flex'
import { COUPON_BADGE, couponToDisplay, type CouponDesign } from '@/lib/coupons/design'

type CustomerCoupon = {
  id: string
  title: string
  discountType: 'percent' | 'fixed'
  discountValue: number
  maxDiscountLKR: number | null
  design: CouponDesign
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
  refund: 'Refund credit',
  campaign: 'For everyone',
  claimed: 'Added by you',
  admin: 'Just for you',
  migrated: 'Just for you',
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

function CouponCard({ coupon }: { coupon: CustomerCoupon }) {
  const [copied, setCopied] = useState(false)
  const usable = coupon.status === 'available'
  const ending = daysLeft(coupon.endsAt)
  const soon = usable && !!coupon.endsAt && new Date(coupon.endsAt).getTime() - Date.now() < 3 * 86_400_000
  const useHref = `/account/cart?coupon=${encodeURIComponent(coupon.token)}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(coupon.token)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard blocked */
    }
  }

  const badge = usable
    ? soon
      ? COUPON_BADGE.soon
      : COUPON_BADGE.available
    : coupon.status === 'used'
      ? COUPON_BADGE.used
      : coupon.status === 'expired'
        ? COUPON_BADGE.expired
        : COUPON_BADGE.unavailable

  const display = couponToDisplay(
    {
      id: coupon.id,
      title: coupon.title,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      maxDiscountLKR: coupon.maxDiscountLKR,
      minOrderLKR: coupon.minOrderLKR,
      stores: coupon.stores,
      design: coupon.design,
    },
    { href: usable ? useHref : '#', badge, dimmed: !usable },
  )

  return (
    <article className="flex flex-col gap-2.5">
      <DealCoupon coupon={{ ...display, actionLabel: usable ? 'Use now' : badge.label }} notchColor="#fbf6ec" />
      <div className="flex items-start justify-between gap-3 px-1">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{coupon.title}</p>
          <p className="text-xs text-ink/50">
            {VIA_LABEL[coupon.via] ?? 'Coupon'}
            {ending ? ` · ${ending}` : ''}
            {usable && coupon.usesLeft > 1 ? ` · ${coupon.usesLeft} uses left` : ''}
          </p>
        </div>
        {usable && (
          <div className="flex flex-none gap-1.5">
            <button
              type="button"
              onClick={copy}
              aria-label="Copy coupon code"
              className="inline-flex items-center gap-1 rounded-full border border-ink/15 px-2.5 py-1.5 text-[11px] font-semibold text-ink/65 hover:bg-ink/[0.04]"
            >
              {copied ? <Check size={12} className="text-teal-deep" /> : <Copy size={12} />}
              {copied ? 'Copied' : 'Code'}
            </button>
            <Link
              href={useHref}
              className="inline-flex items-center rounded-full bg-teal-deep px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-indigo"
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

      <div className="mt-5 grid gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
        {error ? (
          <p className="col-span-full rounded-2xl bg-card p-6 text-sm text-ink/60 ring-1 ring-ink/10">{error}</p>
        ) : !coupons ? (
          [0, 1, 2].map((i) => <div key={i} className="aspect-[7/4] animate-pulse rounded-2xl bg-ink/5" />)
        ) : visible.length === 0 ? (
          <div className="col-span-full">
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
          </div>
        ) : (
          visible.map((c) => <CouponCard key={c.id} coupon={c} />)
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
