// lib/coupons/server.ts
//
// SERVER-ONLY. Everything about coupons that needs the database: creating
// them, giving them to customers, checking a code at checkout, working out
// the discount, and the admin detail view.
//
// Customers never touch the coupon tables directly (they have no RLS
// policies). The browser only ever holds a signed code — see token.ts.

import 'server-only'
import type { createServiceRoleClient } from '@/lib/supabase/server'
import { mintCouponToken, verifyCouponToken } from './token'
import { defaultDesignFor, normalizeDesign, type CouponDesign } from './design'

// The coupon tables are newer than lib/supabase/types.ts, so queries go
// through an untyped view of the client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = any
export type AdminClient = ReturnType<typeof createServiceRoleClient>
export function db(admin: AdminClient): Db {
  return admin as unknown as Db
}

export type CouponAudience = 'everyone' | 'new_customers' | 'selected'
export type CouponStatus = 'active' | 'paused' | 'archived'
export type CouponSource = 'admin' | 'referral' | 'compensation' | 'migrated' | 'refund'
export type AllocationVia = 'admin' | 'claimed' | 'referral' | 'compensation' | 'migrated' | 'refund'

export type CouponRow = {
  id: string
  title: string
  description: string | null
  discount_type: 'percent' | 'fixed'
  discount_value: number
  max_discount_lkr: number | null
  min_order_lkr: number
  store_scope: 'all' | 'stores'
  store_slugs: string[]
  audience: CouponAudience
  per_user_limit: number
  total_limit: number | null
  starts_at: string
  ends_at: string | null
  status: CouponStatus
  source: CouponSource
  created_by_name: string | null
  created_at: string
  updated_at: string
  design: CouponDesign
}

