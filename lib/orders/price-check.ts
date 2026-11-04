// lib/orders/price-check.ts
//
// SERVER-ONLY. The staff "Price check" on an order (Admin → order page).
//
// Checkout flags an order (orders.price_review) when an item's price
// couldn't be confirmed, or a pasted link was priced at an estimated weight
// (lib/weight-estimate.ts). Here staff see each item's weight and price and
// can:
//   - set the real weight → the item is re-priced with the pricing engine
//     from the store price saved at checkout (order_items.source_price);
//   - or set the item's price by hand (any item, including old orders
//     placed before weights were saved);
//   - or just confirm the prices as they are.
// The order total and its checkout's totals are recalculated, the flag is
// cleared, an internal note records what changed, and the customer is always
// told the final total (in-app notification, push, order chat).
//
// EVERY checkout order starts flagged (lib/checkout/server.ts): no payment
// request and no payment can be recorded until staff confirm here
// (OrderPaymentCard, lib/payments/server.ts recordManualPayment).
//
// Only while the order is unpaid: once paid, a different price needs a
// refund or a payment request for the difference, not a silent change.
//
// Needs data/wishdrop-weight-estimates.sql for weights; without it, prices
// can still be set by hand.

import 'server-only'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { ensurePricingSettings } from '@/lib/pricing-settings-server'
import { getDualDeliveryPricing, formatLKR } from '@/lib/pricing'
import { db, type AdminClient } from '@/lib/coupons/server'
import { sendPushToUsers, notificationText } from '@/lib/push/server'
import { sendChatMessage } from '@/lib/supabase/chat'
import { formatKg, isEstimatedWeight, isWeightSource, roundKg, type WeightSource } from '@/lib/weight-estimate'

/** What staff may enter. Wider than a shopper's limits (bulky items). */
export const STAFF_WEIGHT_LIMITS = { min: 0.01, max: 200 } as const
const MAX_UNIT_PRICE_LKR = 10_000_000

export type PriceCheckItem = {
  id: string
  title: string
  variant: string | null
  qty: number
  unitPriceLKR: number
  link: string | null
  weightKg: number | null
  weightSource: WeightSource | null
  weightEstimated: boolean
  priceVerified: boolean
  priceSource: string | null
  sourcePrice: number | null
  sourceCurrency: string | null
  /** False when we can't re-price from a weight (no store price saved, or
   *  a local / fixed-price item) — then only a typed price works. */
  canRepriceByWeight: boolean
}

export type PriceCheck = {
  orderId: string
  displayId: string
  priceReview: boolean
  checkedAt: string | null
  delivery: 'express' | 'economy'
  totalLKR: number
  discountLKR: number
  pickupLKR: number
  paymentStatus: string
  /** False for request (Channel 3) orders, priced on the request page. */
  fromCheckout: boolean
  /** Null when the price can be changed; otherwise why not. */
  lockedReason: string | null
  items: PriceCheckItem[]
}

export type PriceChange = { itemId: string; weightKg?: number | null; unitPriceLKR?: number | null }

export type PricePreview = {
  items: { itemId: string; unitPriceLKR: number; changed: boolean }[]
  totalLKR: number
  previousTotalLKR: number
}

type Loaded = {
  order: Record<string, unknown>
  items: Record<string, unknown>[]
  checkout: Record<string, unknown> | null
  view: PriceCheck
}

const n = (v: unknown) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)
const money = (v: number) => Math.round(v * 100) / 100

/** Store slug for a catalogue item ("wishdrop-mall:abc" → "wishdrop-mall"),
 *  so fixed-price stores keep their own pricing. */
