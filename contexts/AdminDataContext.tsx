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

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { createClient } from "@/lib/supabase/client"
import { subscribeWithDiagnostics } from "@/lib/supabase/chat"
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
  ShippedLine,
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
// Orders/purchases now come from lib/supabase/orders-admin.ts (real
// Supabase data) via the adapter functions above, not from
// contexts/Ordercontexts.tsx's customer-facing mock — see the "REAL DATA
// ADAPTERS" header comment for the full story.
// ---------------------------------------------------------------------

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

// IDs below MUST match data/wishdrop-seed-staff-sites.sql exactly — that
// file seeds real `sites`/`staff_accounts` rows at these fixed UUIDs
// specifically so this mock role-switcher can write real data. Before
// this fix, these three constants still used old placeholder strings
// ("site_colombo", "u_mgr_1", etc.) — not valid UUIDs at all, let alone
// ones that exist in staff_accounts. Any write that includes
// currentUser.id as a staff id (createQcIssue's staffId, addInternalNote,
// setOrderStage, setWarehouseSubstage, ...) failed immediately with
// "invalid input syntax for type uuid" before Postgres even got to check
// the foreign key — and because none of those calls are awaited/
// error-handled at their call sites (see e.g. qc/[id]/page.tsx's save()),
// the failure was completely silent: the UI said "Saved" and navigated
// back, but no order_item_issues/order_internal_notes/order_stage_history
// row was ever actually written. That's why a flagged item never showed
// up on /admin/qc-issues, and why it also vanished from every other
// queue (loadRealOrders' next re-fetch has nothing to show it as
// belonging to, since the write that would keep it findable never
// landed). Run data/wishdrop-seed-staff-sites.sql against your Supabase
// project once, then these IDs will resolve to real rows and every
// staff-attributed write will actually persist.
const SITES: Site[] = [
  { id: "e166db30-47fe-466d-b5ee-2f600300c50f", name: "Colombo Hub", location: "Colombo, LK" },
  { id: "925ea5ba-e910-4d7b-a351-13b06cda235f", name: "Kandy Hub", location: "Kandy, LK" },
  { id: "ef990cda-4177-419d-967a-f9e966bf389e", name: "Galle Hub", location: "Galle, LK" },
]

// manager and super_admin intentionally share one object rather than
// two copies that could quietly drift apart — "Super Admin gets full
// /admin access, Manager-equivalent" (see the resolved open question in
// whatsapp-integration-discussion-summary.md §6.6) means whatever
// Manager can do, Super Admin can do, by construction, not by two
// people remembering to update both entries in step.
const MANAGER_PERMISSIONS: Permissions = {
  canMutateOrderStage: true,
  ordersScopedToOwnSite: false,
  canOverrideOrderStage: true,
  canReassignSite: true,
  canBulkFlag: true,
  canToggleDelayed: true,
  canManageRequests: true,
  canReassignRequests: true,
  canCloseRequests: true,
  canDelete: true,
}

const ROLE_PERMISSIONS: Record<Role, Permissions> = {
  manager: MANAGER_PERMISSIONS,
  super_admin: MANAGER_PERMISSIONS,
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
    canDelete: false,
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
    canDelete: false,
  },
}

/* ------------------------------------------------------------------ */
/* Seed orders — DERIVED from orderContexts.tsx's MOCK_ORDERS. Add or   */
/* edit an order over there (including multi-item ones with different   */
/* sellers/stores per item) and it flows through automatically; stage    */
/* history + ages are all synthesized below, not hand-written per order. */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* REAL DATA ADAPTERS                                                   */
/*                                                                       */
/* This used to be where `orders`/`purchases` got seeded from a         */
/* hand-derived mock (SEEDS, PURCHASE_SEEDS, built from customer-facing */
/* MOCK_ORDERS). That's gone — orders/purchases are now fetched live    */
/* from Supabase (see lib/supabase/orders-admin.ts, the same real data  */
/* layer the customer-facing "My Orders" page reads). The functions     */
/* below only convert that real data into this file's existing          */
/* Order/Purchase shapes, so every derived view below (qcLines,         */
/* packLines, exportBinLines, inTransitLines, purchaseLines,            */
/* requestLines) and every PAGE THAT READS THEM keeps working exactly   */
/* as it always has — none of that changes, and neither does any page.  */
/*                                                                       */
/* GRANULARITY NOTE: the real `purchases` table has no per-item column  */
/* (no order_item_id) — purchase/QC/pack progress is tracked per ORDER  */
/* in the real schema, not per line item the way this mock models it.  */
/* mapAdminOrderToPurchases() below synthesizes one Purchase per item,  */
/* all sharing the SAME order-level real status, so every item on an    */
/* order necessarily moves together in reality — this file's per-item   */
/* UI (checkboxes, individual "mark purchased", etc.) still renders and */
/* behaves exactly as before, it's just representing "the whole order"  */
/* rather than truly independent per-item state, because that's the    */
/* most the real database can express today. Flag if independent        */
/* per-item purchase tracking becomes a real requirement — it needs a   */
/* schema change (an order_item_id column on `purchases`), not a code   */
/* change here.                                                          */
/*                                                                       */
/* STAGE MAPPING: the real `orders.stage` Postgres enum has exactly 5    */
/* values (ordered / quality_check / shipped / delivered / cancelled) — */
/* Cancelled has no admin equivalent yet (same limitation this file      */
/* always had) and is filtered out below, same as before. The finer      */
/* packedAt/pickedUpAt/deliveredAt/qcStatus fields this file's warehouse */
/* queues actually derive their membership from are recovered from       */
/* AdminOrder.substage (a tracked marker — see orders-admin.ts's file    */
/* header for why that's an internal-note marker and not a real column) */
/* plus the real carrier/tracking_number columns for courier info.       */
/* ------------------------------------------------------------------ */

import {
  fetchAdminOrders as fetchRealAdminOrders,
  fetchAdminOrder as fetchRealAdminOrder,
  fetchOrderStageHistory,
  fetchOrderInternalNotes,
  fetchPurchases as fetchRealPurchases,
  fetchOrderPackageDetails,
  setOrderStage as realSetOrderStage,
  setOrderDelayed as realSetOrderDelayed,
  reassignOrderSite as realReassignOrderSite,
  addInternalNote as realAddInternalNote,
  setWarehouseSubstage as realSetWarehouseSubstage,
  packOrderReal as realPackOrder,
  markShippedReal as realMarkShipped,
  setOrderPackageDetails as realSetOrderPackageDetails,
  setOrderShipping as realSetOrderShipping,
  confirmDelivery as realConfirmDelivery,
  upsertPurchaseForOrder as realUpsertPurchaseForOrder,
  deleteOrderReal,
  type AdminOrder,
  type AdminOrderItem,
  type AdminPurchase,
  type DbOrderStage,
} from "@/lib/supabase/orders-admin"

import { fetchQcIssuesForItems, markReplacementPurchased, type CustomerVisibleQcIssue } from "@/lib/supabase/qc-issues"

import {
  fetchAdminRequests,
  fetchAdminChatThreads,
  setRequestQuote as realSetRequestQuote,
  setRequestScreenshotReal,
  setRequestVariantReal,
  declineRequestReal,
  reassignRequestReal,
  confirmRequestReal,
  confirmRequestPaymentReal,
  sendAdminChatMessage,
  markThreadReadReal,
  markSentViaWhatsAppReal,
} from "@/lib/supabase/requests-admin"

function mapDbStageToOrderStage(stage: DbOrderStage): OrderStage | null {
  switch (stage) {
    case "ordered":
      return "Ordered"
    case "quality_check":
      return "Quality check"
    case "shipped":
      return "Shipped"
    case "delivered":
      return "Delivered"
    case "cancelled":
      return null // no admin equivalent yet, same limitation this file always had
  }
}

/** Reverse of the above, for writing a real stage change from the coarse Manager-override controls. */
function mapOrderStageToDbStage(stage: OrderStage): DbOrderStage {
  switch (stage) {
    case "Ordered":
      return "ordered"
    case "Quality check":
      return "quality_check"
    case "Shipped":
      return "shipped"
    case "Delivered":
      return "delivered"
  }
}

// Same real signals Purchases' itemSource has always used (storeUrl vs
// requestLink), extended to also catch Channel 3 via sellerType —
// itemSource never needed that distinction because a Channel 3 order is
// never mixed with 1/2 items (see OrderItem.channel's doc comment). Falls
// back to undefined (caller uses the parent order's own channel instead)
// when a row has neither signal, e.g. very old/seed data.
function deriveItemChannel(item: AdminOrderItem): Channel | undefined {
  if (item.sellerType === "individual") return 3
  if (item.storeUrl) return 1
  if (item.requestLink) return 2
  return undefined
}

function mapAdminItemToOrderItem(item: AdminOrderItem): OrderItem {
  const sellerType: SellerType = item.sellerType === "individual" ? "manual" : "feed"
  return {
    id: item.id,
    title: item.title,
    quantity: item.quantity,
    requestLink: item.requestLink,
    channel: deriveItemChannel(item),
    variant: item.variant,
    unitPrice: item.unitPrice,
    productImage: item.image,
    sellerName: item.sellerName,
    sellerType,
    storeUrl: sellerType === "feed" ? item.storeUrl : undefined,
  }
}

