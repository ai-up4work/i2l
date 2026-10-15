// lib/referrals/server.ts
//
// SERVER-ONLY. Refer-a-friend, end to end.
//
//   1. Every customer has a referral code (profiles.referral_code) and a
//      link: https://<site>/r/<code>.
//   2. Opening the link stores the code in a cookie (app/r/[code]) and
//      sends the visitor to sign up.
//   3. Once they have an account, /api/referrals/attach links them to the
//      referrer — only if they're a genuinely new customer (account under
//      14 days old, no orders yet, not referring themselves) — and gives
//      them a welcome coupon.
//   4. When the friend's first order of at least the qualifying amount is
//      PAID, the referrer gets their reward coupon (onCheckoutPaid, called
//      by lib/payments/server.ts).
//
// Amounts and rules live in referral_settings (Admin → Referrals). Every
// reward is a normal coupon (lib/coupons), so it shows in My coupons and in
// the coupon admin with who got it and who used it.

import 'server-only'
import { randomBytes } from 'node:crypto'
import { SITE_URL } from '@/lib/seo'
import { db, discountLabel, issuePersonalCoupon, type AdminClient } from '@/lib/coupons/server'

export const REFERRAL_COOKIE = 'wd_ref'
const NEW_ACCOUNT_WINDOW_DAYS = 14

export type ReferralSettings = {
  enabled: boolean
  friendRewardType: 'percent' | 'fixed'
  friendRewardValue: number
  friendMaxDiscountLKR: number | null
  friendMinOrderLKR: number
  friendValidDays: number
  referrerRewardType: 'percent' | 'fixed'
  referrerRewardValue: number
  referrerMaxDiscountLKR: number | null
  referrerMinOrderLKR: number
  referrerValidDays: number
  qualifyingOrderLKR: number
  updatedAt: string | null
  updatedBy: string | null
}

const n = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d)
const nOrNull = (v: unknown) => (v == null || v === '' || !Number.isFinite(Number(v)) || Number(v) <= 0 ? null : Number(v))

export async function getReferralSettings(admin: AdminClient): Promise<ReferralSettings> {
  const { data } = await db(admin).from('referral_settings').select('*').eq('id', 1).maybeSingle()
  const r = (data ?? {}) as Record<string, unknown>
  return {
    enabled: r.enabled !== false,
    friendRewardType: r.friend_reward_type === 'percent' ? 'percent' : 'fixed',
    friendRewardValue: n(r.friend_reward_value, 1000),
    friendMaxDiscountLKR: nOrNull(r.friend_max_discount_lkr),
    friendMinOrderLKR: n(r.friend_min_order_lkr, 5000),
    friendValidDays: Math.max(1, n(r.friend_valid_days, 30)),
    referrerRewardType: r.referrer_reward_type === 'percent' ? 'percent' : 'fixed',
    referrerRewardValue: n(r.referrer_reward_value, 1000),
    referrerMaxDiscountLKR: nOrNull(r.referrer_max_discount_lkr),
    referrerMinOrderLKR: n(r.referrer_min_order_lkr, 5000),
    referrerValidDays: Math.max(1, n(r.referrer_valid_days, 60)),
    qualifyingOrderLKR: n(r.qualifying_order_lkr, 5000),
    updatedAt: (r.updated_at as string) ?? null,
    updatedBy: (r.updated_by_name as string) ?? null,
  }
}

