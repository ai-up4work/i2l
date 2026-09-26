// lib/supabase/orders-admin.ts
//
// Single real data layer for every admin page that touches an order:
// /admin/orders(+detail), /admin/qc(+detail), /admin/pack-label(+detail),
// /admin/export-bin, /admin/in-transit, /admin/shipped,
// /admin/warehouse-dashboard, /admin/purchases(+detail), /admin/sales-dashboard.
//
// STAGE VOCABULARY — CORRECTED: `orders.stage` is a real Postgres enum
// (see data/Wishdrop-supabase-schema.sql, `order_stage`), not a free-text
// column. It has exactly 5 values: 'ordered', 'quality_check', 'shipped',
// 'delivered', 'cancelled'. An earlier version of this file invented a
// richer 7-value vocabulary ('qc_passed', 'packed', 'in_transit' as
// separate enum values) that the database rejects outright
// (Postgres error 22P02 — invalid input value for enum order_stage).
// DbOrderStage below matches the real enum exactly; never write anything
// else to `orders.stage` or `order_stage_history.stage` (same enum type).
//
// WAREHOUSE SUB-QUEUES: the route spec calls for 5 separate warehouse
// pages (QC / Pack & Label / Export Bin / In-Transit / Shipped), but the
// real schema only tracks the coarse 4-stage customer pipeline — there's
// no column for "passed QC but not yet packed" vs "packed, staged for
// export" vs "in international transit". Rather than invent schema that
// doesn't exist, that finer position is tracked as a marker inside
// `order_internal_notes` (real rows, just not a typed column — same
// pattern already used for package weight/dimensions/label ref, which
// also have no dedicated columns):
//   stage='quality_check' + substage='qc_pending' (default) → QC queue
//   stage='quality_check' + substage='qc_passed'            → Pack & Label queue
//   stage='quality_check' + substage='packed'                → Export Bin queue
//   stage='quality_check' + substage='in_transit'             → In-Transit queue
//   stage='shipped'                                            → Shipped queue
// "Shipped" specifically means arrived at the Sri Lanka warehouse, not
// merely packed for export — see markShippedReal, called from the
// In-Transit page once an order actually reaches Sri Lanka. Only two
// transitions are REAL enum changes on `orders.stage` (In-Transit's
// "Mark shipped" flips 'quality_check' -> 'shipped'; Shipped's "Mark
// delivered" flips 'shipped' -> 'delivered'). Every other queue move (QC
// pass, mark packed, mark picked up) only writes a substage note and
// leaves the real enum column untouched — see setWarehouseSubstage() vs
// setOrderStage() below; never call setOrderStage() with anything other
// than a real DbOrderStage.
//
// RLS NOTE: `public.orders`/`public.order_items` have a real RLS policy
// restricting SELECT to `auth.uid() = user_id` — i.e. a customer can only
// see their own rows. Staff/admin tables (`sites`, `staff_accounts`, etc.)
// intentionally have NO client-facing RLS policy at all per the schema's
// own comment: "access them only through server-side routes using the
// Supabase service role key". This file currently queries everything
// through the browser/anon client for consistency with this repo's other
// real-data admin page (app/admin/(sales)/catalogues), which is fine for
// tables with no RLS, but an admin/staff session will NOT be able to see
// other customers' `orders`/`order_items` rows until either (a) these
// queries move behind a service-role server route, or (b) an RLS policy
// is added that recognizes staff accounts. Flag before shipping this for
// real — right now it likely only "works" in an environment where RLS
// isn't strictly enforced yet.

import { createClient } from '@/lib/supabase/client'
import type { OrderStatus } from '@/contexts/Ordercontexts'

/* ============================================================
 * STAGE VOCABULARY — matches the real `order_stage` Postgres enum exactly
 * ============================================================ */

export type DbOrderStage = 'ordered' | 'quality_check' | 'shipped' | 'delivered' | 'cancelled'

/** Linear pipeline order for the stepper UI — 'cancelled' is a side-branch, not a stepper position. */
export const STAGE_ORDER: DbOrderStage[] = ['ordered', 'quality_check', 'shipped', 'delivered']

