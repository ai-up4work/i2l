// contexts/AdminDataContext.tsx
//
// Local-dev stand-in for a real database. Every admin page reads/writes
// through useAdminData() instead of hitting an API, so pages that share
// an order (e.g. /admin/orders and /admin/orders/[orderId]) — and now
// Purchases, Quality check, Pack & label, Export bin, In transit, and
// Requests/Chat too — stay in sync automatically.
//
// SINGLE SOURCE OF TRUTH FOR ORDERS: this file used to hand-maintain its
// own hardcoded `SEEDS` array of orders that was completely independent
// from the customer-facing "My Orders" data in contexts/orderContexts.tsx
// — same fake company, two disagreeing mock databases. That's fixed now:
// `SEEDS` below is DERIVED from `MOCK_ORDERS` (exported from
// orderContexts.tsx) via `deriveOrderSeedFromCustomerOrder()`, so:
//   - Every multi-product order you see on the customer's "My Orders"
//     page (different sellers/stores per item) shows up in the admin
//     Orders list, Purchases queue, QC queue, etc. with the SAME items.
//   - Edit or add an order in orderContexts.tsx's MOCK_ORDERS and it
//     automatically flows through to every admin page, with no need to
//     duplicate it here.
//   - `PURCHASE_SEEDS` (below) is likewise synthesized per-item from the
//     derived `SEEDS`, rather than hand-written — an order's purchase/QC
//     state is inferred consistently from what stage the customer-facing
//     data says it's in (see synthesizePurchaseSeed).
//
// KNOWN LIMITATIONS of this derivation (fine for a mock, flag if this
// becomes a real integration):
//   - orderContexts.tsx models ONE customer's order history ("My
//     Orders"), so most of its orders have no `customerName` set. A
//     `SAMPLE_CUSTOMER_NAMES` fallback list below assigns a distinct
//     name per order purely so the admin panel (which lists MANY
//     customers) doesn't show 18 orders all belonging to "Customer". Set
//     `customerName` explicitly on an order in orderContexts.tsx if you
//     want it to carry through here intentionally.
//   - `Cancelled` orders are skipped entirely — the admin OrderStage type
//     (types/admin.ts) has no "Cancelled" stage yet, so there's nowhere
//     faithful to put them. Add one if the admin panel needs to manage
//     cancellations.
//   - `channel` (1 = affiliated store / 2 = scraped link / 3 = manual
//     request) is INFERRED per order from its items' sellerType/storeUrl
//     (see inferChannel), since the customer-facing type doesn't track
//     admin's 3-channel distinction directly.
//   - The four Channel-3 requests in REQUEST_SEEDS below that were
//     previously seeded as already "confirmed" (REQ-2031/2044/1988/1877)
//     no longer resolve to a real linked order, because the specific
//     hardcoded order IDs they used to point at don't exist in the
//     derived set anymore. `requestLines` still renders them fine —
//     `linkedOrderId` is just `undefined` for those four — but the
//     detail page's "View linked order" link won't appear for them.
//     Confirming a NEW request via confirmRequest() still works exactly
//     as before and creates a real, fully-linked order.
//
// PERSISTENCE: orders/purchases/requests/chatThreads are persisted to
// localStorage (see usePersistentState below) instead of living only in
// React memory. This means state survives refreshes and syncs across
// tabs on the same origin via the `storage` event. This is still a mock
// data layer, not a real backend — there's no server, no auth on the
// writes, and no conflict resolution beyond "last write wins". When a
// real database goes in, usePersistentState is the only place that
// needs to change; every page keeps calling the same useAdminData()
// functions (markPurchased, advanceStage, etc.) exactly as before.
//
// The whole "Shipped" leg of the pipeline (Pack & label → Export bin →
// In transit → Delivered) is derived from a handful of optional fields
// on Order — packedAt, pickedUpAt, deliveredAt (see types/admin.ts) —
// the same way qcLines is derived from Purchase.enteredQcAt. None of it
// is stored as a separate table, so there's exactly one place any of
// this can go stale: the order itself.
//
// Requests follow the same "seed the raw record, join at read time"
// pattern: a Request never stores the order it becomes — confirmRequest
// creates a real Order with linkedRequestId set, and requestLines finds
// it by reverse-joining against that field, exactly like PurchaseLine
// reverse-joins against Purchase.
//
// REQUESTS ARE MULTI-ITEM: a Request holds `items: RequestItemAsk[]`
// (each with its own link/note/quote/quoteHistory), not a single
// link/note/quote triple — the same shape Order.items already uses
// instead of special-casing a single-product order. setQuote now prices
// one item at a time, and confirmRequest maps every item into its own
// OrderItem, so a 3-product request produces a real 3-item order that
// flows through purchaseLines/qcLines/packLines exactly like any other
// multi-item order.
//
// IMPORTANT: because those warehouse queues are derived from those
// fields and NOT from `stage` directly, every place that changes an
// order's `stage` — including the free-form stage dropdown and
// advance/rollback buttons on /admin/orders — has to keep those fields
// honest too. That's what withStageTransition below does: it's the one
// chokepoint every stage mutation (advanceStage, rollbackStage,
// updateOrderStage, and internally packOrder/markPickedUp/markDelivered,
// confirmRequest) funnels through.
"use client"

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import type {
  Role,
  Channel,
  Order,
  OrderItem,
  OrderStage,
  SellerType,
  Site,
  CurrentUser,
  Permissions,
  StageHistoryEvent,
  InternalNote,
  Purchase,
  PurchaseLine,
  PurchaseStatus,
  QCStatus,
  QCLine,
  PackStatus,
  PackLine,
  PackageDimensionsCm,
  ExportBinLine,
  InTransitLine,
  DeliveryStatus,
  Request,
  RequestStatus,
  RequestItemAsk,
  QuoteHistoryEntry,
  ChatThread,
  ChatMessage,
  ChatSender,
  StaffMember,
  RequestLine,
} from "@/types/admin"
import {
  STAGE_ORDER,
  STAGE_AGE_THRESHOLD_HOURS,
  ORDER_AGE_BREACH_HOURS,
  IN_TRANSIT_DEFAULT_ETA_HOURS,
  IN_TRANSIT_DUE_SOON_WINDOW_HOURS,
  REQUEST_SLA_HOURS,
} from "@/types/admin"

// ---------------------------------------------------------------------
// Single source of truth: pull the customer-facing order data in and
// derive everything admin needs from it, instead of duplicating a
// second hardcoded order list here.
// ---------------------------------------------------------------------
import {
  MOCK_ORDERS as CUSTOMER_ORDERS,
  orderTotal,
  shippingStepIndex,
  getOrderCustomerName,
  type Order as CustomerOrder,
  type OrderItem as CustomerOrderItem,
  type OrderStatus as CustomerOrderStatus,
} from "@/contexts/Ordercontexts"

/* ------------------------------------------------------------------ */
/* Time helpers — exported because every order-facing page needs "how */
/* long has this been sitting" and "print that nicely", not just here. */
/* ------------------------------------------------------------------ */

export function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60)
}