export function validateSettings(body: Record<string, unknown>): Omit<ReferralSettings, 'updatedAt' | 'updatedBy'> | { error: string } {
  const type = (v: unknown) => (v === 'percent' ? 'percent' : 'fixed') as 'percent' | 'fixed'
  const s = {
    enabled: body.enabled !== false,
    friendRewardType: type(body.friendRewardType),
    friendRewardValue: n(body.friendRewardValue),
    friendMaxDiscountLKR: nOrNull(body.friendMaxDiscountLKR),
    friendMinOrderLKR: Math.max(0, n(body.friendMinOrderLKR)),
    friendValidDays: Math.floor(n(body.friendValidDays, 30)),
    referrerRewardType: type(body.referrerRewardType),
    referrerRewardValue: n(body.referrerRewardValue),
    referrerMaxDiscountLKR: nOrNull(body.referrerMaxDiscountLKR),
    referrerMinOrderLKR: Math.max(0, n(body.referrerMinOrderLKR)),
    referrerValidDays: Math.floor(n(body.referrerValidDays, 60)),
    qualifyingOrderLKR: Math.max(0, n(body.qualifyingOrderLKR)),
  }
  for (const [label, v, t] of [
    ['friend', s.friendRewardValue, s.friendRewardType],
    ['referrer', s.referrerRewardValue, s.referrerRewardType],
  ] as const) {
    if (v <= 0) return { error: `The ${label} reward must be more than zero.` }
    if (t === 'percent' && v > 100) return { error: `The ${label} reward can be at most 100%.` }
  }
  if (s.friendValidDays < 1 || s.referrerValidDays < 1 || s.friendValidDays > 365 || s.referrerValidDays > 365) {
    return { error: 'Coupons must be valid for between 1 and 365 days.' }
  }
  return s
}

export async function saveReferralSettings(
  admin: AdminClient,
  s: Omit<ReferralSettings, 'updatedAt' | 'updatedBy'>,
  byName: string | null,
): Promise<void> {
  const { error } = await db(admin)
    .from('referral_settings')
    .upsert({
      id: 1,
      enabled: s.enabled,
      friend_reward_type: s.friendRewardType,
      friend_reward_value: s.friendRewardValue,
      friend_max_discount_lkr: s.friendMaxDiscountLKR,
      friend_min_order_lkr: s.friendMinOrderLKR,
      friend_valid_days: s.friendValidDays,
      referrer_reward_type: s.referrerRewardType,
      referrer_reward_value: s.referrerRewardValue,
      referrer_max_discount_lkr: s.referrerMaxDiscountLKR,
      referrer_min_order_lkr: s.referrerMinOrderLKR,
      referrer_valid_days: s.referrerValidDays,
      qualifying_order_lkr: s.qualifyingOrderLKR,
      updated_at: new Date().toISOString(),
      updated_by_name: byName,
    })
  if (error) throw error
}

export function rewardLabel(type: 'percent' | 'fixed', value: number, cap: number | null): string {
  return discountLabel({ discount_type: type, discount_value: value, max_discount_lkr: cap })
}

// ---------------------------------------------------------------------------
// Codes
// ---------------------------------------------------------------------------

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function randomSuffix(len: number): string {
  const bytes = randomBytes(len)
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20)
}

export function referralLink(code: string): string {
  return `${SITE_URL}/r/${code}`
}

export async function ensureReferralCode(admin: AdminClient, userId: string): Promise<string> {
  const { data: profile } = await db(admin).from('profiles').select('referral_code, full_name').eq('id', userId).maybeSingle()
  const existing = normalizeCode(profile?.referral_code ?? '')
  if (existing.length >= 4) return existing

  const base = normalizeCode((profile?.full_name ?? '').split(' ')[0] ?? '').replace(/[^A-Z]/g, '').slice(0, 6) || 'WISH'
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = `${base}${randomSuffix(4)}`
    const { error } = await db(admin).from('profiles').update({ referral_code: code }).eq('id', userId)
    if (!error) return code
    if (error.code !== '23505') throw error
  }
  throw new Error('Could not create a referral code.')
}

async function referrerForCode(admin: AdminClient, code: string): Promise<string | null> {
  const clean = normalizeCode(code)
  if (clean.length < 4) return null
  const { data } = await db(admin).from('profiles').select('id').eq('referral_code', clean).maybeSingle()
  return data?.id ?? null
}