export const STAGE_LABEL: Record<DbOrderStage, string> = {
  ordered: 'Ordered',
  quality_check: 'Quality Check',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

export const STAGE_AGE_THRESHOLD_HOURS: Record<DbOrderStage, number> = {
  ordered: 24,
  quality_check: 96, // now covers QC + pack + export-bin + international transit combined — see getAdminQueue's doc comment
  shipped: 48, // arrived at the SL warehouse, awaiting local delivery only
  delivered: Infinity,
  cancelled: Infinity,
}

/**
 * Buckets a real `orders.stage` value into the 4-value customer-facing
 * status (Processing / Quality Check / Shipped / Delivered). This is the
 * function contexts/Ordercontexts.tsx imports — do not fork a second copy
 * of this logic there or the two sides of the app can disagree.
 */
export function mapStageToCustomerStatus(stage: string): OrderStatus {
  const s = stage.toLowerCase()
  if (s === 'ordered') return 'Processing'
  if (s === 'quality_check') return 'Quality Check'
  if (s === 'shipped') return 'Shipped'
  if (s === 'delivered') return 'Delivered'
  if (s === 'cancelled') return 'Cancelled'
  return (stage.charAt(0).toUpperCase() + stage.slice(1).replace(/_/g, ' ')) as OrderStatus
}

export function isKnownStage(stage: string): stage is DbOrderStage {
  return (['ordered', 'quality_check', 'shipped', 'delivered', 'cancelled'] as string[]).includes(stage)
}

/* ============================================================
 * WAREHOUSE SUB-QUEUES — tracked via order_internal_notes, not the enum
 * ============================================================ */

export type WarehouseSubstage = 'qc_pending' | 'qc_passed' | 'packed' | 'in_transit'

export const SUBSTAGE_LABEL: Record<WarehouseSubstage, string> = {
  qc_pending: 'Awaiting QC',
  qc_passed: 'QC Passed',
  packed: 'Packed',
  in_transit: 'In Transit',
}

export type AdminQueue = 'qc' | 'pack-label' | 'export-bin' | 'in-transit' | 'shipped' | null

/**
 * Which admin queue page an order currently belongs in, given its real
 * stage + tracked substage.
 *
 * IMPORTANT SEMANTICS: `orders.stage = 'shipped'` now specifically means
 * "arrived at the Sri Lanka warehouse" — not "packed for export" the way
 * an earlier version of this file had it (matching packOrderReal
 * flipping the enum immediately at pack time). Packing, staging for
 * export, and international transit are now all sub-phases WITHIN
 * 'quality_check' (via substage), and the real enum only advances to
 * 'shipped' once markShippedReal is called from the In-Transit page —
 * i.e. once the order has actually reached Sri Lanka. From there, the
 * only remaining step is local delivery, which doesn't need its own
 * tracked sub-phase (courier/post/etc. — however it happens locally
 * isn't tracked in detail); Shipped -> Delivered is a single real
 * transition, same as before.
 */
export function getAdminQueue(stage: string, substage: WarehouseSubstage | null): AdminQueue {
  if (stage === 'quality_check') {
    if (substage === 'in_transit') return 'in-transit'
    if (substage === 'packed') return 'export-bin'
    if (substage === 'qc_passed') return 'pack-label'
    return 'qc' // qc_pending, or no marker yet (freshly entered QC)
  }
  if (stage === 'shipped') return 'shipped' // arrived at the SL warehouse, awaiting local delivery
  return null
}

const SUBSTAGE_NOTE_PREFIX = '[substage] '

/** Writes a substage marker as an internal note. Never touches orders.stage — see file header.
 *  staffId must be a real staff_accounts.id — order_internal_notes.staff_id is NOT NULL + FK'd. */
export async function setWarehouseSubstage(
  orderId: string,
  substage: WarehouseSubstage,
  staffId: string,
  note?: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const text = `${SUBSTAGE_NOTE_PREFIX}${substage}${note ? ` — ${note}` : ''}`
  const { error } = await supabase.from('order_internal_notes').insert({ order_id: orderId, staff_id: staffId, text })
  return error ? { ok: false, error: error.message } : { ok: true }
}

/**
 * Real, per-item QC-passed write — the fix for a genuine bug where
 * passing ONE item flipped the whole order's substage to 'qc_passed'
 * (setWarehouseSubstage above is order-wide, by design, for the
 * later packed/in_transit markers), which silently made every OTHER
 * item on that order read as "passed" too — including ones nobody had
 * actually inspected yet. See data/Wishdrop-qc-per-item-pass.sql.
 *
 * Deliberately does NOT call setWarehouseSubstage itself — the caller
 * (AdminDataContext.tsx's submitQcResult) checks whether every item on
 * the order now has qc_passed_at set, and only advances the order-wide
 * substage once that's actually true, so 'qc_passed' keeps meaning
 * "every item on this order has been individually verified" rather than
 * "at least one has."
 */
export async function markItemQcPassed(orderItemId: string, note?: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { error } = await supabase
    .from('order_items')
    .update({ qc_passed_at: new Date().toISOString(), qc_note: note?.trim() || null })
    .eq('id', orderItemId)
  return error ? { ok: false, error: error.message } : { ok: true }
}

function parseSubstageFromNoteText(text: string): WarehouseSubstage | null {
  if (!text.startsWith(SUBSTAGE_NOTE_PREFIX)) return null
  const rest = text.slice(SUBSTAGE_NOTE_PREFIX.length)
  const token = rest.split(' — ')[0].trim() as WarehouseSubstage
  return (['qc_pending', 'qc_passed', 'packed', 'in_transit'] as string[]).includes(token) ? token : null
}

interface SubstageEntry {
  substage: WarehouseSubstage
  at: string
}

/** Latest substage marker (+ when it was set) per order id, for a batch of orders — one query, reduced client-side. */
async function fetchLatestSubstages(orderIds: string[]): Promise<Map<string, SubstageEntry>> {
  if (!orderIds.length) return new Map()
  const supabase = createClient()
  const { data, error } = await supabase
    .from('order_internal_notes')
    .select('order_id, text, created_at')
    .in('order_id', orderIds)
    .like('text', `${SUBSTAGE_NOTE_PREFIX}%`)
    .order('created_at', { ascending: true }) // ascending so the last write in the loop below wins (= latest)
  if (error) {
    console.error('[fetchLatestSubstages]', error)
    return new Map()
  }
  const latest = new Map<string, SubstageEntry>()
  for (const row of data ?? []) {
    const substage = parseSubstageFromNoteText(row.text)
    if (substage) latest.set(row.order_id, { substage, at: row.created_at })
  }
  return latest
}

/* ============================================================
 * CHANNEL
 * ============================================================ */

export type Channel = 1 | 2 | 3

export const CHANNEL_LABEL: Record<Channel, string> = {
  1: 'Affiliated store',
  2: 'Scraped link',
  3: 'Manual request',
}

/* ============================================================
 * TYPES
 * ============================================================ */

export interface AdminOrderItem {
  id: string
  title: string
  variant?: string
  quantity: number
  unitPrice: number
  image: string
  sellerName?: string
  sellerType?: string
  storeUrl?: string
  requestLink?: string
  screenshotUrl?: string
  /** Real, per-item QC-passed timestamp — see markItemQcPassed below. */
  qcPassedAt?: string
}

export interface StageHistoryEvent {
  id: string
  stage: string
  at: string
  byStaffId: string | null
  byStaffName?: string
  note: string | null
}

export interface InternalNote {
  id: string
  text: string
  staffId: string
  staffName?: string
  at: string
}

export interface AdminOrder {
  id: string // DB uuid — use for updates/joins
  displayId: string // e.g. "WD-238491" — use for URLs/display
  customerId: string
  customerName: string
  customerEmail: string
  channel: Channel
  stage: DbOrderStage
  substage: WarehouseSubstage | null
  /** When the current substage marker was set — needed to derive packedAt/pickedUpAt-equivalent timestamps now that packing/transit no longer flip the real enum (see getAdminQueue's doc comment). */
  substageAt: string | null
  siteId: string | null
  siteName?: string
  currency: string
  totalValue: number
  delayed: boolean
  /** Manual staff-set hold, keeping a packed order back from courier
   * pickup on purpose — e.g. waiting on a sibling order from the same
   * customer/address so both go out in one pickup. Toggled from Export
   * bin; has no effect before an order reaches that queue. */
  exportHold: boolean
  carrier?: string
  trackingNumber?: string
  estimatedDelivery?: string
  deliveredConfirmedBy: 'warehouse' | 'customer' | null
  createdAt: string
  stageEnteredAt: string
  requestId: string | null
  chatThreadId: string | null
  /** True when the last message tagged to THIS order was from the
   * customer with no ops reply after it — see
   * data/Wishdrop-orders-requests-unreplied-flag.sql. Powers the
   * attention indicator on the orders queue and this order's own page. */
  hasUnrepliedMessage: boolean
  recipient?: { id: string; name: string; addressLine1: string; addressLine2?: string; city: string; country: string }
  items: AdminOrderItem[]
}

/* ============================================================
 * ROW MAPPING
 * ============================================================ */

// No dedicated fallback-image field on product_snapshots — mirrors the
// same placeholder contexts/Ordercontexts.tsx falls back to, so an item
// with no captured photo still shows *something* here instead of a blank
// box. Swap for a real Wishdrop-branded placeholder asset when there is one.
const FALLBACK_ITEM_IMAGE = 'https://loremflickr.com/200/200/package?lock=0'

type OrderRow = {
  id: string
  display_id: string
  user_id: string
  channel: 1 | 2 | 3
  stage: DbOrderStage
  currency: string
  total_value: number
  delayed: boolean
  export_hold: boolean
  site_id: string | null
  request_id: string | null
  chat_thread_id: string | null
  carrier: string | null
  tracking_number: string | null
  estimated_delivery: string | null
  delivered_confirmed_by: 'warehouse' | 'customer' | null
  created_at: string
  stage_entered_at: string
  has_unreplied_message: boolean
  order_items: {
    id: string
    title: string
    variant_label: string | null
    quantity: number
    unit_price: number
    seller_name: string | null
    seller_type: string | null
    store_url: string | null
    request_link: string | null
    screenshot_url: string | null
    // Real, per-item QC-passed signal — see
    // data/Wishdrop-qc-per-item-pass.sql for the bug this fixes
    // (marking ONE item passed used to flip the whole ORDER's substage
    // to 'qc_passed', silently marking every sibling item as passed too,
    // inspected or not).
    qc_passed_at: string | null
    qc_note: string | null
    product_image_url: string | null
    product_snapshots: { image_url: string | null } | null
  }[]
  addresses: { id: string; recipient_name: string; address_line1: string; address_line2: string | null; city: string; country: string } | null
}

function mapRowToAdminOrder(
  row: OrderRow,
  profileByUserId: Map<string, { full_name: string; email: string }>,
  siteById: Map<string, string>,
  substageByOrderId: Map<string, SubstageEntry>,
): AdminOrder {
  const profile = profileByUserId.get(row.user_id)
  return {
    id: row.id,
    displayId: row.display_id,
    customerId: row.user_id,
    customerName: profile?.full_name ?? 'Unknown customer',
    customerEmail: profile?.email ?? '',
    channel: row.channel,
    stage: row.stage,
    substage: substageByOrderId.get(row.id)?.substage ?? null,
    substageAt: substageByOrderId.get(row.id)?.at ?? null,
    siteId: row.site_id,
    siteName: row.site_id ? siteById.get(row.site_id) : undefined,
    currency: row.currency,
    totalValue: row.total_value,
    delayed: row.delayed,
    exportHold: row.export_hold,
    carrier: row.carrier ?? undefined,
    trackingNumber: row.tracking_number ?? undefined,
    estimatedDelivery: row.estimated_delivery ?? undefined,
    deliveredConfirmedBy: row.delivered_confirmed_by,
    createdAt: row.created_at,
    stageEnteredAt: row.stage_entered_at,
    requestId: row.request_id,
    chatThreadId: row.chat_thread_id,
    hasUnrepliedMessage: row.has_unreplied_message,
    recipient: row.addresses
      ? {
          id: row.addresses.id,
          name: row.addresses.recipient_name,
          addressLine1: row.addresses.address_line1,
          addressLine2: row.addresses.address_line2 ?? undefined,
          city: row.addresses.city,
          country: row.addresses.country,
        }
      : undefined,
    items: row.order_items.map((it) => ({
      id: it.id,
      title: it.title,
      variant: it.variant_label ?? undefined,
      quantity: it.quantity,
      unitPrice: it.unit_price,
      // Same fallback-chain fix as the customer-facing OrdersProvider
      // (contexts/Ordercontexts.tsx) — screenshot_url was already being
      // read into screenshotUrl below for the admin item-detail panel,
      // but the actual .image field (used for every thumbnail — admin
      // order list, order detail header stack, etc.) skipped straight
      // past it to the hardcoded placeholder, since product_snapshots
      // is never populated for Channel 3. product_image_url (the
      // admin's own manually-entered photo — see
      // Wishdrop-requests-manual-product-details.sql) now sits ahead of
      // the customer's raw screenshot in this chain: a curated product
      // photo the admin picked is a better "real image" for the order
      // to show than whatever the customer happened to screenshot.
      image: it.product_snapshots?.image_url ?? it.product_image_url ?? it.screenshot_url ?? FALLBACK_ITEM_IMAGE,
      sellerName: it.seller_name ?? undefined,
      sellerType: it.seller_type ?? undefined,
      storeUrl: it.store_url ?? undefined,
      requestLink: it.request_link ?? undefined,
      screenshotUrl: it.screenshot_url ?? undefined,
      qcPassedAt: it.qc_passed_at ?? undefined,
    })),
  }
}

const ORDER_SELECT = `id, display_id, user_id, channel, stage, currency, total_value, delayed, export_hold, site_id,
  request_id, chat_thread_id, carrier, tracking_number, estimated_delivery, delivered_confirmed_by,
  created_at, stage_entered_at, has_unreplied_message,
  order_items ( id, title, variant_label, quantity, unit_price, seller_name, seller_type, store_url, request_link, screenshot_url, qc_passed_at, qc_note, product_image_url, product_snapshots ( image_url ) ),
  addresses ( id, recipient_name, address_line1, address_line2, city, country )`

/**
 * Resolves customer name/email, site name, and substage markers for a
 * batch of orders in a few extra queries (rather than assuming a
 * PostgREST embed relationship that may not be declared on
 * `orders.user_id`/`orders.site_id` in the live DB).
 */
async function hydrateLookups(rows: OrderRow[]) {
  const supabase = createClient()
  const userIds = [...new Set(rows.map((r) => r.user_id))]
  const siteIds = [...new Set(rows.map((r) => r.site_id).filter((id): id is string => !!id))]
  const orderIds = rows.map((r) => r.id)

  const [{ data: profiles }, { data: sites }, substageByOrderId] = await Promise.all([
    userIds.length
      ? supabase.from('profiles').select('id, full_name, email').in('id', userIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string; email: string }[] }),
    siteIds.length
      ? supabase.from('sites').select('id, name').in('id', siteIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    fetchLatestSubstages(orderIds),
  ])

  const profileByUserId = new Map((profiles ?? []).map((p) => [p.id, { full_name: p.full_name, email: p.email }]))
  const siteById = new Map((sites ?? []).map((s) => [s.id, s.name]))
  return { profileByUserId, siteById, substageByOrderId }
}

