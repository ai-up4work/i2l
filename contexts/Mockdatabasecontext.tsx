"use client";

import React, { createContext, useContext, useSyncExternalStore } from "react";
import { mockDb } from "@/data/Store";
import { seedData } from "@/data/admin";
import type {
  Order,
  Request,
  ChatThread,
  Seller,
  CatalogueProduct,
  Discount,
  Collection,
  Purchase,
  StaffAccount,
  Site,
  ScrapeHealthEntry,
} from "@/types/admin-mock";

// ============================================================================
// Provider
// ============================================================================
// Thin wrapper: the store itself is a module-level singleton (so it behaves
// like a shared realtime connection rather than something re-created per
// component tree), but wrapping it in a Provider gives you one obvious place
// to mount at the root of app/admin/layout.tsx, and a spot to hang the
// role-switcher / "reset demo data" controls off of.

interface MockDatabaseContextValue {
  db: typeof mockDb;
}

const MockDatabaseContext = createContext<MockDatabaseContextValue | null>(null);

export function MockDatabaseProvider({ children }: { children: React.ReactNode }) {
  return (
    <MockDatabaseContext.Provider value={{ db: mockDb }}>{children}</MockDatabaseContext.Provider>
  );
}

function useDbInstance() {
  const ctx = useContext(MockDatabaseContext);
  if (!ctx) {
    throw new Error("useMockDb hooks must be used inside <MockDatabaseProvider>");
  }
  return ctx.db;
}

// Server snapshot must be referentially stable across calls during SSR —
// seedData works fine since the server never mutates it.
const getServerSnapshot = () => seedData;

// ============================================================================
// Generic subscription helper
// ============================================================================

function useDbSelector<T>(select: (snapshot: ReturnType<typeof mockDb.getSnapshot>) => T): T {
  const db = useDbInstance();
  return useSyncExternalStore(
    db.subscribe,
    () => select(db.getSnapshot()),
    () => select(getServerSnapshot())
  );
}

// ============================================================================
// Orders
// ============================================================================

export function useOrders(): Order[] {
  return useDbSelector((s) => s.orders);
}

export function useOrder(orderId: string): Order | undefined {
  return useDbSelector((s) => s.orders.find((o) => o.id === orderId));
}

/** Matches the route-spec role scoping: Warehouse only sees their own site's rows. */
export function useOrdersForCurrentUser(): Order[] {
  const orders = useOrders();
  const user = useCurrentUser();
  if (!user) return [];
  if (user.role === "warehouse") return orders.filter((o) => o.siteId === user.siteId);
  return orders; // manager + sales see everything (sales read-only)
}

// ============================================================================
// Requests (Channel 3)
// ============================================================================

export function useRequests(): Request[] {
  return useDbSelector((s) => s.requests);
}

export function useRequest(requestId: string): Request | undefined {
  return useDbSelector((s) => s.requests.find((r) => r.id === requestId));
}

// ============================================================================
// Chat
// ============================================================================

export function useChatThreads(): ChatThread[] {
  return useDbSelector((s) => s.chatThreads);
}

export function useChatThread(threadId: string | undefined): ChatThread | undefined {
  return useDbSelector((s) => (threadId ? s.chatThreads.find((t) => t.id === threadId) : undefined));
}

// ============================================================================
// Sellers & Catalogue
// ============================================================================

export function useSellers(): Seller[] {
  return useDbSelector((s) => s.sellers);
}

export function useSeller(sellerId: string): Seller | undefined {
  return useDbSelector((s) => s.sellers.find((sel) => sel.id === sellerId));
}

export function useCatalogueProducts(sellerId?: string): CatalogueProduct[] {
  return useDbSelector((s) =>
    sellerId ? s.catalogueProducts.filter((p) => p.sellerId === sellerId) : s.catalogueProducts
  );
}

export function useCatalogueProduct(productId: string): CatalogueProduct | undefined {
  return useDbSelector((s) => s.catalogueProducts.find((p) => p.id === productId));
}

// ============================================================================
// Discounts & Collections
// ============================================================================

export function useDiscounts(): Discount[] {
  return useDbSelector((s) => s.discounts);
}

export function useDiscount(discountId: string): Discount | undefined {
  return useDbSelector((s) => s.discounts.find((d) => d.id === discountId));
}

export function useCollections(): Collection[] {
  return useDbSelector((s) => s.collections);
}

export function useCollection(collectionId: string): Collection | undefined {
  return useDbSelector((s) => s.collections.find((c) => c.id === collectionId));
}

// ============================================================================
// Purchases
// ============================================================================

export function usePurchases(): Purchase[] {
  return useDbSelector((s) => s.purchases);
}

export function usePurchase(purchaseId: string): Purchase | undefined {
  return useDbSelector((s) => s.purchases.find((p) => p.id === purchaseId));
}

// ============================================================================
// Scrape health
// ============================================================================

export function useScrapeHealth(): ScrapeHealthEntry[] {
  return useDbSelector((s) => s.scrapeHealth);
}

// ============================================================================
// Staff & Sites
// ============================================================================

export function useStaff(): StaffAccount[] {
  return useDbSelector((s) => s.staff);
}

export function useStaffMember(staffId: string): StaffAccount | undefined {
  return useDbSelector((s) => s.staff.find((st) => st.id === staffId));
}

export function useSites(): Site[] {
  return useDbSelector((s) => s.sites);
}

// ============================================================================
// Simulated auth — swap the logged-in role/account while testing
// ============================================================================

export function useCurrentUser(): StaffAccount | undefined {
  const db = useDbInstance();
  return useSyncExternalStore(
    db.subscribe,
    () => db.getCurrentUser(),
    () => seedData.staff[0]
  );
}

/** Returns actions bundled together so a role-switcher control is a one-liner. */
export function useAuthActions() {
  const db = useDbInstance();
  return {
    setCurrentUserById: db.setCurrentUserById.bind(db),
    setCurrentUserByRole: db.setCurrentUserByRole.bind(db),
  };
}

// ============================================================================
// Direct action access
// ============================================================================
// Mutation methods live on the store itself (they're already stable, bound
// functions aren't needed since `mockDb` is a singleton) — import the
// instance directly wherever you need to call e.g.
// `mockDb.advanceOrderStage(orderId, "shipped", currentUser.id)`.
// This hook exists purely so components stay consistent about getting it
// through context rather than importing the singleton in two different ways.
export function useMockDbActions() {
  return useDbInstance();
}