function storeSlugOf(item: Record<string, unknown>): string | null {
  const url = typeof item.store_url === 'string' ? item.store_url : ''
  if (!url || /^https?:\/\//i.test(url)) return null
  return url.split(':')[0] || null
}

async function load(admin: AdminClient, orderId: string): Promise<Loaded | null> {
  const { data: order } = await db(admin).from('orders').select('*').eq('id', orderId).maybeSingle()
  if (!order) return null
  const [{ data: items }, checkoutRes] = await Promise.all([
    db(admin).from('order_items').select('*').eq('order_id', orderId).order('id'),
    order.checkout_id
      ? db(admin).from('checkouts').select('*').eq('id', order.checkout_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const checkout = (checkoutRes?.data ?? null) as Record<string, unknown> | null
  const local = order.store_origin === 'LK'
  const paymentStatus = String(checkout?.payment_status ?? order.payment_status ?? 'unpaid')

  let lockedReason: string | null = null
  if (!checkout) lockedReason = 'This order wasn’t placed through checkout — its price is set on the request.'
  else if (order.stage === 'cancelled') lockedReason = 'This order is cancelled.'
  else if (paymentStatus !== 'unpaid')
    lockedReason = 'Already paid. To charge a different amount, refund the difference or ask the customer for it in chat.'

  const rows = (items ?? []) as Record<string, unknown>[]
  const view: PriceCheck = {
    orderId,
    displayId: String(order.display_id),
    priceReview: !!order.price_review,
    checkedAt: (order.price_checked_at as string | null) ?? null,
    delivery: checkout?.delivery === 'economy' ? 'economy' : 'express',
    totalLKR: Number(order.total_value) || 0,
    discountLKR: Number(order.discount_lkr) || 0,
    pickupLKR: Number(order.pickup_fee_lkr) || 0,
    paymentStatus,
    fromCheckout: !!checkout,
    lockedReason,
    items: rows.map((r) => {
      const weightSource = isWeightSource(r.weight_source) ? r.weight_source : null
      const sourcePrice = n(r.source_price)
      const isLink = typeof r.request_link === 'string' && /^https?:\/\//i.test(r.request_link)
      return {
        id: String(r.id),
        title: String(r.title ?? 'Item'),
        variant: (r.variant_label as string | null) ?? null,
        qty: Number(r.quantity) || 1,
        unitPriceLKR: Number(r.unit_price) || 0,
        link: (r.request_link as string | null) ?? (r.store_url as string | null) ?? null,
        weightKg: n(r.weight_kg),
        weightSource,
        weightEstimated: isLink && !local && (weightSource == null || isEstimatedWeight(weightSource)) && !r.price_checked_at,
        priceVerified: r.price_verified !== false,
        priceSource: (r.price_source as string | null) ?? null,
        sourcePrice,
        sourceCurrency: (r.source_currency as string | null) ?? null,
        canRepriceByWeight: sourcePrice != null && sourcePrice > 0 && !local && storeSlugOf(r) !== 'wishdrop-mall',
      }
    }),
  }
  return { order, items: rows, checkout, view }
}

export async function getPriceCheck(orderId: string): Promise<PriceCheck | null> {
  const loaded = await load(createServiceRoleClient(), orderId)
  return loaded?.view ?? null
}

/** Works out the new unit prices and order total for `changes`. */
async function compute(loaded: Loaded, changes: PriceChange[]): Promise<PricePreview | { error: string }> {
  const settings = await ensurePricingSettings()
  const byId = new Map(changes.map((c) => [c.itemId, c]))
  for (const c of changes) if (!loaded.view.items.some((i) => i.id === c.itemId)) return { error: 'One of the items isn’t on this order.' }

  const out: PricePreview['items'] = []
  for (const item of loaded.view.items) {
    const change = byId.get(item.id)
    let unit = item.unitPriceLKR
    if (change?.unitPriceLKR != null) {
      const p = Number(change.unitPriceLKR)
      if (!Number.isFinite(p) || p <= 0 || p > MAX_UNIT_PRICE_LKR) return { error: `Enter a valid price for “${item.title}”.` }
      unit = money(p)
    } else if (change?.weightKg != null) {
      const w = Number(change.weightKg)
      if (!Number.isFinite(w) || w < STAFF_WEIGHT_LIMITS.min || w > STAFF_WEIGHT_LIMITS.max) {
        return { error: `Weight for “${item.title}” must be between ${STAFF_WEIGHT_LIMITS.min} and ${STAFF_WEIGHT_LIMITS.max} kg.` }
      }
      if (!item.canRepriceByWeight) return { error: `“${item.title}” has no saved store price — set its price instead.` }
      const raw = loaded.items.find((r) => String(r.id) === item.id)!
      const dual = getDualDeliveryPricing(
        { price: item.sourcePrice!, currency: item.sourceCurrency ?? 'INR', weightKg: roundKg(w), storeSlug: storeSlugOf(raw) },
        settings,
      )
      unit = money((loaded.view.delivery === 'economy' ? dual.economy : dual.express).actualTotalLKR)
    }
    out.push({ itemId: item.id, unitPriceLKR: unit, changed: Math.abs(unit - item.unitPriceLKR) >= 0.01 })
  }

  const itemsTotal = out.reduce((t, i) => t + i.unitPriceLKR * (loaded.view.items.find((x) => x.id === i.itemId)?.qty ?? 1), 0)
  const totalLKR = money(Math.max(0, itemsTotal + loaded.view.pickupLKR - loaded.view.discountLKR))
  return { items: out, totalLKR, previousTotalLKR: loaded.view.totalLKR }
}

export async function previewPriceCheck(orderId: string, changes: PriceChange[]): Promise<PricePreview | { error: string }> {
  const loaded = await load(createServiceRoleClient(), orderId)
  if (!loaded) return { error: 'Order not found.' }
  return compute(loaded, changes)
}

/**
 * Saves the checked prices: item prices and weights, the order and
 * checkout totals, clears the flag, leaves an internal note and (if asked)
 * tells the customer.
 */
export async function applyPriceCheck(
  orderId: string,
  staff: { id: string; name: string | null },
  input: { changes: PriceChange[]; note?: string | null },
): Promise<{ ok: true; check: PriceCheck; totalLKR: number; previousTotalLKR: number; notified: boolean } | { ok: false; error: string; status?: number }> {
  const admin = createServiceRoleClient()
  const loaded = await load(admin, orderId)
  if (!loaded) return { ok: false, error: 'Order not found.', status: 404 }
  if (loaded.view.lockedReason) return { ok: false, error: loaded.view.lockedReason, status: 409 }

  const result = await compute(loaded, input.changes)
  if ('error' in result) return { ok: false, error: result.error, status: 400 }

  const now = new Date().toISOString()
  const byId = new Map(input.changes.map((c) => [c.itemId, c]))
  const lines: string[] = []

  // 1. Items. Every item counts as checked once staff confirm the order.
  for (const priced of result.items) {
    const item = loaded.view.items.find((i) => i.id === priced.itemId)!
    const change = byId.get(item.id)
    const patch: Record<string, unknown> = { unit_price: priced.unitPriceLKR, price_verified: true, price_checked_at: now }
    const newWeight = change?.weightKg != null && change.unitPriceLKR == null ? roundKg(Number(change.weightKg)) : null
    if (newWeight != null) {
      patch.weight_kg = newWeight
      patch.weight_source = 'staff'
    }
    let { error } = await db(admin).from('order_items').update(patch).eq('id', item.id)
    if (error && /price_checked_at|weight_kg|weight_source/i.test(error.message ?? '')) {
      // Migration not run yet: save the price alone.
      ;({ error } = await db(admin).from('order_items').update({ unit_price: priced.unitPriceLKR, price_verified: true }).eq('id', item.id))
    }
    if (error) return { ok: false, error: `Couldn’t save “${item.title}”: ${error.message}`, status: 500 }

    const bits: string[] = []
    if (newWeight != null) bits.push(`weight ${item.weightKg != null ? formatKg(item.weightKg) : '—'} → ${formatKg(newWeight)}`)
    if (priced.changed) bits.push(`${formatLKR(item.unitPriceLKR)} → ${formatLKR(priced.unitPriceLKR)} each`)
    if (bits.length) lines.push(`• ${item.title}: ${bits.join(', ')}`)
  }

  // 2. Order total + flag. Guarded on the old total and unpaid status so two
  // staff saving at once, or a payment landing mid-save, can't double-apply.
  const delta = money(result.totalLKR - result.previousTotalLKR)
  let orderUpdate = await db(admin)
    .from('orders')
    .update({ total_value: result.totalLKR, price_review: false, price_checked_at: now, price_checked_by: staff.id })
    .eq('id', orderId)
    .eq('total_value', result.previousTotalLKR)
    .select('id')
  if (orderUpdate.error && /price_checked/i.test(orderUpdate.error.message ?? '')) {
    orderUpdate = await db(admin)
      .from('orders')
      .update({ total_value: result.totalLKR, price_review: false })
      .eq('id', orderId)
      .eq('total_value', result.previousTotalLKR)
      .select('id')
  }
  if (orderUpdate.error) return { ok: false, error: orderUpdate.error.message, status: 500 }
  if (!orderUpdate.data?.length) return { ok: false, error: 'Someone else changed this order’s total just now. Reload and check again.', status: 409 }

  // 3. Checkout totals (one checkout can hold an India and a Sri Lanka order).
  // Other orders from the same checkout still waiting for their price check
  // (an India and a Sri Lanka order are paid together).
  let stillReview = false
  if (loaded.checkout) {
    const checkoutId = String(loaded.checkout.id)
    const { data: siblings } = await db(admin).from('orders').select('id, price_review').eq('checkout_id', checkoutId)
    stillReview = ((siblings ?? []) as { id: string; price_review: boolean }[]).some((o) => o.id !== orderId && o.price_review)
    const { error } = await db(admin)
      .from('checkouts')
      .update({
        price_subtotal_lkr: money((Number(loaded.checkout.price_subtotal_lkr) || 0) + delta),
        total_lkr: money(Math.max(0, (Number(loaded.checkout.total_lkr) || 0) + delta)),
        needs_price_review: stillReview,
      })
      .eq('id', checkoutId)
      .eq('payment_status', 'unpaid')
    if (error) console.error('[price-check] checkout update failed', error.message)
  }

  // 4. Internal note (shown on the order page; audit log records the rest).
  const summary =
    delta === 0
      ? `Price check: prices confirmed at ${formatLKR(result.totalLKR)}.`
      : `Price check: total ${formatLKR(result.previousTotalLKR)} → ${formatLKR(result.totalLKR)} (${delta > 0 ? '+' : '−'}${formatLKR(Math.abs(delta))}).`
  const noteText = [summary, ...lines, input.note?.trim() ? `Note: ${input.note.trim().slice(0, 500)}` : null].filter(Boolean).join('\n')
  await db(admin)
    .from('order_internal_notes')
    .insert({ order_id: orderId, staff_id: staff.id, text: noteText })
    .then(({ error }: { error: { message: string } | null }) => error && console.error('[price-check] note', error.message))

  // 5. Tell the customer.
  let notified = false
  // 5. Tell the customer — always: confirming the price is what lets the
  // order move on to payment, so the customer must hear the final total.
  {
    const userId = String(loaded.order.user_id)
    const id = loaded.view.displayId
    const changedItems = lines.length ? `\n\n${lines.join('\n')}` : ''
    const title = delta === 0 ? `Order ${id}: price confirmed` : `Order ${id}: final price updated`
    const nextStep = stillReview
      ? 'We’re still checking the rest of your order — we’ll send one payment request for everything once that’s done.'
      : 'We’ll send the payment details on WhatsApp — please pay only to those.'
    const body =
      delta === 0
        ? `We’ve checked your order with the store. Your final total is ${formatLKR(result.totalLKR)}. ${nextStep}`
        : `We’ve checked the weight and price of your items with the store. Your final total is ${formatLKR(result.totalLKR)} (was ${formatLKR(result.previousTotalLKR)}). ${nextStep}`
    const link = loaded.checkout ? `/account/pay/${String(loaded.checkout.id)}` : '/account/orders'

    await db(admin)
      .from('notifications')
      .insert({ user_id: userId, type: 'order_update', title, body, link })
      .then(({ error }: { error: { message: string } | null }) => error && console.error('[price-check] notify', error.message))

    await sendPushToUsers(admin, [userId], {
      title,
      body: notificationText(body),
      url: link,
      tag: `price-check-${orderId}`,
      kind: 'account',
    }).catch((err) => console.error('[price-check] push', err))

    const threadId = loaded.order.chat_thread_id as string | null
    if (threadId) {
      await sendChatMessage(admin as never, {
        threadId,
        sender: 'ops',
        senderName: staff.name ?? 'Wishdrop',
        text: `${body}${changedItems}${input.note?.trim() ? `\n\n${input.note.trim().slice(0, 500)}` : ''}\n\nReply here if you have any questions.`,
        orderId,
      }).catch((err) => console.error('[price-check] chat', err))
    }
    notified = true
  }

  const fresh = await load(admin, orderId)
  return { ok: true, check: fresh!.view, totalLKR: result.totalLKR, previousTotalLKR: result.previousTotalLKR, notified }
}