/* ============================================================
 * FETCHERS
 * ============================================================ */

export interface FetchOrdersOptions {
  siteId?: string
  /** Real `orders.stage` enum values only — see DbOrderStage. */
  stages?: DbOrderStage[]
}

/** Every order across every customer — the `/admin/orders` queue and the base every other queue filters from. */
export async function fetchAdminOrders(opts: FetchOrdersOptions = {}): Promise<AdminOrder[]> {
  const supabase = createClient()
  let query = supabase.from('orders').select(ORDER_SELECT).order('created_at', { ascending: false })
  if (opts.siteId) query = query.eq('site_id', opts.siteId)
  if (opts.stages?.length) query = query.in('stage', opts.stages)

  const { data, error } = await query
  if (error) {
    console.error('[fetchAdminOrders]', error)
    return []
  }
  const rows = (data ?? []) as unknown as OrderRow[]
  const { profileByUserId, siteById, substageByOrderId } = await hydrateLookups(rows)
  return rows.map((r) => mapRowToAdminOrder(r, profileByUserId, siteById, substageByOrderId))
}

/**
 * Orders currently sitting in one specific warehouse queue (QC / Pack &
 * Label / Export Bin / In-Transit / Shipped). Fetches the real stage(s)
 * that could contain this queue, then filters by the tracked substage
 * client-side, since substage isn't a real column to filter on server-side.
 */
