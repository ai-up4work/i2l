// app/account/pay/[checkoutId]/page.tsx
//
// Pay for a checkout. Shows the server's breakdown (GET
// /api/checkouts/[id]) and a card form posted to /api/payments/mock.
// The only provider today is a MOCK gateway (lib/payments/server.ts): no
// money is taken, and the page says so plainly. After paying, orders show
// as paid and referral rewards are released.
'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, CreditCard, Info, Lock, ShieldCheck } from 'lucide-react'
import { AccountPage, AccountPageHeader } from '@/components/account/AccountPageKit'

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
  payment: { reference: string; last4: string | null } | null
  orders: { id: string; displayId: string; totalLKR: number; cancelled: boolean }[]
  mode: string
}

const lkr = (n: number) => `Rs. ${Math.round(n).toLocaleString('en-LK')}`

const inputClass =
  'w-full rounded-xl border border-ink/15 bg-white px-3.5 py-3 text-sm text-ink placeholder:text-ink/35 transition-colors focus:border-teal-deep focus:outline-none focus:ring-2 focus:ring-teal/20'

function formatCardNumber(v: string) {
  return v
    .replace(/\D/g, '')
    .slice(0, 19)
    .replace(/(\d{4})(?=\d)/g, '$1 ')
}

function formatExpiry(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 4)
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d
}

