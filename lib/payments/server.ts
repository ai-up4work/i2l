// lib/payments/server.ts
//
// SERVER-ONLY. Payment for a checkout.
//
// There's no payment gateway yet, so payment is MANUAL: after "Confirm
// order" the customer gets payment details from us on WhatsApp, pays
// (bank transfer, cash, …), and staff record it on the admin order page
// (Payment card -> "Mark as paid"). Customers can never mark anything paid
// themselves — there is no customer payment endpoint.
//
// recordManualPayment() writes a `payments` row (method, reference, who
// recorded it) and then markCheckoutPaid(), which flips the checkout and
// its orders to paid and runs everything that should follow a payment
// (referral rewards). When a gateway arrives, its webhook should call
// markCheckoutPaid() the same way.

import 'server-only'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { db, voidRedemptionsForCheckout } from '@/lib/coupons/server'
import { onCheckoutPaid } from '@/lib/referrals/server'

export const PAYMENT_PROVIDER = 'manual'

export const MANUAL_METHODS = ['bank_transfer', 'cash', 'card_machine', 'online_transfer', 'other'] as const
export type ManualMethod = (typeof MANUAL_METHODS)[number]
export const MANUAL_METHOD_LABEL: Record<ManualMethod, string> = {
  bank_transfer: 'Bank transfer',
  cash: 'Cash',
  card_machine: 'Card machine',
  online_transfer: 'Online / app transfer',
  other: 'Other',
}

