// lib/payments/server.ts
//
// SERVER-ONLY. Payment for a checkout.
//
// Only a MOCK provider exists for now: no money moves, and the payment
// page says so. It behaves like a real gateway from the app's point of
// view — it validates the card, can decline, writes a payments row, and on
// success marks the checkout and its orders paid and runs everything that
// should happen after payment (referral rewards). Plugging in a real
// gateway later means replacing chargeMock() with the gateway call (or its
// webhook) and keeping markCheckoutPaid() as-is.
//
// Test cards (mock only):
//   4242 4242 4242 4242   -> succeeds
//   4000 0000 0000 0002   -> declined
//   any other valid card  -> succeeds

import 'server-only'
import { randomBytes } from 'node:crypto'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { db } from '@/lib/coupons/server'
import { onCheckoutPaid } from '@/lib/referrals/server'

export const PAYMENT_PROVIDER = 'mock'

export type CardInput = { number: string; expMonth: number; expYear: number; cvc: string; name: string }

function luhn(digits: string): boolean {
  let sum = 0
  let double = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48
    if (double) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
    double = !double
  }
  return sum % 10 === 0
}

export function validateCard(card: Partial<CardInput>): { ok: true; card: CardInput } | { ok: false; error: string } {
  const number = String(card.number ?? '').replace(/\D/g, '')
  if (number.length < 13 || number.length > 19 || !luhn(number)) return { ok: false, error: 'That card number isn’t valid.' }
  const expMonth = Number(card.expMonth)
  let expYear = Number(card.expYear)
  if (expYear < 100) expYear += 2000
  if (!Number.isInteger(expMonth) || expMonth < 1 || expMonth > 12 || !Number.isInteger(expYear)) {
    return { ok: false, error: 'Enter the expiry date as MM/YY.' }
  }
  const now = new Date()
  if (expYear < now.getFullYear() || (expYear === now.getFullYear() && expMonth < now.getMonth() + 1)) {
    return { ok: false, error: 'This card has expired.' }
  }
  const cvc = String(card.cvc ?? '').replace(/\D/g, '')
  if (cvc.length < 3 || cvc.length > 4) return { ok: false, error: 'Enter the 3 or 4 digit security code.' }
  const name = String(card.name ?? '').trim()
  if (!name) return { ok: false, error: 'Enter the name on the card.' }
  return { ok: true, card: { number, expMonth, expYear, cvc, name } }
}

function chargeMock(card: CardInput): { ok: true; reference: string } | { ok: false; reason: string } {
  if (card.number === '4000000000000002') return { ok: false, reason: 'Your card was declined.' }
  return { ok: true, reference: `MOCK-${randomBytes(6).toString('hex').toUpperCase()}` }
}

async function markCheckoutPaid(checkoutId: string, userId: string): Promise<void> {
  const admin = createServiceRoleClient()
  const now = new Date().toISOString()
  await db(admin).from('checkouts').update({ payment_status: 'paid', paid_at: now }).eq('id', checkoutId)
  await db(admin).from('orders').update({ payment_status: 'paid' }).eq('checkout_id', checkoutId)
  try {
    await onCheckoutPaid(admin, checkoutId, userId)
  } catch (err) {
    // A referral problem must never undo a payment.
    console.error('[payments] post-payment referral step failed', err)
  }
}

export type PayResult = { ok: true; reference: string } | { ok: false; error: string; status?: number }

export async function payCheckout(userId: string, checkoutId: string, rawCard: Partial<CardInput>): Promise<PayResult> {
  const admin = createServiceRoleClient()
  const { data: checkout } = await db(admin)
    .from('checkouts')
    .select('id, user_id, total_lkr, payment_status')
    .eq('id', checkoutId)
    .maybeSingle()
  if (!checkout || checkout.user_id !== userId) return { ok: false, error: 'Order not found.', status: 404 }
  if (checkout.payment_status === 'paid') return { ok: false, error: 'This order is already paid.', status: 409 }

  const { count: cancelled } = await db(admin)
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('checkout_id', checkoutId)
    .eq('stage', 'cancelled')
  if ((cancelled ?? 0) > 0) return { ok: false, error: 'This order was cancelled, so it can’t be paid.', status: 409 }

  const valid = validateCard(rawCard)
  if (!valid.ok) return { ok: false, error: valid.error }

  const charge = chargeMock(valid.card)
  await db(admin).from('payments').insert({
    checkout_id: checkoutId,
    user_id: userId,
    provider: PAYMENT_PROVIDER,
    amount_lkr: checkout.total_lkr,
    status: charge.ok ? 'succeeded' : 'failed',
    reference: charge.ok ? charge.reference : `MOCK-FAILED-${Date.now()}`,
    card_last4: valid.card.number.slice(-4),
    failure_reason: charge.ok ? null : charge.reason,
  })
  if (!charge.ok) return { ok: false, error: charge.reason, status: 402 }

  await markCheckoutPaid(checkoutId, userId)
  return { ok: true, reference: charge.reference }
}

export async function checkoutForCustomer(userId: string, checkoutId: string) {
  const admin = createServiceRoleClient()
  const { data: checkout } = await db(admin).from('checkouts').select('*').eq('id', checkoutId).maybeSingle()
  if (!checkout || checkout.user_id !== userId) return null
  const [{ data: orders }, { data: coupon }, { data: payment }] = await Promise.all([
    db(admin)
      .from('orders')
      .select('id, display_id, total_value, stage, store_origin, payment_status')
      .eq('checkout_id', checkoutId)
      .order('created_at'),
    checkout.coupon_id
      ? db(admin).from('coupons').select('title').eq('id', checkout.coupon_id).maybeSingle()
      : Promise.resolve({ data: null }),
    db(admin)
      .from('payments')
      .select('reference, card_last4, created_at')
      .eq('checkout_id', checkoutId)
      .eq('status', 'succeeded')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  const n = (v: unknown) => Number(v) || 0
  return {
    id: checkout.id as string,
    createdAt: checkout.created_at as string,
    itemCount: n(checkout.item_count),
    priceSubtotalLKR: n(checkout.price_subtotal_lkr),
    serviceLKR: n(checkout.service_lkr) + n(checkout.pickup_lkr),
    deliveryLKR: n(checkout.delivery_lkr),
    discountLKR: n(checkout.discount_lkr),
    totalLKR: n(checkout.total_lkr),
    couponTitle: (coupon?.title as string | undefined) ?? null,
    needsPriceReview: !!checkout.needs_price_review,
    paymentStatus: checkout.payment_status as 'unpaid' | 'paid' | 'failed' | 'refunded',
    paidAt: (checkout.paid_at as string | null) ?? null,
    payment: payment ? { reference: payment.reference as string, last4: payment.card_last4 as string | null } : null,
    orders: ((orders ?? []) as Record<string, unknown>[]).map((o) => ({
      id: o.id as string,
      displayId: o.display_id as string,
      totalLKR: n(o.total_value),
      cancelled: o.stage === 'cancelled',
    })),
    mode: PAYMENT_PROVIDER,
  }
}
