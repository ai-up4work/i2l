// lib/supabase/qc-issues.ts
//
// Handles a QC-flagged item once it's confirmed faulty: admin records
// what happened, whether WishDrop got a real refund from the seller for
// it, and resolves it accordingly —
//   - Seller refunded us -> customer gets a coupon worth exactly the
//     faulty item's price (never shipping/other items), redeemable on
//     their NEXT order. Reuses the real `personal_coupons` table (see
//     contexts/Loyaltycontext.tsx's grantCoupon — that function only
//     ever writes for the CURRENTLY LOGGED-IN session's own user, so
//     it's useless from an admin session; this file writes directly for
//     the target customer instead) and the real `notifications` table,
//     so both the coupon and the alert show up on the customer's
//     existing, real "My Coupons" page and notification bell with zero
//     changes needed there.
//   - Seller did NOT refund us -> ship the item as-is. WishDrop doesn't
//     eat a cost it can't recover; the customer chose that specific
//     item, not WishDrop.
// Either way, WhatsApp goes out first (same deferred-confirmation
// pattern as request chat — compose, send manually, mark sent) before
// the resolution is considered final.

import { createClient } from '@/lib/supabase/client'

export type QcIssueType = 'faulty_unit' | 'inventory_rejected' | 'customer_declined'
export type QcIssueResolution = 'pending' | 'retry_same' | 'coupon_issued' | 'shipped_as_is' | 'replacement_resolved'

export interface QcIssue {
  id: string
  orderId: string
  orderItemId: string
  userId: string
  issueType: QcIssueType
  staffNote: string | null
  customerNote: string | null
  photoUrl: string | null
  sellerRefundObtained: boolean | null
  resolution: QcIssueResolution
  personalCouponId: string | null
  whatsappSent: boolean
  whatsappSentAt: string | null
  createdBy: string | null
  resolvedAt: string | null
  createdAt: string
}

type QcIssueRow = {
  id: string
  order_id: string
  order_item_id: string
  user_id: string
  issue_type: QcIssueType
  staff_note: string | null
  customer_note: string | null
  photo_url: string | null
  seller_refund_obtained: boolean | null
  resolution: QcIssueResolution
  personal_coupon_id: string | null
  whatsapp_sent: boolean
  whatsapp_sent_at: string | null
  created_by: string | null
  resolved_at: string | null
  created_at: string
}

function mapRow(row: QcIssueRow): QcIssue {
  return {
    id: row.id,
    orderId: row.order_id,
    orderItemId: row.order_item_id,
    userId: row.user_id,
    issueType: row.issue_type,
    staffNote: row.staff_note,
    customerNote: row.customer_note,
    photoUrl: row.photo_url,
    sellerRefundObtained: row.seller_refund_obtained,
    resolution: row.resolution,
    personalCouponId: row.personal_coupon_id,
    whatsappSent: row.whatsapp_sent,
    whatsappSentAt: row.whatsapp_sent_at,
    createdBy: row.created_by,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
  }
}

const ISSUE_SELECT =
  'id, order_id, order_item_id, user_id, issue_type, staff_note, customer_note, photo_url, seller_refund_obtained, resolution, personal_coupon_id, whatsapp_sent, whatsapp_sent_at, created_by, resolved_at, created_at'

/**
 * Customer-facing fetch — deliberately a narrower shape than QcIssue:
 * never exposes staff_note (internal-only, same staff-vs-customer split
 * every other note/comms channel in this app uses) or who created it.
 * Used by the customer's order tracking page to show "why was this
 * flagged" for a specific item.
 */
export interface CustomerVisibleQcIssue {
  id: string
  orderItemId: string
  issueType: QcIssueType
  customerNote: string | null
  photoUrl: string | null
  resolution: QcIssueResolution
  sellerRefundObtained: boolean | null
  resolvedAt: string | null
  // Set once a 'retry_same' issue's replacement has actually been
  // bought again (see markReplacementPurchased below) — null means
  // "retry_same but still waiting on the Purchases queue to be
  // repurchased". This is the real, durable signal mapToPurchases
  // (AdminDataContext.tsx) needs to tell those two states apart
  // without depending on local-only client state that a realtime
  // refetch would otherwise silently clobber.
  replacementPurchasedAt: string | null
  createdAt: string
}