export async function fetchOrdersByQueue(queue: Exclude<AdminQueue, null>, siteId?: string): Promise<AdminOrder[]> {
  const stages: DbOrderStage[] = queue === 'shipped' ? ['shipped'] : ['quality_check']
  const candidates = await fetchAdminOrders({ siteId, stages })
  return candidates.filter((o) => getAdminQueue(o.stage, o.substage) === queue)
}

/** Resolves the real customer user_id + order uuid from a display_id — needed wherever a feature (like QC-issue resolution) has to write a row for "this order's customer" but only has the display_id the UI works with. */
export async function fetchOrderIdentity(displayId: string): Promise<{ orderId: string; userId: string } | null> {
  const supabase = createClient()
  const { data, error } = await supabase.from('orders').select('id, user_id').eq('display_id', displayId).maybeSingle()
  if (error || !data) return null
  return { orderId: data.id, userId: data.user_id }
}

/** One order by its `display_id` (the human-facing "WD-..." id used in every admin URL). */
export async function fetchAdminOrder(displayId: string): Promise<AdminOrder | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('display_id', displayId)
    .maybeSingle()
  if (error || !data) {
    if (error) console.error('[fetchAdminOrder]', error)
    return null
  }
  const row = data as unknown as OrderRow
  const { profileByUserId, siteById, substageByOrderId } = await hydrateLookups([row])
  return mapRowToAdminOrder(row, profileByUserId, siteById, substageByOrderId)
}

