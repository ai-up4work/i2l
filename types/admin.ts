// types/admin.ts
//
// Shared types for the WishDrop admin panel's local mock data layer.
// This file has no runtime dependency on any real backend — it's the
// contract that contexts/AdminDataContext.tsx implements and every
// admin page reads from. Growing the mock "database" later (staff,
// requests, chat, sellers, etc.) should mean adding types here first,
// then wiring them into AdminDataContext the same way Orders are done.

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

export interface Site {
  id: string
  name: string
  location: string
}

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
  /** If true, mutation AND the visible order list are scoped to currentUser.siteId */
  ordersScopedToOwnSite: boolean
  /** Manager-only: move an order to a different warehouse site */
  canReassignSite: boolean
  /** Manager-only: multi-select "flag for review" on the age page */
  canBulkFlag: boolean
  /** Manager-only: toggle the delayed flag directly from the orders list */
  canToggleDelayed: boolean
}