export async function fetchQcIssuesForItems(orderItemIds: string[]): Promise<Map<string, CustomerVisibleQcIssue>> {
  if (!orderItemIds.length) return new Map()
  const supabase = createClient()
  const { data, error } = await supabase
    .from('order_item_issues')
    .select(
      'id, order_item_id, issue_type, customer_note, photo_url, resolution, seller_refund_obtained, resolved_at, replacement_purchased_at, created_at',
    )
    .in('order_item_id', orderItemIds)
    // An item can have more than one issue row over its lifetime (a
    // second fault after a first replacement creates a fresh row rather
    // than overwriting the old one — see qc/[id]/page.tsx's save()).
    // Ascending by created_at + a plain Map means the LAST write here
    // wins per order_item_id, i.e. the most recent issue — without this
    // ordering, which one wins is whatever order Postgres happens to
    // return them in, which could silently resurface a long-resolved
    // issue instead of the current open one.
    .order('created_at', { ascending: true })
  if (error) {
    console.error('[fetchQcIssuesForItems]', error)
    return new Map()
  }
  return new Map(
    (data ?? []).map((r) => [
      r.order_item_id,
      {
        id: r.id,
        orderItemId: r.order_item_id,
        issueType: r.issue_type as QcIssueType,
        customerNote: r.customer_note,
        photoUrl: r.photo_url,
        resolution: r.resolution as QcIssueResolution,
        sellerRefundObtained: r.seller_refund_obtained,
        resolvedAt: r.resolved_at,
        replacementPurchasedAt: r.replacement_purchased_at,
        createdAt: r.created_at,
      },
    ]),
  )
}

/**
 * Real, durable write marking a 'retry_same' issue's replacement as
 * actually bought again — called from AdminDataContext's markPurchased
 * the moment an item with an open retry_same issue (and no
 * replacement_purchased_at yet) is marked purchased. This is what lets
 * mapToPurchases tell "still needs repurchasing" apart from "bought
 * again, now waiting on a fresh QC pass" across a refetch, instead of
 * relying on local-only state that a realtime refetch would silently
 * overwrite the moment anything else on the order changes.
 */
export async function markReplacementPurchased(issueId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { error } = await supabase
    .from('order_item_issues')
    .update({ replacement_purchased_at: new Date().toISOString() })
    .eq('id', issueId)
  return error ? { ok: false, error: error.message } : { ok: true }
}

/** Opens a QC issue for a flagged item — the first step, before any resolution is decided. */
export async function createQcIssue(fields: {
  orderId: string
  orderItemId: string
  userId: string
  issueType: QcIssueType
  staffNote?: string
  customerNote?: string
  photoUrl?: string
  staffId: string
}): Promise<{ ok: boolean; error?: string; issue?: QcIssue }> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('order_item_issues')
    .insert({
      order_id: fields.orderId,
      order_item_id: fields.orderItemId,
      user_id: fields.userId,
      issue_type: fields.issueType,
      staff_note: fields.staffNote ?? null,
      customer_note: fields.customerNote ?? null,
      photo_url: fields.photoUrl ?? null,
      created_by: fields.staffId,
    })
    .select(ISSUE_SELECT)
    .single()
  if (error || !data) return { ok: false, error: error?.message }
  return { ok: true, issue: mapRow(data as QcIssueRow) }
}

export async function fetchQcIssuesForOrder(orderId: string): Promise<QcIssue[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('order_item_issues')
    .select(ISSUE_SELECT)
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[fetchQcIssuesForOrder]', error)
    return []
  }
  return (data ?? []).map((r) => mapRow(r as QcIssueRow))
}

export async function fetchAllOpenQcIssues(resolutions: QcIssueResolution[] = ['pending']): Promise<QcIssue[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('order_item_issues')
    .select(ISSUE_SELECT)
    .in('resolution', resolutions)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[fetchAllOpenQcIssues]', error)
    return []
  }
  return (data ?? []).map((r) => mapRow(r as QcIssueRow))
}

/** Step 2: admin records whether WishDrop actually got money back from the seller for this item. Everything downstream depends on this. */
export async function setSellerRefundOutcome(issueId: string, obtained: boolean): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { error } = await supabase.from('order_item_issues').update({ seller_refund_obtained: obtained }).eq('id', issueId)
  return error ? { ok: false, error: error.message } : { ok: true }
}

/** Step 3 (WhatsApp confirmed first — see the page that calls this): the customer was told, and it's manually confirmed sent. Nothing below finalizes before this. */
export async function markQcIssueWhatsappSent(issueId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { error } = await supabase
    .from('order_item_issues')
    .update({ whatsapp_sent: true, whatsapp_sent_at: new Date().toISOString() })
    .eq('id', issueId)
  return error ? { ok: false, error: error.message } : { ok: true }
}

function generateCouponCode(): string {
  return `WD${Math.random().toString(36).slice(2, 8).toUpperCase()}`
}