/**
 * Real AdminOrder + its (separately-fetched) stage history/notes -> this
 * file's Order shape. Returns null for a cancelled order (filtered out,
 * same as the old derivation always did).
 */
function mapToOrder(
  o: AdminOrder,
  stageHistory: Awaited<ReturnType<typeof fetchOrderStageHistory>>,
  internalNotes: Awaited<ReturnType<typeof fetchOrderInternalNotes>>,
  packageDetails: Awaited<ReturnType<typeof fetchOrderPackageDetails>>,
): Order | null {
  const stage = mapDbStageToOrderStage(o.stage)
  if (stage === null) return null

  // Packing and pickup are substage markers now, not stage transitions
  // (only In-Transit's "Mark shipped" and Shipped's "Mark delivered" are
  // real enum changes — see getAdminQueue's doc comment in
  // orders-admin.ts). Best-available timestamp: substageAt when the
  // CURRENT substage is the one that matters here; once the order has
  // moved past it (e.g. now 'in_transit' when we want packedAt, or
  // already 'shipped'/'delivered'), only the latest substage marker's
  // timestamp survives — that's a reasonable approximation, not an exact
  // "the moment it was packed" value, since intermediate substage
  // history isn't kept, only the latest.
  const isPacked = o.substage === "packed" || o.substage === "in_transit" || o.stage === "shipped" || o.stage === "delivered"
  const packedAt = isPacked ? o.substageAt ?? o.stageEnteredAt : undefined
  const isPickedUp = o.substage === "in_transit" || o.stage === "shipped" || o.stage === "delivered"
  const pickedUpAt = isPickedUp ? o.substageAt ?? o.stageEnteredAt : undefined
  const deliveredAt = o.stage === "delivered" ? o.stageEnteredAt : undefined

  // Real order_stage_history rows only ever get written from
  // setOrderStage() — i.e. from the moment an admin explicitly changes
  // stage, or an automated transition like "Mark shipped" calls it.
  // Nothing writes a row for an order's initial creation, so a
  // never-transitioned order legitimately has zero real history rows —
  // that's expected, not a bug. Separately: every setOrderStage() call
  // before the SITES/MOCK_USERS/STAFF_DIRECTORY id fix (see that
  // block's comment) was failing outright ("invalid input syntax for
  // type uuid") because currentUser.id wasn't a real UUID yet, so any
  // order that DID transition stage before that fix still has no real
  // row for those past transitions — this doesn't retroactively create
  // them, only future transitions log correctly now. Either way, a
  // timeline with literally nothing in it reads as broken rather than
  // "nothing has happened yet" — so always guarantee at least one
  // synthetic "Ordered" entry, timestamped to the order's real creation
  // time, when the real history doesn't already have one.
  const mappedStageHistory = stageHistory.map((h) => ({
    stage: (mapDbStageToOrderStage(h.stage as DbOrderStage) ?? "Ordered") as OrderStage,
    at: h.at,
    by: h.byStaffName ?? "System",
  }))
  const hasOrderedEntry = mappedStageHistory.some((h) => h.stage === "Ordered")
  const fullStageHistory = hasOrderedEntry
    ? mappedStageHistory
    : [{ stage: "Ordered" as OrderStage, at: o.createdAt, by: "System" }, ...mappedStageHistory]

  return {
    id: o.displayId,
    customerName: o.customerName,
    channel: o.channel,
    stage,
    siteId: o.siteId ?? "",
    placedAt: o.createdAt,
    stageEnteredAt: o.stageEnteredAt,
    totalValue: o.totalValue,
    delayed: o.delayed,
    isManualQuote: o.channel === 3,
    items: o.items.map(mapAdminItemToOrderItem),
    stageHistory: fullStageHistory,
    internalNotes: internalNotes.map((n) => ({
      id: n.id,
      body: n.text,
      author: n.staffName ?? "Staff",
      at: n.at,
    })),
    linkedRequestId: undefined,
    chatThreadId: o.chatThreadId ?? undefined,
    destination: o.recipient ? `${o.recipient.city}, ${o.recipient.country}` : undefined,
    handlingNote: undefined,
    packedAt,
    packageWeightKg: packageDetails?.weightKg,
    packageDimensionsCm:
      packageDetails?.lengthCm && packageDetails?.widthCm && packageDetails?.heightCm
        ? { length: packageDetails.lengthCm, width: packageDetails.widthCm, height: packageDetails.heightCm }
        : undefined,
    labelGeneratedAt: packageDetails?.labelRef ? packedAt : undefined,
    labelRef: packageDetails?.labelRef,
    courier: o.carrier,
    trackingRef: o.trackingNumber,
    pickedUpAt,
    etaHours: pickedUpAt ? IN_TRANSIT_DEFAULT_ETA_HOURS : undefined,
    deliveredAt,
    deliveredConfirmedBy: o.deliveredConfirmedBy ?? undefined,
  }
}

/**
 * One real order -> N synthesized Purchase rows (one per item, all
 * sharing the order's real purchase/QC status — see GRANULARITY NOTE
 * above). `realPurchase` is this order's row from the real `purchases`
 * table, if one exists yet (it won't for an order still at 'ordered').
 *
 * `flaggedItemIds` is the one exception to the GRANULARITY NOTE's "no
 * per-item state" limitation: `order_item_issues` DOES carry a real
 * order_item_id (see lib/supabase/qc-issues.ts), created the moment a
 * specific item is flagged on /admin/qc/[id]/page.tsx's save(). Before
 * this parameter existed, `isFlagged` below read purely off the ORDER's
 * `delayed` flag — but flagging any one item sets `delayed` on the whole
 * order (see submitQcResult), so every sibling item in that order was
 * incorrectly shown as "flagged" too, even ones nobody had reviewed.
 * `flaggedItemIds` lets each item check its OWN real status instead of
 * inheriting the order's. "passed" still can't be made per-item this way
 * — there's no per-item table row written when an item passes, only the
 * order-level `qc_passed` substage marker — so that half of the
 * GRANULARITY NOTE limitation still stands; only "flagged" is fixable
 * without a schema change, because order_item_issues already exists.
 *
 * `awaitingRepurchaseItemIds` closes a real bug this same mechanism used
 * to have: once "Retry with a new unit" flips an issue's resolution from
 * 'pending' to 'retry_same' (a real write), the item drops OUT of
 * `flaggedItemIds` — and with nothing else to go on, it fell straight
 * back to the order-level fallback below (order.stage still
 * 'quality_check' -> "pending"), making the item look like it was back
 * in the QC queue despite nobody having repurchased it yet. That local
 * "needs_purchase" state (reorderFaultyItem) was client-only, so the
 * very next realtime-triggered refetch — which fires on almost any
 * order-related write, including the resolution change that just
 * happened — silently overwrote it. `order_item_issues.replacement_purchased_at`
 * (see data/wishdrop-qc-repurchase-signal.sql) is the real, durable fix:
 * an item stays correctly "needs_purchase" across any number of
 * refetches until it's actually marked purchased again (see
 * markPurchased below, which writes this column for real).
 */