export async function fetchOrderStageHistory(orderId: string): Promise<StageHistoryEvent[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('order_stage_history')
    .select('id, stage, by_staff_id, note, created_at')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })
  if (error) {
    console.error('[fetchOrderStageHistory]', error)
    return []
  }
  const rows = data ?? []
  const staffIds = [...new Set(rows.map((r) => r.by_staff_id).filter((id): id is string => !!id))]
  const staffById = await fetchStaffNamesByIds(staffIds)
  return rows.map((r) => ({
    id: r.id,
    stage: r.stage,
    at: r.created_at,
    byStaffId: r.by_staff_id,
    byStaffName: r.by_staff_id ? staffById.get(r.by_staff_id) : undefined,
    note: r.note,
  }))
}

const PACKAGE_NOTE_PREFIX = '[package] '

/** Internal notes for display — excludes the substage/package markers, which have their own dedicated readers below. */
export async function fetchOrderInternalNotes(orderId: string): Promise<InternalNote[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('order_internal_notes')
    .select('id, text, staff_id, created_at')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[fetchOrderInternalNotes]', error)
    return []
  }
  const rows = (data ?? []).filter((r) => !r.text.startsWith(PACKAGE_NOTE_PREFIX) && !r.text.startsWith(SUBSTAGE_NOTE_PREFIX))
  const staffIds = [...new Set(rows.map((r) => r.staff_id).filter(Boolean))]
  const staffById = await fetchStaffNamesByIds(staffIds)
  return rows.map((r) => ({
    id: r.id,
    text: r.text,
    staffId: r.staff_id,
    staffName: staffById.get(r.staff_id),
    at: r.created_at,
  }))
}

