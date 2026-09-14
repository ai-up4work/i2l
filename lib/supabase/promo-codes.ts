// lib/supabase/promo-codes.ts
//
// Real data for the customer-facing "My promo codes" page and cart
// discount-code redemption. A coupon here is always a `discounts` row +
// a `user_promo_codes` row assigning it to one customer — the same
// tables a marketing-issued storewide code would use, so a QC-issue
// compensation coupon (see lib/supabase/qc-issues.ts) looks and behaves
// identically to any other promo code once issued.

import { createClient } from '@/lib/supabase/client'

export type PromoStatus = 'available' | 'used' | 'expired'

export interface CustomerPromoCode {
  id: string // user_promo_codes.id
  discountId: string
  code: string
  title: string
  discountType: 'percent' | 'fixed'
  value: number
  category: string
  status: PromoStatus
  expiresAt: string
  usedOnOrderId?: string
}

function categoryForScope(scope: string): string {
  if (scope === 'collection') return 'Collection'
  if (scope === 'products') return 'Selected items'
  return 'Storewide'
}

/** Recomputes status against the discount's real expiry — a row can be
 * 'available' in the DB but past ends_at if nothing's touched it since. */
function resolveStatus(dbStatus: string, endsAt: string): PromoStatus {
  if (dbStatus === 'used') return 'used'
  if (new Date(endsAt).getTime() < Date.now()) return 'expired'
  return 'available'
}

export async function fetchMyPromoCodes(userId: string): Promise<CustomerPromoCode[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('user_promo_codes')
    .select(
      'id, status, used_on_order_id, discounts ( id, code, title, type, value, scope, ends_at, status )',
    )
    .eq('user_id', userId)
    .order('assigned_at', { ascending: false })

  if (error) {
    console.error('[fetchMyPromoCodes]', error)
    return []
  }

  return (data ?? [])
    .filter((row: any) => row.discounts)
    .map((row: any) => {
      const d = row.discounts
      return {
        id: row.id,
        discountId: d.id,
        code: d.code,
        title: d.title ?? (d.type === 'percent' ? `${d.value}% off` : `${d.value} off`),
        discountType: d.type,
        value: d.value,
        category: categoryForScope(d.scope),
        status: resolveStatus(row.status, d.ends_at),
        expiresAt: d.ends_at,
        usedOnOrderId: row.used_on_order_id ?? undefined,
      }
    })
}

/**
 * Validates a code the customer typed at checkout: must exist, be
 * active, not expired, under its usage limit, and — if it's a
 * per-customer coupon (has a user_promo_codes row for someone) — must
 * belong to THIS customer and not already be used. A platform-wide
 * marketing code with no user_promo_codes row at all is valid for
 * anyone. Returns the discount amount to apply, or an error message.
 */
export async function validateDiscountCode(
  code: string,
  userId: string,
  subtotal: number,
): Promise<{ ok: true; discountId: string; amountOff: number } | { ok: false; error: string }> {
  const supabase = createClient()
  const { data: discount, error } = await supabase
    .from('discounts')
    .select('id, code, type, value, status, starts_at, ends_at, usage_limit, usage_count')
    .ilike('code', code.trim())
    .maybeSingle()

  if (error || !discount) return { ok: false, error: 'That code isn\u2019t valid.' }
  if (discount.status !== 'active') return { ok: false, error: 'That code is no longer active.' }
  const now = Date.now()
  if (new Date(discount.starts_at).getTime() > now) return { ok: false, error: 'That code isn\u2019t active yet.' }
  if (new Date(discount.ends_at).getTime() < now) return { ok: false, error: 'That code has expired.' }
  if (discount.usage_limit != null && discount.usage_count >= discount.usage_limit) {
    return { ok: false, error: 'That code has already been fully redeemed.' }
  }

  // If this code was issued to specific customers, it can only be used
  // by one of them, and only once.
  const { data: assignment } = await supabase
    .from('user_promo_codes')
    .select('id, user_id, status')
    .eq('discount_id', discount.id)
    .maybeSingle()
  if (assignment) {
    if (assignment.user_id !== userId) return { ok: false, error: 'That code isn\u2019t available on your account.' }
    if (assignment.status === 'used') return { ok: false, error: 'You\u2019ve already used that code.' }
  }

  const amountOff = discount.type === 'percent' ? Math.round(subtotal * (discount.value / 100)) : Math.min(discount.value, subtotal)
  return { ok: true, discountId: discount.id, amountOff }
}

/** Records redemption after a successful checkout: logs the redemption, bumps usage_count, and (for a per-customer coupon) marks the assignment used. */
export async function redeemDiscountCode(
  discountId: string,
  userId: string,
  orderId: string,
  amountApplied: number,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()

  const { error: redemptionError } = await supabase
    .from('discount_redemptions')
    .insert({ discount_id: discountId, user_id: userId, order_id: orderId, amount_applied: amountApplied })
  if (redemptionError) return { ok: false, error: redemptionError.message }

  const { data: current } = await supabase.from('discounts').select('usage_count').eq('id', discountId).maybeSingle()
  await supabase
    .from('discounts')
    .update({ usage_count: (current?.usage_count ?? 0) + 1 })
    .eq('id', discountId)

  await supabase
    .from('user_promo_codes')
    .update({ status: 'used', used_on_order_id: orderId, used_at: new Date().toISOString() })
    .eq('discount_id', discountId)
    .eq('user_id', userId)

  return { ok: true }
}