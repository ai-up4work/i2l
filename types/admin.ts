// types/admin.ts
//
// Shared types for the WishDrop admin panel's local mock data layer.
// This file has no runtime dependency on any real backend — it's the
// contract that contexts/AdminDataContext.tsx implements and every
// admin page reads from. Growing the mock "database" later (staff,
// requests, chat, sellers, etc.) should mean adding types here first,
// then wiring them into AdminDataContext the same way Orders/Purchases
// are done.

export type Role = "manager" | "sales" | "warehouse"

export type Channel = 1 | 2 | 3

export type OrderStage = "Ordered" | "Quality check" | "Shipped" | "Delivered"

// Canonical pipeline sequence — every advance/roll-back control walks
// this array, so it's the single source of truth for stage order.
export const STAGE_ORDER: OrderStage[] = ["Ordered", "Quality check", "Shipped", "Delivered"]

// Per-stage "sitting too long" threshold, in hours. Deliberately NOT a
// single global number — QC, transit, and shipped have different
// realistic SLAs (per the /admin/orders/age spec note). Delivered is
// terminal and can never breach.
export const STAGE_AGE_THRESHOLD_HOURS: Record<OrderStage, number> = {
  "Ordered": 24,
  "Quality check": 48,
  "Shipped": 96,
  "Delivered": Infinity,
}

// Shared with the Purchases pages so orders and purchases never disagree
// on what a channel is called.
export const CHANNEL_LABEL: Record<Channel, string> = {
  1: "Affiliated store",
  2: "Scraped link",
  3: "Manual request",
}

export interface Site {
  id: string
  name: string
  location: string
}

export type SellerType = "feed" | "manual"

export interface OrderItem {
  id: string
  title: string
  quantity: number
  /** Channel 1 only — catalog SKU */
  sku?: string
  /** Channel 2 only — snapshot of scraped source data at purchase time */
  sourceSnapshot?: string
  /** Channel 3 only — the original link the customer submitted */
  requestLink?: string
  /** Optional variant label shown next to the title (e.g. "Size M", "Matte black") */
  variant?: string
  /**
   * Per-unit price quoted to the customer. Drives the Purchases queue.
   * When absent (older/simple seeds), Purchases falls back to
   * totalValue / quantity from the parent order.
   */
  unitPrice?: number
  /** Mock product photo — swap for real SKU images later */
  productImage?: string
  sellerName?: string
  sellerType?: SellerType
  /** Present only when sellerType is "feed" */
  storeUrl?: string
}

export interface StageHistoryEvent {
  stage: OrderStage
  at: string // ISO timestamp
  by: string // staff name (or "<name> (reassigned)" for a site-move restart)
}

export interface InternalNote {
  id: string
  body: string
  author: string
  at: string // ISO timestamp
}

export interface PackageDimensionsCm {
  length: number
  width: number
  height: number
}

export interface Order {
  id: string
  customerName: string
  channel: Channel
  stage: OrderStage
  siteId: string
  placedAt: string // ISO — when the order was placed
  stageEnteredAt: string // ISO — when it entered its *current* stage
  totalValue: number
  delayed: boolean
  /** True only for confirmed Channel 3 orders — priced by a human, never lib/pricing.ts */
  isManualQuote: boolean
  items: OrderItem[]
  stageHistory: StageHistoryEvent[]
  internalNotes: InternalNote[]
  /** Present when this order traces back to a Channel 3 request/chat thread */
  linkedRequestId?: string
  /** Customer-facing delivery city/area — shown on the Pack & label queue */
  destination?: string
  /** Packing instruction (fragile, gift wrap, etc.) surfaced on Pack & label */
  handlingNote?: string
  /**
   * ISO — set the moment this order is packed & labeled. That same action
   * is what advances the order from "Quality check" to "Shipped" (see
   * AdminDataContext.packOrder), so this field's presence *is* "has this
   * order been through Pack & label" — there's no separate stage for it.
   */
  packedAt?: string
  /** Captured on Pack & label before a shipping label can be generated */
  packageWeightKg?: number
  packageDimensionsCm?: PackageDimensionsCm
  /** Set once "Generate & print label" has been used. Can be regenerated (labelRef changes), so this is a timestamp, not a status. */
  labelGeneratedAt?: string
  labelRef?: string
  /** Courier that took the order from the export bin — set together with pickedUpAt */
  courier?: string
  trackingRef?: string
  /**
   * ISO — set the moment a courier physically takes this order out of the
   * export bin. Presence of this field (not just stage) is what moves an
   * order out of Export bin and into In transit — mirrors the
   * packedAt/enteredQcAt pattern used elsewhere in this file.
   */
  pickedUpAt?: string
  /** Hours from pickup to expected delivery, set alongside pickedUpAt. Falls back to IN_TRANSIT_DEFAULT_ETA_HOURS when absent — purely a display cue for the In transit queue, not a hard SLA. */
  etaHours?: number
  /**
   * ISO — set the moment an order is marked delivered from In transit.
   * This is what actually advances the order to the "Delivered" stage;
   * an order can't be marked delivered without having been picked up.
   */
  deliveredAt?: string
}