export async function markCheckoutPaid(checkoutId: string, userId: string): Promise<void> {
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

type Result = { ok: true } | { ok: false; error: string; status?: number }

/** Staff: record a payment received outside the site, and mark the checkout paid. */
export async function recordManualPayment(
  checkoutId: string,
  staffId: string,
  input: { method: ManualMethod; reference?: string; amountLKR?: number; note?: string },
): Promise<Result> {
  const admin = createServiceRoleClient()
  const { data: checkout } = await db(admin)
    .from('checkouts')
    .select('id, user_id, total_lkr, payment_status')
    .eq('id', checkoutId)
    .maybeSingle()
  if (!checkout) return { ok: false, error: 'Checkout not found.', status: 404 }
  if (checkout.payment_status === 'paid') return { ok: false, error: 'This order is already marked as paid.', status: 409 }
  if (!MANUAL_METHODS.includes(input.method)) return { ok: false, error: 'Choose how the customer paid.', status: 400 }

  const amount = input.amountLKR != null && Number.isFinite(input.amountLKR) && input.amountLKR > 0 ? input.amountLKR : Number(checkout.total_lkr)
  const row = {
    checkout_id: checkoutId,
    user_id: checkout.user_id,
    provider: PAYMENT_PROVIDER,
    method: input.method,
    amount_lkr: amount,
    status: 'succeeded',
    reference: (input.reference ?? '').trim().slice(0, 120) || `MANUAL-${Date.now()}`,
    note: (input.note ?? '').trim().slice(0, 500) || null,
    recorded_by: staffId,
  }
  let { error } = await db(admin).from('payments').insert(row)
  if (error && /column .* does not exist|method|recorded_by|note/i.test(error.message)) {
    // SQL section 11 not run yet — save without the new columns.
    const { method: _m, note: _n, recorded_by: _r, ...basic } = row
    ;({ error } = await db(admin).from('payments').insert({ ...basic, reference: `${MANUAL_METHOD_LABEL[input.method]}: ${basic.reference}` }))
  }
  if (error) return { ok: false, error: error.message, status: 500 }

  await markCheckoutPaid(checkoutId, checkout.user_id)
  return { ok: true }
}

/** Staff: undo a payment recorded by mistake. Doesn't reverse referral rewards already given. */
export async function markCheckoutUnpaid(checkoutId: string, staffId: string, reason: string): Promise<Result> {
  const admin = createServiceRoleClient()
  const { data: checkout } = await db(admin).from('checkouts').select('id, payment_status').eq('id', checkoutId).maybeSingle()
  if (!checkout) return { ok: false, error: 'Checkout not found.', status: 404 }
  if (checkout.payment_status !== 'paid') return { ok: false, error: 'This order isn’t marked as paid.', status: 409 }
  await db(admin).from('checkouts').update({ payment_status: 'unpaid', paid_at: null }).eq('id', checkoutId)
  await db(admin).from('orders').update({ payment_status: 'unpaid' }).eq('checkout_id', checkoutId)
  // Keep the trail: the recorded payment is marked failed with the reason.
  await db(admin)
    .from('payments')
    .update({ status: 'failed', failure_reason: `Undone by staff ${staffId}: ${reason.trim().slice(0, 300) || 'no reason given'}` })
    .eq('checkout_id', checkoutId)
    .eq('status', 'succeeded')
  return { ok: true }
}

/**
 * Staff: cancel an order that was never paid (customer stopped replying,
 * changed their mind…). Cancels every order in the checkout — one
 * "Confirm order" — and:
 *   - gives back the coupon use (coupon_redemptions -> voided),
 *   - puts Wishdrop Mall stock back (mall_restore_stock_for_order),
 *   - logs it in each order's stage history,
 *   - tells the customer (bell notification).
 * Paid orders can't be cancelled here (that needs a refund decision).
 */
export async function cancelUnpaidCheckout(checkoutId: string, staffId: string, reason: string): Promise<Result> {
  const admin = createServiceRoleClient()
  const { data: checkout } = await db(admin).from('checkouts').select('id, user_id, payment_status').eq('id', checkoutId).maybeSingle()
  if (!checkout) return { ok: false, error: 'Checkout not found.', status: 404 }
  if (checkout.payment_status === 'paid') {
    return { ok: false, error: 'This order is paid — undo the payment first if it was recorded by mistake, or handle it as a refund.', status: 409 }
  }
  const { data: orders } = await db(admin)
    .from('orders')
    .select('id, display_id, stage')
    .eq('checkout_id', checkoutId)
    .neq('stage', 'cancelled')
  const live = (orders ?? []) as { id: string; display_id: string; stage: string }[]
  if (!live.length) return { ok: false, error: 'This order is already cancelled.', status: 409 }

  const why = reason.trim().slice(0, 300) || 'Not paid'
  const now = new Date().toISOString()
  const { error } = await db(admin)
    .from('orders')
    .update({ stage: 'cancelled', stage_entered_at: now })
    .in('id', live.map((o) => o.id))
  if (error) return { ok: false, error: error.message, status: 500 }

  await db(admin)
    .from('order_stage_history')
    .insert(live.map((o) => ({ order_id: o.id, stage: 'cancelled', by_staff_id: staffId, note: `Cancelled before payment: ${why}` })))
    .then(({ error: e }: { error: { message: string } | null }) => e && console.error('[payments] stage history', e.message))

  await voidRedemptionsForCheckout(admin, checkoutId, `Order cancelled before payment: ${why}`)

  for (const o of live) {
    const { error: e } = await db(admin).rpc('mall_restore_stock_for_order', { p_order_id: o.id })
    if (e && !/does not exist/i.test(e.message)) console.error('[payments] restore stock', o.display_id, e.message)
  }

  const ids = live.map((o) => o.display_id).join(', ')
  await db(admin)
    .from('notifications')
    .insert({
      user_id: checkout.user_id,
      type: 'order_update',
      title: `Order ${ids} was cancelled`,
      body: 'We didn’t receive payment for this order, so it’s been cancelled. Any coupon you used is back in My coupons. Message us on WhatsApp if you’d still like it.',
      link: '/account/orders',
    })
    .then(({ error: e }: { error: { message: string } | null }) => e && console.error('[payments] notify', e.message))

  return { ok: true }
}

const n = (v: unknown) => Number(v) || 0

async function checkoutSummary(checkoutId: string) {
  const admin = createServiceRoleClient()
  const { data: checkout } = await db(admin).from('checkouts').select('*').eq('id', checkoutId).maybeSingle()
  if (!checkout) return null
  const [{ data: orders }, { data: coupon }, { data: payments }] = await Promise.all([
    db(admin)
      .from('orders')
      .select('id, display_id, total_value, stage, payment_status, recipient_address_id')
      .eq('checkout_id', checkoutId)
      .order('created_at'),
    checkout.coupon_id
      ? db(admin).from('coupons').select('id, title').eq('id', checkout.coupon_id).maybeSingle()
      : Promise.resolve({ data: null }),
    db(admin).from('payments').select('*').eq('checkout_id', checkoutId).order('created_at', { ascending: false }),
  ])
  const paid = ((payments ?? []) as Record<string, unknown>[]).find((p) => p.status === 'succeeded') ?? null
  return {
    raw: checkout as Record<string, unknown>,
    payments: (payments ?? []) as Record<string, unknown>[],
    view: {
      id: checkout.id as string,
      createdAt: checkout.created_at as string,
      itemCount: n(checkout.item_count),
      priceSubtotalLKR: n(checkout.price_subtotal_lkr),
      serviceLKR: n(checkout.service_lkr) + n(checkout.pickup_lkr),
      deliveryLKR: n(checkout.delivery_lkr),
      discountLKR: n(checkout.discount_lkr),
      totalLKR: n(checkout.total_lkr),
      couponId: (coupon?.id as string | undefined) ?? null,
      couponTitle: (coupon?.title as string | undefined) ?? null,
      needsPriceReview: !!checkout.needs_price_review,
      paymentStatus: checkout.payment_status as 'unpaid' | 'paid' | 'failed' | 'refunded',
      paidAt: (checkout.paid_at as string | null) ?? null,
      payment: paid
        ? {
            method: ((paid.method as string | null) ?? null) as ManualMethod | null,
            reference: paid.reference as string,
            amountLKR: n(paid.amount_lkr),
            at: paid.created_at as string,
          }
        : null,
      orders: ((orders ?? []) as Record<string, unknown>[]).map((o) => ({
        id: o.id as string,
        displayId: o.display_id as string,
        totalLKR: n(o.total_value),
        cancelled: o.stage === 'cancelled',
        addressId: (o.recipient_address_id as string | null) ?? null,
      })),
      mode: PAYMENT_PROVIDER,
    },
  }
}

export type CheckoutView = NonNullable<Awaited<ReturnType<typeof checkoutSummary>>>['view']

/** The customer's own checkout (Order placed page). */
export async function checkoutForCustomer(userId: string, checkoutId: string): Promise<CheckoutView | null> {
  const s = await checkoutSummary(checkoutId)
  if (!s || s.raw.user_id !== userId) return null
  return s.view
}

/** Staff: the checkout an order belongs to, with customer contact and payment history. */
export async function checkoutForOrder(orderId: string) {
  const admin = createServiceRoleClient()
  const { data: order, error } = await db(admin)
    .from('orders')
    .select('id, checkout_id, user_id, recipient_address_id')
    .eq('id', orderId)
    .maybeSingle()
  if (error) {
    // Don't hide a broken query behind "no checkout" — say what failed.
    console.error('[payments] order lookup failed', error.message)
    throw new Error(error.message)
  }
  if (!order?.checkout_id) return null
  const s = await checkoutSummary(order.checkout_id)
  if (!s) return null
  const addressId = order.recipient_address_id ?? s.view.orders.find((o) => o.addressId)?.addressId ?? null
  const [{ data: address }, { data: profile }] = await Promise.all([
    addressId
      ? db(admin).from('addresses').select('recipient_name, phone').eq('id', addressId).maybeSingle()
      : Promise.resolve({ data: null }),
    db(admin).from('profiles').select('full_name, phone').eq('id', s.raw.user_id).maybeSingle(),
  ])
  return {
    ...s.view,
    customer: {
      name: (address?.recipient_name as string | undefined) ?? (profile?.full_name as string | undefined) ?? 'Customer',
      phone: (address?.phone as string | undefined) ?? (profile?.phone as string | undefined) ?? null,
    },
    history: s.payments.map((p) => ({
      id: p.id as string,
      method: (p.method as string | null) ?? null,
      provider: p.provider as string,
      reference: p.reference as string,
      amountLKR: n(p.amount_lkr),
      status: p.status as string,
      note: (p.note as string | null) ?? (p.failure_reason as string | null) ?? null,
      at: p.created_at as string,
    })),
  }
}

/** Staff: an order made from a request (Requests page) — paid before the
 *  order existed; the payment lives on the request. */
export async function requestPaymentForOrder(orderId: string) {
  const admin = createServiceRoleClient()
  const { data: order } = await db(admin).from('orders').select('id, request_id, total_value').eq('id', orderId).maybeSingle()
  if (!order?.request_id) return null
  const { data: r } = await db(admin)
    .from('requests')
    .select('id, display_id, payment_amount, payment_method, payment_reference, payment_confirmed_at, quote')
    .eq('id', order.request_id)
    .maybeSingle()
  if (!r) return null
  return {
    requestDisplayId: (r.display_id as string | null) ?? null,
    requestId: r.id as string,
    amountLKR: n(r.payment_amount ?? r.quote ?? order.total_value),
    method: (r.payment_method as string | null) ?? null,
    reference: (r.payment_reference as string | null) ?? null,
    paidAt: (r.payment_confirmed_at as string | null) ?? null,
  }
}
