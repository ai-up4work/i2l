// contexts/AdminDataContext.tsx
"use client";

// AdminDataContext
// ------------------------------------------------------------------
// Single shared data source for every /admin page during the mock phase.
// Pages should never invent their own local copies of orders/sites/etc —
// they read from useAdminData() and call its actions.
//
// SWAP PLAN: when the real backend lands, this file is the only place
// that should change. Keep the hook's return shape (state + action
// function signatures) identical and swap the useState initializers /
// action bodies for fetch calls (React Query, server actions, whatever
// you land on). No page should need to change.
//
// This also owns the role switcher — in production this comes from the
// authenticated session, but for now it's just state here so every page
// can be exercised as Manager / Sales & Purchase / Warehouse without a
// real login.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  InternalNote,
  Order,
  OrderStage,
  Role,
  Site,
  StaffAccount,
} from "@/types/admin";
import { STAGE_ORDER } from "@/types/admin";

// ---------- mock seed data ----------------------------------------

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

const SITES: Site[] = [
  { id: "site-chn", name: "Chennai Hub", location: "Chennai, IN" },
  { id: "site-blr", name: "Bengaluru Hub", location: "Bengaluru, IN" },
  { id: "site-del", name: "Delhi Hub", location: "Delhi, IN" },
];

const STAFF: StaffAccount[] = [
  { id: "u-mgr-1", name: "Anjali Perera", role: "manager", status: "active" },
  { id: "u-sales-1", name: "Kavindu Silva", role: "sales", status: "active" },
  { id: "u-wh-1", name: "Ruwan Fernando", role: "warehouse", siteId: "site-chn", status: "active" },
  { id: "u-wh-2", name: "Dilani Jayasuriya", role: "warehouse", siteId: "site-blr", status: "active" },
];

