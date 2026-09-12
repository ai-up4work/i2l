// contexts/AdminDataContext.tsx
//
// Local-dev stand-in for a real database. Every admin page reads/writes
// through useAdminData() instead of hitting an API, so pages that share
// an order (e.g. /admin/orders and /admin/orders/[orderId]) stay in
// sync automatically — mutating an order here updates it everywhere,
// same as a real backend would, just kept in React state instead of a
// server. Swapping this out for real API calls later should only mean
// rewriting the function bodies below; every page's call signature
// (getOrder, advanceStage, visibleOrders, etc.) can stay the same.
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
} from "@/types/admin"
import { STAGE_ORDER } from "@/types/admin"

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

function isoHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
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

const ROLE_PERMISSIONS: Record<Role, Permissions> = {
  manager: {
    canMutateOrderStage: true,
    ordersScopedToOwnSite: false,
    canReassignSite: true,
    canBulkFlag: true,
    canToggleDelayed: true,
  },
  sales: {
    canMutateOrderStage: false,
    ordersScopedToOwnSite: false,
    canReassignSite: false,
    canBulkFlag: false,
    canToggleDelayed: false,
  },
  warehouse: {
    canMutateOrderStage: true,
    ordersScopedToOwnSite: true,
    canReassignSite: false,
    canBulkFlag: false,
    canToggleDelayed: false,
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
    items: [{ id: "i1", title: "boAt Rockerz 450 Headphones", quantity: 1, sourceSnapshot: "flipkart.com/boat-rockerz-450 @ ₹1,999" }],
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
    items: [{ id: "i1", title: "Fabindia Cotton Kurta — Indigo, M", quantity: 2, sku: "SKU-1187" }],
  },
  {
    id: "WD-1005", customerName: "Hasini Fernando", channel: 2, stage: "Ordered",
    siteId: "site_kandy", placedHoursAgo: 28, stageEnteredHoursAgo: 28, totalValue: 5400, delayed: true,
    items: [{ id: "i1", title: "Mamaearth Vitamin C Face Serum (Pack of 3)", quantity: 1, sourceSnapshot: "amazon.in/mamaearth-vitc @ ₹899" }],
  },
  {
    id: "WD-1006", customerName: "Chamath Wijesinghe", channel: 1, stage: "Quality check",
    siteId: "site_galle", placedHoursAgo: 70, stageEnteredHoursAgo: 52, totalValue: 21000, delayed: true,
    items: [{ id: "i1", title: "Titan Neo Analog Watch", quantity: 1, sku: "SKU-9021" }],
  },
  {
    id: "WD-1007", customerName: "Anusha Gunawardena", channel: 1, stage: "Shipped",
    siteId: "site_colombo", placedHoursAgo: 90, stageEnteredHoursAgo: 30, totalValue: 6700,
    items: [{ id: "i1", title: "Nykaa Matte Lipstick Trio", quantity: 1, sku: "SKU-3390" }],
  },
  {
    id: "WD-1008", customerName: "Tharindu Bandara", channel: 3, stage: "Ordered",
    siteId: "site_kandy", placedHoursAgo: 8, stageEnteredHoursAgo: 8, totalValue: 9800, isManualQuote: true,
    linkedRequestId: "REQ-2044",
    items: [{ id: "i1", title: "Handloom brass wall décor set", quantity: 1, requestLink: "smallboutique.in/brass-wall-set" }],
  },
  {
    id: "WD-1009", customerName: "Malsha Peiris", channel: 2, stage: "Delivered",
    siteId: "site_colombo", placedHoursAgo: 500, stageEnteredHoursAgo: 60, totalValue: 4100,
    items: [{ id: "i1", title: "Milton Thermosteel Flask 1L", quantity: 2, sourceSnapshot: "flipkart.com/milton-flask @ ₹649" }],
  },
  {
    id: "WD-1010", customerName: "Nuwan Karunaratne", channel: 1, stage: "Quality check",
    siteId: "site_colombo", placedHoursAgo: 40, stageEnteredHoursAgo: 12, totalValue: 17600,
    items: [{ id: "i1", title: "Noise ColorFit Pro 4 Smartwatch", quantity: 1, sku: "SKU-5544" }],
  },
  {
    id: "WD-1011", customerName: "Yasodha Silva", channel: 3, stage: "Shipped",
    siteId: "site_galle", placedHoursAgo: 120, stageEnteredHoursAgo: 15, totalValue: 11400, isManualQuote: true,
    linkedRequestId: "REQ-1988",
    items: [{ id: "i1", title: "Custom resin jewelry set (Instagram order)", quantity: 1, requestLink: "instagram.com/p/exampleJewelry" }],
  },
  {
    id: "WD-1012", customerName: "Roshan Amarasekara", channel: 1, stage: "Ordered",
    siteId: "site_kandy", placedHoursAgo: 2, stageEnteredHoursAgo: 2, totalValue: 2600,
    items: [{ id: "i1", title: "Bata Men's Casual Sneakers, UK 9", quantity: 1, sku: "SKU-7702" }],
  },
  {
    id: "WD-1013", customerName: "Kavindi Ranasinghe", channel: 2, stage: "Quality check",
    siteId: "site_kandy", placedHoursAgo: 55, stageEnteredHoursAgo: 51, totalValue: 7300, delayed: true,
    items: [{ id: "i1", title: "Prestige Electric Kettle 1.5L", quantity: 1, sourceSnapshot: "amazon.in/prestige-kettle @ ₹1,299" }],
  },
  {
    id: "WD-1014", customerName: "Buddhika Herath", channel: 1, stage: "Shipped",
    siteId: "site_galle", placedHoursAgo: 100, stageEnteredHoursAgo: 25, totalValue: 13300,
    items: [{ id: "i1", title: "FabIndia Block-Print Bedsheet Set", quantity: 1, sku: "SKU-2265" }],
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
]

function buildOrder(seed: OrderSeed): Order {
  const placedAt = isoHoursAgo(seed.placedHoursAgo)
  const stageEnteredAt = isoHoursAgo(seed.stageEnteredHoursAgo)
  const stageIdx = STAGE_ORDER.indexOf(seed.stage)
  const span = seed.placedHoursAgo - seed.stageEnteredHoursAgo

  // Reconstruct a plausible stage history: every prior stage gets an
  // interpolated timestamp between placedAt and stageEnteredAt, and the
  // current stage's entry matches stageEnteredAt exactly.
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
  }
}