export interface CurrentUser {
  id: string
  name: string
  role: Role
  /** Only set for Warehouse accounts — they're scoped to exactly one site */
  siteId?: string
}

export interface Permissions {
  /** Can advance/roll back/directly set an order's pipeline stage */
  canMutateOrderStage: boolean
  /** If true, mutation AND the visible order list/purchase queue are scoped to currentUser.siteId */
  ordersScopedToOwnSite: boolean
  /**
   * Manager-only: use the blunt stage dropdown / Advance / Roll back
   * controls on the Orders pages to directly set an order's stage.
   * Distinct from canMutateOrderStage, which governs the *real*
   * per-stage actions (QC verdict, packing, pickup, delivery) — those
   * stay open to Warehouse at their own site, since that's the normal
   * way an order progresses. This flag is specifically the "override"
   * tool: skipping straight to a stage without going through the
   * dedicated queue action that's supposed to produce it.
   */
  canOverrideOrderStage: boolean
  /** Manager-only: move an order to a different warehouse site */
  canReassignSite: boolean
  /** Manager-only: multi-select "flag for review" on the age page */
  canBulkFlag: boolean
  /** Manager-only: toggle the delayed flag directly from the orders list */
  canToggleDelayed: boolean
  /** Manager + Sales: quote, confirm, decline, and reassign Channel 3 requests */
  canManageRequests: boolean
  /** Manager-only: reassign a Channel 3 request to a different Sales & Purchase account */
  canReassignRequests: boolean
  /** Manager-only: close a request outright without quoting it (maps to "declined" — there's no separate closed state) */
  canCloseRequests: boolean
}

// ---------------------------------------------------------------------------
// Purchases
// ---------------------------------------------------------------------------

export type PurchaseStatus = "needs_purchase" | "purchased" | "unavailable"

/**
 * The mutable purchase record — one per (order × item). Deliberately
 * thin: everything customer/product/seller-facing is derived from the
 * order + item it points at (see PurchaseLine), so there's exactly one
 * place that data can go stale.
 *
 * NOTE: not every order item necessarily has one of these yet — an item
 * that's never been touched on the Purchases queue has no Purchase row
 * at all. PurchaseLine (below) covers that gap by defaulting to
 * "needs_purchase" for any item without a matching row, so the Purchases
 * queue always shows every item on every order, not just ones that
 * happen to have been seeded or acted on already.
 */
export interface Purchase {
  id: string
  orderId: string
  orderItemId: string
  status: PurchaseStatus
  /** ISO — when this line became purchasable; drives the "age" shown in the queue */
  enteredQueueAt: string
  actualUnitPriceINR?: number
  purchaseReference?: string
  purchasedBy?: string
  purchasedAt?: string
  issueNote?: string
  /**
   * ISO — set the moment a purchased item physically arrives at its
   * site's QC queue. Absent while status isn't "purchased" yet, and also
   * absent for a purchased item still in transit — presence of this
   * field, not just status, is what makes something show up in QC.
   */
  enteredQcAt?: string
  qcStatus?: QCStatus
  qcNote?: string
  qcPhotoCount?: number
  /** ISO — when submitQcResult last recorded a verdict; drives Pack & label's "passed QC" age. */
  qcResolvedAt?: string
}

/**
 * Joined view-model: one row per (order × item), built by
 * AdminDataContext on every read — never stored — so an order edit
 * (e.g. reassignSite) is reflected here on the next render for free.
 *
 * Unlike Purchase, this ALWAYS has one entry per item regardless of
 * whether a Purchase row exists yet: `id` is the stable composite key
 * `${orderId}:${orderItemId}`, and `status` defaults to
 * "needs_purchase" when nothing has happened on that item yet. This is
 * what lets an item show up on the Purchases queue — and be actionable
 * (markPurchased/flagUnavailable) — the moment its order exists, not
 * only once someone has already touched it once before.
 */
export interface PurchaseLine {
  id: string
  orderId: string
  orderItemId: string
  orderNumber: string
  customerName: string
  siteId: string
  channel: Channel
  productTitle: string
  variant?: string
  productImage: string
  sellerName: string
  sellerType: SellerType
  storeUrl?: string
  quantity: number
  quotedUnitPriceINR: number
  actualUnitPriceINR?: number
  purchaseReference?: string
  purchasedBy?: string
  purchasedAt?: string
  status: PurchaseStatus
  issueNote?: string
  ageLabel: string
}