async function fetchStaffNamesByIds(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map()
  const supabase = createClient()
  const { data } = await supabase.from('staff_accounts').select('id, name').in('id', ids)
  return new Map((data ?? []).map((s) => [s.id, s.name]))
}

export async function fetchSites(): Promise<{ id: string; name: string; location: string; active: boolean }[]> {
  const supabase = createClient()
  const { data, error } = await supabase.from('sites').select('id, name, location, active').order('name')
  if (error) {
    console.error('[fetchSites]', error)
    return []
  }
  return data ?? []
}

/* ============================================================
 * MUTATORS — real orders.stage transitions
 * ============================================================ */

/**
 * Changes `orders.stage` to a REAL enum value: updates `orders.stage` +
 * `stage_entered_at`, and logs the transition to `order_stage_history` so
 * the detail page's timeline is real. Only pass a genuine DbOrderStage —
 * this column is a strict Postgres enum and rejects anything else.
 */
export async function setOrderStage(
  orderId: string,
  stage: DbOrderStage,
  staffId: string | null,
  note?: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const now = new Date().toISOString()

  const { error: updateError } = await supabase
    .from('orders')
    .update({ stage, stage_entered_at: now })
    .eq('id', orderId)
  if (updateError) return { ok: false, error: updateError.message }

  const { error: historyError } = await supabase
    .from('order_stage_history')
    .insert({ order_id: orderId, stage, by_staff_id: staffId, note: note ?? null, created_at: now })
  if (historyError) return { ok: false, error: historyError.message }

  return { ok: true }
}

/** Pack & Label "Mark packed": purely a substage marker now — see getAdminQueue's doc comment for why this no longer touches orders.stage. */
export async function packOrderReal(orderId: string, staffId: string): Promise<{ ok: boolean; error?: string }> {
  return setWarehouseSubstage(orderId, 'packed', staffId, 'Packed & labeled')
}

/** In-Transit "Mark shipped": the real enum change ('quality_check' -> 'shipped') — this is what "Shipped" now means: arrived at the Sri Lanka warehouse, not merely packed for export. */
export async function markShippedReal(orderId: string, staffId: string): Promise<{ ok: boolean; error?: string }> {
  return setOrderStage(orderId, 'shipped', staffId, 'Arrived at the Sri Lanka warehouse')
}

export async function setOrderDelayed(orderId: string, delayed: boolean): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { error } = await supabase.from('orders').update({ delayed }).eq('id', orderId)
  return error ? { ok: false, error: error.message } : { ok: true }
}

/** Manual "I've handled this, no in-app reply needed" dismiss — for when
 * an admin resolves something over a phone call or WhatsApp instead of
 * through the chat panel. sendChatMessage (lib/supabase/chat.ts) is the
 * normal way this flag clears (a real tagged reply going out); this is
 * the escape hatch for when that never happens. Deliberately one-way
 * here — there's no "mark unreplied" action; the flag only ever gets
 * set back to true by a genuine new customer message. */
export async function clearOrderUnrepliedFlag(orderId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { error } = await supabase.from('orders').update({ has_unreplied_message: false }).eq('id', orderId)
  return error ? { ok: false, error: error.message } : { ok: true }
}

/** Export bin "Hold"/"Release" — see orders.export_hold's own column
 * comment in the schema for why this stays a plain reversible boolean
 * (same shape as setOrderDelayed above) rather than a one-way timestamp
 * field like packedAt/pickedUpAt. */
export async function setOrderExportHold(orderId: string, exportHold: boolean): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { error } = await supabase.from('orders').update({ export_hold: exportHold }).eq('id', orderId)
  return error ? { ok: false, error: error.message } : { ok: true }
}

export async function reassignOrderSite(orderId: string, siteId: string, staffId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  // Reassigning mid-QC restarts QC at the new site by default (route spec note).
  const { data: order } = await supabase.from('orders').select('stage').eq('id', orderId).maybeSingle()
  const restartsQc = order?.stage === 'quality_check'
  // Built as a concretely-typed variable rather than an inline
  // `{ site_id: siteId, ...(cond ? {...} : {}) }` spread — Supabase's
  // generic .update<T>() infers T from a conditional spread as a union
  // of the two possible shapes, and its excess-property-check helper
  // distributes over that union in a way that collapses shared fields
  // like site_id to `never`. A single concrete object type sidesteps it.
  const payload: { site_id: string; stage_entered_at?: string } = { site_id: siteId }
  if (restartsQc) payload.stage_entered_at = new Date().toISOString()
  const { error } = await supabase.from('orders').update(payload).eq('id', orderId)
  if (error) return { ok: false, error: error.message }
  if (restartsQc) await setWarehouseSubstage(orderId, 'qc_pending', staffId, 'Restarted — reassigned to a new site')
  return { ok: true }
}

export async function addInternalNote(
  orderId: string,
  staffId: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { error } = await supabase.from('order_internal_notes').insert({ order_id: orderId, staff_id: staffId, text })
  return error ? { ok: false, error: error.message } : { ok: true }
}