async function notify(admin: AdminClient, userId: string, title: string, body: string, link: string) {
  await db(admin)
    .from('notifications')
    .insert({ user_id: userId, type: 'referral', title, body, link })
    .then(({ error }: { error: { message: string } | null }) => {
      if (error) console.error('[referrals] notification failed', error.message)
    })
}

// ---------------------------------------------------------------------------
// Attach (after sign-up)
// ---------------------------------------------------------------------------

export type AttachResult =
  | { ok: true; attached: true; friendCouponLabel: string }
  | { ok: true; attached: false; reason: string }

export async function attachReferral(admin: AdminClient, userId: string, rawCode: string): Promise<AttachResult> {
  const settings = await getReferralSettings(admin)
  if (!settings.enabled) return { ok: true, attached: false, reason: 'Referrals are switched off.' }

  const referrerId = await referrerForCode(admin, rawCode)
  if (!referrerId) return { ok: true, attached: false, reason: 'Unknown referral code.' }
  if (referrerId === userId) return { ok: true, attached: false, reason: 'You can’t refer yourself.' }

  const { data: existing } = await db(admin).from('referrals').select('id').eq('referred_user_id', userId).maybeSingle()
  if (existing) return { ok: true, attached: false, reason: 'Already referred.' }

  const [{ data: me }, { data: referrer }, { count: orderCount }] = await Promise.all([
    db(admin).from('profiles').select('created_at, phone, full_name').eq('id', userId).maybeSingle(),
    db(admin).from('profiles').select('phone').eq('id', referrerId).maybeSingle(),
    db(admin).from('orders').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  ])
  if ((orderCount ?? 0) > 0) return { ok: true, attached: false, reason: 'Only new customers can use a referral link.' }
  const ageDays = me?.created_at ? (Date.now() - new Date(me.created_at).getTime()) / 86_400_000 : 0
  if (ageDays > NEW_ACCOUNT_WINDOW_DAYS) return { ok: true, attached: false, reason: 'Only new customers can use a referral link.' }
  if (me?.phone && referrer?.phone && me.phone.replace(/\D/g, '') === referrer.phone.replace(/\D/g, '')) {
    return { ok: true, attached: false, reason: 'You can’t refer yourself.' }
  }

  const { data: row, error } = await db(admin)
    .from('referrals')
    .insert({
      referrer_id: referrerId,
      referred_user_id: userId,
      referred_contact: me?.full_name ?? null,
      code: `ref-${randomSuffix(12)}`,
      status: 'joined',
      joined_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505') return { ok: true, attached: false, reason: 'Already referred.' }
    throw error
  }

  const { coupon } = await issuePersonalCoupon(
    admin,
    userId,
    {
      title: 'Welcome gift from a friend',
      description: 'Your friend invited you to Wishdrop. Enjoy this on your first order.',
      discountType: settings.friendRewardType,
      discountValue: settings.friendRewardValue,
      maxDiscountLKR: settings.friendRewardType === 'percent' ? settings.friendMaxDiscountLKR : null,
      minOrderLKR: settings.friendMinOrderLKR,
      endsAt: null,
      validDays: settings.friendValidDays,
    },
    'referral',
    'referral',
    { name: 'Referral programme' },
  )
  await db(admin).from('referrals').update({ friend_coupon_id: coupon.id }).eq('id', row.id)

  const label = discountLabel(coupon)
  await notify(admin, userId, 'A welcome gift is in your account', `${label} your first order — it’s in My coupons.`, '/account/coupons')
  return { ok: true, attached: true, friendCouponLabel: label }
}

// ---------------------------------------------------------------------------
// Reward (after the friend pays)
// ---------------------------------------------------------------------------

async function rewardReferrer(admin: AdminClient, referral: Record<string, unknown>, checkoutId: string | null, byName: string) {
  const settings = await getReferralSettings(admin)
  const { coupon } = await issuePersonalCoupon(
    admin,
    referral.referrer_id as string,
    {
      title: 'Thanks for referring a friend',
      description: 'Your friend placed their first order. Here’s your reward.',
      discountType: settings.referrerRewardType,
      discountValue: settings.referrerRewardValue,
      maxDiscountLKR: settings.referrerRewardType === 'percent' ? settings.referrerMaxDiscountLKR : null,
      minOrderLKR: settings.referrerMinOrderLKR,
      endsAt: null,
      validDays: settings.referrerValidDays,
    },
    'referral',
    'referral',
    { name: byName },
  )
  const label = discountLabel(coupon)
  await db(admin)
    .from('referrals')
    .update({
      status: 'rewarded',
      rewarded_at: new Date().toISOString(),
      referrer_coupon_id: coupon.id,
      qualifying_checkout_id: checkoutId,
      reward_label: label,
      reward_amount: coupon.discount_type === 'fixed' ? coupon.discount_value : null,
    })
    .eq('id', referral.id)
  await notify(
    admin,
    referral.referrer_id as string,
    'You earned a referral reward',
    `Your friend just placed their first order. ${label} your next order — it’s in My coupons.`,
    '/account/coupons',
  )
}

export async function onCheckoutPaid(admin: AdminClient, checkoutId: string, userId: string): Promise<void> {
  const { data: referral } = await db(admin)
    .from('referrals')
    .select('*')
    .eq('referred_user_id', userId)
    .eq('status', 'joined')
    .is('voided_at', null)
    .maybeSingle()
  if (!referral) return
  const settings = await getReferralSettings(admin)
  if (!settings.enabled) return
  const { data: checkout } = await db(admin).from('checkouts').select('total_lkr').eq('id', checkoutId).maybeSingle()
  if (!checkout || Number(checkout.total_lkr) < settings.qualifyingOrderLKR) return
  await rewardReferrer(admin, referral, checkoutId, 'Referral programme')
}

// ---------------------------------------------------------------------------
// Customer view
// ---------------------------------------------------------------------------

function maskName(name: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'A friend'
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0]
}

