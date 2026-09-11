// types/admin.ts

// Shared types for the admin mock data layer.
// Keep this in sync with the real schema once the database lands —
// the context/actions in AdminDataContext.tsx are written against
// these shapes so swapping mock state for API calls later shouldn't
// require touching the pages themselves.

export type Role = "manager" | "sales" | "warehouse";

export type Channel = 1 | 2 | 3; // 1 = affiliated catalog, 2 = scraped link, 3 = manual request

export type OrderStage = "Ordered" | "Quality check" | "Shipped" | "Delivered";

// Canonical stage order — the single source of truth for "what's next"
// and "what's before this." Used by advanceStage/rollbackStage in
// AdminDataContext so no page has to hardcode the sequence itself.
export const STAGE_ORDER: OrderStage[] = [
  "Ordered",
  "Quality check",
  "Shipped",
  "Delivered",
];

export interface Site {
  id: string;
  name: string;
  location: string;
}

export interface StageEvent {
  stage: OrderStage;
  at: string; // ISO timestamp
  by: string; // staff display name
}

export interface InternalNote {
  id: string;
  author: string;
  body: string;
  at: string; // ISO timestamp
}

export interface OrderItem {
  id: string;
  title: string;
  quantity: number;
  variant?: string;
  sku?: string; // Channel 1 — catalog SKU
  sourceSnapshot?: string; // Channel 2 — scraped product snapshot label
  requestLink?: string; // Channel 3 — original submitted link
}

export interface Order {
  id: string;
  customerId: string;
  customerName: string;
  channel: Channel;
  stage: OrderStage;
  siteId: string;
  delayed: boolean;
  totalValue: number;
  placedAt: string; // ISO — for total order age
  stageEnteredAt: string; // ISO — for current-stage age
  stageHistory: StageEvent[];
  items: OrderItem[];
  internalNotes: InternalNote[];
  linkedRequestId?: string;
  isManualQuote: boolean; // true for Channel 3 orders — flags the pricing trail
}

export interface StaffAccount {
  id: string;
  name: string;
  role: Role;
  siteId?: string; // Warehouse only
  status: "active" | "deactivated";
}

// Per-stage "this is too long" thresholds, in hours.
// Deliberately different per stage — 3 days in QC and 3 days in transit
// mean very different things.
export const STAGE_AGE_THRESHOLD_HOURS: Record<OrderStage, number> = {
  Ordered: 24,
  "Quality check": 48,
  Shipped: 96,
  Delivered: Infinity,
};