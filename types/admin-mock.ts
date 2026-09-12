// ============================================================================
// WishDrop Mock DB — Types
// Mirrors every entity referenced in the requirements doc + route spec.
// No real backend yet: this is the shape the real DB should eventually match.
// ============================================================================

export type Role = "manager" | "sales" | "warehouse" | "super_admin";

export type Channel = 1 | 2 | 3;

export type OrderStage = "ordered" | "quality_check" | "shipped" | "delivered";

export type RequestStatus =
  | "sent_for_review"
  | "pending_quote"
  | "quoted"
  | "confirmed"
  | "rejected";

export type SellerType = "feed" | "manual";

export type PurchaseStatus = "pending" | "purchased" | "failed";

export type DiscountType = "percent" | "fixed";

export type CollectionFilterType = "auto" | "manual" | "both";

// ---------------------------------------------------------------------------
// Sites & Staff
// ---------------------------------------------------------------------------

export interface Site {
  id: string;
  name: string;
  location: string;
  headcount: number;
  activeOrderCount: number;
  active: boolean;
}

export interface StaffAccount {
  id: string;
  name: string;
  email: string;
  role: Role;
  siteId?: string; // only meaningful for warehouse
  status: "active" | "deactivated";
  lastLogin: string; // ISO
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export interface OrderItem {
  id: string;
  title: string;
  quantity: number;
  price: number;
  // channel-specific payloads — only the relevant one is populated
  catalogueId?: string; // channel 1
  scrapedSnapshot?: { url: string; capturedAt: string; variant?: string }; // channel 2
  requestLink?: string; // channel 3
  screenshotUrl?: string; // channel 3
}

export interface StageTransition {
  stage: OrderStage;
  timestamp: string;
  byStaffId: string | "system";
}

export interface InternalNote {
  id: string;
  text: string;
  byStaffId: string;
  timestamp: string;
}

export interface Order {
  id: string;
  customerId: string;
  customerName: string;
  channel: Channel;
  stage: OrderStage;
  siteId: string;
  createdAt: string;
  stageEnteredAt: string; // when it entered the *current* stage
  totalValue: number;
  delayed: boolean;
  items: OrderItem[];
  stageHistory: StageTransition[];
  internalNotes: InternalNote[];
  chatThreadId?: string;
  requestId?: string; // set when channel === 3
  deliveredConfirmedBy?: "warehouse" | "customer";
}

// ---------------------------------------------------------------------------
// Channel 3 — Requests
// ---------------------------------------------------------------------------

export interface QuoteRevision {
  amount: number;
  byStaffId: string;
  timestamp: string;
}

export interface Request {
  id: string;
  customerId: string;
  customerName: string;
  link: string;
  note: string;
  screenshotUrl?: string;
  sourceDomain: string;
  status: RequestStatus;
  submittedAt: string;
  quote?: number;
  quoteHistory: QuoteRevision[];
  chatThreadId: string;
  assignedStaffId?: string;
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export interface ChatMessage {
  id: string;
  threadId: string;
  sender: "customer" | "staff";
  senderName: string;
  text: string;
  attachmentUrl?: string;
  timestamp: string;
  requestId?: string; // tags a message to a specific request
  sentViaWhatsApp?: boolean; // true once the "Send via WhatsApp" deep link was clicked
}

export interface ChatThread {
  id: string;
  customerId: string;
  customerName: string;
  requestId?: string;
  orderId?: string;
  lastActivity: string;
  unread: boolean;
  messages: ChatMessage[];
}

// ---------------------------------------------------------------------------
// Sellers & Catalogue
// ---------------------------------------------------------------------------

export interface FieldMapping {
  field: "title" | "price" | "images" | "variants";
  selector: string;
}

export interface ExtractionAttempt {
  id: string;
  url: string;
  succeeded: boolean;
  timestamp: string;
  errorMessage?: string;
}

export interface Seller {
  id: string;
  name: string;
  type: SellerType;
  status: "active" | "deactivated";
  contactEmail: string;
  // feed-integrated only
  lastSync?: string;
  feedHealthy?: boolean;
  fieldMappings?: FieldMapping[];
  extractionHistory?: ExtractionAttempt[];
  // manual-mode only
  lastEdit?: string;
}

export interface CatalogueProduct {
  id: string;
  sellerId: string; // kept even if the 1:1-vs-decoupled question is later reopened
  title: string;
  description: string;
  costPrice: number;
  marginPercent: number;
  // displayPrice is DERIVED (cost + margin) — never store a hand-typed final price
  images: string[];
  variants: { id: string; label: string; stock: number }[];
  active: boolean;
}

// ---------------------------------------------------------------------------
// Discounts & Collections
// ---------------------------------------------------------------------------

export interface Discount {
  id: string;
  code: string;
  type: DiscountType;
  value: number;
  scope: "platform" | "collection" | "products";
  scopeIds?: string[]; // collection or product ids if scope isn't platform-wide
  startDate: string;
  endDate: string;
  usageCount: number;
  status: "active" | "expired" | "paused";
}

export interface CollectionRule {
  tag?: string;
  maxPrice?: number;
  minPrice?: number;
}

export interface Collection {
  id: string;
  name: string;
  description: string;
  filterType: CollectionFilterType;
  rule?: CollectionRule;
  manualProductIds: string[]; // curated in/out, independent of the rule
  removedProductIds: string[]; // rule-matched but explicitly removed — see collection detail notes
  active: boolean;
}

// ---------------------------------------------------------------------------
// Purchases
// ---------------------------------------------------------------------------

export interface OutboundPayment {
  amount: number;
  method: string;
  reference: string;
  timestamp: string;
}

export interface Purchase {
  id: string;
  orderId?: string;
  requestId?: string;
  channel: Channel;
  sourceStore: string;
  amount: number;
  status: PurchaseStatus;
  receiptRef?: string;
  failReason?: string;
  outboundPayment?: OutboundPayment;
}

// ---------------------------------------------------------------------------
// Scrape health
// ---------------------------------------------------------------------------

export interface ScrapeHealthEntry {
  domain: string;
  failCount: number;
  successCount: number;
  lastFailure?: string;
  linkedSellerId?: string; // set once an extractor/affiliate deal exists
}

// ---------------------------------------------------------------------------
// The whole DB shape
// ---------------------------------------------------------------------------

export interface MockDbShape {
  sites: Site[];
  staff: StaffAccount[];
  orders: Order[];
  requests: Request[];
  chatThreads: ChatThread[];
  sellers: Seller[];
  catalogueProducts: CatalogueProduct[];
  discounts: Discount[];
  collections: Collection[];
  purchases: Purchase[];
  scrapeHealth: ScrapeHealthEntry[];
}