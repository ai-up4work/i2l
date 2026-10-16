// app/account/pay/[checkoutId]/page.tsx
//
// "Order placed" — where the customer lands after Confirm order (and from
// "Pay" in My orders). There's no online payment yet: we send payment
// details on WhatsApp, the customer pays and sends the slip, and staff mark
// the order paid on the admin order page (lib/payments/server.ts). This
// page shows the totals, where things stand, and a one-tap WhatsApp
// message with the order numbers already filled in.
'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, CheckCircle2, Clock, MessageCircle, PackageCheck, ShieldCheck, Ticket, Wallet } from 'lucide-react'
import { AccountPage } from '@/components/account/AccountPageKit'
import { buildWhatsAppLink } from '@/lib/chat/waLink'

type Checkout = {
  id: string
  createdAt: string
  itemCount: number
  priceSubtotalLKR: number
  serviceLKR: number
  deliveryLKR: number
  discountLKR: number
  totalLKR: number
  couponTitle: string | null
  needsPriceReview: boolean
  paymentStatus: 'unpaid' | 'paid' | 'failed' | 'refunded'
  paidAt: string | null
  orders: { id: string; displayId: string; totalLKR: number; cancelled: boolean }[]
}

const lkr = (n: number) => `Rs. ${Math.round(n).toLocaleString('en-LK')}`

function Row({ label, value, tone }: { label: React.ReactNode; value: string; tone?: 'teal' }) {
  return (
    <div className={`flex items-center justify-between gap-3 text-sm ${tone === 'teal' ? 'text-teal-deep' : 'text-ink/60'}`}>
      <span className="min-w-0">{label}</span>
      <span className="flex-none tabular-nums">{value}</span>
    </div>
  )
}

