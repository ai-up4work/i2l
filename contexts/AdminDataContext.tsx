// contexts/AdminDataContext.tsx
//
// Local-dev stand-in for a real database. Every admin page reads/writes
// through useAdminData() instead of hitting an API, so pages that share
// an order (e.g. /admin/orders and /admin/orders/[orderId]) — and now
// Purchases, Quality check, Pack & label, Export bin, In transit, and
// Requests/Chat too — stay in sync automatically.
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
// IMPORTANT: because those warehouse queues are derived from those
// fields and NOT from `stage` directly, every place that changes an
// order's `stage` — including the free-form stage dropdown and
// advance/rollback buttons on /admin/orders — has to keep those fields
// honest too. That's what withStageTransition below does: it's the one
// chokepoint every stage mutation (advanceStage, rollbackStage,
// updateOrderStage, and internally packOrder/markPickedUp/markDelivered,
// confirmRequest) funnels through.
"use client"

import { createContext, useContext, useMemo, useState, type ReactNode } from "react"
import type {
  Role,
  Channel,
  Order,
  OrderItem,
  OrderStage,
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
  QuoteHistoryEntry,
  ChatThread,
  ChatMessage,
  ChatSender,
  StaffMember,
  RequestLine,
} from "@/types/admin"
import {
  STAGE_ORDER,
  ORDER_AGE_BREACH_HOURS,
  IN_TRANSIT_DEFAULT_ETA_HOURS,
  IN_TRANSIT_DUE_SOON_WINDOW_HOURS,
  REQUEST_SLA_HOURS,
} from "@/types/admin"

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
/* Reference data                                                      */
/* ------------------------------------------------------------------ */

const SITES: Site[] = [
  { id: "site_colombo", name: "Colombo Hub", location: "Colombo, LK" },
  { id: "site_kandy", name: "Kandy Hub", location: "Kandy, LK" },
  { id: "site_galle", name: "Galle Hub", location: "Galle, LK" },
]

// One mock logged-in user per role. RoleSwitcher flips `role`, and
// currentUser is derived from this map — switching to Warehouse always
// hands you a user already scoped to a site, same as production.
const MOCK_USERS: Record<Role, CurrentUser> = {
  manager: { id: "u_mgr_1", name: "Amara Perera", role: "manager" },
  sales: { id: "u_sales_1", name: "Nadia Fernando", role: "sales" },
  warehouse: { id: "u_wh_1", name: "Kasun Silva", role: "warehouse", siteId: "site_colombo" },
}