const COUPON_COLUMNS =
  'id, title, description, discount_type, discount_value, max_discount_lkr, min_order_lkr, store_scope, store_slugs, audience, per_user_limit, total_limit, starts_at, ends_at, status, source, created_by_name, created_at, updated_at, design'

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function normalizeCoupon(row: Record<string, unknown>): CouponRow {
  const type = row.discount_type === 'percent' ? 'percent' : 'fixed'
  const rawDesign = row.design && typeof row.design === 'object' && Object.keys(row.design as object).length ? row.design : null
  return {
    ...(row as unknown as CouponRow),
    // Coupons nobody designed (referral rewards, QC credits, old coupons)
    // get a sensible look for their kind.
    design: rawDesign
      ? normalizeDesign(rawDesign)
      : defaultDesignFor((row.source as CouponSource) ?? 'admin', type),
    discount_value: num(row.discount_value),
    max_discount_lkr: row.max_discount_lkr == null ? null : num(row.max_discount_lkr),
    min_order_lkr: num(row.min_order_lkr),
    store_slugs: Array.isArray(row.store_slugs) ? (row.store_slugs as string[]) : [],
    per_user_limit: num(row.per_user_limit) || 1,
    total_limit: row.total_limit == null ? null : num(row.total_limit),
  }
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

const lkr = new Intl.NumberFormat('en-LK', { maximumFractionDigits: 0 })

export function discountLabel(c: Pick<CouponRow, 'discount_type' | 'discount_value' | 'max_discount_lkr'>): string {
  if (c.discount_type === 'percent') {
    const cap = c.max_discount_lkr ? ` (up to Rs. ${lkr.format(c.max_discount_lkr)})` : ''
    return `${lkr.format(c.discount_value)}% off${cap}`
  }
  return `Rs. ${lkr.format(c.discount_value)} off`
}

export function isLive(c: Pick<CouponRow, 'status' | 'starts_at' | 'ends_at'>, now = Date.now()): boolean {
  if (c.status !== 'active') return false
  if (new Date(c.starts_at).getTime() > now) return false
  if (c.ends_at && new Date(c.ends_at).getTime() < now) return false
  return true
}

// ---------------------------------------------------------------------------
// Input validation (admin create / edit)
// ---------------------------------------------------------------------------

export type CouponInput = {
  title: string
  description: string | null
  discountType: 'percent' | 'fixed'
  discountValue: number
  maxDiscountLKR: number | null
  minOrderLKR: number
  storeScope: 'all' | 'stores'
  storeSlugs: string[]
  audience: CouponAudience
  perUserLimit: number
  totalLimit: number | null
  startsAt: string
  endsAt: string | null
  design?: CouponDesign
}

function optionalPositive(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

function isoOrNull(v: unknown): string | null {
  if (typeof v !== 'string' || !v.trim()) return null
  const t = new Date(v).getTime()
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

export function validateCouponInput(body: Record<string, unknown>): CouponInput | { error: string } {
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : ''
  if (!title) return { error: 'Give the coupon a name customers will see.' }

  const discountType = body.discountType === 'percent' ? 'percent' : body.discountType === 'fixed' ? 'fixed' : null
  if (!discountType) return { error: 'Choose a percentage or a fixed amount.' }
  const discountValue = Number(body.discountValue)
  if (!Number.isFinite(discountValue) || discountValue <= 0) return { error: 'Enter a discount greater than zero.' }
  if (discountType === 'percent' && discountValue > 100) return { error: 'A percentage discount can be at most 100%.' }

  const audience = (['everyone', 'new_customers', 'selected'] as const).find((a) => a === body.audience)
  if (!audience) return { error: 'Choose who can use this coupon.' }

  const storeScope = body.storeScope === 'stores' ? 'stores' : 'all'
  const storeSlugs = Array.isArray(body.storeSlugs)
    ? Array.from(new Set((body.storeSlugs as unknown[]).filter((s): s is string => typeof s === 'string' && !!s.trim()).map((s) => s.trim()))).slice(0, 100)
    : []
  if (storeScope === 'stores' && storeSlugs.length === 0) return { error: 'Pick at least one store, or apply it to all stores.' }

  const perUserLimit = Math.floor(Number(body.perUserLimit ?? 1))
  if (!Number.isFinite(perUserLimit) || perUserLimit < 1 || perUserLimit > 100) return { error: 'Uses per customer must be between 1 and 100.' }
  const totalLimitRaw = optionalPositive(body.totalLimit)
  const totalLimit = totalLimitRaw == null ? null : Math.floor(totalLimitRaw)

  const startsAt = isoOrNull(body.startsAt) ?? new Date().toISOString()
  const endsAt = isoOrNull(body.endsAt)
  if (endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) return { error: 'The end date must be after the start date.' }

  const minOrder = Number(body.minOrderLKR ?? 0)
  return {
    title,
    description: typeof body.description === 'string' && body.description.trim() ? body.description.trim().slice(0, 300) : null,
    discountType,
    discountValue,
    maxDiscountLKR: discountType === 'percent' ? optionalPositive(body.maxDiscountLKR) : null,
    minOrderLKR: Number.isFinite(minOrder) && minOrder > 0 ? minOrder : 0,
    storeScope,
    storeSlugs: storeScope === 'stores' ? storeSlugs : [],
    audience,
    perUserLimit,
    totalLimit,
    startsAt,
    endsAt,
    design: normalizeDesign(body.design, discountType === 'percent' ? 'percent' : 'coin'),
  }
}

// ---------------------------------------------------------------------------
// Create / allocate
// ---------------------------------------------------------------------------

export type ActorInfo = { staffId?: string | null; name?: string | null }

export async function createCoupon(
  admin: AdminClient,
  input: CouponInput,
  source: CouponSource,
  actor: ActorInfo = {},
): Promise<CouponRow> {
  const { data, error } = await db(admin)
    .from('coupons')
    .insert({
      title: input.title,
      description: input.description,
      discount_type: input.discountType,
      discount_value: input.discountValue,
      max_discount_lkr: input.maxDiscountLKR,
      min_order_lkr: input.minOrderLKR,
      store_scope: input.storeScope,
      store_slugs: input.storeSlugs,
      audience: input.audience,
      per_user_limit: input.perUserLimit,
      total_limit: input.totalLimit,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      design: input.design ?? defaultDesignFor(source, input.discountType),
      source,
      created_by_staff_id: actor.staffId ?? null,
      created_by_name: actor.name ?? null,
    })
    .select(COUPON_COLUMNS)
    .single()
  if (error) throw error
  return normalizeCoupon(data)
}

export async function allocateCoupon(
  admin: AdminClient,
  couponId: string,
  userIds: string[],
  via: AllocationVia,
  actor: ActorInfo = {},
): Promise<number> {
  const unique = Array.from(new Set(userIds.filter(Boolean)))
  if (unique.length === 0) return 0
  const rows = unique.map((user_id) => ({
    coupon_id: couponId,
    user_id,
    via,
    allocated_by_staff_id: actor.staffId ?? null,
    allocated_by_name: actor.name ?? null,
  }))
  const { data, error } = await db(admin)
    .from('coupon_allocations')
    .upsert(rows, { onConflict: 'coupon_id,user_id', ignoreDuplicates: true })
    .select('id')
  if (error) throw error
  // A previously revoked allocation being given again: un-revoke it.
  await db(admin)
    .from('coupon_allocations')
    .update({ revoked_at: null })
    .eq('coupon_id', couponId)
    .in('user_id', unique)
    .not('revoked_at', 'is', null)
  return (data ?? []).length
}

/** Creates a one-customer coupon in one step (referral rewards, QC
 *  compensation). Returns the coupon and the customer's code. */
export async function issuePersonalCoupon(
  admin: AdminClient,
  userId: string,
  spec: Omit<CouponInput, 'audience' | 'perUserLimit' | 'totalLimit' | 'storeScope' | 'storeSlugs' | 'startsAt'> & {
    validDays: number
  },
  source: CouponSource,
  via: AllocationVia,
  actor: ActorInfo = {},
): Promise<{ coupon: CouponRow; token: string }> {
  const now = new Date()
  const coupon = await createCoupon(
    admin,
    {
      ...spec,
      audience: 'selected',
      perUserLimit: 1,
      totalLimit: 1,
      storeScope: 'all',
      storeSlugs: [],
      startsAt: now.toISOString(),
      endsAt: spec.endsAt ?? new Date(now.getTime() + spec.validDays * 86_400_000).toISOString(),
    },
    source,
    actor,
  )
  await allocateCoupon(admin, coupon.id, [userId], via, actor)
  return { coupon, token: mintCouponToken(coupon.id, userId) }
}

// ---------------------------------------------------------------------------
// Discount maths
// ---------------------------------------------------------------------------

export type DiscountLine = { key: string; storeSlug: string | null; priceLKR: number }

export type DiscountResult =
  | { ok: true; discountLKR: number; eligibleSubtotalLKR: number; perLine: Map<string, number> }
  | { ok: false; error: string }

/** Discount applies to product price only (never service/delivery), and
 *  only to items from the coupon's stores when it is store-limited. */
export function computeDiscount(coupon: CouponRow, lines: DiscountLine[]): DiscountResult {
  const slugs = new Set(coupon.store_slugs.map((s) => s.toLowerCase()))
  const eligible = lines.filter(
    (l) => coupon.store_scope === 'all' || (l.storeSlug != null && slugs.has(l.storeSlug.toLowerCase())),
  )
  const eligibleSubtotal = eligible.reduce((s, l) => s + l.priceLKR, 0)
  if (eligible.length === 0 || eligibleSubtotal <= 0) {
    return { ok: false, error: 'This coupon doesn’t apply to the stores in your order.' }
  }
  if (eligibleSubtotal < coupon.min_order_lkr) {
    return {
      ok: false,
      error: `This coupon needs Rs. ${lkr.format(coupon.min_order_lkr)} or more of ${
        coupon.store_scope === 'stores' ? 'eligible items' : 'items'
      } (you have Rs. ${lkr.format(eligibleSubtotal)}).`,
    }
  }
  let discount =
    coupon.discount_type === 'percent' ? Math.round((eligibleSubtotal * coupon.discount_value) / 100) : Math.round(coupon.discount_value)
  if (coupon.max_discount_lkr != null) discount = Math.min(discount, coupon.max_discount_lkr)
  discount = Math.max(0, Math.min(discount, Math.floor(eligibleSubtotal)))

  // Split across eligible lines in proportion to their price, so each
  // order (one per origin) carries its own share. Last line takes the
  // rounding remainder.
  const perLine = new Map<string, number>()
  let assigned = 0
  eligible.forEach((l, i) => {
    const share = i === eligible.length - 1 ? discount - assigned : Math.floor((discount * l.priceLKR) / eligibleSubtotal)
    perLine.set(l.key, share)
    assigned += share
  })
  return { ok: true, discountLKR: discount, eligibleSubtotalLKR: eligibleSubtotal, perLine }
}

// ---------------------------------------------------------------------------
// Checking a code for a customer
// ---------------------------------------------------------------------------

export type ResolvedCoupon = { coupon: CouponRow; allocationId: string | null }

async function hasPreviousOrders(admin: AdminClient, userId: string): Promise<boolean> {
  const { count } = await db(admin)
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .neq('stage', 'cancelled')
  return (count ?? 0) > 0
}

async function redemptionCounts(admin: AdminClient, couponId: string, userId: string) {
  const [{ count: total }, { count: mine }] = await Promise.all([
    db(admin).from('coupon_redemptions').select('id', { count: 'exact', head: true }).eq('coupon_id', couponId).eq('status', 'redeemed'),
    db(admin)
      .from('coupon_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('coupon_id', couponId)
      .eq('user_id', userId)
      .eq('status', 'redeemed'),
  ])
  return { total: total ?? 0, mine: mine ?? 0 }
}

/** Checks everything about a code except the order itself (stores,
 *  minimum spend — see computeDiscount). */
export async function resolveCouponForUser(
  admin: AdminClient,
  userId: string,
  rawToken: string,
): Promise<{ ok: true; value: ResolvedCoupon } | { ok: false; error: string }> {
  const verified = verifyCouponToken(rawToken)
  if (!verified) return { ok: false, error: 'That code isn’t valid. Copy it again from My coupons.' }
  if (verified.userId && verified.userId !== userId) {
    return { ok: false, error: 'This code belongs to another account.' }
  }

  const { data, error } = await db(admin).from('coupons').select(COUPON_COLUMNS).eq('id', verified.couponId).maybeSingle()
  if (error) throw error
  if (!data) return { ok: false, error: 'That coupon no longer exists.' }
  const coupon = normalizeCoupon(data)

  if (coupon.status === 'paused') return { ok: false, error: 'This coupon is paused right now.' }
  if (coupon.status === 'archived') return { ok: false, error: 'This coupon has ended.' }
  const now = Date.now()
  if (new Date(coupon.starts_at).getTime() > now) return { ok: false, error: 'This coupon isn’t active yet.' }
  if (coupon.ends_at && new Date(coupon.ends_at).getTime() < now) return { ok: false, error: 'This coupon has expired.' }

  const { data: alloc } = await db(admin)
    .from('coupon_allocations')
    .select('id, revoked_at')
    .eq('coupon_id', coupon.id)
    .eq('user_id', userId)
    .maybeSingle()
  if (alloc?.revoked_at) return { ok: false, error: 'This coupon was withdrawn from your account.' }

  if (coupon.audience === 'selected' && !alloc) return { ok: false, error: 'This coupon isn’t available on your account.' }
  if (coupon.audience === 'new_customers' && (await hasPreviousOrders(admin, userId))) {
    return { ok: false, error: 'This coupon is for a first order only.' }
  }

  const counts = await redemptionCounts(admin, coupon.id, userId)
  if (counts.mine >= coupon.per_user_limit) return { ok: false, error: 'You’ve already used this coupon.' }
  if (coupon.total_limit != null && counts.total >= coupon.total_limit) return { ok: false, error: 'This coupon has run out.' }

  return { ok: true, value: { coupon, allocationId: alloc?.id ?? null } }
}

/** Adds a shared (everyone / new customers) coupon to a customer's
 *  account so it shows in My coupons and is tracked as theirs. */
export async function claimCoupon(
  admin: AdminClient,
  userId: string,
  rawToken: string,
): Promise<{ ok: true; coupon: CouponRow } | { ok: false; error: string }> {
  const res = await resolveCouponForUser(admin, userId, rawToken)
  if (!res.ok) return res
  if (!res.value.allocationId) await allocateCoupon(admin, res.value.coupon.id, [userId], 'claimed')
  return { ok: true, coupon: res.value.coupon }
}

const REDEEM_ERRORS: Record<string, string> = {
  COUPON_NOT_FOUND: 'That coupon no longer exists.',
  COUPON_INACTIVE: 'This coupon isn’t active.',
  COUPON_EXPIRED: 'This coupon has expired.',
  COUPON_LIMIT: 'This coupon has just run out.',
  COUPON_USED: 'You’ve already used this coupon.',
}

/** Records a use, enforcing the limits atomically in the database. */
export async function redeemCoupon(
  admin: AdminClient,
  args: { couponId: string; userId: string; allocationId: string | null; checkoutId: string; amountLKR: number },
): Promise<{ ok: true; redemptionId: string } | { ok: false; error: string }> {
  let allocationId = args.allocationId
  if (!allocationId) {
    await allocateCoupon(admin, args.couponId, [args.userId], 'claimed')
    const { data } = await db(admin)
      .from('coupon_allocations')
      .select('id')
      .eq('coupon_id', args.couponId)
      .eq('user_id', args.userId)
      .maybeSingle()
    allocationId = data?.id ?? null
  }
  const { data, error } = await db(admin).rpc('coupon_try_redeem', {
    p_coupon: args.couponId,
    p_user: args.userId,
    p_allocation: allocationId,
    p_checkout: args.checkoutId,
    p_amount: args.amountLKR,
  })
  if (error) {
    const key = Object.keys(REDEEM_ERRORS).find((k) => error.message?.includes(k))
    if (key) return { ok: false, error: REDEEM_ERRORS[key] }
    throw error
  }
  return { ok: true, redemptionId: data as string }
}

export async function voidRedemptionsForCheckout(admin: AdminClient, checkoutId: string, reason: string): Promise<void> {
  await db(admin)
    .from('coupon_redemptions')
    .update({ status: 'voided', voided_at: new Date().toISOString(), void_reason: reason })
    .eq('checkout_id', checkoutId)
    .eq('status', 'redeemed')
}

// ---------------------------------------------------------------------------
// My coupons (customer)
// ---------------------------------------------------------------------------

export type CustomerCoupon = {
  id: string
  title: string
  discountType: 'percent' | 'fixed'
  discountValue: number
  maxDiscountLKR: number | null
  design: CouponDesign
  description: string | null
  discountLabel: string
  minOrderLKR: number
  stores: string[] | null
  endsAt: string | null
  status: 'available' | 'used' | 'expired' | 'unavailable'
  usesLeft: number
  token: string
  via: AllocationVia | 'campaign'
}

export async function listCustomerCoupons(admin: AdminClient, userId: string): Promise<CustomerCoupon[]> {
  return (await listCustomerCouponsWithRows(admin, userId)).map((x) => x.view)
}

/** Same as listCustomerCoupons, plus each coupon's full row (for working
 *  out the discount against a cart). */
export async function listCustomerCouponsWithRows(
  admin: AdminClient,
  userId: string,
): Promise<{ view: CustomerCoupon; row: CouponRow }[]> {
  const [{ data: allocs }, { data: campaigns }, { data: uses }, firstOrderDone] = await Promise.all([
    db(admin).from('coupon_allocations').select('coupon_id, via, revoked_at').eq('user_id', userId),
    db(admin)
      .from('coupons')
      .select(COUPON_COLUMNS)
      .in('audience', ['everyone', 'new_customers'])
      .eq('status', 'active'),
    db(admin).from('coupon_redemptions').select('coupon_id').eq('user_id', userId).eq('status', 'redeemed'),
    hasPreviousOrders(admin, userId),
  ])

  const allocByCoupon = new Map<string, { via: AllocationVia; revoked: boolean }>()
  for (const a of allocs ?? []) allocByCoupon.set(a.coupon_id, { via: a.via, revoked: !!a.revoked_at })

  const usedCount = new Map<string, number>()
  for (const u of uses ?? []) usedCount.set(u.coupon_id, (usedCount.get(u.coupon_id) ?? 0) + 1)

  const ids = new Set<string>([...allocByCoupon.keys()])
  const campaignRows = ((campaigns ?? []) as Record<string, unknown>[]).map(normalizeCoupon)
  for (const c of campaignRows) {
    if (c.audience === 'new_customers' && firstOrderDone && !allocByCoupon.has(c.id)) continue
    if (!isLive(c)) continue
    ids.add(c.id)
  }
  if (ids.size === 0) return []

  const { data: rows } = await db(admin).from('coupons').select(COUPON_COLUMNS).in('id', [...ids])
  const now = Date.now()
  const out: CustomerCoupon[] = []
  const rowById = new Map<string, CouponRow>()
  for (const raw of (rows ?? []) as Record<string, unknown>[]) {
    const c = normalizeCoupon(raw)
    rowById.set(c.id, c)
    const alloc = allocByCoupon.get(c.id)
    if (alloc?.revoked) continue
    if (c.status === 'archived' && !usedCount.get(c.id)) continue
    const used = usedCount.get(c.id) ?? 0
    const usesLeft = Math.max(0, c.per_user_limit - used)
    let status: CustomerCoupon['status'] = 'available'
    if (usesLeft === 0) status = 'used'
    else if (c.ends_at && new Date(c.ends_at).getTime() < now) status = 'expired'
    else if (!isLive(c, now)) status = 'unavailable'
    out.push({
      id: c.id,
      title: c.title,
      discountType: c.discount_type,
      discountValue: c.discount_value,
      maxDiscountLKR: c.max_discount_lkr,
      design: c.design,
      description: c.description,
      discountLabel: discountLabel(c),
      minOrderLKR: c.min_order_lkr,
      stores: c.store_scope === 'stores' ? c.store_slugs : null,
      endsAt: c.ends_at,
      status,
      usesLeft,
      // Always bound to this customer: sharing it doesn't help anyone else.
      token: mintCouponToken(c.id, userId),
      via: alloc?.via ?? 'campaign',
    })
  }
  const rank = { available: 0, unavailable: 1, used: 2, expired: 3 }
  out.sort((a, b) => rank[a.status] - rank[b.status] || (a.endsAt ?? '9').localeCompare(b.endsAt ?? '9'))
  return out.map((view) => ({ view, row: rowById.get(view.id)! }))
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export type AdminCouponListRow = CouponRow & {
  allocatedCount: number
  redeemedCount: number
  discountGivenLKR: number
  label: string
}

export async function listCouponsForAdmin(admin: AdminClient, opts: { includeSystem?: boolean } = {}): Promise<AdminCouponListRow[]> {
  let q = db(admin).from('coupons').select(COUPON_COLUMNS).order('created_at', { ascending: false }).limit(500)
  if (!opts.includeSystem) q = q.eq('source', 'admin')
  const { data, error } = await q
  if (error) throw error
  const coupons = ((data ?? []) as Record<string, unknown>[]).map(normalizeCoupon)
  if (coupons.length === 0) return []
  const ids = coupons.map((c) => c.id)
  const [{ data: allocs }, { data: reds }] = await Promise.all([
    db(admin).from('coupon_allocations').select('coupon_id').in('coupon_id', ids).is('revoked_at', null),
    db(admin).from('coupon_redemptions').select('coupon_id, amount_lkr').in('coupon_id', ids).eq('status', 'redeemed'),
  ])
  const allocated = new Map<string, number>()
  for (const a of allocs ?? []) allocated.set(a.coupon_id, (allocated.get(a.coupon_id) ?? 0) + 1)
  const redeemed = new Map<string, { n: number; sum: number }>()
  for (const r of reds ?? []) {
    const cur = redeemed.get(r.coupon_id) ?? { n: 0, sum: 0 }
    redeemed.set(r.coupon_id, { n: cur.n + 1, sum: cur.sum + num(r.amount_lkr) })
  }
  return coupons.map((c) => ({
    ...c,
    allocatedCount: allocated.get(c.id) ?? 0,
    redeemedCount: redeemed.get(c.id)?.n ?? 0,
    discountGivenLKR: redeemed.get(c.id)?.sum ?? 0,
    label: discountLabel(c),
  }))
}

type Person = { id: string; name: string; email: string | null }

async function peopleById(admin: AdminClient, ids: string[]): Promise<Map<string, Person>> {
  const unique = Array.from(new Set(ids.filter(Boolean)))
  const out = new Map<string, Person>()
  if (unique.length === 0) return out
  const { data } = await db(admin).from('profiles').select('id, full_name, email').in('id', unique)
  for (const p of data ?? []) out.set(p.id, { id: p.id, name: p.full_name || p.email || 'Customer', email: p.email ?? null })
  return out
}

export async function couponDetailForAdmin(admin: AdminClient, couponId: string) {
  const { data, error } = await db(admin).from('coupons').select(COUPON_COLUMNS).eq('id', couponId).maybeSingle()
  if (error) throw error
  if (!data) return null
  const coupon = normalizeCoupon(data)

  const [{ data: allocs }, { data: reds }] = await Promise.all([
    db(admin)
      .from('coupon_allocations')
      .select('id, user_id, via, allocated_at, allocated_by_name, revoked_at')
      .eq('coupon_id', couponId)
      .order('allocated_at', { ascending: false })
      .limit(1000),
    db(admin)
      .from('coupon_redemptions')
      .select('id, user_id, checkout_id, amount_lkr, status, redeemed_at, voided_at, void_reason')
      .eq('coupon_id', couponId)
      .order('redeemed_at', { ascending: false })
      .limit(1000),
  ])

  const checkoutIds = (reds ?? []).map((r: { checkout_id: string | null }) => r.checkout_id).filter(Boolean)
  const ordersByCheckout = new Map<string, string[]>()
  if (checkoutIds.length) {
    const { data: orders } = await db(admin).from('orders').select('checkout_id, display_id').in('checkout_id', checkoutIds)
    for (const o of orders ?? []) {
      const list = ordersByCheckout.get(o.checkout_id) ?? []
      list.push(o.display_id)
      ordersByCheckout.set(o.checkout_id, list)
    }
  }

  const people = await peopleById(admin, [
    ...(allocs ?? []).map((a: { user_id: string }) => a.user_id),
    ...(reds ?? []).map((r: { user_id: string }) => r.user_id),
  ])

  const usedBy = new Map<string, number>()
  for (const r of reds ?? []) if (r.status === 'redeemed') usedBy.set(r.user_id, (usedBy.get(r.user_id) ?? 0) + 1)

  return {
    coupon: { ...coupon, label: discountLabel(coupon) },
    // A shared code (not bound to anyone) admins can hand out for
    // everyone / new-customer campaigns.
    shareToken: coupon.audience === 'selected' ? null : mintCouponToken(coupon.id, null),
    allocations: (allocs ?? []).map((a: Record<string, string | null>) => ({
      id: a.id,
      userId: a.user_id,
      name: people.get(a.user_id as string)?.name ?? 'Customer',
      email: people.get(a.user_id as string)?.email ?? null,
      via: a.via,
      allocatedAt: a.allocated_at,
      allocatedBy: a.allocated_by_name,
      revokedAt: a.revoked_at,
      timesUsed: usedBy.get(a.user_id as string) ?? 0,
    })),
    redemptions: (reds ?? []).map((r: Record<string, string | number | null>) => ({
      id: r.id,
      userId: r.user_id,
      name: people.get(r.user_id as string)?.name ?? 'Customer',
      email: people.get(r.user_id as string)?.email ?? null,
      amountLKR: num(r.amount_lkr),
      status: r.status,
      redeemedAt: r.redeemed_at,
      voidedAt: r.voided_at,
      voidReason: r.void_reason,
      orders: r.checkout_id ? ordersByCheckout.get(r.checkout_id as string) ?? [] : [],
    })),
  }
}