function seedOrders(): Order[] {
  return [
    {
      id: "ORD-1001",
      customerId: "cust-01",
      customerName: "Nadeesha Rathnayake",
      channel: 1,
      stage: "Quality check",
      siteId: "site-chn",
      delayed: true,
      totalValue: 18450,
      placedAt: hoursAgo(70),
      stageEnteredAt: hoursAgo(60),
      isManualQuote: false,
      items: [
        { id: "it-1", title: "Noise-cancelling headphones", quantity: 1, sku: "CAT-4471" },
      ],
      stageHistory: [
        { stage: "Ordered", at: hoursAgo(70), by: "System" },
        { stage: "Quality check", at: hoursAgo(60), by: "Ruwan Fernando" },
      ],
      internalNotes: [],
    },
    {
      id: "ORD-1002",
      customerId: "cust-02",
      customerName: "Ishan Cooray",
      channel: 2,
      stage: "Shipped",
      siteId: "site-blr",
      delayed: false,
      totalValue: 9200,
      placedAt: hoursAgo(140),
      stageEnteredAt: hoursAgo(20),
      isManualQuote: false,
      items: [
        { id: "it-2", title: "Ceramic cookware set", quantity: 1, sourceSnapshot: "scraped: homestore.in/cookware-set" },
      ],
      stageHistory: [
        { stage: "Ordered", at: hoursAgo(140), by: "System" },
        { stage: "Quality check", at: hoursAgo(110), by: "Dilani Jayasuriya" },
        { stage: "Shipped", at: hoursAgo(20), by: "Dilani Jayasuriya" },
      ],
      internalNotes: [
        { id: "n-1", author: "Dilani Jayasuriya", body: "Box repacked, original packaging was damaged in transit to hub.", at: hoursAgo(19) },
      ],
    },
    {
      id: "ORD-1003",
      customerId: "cust-03",
      customerName: "Sanduni Wickrama",
      channel: 3,
      stage: "Ordered",
      siteId: "site-chn",
      delayed: false,
      totalValue: 6000,
      placedAt: hoursAgo(5),
      stageEnteredAt: hoursAgo(5),
      isManualQuote: true,
      linkedRequestId: "REQ-2044",
      items: [
        { id: "it-3", title: "Boutique embroidered saree (per customer link)", quantity: 1, requestLink: "instagram.com/p/xyz123" },
      ],
      stageHistory: [{ stage: "Ordered", at: hoursAgo(5), by: "System" }],
      internalNotes: [],
    },
    {
      id: "ORD-1004",
      customerId: "cust-04",
      customerName: "Tharindu Bandara",
      channel: 1,
      stage: "Delivered",
      siteId: "site-del",
      delayed: false,
      totalValue: 3200,
      placedAt: hoursAgo(300),
      stageEnteredAt: hoursAgo(40),
      isManualQuote: false,
      items: [{ id: "it-4", title: "Stainless steel water bottle", quantity: 2, sku: "CAT-1190" }],
      stageHistory: [
        { stage: "Ordered", at: hoursAgo(300), by: "System" },
        { stage: "Quality check", at: hoursAgo(260), by: "Warehouse" },
        { stage: "Shipped", at: hoursAgo(120), by: "Warehouse" },
        { stage: "Delivered", at: hoursAgo(40), by: "Warehouse" },
      ],
      internalNotes: [],
    },
    {
      id: "ORD-1005",
      customerId: "cust-05",
      customerName: "Amaya Ranasinghe",
      channel: 2,
      stage: "Quality check",
      siteId: "site-blr",
      delayed: true,
      totalValue: 14100,
      placedAt: hoursAgo(90),
      stageEnteredAt: hoursAgo(75),
      isManualQuote: false,
      items: [{ id: "it-5", title: "Espresso machine", quantity: 1, sourceSnapshot: "scraped: brewhaus.in/espresso-pro" }],
      stageHistory: [
        { stage: "Ordered", at: hoursAgo(90), by: "System" },
        { stage: "Quality check", at: hoursAgo(75), by: "Dilani Jayasuriya" },
      ],
      internalNotes: [],
    },
    {
      id: "ORD-1006",
      customerId: "cust-06",
      customerName: "Kasun Herath",
      channel: 3,
      stage: "Quality check",
      siteId: "site-chn",
      delayed: false,
      totalValue: 24000,
      placedAt: hoursAgo(30),
      stageEnteredAt: hoursAgo(10),
      isManualQuote: true,
      linkedRequestId: "REQ-2039",
      items: [{ id: "it-6", title: "Custom tailored jacket (per request)", quantity: 1, requestLink: "smalltailor.example.com/jacket-42" }],
      stageHistory: [
        { stage: "Ordered", at: hoursAgo(30), by: "System" },
        { stage: "Quality check", at: hoursAgo(10), by: "Ruwan Fernando" },
      ],
      internalNotes: [],
    },
  ];
}

// ---------- context shape ------------------------------------------

interface AdminDataContextValue {
  // role switching (stands in for auth/session until real login exists)
  role: Role;
  setRole: (role: Role) => void;
  currentUser: StaffAccount;

  // reference data
  sites: Site[];
  staff: StaffAccount[];

  // orders domain
  orders: Order[];
  // Role-scoped view: Warehouse only ever sees their own site's orders,
  // everyone else sees all of them. Every /admin/orders* page should
  // read from this instead of `orders` directly so scoping can't be
  // forgotten on a new page.
  visibleOrders: Order[];
  getOrder: (orderId: string) => Order | undefined;
  updateOrderStage: (orderId: string, stage: OrderStage) => void;
  advanceStage: (orderId: string) => void;
  rollbackStage: (orderId: string) => void;
  toggleDelayed: (orderId: string) => void;
  reassignSite: (orderId: string, siteId: string) => void;
  addInternalNote: (orderId: string, body: string) => void;
  bulkFlagDelayed: (orderIds: string[]) => void;

  // permission helpers — centralised so every page checks the same rules
  permissions: {
    canMutateOrderStage: boolean;
    canReassignSite: boolean;
    canBulkFlag: boolean;
    ordersScopedToOwnSite: boolean;
  };
}

const AdminDataContext = createContext<AdminDataContextValue | null>(null);

