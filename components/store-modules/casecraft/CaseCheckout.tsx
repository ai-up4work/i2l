// components/store-modules/casecraft/CaseCheckout.tsx
//
// Delivery details, payment and the order total for one Case Craft item.
// The parent does the actual ordering (onPlace) — uploads for a custom
// print, then POST /api/casecraft/orders.
'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { CheckCircle2, Loader2, LogIn } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import {
  formatRs,
  isDeliveryComplete,
  PAYMENT_LABELS,
  SRI_LANKA_DISTRICTS,
  type DeliveryDetails,
  type PaymentMethod,
  type StorefrontData,
} from '@/lib/store-modules/casecraft/settings'
import { btnPrimary, QuantityStepper } from './parts'

export type PlacedOrder = { ref: string; total: number; payment: PaymentMethod; bankDetails: string | null }

const EMPTY: DeliveryDetails = { name: '', phone: '', address: '', city: '', district: '', postalCode: '', notes: '' }
const DRAFT_KEY = 'casecraft:delivery:v1'

function readDraft(): DeliveryDetails | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY)
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<DeliveryDetails>), notes: '' } : null
  } catch {
    return null
  }
}

function writeDraft(d: DeliveryDetails) {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, notes: '' }))
  } catch {
    /* private mode — fine */
  }
}

const input =
  'w-full rounded-xl border border-ink/12 bg-card px-3 py-2.5 font-body text-sm text-ink outline-none transition-colors placeholder:text-ink/35 focus:border-teal'