export async function referralsForCustomer(admin: AdminClient, userId: string) {
  const [code, settings, { data: rows }] = await Promise.all([
    ensureReferralCode(admin, userId),
    getReferralSettings(admin),
    db(admin)
      .from('referrals')
      .select('id, referred_user_id, referred_contact, status, joined_at, rewarded_at, reward_label, voided_at')
      .eq('referrer_id', userId)
      .not('referred_user_id', 'is', null)
      .order('joined_at', { ascending: false }),
  ])
  const friends = ((rows ?? []) as Record<string, string | null>[]).map((r) => ({
    id: r.id as string,
    name: maskName(r.referred_contact),
    status: r.voided_at ? 'void' : (r.status as 'joined' | 'rewarded'),
    joinedAt: r.joined_at,
    rewardedAt: r.rewarded_at,
    rewardLabel: r.reward_label,
  }))
  return {
    enabled: settings.enabled,
    code,
    link: referralLink(code),
    friendReward: rewardLabel(settings.friendRewardType, settings.friendRewardValue, settings.friendMaxDiscountLKR),
    friendMinOrderLKR: settings.friendMinOrderLKR,
    referrerReward: rewardLabel(settings.referrerRewardType, settings.referrerRewardValue, settings.referrerMaxDiscountLKR),
    qualifyingOrderLKR: settings.qualifyingOrderLKR,
    stats: {
      joined: friends.filter((f) => f.status !== 'void').length,
      rewarded: friends.filter((f) => f.status === 'rewarded').length,
    },
    friends,
  }
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export async function referralsForAdmin(admin: AdminClient) {
  const { data: rows, error } = await db(admin)
    .from('referrals')
    .select('id, referrer_id, referred_user_id, status, joined_at, rewarded_at, reward_label, voided_at, void_reason, friend_coupon_id, referrer_coupon_id, qualifying_checkout_id, created_at')
    .not('referred_user_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1000)
  if (error) throw error
  const list = (rows ?? []) as Record<string, string | null>[]
  const userIds = Array.from(new Set(list.flatMap((r) => [r.referrer_id, r.referred_user_id]).filter(Boolean))) as string[]
  const couponIds = list.flatMap((r) => [r.friend_coupon_id, r.referrer_coupon_id]).filter(Boolean) as string[]
  const checkoutIds = list.map((r) => r.qualifying_checkout_id).filter(Boolean) as string[]

  const [{ data: people }, { data: reds }, { data: orders }] = await Promise.all([
    userIds.length
      ? db(admin).from('profiles').select('id, full_name, email, referral_code').in('id', userIds)
      : Promise.resolve({ data: [] }),
    couponIds.length
      ? db(admin).from('coupon_redemptions').select('coupon_id').in('coupon_id', couponIds).eq('status', 'redeemed')
      : Promise.resolve({ data: [] }),
    checkoutIds.length
      ? db(admin).from('orders').select('checkout_id, display_id').in('checkout_id', checkoutIds)
      : Promise.resolve({ data: [] }),
  ])
  const person = new Map<string, { name: string; email: string | null; code: string | null }>()
  for (const p of people ?? []) person.set(p.id, { name: p.full_name || p.email || 'Customer', email: p.email, code: p.referral_code })
  const usedCoupons = new Set((reds ?? []).map((r: { coupon_id: string }) => r.coupon_id))
  const ordersByCheckout = new Map<string, string[]>()
  for (const o of orders ?? []) ordersByCheckout.set(o.checkout_id, [...(ordersByCheckout.get(o.checkout_id) ?? []), o.display_id])

  return list.map((r) => ({
    id: r.id as string,
    referrer: { id: r.referrer_id, ...(person.get(r.referrer_id as string) ?? { name: 'Customer', email: null, code: null }) },
    friend: { id: r.referred_user_id, ...(person.get(r.referred_user_id as string) ?? { name: 'Customer', email: null, code: null }) },
    status: r.voided_at ? 'void' : (r.status as 'joined' | 'rewarded'),
    joinedAt: r.joined_at,
    rewardedAt: r.rewarded_at,
    rewardLabel: r.reward_label,
    voidReason: r.void_reason,
    friendCouponId: r.friend_coupon_id,
    friendCouponUsed: r.friend_coupon_id ? usedCoupons.has(r.friend_coupon_id) : false,
    referrerCouponId: r.referrer_coupon_id,
    referrerCouponUsed: r.referrer_coupon_id ? usedCoupons.has(r.referrer_coupon_id) : false,
    qualifyingOrders: r.qualifying_checkout_id ? ordersByCheckout.get(r.qualifying_checkout_id) ?? [] : [],
  }))
}

export async function adminRewardReferral(admin: AdminClient, referralId: string, byName: string): Promise<{ ok: boolean; error?: string }> {
  const { data: r } = await db(admin).from('referrals').select('*').eq('id', referralId).maybeSingle()
  if (!r) return { ok: false, error: 'Referral not found.' }
  if (r.voided_at) return { ok: false, error: 'This referral was voided.' }
  if (r.status === 'rewarded') return { ok: false, error: 'Already rewarded.' }
  await rewardReferrer(admin, r, null, byName)
  return { ok: true }
}

export async function adminVoidReferral(admin: AdminClient, referralId: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  const { data: r } = await db(admin).from('referrals').select('*').eq('id', referralId).maybeSingle()
  if (!r) return { ok: false, error: 'Referral not found.' }
  const now = new Date().toISOString()
  await db(admin).from('referrals').update({ voided_at: now, void_reason: reason || 'Voided by staff' }).eq('id', referralId)
  // Withdraw reward coupons that haven't been used yet.
  for (const couponId of [r.friend_coupon_id, r.referrer_coupon_id].filter(Boolean)) {
    const { count } = await db(admin)
      .from('coupon_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('coupon_id', couponId)
      .eq('status', 'redeemed')
    if (!count) await db(admin).from('coupons').update({ status: 'archived', updated_at: now }).eq('id', couponId)
  }
  return { ok: true }
}