/**
 * Records pack/ship execution details that have no dedicated column yet
 * (see file header) as a structured internal note, and returns the parsed
 * values back out via fetchOrderPackageDetails() so the UI can treat it
 * like a real field. Swap this pair for real columns if/when added.
 */
export async function setOrderPackageDetails(
  orderId: string,
  staffId: string,
  details: { weightKg?: number; lengthCm?: number; widthCm?: number; heightCm?: number; labelRef?: string },
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const text = `${PACKAGE_NOTE_PREFIX}${JSON.stringify(details)}`
  const { error } = await supabase.from('order_internal_notes').insert({ order_id: orderId, staff_id: staffId, text })
  return error ? { ok: false, error: error.message } : { ok: true }
}

export async function fetchOrderPackageDetails(
  orderId: string,
): Promise<{ weightKg?: number; lengthCm?: number; widthCm?: number; heightCm?: number; labelRef?: string } | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('order_internal_notes')
    .select('text, created_at')
    .eq('order_id', orderId)
    .like('text', `${PACKAGE_NOTE_PREFIX}%`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  try {
    return JSON.parse(data.text.slice(PACKAGE_NOTE_PREFIX.length))
  } catch {
    return null
  }
}

export async function setOrderShipping(
  orderId: string,
  fields: { carrier?: string; trackingNumber?: string; estimatedDelivery?: string },
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  // Built as a concretely-typed variable rather than three inline
  // conditional spreads — see reassignOrderSite's own comment above on
  // why that form collapses Supabase's generic Update<T> field types to
  // `never`.
  const payload: { carrier?: string; tracking_number?: string; estimated_delivery?: string } = {}
  if (fields.carrier !== undefined) payload.carrier = fields.carrier
  if (fields.trackingNumber !== undefined) payload.tracking_number = fields.trackingNumber
  if (fields.estimatedDelivery !== undefined) payload.estimated_delivery = fields.estimatedDelivery
  const { error } = await supabase.from('orders').update(payload).eq('id', orderId)
  return error ? { ok: false, error: error.message } : { ok: true }
}

/** Shipped -> Delivered: a real enum change, plus who confirmed it (matches the real delivered_confirmed_by column). */
export async function confirmDelivery(
  orderId: string,
  by: 'warehouse' | 'customer',
  staffId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const now = new Date().toISOString()
  const { error: updateError } = await supabase
    .from('orders')
    .update({ stage: 'delivered', stage_entered_at: now, delivered_confirmed_by: by })
    .eq('id', orderId)
  if (updateError) return { ok: false, error: updateError.message }

  await supabase.from('order_stage_history').insert({
    order_id: orderId,
    stage: 'delivered',
    by_staff_id: staffId,
    note: by === 'customer' ? 'Confirmed delivered by customer' : null,
    created_at: now,
  })
  return { ok: true }
}

/* ============================================================
 * PURCHASES — /admin/purchases (+ [purchaseId])
 * ============================================================ */

export interface AdminPurchase {
  id: string
  orderId: string | null
  orderDisplayId?: string
  customerName?: string
  requestId: string | null
  channel: Channel
  sourceStore: string
  amount: number
  status: string // 'pending' | 'purchased' | 'failed'
  receiptRef: string | null
  failReason: string | null
  outboundPayment: { amount: number; method: string; reference: string; at: string } | null
  createdAt: string
}

type PurchaseRow = {
  id: string
  order_id: string | null
  request_id: string | null
  channel: 1 | 2 | 3
  source_store: string
  amount: number
  status: string
  receipt_ref: string | null
  fail_reason: string | null
  outbound_payment: { amount: number; method: string; reference: string; at: string } | null
  created_at: string
}

function mapRowToPurchase(row: PurchaseRow, orderById: Map<string, { displayId: string; customerName: string }>): AdminPurchase {
  const order = row.order_id ? orderById.get(row.order_id) : undefined
  return {
    id: row.id,
    orderId: row.order_id,
    orderDisplayId: order?.displayId,
    customerName: order?.customerName,
    requestId: row.request_id,
    channel: row.channel,
    sourceStore: row.source_store,
    amount: row.amount,
    status: row.status,
    receiptRef: row.receipt_ref,
    failReason: row.fail_reason,
    outboundPayment: row.outbound_payment,
    createdAt: row.created_at,
  }
}

