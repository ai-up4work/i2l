// components/admin/orders/OrderPaymentCard.tsx
//
// Admin order page, right column: the money side of an order.
//   - What the customer owes: items, service, delivery, coupon (linked to
//     its coupon page) and the total for the whole checkout (one customer
//     "Confirm order" can be split into an India and a Sri Lanka order).
//   - "Send payment request" opens WhatsApp to the customer with the
//     order numbers, total and your payment details (saved on this device).
//   - "Mark as paid" records how they paid + the slip / reference.
//   - Managers can undo a payment recorded by mistake.
// Data: /api/admin/orders/[orderId]/payment (lib/payments/server.ts).
'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Clock, Loader2, MessageCircle, Ticket, Undo2, Wallet, XCircle } from 'lucide-react'

type Payment = {
  id: string
  createdAt: string
  itemCount: number
  priceSubtotalLKR: number
  serviceLKR: number
  deliveryLKR: number
  discountLKR: number
  totalLKR: number
  refundedLKR: number
  couponId: string | null
  couponTitle: string | null
  needsPriceReview: boolean
  paymentStatus: 'unpaid' | 'paid' | 'failed' | 'refunded'
  paidAt: string | null
  payment: { method: string | null; reference: string; amountLKR: number; at: string } | null
  orders: { id: string; displayId: string; totalLKR: number; cancelled: boolean }[]
  customer: { name: string; phone: string | null }
  history: { id: string; method: string | null; provider: string; reference: string; amountLKR: number; status: string; note: string | null; at: string }[]
}

const METHODS = [
  { key: 'bank_transfer', label: 'Bank transfer' },
  { key: 'online_transfer', label: 'Online / app transfer' },
  { key: 'cash', label: 'Cash' },
  { key: 'card_machine', label: 'Card machine' },
  { key: 'other', label: 'Other' },
] as const
const METHOD_LABEL: Record<string, string> = Object.fromEntries(METHODS.map((m) => [m.key, m.label]))