// Reference roster for the reassign-request dropdown. Distinct from
// MOCK_USERS (the single logged-in account per role) — this is meant to
// grow into the real /admin/staff roster later, so it deliberately
// includes a second Sales account MOCK_USERS doesn't have.
const STAFF_DIRECTORY: StaffMember[] = [
  { id: "u_sales_1", name: "Nadia Fernando", role: "sales" },
  { id: "u_sales_2", name: "Ruvindi Jayasekara", role: "sales" },
  { id: "u_mgr_1", name: "Amara Perera", role: "manager" },
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
/* Seed orders — this is the "table". Add a row here to grow the mock  */
/* database; stage history + ages are all derived, not hand-written.   */
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

const SEEDS: OrderSeed[] = [
  {
    id: "WD-1001", customerName: "Ishara Jayasuriya", channel: 1, stage: "Delivered",
    siteId: "site_colombo", placedHoursAgo: 410, stageEnteredHoursAgo: 40, totalValue: 12500,
    items: [{ id: "i1", title: "Banarasi Silk Saree — Maroon", quantity: 1, sku: "SKU-4821" }],
  },
  {
    id: "WD-1002", customerName: "Ruwan Dissanayake", channel: 2, stage: "Shipped",
    siteId: "site_kandy", placedHoursAgo: 150, stageEnteredHoursAgo: 18, totalValue: 8300,
    destination: "Kandy town", packedHoursAgo: 18, packageWeightKg: 0.4,
    packageDimensionsCm: { length: 18, width: 14, height: 8 },
    labelGeneratedHoursAgo: 18, labelRef: "DMX-88213",
    courier: "Domex", trackingRef: "DMX-88213", pickedUpHoursAgo: 10, etaHours: 24,
    items: [{
      id: "i1", title: "boAt Rockerz 450 Headphones", quantity: 1,
      sourceSnapshot: "flipkart.com/boat-rockerz-450 @ ₹1,999",
      unitPrice: 1999,
      productImage: "https://images.pexels.com/photos/3945667/pexels-photo-3945667.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop",
      sellerName: "Flipkart Seller — AudioTech", sellerType: "feed",
      storeUrl: "https://www.flipkart.com/boat-rockerz-450",
    }],
  },
  {
    id: "WD-1003", customerName: "Sithara Wickramasinghe", channel: 3, stage: "Quality check",
    siteId: "site_galle", placedHoursAgo: 60, stageEnteredHoursAgo: 50, totalValue: 15200,
    delayed: true, isManualQuote: true, linkedRequestId: "REQ-2031",
    items: [{ id: "i1", title: "Custom embroidered lehenga (Instagram boutique order)", quantity: 1, requestLink: "instagram.com/p/exampleLehenga" }],
    internalNotes: [{ body: "Seller confirmed stock, waiting on customer sizing photo before QC.", author: "Nadia Fernando", hoursAgo: 30 }],
  },
  {
    id: "WD-1004", customerName: "Dilshan Rathnayake", channel: 1, stage: "Ordered",
    siteId: "site_colombo", placedHoursAgo: 5, stageEnteredHoursAgo: 5, totalValue: 3200,
    items: [{
      id: "i1", title: "Fabindia Cotton Kurta", quantity: 2, sku: "SKU-1187",
      variant: "Indigo, size M",
      unitPrice: 1600,
      productImage: "https://images.pexels.com/photos/20791992/pexels-photo-20791992.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop",
      sellerName: "Fabindia", sellerType: "feed",
      storeUrl: "https://www.fabindia.com/products/cotton-kurta-indigo",
    }],
  },
  {
    id: "WD-1005", customerName: "Hasini Fernando", channel: 2, stage: "Ordered",
    siteId: "site_kandy", placedHoursAgo: 28, stageEnteredHoursAgo: 28, totalValue: 5400, delayed: true,
    items: [{
      id: "i1", title: "Mamaearth Vitamin C Face Serum (Pack of 3)", quantity: 1,
      sourceSnapshot: "amazon.in/mamaearth-vitc @ ₹899",
      unitPrice: 899,
      productImage: "https://images.pexels.com/photos/5632343/pexels-photo-5632343.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop",
      sellerName: "Amazon Seller — Mamaearth Official", sellerType: "feed",
      storeUrl: "https://www.amazon.in/mamaearth-vitc",
    }],
  },
  {
    id: "WD-1006", customerName: "Chamath Wijesinghe", channel: 1, stage: "Quality check",
    siteId: "site_galle", placedHoursAgo: 70, stageEnteredHoursAgo: 52, totalValue: 21000, delayed: true,
    items: [{ id: "i1", title: "Titan Neo Analog Watch", quantity: 1, sku: "SKU-9021",
      productImage: "https://images.pexels.com/photos/9978722/pexels-photo-9978722.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop",
      sellerName: "Titan Company", sellerType: "feed",
    }],
  },
  {
    id: "WD-1007", customerName: "Anusha Gunawardena", channel: 1, stage: "Shipped",
    siteId: "site_colombo", placedHoursAgo: 90, stageEnteredHoursAgo: 30, totalValue: 6700,
    destination: "Colombo 03", packedHoursAgo: 30, packageWeightKg: 0.3,
    packageDimensionsCm: { length: 12, width: 9, height: 6 },
    labelGeneratedHoursAgo: 30, labelRef: "DMX-88190",
    items: [{ id: "i1", title: "Nykaa Matte Lipstick Trio", quantity: 1, sku: "SKU-3390" }],
  },
  {
    id: "WD-1008", customerName: "Tharindu Bandara", channel: 3, stage: "Ordered",
    siteId: "site_kandy", placedHoursAgo: 8, stageEnteredHoursAgo: 8, totalValue: 9800, isManualQuote: true,
    linkedRequestId: "REQ-2044",
    items: [{
      id: "i1", title: "Handloom brass wall décor set", quantity: 1,
      requestLink: "smallboutique.in/brass-wall-set",
      unitPrice: 9800,
      productImage: "https://images.pexels.com/photos/6444368/pexels-photo-6444368.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop",
      sellerName: "smallboutique.in (manual request)", sellerType: "manual",
    }],
  },
  {
    id: "WD-1009", customerName: "Malsha Peiris", channel: 2, stage: "Delivered",
    siteId: "site_colombo", placedHoursAgo: 500, stageEnteredHoursAgo: 60, totalValue: 4100,
    items: [{ id: "i1", title: "Milton Thermosteel Flask 1L", quantity: 2, sourceSnapshot: "flipkart.com/milton-flask @ ₹649" }],
  },
  {
    id: "WD-1010", customerName: "Nuwan Karunaratne", channel: 1, stage: "Quality check",
    siteId: "site_colombo", placedHoursAgo: 40, stageEnteredHoursAgo: 12, totalValue: 17600,
    items: [{ id: "i1", title: "Noise ColorFit Pro 4 Smartwatch", quantity: 1, sku: "SKU-5544",
      productImage: "https://images.pexels.com/photos/437037/pexels-photo-437037.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop",
      sellerName: "Noise", sellerType: "feed",
    }],
  },
  {
    id: "WD-1011", customerName: "Yasodha Silva", channel: 3, stage: "Shipped",
    siteId: "site_galle", placedHoursAgo: 120, stageEnteredHoursAgo: 15, totalValue: 11400, isManualQuote: true,
    linkedRequestId: "REQ-1988", destination: "Galle Fort",
    packedHoursAgo: 15, packageWeightKg: 1.1, labelGeneratedHoursAgo: 15, labelRef: "PRT-55031",
    courier: "Pronto", trackingRef: "PRT-55031", pickedUpHoursAgo: 40, etaHours: 24,
    items: [{ id: "i1", title: "Custom resin jewelry set (Instagram order)", quantity: 1, requestLink: "instagram.com/p/exampleJewelry" }],
  },
  {
    id: "WD-1012", customerName: "Roshan Amarasekara", channel: 1, stage: "Ordered",
    siteId: "site_kandy", placedHoursAgo: 2, stageEnteredHoursAgo: 2, totalValue: 2600,
    items: [{
      id: "i1", title: "Bata Men's Casual Sneakers", quantity: 1, sku: "SKU-7702",
      variant: "UK 9",
      unitPrice: 2600,
      productImage: "https://images.pexels.com/photos/2529148/pexels-photo-2529148.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop",
      sellerName: "Bata India", sellerType: "feed",
      storeUrl: "https://www.bata.in/products/mens-casual-sneakers",
    }],
  },
  {
    id: "WD-1013", customerName: "Kavindi Ranasinghe", channel: 2, stage: "Quality check",
    siteId: "site_kandy", placedHoursAgo: 55, stageEnteredHoursAgo: 51, totalValue: 7300, delayed: true,
    items: [{
      id: "i1", title: "Prestige Electric Kettle 1.5L", quantity: 1,
      sourceSnapshot: "amazon.in/prestige-kettle @ ₹1,299",
      unitPrice: 1299,
      productImage: "https://images.pexels.com/photos/6996091/pexels-photo-6996091.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop",
      sellerName: "Amazon Seller — Prestige Store", sellerType: "feed",
      storeUrl: "https://www.amazon.in/prestige-kettle",
    }],
  },
  {
    id: "WD-1014", customerName: "Buddhika Herath", channel: 1, stage: "Shipped",
    siteId: "site_galle", placedHoursAgo: 100, stageEnteredHoursAgo: 25, totalValue: 13300,
    destination: "Galle town", packedHoursAgo: 25, packageWeightKg: 2.4,
    labelGeneratedHoursAgo: 25, labelRef: "PRT-54991",
    courier: "Pronto", trackingRef: "PRT-54991", pickedUpHoursAgo: 20, etaHours: 24,
    items: [{
      id: "i1", title: "FabIndia Block-Print Bedsheet Set", quantity: 1, sku: "SKU-2265",
      unitPrice: 13300,
      productImage: "https://images.pexels.com/photos/6969831/pexels-photo-6969831.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop",
      sellerName: "Fabindia", sellerType: "feed",
      storeUrl: "https://www.fabindia.com/products/block-print-bedsheet-set",
    }],
  },
  {
    id: "WD-1015", customerName: "Oshadi Mendis", channel: 3, stage: "Delivered",
    siteId: "site_colombo", placedHoursAgo: 600, stageEnteredHoursAgo: 80, totalValue: 19500, isManualQuote: true,
    linkedRequestId: "REQ-1877",
    items: [{ id: "i1", title: "Bespoke wedding invitation set", quantity: 1, requestLink: "boutiquecards.in/wedding-suite" }],
  },
  {
    id: "WD-1016", customerName: "Lahiru Jayawardena", channel: 2, stage: "Ordered",
    siteId: "site_galle", placedHoursAgo: 14, stageEnteredHoursAgo: 14, totalValue: 3900,
    items: [{ id: "i1", title: "Wonderchef Nutri-Blender", quantity: 1, sourceSnapshot: "amazon.in/wonderchef-blender @ ₹2,199" }],
  },
  {
    id: "WD-1017", customerName: "Priyanka Silva", channel: 1, stage: "Quality check",
    siteId: "site_colombo", placedHoursAgo: 76, stageEnteredHoursAgo: 30, totalValue: 8200,
    destination: "Colombo 05", handlingNote: "Fragile — glass item, double-box",
    items: [{
      id: "i1", title: "Hand-blown glass vase", quantity: 1, sku: "SKU-6610",
      productImage: "https://images.pexels.com/photos/6207516/pexels-photo-6207516.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop",
      sellerName: "ArtisanGlass Co.", sellerType: "feed",
    }],
  },
  {
    id: "WD-1018", customerName: "Ishara Fonseka", channel: 1, stage: "Shipped",
    siteId: "site_colombo", placedHoursAgo: 50, stageEnteredHoursAgo: 1, totalValue: 4300,
    destination: "Negombo", packedHoursAgo: 1, packageWeightKg: 0.9,
    labelGeneratedHoursAgo: 1, labelRef: "DMX-88230",
    items: [{
      id: "i1", title: "Ceramic dinner set", quantity: 1, sku: "SKU-7788",
      productImage: "https://images.pexels.com/photos/6207517/pexels-photo-6207517.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop",
      sellerName: "Home Essentials", sellerType: "feed",
    }],
  },
]

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
/* Seed purchases — one per (orderId, orderItemId).                     */
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

const PURCHASE_SEEDS: PurchaseSeed[] = [
  { id: "pur_1", orderId: "WD-1004", orderItemId: "i1", status: "needs_purchase", enteredQueueHoursAgo: 5 },
  { id: "pur_2", orderId: "WD-1005", orderItemId: "i1", status: "needs_purchase", enteredQueueHoursAgo: 28 },
  { id: "pur_3", orderId: "WD-1012", orderItemId: "i1", status: "needs_purchase", enteredQueueHoursAgo: 2 },
  { id: "pur_4", orderId: "WD-1008", orderItemId: "i1", status: "needs_purchase", enteredQueueHoursAgo: 8 },
  {
    id: "pur_5", orderId: "WD-1002", orderItemId: "i1", status: "purchased", enteredQueueHoursAgo: 150,
    actualUnitPriceINR: 1950, purchaseReference: "FLPKRT-88213", purchasedBy: "Kasun Silva", purchasedAtHoursAgo: 145,
    enteredQcHoursAgo: 22, qcStatus: "passed", qcPhotoCount: 1, qcResolvedHoursAgo: 19,
  },
  {
    id: "pur_6", orderId: "WD-1014", orderItemId: "i1", status: "purchased", enteredQueueHoursAgo: 100,
    actualUnitPriceINR: 13300, purchaseReference: "FAB-2265", purchasedBy: "Amara Perera", purchasedAtHoursAgo: 96,
    enteredQcHoursAgo: 27, qcStatus: "passed", qcPhotoCount: 1, qcResolvedHoursAgo: 26,
  },
  {
    id: "pur_7", orderId: "WD-1013", orderItemId: "i1", status: "unavailable", enteredQueueHoursAgo: 55,
    issueNote: "Seller marked out of stock at checkout — order is delayed waiting on a replacement pick.",
  },
  {
    id: "pur_8", orderId: "WD-1006", orderItemId: "i1", status: "purchased", enteredQueueHoursAgo: 70,
    actualUnitPriceINR: 6200, purchaseReference: "TITAN-9021", purchasedBy: "Kasun Silva", purchasedAtHoursAgo: 54,
    enteredQcHoursAgo: 20, qcStatus: "pending", qcPhotoCount: 0,
  },
  {
    id: "pur_9", orderId: "WD-1010", orderItemId: "i1", status: "purchased", enteredQueueHoursAgo: 40,
    actualUnitPriceINR: 4300, purchaseReference: "NOISE-5544", purchasedBy: "Amara Perera", purchasedAtHoursAgo: 14,
    enteredQcHoursAgo: 10, qcStatus: "flagged",
    qcNote: "Screen has a visible scratch across the display — requesting a replacement unit from the seller.",
    qcPhotoCount: 2,
  },
  {
    id: "pur_10", orderId: "WD-1003", orderItemId: "i1", status: "purchased", enteredQueueHoursAgo: 60,
    actualUnitPriceINR: 15200, purchaseReference: "MANUAL-2031", purchasedBy: "Nadia Fernando", purchasedAtHoursAgo: 8,
    enteredQcHoursAgo: 6, qcStatus: "pending", qcPhotoCount: 1,
  },
  {
    id: "pur_11", orderId: "WD-1017", orderItemId: "i1", status: "purchased", enteredQueueHoursAgo: 76,
    actualUnitPriceINR: 5400, purchaseReference: "GLASS-6610", purchasedBy: "Kasun Silva", purchasedAtHoursAgo: 50,
    enteredQcHoursAgo: 30, qcStatus: "passed", qcPhotoCount: 1, qcResolvedHoursAgo: 26,
  },
  {
    id: "pur_12", orderId: "WD-1018", orderItemId: "i1", status: "purchased", enteredQueueHoursAgo: 50,
    actualUnitPriceINR: 2900, purchaseReference: "HOME-7788", purchasedBy: "Kasun Silva", purchasedAtHoursAgo: 30,
    enteredQcHoursAgo: 10, qcStatus: "passed", qcPhotoCount: 1, qcResolvedHoursAgo: 5,
  },
  {
    id: "pur_13", orderId: "WD-1007", orderItemId: "i1", status: "purchased", enteredQueueHoursAgo: 90,
    actualUnitPriceINR: 5900, purchaseReference: "NYKAA-3390", purchasedBy: "Amara Perera", purchasedAtHoursAgo: 62,
    enteredQcHoursAgo: 31, qcStatus: "passed", qcPhotoCount: 1, qcResolvedHoursAgo: 30,
  },
  {
    id: "pur_14", orderId: "WD-1011", orderItemId: "i1", status: "purchased", enteredQueueHoursAgo: 120,
    actualUnitPriceINR: 11400, purchaseReference: "MANUAL-1988", purchasedBy: "Nadia Fernando", purchasedAtHoursAgo: 60,
    enteredQcHoursAgo: 16, qcStatus: "passed", qcPhotoCount: 1, qcResolvedHoursAgo: 15,
  },
]

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
/* Confirmed requests here (REQ-2031/2044/1988/1877) are ones that       */
/* already spun off an order in SEEDS above (matched via                */
/* Order.linkedRequestId). requestLines below reverse-joins against      */
/* `orders` to find that link live, exactly the way confirmRequest()     */
/* behaves for a NEW confirmation — so seeded and freshly-confirmed      */
/* requests end up looking identical to every page that reads them.      */
/* ------------------------------------------------------------------ */

type RequestSeed = {
  id: string
  customerName: string
  link: string
  note: string
  screenshotUrl?: string
  status: RequestStatus
  submittedHoursAgo: number
  quote?: number
  quoteHistory?: { amount: number; by: string; hoursAgo: number }[]
  assignedStaffId?: string
  chatThreadId: string
}

const REQUEST_SEEDS: RequestSeed[] = [
  {
    id: "REQ-2031", customerName: "Sithara Wickramasinghe",
    link: "https://instagram.com/p/exampleLehenga",
    note: "Custom embroidered lehenga from this boutique's Instagram — need it in my measurements, can send them separately.",
    screenshotUrl: "https://images.pexels.com/photos/8148087/pexels-photo-8148087.jpeg?auto=compress&cs=tinysrgb&w=600",
    status: "confirmed", submittedHoursAgo: 66,
    quote: 15200, quoteHistory: [{ amount: 15200, by: "Nadia Fernando", hoursAgo: 62 }],
    assignedStaffId: "u_sales_1", chatThreadId: "thread-2031",
  },
  {
    id: "REQ-2044", customerName: "Tharindu Bandara",
    link: "https://smallboutique.in/brass-wall-set",
    note: "Handloom brass wall décor set, the 5-piece one shown on the product page.",
    status: "confirmed", submittedHoursAgo: 12,
    quote: 9800, quoteHistory: [{ amount: 9800, by: "Nadia Fernando", hoursAgo: 9 }],
    assignedStaffId: "u_sales_1", chatThreadId: "thread-2044",
  },
  {
    id: "REQ-1988", customerName: "Yasodha Silva",
    link: "https://instagram.com/p/exampleJewelry",
    note: "Custom resin jewelry set — matching earrings and necklace, gold flakes if possible.",
    screenshotUrl: "https://images.pexels.com/photos/1927259/pexels-photo-1927259.jpeg?auto=compress&cs=tinysrgb&w=600",
    status: "confirmed", submittedHoursAgo: 130,
    quote: 11400, quoteHistory: [
      { amount: 12500, by: "Nadia Fernando", hoursAgo: 118 },
      { amount: 11400, by: "Nadia Fernando", hoursAgo: 115 },
    ],
    assignedStaffId: "u_sales_1", chatThreadId: "thread-1988",
  },
  {
    id: "REQ-1877", customerName: "Oshadi Mendis",
    link: "https://boutiquecards.in/wedding-suite",
    note: "Bespoke wedding invitation set, 150 pieces, gold foil, need a proof before full print run.",
    status: "confirmed", submittedHoursAgo: 610,
    quote: 19500, quoteHistory: [{ amount: 19500, by: "Amara Perera", hoursAgo: 605 }],
    assignedStaffId: "u_mgr_1", chatThreadId: "thread-1877",
  },
  {
    // Past SLA, already quoted, waiting on the customer to confirm —
    // the "needs a nudge" example.
    id: "REQ-2091", customerName: "Chathurika Wanigasekara",
    link: "https://trendloop.lk/products/floral-midi-dress",
    note: "Floral midi dress, size S, want to confirm it's the same fabric as the photo before I commit.",
    status: "quoted", submittedHoursAgo: 40,
    quote: 6400, quoteHistory: [{ amount: 6400, by: "Nadia Fernando", hoursAgo: 30 }],
    assignedStaffId: "u_sales_1", chatThreadId: "thread-2091",
  },
  {
    // Past SLA, never even quoted — the sharpest "needs attention" example.
    id: "REQ-2098", customerName: "Dinuka Abeysekara",
    link: "https://glowcosmetics.in/products/vitamin-serum-set",
    note: "The 3-piece vitamin serum set, want to know if it ships with the box shown or just the bottles.",
    status: "sent_for_review", submittedHoursAgo: 36,
    assignedStaffId: "u_sales_2", chatThreadId: "thread-2098",
  },
  {
    // Fresh, well within SLA.
    id: "REQ-2102", customerName: "Sanduni Perera",
    link: "https://meesho.com/products/handbag-tote",
    note: "Tan tote bag, the one with the gold clasp — is it real leather or PU?",
    status: "sent_for_review", submittedHoursAgo: 4,
    assignedStaffId: "u_sales_1", chatThreadId: "thread-2102",
  },
  {
    id: "REQ-2075", customerName: "Kavisha Rodrigo",
    link: "https://randomseller.xyz/item/9981",
    note: "Wanted to check if this phone case is genuine or a knockoff before ordering.",
    status: "declined", submittedHoursAgo: 90,
    assignedStaffId: "u_sales_2", chatThreadId: "thread-2075",
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

function buildRequest(seed: RequestSeed): Request {
  return {
    id: seed.id,
    customerName: seed.customerName,
    link: seed.link,
    note: seed.note,
    screenshotUrl: seed.screenshotUrl,
    sourceDomain: hostnameOf(seed.link),
    status: seed.status,
    submittedAt: isoHoursAgo(seed.submittedHoursAgo),
    quote: seed.quote,
    quoteHistory: (seed.quoteHistory ?? []).map((q) => ({
      amount: q.amount,
      by: q.by,
      at: isoHoursAgo(q.hoursAgo),
    })),
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
  /** Sets/edits the quote — always appended to quoteHistory, never silently overwritten */
  setQuote: (requestId: string, amount: number) => void
  /** Moves a quoted request to confirmed AND creates its Channel 3 order — the only way that order is created */
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
}

const AdminDataContext = createContext<AdminDataContextValue | undefined>(undefined)

export function AdminDataProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>("manager")
  const [orders, setOrders] = useState<Order[]>(INITIAL_ORDERS)
  const [purchases, setPurchases] = useState<Purchase[]>(INITIAL_PURCHASES)
  const [requests, setRequests] = useState<Request[]>(INITIAL_REQUESTS)
  const [chatThreads, setChatThreads] = useState<ChatThread[]>(INITIAL_CHAT_THREADS)

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

  const markPurchased = (orderId: string, orderItemId: string, actualUnitPriceINR: number, purchaseReference?: string) => {
    setPurchases((prev) => {
      const existing = prev.find((p) => p.orderId === orderId && p.orderItemId === orderItemId)
      const now = new Date().toISOString()

      if (existing) {
        return prev.map((p) =>
          p.id === existing.id
            ? {
                ...p,
                status: "purchased",
                actualUnitPriceINR,
                purchaseReference,
                purchasedBy: currentUser.name,
                purchasedAt: now,
                issueNote: undefined,
              }
            : p
        )
      }

      return [
        ...prev,
        {
          id: makeId("pur"),
          orderId,
          orderItemId,
          status: "purchased",
          enteredQueueAt: now,
          actualUnitPriceINR,
          purchaseReference,
          purchasedBy: currentUser.name,
          purchasedAt: now,
        },
      ]
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
   */
  const requestLines = useMemo<RequestLine[]>(() => {
    return requests.map((r) => {
      const ageHours = hoursSince(r.submittedAt)
      const staffName = STAFF_DIRECTORY.find((s) => s.id === r.assignedStaffId)?.name ?? "Unassigned"
      const linkedOrder = orders.find((o) => o.linkedRequestId === r.id)
      const isOpen = r.status === "sent_for_review" || r.status === "quoted"

      return {
        id: r.id,
        customerName: r.customerName,
        link: r.link,
        note: r.note,
        screenshotUrl: r.screenshotUrl,
        sourceDomain: r.sourceDomain,
        status: r.status,
        submittedAt: r.submittedAt,
        quote: r.quote,
        quoteHistory: r.quoteHistory,
        assignedStaffId: r.assignedStaffId,
        assignedStaffName: staffName,
        chatThreadId: r.chatThreadId,
        ageHours,
        ageLabel: formatAge(ageHours),
        slaBreached: isOpen && ageHours > REQUEST_SLA_HOURS,
        linkedOrderId: linkedOrder?.id,
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
   * Always appends to quoteHistory rather than overwriting — the
   * revision history panel on the request detail page depends on every
   * edit being retained, not just the latest number. Moves
   * sent_for_review → quoted on the first quote; leaves status alone on
   * a re-quote of an already-quoted request.
   */
  const setQuote = (requestId: string, amount: number) => {
    if (!Number.isFinite(amount) || amount <= 0) return
    const now = new Date().toISOString()
    setRequests((prev) =>
      prev.map((r) => {
        if (r.id !== requestId) return r
        if (r.status !== "sent_for_review" && r.status !== "quoted") return r
        const entry: QuoteHistoryEntry = { amount, by: currentUser.name, at: now }
        return {
          ...r,
          quote: amount,
          quoteHistory: [...r.quoteHistory, entry],
          status: "quoted",
        }
      })
    )
  }

  /**
   * The only place a Channel 3 order is created. Mints a fresh order id,
   * builds a single OrderItem from the request's link/note, and sets
   * linkedRequestId — that field is what requestLines' reverse-join
   * reads to populate linkedOrderId on every subsequent render. Refuses
   * silently if the request has no quote yet or isn't in a confirmable
   * state, since there's no structured price to seed the order with
   * otherwise.
   */
  const confirmRequest = (requestId: string) => {
    const request = requests.find((r) => r.id === requestId)
    if (!request || request.status !== "quoted" || request.quote === undefined) return

    const newOrderId = `WD-${1000 + orders.length + 1}`
    const now = new Date().toISOString()
    const siteId = SITES[0].id // no site signal on a Channel 3 request yet — defaults to the first hub

    const newOrder: Order = {
      id: newOrderId,
      customerName: request.customerName,
      channel: 3,
      stage: "Ordered",
      siteId,
      placedAt: now,
      stageEnteredAt: now,
      totalValue: request.quote,
      delayed: false,
      isManualQuote: true,
      linkedRequestId: request.id,
      items: [{
        id: "i1",
        title: request.note.length > 60 ? `${request.note.slice(0, 57)}...` : request.note,
        quantity: 1,
        requestLink: request.link,
        unitPrice: request.quote,
      }],
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
   * request into the Channel 2 flow instead of staying Channel 3.
   */
  const retryScrape = (requestId: string): { success: boolean; message: string } => {
    const request = requests.find((r) => r.id === requestId)
    if (!request) return { success: false, message: "Request not found." }
    return {
      success: false,
      message: `${request.sourceDomain} still has no working extractor configured — this request stays a manual quote for now.`,
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

  const value: AdminDataContextValue = {
    role,
    setRole,
    currentUser,
    permissions,
    sites: SITES,
    staffDirectory: STAFF_DIRECTORY,
    orders,
    visibleOrders,
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
  }

  return <AdminDataContext.Provider value={value}>{children}</AdminDataContext.Provider>
}

export function useAdminData() {
  const ctx = useContext(AdminDataContext)
  if (!ctx) throw new Error("useAdminData must be used within AdminDataProvider")
  return ctx
}