export default function OrderPlacedPage({ params }: { params: Promise<{ checkoutId: string }> }) {
  const { checkoutId } = use(params)
  const [checkout, setCheckout] = useState<Checkout | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/checkouts/${checkoutId}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) setLoadError(body.error ?? 'Couldn’t load this order.')
        else setCheckout(body.checkout)
      })
      .catch(() => !cancelled && setLoadError('Couldn’t load this order. Check your connection and try again.'))
    return () => {
      cancelled = true
    }
  }, [checkoutId])

  if (loadError) {
    return (
      <AccountPage>
        <div className="mx-auto max-w-lg py-16 text-center">
          <p className="font-display text-2xl font-semibold text-indigo">We couldn’t find that order</p>
          <p className="mt-2 text-sm text-ink/55">{loadError}</p>
          <Link href="/account/orders" className="mt-6 inline-flex rounded-full bg-teal-deep px-6 py-3 text-sm font-semibold text-white hover:bg-indigo">
            Go to my orders
          </Link>
        </div>
      </AccountPage>
    )
  }

  if (!checkout) {
    return (
      <AccountPage>
        <div className="mx-auto max-w-3xl animate-pulse py-10">
          <div className="mx-auto h-16 w-16 rounded-full bg-ink/[0.06]" />
          <div className="mx-auto mt-5 h-8 w-64 rounded-lg bg-ink/[0.06]" />
          <div className="mt-10 grid gap-5 md:grid-cols-5">
            <div className="h-72 rounded-3xl bg-ink/[0.05] md:col-span-3" />
            <div className="h-72 rounded-3xl bg-ink/[0.05] md:col-span-2" />
          </div>
        </div>
      </AccountPage>
    )
  }

  const paid = checkout.paymentStatus === 'paid'
  const live = checkout.orders.filter((o) => !o.cancelled)
  const ids = live.map((o) => o.displayId).join(', ')
  const waText = paid
    ? `Hi Wishdrop, I have a question about my order ${ids}.`
    : `Hi Wishdrop, I just placed order ${ids} (${lkr(checkout.totalLKR)}). Please send me the payment details.`
  const wa = buildWhatsAppLink(null, waText)

  const steps = [
    { icon: Check, title: 'Order placed', text: 'We’ve got your order and your prices are locked in.', done: true },
    {
      icon: Wallet,
      title: paid ? 'Payment received' : 'Pay on WhatsApp',
      text: paid
        ? `Thank you — received ${checkout.paidAt ? new Date(checkout.paidAt).toLocaleDateString('en-LK', { day: 'numeric', month: 'short' }) : ''}.`
        : 'We’ll send payment details to your WhatsApp. Pay by bank transfer and send us the slip.',
      done: paid,
    },
    { icon: PackageCheck, title: 'We buy, check & ship', text: 'We buy your items, quality-check them and send them to your door.', done: false },
  ]

  return (
    <AccountPage>
      <div className="mx-auto max-w-4xl pb-16">
        {/* Hero */}
        <div className="relative isolate overflow-hidden rounded-[28px] bg-card px-6 py-10 text-center ring-1 ring-ink/[0.08] sm:px-10">
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-1.5"
            style={{ background: 'repeating-linear-gradient(45deg,#C1272D 0 10px,#FBF6EC 10px 20px,#1E3A5F 20px 30px,#FBF6EC 30px 40px)' }}
          />
          <div aria-hidden className="absolute -right-24 -top-24 -z-10 h-72 w-72 rounded-full bg-teal/10 blur-3xl" />
          <span className={`mx-auto grid h-16 w-16 place-items-center rounded-full ${paid ? 'bg-teal text-white' : 'bg-teal/10 text-teal-deep'}`}>
            <CheckCircle2 size={32} strokeWidth={1.8} />
          </span>
          <h1 className="mt-5 font-display text-3xl font-semibold tracking-[-0.01em] text-indigo sm:text-4xl">
            {paid ? 'Payment received' : 'Order placed!'}
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink/60 sm:text-[15px]">
            {paid
              ? 'We’re buying your items now. You’ll get updates in My orders and on WhatsApp.'
              : 'One last step: we’ll send payment details to your WhatsApp. Your order starts as soon as it’s paid.'}
          </p>
          <p className="mt-4 inline-flex flex-wrap items-center justify-center gap-1.5 text-xs text-ink/50">
            {live.map((o) => (
              <span key={o.id} className="rounded-full bg-parchment px-2.5 py-1 font-mono font-semibold text-ink/70 ring-1 ring-ink/[0.08]">
                {o.displayId}
              </span>
            ))}
          </p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#25D366] px-6 py-3.5 text-sm font-bold text-white shadow-[0_10px_24px_-12px_rgba(37,211,102,0.8)] transition-colors hover:bg-[#1ebe5d] sm:w-auto"
            >
              <MessageCircle size={17} />
              {paid ? 'Message us on WhatsApp' : 'Get payment details on WhatsApp'}
            </a>
            <Link
              href="/account/orders"
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-full px-6 py-3.5 text-sm font-semibold text-indigo ring-1 ring-indigo/20 transition-colors hover:bg-indigo/[0.04] sm:w-auto"
            >
              View my orders <ArrowRight size={15} />
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-5">
          {/* What happens next */}
          <section className="rounded-3xl bg-card p-6 ring-1 ring-ink/[0.08] md:col-span-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal-deep">What happens next</p>
            <ol className="mt-5 space-y-5">
              {steps.map((s, i) => (
                <li key={s.title} className="relative flex gap-4">
                  {i < steps.length - 1 && <span aria-hidden className="absolute left-[19px] top-11 h-[calc(100%-1.75rem)] w-px border-l-2 border-dashed border-ink/10" />}
                  <span
                    className={`grid h-10 w-10 flex-none place-items-center rounded-full ${
                      s.done ? 'bg-teal text-white' : i === steps.findIndex((x) => !x.done) ? 'bg-indigo text-gold' : 'bg-parchment text-ink/35 ring-1 ring-ink/10'
                    }`}
                  >
                    <s.icon size={17} />
                  </span>
                  <div className="pt-1.5">
                    <p className="text-sm font-semibold text-ink">{s.title}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-ink/55">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            {!paid && (
              <p className="mt-6 flex items-start gap-2 rounded-2xl bg-parchment px-4 py-3 text-xs leading-relaxed text-ink/55">
                <Clock size={14} className="mt-0.5 flex-none text-gold-deep" />
                We usually message within a few hours (9am–8pm). Prefer not to wait? Tap the WhatsApp button and we’ll reply there.
              </p>
            )}
          </section>

          {/* Summary */}
          <section className="rounded-3xl bg-card p-6 ring-1 ring-ink/[0.08] md:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal-deep">Summary</p>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                  paid ? 'bg-teal/10 text-teal-deep' : 'bg-gold/15 text-gold-deep'
                }`}
              >
                {paid ? <Check size={12} strokeWidth={3} /> : <Clock size={12} />}
                {paid ? 'Paid' : 'Awaiting payment'}
              </span>
            </div>
            <div className="mt-5 space-y-2">
              <Row label={`Items (${checkout.itemCount})`} value={lkr(checkout.priceSubtotalLKR)} />
              <Row label="Service charge" value={lkr(checkout.serviceLKR)} />
              <Row label="Delivery" value={lkr(checkout.deliveryLKR)} />
              {checkout.discountLKR > 0 && (
                <Row
                  tone="teal"
                  label={
                    <span className="inline-flex items-center gap-1.5">
                      <Ticket size={13} /> {checkout.couponTitle ?? 'Coupon'}
                    </span>
                  }
                  value={`−${lkr(checkout.discountLKR)}`}
                />
              )}
            </div>
            <div className="mt-4 flex items-baseline justify-between border-t border-dashed border-ink/15 pt-4">
              <span className="text-sm font-semibold text-ink">{paid ? 'Total paid' : 'Total to pay'}</span>
              <span className="font-display text-2xl font-semibold tabular-nums text-indigo">{lkr(checkout.totalLKR)}</span>
            </div>
            {checkout.needsPriceReview && !paid && (
              <p className="mt-4 text-xs leading-relaxed text-ink/50">
                We’ll double-check a price or two with the store before sending payment details — if anything changes,
                we’ll tell you first.
              </p>
            )}
            <p className="mt-5 flex items-start gap-2 text-xs text-ink/45">
              <ShieldCheck size={14} className="mt-0.5 flex-none text-teal-deep/70" />
              Only pay to the details we send from our official WhatsApp number.
            </p>
          </section>
        </div>
      </div>
    </AccountPage>
  )
}