/** "3 days ago" — how long an unpaid order has been waiting. */
function waitingFor(iso: string): string {
  const h = (Date.now() - new Date(iso).getTime()) / 3_600_000
  if (h < 1) return 'just now'
  if (h < 24) return `${Math.floor(h)}h ago`
  const d = Math.floor(h / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
}

const lkr = (v: number) => `Rs. ${Math.round(v).toLocaleString('en-LK')}`
const DETAILS_KEY = 'wishdrop:admin:payment-details'
export const REFUND_NOTICE_KEY = 'wishdrop:admin:last-refund'
const FIELD =
  'w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/35 focus:border-teal-deep focus:outline-none focus:ring-2 focus:ring-teal/20'

function waNumber(phone: string | null): string | null {
  if (!phone) return null
  let d = phone.replace(/\D/g, '')
  if (d.startsWith('0')) d = `94${d.slice(1)}`
  return d.length >= 9 ? d : null
}

export default function OrderPaymentCard({
  orderId,
  role,
  onCancelled,
}: {
  orderId: string
  role?: string | null
  /** After cancelling an unpaid order (it leaves the admin lists). */
  onCancelled?: () => void
}) {
  const [data, setData] = useState<Payment | null | undefined>(undefined)
  const [requestPayment, setRequestPayment] = useState<{
    requestDisplayId: string | null
    requestId: string
    amountLKR: number
    method: string | null
    reference: string | null
    paidAt: string | null
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [marking, setMarking] = useState(false)
  const [method, setMethod] = useState<string>('bank_transfer')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [details, setDetails] = useState('')
  const [editingDetails, setEditingDetails] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelReason, setCancelReason] = useState('No reply after payment request')
  const [refunds, setRefunds] = useState<RefundRow[]>([])
  const [canRefund, setCanRefund] = useState(false)

  useEffect(() => {
    try {
      setDetails(localStorage.getItem(DETAILS_KEY) ?? '')
    } catch {
      /* storage blocked */
    }
  }, [])

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/payment`)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) setError(body.error ?? 'Couldn’t load payment.')
    else {
      setData(body.payment ?? null)
      setRequestPayment(body.requestPayment ?? null)
      setRefunds(body.refunds ?? [])
      setCanRefund(Boolean(body.canRefund))
    }
  }, [orderId])

  useEffect(() => {
    void load()
  }, [load])

  const act = async (payload: Record<string, unknown>): Promise<false | Record<string, any>> => {
    setBusy(true)
    setError(null)
    const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) {
      setError(body.error ?? 'That didn’t work.')
      return false
    }
    setData(body.payment ?? null)
    if ('requestPayment' in body) setRequestPayment(body.requestPayment ?? null)
    if (body.refunds) setRefunds(body.refunds)
    return body
  }

  // After "Cancel & refund" the order leaves the admin lists: hand the
  // WhatsApp follow-up to the Orders list, then go there.
  const handleCancelledOrder = (whatsappUrl: string, title: string) => {
    try {
      sessionStorage.setItem(REFUND_NOTICE_KEY, JSON.stringify({ whatsappUrl, title, at: Date.now() }))
    } catch {
      /* storage blocked — the bell notification still reached the customer */
    }
    onCancelled?.()
  }

  const saveDetails = (v: string) => {
    setDetails(v)
    try {
      localStorage.setItem(DETAILS_KEY, v)
    } catch {
      /* storage blocked */
    }
  }

  const shell = (children: React.ReactNode) => (
    <section className="mb-4 rounded-2xl border border-ink/10 bg-card p-5">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
        <Wallet size={16} className="text-teal-deep" /> Payment
      </h2>
      {children}
    </section>
  )

  if (data === undefined && !error) {
    return shell(
      <div className="flex justify-center py-6 text-ink/35">
        <Loader2 size={18} className="animate-spin" />
      </div>,
    )
  }
  if (!data && requestPayment) {
    // Made from a request: paid first, then turned into this order.
    return shell(
      <>
        <div className="mt-3 flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
              requestPayment.paidAt ? 'bg-teal/10 text-teal-deep' : 'bg-gold/15 text-gold-deep'
            }`}
          >
            {requestPayment.paidAt ? <CheckCircle2 size={13} /> : <Clock size={13} />}
            {requestPayment.paidAt ? 'Paid' : 'No payment on record'}
          </span>
          <span className="text-xs text-ink/45">via request</span>
        </div>
        <dl className="mt-4 space-y-1.5 text-sm">
          <div className="flex justify-between font-semibold text-ink">
            <dt>Paid</dt>
            <dd className="tabular-nums">{lkr(requestPayment.amountLKR)}</dd>
          </div>
        </dl>
        {requestPayment.paidAt && (
          <p className="mt-3 rounded-xl bg-parchment px-3 py-2 text-xs text-ink/60">
            {requestPayment.method ? METHOD_LABEL[requestPayment.method] ?? requestPayment.method.replace('_', ' ') : 'Payment'}
            {requestPayment.reference ? (
              <>
                {' '}
                · ref <span className="font-mono">{requestPayment.reference}</span>
              </>
            ) : null}{' '}
            · {new Date(requestPayment.paidAt).toLocaleString('en-LK', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        )}
        <Link
          href={`/admin/requests/${requestPayment.requestId}`}
          className="mt-3 inline-block text-xs font-semibold text-teal-deep hover:underline"
        >
          Open request {requestPayment.requestDisplayId ?? ''} →
        </Link>
        {requestPayment.paidAt && (
          <RefundPanel
            paidLKR={requestPayment.amountLKR}
            refunds={refunds}
            canRefund={canRefund}
            busy={busy}
            error={error}
            phone={null}
            onRefund={(payload) => act({ action: 'refund', ...payload })}
            onCancelledOrder={handleCancelledOrder}
          />
        )}
      </>,
    )
  }

  if (!data) {
    return shell(
      <p className="mt-2 text-sm text-ink/50">
        {error ?? 'This is an older order with no payment record here — its payment was handled in chat.'}
      </p>,
    )
  }

  const paid = data.paymentStatus === 'paid'
  const refunded = data.paymentStatus === 'refunded'
  const live = data.orders.filter((o) => !o.cancelled)
  const ids = live.map((o) => o.displayId).join(', ')
  const wa = waNumber(data.customer.phone)
  const message = [
    `Hi ${data.customer.name.split(' ')[0]}, thank you for your Wishdrop order${live.length > 1 ? 's' : ''} ${ids}.`,
    `Total to pay: ${lkr(data.totalLKR)}${data.discountLKR > 0 ? ` (after ${lkr(data.discountLKR)} coupon discount)` : ''}.`,
    details.trim() ? `\nPlease pay to:\n${details.trim()}` : '',
    `\nOnce paid, please send the payment slip here and we’ll start buying your items.`,
  ]
    .filter(Boolean)
    .join('\n')

  return shell(
    <>
      <div className="mt-3 flex items-center gap-2">
        {refunded ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ink/[0.06] px-2.5 py-1 text-xs font-bold text-ink/70">
            <Undo2 size={13} /> Refunded
          </span>
        ) : paid ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-teal/10 px-2.5 py-1 text-xs font-bold text-teal-deep">
            <CheckCircle2 size={13} />
            {data.refundedLKR > 0 ? `Paid · ${lkr(data.refundedLKR)} refunded` : 'Paid'}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/15 px-2.5 py-1 text-xs font-bold text-gold-deep">
            <Clock size={13} /> Awaiting payment
          </span>
        )}
        {!paid && !refunded && <span className="text-xs text-ink/45">placed {waitingFor(data.createdAt)}</span>}
        {live.length > 1 && <span className="text-xs text-ink/45">· covers {ids}</span>}
      </div>
      {!paid && !refunded && (
        <p className="mt-2 text-xs text-ink/50">
          Not in Purchases yet — it moves there automatically once you mark it paid.
        </p>
      )}

      {data.needsPriceReview && (
        <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-gold/10 px-3 py-2 text-xs text-gold-deep ring-1 ring-gold/25">
          <AlertTriangle size={13} className="mt-0.5 flex-none" />
          Some prices couldn’t be confirmed from the store. Check them before asking for payment.
        </p>
      )}

      <dl className="mt-4 space-y-1.5 text-sm">
        {[
          ['Items', data.priceSubtotalLKR],
          ['Service', data.serviceLKR],
          ['Delivery', data.deliveryLKR],
        ].map(([label, v]) => (
          <div key={label as string} className="flex justify-between text-ink/60">
            <dt>{label}</dt>
            <dd className="tabular-nums">{lkr(v as number)}</dd>
          </div>
        ))}
        {data.discountLKR > 0 && (
          <div className="flex justify-between text-teal-deep">
            <dt className="flex min-w-0 items-center gap-1.5">
              <Ticket size={13} className="flex-none" />
              {data.couponId ? (
                <Link href={`/admin/coupons/${data.couponId}`} className="truncate hover:underline">
                  {data.couponTitle ?? 'Coupon'}
                </Link>
              ) : (
                <span className="truncate">{data.couponTitle ?? 'Coupon'}</span>
              )}
            </dt>
            <dd className="tabular-nums">−{lkr(data.discountLKR)}</dd>
          </div>
        )}
        <div className="flex justify-between border-t border-ink/10 pt-2 font-semibold text-ink">
          <dt>{paid || refunded ? 'Paid' : 'To pay'}</dt>
          <dd className="tabular-nums">{lkr((paid || refunded) && data.payment ? data.payment.amountLKR : data.totalLKR)}</dd>
        </div>
      </dl>

      {(paid || refunded) && data.payment && (
        <p className="mt-3 rounded-xl bg-parchment px-3 py-2 text-xs text-ink/60">
          {data.payment.method ? METHOD_LABEL[data.payment.method] ?? data.payment.method : 'Payment'} · ref{' '}
          <span className="font-mono">{data.payment.reference}</span> ·{' '}
          {new Date(data.paidAt ?? data.payment.at).toLocaleString('en-LK', { dateStyle: 'medium', timeStyle: 'short' })}
        </p>
      )}

      {error && <p className="mt-3 text-xs font-semibold text-rose-700">{error}</p>}

      {!paid && !refunded && (
        <div className="mt-4 space-y-3">
          {/* Payment request on WhatsApp */}
          <div className="rounded-xl bg-parchment/70 p-3 ring-1 ring-ink/[0.06]">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-ink/70">Your payment details</p>
              <button type="button" onClick={() => setEditingDetails((v) => !v)} className="text-xs font-semibold text-teal-deep hover:underline">
                {editingDetails ? 'Done' : details ? 'Edit' : 'Add'}
              </button>
            </div>
            {editingDetails ? (
              <textarea
                value={details}
                onChange={(e) => saveDetails(e.target.value)}
                rows={4}
                placeholder={'Bank: …\nAccount name: …\nAccount no: …\nBranch: …'}
                className={`${FIELD} mt-2 resize-none font-mono text-xs`}
              />
            ) : (
              <p className="mt-1 whitespace-pre-wrap text-xs text-ink/50">
                {details || 'Add your bank details once — they’re saved on this device and added to every payment request.'}
              </p>
            )}
            {wa ? (
              <a
                href={`https://wa.me/${wa}?text=${encodeURIComponent(message)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-3 py-2.5 text-sm font-semibold text-white hover:bg-[#1ebe5d]"
              >
                <MessageCircle size={15} /> Send payment request
              </a>
            ) : (
              <p className="mt-2 text-xs text-rose-700">No phone number on this order — use the order chat instead.</p>
            )}
          </div>

          {/* Record the payment */}
          {marking ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                if (await act({ action: 'mark-paid', method, reference, note })) {
                  setMarking(false)
                  setReference('')
                  setNote('')
                }
              }}
              className="space-y-2 rounded-xl p-3 ring-1 ring-teal/25"
            >
              <label className="block text-xs font-semibold text-ink/60">
                How did they pay?
                <select value={method} onChange={(e) => setMethod(e.target.value)} className={`${FIELD} mt-1`}>
                  {METHODS.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold text-ink/60">
                Slip / reference number
                <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. TXN 48201" className={`${FIELD} mt-1`} />
              </label>
              <label className="block text-xs font-semibold text-ink/60">
                Note (optional)
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Paid by her brother" className={`${FIELD} mt-1`} />
              </label>
              <p className="text-[11px] text-ink/45">Records {lkr(data.totalLKR)} as received for {ids}.</p>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setMarking(false)} className="flex-1 rounded-xl border border-ink/15 px-3 py-2 text-sm font-semibold text-ink/70 hover:bg-ink/[0.04]">
                  Cancel
                </button>
                <button type="submit" disabled={busy} className="flex-1 rounded-xl bg-teal-deep px-3 py-2 text-sm font-semibold text-white hover:bg-indigo disabled:opacity-50">
                  {busy ? 'Saving…' : 'Confirm paid'}
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setMarking(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-deep px-3 py-2.5 text-sm font-semibold text-white hover:bg-indigo"
            >
              <CheckCircle2 size={15} /> Mark as paid
            </button>
          )}

          {/* Customer never paid / stopped replying */}
          {cancelling ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                if (await act({ action: 'cancel', reason: cancelReason })) {
                  setCancelling(false)
                  onCancelled?.()
                }
              }}
              className="space-y-2 rounded-xl bg-rose-50/60 p-3 ring-1 ring-rose-200"
            >
              <p className="text-xs font-semibold text-rose-800">Cancel {ids}?</p>
              <p className="text-[11px] leading-relaxed text-rose-900/70">
                The customer is told it was cancelled, any coupon goes back to their account and Wishdrop Mall stock is put back.
                Nothing was bought, so there’s nothing to refund.
              </p>
              <select value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className={FIELD}>
                <option>No reply after payment request</option>
                <option>Customer asked to cancel</option>
                <option>Item no longer available</option>
                <option>Price changed, customer declined</option>
                <option>Duplicate order</option>
                <option>Other</option>
              </select>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setCancelling(false)} className="flex-1 rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm font-semibold text-ink/70">
                  Keep order
                </button>
                <button type="submit" disabled={busy} className="flex-1 rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50">
                  {busy ? 'Cancelling…' : 'Cancel order'}
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setCancelling(true)}
              className="flex w-full items-center justify-center gap-1.5 text-xs font-semibold text-ink/45 hover:text-rose-700"
            >
              <XCircle size={13} /> Customer didn’t pay? Cancel order
            </button>
          )}
        </div>
      )}

      {(paid || data.paymentStatus === 'refunded') && (
        <RefundPanel
          paidLKR={data.payment?.amountLKR ?? data.totalLKR}
          refunds={refunds}
          canRefund={canRefund}
          busy={busy}
          error={error}
          phone={data.customer.phone}
          onRefund={(payload) => act({ action: 'refund', ...payload })}
          onCancelledOrder={handleCancelledOrder}
        />
      )}

      {paid && role !== 'sales' && refunds.length === 0 && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            const reason = window.prompt('Why are you undoing this payment?')
            if (reason != null) await act({ action: 'mark-unpaid', reason })
          }}
          className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-ink/45 hover:text-rose-700"
        >
          <Undo2 size={12} /> Undo payment
        </button>
      )}

      {data.history.length > 1 && (
        <details className="mt-3 text-xs text-ink/50">
          <summary className="cursor-pointer font-semibold">Payment history ({data.history.length})</summary>
          <ul className="mt-2 space-y-1.5">
            {data.history.map((h) => (
              <li key={h.id} className={h.status === 'succeeded' ? '' : 'line-through opacity-60'}>
                {new Date(h.at).toLocaleDateString('en-LK')} · {h.method ? METHOD_LABEL[h.method] ?? h.method : h.provider} · {lkr(h.amountLKR)} ·{' '}
                <span className="font-mono">{h.reference}</span>
                {h.note ? ` — ${h.note}` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>,
  )
}

type RefundRow = {
  id: string
  amountLKR: number
  method: 'wishdrop_credit' | 'bank_transfer' | 'cash' | 'other'
  reference: string | null
  reason: string
  cancelledOrder: boolean
  at: string
}

const REFUND_METHODS = [
  { key: 'wishdrop_credit', label: 'Wishdrop credit', hint: 'A one-use coupon for the amount, added to their account (valid 1 year). It covers item prices on their next order.' },
  { key: 'bank_transfer', label: 'Bank transfer', hint: 'You send the money back, then type the transfer reference.' },
  { key: 'cash', label: 'Cash', hint: 'Handed back in person.' },
  { key: 'other', label: 'Other', hint: 'Anything else — add a reference.' },
] as const
const REFUND_LABEL: Record<string, string> = Object.fromEntries(REFUND_METHODS.map((m) => [m.key, m.label]))

const REFUND_REASONS = [
  'Customer asked to cancel',
  'Item out of stock at the seller',
  'Seller cancelled the order',
  'Price went up, customer declined',
  'Item failed quality check',
  'Duplicate payment',
  'Other',
]

/**
 * Paid orders: refund instead of delete (Manager / Super Admin).
 *   - "Cancel & refund": cancels the order(s), refunds up to everything
 *     still refundable, gives back the coupon use and Mall stock.
 *   - "Partial refund": money back for part of it; the order carries on.
 * The customer gets a bell notification automatically; afterwards this
 * offers a pre-written WhatsApp message to send too.
 */
function RefundPanel({
  paidLKR,
  refunds,
  canRefund,
  busy,
  error,
  phone,
  onRefund,
  onCancelledOrder,
}: {
  paidLKR: number
  refunds: RefundRow[]
  canRefund: boolean
  busy: boolean
  error: string | null
  phone: string | null
  onRefund: (payload: Record<string, unknown>) => Promise<false | Record<string, any>>
  /** Cancelled orders leave the admin lists, so the page moves on; the
   *  WhatsApp follow-up is carried to the Orders list (RefundNotice). */
  onCancelledOrder?: (whatsappUrl: string, title: string) => void
}) {
  const refunded = refunds.reduce((t, r) => t + r.amountLKR, 0)
  const remaining = Math.max(0, Math.round(paidLKR - refunded))
  const orderCancelled = refunds.some((r) => r.cancelledOrder)
  const [open, setOpen] = useState<null | 'cancel' | 'partial'>(null)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<string>('wishdrop_credit')
  const [reference, setReference] = useState('')
  const [reason, setReason] = useState(REFUND_REASONS[0])
  const [otherReason, setOtherReason] = useState('')
  const [done, setDone] = useState<{ whatsappText: string } | null>(null)

  const start = (mode: 'cancel' | 'partial') => {
    setOpen(mode)
    setDone(null)
    setAmount(mode === 'cancel' ? String(remaining) : '')
  }
  const wa = waNumber(phone)

  return (
    <div className="mt-4 border-t border-ink/10 pt-4">
      {refunds.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-ink/60">Refunds</p>
          <ul className="mt-1.5 space-y-1.5">
            {refunds.map((r) => (
              <li key={r.id} className="rounded-xl bg-parchment px-3 py-2 text-xs text-ink/65">
                <span className="font-semibold text-ink">{lkr(r.amountLKR)}</span> · {REFUND_LABEL[r.method] ?? r.method}
                {r.reference ? (
                  <>
                    {' '}
                    · ref <span className="font-mono">{r.reference}</span>
                  </>
                ) : null}
                {r.cancelledOrder ? ' · order cancelled' : ''}
                <span className="block text-ink/45">
                  {r.reason} · {new Date(r.at).toLocaleString('en-LK', { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
              </li>
            ))}
          </ul>
          {remaining > 0 && <p className="mt-1.5 text-[11px] text-ink/45">Still refundable: {lkr(remaining)}</p>}
        </div>
      )}

      {done && (
        <div className="mb-3 rounded-xl bg-teal/[0.07] p-3 ring-1 ring-teal/20">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-teal-deep">
            <CheckCircle2 size={13} /> Refund saved — the customer has been notified in their account.
          </p>
          <a
            href={wa ? `https://wa.me/${wa}?text=${encodeURIComponent(done.whatsappText)}` : `https://wa.me/?text=${encodeURIComponent(done.whatsappText)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-3 py-2 text-sm font-semibold text-white hover:bg-[#1ebe5d]"
          >
            <MessageCircle size={15} /> Tell them on WhatsApp too
          </a>
        </div>
      )}

      {!canRefund ? (
        remaining > 0 && <p className="text-xs text-ink/45">Need to refund this order? Ask a manager — paid orders can’t be deleted.</p>
      ) : remaining <= 0 ? (
        <p className="text-xs text-ink/45">Fully refunded.</p>
      ) : open ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            const finalReason = reason === 'Other' ? otherReason.trim() || 'Other' : reason
            const res = await onRefund({ mode: open, amountLKR: Number(amount), method, reference, reason: finalReason })
            if (res) {
              const text = res.refund?.whatsappText ?? ''
              setOpen(null)
              setReference('')
              setDone({ whatsappText: text })
              if (open === 'cancel' && onCancelledOrder) {
                const url = wa ? `https://wa.me/${wa}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`
                onCancelledOrder(url, `Cancelled and refunded ${lkr(Number(amount))}. The customer has been notified in their account.`)
              }
            }
          }}
          className={`space-y-2 rounded-xl p-3 ring-1 ${open === 'cancel' ? 'bg-rose-50/60 ring-rose-200' : 'bg-parchment/70 ring-ink/10'}`}
        >
          <p className={`text-xs font-semibold ${open === 'cancel' ? 'text-rose-800' : 'text-ink/75'}`}>
            {open === 'cancel' ? 'Cancel this order and refund' : 'Partial refund — the order carries on'}
          </p>
          {open === 'cancel' && (
            <p className="text-[11px] leading-relaxed text-rose-900/70">
              Cancels the order (all of its checkout), gives back any coupon use and puts Wishdrop Mall stock back. If it already
              earned someone a referral reward, that reward is withdrawn if unused.
            </p>
          )}
          <label className="block text-xs font-semibold text-ink/60">
            Amount (Rs.)
            <input
              type="number"
              inputMode="decimal"
              min={1}
              max={remaining}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={`${FIELD} mt-1`}
              required
            />
            <span className="mt-0.5 block font-normal text-ink/40">Up to {lkr(remaining)}</span>
          </label>
          <fieldset className="space-y-1.5">
            <legend className="text-xs font-semibold text-ink/60">Refund as</legend>
            {REFUND_METHODS.map((m) => (
              <label key={m.key} className={`flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 ${method === m.key ? 'bg-white ring-1 ring-teal/30' : ''}`}>
                <input type="radio" name="refund-method" value={m.key} checked={method === m.key} onChange={() => setMethod(m.key)} className="mt-0.5" />
                <span className="text-xs">
                  <span className="font-semibold text-ink">{m.label}</span>
                  <span className="block text-ink/45">{m.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {method !== 'wishdrop_credit' && (
            <label className="block text-xs font-semibold text-ink/60">
              Transfer / reference
              <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. TXN 58213" className={`${FIELD} mt-1`} />
            </label>
          )}
          <label className="block text-xs font-semibold text-ink/60">
            Reason (the customer sees this)
            <select value={reason} onChange={(e) => setReason(e.target.value)} className={`${FIELD} mt-1`}>
              {REFUND_REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          {reason === 'Other' && (
            <input value={otherReason} onChange={(e) => setOtherReason(e.target.value)} placeholder="Reason" className={FIELD} required />
          )}
          {error && <p className="text-xs font-semibold text-rose-700">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setOpen(null)} className="flex-1 rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm font-semibold text-ink/70">
              Back
            </button>
            <button
              type="submit"
              disabled={busy || !(Number(amount) > 0) || Number(amount) > remaining}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
                open === 'cancel' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-teal-deep hover:bg-indigo'
              }`}
            >
              {busy ? 'Saving…' : `Refund ${Number(amount) > 0 ? lkr(Number(amount)) : ''}`}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-2">
          {!orderCancelled && (
            <button
              type="button"
              onClick={() => start('cancel')}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50"
            >
              <XCircle size={14} /> Cancel & refund
            </button>
          )}
          <button
            type="button"
            onClick={() => start('partial')}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm font-semibold text-ink/70 hover:bg-ink/[0.04]"
          >
            <Undo2 size={14} /> {orderCancelled ? 'Refund more' : 'Partial refund (order carries on)'}
          </button>
          <p className="text-[11px] text-ink/40">Paid orders can’t be deleted — refund them here instead.</p>
        </div>
      )}
    </div>
  )
}

/**
 * Orders list banner shown right after "Cancel & refund" (the order itself
 * is no longer listed): confirms it and offers the WhatsApp follow-up.
 */
export function RefundNotice() {
  const [notice, setNotice] = useState<{ whatsappUrl: string; title: string; at: number } | null>(null)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(REFUND_NOTICE_KEY)
      if (!raw) return
      const v = JSON.parse(raw) as { whatsappUrl: string; title: string; at: number }
      if (Date.now() - v.at < 10 * 60_000) setNotice(v)
      else sessionStorage.removeItem(REFUND_NOTICE_KEY)
    } catch {
      /* ignore */
    }
  }, [])
  if (!notice) return null
  const dismiss = () => {
    setNotice(null)
    try {
      sessionStorage.removeItem(REFUND_NOTICE_KEY)
    } catch {
      /* ignore */
    }
  }
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-2xl bg-teal/[0.07] p-4 ring-1 ring-teal/20 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2 text-sm text-teal-deep">
        <CheckCircle2 size={16} className="mt-0.5 flex-none" /> {notice.title}
      </p>
      <div className="flex flex-none items-center gap-2">
        <a
          href={notice.whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={dismiss}
          className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[#1ebe5d]"
        >
          <MessageCircle size={15} /> Tell them on WhatsApp
        </a>
        <button type="button" onClick={dismiss} className="text-xs font-semibold text-ink/45 hover:text-ink">
          Dismiss
        </button>
      </div>
    </div>
  )
}