function mapToPurchases(
  o: AdminOrder,
  realPurchase: AdminPurchase | undefined,
  flaggedItemIds: Set<string>,
  awaitingRepurchaseItemIds: Set<string>,
): Purchase[] {
  const now = new Date().toISOString()
  const fallbackUnitPrice = Math.round(o.totalValue / Math.max(o.items.length, 1))

  // Ordered, nothing purchased yet.
  if (o.stage === "ordered") {
    return o.items.map((item) => ({
      id: `${o.id}:${item.id}`,
      orderId: o.displayId,
      orderItemId: item.id,
      status: "needs_purchase" as PurchaseStatus,
      enteredQueueAt: o.createdAt,
    }))
  }

  const purchasedAt = realPurchase?.createdAt ?? o.stageEnteredAt
  const purchaseReference = realPurchase?.receiptRef ?? undefined

  // Per-item QC status. `flaggedItemIds.has(item.id)` is a real signal
  // and always wins — an item with a genuinely OPEN issue on file never
  // gets silently reported as "passed" just because the rest of the
  // order moved on. `flaggedItemIds` only contains items whose issue is
  // still `resolution: 'pending'` (see loadRealOrders below) — a
  // resolved 'retry_same' item falls out of this set on purpose, so it
  // naturally reads as "pending" again via the order-level fallback the
  // moment its physical replacement shows up for re-inspection, instead
  // of being stuck reading "flagged" forever. Everything else falls
  // back to the order-level heuristic this always used, since there's
  // nothing more precise to read for "passed"/"pending".
  const qcStatusForItem = (itemId: string): QCStatus | undefined => {
    if (flaggedItemIds.has(itemId)) return "flagged"
    // Any substage AT or PAST qc_passed means this item already cleared
    // QC — not just an exact "qc_passed" match. o.substage is a single
    // marker that advances forward (qc_passed -> packed -> in_transit)
    // while o.stage stays "quality_check" the whole time (it only flips
    // to "shipped" once /admin/in-transit's "Mark shipped" is clicked —
    // see orders-admin.ts's WarehouseSubstage vocabulary/mapping
    // comment). An exact "qc_passed" check alone means the moment an
    // order gets packed or picked up for transit, substage no longer
    // equals "qc_passed" and this fell through to the stage ===
    // "quality_check" branch below, reading back as "pending" —
    // reappearing on /admin/qc for an item that already passed and had
    // moved on to Export Bin/In-Transit, with nothing wrong with it at
    // all. This was a real, reported bug, not a hypothetical edge case.
    if (o.stage === "shipped" || o.stage === "delivered" || o.substage === "qc_passed" || o.substage === "packed" || o.substage === "in_transit") return "passed"
    if (o.stage === "quality_check") return "pending"
    return undefined
  }

  return o.items.map((item) => {
    // Checked BEFORE the normal qcStatus derivation below — an item
    // waiting to be repurchased isn't "purchased" at all anymore, real
    // per-order purchase/QC data notwithstanding. See this function's
    // own doc comment for why this needs to be a real, durable signal
    // rather than the local-only reset reorderFaultyItem used to do
    // alone.
    if (awaitingRepurchaseItemIds.has(item.id)) {
      return {
        id: `${o.id}:${item.id}`,
        orderId: o.displayId,
        orderItemId: item.id,
        status: "needs_purchase" as PurchaseStatus,
        enteredQueueAt: now,
        issueNote: "Repurchase — the original unit was flagged faulty in QC. Buy a replacement from the same seller.",
      }
    }

    const qcStatus = qcStatusForItem(item.id)
    return {
      id: `${o.id}:${item.id}`,
      orderId: o.displayId,
      orderItemId: item.id,
      status: "purchased" as PurchaseStatus,
      enteredQueueAt: o.createdAt,
      actualUnitPriceINR: item.unitPrice ?? fallbackUnitPrice,
      purchaseReference,
      purchasedAt,
      enteredQcAt: o.stage === "quality_check" || o.stage === "shipped" || o.stage === "delivered" ? o.stageEnteredAt : undefined,
      qcStatus,
      qcPhotoCount: 0,
      qcResolvedAt: qcStatus === "passed" ? o.stageEnteredAt : undefined,
      // Real per-item note text isn't stored on this synthesized row —
      // the QC page itself pulls the actual note from order_item_issues
      // (staffNote/customerNote) for the item being viewed, this is just
      // a "go look" pointer for list views. Only set when THIS item is
      // the one actually flagged, not whenever the order has any flag.
      issueNote: qcStatus === "flagged" ? "See order's internal notes for the QC flag reason." : undefined,
    }
  })
}

const INITIAL_ORDERS: Order[] = []
const INITIAL_PURCHASES: Purchase[] = []

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

// REQUEST_SEEDS/buildRequest/buildChatThread above are now unused for
// initial state (kept only because they're harmless and still exercise
// the same shape) — requests/chat are fetched live from Supabase in the
// provider below (see loadRealRequests), same as orders/purchases.
const INITIAL_REQUESTS: Request[] = []
const INITIAL_CHAT_THREADS: ChatThread[] = []

/* ------------------------------------------------------------------ */
/* Context                                                              */
/* ------------------------------------------------------------------ */

interface AdminDataContextValue {
  role: Role
  currentUser: CurrentUser
  permissions: Permissions
  sites: Site[]
  staffDirectory: StaffMember[]
  staffLoading: boolean
  /**
   * super_admin-only "view the console as a different role" — replaces
   * the old RoleSwitcher, which let ANY role flip to any other (a dev
   * convenience from before real staff auth existed). `role` above
   * already reflects this when set: `previewRole ?? currentUser.role`.
   * `currentUser` itself never changes — this only affects which
   * role's permissions/nav/dashboard you see, not who you're
   * authenticated as. setPreviewRole silently no-ops for anyone who
   * isn't actually super_admin, so even a direct call to it from
   * outside the intended UI (the sidebar's profile menu, or the
   * Settings page) can't be used to escalate a lesser role.
   */
  previewRole: Role | null
  setPreviewRole: (role: Role | null) => void
  createStaffAccount: (input: {
    name: string
    email: string
    role: Role
    siteId?: string
  }) => Promise<{ ok: boolean; error?: string; inviteLink?: string | null }>
  updateStaffAccount: (
    staffId: string,
    patch: { name?: string; email?: string; role?: Role; siteId?: string; status?: "active" | "deactivated" },
  ) => Promise<{ ok: boolean; error?: string }>
  deactivateStaffAccount: (staffId: string) => Promise<{ ok: boolean; error?: string }>
  deleteStaffAccount: (staffId: string) => Promise<{ ok: boolean; error?: string }>
  /** True until the first real Supabase fetch (orders+purchases, requests+chat) resolves. Every page that looks up a specific order/purchase/QC/pack/request line by id from a route param MUST check this before concluding "not found" — on first render after a hard navigation/reload, orders/purchases/requests/chatThreads are still empty placeholders (see REAL DATA ADAPTERS), so an id lookup against them will always miss until this flips to false. */
  dataLoading: boolean
  orders: Order[]
  visibleOrders: Order[]
  getOrder: (id: string) => Order | undefined
  advanceStage: (orderId: string) => { allowed: boolean; reason?: string }
  rollbackStage: (orderId: string) => { allowed: boolean; reason?: string }
  updateOrderStage: (orderId: string, stage: OrderStage) => { allowed: boolean; reason?: string }
  canAdvanceStage: (orderId: string) => { allowed: boolean; reason?: string }
  reassignSite: (orderId: string, siteId: string) => void
  toggleDelayed: (orderId: string) => void
  /** Explicit version of toggleDelayed — sets rather than flips, for callers (like closing out a QC issue) that need to conditionally clear it rather than blindly toggle. */
  setOrderDelayedExplicit: (orderId: string, delayed: boolean) => void
  bulkFlagDelayed: (orderIds: string[]) => void
  addInternalNote: (orderId: string, body: string) => void
  purchaseLines: PurchaseLine[]
  visiblePurchaseLines: PurchaseLine[]
  getPurchaseLine: (id: string) => PurchaseLine | undefined
  canActOnPurchaseLine: (line: PurchaseLine) => boolean
  markPurchased: (orderId: string, orderItemId: string, actualUnitPriceINR: number, purchaseReference?: string) => void
  /**
   * Resets one item's purchase record back to "needs_purchase" so it
   * reappears on the Purchases queue as its own actionable line — the
   * real per-item mechanism behind "Retry with a new unit" on a QC
   * issue. See its implementation for why this is safe to do purely in
   * local Purchase state without a schema change.
   */
  reorderFaultyItem: (orderId: string, orderItemId: string, issueNote: string) => void
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
  markShipped: (orderId: string) => void
  shippedLines: ShippedLine[]
  visibleShippedLines: ShippedLine[]
  getShippedLine: (orderId: string) => ShippedLine | undefined
  canActOnShippedLine: (line: ShippedLine) => boolean
  markDelivered: (orderId: string) => void
  /** Manager-only hard delete of an order (permissions.canDelete gates whether the UI even shows this). */
  deleteOrder: (orderId: string) => void

  // -- Requests (Channel 3) --------------------------------------------
  requestLines: RequestLine[]
  getRequestLine: (id: string) => RequestLine | undefined
  /** Sales & Purchase can work any request; Manager additionally gets reassign/close (see canReassignRequestLine/canCloseRequestLine) */
  canWorkRequestLine: (line: RequestLine) => boolean
  canReassignRequestLine: () => boolean
  canCloseRequestLine: () => boolean
  /** Sets/edits the quote for ONE item on the request — always appended to that item's quoteHistory, never silently overwritten. Status flips to "quoted" only once every item has a quote. */
  setQuote: (requestId: string, itemId: string, amount: number) => void
  /** Manually attaches/replaces a request item's product photo — the admin-upload path for when the OG scrape found no image (or the wrong one). */
  setRequestScreenshot: (requestId: string, itemId: string, url: string) => void
  /** Records the confirmed variant (size/color/etc.) once the admin has confirmed it with the customer. Prepended onto the order's item name at confirm time. */
  setRequestVariant: (requestId: string, itemId: string, variant: string) => void
  /** Records the customer's payment for this request's quote. Required before confirmRequest will do anything. */
  confirmPayment: (requestId: string, payment: { amount: number; method: string; reference?: string }) => void
  /** Moves a fully-quoted, fully-paid request to confirmed AND creates its Channel 3 order — the only way that order is created. Maps every item on the request into its own OrderItem. Returns the REAL order's display id (once the real write lands) so the caller can name the order in the confirmation message — not the local optimistic guess, which never matches what the DB actually assigns (see the function's own comment). */
  confirmRequest: (requestId: string) => Promise<{ ok: boolean; orderDisplayId?: string; error?: string }>
  /** Declines/rejects a request outright — terminal, same as Manager's "close" action */
  declineRequest: (requestId: string) => void
  reassignRequest: (requestId: string, staffId: string) => void
  /** Mock retry — real build would re-attempt the scraper; here it just reports whether the domain looks extractor-compatible */
  retryScrape: (requestId: string) => { success: boolean; message: string }