// ---------------------------------------------------------------------------
// Quality check
// ---------------------------------------------------------------------------

// A QC line only exists once a Purchase has been bought AND has physically
// arrived at its site — see Purchase.enteredQcAt below. There's no separate
// "failed" state on purpose: flagging an issue *is* the negative verdict,
// not a step before one.
export type QCStatus = "pending" | "passed" | "flagged"

export const QC_STATUS_LABEL: Record<QCStatus, string> = {
  pending: "Needs inspection",
  passed: "Passed",
  flagged: "Flagged",
}

// Overall "how long has this whole order taken" SLA — distinct from the
// per-stage STAGE_AGE_THRESHOLD_HOURS above. A customer doesn't care which
// stage is slow, only that the order as a whole is taking too long.
export const ORDER_AGE_BREACH_HOURS = 72

/**
 * Joined view-model for the QC queue: one row per Purchase that has
 * arrived at its site, with the order/product context a QC screen needs.
 * Built from Purchase + Order + OrderItem on every read, same pattern as
 * PurchaseLine — so a reassignSite or note added on the order shows up
 * here for free.
 */
export interface QCLine {
  /** Same id as the underlying Purchase — QC is 1:1 with a purchased line */
  id: string
  purchaseId: string
  orderId: string
  orderItemId: string
  orderNumber: string
  customerName: string
  siteId: string
  site: string
  channel: Channel
  productTitle: string
  variant?: string
  productImage: string
  sellerName: string
  quantity: number
  status: QCStatus
  note: string
  photoCount: number
  arrivedAgo: string
  orderAgeHours: number
  orderAgeLabel: string
}

// ---------------------------------------------------------------------------
// Pack & label
// ---------------------------------------------------------------------------

// Deliberately just two states, derived rather than stored: an order is
// "packed" the instant Order.packedAt is set (see AdminDataContext.packOrder)
// and "awaiting_pack" whenever it's sitting at "Quality check" with every
// item already QC-passed. There's no explicit STAGE_ORDER entry for
// packing — it's the action that moves an order from "Quality check" to
// "Shipped", not a stage of its own.
export type PackStatus = "awaiting_pack" | "packed"

export const PACK_STATUS_LABEL: Record<PackStatus, string> = {
  awaiting_pack: "Awaiting pack",
  packed: "Packed",
}

/**
 * Joined view-model for the Pack & label queue: one row per order (not
 * per item, since packing is an order-level action), built from Order +
 * its Purchases on every read — same join pattern as PurchaseLine/QCLine.
 *
 * Only covers the "get it packed" half of the job — once an order has
 * been picked up by a courier (Order.pickedUpAt set) it graduates out of
 * this queue entirely and into ExportBinLine/InTransitLine instead, so a
 * PackLine's `status` is only ever "awaiting_pack" or "packed", never
 * anything about pickup or delivery.
 */
export interface PackLine {
  /** Same as orderId — one pack line per order */
  id: string
  orderId: string
  orderNumber: string
  customerName: string
  siteId: string
  site: string
  channel: Channel
  itemCount: number
  destination: string
  handlingNote?: string
  qcPassedAgeHours: number
  qcPassedAgeLabel: string
  orderAgeHours: number
  orderAgeLabel: string
  status: PackStatus
  /** Present once a label has been generated for this order — lets the detail page pre-fill/skip label generation */
  packageWeightKg?: number
  packageDimensionsCm?: PackageDimensionsCm
  labelRef?: string
}

// ---------------------------------------------------------------------------
// Export bin
// ---------------------------------------------------------------------------

/**
 * One row per order that's been packed and labeled but not yet picked up
 * by a courier — i.e. Order.packedAt is set and Order.pickedUpAt isn't.
 * Joined from Order the same way PackLine/QCLine are, so a reassignSite
 * or note change shows up here for free.
 */
export interface ExportBinLine {
  /** Same as orderId */
  id: string
  orderId: string
  orderNumber: string
  customerName: string
  siteId: string
  site: string
  channel: Channel
  destination: string
  itemCount: number
  weightKg?: number
  labelRef?: string
  packedAgeHours: number
  packedAgeLabel: string
}

// ---------------------------------------------------------------------------
// In transit
// ---------------------------------------------------------------------------

// Fallback ETA used when an order was picked up without one on record —
// purely a display cue for flagging "overdue" rows, not a real SLA.
export const IN_TRANSIT_DEFAULT_ETA_HOURS = 24
// Within this many hours of the ETA, a still-moving order is "due soon"
// rather than plain "on track" — same idea as STAGE_AGE_THRESHOLD_HOURS'
// per-stage thresholds, just for the courier leg specifically.
export const IN_TRANSIT_DUE_SOON_WINDOW_HOURS = 6