/**
 * Resolution A: seller refunded us -> issue the customer a coupon worth
 * exactly the faulty item's price, valid on their next order. Writes a
 * real `personal_coupons` row directly (NOT via Loyaltycontext's
 * grantCoupon, which only works for the caller's own session) plus a
 * real `notifications` row, so both the customer's "My Coupons" page and
 * their notification bell pick it up with no changes needed there.
 */
export async function issueCompensationCoupon(
  issueId: string,
  userId: string,
  amountLKR: number,
  orderDisplayId: string,
): Promise<{ ok: boolean; error?: string; code?: string }> {
  const supabase = createClient()
  const code = generateCouponCode()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000) // 90 days to redeem

  const { data: coupon, error: couponError } = await supabase
    .from('personal_coupons')
    .insert({
      user_id: userId,
      code,
      title: `Compensation for ${orderDisplayId}`,
      discount_type: 'fixed',
      discount_value: amountLKR,
      min_order_value: 0,
      max_discount: null,
      scope: 'all',
      category: 'discount',
      usage_limit: 'one-time',
      expires_at: expiresAt.toISOString(),
    })
    .select('id')
    .single()
  if (couponError || !coupon) return { ok: false, error: couponError?.message }

  const { error: issueError } = await supabase
    .from('order_item_issues')
    .update({ resolution: 'coupon_issued', personal_coupon_id: coupon.id, resolved_at: now.toISOString() })
    .eq('id', issueId)
  if (issueError) return { ok: false, error: issueError.message }

  await supabase.from('notifications').insert({
    user_id: userId,
    type: 'qc_issue',
    title: 'A replacement coupon is waiting for you',
    body: `One item from order ${orderDisplayId} didn't pass quality check. We've added a Rs. ${amountLKR.toLocaleString('en-LK')} coupon (code ${code}) to your account — use it on your next order.`,
    link: '/account/coupons',
  })

  return { ok: true, code }
}

export interface QcIssueWithContext extends QcIssue {
  orderDisplayId: string
  customerName: string
  customerPhone: string | null
  itemTitle: string
  itemImage?: string
}

/** Same as fetchAllOpenQcIssues, but joined with order/item/customer info for the admin queue list — the raw QcIssue only has real uuids, not anything human-readable. */
export async function fetchOpenQcIssuesWithContext(resolutions: QcIssueResolution[] = ['pending']): Promise<QcIssueWithContext[]> {
  const supabase = createClient()
  const issues = await fetchAllOpenQcIssues(resolutions)
  if (!issues.length) return []

  const orderIds = [...new Set(issues.map((i) => i.orderId))]
  const itemIds = [...new Set(issues.map((i) => i.orderItemId))]
  const userIds = [...new Set(issues.map((i) => i.userId))]

  const [{ data: orders }, { data: items }, { data: profiles }] = await Promise.all([
    supabase.from('orders').select('id, display_id').in('id', orderIds),
    supabase.from('order_items').select('id, title, screenshot_url, product_snapshots ( image_url )').in('id', itemIds),
    supabase.from('profiles').select('id, full_name, phone').in('id', userIds),
  ])

  const displayIdByOrderId = new Map((orders ?? []).map((o) => [o.id, o.display_id]))
  // Real product photo first, then the Channel 3 screenshot (OG-fetched
  // or admin-uploaded — see requests.screenshot_url / order_items.screenshot_url),
  // same fallback chain as everywhere else that shows an item image
  // (orders-admin.ts, Ordercontexts.tsx). product_snapshots is never
  // populated for Channel 3, so without this a faulty Channel 3 item
  // showed no image at all here — just an empty placeholder block.
  const itemById = new Map(
    (items ?? []).map((it: any) => [it.id, { title: it.title, image: it.product_snapshots?.image_url ?? it.screenshot_url }]),
  )
  const nameByUserId = new Map((profiles ?? []).map((p) => [p.id, p.full_name]))
  const phoneByUserId = new Map((profiles ?? []).map((p) => [p.id, p.phone as string | null]))

  return issues.map((issue) => ({
    ...issue,
    orderDisplayId: displayIdByOrderId.get(issue.orderId) ?? issue.orderId,
    customerName: nameByUserId.get(issue.userId) ?? 'Unknown customer',
    customerPhone: phoneByUserId.get(issue.userId) ?? null,
    itemTitle: itemById.get(issue.orderItemId)?.title ?? 'Unknown item',
    itemImage: itemById.get(issue.orderItemId)?.image,
  }))
}