export default function CaseCheckout({
  data,
  item,
  quantity,
  onQuantity,
  onPlace,
  placeLabel = 'Place order',
  busyLabel,
}: {
  data: StorefrontData
  item: { title: string; detail: string; unitPrice: number; thumb?: ReactNode }
  quantity: number
  onQuantity: (n: number) => void
  onPlace: (delivery: DeliveryDetails, payment: PaymentMethod) => Promise<PlacedOrder>
  placeLabel?: string
  /** Shown on the button while placing (e.g. "Uploading your photo…"). */
  busyLabel?: string | null
}) {
  const { user, loading, login } = useAuth()
  const [d, setD] = useState<DeliveryDetails>(EMPTY)
  const [payment, setPayment] = useState<PaymentMethod>(data.payments[0] ?? 'cod')
  const [state, setState] = useState<'idle' | 'busy'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [placed, setPlaced] = useState<PlacedOrder | null>(null)

  useEffect(() => {
    const draft = readDraft()
    setD((cur) => ({ ...(draft ?? cur), name: draft?.name || cur.name || user?.name || '' }))
  }, [user?.name])

  const subtotal = item.unitPrice * quantity
  const delivery = data.freeDeliveryFromLKR > 0 && subtotal >= data.freeDeliveryFromLKR ? 0 : data.deliveryFeeLKR
  const total = subtotal + delivery
  const complete = isDeliveryComplete(d)

  function set<K extends keyof DeliveryDetails>(k: K, v: DeliveryDetails[K]) {
    setD((cur) => ({ ...cur, [k]: v }))
  }

  async function place() {
    if (!complete || state === 'busy') return
    setState('busy')
    setError(null)
    writeDraft(d)
    try {
      setPlaced(await onPlace(d, payment))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not place the order.')
    } finally {
      setState('idle')
    }
  }

  if (placed) {
    return (
      <div className="rounded-2xl bg-teal/8 p-5 ring-1 ring-teal/25">
        <p className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
          <CheckCircle2 size={22} className="text-teal-deep" aria-hidden /> Order placed
        </p>
        <p className="mt-1 font-body text-sm text-ink/70">
          Your order number is <span className="font-semibold text-ink">{placed.ref}</span>. We&rsquo;ll call you on {d.phone} to confirm.
        </p>
        <p className="mt-3 font-body text-sm text-ink/70">
          Total <span className="font-semibold text-ink">{formatRs(placed.total)}</span> · {PAYMENT_LABELS[placed.payment].label}
        </p>
        {placed.payment === 'bank' && (
          <div className="mt-3 rounded-xl bg-card p-3 ring-1 ring-ink/10">
            <p className="font-body text-xs font-semibold uppercase tracking-wider text-ink/50">Bank details</p>
            <p className="mt-1 whitespace-pre-line font-body text-sm text-ink">
              {placed.bankDetails?.trim() || 'We’ll send you the bank details when we call to confirm.'}
            </p>
            <p className="mt-2 font-body text-xs text-ink/55">Use {placed.ref} as the payment reference.</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Item */}
      <div className="flex items-center gap-3 rounded-2xl bg-parchment/70 p-3 ring-1 ring-ink/8">
        {item.thumb}
        <div className="min-w-0 flex-1">
          <p className="truncate font-body text-sm font-semibold text-ink">{item.title}</p>
          <p className="truncate font-body text-xs text-ink/55">{item.detail}</p>
          <p className="mt-0.5 font-body text-sm font-semibold text-ink">{formatRs(item.unitPrice)}</p>
        </div>
        <QuantityStepper value={quantity} max={data.maxQuantity} onChange={onQuantity} />
      </div>

      {!user && !loading ? (
        <div className="rounded-2xl border border-dashed border-ink/20 p-5 text-center">
          <p className="font-body text-sm text-ink/70">Sign in to your Wishdrop account to place the order.</p>
          <button type="button" onClick={login} className={`${btnPrimary} mt-3`}>
            <LogIn size={15} aria-hidden /> Sign in
          </button>
        </div>
      ) : (
        <>
          {/* Delivery */}
          <fieldset className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <legend className="mb-2 font-body text-sm font-semibold text-ink">Deliver to</legend>
            <input className={input} placeholder="Full name" autoComplete="name" value={d.name} onChange={(e) => set('name', e.target.value)} />
            <input className={input} placeholder="Phone (07X XXX XXXX)" inputMode="tel" autoComplete="tel" value={d.phone} onChange={(e) => set('phone', e.target.value)} />
            <input className={`${input} sm:col-span-2`} placeholder="Address" autoComplete="street-address" value={d.address} onChange={(e) => set('address', e.target.value)} />
            <input className={input} placeholder="City" autoComplete="address-level2" value={d.city} onChange={(e) => set('city', e.target.value)} />
            <select className={input} value={d.district} onChange={(e) => set('district', e.target.value)} aria-label="District">
              <option value="">District</option>
              {SRI_LANKA_DISTRICTS.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
            <input className={input} placeholder="Postal code (optional)" inputMode="numeric" autoComplete="postal-code" value={d.postalCode} onChange={(e) => set('postalCode', e.target.value)} />
            <input className={input} placeholder="Note for us (optional)" value={d.notes} onChange={(e) => set('notes', e.target.value)} />
          </fieldset>

          {/* Payment */}
          {data.payments.length > 0 && (
            <fieldset>
              <legend className="mb-2 font-body text-sm font-semibold text-ink">Payment</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {data.payments.map((p) => (
                  <label
                    key={p}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-colors ${
                      payment === p ? 'border-teal bg-teal/8 ring-1 ring-teal' : 'border-ink/12 hover:border-ink/25'
                    }`}
                  >
                    <input type="radio" name="casecraft-payment" className="mt-1 accent-[var(--color-teal)]" checked={payment === p} onChange={() => setPayment(p)} />
                    <span>
                      <span className="block font-body text-sm font-semibold text-ink">{PAYMENT_LABELS[p].label}</span>
                      <span className="block font-body text-xs text-ink/55">{PAYMENT_LABELS[p].hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {/* Total */}
          <dl className="rounded-2xl bg-parchment/70 p-4 font-body text-sm ring-1 ring-ink/8">
            <div className="flex justify-between text-ink/70">
              <dt>
                {quantity} × {formatRs(item.unitPrice)}
              </dt>
              <dd>{formatRs(subtotal)}</dd>
            </div>
            <div className="mt-1 flex justify-between text-ink/70">
              <dt>Delivery</dt>
              <dd>{delivery === 0 ? 'Free' : formatRs(delivery)}</dd>
            </div>
            <div className="mt-2 flex justify-between border-t border-ink/10 pt-2 text-base font-semibold text-ink">
              <dt>Total</dt>
              <dd>{formatRs(total)}</dd>
            </div>
            {data.leadTime && <p className="mt-2 text-xs text-ink/55">{data.leadTime}.</p>}
          </dl>

          {error && <p className="rounded-xl bg-red-50 px-4 py-2.5 font-body text-sm text-red-700">{error}</p>}

          <button type="button" onClick={place} disabled={!complete || state === 'busy' || !user} className={`${btnPrimary} w-full`}>
            {state === 'busy' ? (
              <>
                <Loader2 size={16} className="animate-spin" aria-hidden /> {busyLabel || 'Placing your order…'}
              </>
            ) : (
              `${placeLabel} · ${formatRs(total)}`
            )}
          </button>
          {!complete && <p className="-mt-3 text-center font-body text-xs text-ink/50">Fill in your name, phone, address, city and district.</p>}
          <p className="-mt-2 text-center font-body text-xs text-ink/45">
            By ordering you agree to our <Link href="/terms" className="underline">terms</Link>.
          </p>
        </>
      )}
    </div>
  )
}