  // -- Chat --------------------------------------------------------------
  chatThreads: ChatThread[]
  getChatThread: (id: string) => ChatThread | undefined
  getChatThreadForRequest: (requestId: string) => ChatThread | undefined
  /** Sends a staff reply for real, awaiting the write. Optional attachmentUrl (e.g. a QC photo, or anything the admin attaches from SendMessageModal). Returns { ok:false, error } instead of silently pretending success if the insert fails (e.g. an RLS policy rejecting it) — see this function's own doc comment for the exact bug this replaced. */
  sendChatMessage: (threadId: string, body: string, attachmentUrl?: string) => Promise<{ ok: boolean; error?: string }>
  markThreadRead: (threadId: string) => void
  /** Marks the given message as sent via the wa.me manual-send flow — does NOT open the link itself, that's a page-level concern */
  markSentViaWhatsApp: (threadId: string, messageId: string) => void

  // -- Dev utilities -------------------------------------------------
  /** Wipes all persisted localStorage data back to the original seed data. Dev-only escape hatch. */
  resetToSeedData: () => void
}

const AdminDataContext = createContext<AdminDataContextValue | undefined>(undefined)

export function AdminDataProvider({ children }: { children: ReactNode }) {
  // The REAL logged-in staff member, via /api/admin/auth/me — replaces
  // the old mock role-switcher entirely (useState<Role>("manager") plus
  // MOCK_USERS[role]). middleware.ts already guarantees anyone who
  // reaches an /admin page resolves to an active staff_accounts row, so
  // this fetch should always succeed in practice; the error state below
  // is a defensive fallback (e.g. staff got deactivated in the moment
  // between middleware's check and this request), not the expected path.
  //
  // `currentUser` starts as an inert placeholder rather than null —
  // every hook below this point (useMemo/useCallback keyed off
  // currentUser.role/.id/.siteId) still runs on every render regardless
  // of what gets returned, since React hooks can't be called
  // conditionally. A null currentUser would crash those on the first
  // render, before the fetch resolves. This placeholder is never
  // actually seen or acted on: the return statement at the bottom of
  // this component renders a loading/error screen instead of `children`
  // until `currentUserReady` is true, so nothing downstream ever reads
  // this placeholder's values.
  const [currentUser, setCurrentUser] = useState<CurrentUser>({ id: "", name: "", role: "sales" })
  const [currentUserReady, setCurrentUserReady] = useState(false)
  const [currentUserError, setCurrentUserError] = useState<string | null>(null)

  // super_admin-only "preview as" — see AdminDataContextValue's own
  // doc comment on previewRole. Guarded here, at the single place it's
  // ever set, rather than trusting every call site to check first.
  const [previewRole, setPreviewRoleState] = useState<Role | null>(null)
  const setPreviewRole = (next: Role | null) => {
    if (currentUser.role !== "super_admin") return
    setPreviewRoleState(next)
  }

  useEffect(() => {
    let cancelled = false
    fetch("/api/admin/auth/me")
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok || !body.staff) {
          setCurrentUserError(body.error ?? "Could not verify your staff account.")
          return
        }
        setCurrentUser({
          id: body.staff.id,
          name: body.staff.name,
          role: body.staff.role as Role,
          siteId: body.staff.site_id ?? undefined,
        })
        setCurrentUserReady(true)
      })
      .catch(() => {
        if (!cancelled) setCurrentUserError("Could not verify your staff account.")
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Orders/purchases: real data, fetched on mount from Supabase — see
  // "REAL DATA ADAPTERS" above. Deliberately NOT usePersistentState:
  // that hook's localStorage layer would just cache a stale copy next to
  // the live database, and the two would silently drift. requests/chat
  // stay on usePersistentState below since they're still local mock data
  // (Channel 3 intake / support chat aren't wired to Supabase yet).
  const [orders, setOrders] = useState<Order[]>(INITIAL_ORDERS)
  const [purchases, setPurchases] = useState<Purchase[]>(INITIAL_PURCHASES)
  const [ordersLoading, setOrdersLoading] = useState(true)
  // Every page-facing id (Order.id, PurchaseLine.orderId, etc.) is the
  // human-facing display_id ("WD-238491"), matching what this file has
  // always shown — but every real write needs the row's actual uuid.
  // This ref is the one place that lookup happens, kept in sync every
  // time orders are (re)fetched below.
  const realOrderIdByDisplayId = useRef<Map<string, string>>(new Map())

  // itemId -> its most recent order_item_issues row, kept in sync every
  // time orders are (re)fetched — markPurchased below needs this to know
  // whether the item it's being called for is a repurchase (an open
  // 'retry_same' issue with no replacement_purchased_at yet) so it can
  // write that column for real. Doing the fetch itself lives in
  // loadRealOrders since it's already fetching every order's items in
  // bulk; this ref is just what makes that result reachable from
  // markPurchased without re-fetching it.
  const openQcIssueByItemId = useRef<Map<string, CustomerVisibleQcIssue>>(new Map())

  const loadRealOrders = useCallback(async (opts?: { silent?: boolean }) => {
    // FIX: this used to call setOrdersLoading(true) unconditionally,
    // including from the debounced real-time refetch below (any change
    // on orders/order_items/purchases/order_item_issues schedules a
    // call to this same function ~400ms later). Since dataLoading
    // (ordersLoading || requestsLoading) gates every admin order/
    // purchase/QC/request page's entire render behind a loading
    // skeleton, that meant: an admin sets a quote or confirms an order
    // -> the write lands -> ~400ms later the real-time subscription
    // fires this same refetch -> the whole page (including the
    // just-opened SendMessageModal review-before-send dialog) got
    // replaced by the loading skeleton mid-interaction, before they'd
    // had a chance to actually click Send — from the admin's side this
    // looked exactly like "the page reloads and doesn't wait for the
    // message to send," because the modal was yanked out from under
    // them, not because the send itself was ever racing anything.
    // `silent: true` (used by the real-time-triggered refetch and by
    // confirmRequestReal's post-write refresh below) skips the loading
    // flag entirely — the fresh data still swaps in via setOrders/
    // setPurchases either way, just without blanking the page first.
    // The initial mount effect and the dev-only resetToSeedData still
    // call this with no args, so first paint keeps its loading state.
    if (!opts?.silent) setOrdersLoading(true)
    const [adminOrders, realPurchases] = await Promise.all([fetchRealAdminOrders(), fetchRealPurchases()])

    realOrderIdByDisplayId.current = new Map(adminOrders.map((o) => [o.displayId, o.id]))
    const purchaseByOrderId = new Map(realPurchases.map((p) => [p.orderId, p]))

    // Real per-item QC signal — see mapToPurchases' doc comment for why
    // this is the one piece of genuinely per-item state the schema has
    // (order_item_issues.order_item_id), fetched once here in a single
    // batch across every order rather than per-order, same pattern as
    // the customer-facing OrdersHubPage/track page use.
    const allItemIds = adminOrders.flatMap((o) => o.items.map((i) => i.id))
    const qcIssuesByItemId = await fetchQcIssuesForItems(allItemIds)
    openQcIssueByItemId.current = qcIssuesByItemId
    // Only an OPEN issue (resolution still 'pending', i.e. nobody has
    // decided what to do about it yet) should keep an item pinned as
    // "flagged" on the QC page. Once ops resolves it — including
    // 'retry_same', where a fresh replacement unit is being re-bought
    // from the seller — the item needs to fall back to normal QC
    // status so it naturally re-enters the "needs inspection" queue the
    // moment the replacement physically arrives, rather than staying
    // permanently stuck as "flagged" forever just because it once had
    // an issue on file. (coupon_issued/shipped_as_is are genuinely
    // final — the item never comes back for re-inspection either way,
    // so excluding them here doesn't create a false "pending" either;
    // see the GRANULARITY NOTE below for why "passed" still can't be
    // tracked more precisely than that for those cases.)
    const flaggedItemIds = new Set(
      [...qcIssuesByItemId.entries()].filter(([, issue]) => issue.resolution === "pending").map(([itemId]) => itemId)
    )
    // Resolved as 'retry_same' but not yet actually repurchased — see
    // mapToPurchases' doc comment for why this needs to be a real,
    // durable signal (order_item_issues.replacement_purchased_at) and
    // not the local-only state reorderFaultyItem used to rely on alone.
    const awaitingRepurchaseItemIds = new Set(
      [...qcIssuesByItemId.entries()]
        .filter(([, issue]) => issue.resolution === "retry_same" && !issue.replacementPurchasedAt)
        .map(([itemId]) => itemId)
    )

    const [histories, notesLists, packageDetailsList] = await Promise.all([
      Promise.all(adminOrders.map((o) => fetchOrderStageHistory(o.id))),
      Promise.all(adminOrders.map((o) => fetchOrderInternalNotes(o.id))),
      Promise.all(adminOrders.map((o) => fetchOrderPackageDetails(o.id))),
    ])

    const nextOrders: Order[] = []
    const nextPurchases: Purchase[] = []
    adminOrders.forEach((o, i) => {
      const mapped = mapToOrder(o, histories[i], notesLists[i], packageDetailsList[i])
      if (mapped) {
        nextOrders.push(mapped)
        nextPurchases.push(...mapToPurchases(o, purchaseByOrderId.get(o.id), flaggedItemIds, awaitingRepurchaseItemIds))
      }
    })

    setOrders(nextOrders)
    setPurchases(nextPurchases)
    setOrdersLoading(false)
  }, [])

  useEffect(() => {
    loadRealOrders()
  }, [loadRealOrders])

  // Requests/chat: also real now — see "REAL DATA ADAPTERS" comment
  // further up for why orders/purchases aren't usePersistentState; same
  // reasoning applies here. Unlike Order.id (which is the display_id,
  // needing realOrderIdByDisplayId to resolve back to a uuid), Request.id
  // and ChatThread.id ARE already the real row uuid — requests/threads
  // never had a separate human-facing display number — so no lookup map
  // is needed for these.
  const [requests, setRequests] = useState<Request[]>(INITIAL_REQUESTS)
  const [chatThreads, setChatThreads] = useState<ChatThread[]>(INITIAL_CHAT_THREADS)
  const [requestsLoading, setRequestsLoading] = useState(true)
  // Request.id -> the request's real `requests.user_id` — needed only by
  // confirmRequest below (creating the Channel 3 order requires the
  // customer's real auth uid), and not otherwise part of the Request
  // type, so it's tracked here rather than added as a page-visible field.
  const requestUserIdByRequestId = useRef<Map<string, string>>(new Map())

  const loadRealRequests = useCallback(async (opts?: { silent?: boolean }) => {
    // Same silent-refetch fix as loadRealOrders above — see its comment
    // for the full story. The debounced real-time refetch (any change
    // on `requests`) and confirmRequestReal's post-confirm refresh both
    // pass `{ silent: true }` so a background sync never blanks the
    // request detail page's SendMessageModal mid-interaction.
    if (!opts?.silent) setRequestsLoading(true)
    const [realRequests, realThreads] = await Promise.all([fetchAdminRequests(), fetchAdminChatThreads()])
    requestUserIdByRequestId.current = new Map(realRequests.map((r) => [r.id, r.userId]))
    setRequests(
      realRequests.map((r) => ({
        id: r.id,
        customerName: r.customerName,
        items: r.items,
        status: r.status,
        submittedAt: r.submittedAt,
        assignedStaffId: r.assignedStaffId,
        chatThreadId: r.chatThreadId,
      })),
    )
    setChatThreads(
      realThreads.map((t) => ({
        id: t.id,
        customerName: t.customerName,
        requestId: t.requestId,
        lastActivity: t.lastActivity,
        unread: t.unread,
        messages: t.messages.map((m) => ({
          id: m.id,
          threadId: m.threadId,
          sender: m.sender,
          body: m.body,
          at: m.at,
          sentViaWhatsApp: m.sentViaWhatsApp,
        })),
      })),
    )
    setRequestsLoading(false)
  }, [])

  useEffect(() => {
    loadRealRequests()
  }, [loadRealRequests])

  // ── Staff directory — real, via /api/admin/staff (service-role writes,
  // since there's no staff-session RLS system yet — see that route's own
  // header comment for the honest gap: this creates the roster row, not
  // a real login-capable account). Used to seed from a static mock array
  // so the UI had something to render before the first real fetch
  // resolved — now starts empty and relies on `staffLoading` for that
  // instead, now that the mock roster is gone entirely.
  const [staffDirectory, setStaffDirectory] = useState<StaffMember[]>([])
  const [staffLoading, setStaffLoading] = useState(true)

  const mapStaffRow = (row: {
    id: string
    name: string
    email: string
    role: string | null
    requested_role?: string | null
    site_id: string | null
    status: string
    last_login: string | null
  }): StaffMember => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: (row.role as Role) ?? null,
    requestedRole: (row.requested_role as Role) ?? undefined,
    siteId: row.site_id ?? undefined,
    status: row.status as "active" | "deactivated" | "pending",
    lastLogin: row.last_login ?? undefined,
  })

  const loadStaffDirectory = useCallback(async () => {
    setStaffLoading(true)
    try {
      const res = await fetch("/api/admin/staff")
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "Failed to load staff")
      setStaffDirectory((body.staff ?? []).map(mapStaffRow))
    } catch (err) {
      console.error("[loadStaffDirectory] failed", err)
    } finally {
      setStaffLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStaffDirectory()
  }, [loadStaffDirectory])

  /** Direct-create via a generated invite link — no longer reachable from
   * any UI page (the "Add staff" pages that called this were removed
   * once self-registration + approval at /admin/register became the
   * only onboarding path — see PendingApprovalPanel). Left in place
   * since /api/admin/staff's POST endpoint still works and nothing else
   * depends on removing it, but nothing in this app calls it anymore. */
  const createStaffAccount = async (input: {
    name: string
    email: string
    role: Role
    siteId?: string
  }): Promise<{ ok: boolean; error?: string; inviteLink?: string | null }> => {
    try {
      const res = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      const body = await res.json()
      if (!res.ok) return { ok: false, error: body.error ?? "Failed to create staff account" }
      setStaffDirectory((prev) => [...prev, mapStaffRow(body.staff)])
      return { ok: true, inviteLink: body.inviteLink ?? null }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Failed to create staff account" }
    }
  }

  const updateStaffAccount = async (
    staffId: string,
    patch: { name?: string; email?: string; role?: Role; siteId?: string; status?: "active" | "deactivated" },
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch(`/api/admin/staff/${staffId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      const body = await res.json()
      if (!res.ok) return { ok: false, error: body.error ?? "Failed to update staff account" }
      setStaffDirectory((prev) => prev.map((s) => (s.id === staffId ? mapStaffRow(body.staff) : s)))
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Failed to update staff account" }
    }
  }

  /** Deactivate, not delete — the everyday "this person left" action.
   * Reversible (set status back to 'active' via updateStaffAccount) —
   * unlike deleteStaffAccount below, which is the real, permanent one. */
  const deactivateStaffAccount = (staffId: string) => updateStaffAccount(staffId, { status: "deactivated" })

  /** Real, permanent delete — Manager/Super Admin only per the delete
   * policy; the calling page is responsible for only rendering this
   * control for those roles (see permissions.canDelete elsewhere in
   * this file for the established pattern). */
  const deleteStaffAccount = async (staffId: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch(`/api/admin/staff/${staffId}`, { method: "DELETE" })
      const body = await res.json()
      if (!res.ok) return { ok: false, error: body.error ?? "Failed to delete staff account" }
      setStaffDirectory((prev) => prev.filter((s) => s.id !== staffId))
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Failed to delete staff account" }
    }
  }

  // ── Realtime ──────────────────────────────────────────────────────
  //
  // Everything above this point only ever fetches once, on mount. Fine
  // for the customer-facing side (a customer only cares about their own
  // data, and a manual refresh is an acceptable fallback there) — not
  // fine for ops, who need to see a new request, a stage change another
  // staff member just made, or a freshly-flagged QC issue without
  // having to guess that something happened and go reload the page.
  //
  // loadRealOrders/loadRealRequests are both expensive, multi-table
  // batch fetches (see their own bodies above) — calling either on
  // literally every single row-level change would hammer the DB during
  // a burst (e.g. a bulk "mark shipped" touching 10 orders at once
  // fires 10 change events). Debounced instead: every change resets a
  // short timer, and only the LAST one in a burst actually triggers a
  // refetch, ~400ms after things go quiet.
  const ordersRefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestsRefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const staffRefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const realtimeSupabaseRef = useRef(createClient())

  useEffect(() => {
    const supabase = realtimeSupabaseRef.current

    const scheduleOrdersRefetch = () => {
      if (ordersRefetchTimer.current) clearTimeout(ordersRefetchTimer.current)
      ordersRefetchTimer.current = setTimeout(() => loadRealOrders({ silent: true }), 400)
    }
    const scheduleRequestsRefetch = () => {
      if (requestsRefetchTimer.current) clearTimeout(requestsRefetchTimer.current)
      requestsRefetchTimer.current = setTimeout(() => loadRealRequests({ silent: true }), 400)
    }
    const scheduleStaffRefetch = () => {
      if (staffRefetchTimer.current) clearTimeout(staffRefetchTimer.current)
      staffRefetchTimer.current = setTimeout(() => loadStaffDirectory(), 400)
    }

    // One channel, every table that feeds loadRealOrders — orders
    // themselves, their line items, purchase records, and QC issues.
    // A change on any of them can change what an order/purchase/QC
    // line looks like, so all of them schedule the same debounced
    // refetch rather than trying to patch four different tables'
    // worth of state by hand.
    const unsubscribeOrders = subscribeWithDiagnostics(
      supabase,
      "admin-orders",
      () =>
        supabase
          .channel(`admin-orders:${Math.random().toString(36).slice(2)}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, scheduleOrdersRefetch)
          .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, scheduleOrdersRefetch)
          .on("postgres_changes", { event: "*", schema: "public", table: "purchases" }, scheduleOrdersRefetch)
          .on("postgres_changes", { event: "*", schema: "public", table: "order_item_issues" }, scheduleOrdersRefetch),
    )

    // Separate channel for requests — a new Channel 3 request coming
    // in, a quote being set, payment being confirmed, etc. Sales &
    // Purchase should see a new request appear in the queue live, not
    // after their next manual refresh.
    const unsubscribeRequests = subscribeWithDiagnostics(
      supabase,
      "admin-requests",
      () =>
        supabase
          .channel(`admin-requests:${Math.random().toString(36).slice(2)}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "requests" }, scheduleRequestsRefetch),
    )

    // Staff roster — a new hire, a role/site change, a deactivation.
    // Matters most for whoever's looking at the staff pages themselves,
    // but also feeds the reassign-request dropdown and the reports
    // "staff assigned here" panel elsewhere in the app, so it's worth
    // keeping live rather than requiring a full page reload to notice a
    // teammate just got added.
    const unsubscribeStaff = subscribeWithDiagnostics(
      supabase,
      "admin-staff",
      () =>
        supabase
          .channel(`admin-staff:${Math.random().toString(36).slice(2)}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "staff_accounts" }, scheduleStaffRefetch),
    )

    return () => {
      if (ordersRefetchTimer.current) clearTimeout(ordersRefetchTimer.current)
      if (requestsRefetchTimer.current) clearTimeout(requestsRefetchTimer.current)
      if (staffRefetchTimer.current) clearTimeout(staffRefetchTimer.current)
      unsubscribeOrders()
      unsubscribeRequests()
      unsubscribeStaff()
    }
    // loadRealOrders/loadRealRequests/loadStaffDirectory are stable
    // (useCallback with no deps) — this only needs to run once, not on
    // every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // currentUser is now real state (see the fetch effect near the top of
  // this component) — role is simply read off it, not the other way
  // around like the old MOCK_USERS[role] lookup.
  //
  // previewRole layers on top for super_admin only: `role` below is
  // what every permission check, nav filter, and dashboard redirect
  // actually reads, so setting it here (rather than threading a second
  // "effective role" through every consumer) is what makes "preview as
  // Manager" work everywhere at once. currentUser.role stays the real,
  // authenticated identity throughout — only this derived `role` shifts.
  const role = previewRole && currentUser.role === "super_admin" ? previewRole : currentUser.role
  const permissions = ROLE_PERMISSIONS[role]

  const visibleOrders = useMemo(() => {
    if (permissions.ordersScopedToOwnSite && currentUser.siteId) {
      return orders.filter((o) => o.siteId === currentUser.siteId)
    }
    return orders
  }, [orders, permissions.ordersScopedToOwnSite, currentUser.siteId])

  const getOrder = (id: string) => orders.find((o) => o.id === id)

  /** Every mutator below needs the real row uuid, not the display_id ("WD-...") this file's UI/URLs use. */
  const resolveRealId = (displayId: string): string | undefined => realOrderIdByDisplayId.current.get(displayId)

  /** Real write for a coarse stage change (Manager override controls / packOrder / markDelivered) — fired best-effort, doesn't block the optimistic local update above it. */
  function persistStageChange(displayId: string, stage: OrderStage) {
    const realId = resolveRealId(displayId)
    if (!realId) return
    if (stage === "Delivered") {
      realConfirmDelivery(realId, "warehouse", currentUser.id)
    } else {
      realSetOrderStage(realId, mapOrderStageToDbStage(stage), currentUser.id)
    }
  }

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
    persistStageChange(orderId, stage)
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
    persistStageChange(orderId, target)
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
    persistStageChange(orderId, STAGE_ORDER[idx - 1])
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
    const realId = resolveRealId(orderId)
    if (realId) realReassignOrderSite(realId, siteId, currentUser.id)
  }

  const toggleDelayed = (orderId: string) => {
    const wasDelayed = orders.find((o) => o.id === orderId)?.delayed ?? false
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, delayed: !o.delayed } : o)))
    const realId = resolveRealId(orderId)
    if (realId) realSetOrderDelayed(realId, !wasDelayed)
  }

  const setOrderDelayedExplicit = (orderId: string, delayed: boolean) => {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, delayed } : o)))
    const realId = resolveRealId(orderId)
    if (realId) realSetOrderDelayed(realId, delayed)
  }

  const bulkFlagDelayed = (orderIds: string[]) => {
    const idSet = new Set(orderIds)
    setOrders((prev) => prev.map((o) => (idSet.has(o.id) ? { ...o, delayed: true } : o)))
    orderIds.forEach((id) => {
      const realId = resolveRealId(id)
      if (realId) realSetOrderDelayed(realId, true)
    })
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
    const realId = resolveRealId(orderId)
    if (realId) realAddInternalNote(realId, currentUser.id, body.trim())
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
          itemSource: item.requestLink ? "link" : "catalogue",
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
          chatThreadId: order.chatThreadId,
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
    // Computed here, outside setPurchases' updater, specifically so the
    // addInternalNote side effect below (a real network write) only
    // ever fires once per actual call — an updater function itself can
    // be invoked more than once by React (e.g. Strict Mode), so a side
    // effect that lives inside one isn't safe to assume "runs exactly
    // once". The order.stage === "Ordered" branch further down already
    // has this same issue with its own real writes (pre-existing, not
    // introduced here) — not fixing that one now, out of scope, but not
    // repeating the same mistake in new code either.
    const orderForNote = orders.find((o) => o.id === orderId)
    const isReorderForNote = orderForNote != null && orderForNote.stage !== "Ordered"

    // Real, durable write closing the loop on a repurchase — see
    // mapToPurchases' doc comment and data/wishdrop-qc-repurchase-signal.sql
    // for the full "why". Fire-and-forget, same pattern as addInternalNote
    // below: the local Purchase[] update further down already gives the
    // admin immediate feedback, but this is what makes the item survive
    // the NEXT refetch as "bought again, awaiting QC" instead of
    // snapping back to "needs_purchase" the instant this very write's own
    // realtime event fires (order_item_issues is one of the tables this
    // app subscribes to).
    const openIssue = openQcIssueByItemId.current.get(orderItemId)
    const isRepurchase = openIssue?.resolution === "retry_same" && !openIssue.replacementPurchasedAt
    if (isRepurchase && openIssue) {
      markReplacementPurchased(openIssue.id).catch((err) =>
        console.error("[markPurchased] failed to record replacement-purchased", err),
      )
    }

    setPurchases((prev) => {
      const existing = prev.find((p) => p.orderId === orderId && p.orderItemId === orderItemId)
      const now = new Date().toISOString()

      // A re-purchase for a specific item (see reorderFaultyItem below)
      // happens on an order that's already well past "Ordered" — the
      // "every item purchased -> enter QC" logic further down only
      // fires from the "Ordered" stage, so without this, a reordered
      // item would sit at "purchased" forever and never reach an
      // inspector. If the order isn't "Ordered" anymore, there's no
      // bulk-order transition waiting on this purchase — the only
      // reason an item would still be "needs_purchase" at that point is
      // a deliberate reorder, so route it straight into QC itself.
      const order = orders.find((o) => o.id === orderId)
      const isReorderPurchase = order != null && order.stage !== "Ordered"

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
                  ...(isReorderPurchase
                    ? { enteredQcAt: now, qcStatus: "pending" as QCStatus, qcPhotoCount: 0, qcNote: undefined, qcResolvedAt: undefined }
                    : {}),
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

          // Real write: the real `purchases` table is order-level (see
          // orders-admin.ts header), so "every item purchased" is the
          // moment that record is worth writing — matches this function's
          // own auto-advance logic above exactly.
          const realId = resolveRealId(orderId)
          if (realId) {
            realUpsertPurchaseForOrder(realId, {
              channel: order.channel,
              sourceStore: order.items[0]?.sellerName ?? "Unknown store",
              amount: order.totalValue,
              status: "purchased",
              receiptRef: purchaseReference,
            })
            realSetOrderStage(realId, "quality_check", currentUser.id, "All items purchased")
          }
        }
      }

      return updated
    })

    // Real, permanent trail on the order (unlike this function's own
    // Purchase-state changes above, which are local-only — see
    // reorderFaultyItem's doc comment) marking the moment the
    // replacement was actually bought, so /admin/orders/[orderId] shows
    // the full arc: flagged -> reordered -> re-purchased -> (once
    // re-QC'd) resolved, not just the first step. Runs once per actual
    // markPurchased call, not tied to setPurchases' updater.
    if (isReorderForNote && orderForNote) {
      const itemTitle = orderForNote.items.find((i) => i.id === orderItemId)?.title ?? "item"
      addInternalNote(
        orderId,
        `🛒 Replacement re-purchased for "${itemTitle}" — ₹${actualUnitPriceINR.toLocaleString("en-IN")}${purchaseReference ? `, ref ${purchaseReference}` : ""}. Back in Quality check.`
      )
    }
  }

  /**
   * Optimistic, LOCAL-ONLY nudge for immediate UI feedback right after
   * "Retry with a new unit" is clicked (see resolveRetrySame in
   * lib/supabase/qc-issues.ts, called just before this from
   * /admin/qc-issues/[issueId]/page.tsx's handleRetrySame) — resets this
   * ONE item's local Purchase row to "needs_purchase" so the Purchases
   * queue updates instantly instead of waiting on a refetch. Deliberately
   * does NOT touch order.stage or any other item on the order: the rest
   * of the order can already be sitting "passed" in QC or even packed —
   * this only pulls the one faulty item itself back a stage.
   *
   * This is no longer what makes the repurchase state CORRECT, only what
   * makes it feel instant — the real, durable signal is
   * order_item_issues.replacement_purchased_at (written by
   * markReplacementPurchased, read by mapToPurchases'
   * awaitingRepurchaseItemIds), which is what survives the realtime
   * refetch that fires moments later on the very order_item_issues write
   * resolveRetrySame just made. Before that durable signal existed, this
   * local reset alone was what got silently overwritten by that refetch
   * — see mapToPurchases' doc comment for the full story of that bug.
   */
  const reorderFaultyItem = (orderId: string, orderItemId: string, issueNote: string) => {
    setPurchases((prev) =>
      prev.map((p) =>
        p.orderId === orderId && p.orderItemId === orderItemId
          ? {
              ...p,
              status: "needs_purchase" as PurchaseStatus,
              issueNote,
              enteredQueueAt: new Date().toISOString(),
              enteredQcAt: undefined,
              qcStatus: undefined,
              qcNote: undefined,
              qcPhotoCount: 0,
              qcResolvedAt: undefined,
            }
          : p
      )
    )
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

    // Real write: the closest real equivalent to "unavailable" is a
    // failed purchase (real purchase_status has pending/purchased/failed,
    // no "unavailable") — see orders-admin.ts header for why this file's
    // per-item flag maps onto one order-level real row.
    const order = orders.find((o) => o.id === orderId)
    const realId = resolveRealId(orderId)
    if (realId && order) {
      realUpsertPurchaseForOrder(realId, {
        channel: order.channel,
        sourceStore: order.items.find((i) => i.id === orderItemId)?.sellerName ?? "Unknown store",
        amount: order.totalValue,
        status: "failed",
        failReason: issueNote.trim(),
      })
    }
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
        chatThreadId: order.chatThreadId,
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

  // receiveAtQc/addQcPhoto stay LOCAL-ONLY — there's no real column for
  // "arrived at QC" timing or a photo count (see orders-admin.ts header),
  // and neither is load-bearing business state (submitQcResult below,
  // which IS wired to a real write, is what actually matters). Flag if
  // QC photo evidence needs to become real; it'd need a small table.
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

    const realId = resolveRealId(purchase.orderId)

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
        if (realId) {
          realAddInternalNote(realId, currentUser.id, `QC flagged: ${trimmed}`)
          realSetOrderDelayed(realId, true)
        }
      }
    } else if (status === "passed" && realId) {
      // Real write: 'quality_check' stays the real DB stage — passing QC
      // is tracked as a substage marker (qc_passed), not an enum change.
      // See orders-admin.ts header for why (packOrder below is what
      // actually flips the real stage to 'shipped').
      realSetWarehouseSubstage(realId, "qc_passed", currentUser.id, note.trim() || "Passed QC")
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
    const realId = resolveRealId(orderId)
    if (realId) {
      realSetOrderPackageDetails(realId, currentUser.id, {
        weightKg,
        lengthCm: dimensionsCm.length,
        widthCm: dimensionsCm.width,
        heightCm: dimensionsCm.height,
        labelRef: ref,
      })
    }
    return ref
  }

  const packOrder = (orderId: string) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId && o.stage === "Quality check" && !o.packedAt ? { ...o, packedAt: new Date().toISOString() } : o))
    )
    const realId = resolveRealId(orderId)
    if (realId) realPackOrder(realId, currentUser.id)
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
    const realId = resolveRealId(orderId)
    if (realId) {
      // Real stage stays 'shipped' (already set at packing) — pickup is
      // tracked as a substage marker plus the real carrier/tracking
      // columns, same fields the customer's Track Order page reads.
      realSetWarehouseSubstage(realId, "in_transit", currentUser.id, `Picked up by ${courier}`)
      realSetOrderShipping(realId, { carrier: courier, trackingNumber: trackingRef })
    }
  }

  // -- In transit ------------------------------------------------------

  const inTransitLines = useMemo<InTransitLine[]>(() => {
    return orders.flatMap((order) => {
      if (!order.pickedUpAt || order.stage !== "Quality check") return []
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
        chatThreadId: order.chatThreadId,
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

  /** In-Transit "Mark shipped": arrived at the Sri Lanka warehouse — the real enum change from "Quality check" to "Shipped". */
  const markShipped = (orderId: string) => {
    setOrders((prev) => prev.map((o) => (o.id === orderId && o.pickedUpAt && o.stage === "Quality check" ? withStageChange(o, "Shipped") : o)))
    const realId = resolveRealId(orderId)
    if (realId) realMarkShipped(realId, currentUser.id)
  }

  /**
   * Arrived at the SL warehouse, awaiting local delivery. Distinct from
   * inTransitLines above — an order leaves that queue and enters this
   * one the moment markShipped fires (real stage flips to "Shipped"),
   * not when it's physically picked up by a courier internationally.
   */
  const shippedLines = useMemo<ShippedLine[]>(() => {
    return orders.flatMap((order) => {
      if (order.stage !== "Shipped") return []
      const siteName = SITES.find((s) => s.id === order.siteId)?.name ?? order.siteId
      const shippedAgeHours = hoursSince(order.stageEnteredAt)
      return [{
        id: order.id,
        orderId: order.id,
        orderNumber: order.id,
        customerName: order.customerName,
        siteId: order.siteId,
        site: siteName,
        channel: order.channel,
        destination: order.destination ?? siteName,
        courier: order.courier,
        trackingRef: order.trackingRef,
        shippedAgeHours,
        shippedAgeLabel: formatAge(shippedAgeHours),
        chatThreadId: order.chatThreadId,
      }]
    })
  }, [orders])

  const visibleShippedLines = useMemo(() => {
    if (permissions.ordersScopedToOwnSite && currentUser.siteId) {
      return shippedLines.filter((l) => l.siteId === currentUser.siteId)
    }
    return shippedLines
  }, [shippedLines, permissions.ordersScopedToOwnSite, currentUser.siteId])

  const getShippedLine = (orderId: string) => shippedLines.find((l) => l.id === orderId)

  const canActOnShippedLine = (line: ShippedLine) =>
    permissions.canMutateOrderStage && (!permissions.ordersScopedToOwnSite || line.siteId === currentUser.siteId)

  /**
   * Manager-only hard delete (permissions.canDelete) — per the delete
   * policy, this is a real row removal, not a status flip. Order_items
   * and stage history cascade in the real DB (see deleteOrderReal), so
   * this is one call, not a multi-step cleanup. Not gated a second time
   * here beyond the permission check — the UI (order detail page) only
   * renders this action at all for a Manager, same pattern as every
   * other role-gated control in this file.
   */
  const deleteOrder = (orderId: string) => {
    if (!permissions.canDelete) return
    setOrders((prev) => prev.filter((o) => o.id !== orderId))
    const realId = resolveRealId(orderId)
    if (realId) deleteOrderReal(realId)
  }

  /** Shipped page's "Mark delivered": local delivery complete — final real enum change. */
  const markDelivered = (orderId: string) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId || o.stage !== "Shipped" || o.deliveredAt) return o
        return { ...withStageChange(o, "Delivered"), deliveredAt: new Date().toISOString() }
      })
    )
    const realId = resolveRealId(orderId)
    if (realId) realConfirmDelivery(realId, "warehouse", currentUser.id)
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
      const staffName = staffDirectory.find((s) => s.id === r.assignedStaffId)?.name ?? "Unassigned"
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
        payment: r.payment,
      }
    })
  }, [requests, orders, staffDirectory])

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
    // Real write: the real `requests` row is single-item (see
    // requests-admin.ts header), so quoting its one synthesized item IS
    // quoting the whole request — matches this function's own
    // allQuoted-flips-status logic above exactly.
    realSetRequestQuote(requestId, amount, currentUser.id)
  }

  /**
   * Manually attaches/replaces the product photo for a request — the
   * admin-upload path for when the OG scrape found no image at all, or
   * found the wrong one. Whatever's set here is what confirmRequest below
   * carries onto the new order's order_items.screenshot_url, so this is
   * also how a missing/bad photo gets fixed before the order is created.
   */
  const setRequestScreenshot = (requestId: string, itemId: string, url: string) => {
    setRequests((prev) =>
      prev.map((r) =>
        r.id === requestId
          ? { ...r, items: r.items.map((item) => (item.id === itemId ? { ...item, screenshotUrl: url } : item)) }
          : r
      )
    )
    setRequestScreenshotReal(requestId, url)
  }

  /**
   * Records the confirmed variant (size/color/etc.) once the admin has
   * actually confirmed it with the customer over chat — replaces the old
   * "[Confirm size/color with customer]" tag, which had nowhere to
   * capture the answer once someone actually got it. Whatever's set here
   * gets prepended onto the order's item name at confirm time (see
   * confirmRequestReal in requests-admin.ts) — e.g. "Size M, Black -
   * Everyday Seamless Racerback Tank" — instead of being silently
   * dropped.
   */
  const setRequestVariant = (requestId: string, itemId: string, variant: string) => {
    setRequests((prev) =>
      prev.map((r) =>
        r.id === requestId
          ? { ...r, items: r.items.map((item) => (item.id === itemId ? { ...item, confirmedVariant: variant } : item)) }
          : r
      )
    )
    setRequestVariantReal(requestId, variant)
  }

  /**
   * Records that the customer's payment for a quoted request has come in
   * — a distinct step from confirmRequest below. Doesn't touch status or
   * create anything by itself; it only unblocks the "Confirm → creates
   * order" action on the request detail page, since confirmRequestReal
   * now refuses to run until payment is on record (see
   * requests-admin.ts). Re-callable if the amount/reference needs
   * correcting — a request is only ever paid once in practice, so this
   * overwrites rather than keeping a revision trail the way quotes do.
   */
  const confirmPayment = (requestId: string, payment: { amount: number; method: string; reference?: string }) => {
    if (!Number.isFinite(payment.amount) || payment.amount <= 0) return
    const now = new Date().toISOString()
    setRequests((prev) =>
      prev.map((r) =>
        r.id === requestId
          ? {
              ...r,
              payment: {
                amount: payment.amount,
                method: payment.method,
                reference: payment.reference,
                confirmedAt: now,
                confirmedByName: currentUser.name,
              },
            }
          : r
      )
    )
    // Fire-and-forget was silent before — a failed write (e.g. the
    // missing-columns bug this fixed; see
    // data/wishdrop-requests-payment-columns.sql) left the optimistic
    // local state above as the ONLY place the confirmation existed, so
    // it quietly evaporated on the next refetch with no error ever
    // shown. Logging on failure doesn't fully fix that class of bug by
    // itself (the button still needs a real error surface to be
    // bulletproof), but it at least stops a real write failure from
    // being completely invisible.
    confirmRequestPaymentReal(requestId, { ...payment, staffId: currentUser.id }).then((res) => {
      if (!res.ok) console.error('[confirmPayment] real write failed', res.error)
    })
  }

  /**
   * The only place a Channel 3 order is created. Maps EVERY item on the
   * request into its own OrderItem — a 3-product request produces a
   * real 3-item order, which then flows through
   * purchaseLines/qcLines/packLines exactly like any other multi-item
   * order, since those were built item-array-aware from the start.
   * Refuses if any item is still unquoted — status should never be
   * "quoted" while that's true (setQuote enforces it), but this is a
   * defensive re-check so a partial order is never built. Also refuses
   * until confirmPayment has been called for this request — payment
   * must be on record before the request becomes a real order (matches
   * confirmRequestReal's own server-side guard in requests-admin.ts).
   */
  const confirmRequest = async (requestId: string): Promise<{ ok: boolean; orderDisplayId?: string; error?: string }> => {
    const request = requests.find((r) => r.id === requestId)
    if (!request || request.status !== "quoted") return { ok: false, error: "This request isn't ready to confirm." }
    const allQuoted = request.items.every((i) => i.quote !== undefined)
    if (!allQuoted || !request.payment) return { ok: false, error: "This request isn't ready to confirm." }

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
      chatThreadId: request.chatThreadId,
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

    // No auto-send here anymore — the calling page (request detail)
    // shows a SendMessageModal with the order-confirmed draft and sends
    // it explicitly via sendChatMessage once the admin reviews/edits it.
    // Keeping the mutation and the messaging decision separate, same
    // pattern as setQuote/confirmPayment above.

    // Real write: creates the actual channel=3 `orders` row (the only
    // place that happens) and flips the real request to 'confirmed'.
    // AWAITED now, not fire-and-forget — the caller needs the real
    // orderDisplayId back to put in the "order confirmed" message,
    // since the local newOrderId above is only ever a guess (a plain
    // count-based string) that essentially never matches what the DB
    // actually assigns via its own sequence (see
    // data/wishdrop-order-display-id-sequence.sql). Sending a customer
    // a made-up order number they can never actually look up would be
    // worse than a brief wait for the real one.
    const userId = requestUserIdByRequestId.current.get(requestId)
    const firstItem = request.items[0]
    if (!userId || !firstItem) {
      return { ok: false, error: "Could not find this request's customer or item to confirm." }
    }
    const res = await confirmRequestReal(requestId, userId, firstItem.note, firstItem.link, totalValue)
    if (res.ok) {
      loadRealOrders({ silent: true })
      return { ok: true, orderDisplayId: res.orderDisplayId }
    }
    console.error('[confirmRequest] real write failed', res.error)
    return { ok: false, error: res.error }
  }

  /** Terminal, whether it's a Sales decline (unavailable/declined by customer) or a Manager close. */
  const declineRequest = (requestId: string) => {
    setRequests((prev) => prev.map((r) => (r.id === requestId ? { ...r, status: "declined" } : r)))
    declineRequestReal(requestId)
  }

  const reassignRequest = (requestId: string, staffId: string) => {
    setRequests((prev) => prev.map((r) => (r.id === requestId ? { ...r, assignedStaffId: staffId } : r)))
    reassignRequestReal(requestId, staffId)
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

  /**
   * A staff reply always clears the thread's unread flag — it's now the
   * staff's most recent message, not the customer's.
   *
   * FIXED: this used to update local state immediately, then fire
   * sendAdminChatMessage() WITHOUT awaiting it or checking its result —
   * so if the real insert failed (most likely cause: the RLS policy fix
   * in data/wishdrop-admin-requests-chat-rls-fix.sql hasn't actually
   * been run against this Supabase project yet, so a staff session's
   * insert into chat_messages gets rejected by the default "own thread
   * only" policy), the admin's own screen still showed the message as
   * sent — local state doesn't know the difference — while the customer
   * never received anything at all, with zero error surfaced anywhere.
   * Now genuinely awaits the real write FIRST and only reflects it
   * locally on success, returning ok/error so callers (SendMessageModal)
   * can show a real failure instead of silently pretending it worked.
   */
  const sendChatMessage = async (threadId: string, body: string, attachmentUrl?: string): Promise<{ ok: boolean; error?: string }> => {
    const trimmed = body.trim()
    if (!trimmed && !attachmentUrl) return { ok: false, error: "Message is empty." }

    const thread = chatThreads.find((t) => t.id === threadId)
    const result = await sendAdminChatMessage(threadId, currentUser.name, trimmed, thread?.requestId, attachmentUrl)
    if (!result.ok) {
      console.error("[sendChatMessage] real write failed — nothing was sent to the customer", result.error)
      return { ok: false, error: result.error ?? "Failed to send message. Please try again." }
    }

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
          attachmentUrl,
        }
        return { ...t, messages: [...t.messages, message], lastActivity: now, unread: false }
      })
    )
    return { ok: true }
  }

  const markThreadRead = (threadId: string) => {
    setChatThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, unread: false } : t)))
    markThreadReadReal(threadId)
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
    markSentViaWhatsAppReal(messageId)
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
    // orders/purchases/requests/chat are all real now — "reset" means
    // refetch from Supabase, not reload a local seed array
    // (INITIAL_ORDERS/INITIAL_PURCHASES/INITIAL_REQUESTS/
    // INITIAL_CHAT_THREADS are just empty placeholders now, see the REAL
    // DATA ADAPTERS section).
    loadRealOrders()
    loadRealRequests()
  }

  const value: AdminDataContextValue = {
    role,
    currentUser,
    permissions,
    sites: SITES,
    staffDirectory,
    staffLoading,
    previewRole,
    setPreviewRole,
    createStaffAccount,
    updateStaffAccount,
    deactivateStaffAccount,
    deleteStaffAccount,
    dataLoading: ordersLoading || requestsLoading,
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
    setOrderDelayedExplicit,
    bulkFlagDelayed,
    addInternalNote,
    purchaseLines,
    visiblePurchaseLines,
    getPurchaseLine,
    canActOnPurchaseLine,
    markPurchased,
    reorderFaultyItem,
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
    markShipped,
    shippedLines,
    visibleShippedLines,
    getShippedLine,
    canActOnShippedLine,
    markDelivered,
    deleteOrder,
    requestLines,
    getRequestLine,
    canWorkRequestLine,
    canReassignRequestLine,
    canCloseRequestLine,
    setQuote,
    setRequestScreenshot,
    setRequestVariant,
    confirmPayment,
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

  // Real staff identity hasn't resolved yet (or failed to) — render a
  // small loading/error screen INSTEAD OF children, rather than letting
  // any admin page render with the inert placeholder currentUser from
  // the top of this component. The Provider itself still always wraps
  // with a validly-typed `value` (every hook above ran normally either
  // way), so nothing about the context's shape changes — only whether
  // `children` gets to render at all.
  if (currentUserError) {
    return (
      <AdminDataContext.Provider value={value}>
        <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-parchment px-6 text-center font-body">
          <p className="font-display text-lg text-ink">Couldn&apos;t verify your staff account</p>
          <p className="max-w-sm text-sm text-ink/55">{currentUserError}</p>
          <a href="/admin/login" className="mt-2 text-sm font-semibold text-teal-deep hover:underline">
            Back to sign in
          </a>
        </div>
      </AdminDataContext.Provider>
    )
  }

  if (!currentUserReady) {
    return (
      <AdminDataContext.Provider value={value}>
        <div className="flex min-h-screen items-center justify-center bg-parchment font-body text-sm text-ink/40">
          Loading your account…
        </div>
      </AdminDataContext.Provider>
    )
  }

  return <AdminDataContext.Provider value={value}>{children}</AdminDataContext.Provider>
}

export function useAdminData() {
  const ctx = useContext(AdminDataContext)
  if (!ctx) throw new Error("useAdminData must be used within AdminDataProvider")
  return ctx
}