/** Same joined shape for a single issue's detail page. */
export async function fetchQcIssueWithContext(issueId: string): Promise<QcIssueWithContext | null> {
  const supabase = createClient()
  const { data, error } = await supabase.from('order_item_issues').select(ISSUE_SELECT).eq('id', issueId).maybeSingle()
  if (error || !data) return null
  const issue = mapRow(data as QcIssueRow)

  const [{ data: order }, { data: item }, { data: profile }] = await Promise.all([
    supabase.from('orders').select('display_id').eq('id', issue.orderId).maybeSingle(),
    supabase.from('order_items').select('title, unit_price, screenshot_url, product_snapshots ( image_url )').eq('id', issue.orderItemId).maybeSingle(),
    supabase.from('profiles').select('full_name, phone').eq('id', issue.userId).maybeSingle(),
  ])

  return {
    ...issue,
    orderDisplayId: order?.display_id ?? issue.orderId,
    customerName: profile?.full_name ?? 'Unknown customer',
    customerPhone: profile?.phone ?? null,
    itemTitle: (item as any)?.title ?? 'Unknown item',
    // Same fallback chain fix as fetchOpenQcIssuesWithContext above —
    // this was only ever checking product_snapshots.image_url, which is
    // always empty for Channel 3, so a faulty Channel 3 item rendered as
    // a blank placeholder block instead of its actual (OG-scraped or
    // admin-uploaded) photo.
    itemImage: (item as any)?.product_snapshots?.image_url ?? (item as any)?.screenshot_url,
  }
}

/** The faulty item's own price — what a compensation coupon should be worth, per the "product value only, never shipping" rule. */
export async function fetchOrderItemPrice(orderItemId: string): Promise<number | null> {
  const supabase = createClient()
  const { data } = await supabase.from('order_items').select('unit_price').eq('id', orderItemId).maybeSingle()
  return data?.unit_price ?? null
}

/**
 * Resolution B: seller didn't refund us -> ship the faulty item as-is.
 * No coupon (WishDrop can't absorb a cost it didn't recover), but the
 * customer is still notified, so they aren't surprised by what arrives.
 */
export async function resolveShippedAsIs(
  issueId: string,
  userId: string,
  orderDisplayId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { error: issueError } = await supabase
    .from('order_item_issues')
    .update({ resolution: 'shipped_as_is', resolved_at: new Date().toISOString() })
    .eq('id', issueId)
  if (issueError) return { ok: false, error: issueError.message }

  await supabase.from('notifications').insert({
    user_id: userId,
    type: 'qc_issue',
    title: 'An item from your order has a quality note',
    body: `One item from order ${orderDisplayId} had a quality issue we flagged during inspection. We weren't able to get a replacement or refund from the seller for it, so it's shipping as originally sourced.`,
    link: `/account/orders`,
  })

  return { ok: true }
}

/** Resolution C: same item, retried — seller's stock was fine, this one unit was bad. No coupon, no as-is shipment; just a heads-up that it'll take a bit longer. */
export async function resolveRetrySame(
  issueId: string,
  userId: string,
  orderDisplayId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { error: issueError } = await supabase
    .from('order_item_issues')
    .update({ resolution: 'retry_same', resolved_at: new Date().toISOString() })
    .eq('id', issueId)
  if (issueError) return { ok: false, error: issueError.message }

  await supabase.from('notifications').insert({
    user_id: userId,
    type: 'qc_issue',
    title: 'Getting you a replacement unit',
    body: `An item from order ${orderDisplayId} didn't pass quality check, so we're sourcing a fresh unit from the same seller. This may add a short delay — no action needed from you.`,
    link: `/account/orders`,
  })

  return { ok: true }
}

/**
 * Closes out a 'retry_same' issue once its replacement unit has
 * actually passed a fresh QC inspection — called from
 * /admin/qc/[id]/page.tsx's save() the moment a "passed" verdict is
 * recorded for an item that has an open retry_same issue on file.
 *
 * This is the real, durable signal the customer-facing pages need:
 * QcIssueBanner stops rendering for an item once its issue reads
 * 'replacement_resolved' (see OrdersHubPage.tsx / track/page.tsx), so
 * the customer stops seeing "there was an issue with this item" once
 * it's actually been made right — without this, that banner would
 * otherwise show forever, since resolveRetrySame's resolution value
 * never changes again on its own.
 *
 * Deliberately does NOT delete or otherwise erase the row — ops still
 * needs this for analytics (see the QC Issues page's "Resolved"
 * history section) and it's the only record that a fault happened on
 * this order/item at all.
 */
export async function closeRetryIssue(issueId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { error } = await supabase
    .from('order_item_issues')
    .update({ resolution: 'replacement_resolved', resolved_at: new Date().toISOString() })
    .eq('id', issueId)
  return error ? { ok: false, error: error.message } : { ok: true }
}