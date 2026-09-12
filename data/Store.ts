import type {
  MockDbShape,
  Order,
  OrderStage,
  Request,
  RequestStatus,
  ChatMessage,
  Seller,
  CatalogueProduct,
  Discount,
  Collection,
  Purchase,
  PurchaseStatus,
  StaffAccount,
  Site,
  ScrapeHealthEntry,
  Role,
} from "@/types/admin-mock";
import { seedData } from "@/data/admin"

// Bump this whenever the shape in types.ts changes in a way old localStorage
// data can't satisfy — prevents "why is this field undefined" during dev.
const SCHEMA_VERSION = 1;
const STORAGE_KEY = `wishdrop_mock_db_v${SCHEMA_VERSION}`;

let idCounter = 0;
function makeId(prefix: string) {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${idCounter}`;
}

function deepClone<T>(value: T): T {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

type Listener = () => void;

/**
 * A small "realtime-database-like" store.
 *
 * - Single source of truth in memory, mirrored to localStorage on every write.
 * - subscribe()/notify() so any component reading via the hooks in
 *   MockDatabaseContext.tsx re-renders when *anything* changes, the same way
 *   a Firestore onSnapshot listener would.
 * - Every mutation replaces `this.data` with a new top-level object so
 *   React's useSyncExternalStore sees a new snapshot reference.
 *
 * This is intentionally not smart about partial updates / fine-grained
 * subscriptions — for a local dev simulation, "re-render on any write" is
 * the right trade-off for correctness over performance.
 */
class MockDb {
  private data: MockDbShape;
  private listeners = new Set<Listener>();
  private currentUserId: string;

  constructor() {
    this.data = this.loadInitial();
    // Default simulated logged-in user — swap via setCurrentUser() in a
    // role-switcher control while testing role-gated UI.
    this.currentUserId = this.data.staff[0]?.id ?? "";
  }

  // -- persistence -----------------------------------------------------

  private loadInitial(): MockDbShape {
    if (typeof window === "undefined") return deepClone(seedData); // SSR pass
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as MockDbShape;
    } catch {
      // fall through to reseed on any parse/storage error
    }
    const fresh = deepClone(seedData);
    this.saveToStorage(fresh);
    return fresh;
  }

  private saveToStorage(data: MockDbShape) {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // localStorage full or unavailable (private browsing) — data still
      // works in-memory for the session, just won't survive a reload.
    }
  }

  private commit(next: MockDbShape) {
    this.data = next;
    this.saveToStorage(next);
    this.notify();
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): MockDbShape => this.data;

  /** Wipe everything back to seed data — handy "reset demo" button. */
  reset() {
    const fresh = deepClone(seedData);
    this.commit(fresh);
  }

  // -- simulated auth ----------------------------------------------------

  getCurrentUser(): StaffAccount | undefined {
    return this.data.staff.find((s) => s.id === this.currentUserId);
  }

  setCurrentUserById(staffId: string) {
    this.currentUserId = staffId;
    this.notify(); // no data change, but consumers of getCurrentUser need a re-render
  }

  /** Convenience for quickly testing "what does a Warehouse user see". */
  setCurrentUserByRole(role: Role) {
    const match = this.data.staff.find((s) => s.role === role && s.status === "active");
    if (match) this.setCurrentUserById(match.id);
  }

  // -- Sites ---------------------------------------------------------------

  addSite(input: Omit<Site, "id" | "activeOrderCount">) {
    const site: Site = { ...input, id: makeId("site"), activeOrderCount: 0 };
    this.commit({ ...this.data, sites: [...this.data.sites, site] });
    return site;
  }

  updateSite(siteId: string, patch: Partial<Site>) {
    this.commit({
      ...this.data,
      sites: this.data.sites.map((s) => (s.id === siteId ? { ...s, ...patch } : s)),
    });
  }

  /** Returns false (and does nothing) if the site still has active orders routed to it. */
  deactivateSite(siteId: string): boolean {
    const hasActiveOrders = this.data.orders.some(
      (o) => o.siteId === siteId && o.stage !== "delivered"
    );
    if (hasActiveOrders) return false;
    this.updateSite(siteId, { active: false });
    return true;
  }

  // -- Staff ---------------------------------------------------------------

  addStaff(input: Omit<StaffAccount, "id" | "lastLogin" | "status">) {
    const staff: StaffAccount = {
      ...input,
      id: makeId("staff"),
      status: "active",
      lastLogin: new Date().toISOString(),
    };
    this.commit({ ...this.data, staff: [...this.data.staff, staff] });
    return staff;
  }

  updateStaff(staffId: string, patch: Partial<StaffAccount>) {
    this.commit({
      ...this.data,
      staff: this.data.staff.map((s) => (s.id === staffId ? { ...s, ...patch } : s)),
    });
  }

  /** Warehouse-only guard: block deactivation while their site has orders in-flight. */
  deactivateStaff(staffId: string): { ok: boolean; reason?: string } {
    const staff = this.data.staff.find((s) => s.id === staffId);
    if (!staff) return { ok: false, reason: "Staff not found" };
    if (staff.role === "warehouse" && staff.siteId) {
      const inProgress = this.data.orders.some(
        (o) => o.siteId === staff.siteId && o.stage !== "delivered"
      );
      if (inProgress) {
        return { ok: false, reason: "This site has in-progress orders — reassign them first." };
      }
    }
    this.updateStaff(staffId, { status: "deactivated" });
    return { ok: true };
  }

  // -- Orders ----------------------------------------------------------------

  getOrder(orderId: string): Order | undefined {
    return this.data.orders.find((o) => o.id === orderId);
  }

  advanceOrderStage(orderId: string, stage: OrderStage, byStaffId: string) {
    this.commit({
      ...this.data,
      orders: this.data.orders.map((o) =>
        o.id === orderId
          ? {
              ...o,
              stage,
              stageEnteredAt: new Date().toISOString(),
              stageHistory: [
                ...o.stageHistory,
                { stage, timestamp: new Date().toISOString(), byStaffId },
              ],
            }
          : o
      ),
    });
  }

  reassignOrderSite(orderId: string, newSiteId: string, byStaffId: string) {
    // Per spec: reassigning mid-QC restarts QC at the new site.
    this.commit({
      ...this.data,
      orders: this.data.orders.map((o) => {
        if (o.id !== orderId) return o;
        const restartsQc = o.stage === "quality_check";
        return {
          ...o,
          siteId: newSiteId,
          stageEnteredAt: new Date().toISOString(),
          stageHistory: restartsQc
            ? [
                ...o.stageHistory,
                { stage: "quality_check" as OrderStage, timestamp: new Date().toISOString(), byStaffId },
              ]
            : o.stageHistory,
        };
      }),
    });
  }

  toggleOrderDelayed(orderId: string) {
    this.commit({
      ...this.data,
      orders: this.data.orders.map((o) => (o.id === orderId ? { ...o, delayed: !o.delayed } : o)),
    });
  }

  addInternalNote(orderId: string, text: string, byStaffId: string) {
    this.commit({
      ...this.data,
      orders: this.data.orders.map((o) =>
        o.id === orderId
          ? {
              ...o,
              internalNotes: [
                ...o.internalNotes,
                { id: makeId("note"), text, byStaffId, timestamp: new Date().toISOString() },
              ],
            }
          : o
      ),
    });
  }

  confirmDelivery(orderId: string, confirmedBy: "warehouse" | "customer") {
    this.advanceOrderStage(orderId, "delivered", confirmedBy === "warehouse" ? "system" : "system");
    this.commit({
      ...this.data,
      orders: this.data.orders.map((o) =>
        o.id === orderId ? { ...o, deliveredConfirmedBy: confirmedBy } : o
      ),
    });
  }

  /** Creates a new order from a confirmed Channel-3 request — never merges into the structured cart. */
  createOrderFromConfirmedRequest(requestId: string, siteId: string): Order | undefined {
    const req = this.data.requests.find((r) => r.id === requestId);
    if (!req || req.status !== "confirmed" || req.quote === undefined) return undefined;
    const order: Order = {
      id: makeId("ord"),
      customerId: req.customerId,
      customerName: req.customerName,
      channel: 3,
      stage: "ordered",
      siteId,
      createdAt: new Date().toISOString(),
      stageEnteredAt: new Date().toISOString(),
      totalValue: req.quote,
      delayed: false,
      requestId: req.id,
      chatThreadId: req.chatThreadId,
      items: [
        {
          id: makeId("item"),
          title: `Channel 3 request — ${req.link}`,
          quantity: 1,
          price: req.quote,
          requestLink: req.link,
          screenshotUrl: req.screenshotUrl,
        },
      ],
      stageHistory: [{ stage: "ordered", timestamp: new Date().toISOString(), byStaffId: "system" }],
      internalNotes: [],
    };
    this.commit({ ...this.data, orders: [...this.data.orders, order] });
    return order;
  }

  // -- Requests (Channel 3) --------------------------------------------------

  getRequest(requestId: string): Request | undefined {
    return this.data.requests.find((r) => r.id === requestId);
  }

  /** Submitting the fallback form always creates a request record, even before a human looks at it. */
  submitRequest(input: {
    customerId: string;
    customerName: string;
    link: string;
    note: string;
    screenshotUrl?: string;
  }): Request {
    const domain = (() => {
      try {
        return new URL(input.link).hostname;
      } catch {
        return "unknown";
      }
    })();
    const threadId = makeId("thread");
    const request: Request = {
      id: makeId("req"),
      customerId: input.customerId,
      customerName: input.customerName,
      link: input.link,
      note: input.note,
      screenshotUrl: input.screenshotUrl,
      sourceDomain: domain,
      status: "sent_for_review",
      submittedAt: new Date().toISOString(),
      quoteHistory: [],
      chatThreadId: threadId,
    };
    const thread = {
      id: threadId,
      customerId: input.customerId,
      customerName: input.customerName,
      requestId: request.id,
      lastActivity: new Date().toISOString(),
      unread: true,
      messages: [] as ChatMessage[],
    };
    this.logScrapeAttempt(domain, false); // fallback form only reached after a failed scrape
    this.commit({
      ...this.data,
      requests: [...this.data.requests, request],
      chatThreads: [...this.data.chatThreads, thread],
    });
    return request;
  }

  setQuote(requestId: string, amount: number, byStaffId: string) {
    this.commit({
      ...this.data,
      requests: this.data.requests.map((r) =>
        r.id === requestId
          ? {
              ...r,
              quote: amount,
              status: "quoted" as RequestStatus,
              quoteHistory: [...r.quoteHistory, { amount, byStaffId, timestamp: new Date().toISOString() }],
            }
          : r
      ),
    });
  }

  setRequestStatus(requestId: string, status: RequestStatus) {
    this.commit({
      ...this.data,
      requests: this.data.requests.map((r) => (r.id === requestId ? { ...r, status } : r)),
    });
  }

  reassignRequest(requestId: string, staffId: string) {
    this.commit({
      ...this.data,
      requests: this.data.requests.map((r) =>
        r.id === requestId ? { ...r, assignedStaffId: staffId } : r
      ),
    });
  }

  // -- Chat --------------------------------------------------------------

  addChatMessage(threadId: string, message: Omit<ChatMessage, "id" | "threadId" | "timestamp">) {
    const full: ChatMessage = {
      ...message,
      id: makeId("msg"),
      threadId,
      timestamp: new Date().toISOString(),
    };
    this.commit({
      ...this.data,
      chatThreads: this.data.chatThreads.map((t) =>
        t.id === threadId
          ? { ...t, messages: [...t.messages, full], lastActivity: full.timestamp, unread: message.sender === "customer" }
          : t
      ),
    });
    return full;
  }

  markThreadRead(threadId: string) {
    this.commit({
      ...this.data,
      chatThreads: this.data.chatThreads.map((t) => (t.id === threadId ? { ...t, unread: false } : t)),
    });
  }

  /** Marks a message as sent via the manual wa.me deep link — WhatsApp replies are never synced back. */
  markSentViaWhatsApp(messageId: string) {
    this.commit({
      ...this.data,
      chatThreads: this.data.chatThreads.map((t) => ({
        ...t,
        messages: t.messages.map((m) => (m.id === messageId ? { ...m, sentViaWhatsApp: true } : m)),
      })),
    });
  }

  // -- Sellers & Catalogue --------------------------------------------------

  addSeller(input: Omit<Seller, "id">) {
    const seller: Seller = { ...input, id: makeId("seller") };
    this.commit({ ...this.data, sellers: [...this.data.sellers, seller] });
    return seller;
  }

  updateSeller(sellerId: string, patch: Partial<Seller>) {
    this.commit({
      ...this.data,
      sellers: this.data.sellers.map((s) => (s.id === sellerId ? { ...s, ...patch } : s)),
    });
  }

  deactivateSeller(sellerId: string): { ok: boolean; reason?: string } {
    const hasOpenOrders = this.data.orders.some(
      (o) => o.stage !== "delivered" && o.items.some((i) => i.catalogueId &&
        this.data.catalogueProducts.find((p) => p.id === i.catalogueId)?.sellerId === sellerId)
    );
    if (hasOpenOrders) return { ok: false, reason: "This seller has open orders — resolve them first." };
    this.updateSeller(sellerId, { status: "deactivated" });
    return { ok: true };
  }

  runTestExtraction(sellerId: string, url: string, succeeded: boolean, errorMessage?: string) {
    this.commit({
      ...this.data,
      sellers: this.data.sellers.map((s) =>
        s.id === sellerId
          ? {
              ...s,
              extractionHistory: [
                ...(s.extractionHistory ?? []),
                { id: makeId("ext"), url, succeeded, timestamp: new Date().toISOString(), errorMessage },
              ],
            }
          : s
      ),
    });
  }

  addCatalogueProduct(input: Omit<CatalogueProduct, "id">) {
    const product: CatalogueProduct = { ...input, id: makeId("cat") };
    this.commit({ ...this.data, catalogueProducts: [...this.data.catalogueProducts, product] });
    return product;
  }

  updateCatalogueProduct(productId: string, patch: Partial<CatalogueProduct>) {
    this.commit({
      ...this.data,
      catalogueProducts: this.data.catalogueProducts.map((p) =>
        p.id === productId ? { ...p, ...patch } : p
      ),
    });
  }

  // -- Discounts -----------------------------------------------------------

  addDiscount(input: Omit<Discount, "id" | "usageCount">) {
    const discount: Discount = { ...input, id: makeId("disc"), usageCount: 0 };
    this.commit({ ...this.data, discounts: [...this.data.discounts, discount] });
    return discount;
  }

  updateDiscount(discountId: string, patch: Partial<Discount>) {
    this.commit({
      ...this.data,
      discounts: this.data.discounts.map((d) => (d.id === discountId ? { ...d, ...patch } : d)),
    });
  }

  // -- Collections -----------------------------------------------------------

  addCollection(input: Omit<Collection, "id" | "manualProductIds" | "removedProductIds">) {
    const collection: Collection = { ...input, id: makeId("coll"), manualProductIds: [], removedProductIds: [] };
    this.commit({ ...this.data, collections: [...this.data.collections, collection] });
    return collection;
  }

  updateCollectionRule(collectionId: string, patch: Partial<Collection>) {
    this.commit({
      ...this.data,
      collections: this.data.collections.map((c) => (c.id === collectionId ? { ...c, ...patch } : c)),
    });
  }

  /** Manual add always wins over the rule — see collection detail page notes on override semantics. */
  addManualProduct(collectionId: string, productId: string) {
    this.commit({
      ...this.data,
      collections: this.data.collections.map((c) =>
        c.id === collectionId
          ? {
              ...c,
              manualProductIds: Array.from(new Set([...c.manualProductIds, productId])),
              removedProductIds: c.removedProductIds.filter((id) => id !== productId),
            }
          : c
      ),
    });
  }

  removeManualProduct(collectionId: string, productId: string) {
    this.commit({
      ...this.data,
      collections: this.data.collections.map((c) =>
        c.id === collectionId
          ? {
              ...c,
              manualProductIds: c.manualProductIds.filter((id) => id !== productId),
              removedProductIds: Array.from(new Set([...c.removedProductIds, productId])),
            }
          : c
      ),
    });
  }

  // -- Purchases -----------------------------------------------------------

  addPurchase(input: Omit<Purchase, "id" | "status">) {
    const purchase: Purchase = { ...input, id: makeId("pur"), status: "pending" };
    this.commit({ ...this.data, purchases: [...this.data.purchases, purchase] });
    return purchase;
  }

  setPurchaseStatus(purchaseId: string, status: PurchaseStatus, failReason?: string) {
    this.commit({
      ...this.data,
      purchases: this.data.purchases.map((p) =>
        p.id === purchaseId ? { ...p, status, failReason } : p
      ),
    });
  }

  recordOutboundPayment(purchaseId: string, payment: Purchase["outboundPayment"]) {
    this.commit({
      ...this.data,
      purchases: this.data.purchases.map((p) =>
        p.id === purchaseId ? { ...p, outboundPayment: payment } : p
      ),
    });
  }

  // -- Scrape health -----------------------------------------------------------

  logScrapeAttempt(domain: string, succeeded: boolean) {
    const existing = this.data.scrapeHealth.find((e) => e.domain === domain);
    const entries: ScrapeHealthEntry[] = existing
      ? this.data.scrapeHealth.map((e) =>
          e.domain === domain
            ? {
                ...e,
                failCount: succeeded ? e.failCount : e.failCount + 1,
                successCount: succeeded ? e.successCount + 1 : e.successCount,
                lastFailure: succeeded ? e.lastFailure : new Date().toISOString(),
              }
            : e
        )
      : [
          ...this.data.scrapeHealth,
          {
            domain,
            failCount: succeeded ? 0 : 1,
            successCount: succeeded ? 1 : 0,
            lastFailure: succeeded ? undefined : new Date().toISOString(),
          },
        ];
    this.commit({ ...this.data, scrapeHealth: entries });
  }
}

// Singleton — one store per browser tab, matching how a realtime DB
// connection would behave (shared state, independent per tab/session).
export const mockDb = new MockDb();