export function formatAge(hours: number): string {
  if (hours < 1) return "<1h"
  if (hours < 24) return `${Math.floor(hours)}h`
  const days = Math.floor(hours / 24)
  const remHours = Math.floor(hours % 24)
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`
}

/** Shared "is this order overall taking too long" check — used by the QC pages. */
export function isOrderAgeBreached(hours: number): boolean {
  return hours > ORDER_AGE_BREACH_HOURS
}

function isoHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
}

let idCounter = 0
function makeId(prefix: string) {
  idCounter += 1
  return `${prefix}_${Date.now().toString(36)}${idCounter}`
}

const FALLBACK_PRODUCT_IMAGE =
  "https://images.pexels.com/photos/5632402/pexels-photo-5632402.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop"

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

/* ------------------------------------------------------------------ */
/* localStorage persistence — swap this out for real API calls later. */
/* Bump STORAGE_VERSION any time a seed/type shape changes, so stale   */
/* saved data from an old shape doesn't crash new code — old data is   */
/* simply ignored and the fallback (fresh seed) is used instead.       */
/* ------------------------------------------------------------------ */

const STORAGE_VERSION = "v3" // bumped: orders are now derived from orderContexts.tsx
const STORAGE_PREFIX = `wishdrop:${STORAGE_VERSION}:`

function readFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback // SSR guard — no window on the server
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeToStorage<T>(key: string, value: T) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value))
  } catch {
    // e.g. quota exceeded, or storage disabled — fail silently, in-memory
    // state still works for the rest of this tab's session
  }
}

/**
 * Drop-in-ish replacement for useState that persists to localStorage and
 * syncs across tabs on the same origin via the `storage` event. Every
 * existing setOrders/setPurchases/etc. call site elsewhere in this file
 * is unaffected — this hook returns the same [value, setter] shape as
 * useState, it just adds load-on-mount + save-on-change + cross-tab
 * sync around that.
 *
 * NOTE: the initial render (both server-side and the client's first
 * paint, for hydration) always uses `initial`, since reading
 * localStorage during useState's lazy initializer would mismatch SSR
 * output. The persisted value (if any) is applied client-side via the
 * effect below, right after mount — the "not found" mismatches we hit
 * earlier only affect explicit navigations, so this one-frame swap is
 * not user-visible in practice for this app's data-heavy pages.
 */
function usePersistentState<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(initial)
  const [hydrated, setHydrated] = useState(false)

  // Load the persisted value once, right after mount (client-only).
  useEffect(() => {
    setState(readFromStorage(key, initial))
    setHydrated(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // Save on every change, but only after we've hydrated from storage —
  // otherwise this would immediately overwrite a saved value with the
  // fresh `initial` seed on every mount, before the read above runs.
  useEffect(() => {
    if (!hydrated) return
    writeToStorage(key, state)
  }, [key, state, hydrated])

  // Pick up changes made in other tabs on the same origin.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_PREFIX + key || e.newValue == null) return
      try {
        setState(JSON.parse(e.newValue) as T)
      } catch {
        // ignore malformed writes from elsewhere
      }
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [key])

  return [state, setState] as const
}

/* ------------------------------------------------------------------ */
/* Reference data                                                      */
/* ------------------------------------------------------------------ */

// Real UUIDs — NOT arbitrary. These must match data/wishdrop-seed-staff-sites.sql
// exactly, because contexts/AdminDataContext.tsx's SITES/MOCK_USERS/STAFF_DIRECTORY
// ids are now written into real `orders.site_id`, `order_internal_notes.staff_id`
// (NOT NULL, FK to staff_accounts), and `order_stage_history.by_staff_id` (FK to
// staff_accounts) by lib/supabase/orders-admin.ts. The old "site_colombo"/"u_mgr_1"
// style ids weren't even valid UUID syntax, so any write using them failed outright
// (invalid input syntax for type uuid) before it could even hit the FK constraint.
// Run the seed script against your Supabase project once before using any admin
// action that writes (advance/rollback stage, add a note, pass QC, etc.) — until
// then, reads work fine but writes will error.
const SITES: Site[] = [
  { id: 'e166db30-47fe-466d-b5ee-2f600300c50f', name: 'Colombo Hub', location: 'Colombo, LK' },
  { id: '925ea5ba-e910-4d7b-a351-13b06cda235f', name: 'Kandy Hub', location: 'Kandy, LK' },
  { id: 'ef990cda-4177-419d-967a-f9e966bf389e', name: 'Galle Hub', location: 'Galle, LK' },
]

// One mock logged-in user per role. RoleSwitcher flips `role`, and
// currentUser is derived from this map — switching to Warehouse always
// hands you a user already scoped to a site, same as production.
const MOCK_USERS: Record<Role, CurrentUser> = {
  manager: { id: '20910cf1-6c79-4891-b7b0-15fcf8fd636a', name: 'Amara Perera', role: 'manager' },
  sales: { id: '857f794e-d28d-4800-b17e-4b1393461dda', name: 'Nadia Fernando', role: 'sales' },
  warehouse: {
    id: '00af059b-624d-4b31-9956-ed1c0feff14e',
    name: 'Kasun Silva',
    role: 'warehouse',
    siteId: 'e166db30-47fe-466d-b5ee-2f600300c50f',
  },
}

// Reference roster for the reassign-request dropdown AND the Reports
// site-detail page's "staff assigned here" panel. Distinct from
// MOCK_USERS (the single logged-in account per role). siteId is only
// meaningful for warehouse entries — sales/manager aren't site-scoped,
// same convention as CurrentUser.siteId.
const STAFF_DIRECTORY: StaffMember[] = [
  { id: '857f794e-d28d-4800-b17e-4b1393461dda', name: 'Nadia Fernando', role: 'sales' },
  { id: 'e03e6489-a4d4-43ca-a43c-d415403ce80c', name: 'Ruvindi Jayasekara', role: 'sales' },
  { id: '20910cf1-6c79-4891-b7b0-15fcf8fd636a', name: 'Amara Perera', role: 'manager' },
  { id: '00af059b-624d-4b31-9956-ed1c0feff14e', name: 'Kasun Silva', role: 'warehouse', siteId: 'e166db30-47fe-466d-b5ee-2f600300c50f' },
  { id: '6e37890f-346f-4a55-a779-8320765a452d', name: 'Dimuthu Rajapaksha', role: 'warehouse', siteId: '925ea5ba-e910-4d7b-a351-13b06cda235f' },
  { id: '3ed33c0b-b888-4660-9360-418f36e556ac', name: 'Harshani Weerasinghe', role: 'warehouse', siteId: 'ef990cda-4177-419d-967a-f9e966bf389e' },
  { id: '12f50202-9165-4dd3-accf-6116137ce9c1', name: 'Pasan Gunathilaka', role: 'warehouse', siteId: 'e166db30-47fe-466d-b5ee-2f600300c50f' },
]

const ROLE_PERMISSIONS: Record<Role, Permissions> = {
  manager: {
    canMutateOrderStage: true,
    ordersScopedToOwnSite: false,
    canOverrideOrderStage: true,
    canReassignSite: true,
    canBulkFlag: true,
    canToggleDelayed: true,
    canManageRequests: true,
    canReassignRequests: true,
    canCloseRequests: true,
  },
  sales: {
    canMutateOrderStage: false,
    ordersScopedToOwnSite: false,
    canOverrideOrderStage: false,
    canReassignSite: false,
    canBulkFlag: false,
    canToggleDelayed: false,
    canManageRequests: true,
    canReassignRequests: false,
    canCloseRequests: false,
  },
  warehouse: {
    canMutateOrderStage: true,
    ordersScopedToOwnSite: true,
    canOverrideOrderStage: false,
    canReassignSite: false,
    canToggleDelayed: false,
    canBulkFlag: false,
    canManageRequests: false,
    canReassignRequests: false,
    canCloseRequests: false,
  },
}

/* ------------------------------------------------------------------ */
/* Seed orders — DERIVED from orderContexts.tsx's MOCK_ORDERS. Add or   */
/* edit an order over there (including multi-item ones with different   */
/* sellers/stores per item) and it flows through automatically; stage    */
/* history + ages are all synthesized below, not hand-written per order. */
/* ------------------------------------------------------------------ */

type OrderSeed = {
  id: string
  customerName: string
  channel: Channel
  stage: OrderStage
  siteId: string
  placedHoursAgo: number
  stageEnteredHoursAgo: number
  totalValue: number
  delayed?: boolean
  isManualQuote?: boolean
  linkedRequestId?: string
  items: OrderItem[]
  internalNotes?: { body: string; author: string; hoursAgo: number }[]
  destination?: string
  handlingNote?: string
  packedHoursAgo?: number
  packageWeightKg?: number
  packageDimensionsCm?: PackageDimensionsCm
  labelGeneratedHoursAgo?: number
  labelRef?: string
  courier?: string
  trackingRef?: string
  pickedUpHoursAgo?: number
  etaHours?: number
  deliveredHoursAgo?: number
}

const ACTORS = ["Amara Perera", "Kasun Silva", "Nadia Fernando", "System"]

// Fallback names for admin-side attribution — orderContexts.tsx models a
// single logged-in customer's order history, so most of its orders don't
// carry a customerName of their own. Used only when an order has neither
// an explicit `customerName` nor a `recipient.name` set.
const SAMPLE_CUSTOMER_NAMES = [
  "Ishara Jayasuriya", "Ruwan Dissanayake", "Sithara Wickramasinghe", "Dilshan Rathnayake",
  "Hasini Fernando", "Chamath Wijesinghe", "Anusha Gunawardena", "Tharindu Bandara",
  "Malsha Peiris", "Nuwan Karunaratne", "Yasodha Silva", "Roshan Amarasekara",
  "Kavindi Ranasinghe", "Buddhika Herath", "Oshadi Mendis", "Lahiru Jayawardena",
  "Priyanka Silva", "Ishara Fonseka",
]

/** Customer-facing 'store' | 'individual' → admin's 'feed' | 'manual'. */
function mapSellerType(t?: CustomerOrderItem["sellerType"]): SellerType {
  return t === "individual" ? "manual" : "feed"
}

/** One customer-facing OrderItem → one admin OrderItem, `i1`/`i2`/... ids per order. */
function mapCustomerItemToAdminItem(item: CustomerOrderItem, index: number): OrderItem {
  const sellerType = mapSellerType(item.sellerType)
  return {
    id: `i${index + 1}`,
    title: item.name,
    quantity: item.qty,
    unitPrice: item.unitPrice,
    variant: item.variant,
    productImage: item.image,
    sellerName: item.sellerName,
    sellerType,
    // Admin's type only allows storeUrl on feed (storefront) items, never manual/individual ones.
    storeUrl: sellerType === "feed" ? item.storeUrl : undefined,
  }
}

/** Customer-facing status → admin pipeline stage. Cancelled has no admin equivalent yet — see file-header note. */
function mapCustomerStatusToStage(status: CustomerOrderStatus): OrderStage | null {
  switch (status) {
    case "Processing":
      return "Ordered"
    case "Quality Check":
      return "Quality check"
    case "Shipped":
      return "Shipped"
    case "Delivered":
      return "Delivered"
    case "Cancelled":
      return null
    default:
      return null
  }
}

/**
 * Admin's Channel (1 affiliated store / 2 scraped link / 3 manual
 * request) is order-level, but sellers are now tracked per-ITEM on the
 * customer side. Inferred as: any individually-sourced item → 3 (manual
 * request, same as a Channel-3 order today); otherwise every item having
 * a storeUrl → 1 (affiliated store); otherwise → 2 (scraped link).
 */
function inferChannel(items: OrderItem[]): Channel {
  if (items.some((i) => i.sellerType === "manual")) return 3
  if (items.length > 0 && items.every((i) => !!i.storeUrl)) return 1
  return 2
}

/**
 * The core adapter: one customer-facing Order → one admin OrderSeed (or
 * `null` for Cancelled, which admin's pipeline doesn't model). Hours-ago
 * values are computed from the customer order's real `date` field so
 * ages stay consistent with what a customer would see on their own
 * order history; `stageEnteredHoursAgo` is a proportion of that based on
 * how far along the shipping flow the order's status implies.
 */
function deriveOrderSeedFromCustomerOrder(order: CustomerOrder, index: number): OrderSeed | null {
  const stage = mapCustomerStatusToStage(order.status)
  if (stage === null) return null

  const placedHoursAgo = Math.max(hoursSince(new Date(order.date).toISOString()), 2)
  const stepIdx = Math.max(shippingStepIndex(order.status), 0)
  // Roughly: freshly Processing orders "entered their stage" at placement;
  // orders further along entered their current stage more recently.
  const stageFraction = [1, 0.55, 0.28, 0.08][stepIdx] ?? 1
  const stageEnteredHoursAgo = Math.max(placedHoursAgo * stageFraction, 0.5)

  const items = order.items.map(mapCustomerItemToAdminItem)
  const channel = inferChannel(items)
  const siteId = SITES[index % SITES.length].id
  const threshold = STAGE_AGE_THRESHOLD_HOURS[stage]
  const customerName =
    getOrderCustomerName(order) !== "Customer"
      ? getOrderCustomerName(order)
      : SAMPLE_CUSTOMER_NAMES[index % SAMPLE_CUSTOMER_NAMES.length]

  const seed: OrderSeed = {
    id: order.id,
    customerName,
    channel,
    stage,
    siteId,
    placedHoursAgo,
    stageEnteredHoursAgo,
    totalValue: orderTotal(order),
    delayed: stageEnteredHoursAgo > threshold,
    isManualQuote: channel === 3,
    items,
    destination: order.recipient ? `${order.recipient.city}, ${order.recipient.country}` : undefined,
  }

  if (stage === "Shipped" || stage === "Delivered") {
    seed.packedHoursAgo = stageEnteredHoursAgo
    seed.labelGeneratedHoursAgo = stageEnteredHoursAgo
    seed.labelRef = order.trackingNumber
    seed.courier = order.carrier
    seed.trackingRef = order.trackingNumber
    seed.pickedUpHoursAgo = Math.max(stageEnteredHoursAgo - 2, 0.5)
    seed.etaHours = 24
  }
  if (stage === "Delivered") {
    seed.deliveredHoursAgo = stageEnteredHoursAgo
  }

  return seed
}

const SEEDS: OrderSeed[] = CUSTOMER_ORDERS.map(deriveOrderSeedFromCustomerOrder).filter(
  (s): s is OrderSeed => s !== null
)

function buildOrder(seed: OrderSeed): Order {
  const placedAt = isoHoursAgo(seed.placedHoursAgo)
  const stageEnteredAt = isoHoursAgo(seed.stageEnteredHoursAgo)
  const stageIdx = STAGE_ORDER.indexOf(seed.stage)
  const span = seed.placedHoursAgo - seed.stageEnteredHoursAgo

  const stageHistory: StageHistoryEvent[] = STAGE_ORDER.slice(0, stageIdx + 1).map((stage, i) => {
    if (i === stageIdx) {
      return { stage, at: stageEnteredAt, by: ACTORS[i % ACTORS.length] }
    }
    const hoursAgoAtThisStage = seed.placedHoursAgo - (span * i) / Math.max(stageIdx, 1)
    return { stage, at: isoHoursAgo(hoursAgoAtThisStage), by: ACTORS[i % ACTORS.length] }
  })

  const internalNotes: InternalNote[] = (seed.internalNotes ?? []).map((n, i) => ({
    id: `${seed.id}-note-${i}`,
    body: n.body,
    author: n.author,
    at: isoHoursAgo(n.hoursAgo),
  }))

  return {
    id: seed.id,
    customerName: seed.customerName,
    channel: seed.channel,
    stage: seed.stage,
    siteId: seed.siteId,
    placedAt,
    stageEnteredAt,
    totalValue: seed.totalValue,
    delayed: seed.delayed ?? false,
    isManualQuote: seed.isManualQuote ?? false,
    items: seed.items,
    stageHistory,
    internalNotes,
    linkedRequestId: seed.linkedRequestId,
    destination: seed.destination,
    handlingNote: seed.handlingNote,
    packedAt: seed.packedHoursAgo !== undefined ? isoHoursAgo(seed.packedHoursAgo) : undefined,
    packageWeightKg: seed.packageWeightKg,
    packageDimensionsCm: seed.packageDimensionsCm,
    labelGeneratedAt: seed.labelGeneratedHoursAgo !== undefined ? isoHoursAgo(seed.labelGeneratedHoursAgo) : undefined,
    labelRef: seed.labelRef,
    courier: seed.courier,
    trackingRef: seed.trackingRef,
    pickedUpAt: seed.pickedUpHoursAgo !== undefined ? isoHoursAgo(seed.pickedUpHoursAgo) : undefined,
    etaHours: seed.etaHours,
    deliveredAt: seed.deliveredHoursAgo !== undefined ? isoHoursAgo(seed.deliveredHoursAgo) : undefined,
  }
}

const INITIAL_ORDERS: Order[] = SEEDS.map(buildOrder)

/* ------------------------------------------------------------------ */
/* Seed purchases — one per (orderId, orderItemId), SYNTHESIZED from the */
/* derived SEEDS above rather than hand-written, so an order's purchase/  */
/* QC state always matches whatever stage orderContexts.tsx says it's in. */
/* ------------------------------------------------------------------ */

type PurchaseSeed = {
  id: string
  orderId: string
  orderItemId: string
  status: PurchaseStatus
  enteredQueueHoursAgo: number
  actualUnitPriceINR?: number
  purchaseReference?: string
  purchasedBy?: string
  purchasedAtHoursAgo?: number
  issueNote?: string
  enteredQcHoursAgo?: number
  qcStatus?: QCStatus
  qcNote?: string
  qcPhotoCount?: number
  qcResolvedHoursAgo?: number
}

/**
 * Infers a plausible Purchase row for one item on a derived order seed:
 *   - "Ordered" stage      → still needs_purchase.
 *   - "Quality check" stage → purchased, sitting in QC as "pending"
 *     (matches admin's own auto-advance behavior: an order only reaches
 *     Quality check once every item is purchased — see markPurchased).
 *   - "Shipped"/"Delivered" → purchased AND already QC-"passed" (an
 *     order can't reach Pack & label without every item passing QC).
 */
function synthesizePurchaseSeed(order: OrderSeed, item: OrderItem): PurchaseSeed {
  const id = `pur_${order.id}_${item.id}`
  const fallbackUnitPrice = Math.round(order.totalValue / Math.max(order.items.length, 1))
  const unitPrice = item.unitPrice ?? fallbackUnitPrice

  if (order.stage === "Ordered") {
    return { id, orderId: order.id, orderItemId: item.id, status: "needs_purchase", enteredQueueHoursAgo: order.placedHoursAgo }
  }

  const purchasedHoursAgo = Math.max(order.stageEnteredHoursAgo + 3, 1)

  if (order.stage === "Quality check") {
    return {
      id,
      orderId: order.id,
      orderItemId: item.id,
      status: "purchased",
      enteredQueueHoursAgo: order.placedHoursAgo,
      actualUnitPriceINR: unitPrice,
      purchaseReference: `${order.id}-${item.id}`,
      purchasedBy: "System",
      purchasedAtHoursAgo: purchasedHoursAgo,
      enteredQcHoursAgo: order.stageEnteredHoursAgo,
      qcStatus: "pending",
      qcPhotoCount: 0,
    }
  }

  // Shipped or Delivered — fully purchased and already QC-passed.
  return {
    id,
    orderId: order.id,
    orderItemId: item.id,
    status: "purchased",
    enteredQueueHoursAgo: order.placedHoursAgo,
    actualUnitPriceINR: unitPrice,
    purchaseReference: `${order.id}-${item.id}`,
    purchasedBy: "System",
    purchasedAtHoursAgo: purchasedHoursAgo,
    enteredQcHoursAgo: Math.max(purchasedHoursAgo - 2, 0.5),
    qcStatus: "passed",
    qcPhotoCount: 1,
    qcResolvedHoursAgo: order.stageEnteredHoursAgo,
  }
}

const PURCHASE_SEEDS: PurchaseSeed[] = SEEDS.flatMap((order) =>
  order.items.map((item) => synthesizePurchaseSeed(order, item))
)

function buildPurchase(seed: PurchaseSeed): Purchase {
  return {
    id: seed.id,
    orderId: seed.orderId,
    orderItemId: seed.orderItemId,
    status: seed.status,
    enteredQueueAt: isoHoursAgo(seed.enteredQueueHoursAgo),
    actualUnitPriceINR: seed.actualUnitPriceINR,
    purchaseReference: seed.purchaseReference,
    purchasedBy: seed.purchasedBy,
    purchasedAt: seed.purchasedAtHoursAgo !== undefined ? isoHoursAgo(seed.purchasedAtHoursAgo) : undefined,
    issueNote: seed.issueNote,
    enteredQcAt: seed.enteredQcHoursAgo !== undefined ? isoHoursAgo(seed.enteredQcHoursAgo) : undefined,
    qcStatus: seed.qcStatus,
    qcNote: seed.qcNote,
    qcPhotoCount: seed.qcPhotoCount,
    qcResolvedAt: seed.qcResolvedHoursAgo !== undefined ? isoHoursAgo(seed.qcResolvedHoursAgo) : undefined,
  }
}

const INITIAL_PURCHASES: Purchase[] = PURCHASE_SEEDS.map(buildPurchase)

/* ------------------------------------------------------------------ */
/* Seed requests (Channel 3) + chat threads.                            */
/*                                                                       */
/* Independent of the derived order data above — Requests are a         */
/* pre-order concept (a customer asking about a product before there's   */
/* any Order at all), so they aren't sourced from orderContexts.tsx.     */
/* NOTE: REQ-2031/2044/1988/1877 were originally seeded "confirmed"      */
/* against specific hardcoded order IDs that no longer exist now that    */
/* orders are derived from MOCK_ORDERS — requestLines will show them as  */
/* confirmed with no resolvable linkedOrderId. Confirming a NEW request  */
/* via confirmRequest() is unaffected and creates a real linked order.   */
/* ------------------------------------------------------------------ */

type RequestItemSeed = {
  id: string
  link: string
  note: string
  screenshotUrl?: string
  quote?: number
  quoteHistory?: { amount: number; by: string; hoursAgo: number }[]
}

type RequestSeed = {
  id: string
  customerName: string
  items: RequestItemSeed[]
  status: RequestStatus
  submittedHoursAgo: number
  assignedStaffId?: string
  chatThreadId: string
}

const REQUEST_SEEDS: RequestSeed[] = [
  {
    id: "REQ-2031", customerName: "Sithara Wickramasinghe",
    status: "confirmed", submittedHoursAgo: 66,
    assignedStaffId: "u_sales_1", chatThreadId: "thread-2031",
    items: [
      {
        id: "ri1",
        link: "https://instagram.com/p/exampleLehenga",
        note: "Custom embroidered lehenga from this boutique's Instagram — need it in my measurements, can send them separately.",
        screenshotUrl: "https://images.pexels.com/photos/8148087/pexels-photo-8148087.jpeg?auto=compress&cs=tinysrgb&w=600",
        quote: 15200,
        quoteHistory: [{ amount: 15200, by: "Nadia Fernando", hoursAgo: 62 }],
      },
    ],
  },
  {
    id: "REQ-2044", customerName: "Tharindu Bandara",
    status: "confirmed", submittedHoursAgo: 12,
    assignedStaffId: "u_sales_1", chatThreadId: "thread-2044",
    items: [
      {
        id: "ri1",
        link: "https://smallboutique.in/brass-wall-set",
        note: "Handloom brass wall décor set, the 5-piece one shown on the product page.",
        quote: 9800,
        quoteHistory: [{ amount: 9800, by: "Nadia Fernando", hoursAgo: 9 }],
      },
    ],
  },
  {
    id: "REQ-1988", customerName: "Yasodha Silva",
    status: "confirmed", submittedHoursAgo: 130,
    assignedStaffId: "u_sales_1", chatThreadId: "thread-1988",
    items: [
      {
        id: "ri1",
        link: "https://instagram.com/p/exampleJewelry",
        note: "Custom resin jewelry set — matching earrings and necklace, gold flakes if possible.",
        screenshotUrl: "https://images.pexels.com/photos/1927259/pexels-photo-1927259.jpeg?auto=compress&cs=tinysrgb&w=600",
        quote: 11400,
        quoteHistory: [
          { amount: 12500, by: "Nadia Fernando", hoursAgo: 118 },
          { amount: 11400, by: "Nadia Fernando", hoursAgo: 115 },
        ],
      },
    ],
  },
  {
    id: "REQ-1877", customerName: "Oshadi Mendis",
    status: "confirmed", submittedHoursAgo: 610,
    assignedStaffId: "u_mgr_1", chatThreadId: "thread-1877",
    items: [
      {
        id: "ri1",
        link: "https://boutiquecards.in/wedding-suite",
        note: "Bespoke wedding invitation set, 150 pieces, gold foil, need a proof before full print run.",
        quote: 19500,
        quoteHistory: [{ amount: 19500, by: "Amara Perera", hoursAgo: 605 }],
      },
    ],
  },
  {
    // Past SLA, already quoted, waiting on the customer to confirm —
    // the "needs a nudge" example.
    id: "REQ-2091", customerName: "Chathurika Wanigasekara",
    status: "quoted", submittedHoursAgo: 40,
    assignedStaffId: "u_sales_1", chatThreadId: "thread-2091",
    items: [
      {
        id: "ri1",
        link: "https://trendloop.lk/products/floral-midi-dress",
        note: "Floral midi dress, size S, want to confirm it's the same fabric as the photo before I commit.",
        quote: 6400,
        quoteHistory: [{ amount: 6400, by: "Nadia Fernando", hoursAgo: 30 }],
      },
    ],
  },
  {
    // Past SLA, never even quoted — the sharpest "needs attention" example.
    id: "REQ-2098", customerName: "Dinuka Abeysekara",
    status: "sent_for_review", submittedHoursAgo: 36,
    assignedStaffId: "u_sales_2", chatThreadId: "thread-2098",
    items: [
      {
        id: "ri1",
        link: "https://glowcosmetics.in/products/vitamin-serum-set",
        note: "The 3-piece vitamin serum set, want to know if it ships with the box shown or just the bottles.",
      },
    ],
  },
  {
    // Fresh, well within SLA.
    id: "REQ-2102", customerName: "Sanduni Perera",
    status: "sent_for_review", submittedHoursAgo: 4,
    assignedStaffId: "u_sales_1", chatThreadId: "thread-2102",
    items: [
      {
        id: "ri1",
        link: "https://meesho.com/products/handbag-tote",
        note: "Tan tote bag, the one with the gold clasp — is it real leather or PU?",
      },
    ],
  },
  {
    id: "REQ-2075", customerName: "Kavisha Rodrigo",
    status: "declined", submittedHoursAgo: 90,
    assignedStaffId: "u_sales_2", chatThreadId: "thread-2075",
    items: [
      {
        id: "ri1",
        link: "https://randomseller.xyz/item/9981",
        note: "Wanted to check if this phone case is genuine or a knockoff before ordering.",
      },
    ],
  },
]

type ChatMessageSeed = { sender: ChatSender; body: string; hoursAgo: number; sentViaWhatsApp?: boolean }

// keyed by chatThreadId
const CHAT_MESSAGE_SEEDS: Record<string, ChatMessageSeed[]> = {
  "thread-2031": [
    { sender: "customer", body: "Hi! I saw this lehenga on the boutique's Instagram, is it possible to order it?", hoursAgo: 66 },
    { sender: "staff", body: "Yes, we can arrange it! Could you send over your measurements (bust/waist/length)?", hoursAgo: 63, sentViaWhatsApp: true },
    { sender: "customer", body: "Sure — bust 36, waist 30, length 42 inches.", hoursAgo: 62 },
    { sender: "staff", body: "Perfect, quoted at Rs. 15,200 including our service fee. Shall I confirm?", hoursAgo: 62 },
    { sender: "customer", body: "Yes please, go ahead!", hoursAgo: 60 },
  ],
  "thread-2044": [
    { sender: "customer", body: "Is the brass wall set the 5-piece one shown in the last photo?", hoursAgo: 12 },
    { sender: "staff", body: "Yes, confirmed with the seller — quoted at Rs. 9,800.", hoursAgo: 9, sentViaWhatsApp: true },
    { sender: "customer", body: "Great, please go ahead and order it.", hoursAgo: 8 },
  ],
  "thread-1988": [
    { sender: "customer", body: "Would like a custom resin jewelry set, matching earrings + necklace, gold flakes.", hoursAgo: 130 },
    { sender: "staff", body: "Initial quote from the seller is Rs. 12,500 — confirming details now.", hoursAgo: 118 },
    { sender: "staff", body: "Seller adjusted the price after seeing your reference photo — revised quote Rs. 11,400.", hoursAgo: 115 },
    { sender: "customer", body: "That works, please confirm!", hoursAgo: 113 },
  ],
  "thread-1877": [
    { sender: "customer", body: "150 wedding invitations with gold foil — would like a proof before the full run.", hoursAgo: 610 },
    { sender: "staff", body: "Understood, quoted at Rs. 19,500 which includes one proof round.", hoursAgo: 605, sentViaWhatsApp: true },
    { sender: "customer", body: "Sounds good, let's proceed.", hoursAgo: 600 },
  ],
  "thread-2091": [
    { sender: "customer", body: "Loved this dress in the photo — is it the same material shown, not sheer?", hoursAgo: 40 },
    { sender: "staff", body: "Checked with the seller — it's a lined cotton-blend, not sheer. Quoted at Rs. 6,400.", hoursAgo: 30, sentViaWhatsApp: true },
  ],
  "thread-2098": [
    { sender: "customer", body: "Does the vitamin serum set ship in the gift box shown, or just the 3 bottles loose?", hoursAgo: 36 },
  ],
  "thread-2102": [
    { sender: "customer", body: "Is this tote bag real leather or PU? The listing doesn't say.", hoursAgo: 4 },
  ],
  "thread-2075": [
    { sender: "customer", body: "Can you check if this phone case is a genuine listing?", hoursAgo: 90 },
    { sender: "staff", body: "This seller looks unverified and the price is unusually low — we'd recommend not proceeding with this one. Declining the request so you're not charged for something risky.", hoursAgo: 85 },
  ],
}

function buildRequestItem(seed: RequestItemSeed): RequestItemAsk {
  return {
    id: seed.id,
    link: seed.link,
    note: seed.note,
    screenshotUrl: seed.screenshotUrl,
    sourceDomain: hostnameOf(seed.link),
    quote: seed.quote,
    quoteHistory: (seed.quoteHistory ?? []).map((q) => ({
      amount: q.amount,
      by: q.by,
      at: isoHoursAgo(q.hoursAgo),
    })),
  }
}

function buildRequest(seed: RequestSeed): Request {
  return {
    id: seed.id,
    customerName: seed.customerName,
    items: seed.items.map(buildRequestItem),
    status: seed.status,
    submittedAt: isoHoursAgo(seed.submittedHoursAgo),
    assignedStaffId: seed.assignedStaffId,
    chatThreadId: seed.chatThreadId,
  }
}

function buildChatThread(threadId: string, customerName: string): ChatThread {
  const msgSeeds = CHAT_MESSAGE_SEEDS[threadId] ?? []
  const messages: ChatMessage[] = msgSeeds.map((m, i) => ({
    id: `${threadId}-msg-${i}`,
    threadId,
    sender: m.sender,
    body: m.body,
    at: isoHoursAgo(m.hoursAgo),
    sentViaWhatsApp: m.sentViaWhatsApp,
  }))
  const last = msgSeeds[msgSeeds.length - 1]
  return {
    id: threadId,
    customerName,
    requestId: REQUEST_SEEDS.find((r) => r.chatThreadId === threadId)?.id,
    lastActivity: last ? isoHoursAgo(last.hoursAgo) : new Date().toISOString(),
    // A thread is unread if the last message is from the customer —
    // i.e. staff hasn't replied to the newest message yet.
    unread: last ? last.sender === "customer" : false,
    messages,
  }
}

const INITIAL_REQUESTS: Request[] = REQUEST_SEEDS.map(buildRequest)
const INITIAL_CHAT_THREADS: ChatThread[] = REQUEST_SEEDS.map((r) => buildChatThread(r.chatThreadId, r.customerName))

/* ------------------------------------------------------------------ */
/* Context                                                              */
/* ------------------------------------------------------------------ */

interface AdminDataContextValue {
  role: Role
  setRole: (role: Role) => void
  currentUser: CurrentUser
  permissions: Permissions
  sites: Site[]
  staffDirectory: StaffMember[]
  orders: Order[]
  visibleOrders: Order[]
  getOrder: (id: string) => Order | undefined
  advanceStage: (orderId: string) => { allowed: boolean; reason?: string }
  rollbackStage: (orderId: string) => { allowed: boolean; reason?: string }
  updateOrderStage: (orderId: string, stage: OrderStage) => { allowed: boolean; reason?: string }
  canAdvanceStage: (orderId: string) => { allowed: boolean; reason?: string }
  reassignSite: (orderId: string, siteId: string) => void
  toggleDelayed: (orderId: string) => void
  bulkFlagDelayed: (orderIds: string[]) => void
  addInternalNote: (orderId: string, body: string) => void
  purchaseLines: PurchaseLine[]
  visiblePurchaseLines: PurchaseLine[]
  getPurchaseLine: (id: string) => PurchaseLine | undefined
  canActOnPurchaseLine: (line: PurchaseLine) => boolean
  markPurchased: (orderId: string, orderItemId: string, actualUnitPriceINR: number, purchaseReference?: string) => void
  flagUnavailable: (orderId: string, orderItemId: string, issueNote: string) => void
  qcLines: QCLine[]
  visibleQcLines: QCLine[]
  getQcLine: (id: string) => QCLine | undefined
  canActOnQcLine: (line: QCLine) => boolean
  receiveAtQc: (purchaseId: string) => void
  addQcPhoto: (purchaseId: string) => void
  submitQcResult: (purchaseId: string, status: Exclude<QCStatus, "pending">, note: string) => void
  purchases: Purchase[]
  packLines: PackLine[]
  visiblePackLines: PackLine[]
  getPackLine: (orderId: string) => PackLine | undefined
  canActOnPackLine: (line: PackLine) => boolean
  generateLabel: (orderId: string, weightKg: number, dimensionsCm: PackageDimensionsCm) => string
  packOrder: (orderId: string) => void
  exportBinLines: ExportBinLine[]
  visibleExportBinLines: ExportBinLine[]
  getExportBinLine: (orderId: string) => ExportBinLine | undefined
  canActOnExportBinLine: (line: ExportBinLine) => boolean
  markPickedUp: (orderId: string, courier: string, trackingRef?: string, etaHours?: number) => void
  inTransitLines: InTransitLine[]
  visibleInTransitLines: InTransitLine[]
  getInTransitLine: (orderId: string) => InTransitLine | undefined
  canActOnInTransitLine: (line: InTransitLine) => boolean
  markDelivered: (orderId: string) => void

  // -- Requests (Channel 3) --------------------------------------------
  requestLines: RequestLine[]
  getRequestLine: (id: string) => RequestLine | undefined
  /** Sales & Purchase can work any request; Manager additionally gets reassign/close (see canReassignRequestLine/canCloseRequestLine) */
  canWorkRequestLine: (line: RequestLine) => boolean
  canReassignRequestLine: () => boolean
  canCloseRequestLine: () => boolean
  /** Sets/edits the quote for ONE item on the request — always appended to that item's quoteHistory, never silently overwritten. Status flips to "quoted" only once every item has a quote. */
  setQuote: (requestId: string, itemId: string, amount: number) => void
  /** Moves a fully-quoted request to confirmed AND creates its Channel 3 order — the only way that order is created. Maps every item on the request into its own OrderItem. */
  confirmRequest: (requestId: string) => void
  /** Declines/rejects a request outright — terminal, same as Manager's "close" action */
  declineRequest: (requestId: string) => void
  reassignRequest: (requestId: string, staffId: string) => void
  /** Mock retry — real build would re-attempt the scraper; here it just reports whether the domain looks extractor-compatible */
  retryScrape: (requestId: string) => { success: boolean; message: string }

  // -- Chat --------------------------------------------------------------
  chatThreads: ChatThread[]
  getChatThread: (id: string) => ChatThread | undefined
  getChatThreadForRequest: (requestId: string) => ChatThread | undefined
  sendChatMessage: (threadId: string, body: string) => void
  markThreadRead: (threadId: string) => void
  /** Marks the given message as sent via the wa.me manual-send flow — does NOT open the link itself, that's a page-level concern */
  markSentViaWhatsApp: (threadId: string, messageId: string) => void

  // -- Dev utilities -------------------------------------------------
  /** Wipes all persisted localStorage data back to the original seed data. Dev-only escape hatch. */
  resetToSeedData: () => void
}

const AdminDataContext = createContext<AdminDataContextValue | undefined>(undefined)

export function AdminDataProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>("manager")
  const [orders, setOrders] = usePersistentState<Order[]>("orders", INITIAL_ORDERS)
  const [purchases, setPurchases] = usePersistentState<Purchase[]>("purchases", INITIAL_PURCHASES)
  const [requests, setRequests] = usePersistentState<Request[]>("requests", INITIAL_REQUESTS)
  const [chatThreads, setChatThreads] = usePersistentState<ChatThread[]>("chatThreads", INITIAL_CHAT_THREADS)

  const currentUser = MOCK_USERS[role]
  const permissions = ROLE_PERMISSIONS[role]

  const visibleOrders = useMemo(() => {
    if (permissions.ordersScopedToOwnSite && currentUser.siteId) {
      return orders.filter((o) => o.siteId === currentUser.siteId)
    }
    return orders
  }, [orders, permissions.ordersScopedToOwnSite, currentUser.siteId])

  const getOrder = (id: string) => orders.find((o) => o.id === id)

  const withStageTransition = (order: Order, targetStage: OrderStage): Order => {
    const now = new Date().toISOString()
    const fromIdx = STAGE_ORDER.indexOf(order.stage)
    const toIdx = STAGE_ORDER.indexOf(targetStage)
    const shippedIdx = STAGE_ORDER.indexOf("Shipped")
    const deliveredIdx = STAGE_ORDER.indexOf("Delivered")

    const next: Order = {
      ...order,
      stage: targetStage,
      stageEnteredAt: now,
      stageHistory: [...order.stageHistory, { stage: targetStage, at: now, by: currentUser.name }],
    }

    if (toIdx > fromIdx) {
      if (toIdx >= shippedIdx && !next.packedAt) {
        next.packedAt = now
      }
      if (toIdx >= deliveredIdx && !next.pickedUpAt) {
        next.pickedUpAt = now
        next.courier = next.courier ?? "Manual override"
        next.etaHours = next.etaHours ?? IN_TRANSIT_DEFAULT_ETA_HOURS
      }
      if (targetStage === "Delivered") {
        next.deliveredAt = next.deliveredAt ?? now
      }
    } else if (toIdx < fromIdx) {
      if (fromIdx >= deliveredIdx && toIdx < deliveredIdx) {
        next.deliveredAt = undefined
      }
      if (toIdx < shippedIdx) {
        next.packedAt = undefined
        next.packageWeightKg = undefined
        next.packageDimensionsCm = undefined
        next.labelGeneratedAt = undefined
        next.labelRef = undefined
        next.pickedUpAt = undefined
        next.courier = undefined
        next.trackingRef = undefined
        next.etaHours = undefined
        next.deliveredAt = undefined
      }
    }

    return next
  }

  const withStageChange = (order: Order, stage: OrderStage): Order => withStageTransition(order, stage)

  const purchaseGateForOrder = (order: Order): { allowed: boolean; reason?: string } => {
    const unpurchased = order.items.filter((item) => {
      const p = purchases.find((pu) => pu.orderId === order.id && pu.orderItemId === item.id)
      return !p || p.status !== "purchased"
    })
    if (unpurchased.length === 0) return { allowed: true }
    return {
      allowed: false,
      reason:
        unpurchased.length === order.items.length
          ? "No items on this order have been marked purchased yet — tick them off on the Purchases queue first."
          : `${unpurchased.length} of ${order.items.length} item${order.items.length === 1 ? "" : "s"} still need${unpurchased.length === 1 ? "s" : ""} to be marked purchased before this order can move to Quality check.`,
    }
  }

  const canSetStage = (order: Order, targetStage: OrderStage): { allowed: boolean; reason?: string } => {
    const qcIdx = STAGE_ORDER.indexOf("Quality check")
    const targetIdx = STAGE_ORDER.indexOf(targetStage)
    if (targetIdx >= qcIdx) {
      const gate = purchaseGateForOrder(order)
      if (!gate.allowed) return gate
    }
    return { allowed: true }
  }

  const requireOverridePermission = (): { allowed: boolean; reason?: string } => {
    if (!permissions.canOverrideOrderStage) {
      return {
        allowed: false,
        reason: "Only managers can directly override an order's stage here — move it forward from the Quality check / Pack & label / In transit queue instead.",
      }
    }
    return { allowed: true }
  }

  const canAdvanceStage = (orderId: string): { allowed: boolean; reason?: string } => {
    const overrideCheck = requireOverridePermission()
    if (!overrideCheck.allowed) return overrideCheck
    const order = orders.find((o) => o.id === orderId)
    if (!order) return { allowed: false, reason: "Order not found." }
    const idx = STAGE_ORDER.indexOf(order.stage)
    if (idx >= STAGE_ORDER.length - 1) return { allowed: false, reason: "Already at the final stage." }
    return canSetStage(order, STAGE_ORDER[idx + 1])
  }

  const updateOrderStage = (orderId: string, stage: OrderStage): { allowed: boolean; reason?: string } => {
    const overrideCheck = requireOverridePermission()
    if (!overrideCheck.allowed) return overrideCheck
    const order = orders.find((o) => o.id === orderId)
    if (!order) return { allowed: false, reason: "Order not found." }
    const check = canSetStage(order, stage)
    if (!check.allowed) return check
    setOrders((prev) => prev.map((o) => (o.id === orderId ? withStageChange(o, stage) : o)))
    return { allowed: true }
  }

  const advanceStage = (orderId: string): { allowed: boolean; reason?: string } => {
    const overrideCheck = requireOverridePermission()
    if (!overrideCheck.allowed) return overrideCheck
    const order = orders.find((o) => o.id === orderId)
    if (!order) return { allowed: false, reason: "Order not found." }
    const idx = STAGE_ORDER.indexOf(order.stage)
    if (idx >= STAGE_ORDER.length - 1) return { allowed: false, reason: "Already at the final stage." }
    const target = STAGE_ORDER[idx + 1]
    const check = canSetStage(order, target)
    if (!check.allowed) return check
    setOrders((prev) => prev.map((o) => (o.id === orderId ? withStageChange(o, target) : o)))
    return { allowed: true }
  }

  const rollbackStage = (orderId: string): { allowed: boolean; reason?: string } => {
    const overrideCheck = requireOverridePermission()
    if (!overrideCheck.allowed) return overrideCheck
    const order = orders.find((o) => o.id === orderId)
    if (!order) return { allowed: false, reason: "Order not found." }
    const idx = STAGE_ORDER.indexOf(order.stage)
    if (idx <= 0) return { allowed: false, reason: "Already at the first stage." }
    setOrders((prev) => prev.map((o) => (o.id === orderId ? withStageChange(o, STAGE_ORDER[idx - 1]) : o)))
    return { allowed: true }
  }

  const reassignSite = (orderId: string, siteId: string) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId) return o
        const restartsQC = o.stage === "Quality check"
        const now = new Date().toISOString()
        return {
          ...o,
          siteId,
          stageEnteredAt: restartsQC ? now : o.stageEnteredAt,
          stageHistory: restartsQC
            ? [...o.stageHistory, { stage: "Quality check" as OrderStage, at: now, by: `${currentUser.name} (reassigned)` }]
            : o.stageHistory,
        }
      })
    )
    setPurchases((prev) =>
      prev.map((p) => {
        if (p.orderId !== orderId || !p.enteredQcAt) return p
        const order = orders.find((o) => o.id === orderId)
        if (order?.stage !== "Quality check") return p
        return { ...p, enteredQcAt: undefined, qcStatus: undefined, qcNote: undefined, qcPhotoCount: 0 }
      })
    )
  }

  const toggleDelayed = (orderId: string) => {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, delayed: !o.delayed } : o)))
  }

  const bulkFlagDelayed = (orderIds: string[]) => {
    const idSet = new Set(orderIds)
    setOrders((prev) => prev.map((o) => (idSet.has(o.id) ? { ...o, delayed: true } : o)))
  }

  const addInternalNote = (orderId: string, body: string) => {
    if (!body.trim()) return
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId) return o
        const note: InternalNote = {
          id: `${orderId}-note-${o.internalNotes.length + 1}`,
          body: body.trim(),
          author: currentUser.name,
          at: new Date().toISOString(),
        }
        return { ...o, internalNotes: [...o.internalNotes, note] }
      })
    )
  }

  // -- Purchases -----------------------------------------------------

  const purchaseLines = useMemo<PurchaseLine[]>(() => {
    return orders.flatMap((order) =>
      order.items.map((item) => {
        const p = purchases.find((pu) => pu.orderId === order.id && pu.orderItemId === item.id)

        return {
          id: `${order.id}:${item.id}`,
          orderId: order.id,
          orderItemId: item.id,
          orderNumber: order.id,
          customerName: order.customerName,
          siteId: order.siteId,
          channel: order.channel,
          productTitle: item.title,
          variant: item.variant,
          productImage: item.productImage ?? FALLBACK_PRODUCT_IMAGE,
          sellerName: item.sellerName ?? "Unassigned seller",
          sellerType: item.sellerType ?? "manual",
          storeUrl: item.storeUrl,
          quantity: item.quantity,
          quotedUnitPriceINR: item.unitPrice ?? Math.round(order.totalValue / item.quantity),
          actualUnitPriceINR: p?.actualUnitPriceINR,
          purchaseReference: p?.purchaseReference,
          purchasedBy: p?.purchasedBy,
          purchasedAt: p?.purchasedAt,
          status: p?.status ?? "needs_purchase",
          issueNote: p?.issueNote,
          ageLabel: formatAge(hoursSince(p?.enteredQueueAt ?? order.placedAt)),
        }
      })
    )
  }, [purchases, orders])

  const visiblePurchaseLines = useMemo(() => {
    if (permissions.ordersScopedToOwnSite && currentUser.siteId) {
      return purchaseLines.filter((l) => l.siteId === currentUser.siteId)
    }
    return purchaseLines
  }, [purchaseLines, permissions.ordersScopedToOwnSite, currentUser.siteId])

  const getPurchaseLine = (id: string) => purchaseLines.find((l) => l.id === id)

  const canActOnPurchaseLine = (line: PurchaseLine) =>
    permissions.canMutateOrderStage && (!permissions.ordersScopedToOwnSite || line.siteId === currentUser.siteId)

  /**
   * Marks one order item purchased, then — if that was the LAST unpurchased
   * item on its order — auto-advances the order from "Ordered" straight to
   * "Quality check", AND pushes every purchase on that order into the QC
   * queue itself (enteredQcAt + qcStatus: "pending"). Without that second
   * part, the order's `stage` would say "Quality check" everywhere (Orders
   * list, order detail pips) while qcLines — which requires enteredQcAt +
   * qcStatus, not just order.stage — would show nothing for a QC agent to
   * act on. This mirrors how packOrder/markDelivered already auto-advance
   * their own stages: the Advance/Rollback buttons on the order page are a
   * manager OVERRIDE for exceptions, not the everyday path — normal orders
   * are meant to move forward on their own as warehouse/purchase actions
   * complete each stage's requirements.
   *
   * The all-purchased check has to run against the UPDATED purchases
   * list, not the `purchases` closure variable (which is stale until
   * the next render) — so it's computed inline from the same array the
   * setPurchases updater just built, rather than re-reading state.
   */
  const markPurchased = (orderId: string, orderItemId: string, actualUnitPriceINR: number, purchaseReference?: string) => {
    setPurchases((prev) => {
      const existing = prev.find((p) => p.orderId === orderId && p.orderItemId === orderItemId)
      const now = new Date().toISOString()

      let updated: Purchase[] = existing
        ? prev.map((p) =>
            p.id === existing.id
              ? {
                  ...p,
                  status: "purchased" as PurchaseStatus,
                  actualUnitPriceINR,
                  purchaseReference,
                  purchasedBy: currentUser.name,
                  purchasedAt: now,
                  issueNote: undefined,
                }
              : p
          )
        : [
            ...prev,
            {
              id: makeId("pur"),
              orderId,
              orderItemId,
              status: "purchased" as PurchaseStatus,
              enteredQueueAt: now,
              actualUnitPriceINR,
              purchaseReference,
              purchasedBy: currentUser.name,
              purchasedAt: now,
            },
          ]

      const order = orders.find((o) => o.id === orderId)
      if (order && order.stage === "Ordered") {
        const allPurchased = order.items.every(
          (item) => updated.find((p) => p.orderId === orderId && p.orderItemId === item.id)?.status === "purchased"
        )
        if (allPurchased) {
          setOrders((prevOrders) =>
            prevOrders.map((o) => (o.id === orderId && o.stage === "Ordered" ? withStageChange(o, "Quality check") : o))
          )

          // The order is entering QC right now — every one of its purchase
          // lines needs to actually show up in the QC queue, not just have
          // order.stage say "Quality check". Only touch lines that haven't
          // already entered QC on their own (defensive/idempotent).
          updated = updated.map((p) =>
            p.orderId === orderId && !p.enteredQcAt
              ? { ...p, enteredQcAt: now, qcStatus: "pending" as QCStatus, qcPhotoCount: p.qcPhotoCount ?? 0 }
              : p
          )
        }
      }

      return updated
    })
  }

  const flagUnavailable = (orderId: string, orderItemId: string, issueNote: string) => {
    if (!issueNote.trim()) return
    setPurchases((prev) => {
      const existing = prev.find((p) => p.orderId === orderId && p.orderItemId === orderItemId)
      const now = new Date().toISOString()

      if (existing) {
        return prev.map((p) =>
          p.id === existing.id ? { ...p, status: "unavailable", issueNote: issueNote.trim() } : p
        )
      }

      return [
        ...prev,
        {
          id: makeId("pur"),
          orderId,
          orderItemId,
          status: "unavailable",
          enteredQueueAt: now,
          issueNote: issueNote.trim(),
        },
      ]
    })
  }

  // -- Quality check ---------------------------------------------------

  const qcLines = useMemo<QCLine[]>(() => {
    return purchases.flatMap((p) => {
      if (p.status !== "purchased" || !p.enteredQcAt || !p.qcStatus) return []
      const order = orders.find((o) => o.id === p.orderId)
      const item = order?.items.find((i) => i.id === p.orderItemId)
      if (!order || !item) return []
      const siteName = SITES.find((s) => s.id === order.siteId)?.name ?? order.siteId
      const orderAgeHours = hoursSince(order.placedAt)

      return [{
        id: p.id,
        purchaseId: p.id,
        orderId: order.id,
        orderItemId: item.id,
        orderNumber: order.id,
        customerName: order.customerName,
        siteId: order.siteId,
        site: siteName,
        channel: order.channel,
        productTitle: item.title,
        variant: item.variant,
        productImage: item.productImage ?? FALLBACK_PRODUCT_IMAGE,
        sellerName: item.sellerName ?? "Unassigned seller",
        quantity: item.quantity,
        status: p.qcStatus,
        note: p.qcNote ?? "",
        photoCount: p.qcPhotoCount ?? 0,
        arrivedAgo: formatAge(hoursSince(p.enteredQcAt)),
        orderAgeHours,
        orderAgeLabel: formatAge(orderAgeHours),
      }]
    })
  }, [purchases, orders])

  const visibleQcLines = useMemo(() => {
    if (permissions.ordersScopedToOwnSite && currentUser.siteId) {
      return qcLines.filter((l) => l.siteId === currentUser.siteId)
    }
    return qcLines
  }, [qcLines, permissions.ordersScopedToOwnSite, currentUser.siteId])

  const getQcLine = (id: string) => qcLines.find((l) => l.id === id)

  const canActOnQcLine = (line: QCLine) =>
    permissions.canMutateOrderStage && (!permissions.ordersScopedToOwnSite || line.siteId === currentUser.siteId)

  const receiveAtQc = (purchaseId: string) => {
    setPurchases((prev) =>
      prev.map((p) =>
        p.id === purchaseId && p.status === "purchased"
          ? { ...p, enteredQcAt: new Date().toISOString(), qcStatus: "pending", qcPhotoCount: 0 }
          : p
      )
    )
  }

  const addQcPhoto = (purchaseId: string) => {
    setPurchases((prev) =>
      prev.map((p) => (p.id === purchaseId ? { ...p, qcPhotoCount: (p.qcPhotoCount ?? 0) + 1 } : p))
    )
  }

  const submitQcResult = (purchaseId: string, status: Exclude<QCStatus, "pending">, note: string) => {
    const purchase = purchases.find((p) => p.id === purchaseId)
    if (!purchase) return

    const now = new Date().toISOString()
    setPurchases((prev) =>
      prev.map((p) =>
        p.id === purchaseId ? { ...p, qcStatus: status, qcNote: note.trim() || undefined, qcResolvedAt: now } : p
      )
    )

    if (status === "flagged") {
      const trimmed = note.trim()
      if (trimmed) {
        setOrders((prev) =>
          prev.map((o) => {
            if (o.id !== purchase.orderId) return o
            const qcNote: InternalNote = {
              id: `${o.id}-note-${o.internalNotes.length + 1}`,
              body: `QC flagged: ${trimmed}`,
              author: currentUser.name,
              at: new Date().toISOString(),
            }
            return { ...o, delayed: true, internalNotes: [...o.internalNotes, qcNote] }
          })
        )
      }
    }
  }

  // -- Pack & label ------------------------------------------------------

  const packLines = useMemo<PackLine[]>(() => {
    return orders.flatMap((order) => {
      if (order.pickedUpAt) return []
      if (!order.packedAt && order.stage !== "Quality check") return []

      const orderPurchases = purchases.filter((p) => p.orderId === order.id)
      const allItemsPassed = order.items.every(
        (item) => orderPurchases.find((p) => p.orderItemId === item.id)?.qcStatus === "passed"
      )
      if (!order.packedAt && !allItemsPassed) return []

      const siteName = SITES.find((s) => s.id === order.siteId)?.name ?? order.siteId
      const orderAgeHours = hoursSince(order.placedAt)
      const qcPassedAgeHours = orderPurchases.reduce<number | null>((earliestAgo, p) => {
        if (!p.qcResolvedAt) return earliestAgo
        const hoursAgo = hoursSince(p.qcResolvedAt)
        return earliestAgo === null ? hoursAgo : Math.min(earliestAgo, hoursAgo)
      }, null) ?? orderAgeHours

      return [{
        id: order.id,
        orderId: order.id,
        orderNumber: order.id,
        customerName: order.customerName,
        siteId: order.siteId,
        site: siteName,
        channel: order.channel,
        itemCount: order.items.reduce((sum, i) => sum + i.quantity, 0),
        destination: order.destination ?? siteName,
        handlingNote: order.handlingNote,
        qcPassedAgeHours,
        qcPassedAgeLabel: formatAge(qcPassedAgeHours),
        orderAgeHours,
        orderAgeLabel: formatAge(orderAgeHours),
        status: order.packedAt ? "packed" : "awaiting_pack",
        packageWeightKg: order.packageWeightKg,
        packageDimensionsCm: order.packageDimensionsCm,
        labelRef: order.labelRef,
      }]
    })
  }, [orders, purchases])

  const visiblePackLines = useMemo(() => {
    if (permissions.ordersScopedToOwnSite && currentUser.siteId) {
      return packLines.filter((l) => l.siteId === currentUser.siteId)
    }
    return packLines
  }, [packLines, permissions.ordersScopedToOwnSite, currentUser.siteId])

  const getPackLine = (orderId: string) => packLines.find((l) => l.id === orderId)

  const canActOnPackLine = (line: PackLine) =>
    permissions.canMutateOrderStage && (!permissions.ordersScopedToOwnSite || line.siteId === currentUser.siteId)

  const generateLabel = (orderId: string, weightKg: number, dimensionsCm: PackageDimensionsCm) => {
    const ref = makeId("LBL").toUpperCase()
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              packageWeightKg: weightKg,
              packageDimensionsCm: dimensionsCm,
              labelRef: ref,
              labelGeneratedAt: new Date().toISOString(),
            }
          : o
      )
    )
    return ref
  }

  const packOrder = (orderId: string) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId || o.stage !== "Quality check" || o.packedAt) return o
        return { ...withStageChange(o, "Shipped"), packedAt: new Date().toISOString() }
      })
    )
  }

  // -- Export bin ----------------------------------------------------

  const exportBinLines = useMemo<ExportBinLine[]>(() => {
    return orders.flatMap((order) => {
      if (!order.packedAt || order.pickedUpAt) return []
      const siteName = SITES.find((s) => s.id === order.siteId)?.name ?? order.siteId
      const packedAgeHours = hoursSince(order.packedAt)

      return [{
        id: order.id,
        orderId: order.id,
        orderNumber: order.id,
        customerName: order.customerName,
        siteId: order.siteId,
        site: siteName,
        channel: order.channel,
        destination: order.destination ?? siteName,
        itemCount: order.items.reduce((sum, i) => sum + i.quantity, 0),
        weightKg: order.packageWeightKg,
        labelRef: order.labelRef,
        packedAgeHours,
        packedAgeLabel: formatAge(packedAgeHours),
      }]
    })
  }, [orders])

  const visibleExportBinLines = useMemo(() => {
    if (permissions.ordersScopedToOwnSite && currentUser.siteId) {
      return exportBinLines.filter((l) => l.siteId === currentUser.siteId)
    }
    return exportBinLines
  }, [exportBinLines, permissions.ordersScopedToOwnSite, currentUser.siteId])

  const getExportBinLine = (orderId: string) => exportBinLines.find((l) => l.id === orderId)

  const canActOnExportBinLine = (line: ExportBinLine) =>
    permissions.canMutateOrderStage && (!permissions.ordersScopedToOwnSite || line.siteId === currentUser.siteId)

  const markPickedUp = (orderId: string, courier: string, trackingRef?: string, etaHours?: number) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId && o.packedAt && !o.pickedUpAt
          ? {
              ...o,
              courier,
              trackingRef,
              etaHours: etaHours ?? IN_TRANSIT_DEFAULT_ETA_HOURS,
              pickedUpAt: new Date().toISOString(),
            }
          : o
      )
    )
  }

  // -- In transit ------------------------------------------------------

  const inTransitLines = useMemo<InTransitLine[]>(() => {
    return orders.flatMap((order) => {
      if (!order.pickedUpAt || order.deliveredAt) return []
      const siteName = SITES.find((s) => s.id === order.siteId)?.name ?? order.siteId
      const pickedUpAgeHours = hoursSince(order.pickedUpAt)
      const etaHours = order.etaHours ?? IN_TRANSIT_DEFAULT_ETA_HOURS
      const etaRemainingHours = etaHours - pickedUpAgeHours
      const deliveryStatus: DeliveryStatus =
        etaRemainingHours < 0 ? "overdue" : etaRemainingHours <= IN_TRANSIT_DUE_SOON_WINDOW_HOURS ? "due_soon" : "on_track"

      return [{
        id: order.id,
        orderId: order.id,
        orderNumber: order.id,
        customerName: order.customerName,
        siteId: order.siteId,
        site: siteName,
        channel: order.channel,
        destination: order.destination ?? siteName,
        courier: order.courier ?? "Unassigned",
        trackingRef: order.trackingRef,
        pickedUpAgeHours,
        pickedUpAgeLabel: formatAge(pickedUpAgeHours),
        etaHours,
        etaRemainingHours,
        deliveryStatus,
      }]
    })
  }, [orders])

  const visibleInTransitLines = useMemo(() => {
    if (permissions.ordersScopedToOwnSite && currentUser.siteId) {
      return inTransitLines.filter((l) => l.siteId === currentUser.siteId)
    }
    return inTransitLines
  }, [inTransitLines, permissions.ordersScopedToOwnSite, currentUser.siteId])

  const getInTransitLine = (orderId: string) => inTransitLines.find((l) => l.id === orderId)

  const canActOnInTransitLine = (line: InTransitLine) =>
    permissions.canMutateOrderStage && (!permissions.ordersScopedToOwnSite || line.siteId === currentUser.siteId)

  const markDelivered = (orderId: string) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId || !o.pickedUpAt || o.deliveredAt) return o
        return { ...withStageChange(o, "Delivered"), deliveredAt: new Date().toISOString() }
      })
    )
  }

  // -- Requests (Channel 3) ---------------------------------------------

  /**
   * Joined view-model. `linkedOrderId` is a reverse-join against
   * `orders` (matching Order.linkedRequestId), not a stored field on
   * Request — so a request confirmed via confirmRequest() below looks
   * identical, from the very next render, to one that was seeded
   * pre-confirmed. `slaBreached` only applies to still-open requests;
   * confirmed/declined are resolved and never breach regardless of age.
   * `allItemsQuoted`/`totalQuote` are the multi-item equivalent of
   * purchaseGateForOrder's "every item cleared" check — gates
   * confirmRequest the same way that gate blocks an order entering QC.
   */
  const requestLines = useMemo<RequestLine[]>(() => {
    return requests.map((r) => {
      const ageHours = hoursSince(r.submittedAt)
      const staffName = STAFF_DIRECTORY.find((s) => s.id === r.assignedStaffId)?.name ?? "Unassigned"
      const linkedOrder = orders.find((o) => o.linkedRequestId === r.id)
      const isOpen = r.status === "sent_for_review" || r.status === "quoted"
      const allItemsQuoted = r.items.length > 0 && r.items.every((i) => i.quote !== undefined)

      return {
        id: r.id,
        customerName: r.customerName,
        items: r.items,
        status: r.status,
        submittedAt: r.submittedAt,
        assignedStaffId: r.assignedStaffId,
        assignedStaffName: staffName,
        chatThreadId: r.chatThreadId,
        ageHours,
        ageLabel: formatAge(ageHours),
        slaBreached: isOpen && ageHours > REQUEST_SLA_HOURS,
        linkedOrderId: linkedOrder?.id,
        allItemsQuoted,
        totalQuote: allItemsQuoted ? r.items.reduce((sum, i) => sum + (i.quote ?? 0), 0) : undefined,
      }
    })
  }, [requests, orders])

  const getRequestLine = (id: string) => requestLines.find((l) => l.id === id)

  // Requests aren't site-scoped (Warehouse doesn't see them at all —
  // canManageRequests is false for that role, same gate used here).
  const canWorkRequestLine = (_line: RequestLine) => permissions.canManageRequests
  const canReassignRequestLine = () => permissions.canReassignRequests
  const canCloseRequestLine = () => permissions.canCloseRequests

  /**
   * Quotes ONE item on a request, not the whole request at once —
   * mirrors how markPurchased only ever ticks off one order item at a
   * time. Always appends to that item's own quoteHistory rather than
   * overwriting it, so the revision history panel on the request detail
   * page can show every edit, not just the latest number. Status only
   * flips sent_for_review → "quoted" once EVERY item has a quote — the
   * same all-must-clear gate purchaseGateForOrder uses before an order
   * can enter Quality check. Re-quoting an item that's already quoted
   * (while the request is still "quoted" overall) is allowed and just
   * appends another quoteHistory entry for that item.
   */
  const setQuote = (requestId: string, itemId: string, amount: number) => {
    if (!Number.isFinite(amount) || amount <= 0) return
    const now = new Date().toISOString()
    setRequests((prev) =>
      prev.map((r) => {
        if (r.id !== requestId) return r
        if (r.status !== "sent_for_review" && r.status !== "quoted") return r

        const entry: QuoteHistoryEntry = { amount, by: currentUser.name, at: now }
        const updatedItems = r.items.map((item) =>
          item.id === itemId ? { ...item, quote: amount, quoteHistory: [...item.quoteHistory, entry] } : item
        )
        const allQuoted = updatedItems.every((i) => i.quote !== undefined)

        return {
          ...r,
          items: updatedItems,
          status: allQuoted ? "quoted" : r.status,
        }
      })
    )
  }

  /**
   * The only place a Channel 3 order is created. Maps EVERY item on the
   * request into its own OrderItem — a 3-product request produces a
   * real 3-item order, which then flows through
   * purchaseLines/qcLines/packLines exactly like any other multi-item
   * order, since those were built item-array-aware from the start.
   * Refuses if any item is still unquoted — status should never be
   * "quoted" while that's true (setQuote enforces it), but this is a
   * defensive re-check so a partial order is never built.
   */
  const confirmRequest = (requestId: string) => {
    const request = requests.find((r) => r.id === requestId)
    if (!request || request.status !== "quoted") return
    const allQuoted = request.items.every((i) => i.quote !== undefined)
    if (!allQuoted) return

    const newOrderId = `WD-${1000 + orders.length + 1}`
    const now = new Date().toISOString()
    const siteId = SITES[0].id // no site signal on a Channel 3 request yet — defaults to the first hub
    const totalValue = request.items.reduce((sum, i) => sum + (i.quote ?? 0), 0)

    const newOrder: Order = {
      id: newOrderId,
      customerName: request.customerName,
      channel: 3,
      stage: "Ordered",
      siteId,
      placedAt: now,
      stageEnteredAt: now,
      totalValue,
      delayed: false,
      isManualQuote: true,
      linkedRequestId: request.id,
      items: request.items.map((item, i) => ({
        id: `i${i + 1}`,
        title: item.note.length > 60 ? `${item.note.slice(0, 57)}...` : item.note,
        quantity: 1,
        requestLink: item.link,
        unitPrice: item.quote,
      })),
      stageHistory: [{ stage: "Ordered", at: now, by: currentUser.name }],
      internalNotes: [],
    }

    setOrders((prev) => [...prev, newOrder])
    setRequests((prev) => prev.map((r) => (r.id === requestId ? { ...r, status: "confirmed" } : r)))
  }

  /** Terminal, whether it's a Sales decline (unavailable/declined by customer) or a Manager close. */
  const declineRequest = (requestId: string) => {
    setRequests((prev) => prev.map((r) => (r.id === requestId ? { ...r, status: "declined" } : r)))
  }

  const reassignRequest = (requestId: string, staffId: string) => {
    setRequests((prev) => prev.map((r) => (r.id === requestId ? { ...r, assignedStaffId: staffId } : r)))
  }

  /**
   * Mock stand-in for a real extractor retry — no actual scraper exists
   * in this local layer, so this just gives a domain-based verdict
   * consistent with what scrape-health tracks, without mutating state.
   * A real build would attempt extraction and, on success, redirect the
   * request into the Channel 2 flow instead of staying Channel 3. Uses
   * the first item's domain as a stand-in signal since a request can now
   * have several different source domains across its items.
   */
  const retryScrape = (requestId: string): { success: boolean; message: string } => {
    const request = requests.find((r) => r.id === requestId)
    if (!request) return { success: false, message: "Request not found." }
    const domain = request.items[0]?.sourceDomain ?? "this source"
    return {
      success: false,
      message: `${domain} still has no working extractor configured — this request stays a manual quote for now.`,
    }
  }

  // -- Chat --------------------------------------------------------------

  const getChatThread = (id: string) => chatThreads.find((t) => t.id === id)
  const getChatThreadForRequest = (requestId: string) =>
    chatThreads.find((t) => t.requestId === requestId)

  /** A staff reply always clears the thread's unread flag — it's now the staff's most recent message, not the customer's. */
  const sendChatMessage = (threadId: string, body: string) => {
    const trimmed = body.trim()
    if (!trimmed) return
    const now = new Date().toISOString()
    setChatThreads((prev) =>
      prev.map((t) => {
        if (t.id !== threadId) return t
        const message: ChatMessage = {
          id: makeId("msg"),
          threadId,
          sender: "staff",
          body: trimmed,
          at: now,
        }
        return { ...t, messages: [...t.messages, message], lastActivity: now, unread: false }
      })
    )
  }

  const markThreadRead = (threadId: string) => {
    setChatThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, unread: false } : t)))
  }

  /** Marks a specific message as sent via the manual wa.me deep link — the page itself is responsible for actually opening that link. */
  const markSentViaWhatsApp = (threadId: string, messageId: string) => {
    setChatThreads((prev) =>
      prev.map((t) =>
        t.id !== threadId
          ? t
          : { ...t, messages: t.messages.map((m) => (m.id === messageId ? { ...m, sentViaWhatsApp: true } : m)) }
      )
    )
  }

  // -- Dev utilities -------------------------------------------------

  /**
   * Wipes all four persisted slices back to the original seed data —
   * both in React state and in localStorage (usePersistentState's save
   * effect will re-persist these fresh values on the next tick). Handy
   * during testing since there's no real "reset the database" button
   * yet. Not exposed in production UI unless you wire it up somewhere.
   */
  const resetToSeedData = () => {
    setOrders(INITIAL_ORDERS)
    setPurchases(INITIAL_PURCHASES)
    setRequests(INITIAL_REQUESTS)
    setChatThreads(INITIAL_CHAT_THREADS)
  }

  const value: AdminDataContextValue = {
    role,
    setRole,
    currentUser,
    permissions,
    sites: SITES,
    staffDirectory: STAFF_DIRECTORY,
    orders,
    visibleOrders,
    purchases,
    getOrder,
    advanceStage,
    rollbackStage,
    updateOrderStage,
    canAdvanceStage,
    reassignSite,
    toggleDelayed,
    bulkFlagDelayed,
    addInternalNote,
    purchaseLines,
    visiblePurchaseLines,
    getPurchaseLine,
    canActOnPurchaseLine,
    markPurchased,
    flagUnavailable,
    qcLines,
    visibleQcLines,
    getQcLine,
    canActOnQcLine,
    receiveAtQc,
    addQcPhoto,
    submitQcResult,
    packLines,
    visiblePackLines,
    getPackLine,
    canActOnPackLine,
    generateLabel,
    packOrder,
    exportBinLines,
    visibleExportBinLines,
    getExportBinLine,
    canActOnExportBinLine,
    markPickedUp,
    inTransitLines,
    visibleInTransitLines,
    getInTransitLine,
    canActOnInTransitLine,
    markDelivered,
    requestLines,
    getRequestLine,
    canWorkRequestLine,
    canReassignRequestLine,
    canCloseRequestLine,
    setQuote,
    confirmRequest,
    declineRequest,
    reassignRequest,
    retryScrape,
    chatThreads,
    getChatThread,
    getChatThreadForRequest,
    sendChatMessage,
    markThreadRead,
    markSentViaWhatsApp,
    resetToSeedData,
  }

  return <AdminDataContext.Provider value={value}>{children}</AdminDataContext.Provider>
}

export function useAdminData() {
  const ctx = useContext(AdminDataContext)
  if (!ctx) throw new Error("useAdminData must be used within AdminDataProvider")
  return ctx
}