export function AdminDataProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>("manager");
  const [orders, setOrders] = useState<Order[]>(() => seedOrders());

  const currentUser = useMemo(
    () => STAFF.find((s) => s.role === role) ?? STAFF[0],
    [role]
  );

  const visibleOrders = useMemo(() => {
    if (role === "warehouse") {
      return orders.filter((o) => o.siteId === currentUser.siteId);
    }
    return orders;
  }, [orders, role, currentUser.siteId]);

  const getOrder = useCallback(
    (orderId: string) => orders.find((o) => o.id === orderId),
    [orders]
  );

  const setStage = useCallback((orderId: string, stage: OrderStage) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              stage,
              stageEnteredAt: new Date().toISOString(),
              stageHistory: [
                ...o.stageHistory,
                { stage, at: new Date().toISOString(), by: currentUser.name },
              ],
            }
          : o
      )
    );
  }, [currentUser.name]);

  const updateOrderStage = useCallback((orderId: string, stage: OrderStage) => {
    setStage(orderId, stage);
  }, [setStage]);

  // Advance/rollback walk STAGE_ORDER rather than letting each page
  // hardcode the sequence — this is the only place "what comes next"
  // needs to be known.
  const advanceStage = useCallback((orderId: string) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    const idx = STAGE_ORDER.indexOf(order.stage);
    if (idx === -1 || idx === STAGE_ORDER.length - 1) return; // already at Delivered
    setStage(orderId, STAGE_ORDER[idx + 1]);
  }, [orders, setStage]);

  const rollbackStage = useCallback((orderId: string) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    const idx = STAGE_ORDER.indexOf(order.stage);
    if (idx <= 0) return; // already at Ordered
    setStage(orderId, STAGE_ORDER[idx - 1]);
  }, [orders, setStage]);

  const toggleDelayed = useCallback((orderId: string) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, delayed: !o.delayed } : o))
    );
  }, []);

  const reassignSite = useCallback((orderId: string, siteId: string) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              siteId,
              // Reassigning mid-QC restarts QC at the new site by default —
              // see route spec edge case note.
              stage: o.stage === "Quality check" ? "Ordered" : o.stage,
              stageEnteredAt: new Date().toISOString(),
              stageHistory: [
                ...o.stageHistory,
                {
                  stage: o.stage === "Quality check" ? "Ordered" : o.stage,
                  at: new Date().toISOString(),
                  by: currentUser.name,
                },
              ],
            }
          : o
      )
    );
  }, [currentUser.name]);

  const addInternalNote = useCallback((orderId: string, body: string) => {
    if (!body.trim()) return;
    const note: InternalNote = {
      id: `n-${Date.now()}`,
      author: currentUser.name,
      body,
      at: new Date().toISOString(),
    };
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId ? { ...o, internalNotes: [...o.internalNotes, note] } : o
      )
    );
  }, [currentUser.name]);

  const bulkFlagDelayed = useCallback((orderIds: string[]) => {
    setOrders((prev) =>
      prev.map((o) => (orderIds.includes(o.id) ? { ...o, delayed: true } : o))
    );
  }, []);

  const permissions = useMemo(
    () => ({
      canMutateOrderStage: role === "manager" || role === "warehouse",
      canReassignSite: role === "manager",
      canBulkFlag: role === "manager",
      ordersScopedToOwnSite: role === "warehouse",
    }),
    [role]
  );

  const value: AdminDataContextValue = {
    role,
    setRole,
    currentUser,
    sites: SITES,
    staff: STAFF,
    orders,
    visibleOrders,
    getOrder,
    updateOrderStage,
    advanceStage,
    rollbackStage,
    toggleDelayed,
    reassignSite,
    addInternalNote,
    bulkFlagDelayed,
    permissions,
  };

  return (
    <AdminDataContext.Provider value={value}>
      {children}
    </AdminDataContext.Provider>
  );
}

export function useAdminData() {
  const ctx = useContext(AdminDataContext);
  if (!ctx) {
    throw new Error("useAdminData must be used within an AdminDataProvider");
  }
  return ctx;
}

// ---------- small shared helpers used by orders pages ---------------

export function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3600_000;
}

export function formatAge(hours: number): string {
  if (hours < 1) return "<1h";
  const days = Math.floor(hours / 24);
  const rem = Math.round(hours % 24);
  if (days === 0) return `${rem}h`;
  return `${days}d ${rem}h`;
}