export async function fetchPurchases(): Promise<AdminPurchase[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('purchases')
    .select('id, order_id, request_id, channel, source_store, amount, status, receipt_ref, fail_reason, outbound_payment, created_at')
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[fetchPurchases]', error)
    return []
  }
  const rows = (data ?? []) as unknown as PurchaseRow[]
  const orderIds = [...new Set(rows.map((r) => r.order_id).filter((id): id is string => !!id))]
  const orderById = new Map<string, { displayId: string; customerName: string }>()
  if (orderIds.length) {
    const { data: orders } = await supabase.from('orders').select('id, display_id, user_id').in('id', orderIds)
    const userIds = [...new Set((orders ?? []).map((o) => o.user_id))]
    const { data: profiles } = userIds.length
      ? await supabase.from('profiles').select('id, full_name').in('id', userIds)
      : { data: [] as { id: string; full_name: string }[] }
    const nameByUserId = new Map((profiles ?? []).map((p) => [p.id, p.full_name]))
    for (const o of orders ?? []) {
      orderById.set(o.id, { displayId: o.display_id, customerName: nameByUserId.get(o.user_id) ?? 'Unknown customer' })
    }
  }
  return rows.map((r) => mapRowToPurchase(r, orderById))
}

export async function fetchPurchase(id: string): Promise<AdminPurchase | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('purchases')
    .select('id, order_id, request_id, channel, source_store, amount, status, receipt_ref, fail_reason, outbound_payment, created_at')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return null
  const row = data as unknown as PurchaseRow
  const orderById = new Map<string, { displayId: string; customerName: string }>()
  if (row.order_id) {
    const { data: order } = await supabase.from('orders').select('id, display_id, user_id').eq('id', row.order_id).maybeSingle()
    if (order) {
      const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', order.user_id).maybeSingle()
      orderById.set(order.id, { displayId: order.display_id, customerName: profile?.full_name ?? 'Unknown customer' })
    }
  }
  return mapRowToPurchase(row, orderById)
}

/**
 * Creates the order's `purchases` row if none exists yet, or updates the
 * existing one — used by AdminDataContext's markPurchased/flagUnavailable,
 * which (in the original per-item mock) could fire before any Purchase
 * record existed. The real `purchases` table is order-level (see file
 * header), so this always targets "the" purchase for the order, not a
 * specific item.
 */
export async function upsertPurchaseForOrder(
  orderId: string,
  fields: { channel: Channel; sourceStore: string; amount: number; status: 'pending' | 'purchased' | 'failed'; receiptRef?: string; failReason?: string },
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { data: existing } = await supabase.from('purchases').select('id').eq('order_id', orderId).maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('purchases')
      .update({
        status: fields.status,
        amount: fields.amount,
        receipt_ref: fields.receiptRef ?? null,
        fail_reason: fields.failReason ?? null,
      })
      .eq('id', existing.id)
    return error ? { ok: false, error: error.message } : { ok: true }
  }

  const { error } = await supabase.from('purchases').insert({
    order_id: orderId,
    channel: fields.channel,
    source_store: fields.sourceStore,
    amount: fields.amount,
    status: fields.status,
    receipt_ref: fields.receiptRef ?? null,
    fail_reason: fields.failReason ?? null,
  })
  return error ? { ok: false, error: error.message } : { ok: true }
}

export async function markPurchasePurchased(id: string, receiptRef: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { error } = await supabase
    .from('purchases')
    .update({ status: 'purchased', receipt_ref: receiptRef, fail_reason: null })
    .eq('id', id)
  return error ? { ok: false, error: error.message } : { ok: true }
}

export async function markPurchaseFailed(id: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { error } = await supabase.from('purchases').update({ status: 'failed', fail_reason: reason }).eq('id', id)
  return error ? { ok: false, error: error.message } : { ok: true }
}

export async function recordOutboundPayment(
  id: string,
  payment: { amount: number; method: string; reference: string },
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { error } = await supabase
    .from('purchases')
    .update({ outbound_payment: { ...payment, at: new Date().toISOString() } })
    .eq('id', id)
  return error ? { ok: false, error: error.message } : { ok: true }
}

/**
 * Hard-deletes an order — Manager (and Super Admin) only, per the
 * platform's delete policy (see whatsapp-integration-discussion-summary.md
 * §4.1): Sales & Purchase and Warehouse never get this, deactivate/soft-
 * delete doesn't apply to orders the way it does to sellers/listings, so
 * this is a real row delete. `order_items` and `order_stage_history` both
 * cascade on `order_id`, so this cleanly removes the whole order and its
 * history in one call — no separate cleanup needed. Role gating happens
 * client-side in AdminDataContext (permissions.canDelete) before this is
 * ever called; there's no server-side staff-role check yet, same
 * documented gap as every other /admin write path in this codebase.
 */
export async function deleteOrderReal(orderId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { error } = await supabase.from('orders').delete().eq('id', orderId)
  return error ? { ok: false, error: error.message } : { ok: true }
}

/* ============================================================
 * AGE HELPERS — shared by every queue page's "how long has this sat" chip
 * ============================================================ */

export function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000
}

export function isStageAgeBreached(stage: string, stageEnteredAt: string): boolean {
  const threshold = isKnownStage(stage) ? STAGE_AGE_THRESHOLD_HOURS[stage] : 48
  return hoursSince(stageEnteredAt) > threshold
}