export type DeliveryStatus = "overdue" | "due_soon" | "on_track"

export const DELIVERY_STATUS_LABEL: Record<DeliveryStatus, string> = {
  overdue: "Overdue",
  due_soon: "Due soon",
  on_track: "On track",
}

/**
 * One row per order that's been picked up by a courier but not yet
 * marked delivered — i.e. Order.pickedUpAt is set and Order.deliveredAt
 * isn't. deliveryStatus/etaRemainingHours are computed at read time from
 * pickedUpAt + etaHours, never stored.
 */
export interface InTransitLine {
  /** Same as orderId */
  id: string
  orderId: string
  orderNumber: string
  customerName: string
  siteId: string
  site: string
  channel: Channel
  destination: string
  courier: string
  trackingRef?: string
  pickedUpAgeHours: number
  pickedUpAgeLabel: string
  etaHours: number
  /** Negative once overdue */
  etaRemainingHours: number
  deliveryStatus: DeliveryStatus
}

// ---------------------------------------------------------------------------
// Staff directory
// ---------------------------------------------------------------------------

/**
 * Lightweight directory entry — just enough to label an "assigned to"
 * dropdown and resolve an id back to a display name. Distinct from
 * CurrentUser (which is "who am I logged in as right now").
 */
export interface StaffMember {
  id: string
  name: string
  role: Role
}

// ---------------------------------------------------------------------------
// Requests (Channel 3) + Chat
// ---------------------------------------------------------------------------

// A request always starts here — before anyone has looked at it. It can
// then be quoted, and from there either confirmed (which spins off an
// Order — see AdminDataContext.confirmRequest) or declined. There's no
// path back from confirmed/declined; a customer who wants to try again
// submits a new request.
export type RequestStatus = "sent_for_review" | "quoted" | "confirmed" | "declined"

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  sent_for_review: "Sent for review",
  quoted: "Quoted",
  confirmed: "Confirmed",
  declined: "Declined",
}

// Internal reply SLA for Channel 3 requests — this clock starts at
// submission, not order placement, since a request isn't an order yet.
// Only sent_for_review/quoted requests can breach; confirmed/declined
// are resolved and never flagged regardless of age.
export const REQUEST_SLA_HOURS = 24

export interface QuoteHistoryEntry {
  amount: number
  by: string
  at: string // ISO
}

export interface Request {
  id: string
  customerName: string
  /** The link/URL the customer submitted (Instagram post, boutique site, etc.) */
  link: string
  /** Customer's free-text note describing what they want */
  note: string
  screenshotUrl?: string
  /** Hostname of `link`, e.g. "instagram.com" — used for a quick source pill */
  sourceDomain: string
  status: RequestStatus
  submittedAt: string // ISO
  /** Present once a human has priced it */
  quote?: number
  quoteHistory: QuoteHistoryEntry[]
  /** Staff member currently working this request */
  assignedStaffId?: string
  /** 1:1 with a ChatThread — this is how a request and its conversation stay linked */
  chatThreadId: string
}

export type ChatSender = "customer" | "staff"

export interface ChatMessage {
  id: string
  threadId: string
  sender: ChatSender
  body: string
  at: string // ISO
  /**
   * True once a staff reply has been sent out via the manual wa.me deep
   * link rather than in-app — WhatsApp replies are never synced back, so
   * this is a one-way "I did send this" marker, not a delivery receipt.
   */
  sentViaWhatsApp?: boolean
}

export interface ChatThread {
  id: string
  customerName: string
  /** Absent for a general/support thread not tied to a Channel 3 request */
  requestId?: string
  lastActivity: string // ISO
  unread: boolean
  messages: ChatMessage[]
}

/**
 * Joined view-model for the Requests queue and detail page — one row
 * per Request, with the assigned staff name resolved and, once
 * confirmed, the order it spun off. `linkedOrderId` is found by
 * reverse-joining against Order.linkedRequestId at read time rather
 * than stored on Request itself, so there's exactly one place that
 * link can go stale: the order (same pattern as PurchaseLine/QCLine
 * reverse-joining against Order/Purchase elsewhere in this file).
 */
export interface RequestLine {
  id: string
  customerName: string
  link: string
  note: string
  screenshotUrl?: string
  sourceDomain: string
  status: RequestStatus
  submittedAt: string
  quote?: number
  quoteHistory: QuoteHistoryEntry[]
  assignedStaffId?: string
  assignedStaffName: string
  chatThreadId: string
  ageHours: number
  ageLabel: string
  /** True only while still sent_for_review/quoted and past REQUEST_SLA_HOURS — confirmed/declined requests never breach */
  slaBreached: boolean
  /** Present once this request has been confirmed — the Channel 3 order it became */
  linkedOrderId?: string
}