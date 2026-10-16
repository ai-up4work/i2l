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
    else setData(body.payment ?? null)
  }, [orderId])

  useEffect(() => {
    void load()
  }, [load])

  const act = async (payload: Record<string, unknown>) => {
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
    return true
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
  if (!data) {
    return shell(
      <p className="mt-2 text-sm text-ink/50">
        {error ?? 'This order wasn’t placed through checkout (e.g. a chat or request order), so payment is handled in chat.'}
      </p>,
    )
  }

  const paid = data.paymentStatus === 'paid'
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
        {paid ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-teal/10 px-2.5 py-1 text-xs font-bold text-teal-deep">
            <CheckCircle2 size={13} /> Paid
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/15 px-2.5 py-1 text-xs font-bold text-gold-deep">
            <Clock size={13} /> Awaiting payment
          </span>
        )}
        {!paid && <span className="text-xs text-ink/45">placed {waitingFor(data.createdAt)}</span>}
        {live.length > 1 && <span className="text-xs text-ink/45">· covers {ids}</span>}
      </div>
      {!paid && (
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
          <dt>{paid ? 'Paid' : 'To pay'}</dt>
          <dd className="tabular-nums">{lkr(paid && data.payment ? data.payment.amountLKR : data.totalLKR)}</dd>
        </div>
      </dl>

      {paid && data.payment && (
        <p className="mt-3 rounded-xl bg-parchment px-3 py-2 text-xs text-ink/60">
          {data.payment.method ? METHOD_LABEL[data.payment.method] ?? data.payment.method : 'Payment'} · ref{' '}
          <span className="font-mono">{data.payment.reference}</span> ·{' '}
          {new Date(data.paidAt ?? data.payment.at).toLocaleString('en-LK', { dateStyle: 'medium', timeStyle: 'short' })}
        </p>
      )}

      {error && <p className="mt-3 text-xs font-semibold text-rose-700">{error}</p>}

      {!paid && (
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

      {paid && role !== 'sales' && (
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