function Row({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`flex items-center justify-between text-sm ${accent ? 'text-teal-deep' : 'text-ink/55'}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

export default function PayPage({ params }: { params: Promise<{ checkoutId: string }> }) {
  const { checkoutId } = use(params)
  const [checkout, setCheckout] = useState<Checkout | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [number, setNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvc, setCvc] = useState('')
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)

  const load = async () => {
    const res = await fetch(`/api/checkouts/${checkoutId}`)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) setLoadError(body.error ?? 'Couldn’t load this order.')
    else setCheckout(body.checkout)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutId])

  const pay = async (e: React.FormEvent) => {
    e.preventDefault()
    if (paying) return
    setPaying(true)
    setPayError(null)
    const [mm, yy] = expiry.split('/')
    const res = await fetch('/api/payments/mock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        checkoutId,
        card: { number, expMonth: Number(mm), expYear: Number(yy), cvc, name },
      }),
    })
    const body = await res.json().catch(() => ({}))
    setPaying(false)
    if (!res.ok) {
      setPayError(body.error ?? 'Payment didn’t go through. Please try again.')
      return
    }
    load()
  }

  if (loadError) {
    return (
      <AccountPage>
        <AccountPageHeader title="Payment" />
        <p className="mt-6 rounded-2xl bg-card p-6 text-sm text-ink/60 ring-1 ring-ink/10">{loadError}</p>
        <Link href="/account/orders" className="mt-4 inline-block text-sm font-semibold text-teal-deep hover:underline">
          Go to my orders
        </Link>
      </AccountPage>
    )
  }

  if (!checkout) {
    return (
      <AccountPage>
        <div className="h-10 w-56 animate-pulse rounded-xl bg-ink/5" />
        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="h-80 animate-pulse rounded-3xl bg-ink/5" />
          <div className="h-80 animate-pulse rounded-3xl bg-ink/5" />
        </div>
      </AccountPage>
    )
  }

  const paid = checkout.paymentStatus === 'paid'
  const cancelled = checkout.orders.length > 0 && checkout.orders.every((o) => o.cancelled)
  const orderList = checkout.orders.map((o) => o.displayId).join(', ')

  return (
    <AccountPage>
      <AccountPageHeader
        eyebrow={paid ? 'Paid' : 'Order placed'}
        title={paid ? 'Thank you — you’re all set' : 'Pay for your order'}
        subtitle={
          paid
            ? `We’ve started on order ${orderList}. You’ll get updates on WhatsApp and in My orders.`
            : `Order ${orderList} is placed. Pay now so we can buy your items, or pay later from My orders.`
        }
      />

      {checkout.mode === 'mock' && !paid && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-ink">
          <Info size={17} className="mt-0.5 flex-none text-gold-deep" />
          <p>
            <span className="font-semibold">Test payments.</span> No money is taken and no card is charged. Use card{' '}
            <span className="font-mono">4242 4242 4242 4242</span>, any future expiry and any 3-digit code.
          </p>
        </div>
      )}

      {checkout.needsPriceReview && !cancelled && (
        <div className="mt-3 flex items-start gap-3 rounded-2xl bg-teal/[0.06] px-4 py-3 text-sm text-ink/75 ring-1 ring-teal/15">
          <ShieldCheck size={17} className="mt-0.5 flex-none text-teal-deep" />
          <p>
            We couldn&apos;t confirm the live price of one item automatically. Our team will check it before buying and
            message you on WhatsApp if anything changes.
          </p>
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
        {/* Summary */}
        <section className="rounded-3xl bg-card p-6 ring-1 ring-ink/10">
          <h2 className="font-display text-lg text-ink">Order summary</h2>
          <ul className="mt-4 space-y-2">
            {checkout.orders.map((o) => (
              <li key={o.id} className="flex items-center justify-between rounded-2xl bg-parchment/70 px-4 py-3 ring-1 ring-ink/5">
                <span className="font-mono text-sm font-semibold text-ink">{o.displayId}</span>
                <span className="text-sm tabular-nums text-ink/60">{o.cancelled ? 'Cancelled' : lkr(o.totalLKR)}</span>
              </li>
            ))}
          </ul>

          <div className="mt-5 space-y-2 border-t border-ink/10 pt-4">
            <Row label={`Price (${checkout.itemCount} ${checkout.itemCount === 1 ? 'unit' : 'units'})`} value={lkr(checkout.priceSubtotalLKR)} />
            <Row label="Service charge" value={lkr(checkout.serviceLKR)} />
            <Row label="Delivery" value={lkr(checkout.deliveryLKR)} />
            {checkout.discountLKR > 0 && (
              <Row label={checkout.couponTitle ? `Coupon · ${checkout.couponTitle}` : 'Coupon'} value={`-${lkr(checkout.discountLKR)}`} accent />
            )}
            <div className="flex items-center justify-between border-t border-ink/10 pt-3">
              <span className="font-semibold text-ink">{paid ? 'Paid' : 'To pay'}</span>
              <span className="font-display text-2xl text-ink">{lkr(checkout.totalLKR)}</span>
            </div>
          </div>
        </section>

        {/* Payment */}
        <section className="rounded-3xl bg-card p-6 ring-1 ring-ink/10">
          {paid ? (
            <div className="flex flex-col items-start">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-teal/10 text-teal-deep">
                <CheckCircle2 size={24} />
              </span>
              <p className="mt-4 font-display text-xl text-ink">Payment received</p>
              <p className="mt-1 text-sm text-ink/55">
                {checkout.payment?.last4 ? `Card ending ${checkout.payment.last4}. ` : ''}
                Reference <span className="font-mono">{checkout.payment?.reference ?? '—'}</span>
              </p>
              <Link
                href="/account/orders"
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-teal-deep px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo"
              >
                Track my order <ArrowRight size={16} />
              </Link>
            </div>
          ) : cancelled ? (
            <p className="text-sm text-ink/60">This order was cancelled, so there&apos;s nothing to pay.</p>
          ) : (
            <form onSubmit={pay} className="space-y-4">
              <div className="flex items-center gap-2">
                <CreditCard size={18} className="text-ink/45" />
                <h2 className="font-display text-lg text-ink">Card details</h2>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-ink/55">Name on card</span>
                <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="cc-name" className={inputClass} placeholder="As printed on the card" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-ink/55">Card number</span>
                <input
                  value={number}
                  onChange={(e) => setNumber(formatCardNumber(e.target.value))}
                  inputMode="numeric"
                  autoComplete="cc-number"
                  className={`${inputClass} font-mono tracking-wider`}
                  placeholder="1234 5678 9012 3456"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-ink/55">Expiry</span>
                  <input
                    value={expiry}
                    onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                    inputMode="numeric"
                    autoComplete="cc-exp"
                    className={`${inputClass} font-mono`}
                    placeholder="MM/YY"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-ink/55">Security code</span>
                  <input
                    value={cvc}
                    onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    inputMode="numeric"
                    autoComplete="cc-csc"
                    className={`${inputClass} font-mono`}
                    placeholder="123"
                  />
                </label>
              </div>

              {payError && <p className="text-sm font-semibold text-red-600">{payError}</p>}

              <button
                type="submit"
                disabled={paying || !name.trim() || number.replace(/\D/g, '').length < 13 || expiry.length < 5 || cvc.length < 3}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-teal-deep px-6 py-3.5 text-sm font-semibold text-white transition-all hover:bg-indigo active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Lock size={15} /> {paying ? 'Processing…' : `Pay ${lkr(checkout.totalLKR)}`}
              </button>
              <p className="text-center text-xs text-ink/45">
                Not ready? <Link href="/account/orders" className="font-semibold text-teal-deep hover:underline">Pay later from My orders</Link>
              </p>
            </form>
          )}
        </section>
      </div>
    </AccountPage>
  )
}