const INITIAL_ORDERS: Order[] = SEEDS.map(buildOrder)

/* ------------------------------------------------------------------ */
/* Context                                                              */
/* ------------------------------------------------------------------ */

interface AdminDataContextValue {
  role: Role
  setRole: (role: Role) => void
  currentUser: CurrentUser
  permissions: Permissions
  sites: Site[]
  orders: Order[]
  visibleOrders: Order[]
  getOrder: (id: string) => Order | undefined
  advanceStage: (orderId: string) => void
  rollbackStage: (orderId: string) => void
  updateOrderStage: (orderId: string, stage: OrderStage) => void
  reassignSite: (orderId: string, siteId: string) => void
  toggleDelayed: (orderId: string) => void
  bulkFlagDelayed: (orderIds: string[]) => void
  addInternalNote: (orderId: string, body: string) => void
}

const AdminDataContext = createContext<AdminDataContextValue | undefined>(undefined)

export function AdminDataProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>("manager")
  const [orders, setOrders] = useState<Order[]>(INITIAL_ORDERS)

  const currentUser = MOCK_USERS[role]
  const permissions = ROLE_PERMISSIONS[role]

  // Warehouse is scoped to its own site everywhere — list, mutation, the
  // works — same principle as the row-level `canMutateThisOrder` guard
  // already in the order detail page.
  const visibleOrders = useMemo(() => {
    if (permissions.ordersScopedToOwnSite && currentUser.siteId) {
      return orders.filter((o) => o.siteId === currentUser.siteId)
    }
    return orders
  }, [orders, permissions.ordersScopedToOwnSite, currentUser.siteId])

  const getOrder = (id: string) => orders.find((o) => o.id === id)

  const withStageChange = (order: Order, stage: OrderStage): Order => {
    const now = new Date().toISOString()
    return {
      ...order,
      stage,
      stageEnteredAt: now,
      stageHistory: [...order.stageHistory, { stage, at: now, by: currentUser.name }],
    }
  }

  const updateOrderStage = (orderId: string, stage: OrderStage) => {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? withStageChange(o, stage) : o)))
  }

  const advanceStage = (orderId: string) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId) return o
        const idx = STAGE_ORDER.indexOf(o.stage)
        return idx >= STAGE_ORDER.length - 1 ? o : withStageChange(o, STAGE_ORDER[idx + 1])
      })
    )
  }

  const rollbackStage = (orderId: string) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId) return o
        const idx = STAGE_ORDER.indexOf(o.stage)
        return idx <= 0 ? o : withStageChange(o, STAGE_ORDER[idx - 1])
      })
    )
  }

  const reassignSite = (orderId: string, siteId: string) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId) return o
        // Reassigning mid-QC restarts QC at the new site — per spec.
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

  const value: AdminDataContextValue = {
    role,
    setRole,
    currentUser,
    permissions,
    sites: SITES,
    orders,
    visibleOrders,
    getOrder,
    advanceStage,
    rollbackStage,
    updateOrderStage,
    reassignSite,
    toggleDelayed,
    bulkFlagDelayed,
    addInternalNote,
  }

  return <AdminDataContext.Provider value={value}>{children}</AdminDataContext.Provider>
}

export function useAdminData() {
  const ctx = useContext(AdminDataContext)
  if (!ctx) throw new Error("useAdminData must be used within AdminDataProvider")
  return ctx
}