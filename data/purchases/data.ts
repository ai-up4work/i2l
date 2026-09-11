// Purchase lines — one row per (order line × seller). An order can span
// multiple sellers, so "purchase" is scoped to the line, not the whole
// order; each is an independent action one person can pick up and finish.

import type { StatusTone } from "@/components/admin/warehouse/status-pill"

export type PurchaseStatus = "needs_purchase" | "purchased" | "unavailable"

export const STATUS_LABEL: Record<PurchaseStatus, string> = {
  needs_purchase: "Needs purchase",
  purchased: "Purchased",
  unavailable: "Unavailable",
}

// Centralized here (not redeclared per-page) so list and detail pages can
// never drift into showing a different color for the same status.
export const STATUS_TONE: Record<PurchaseStatus, StatusTone> = {
  needs_purchase: "amber",
  purchased: "teal",
  unavailable: "rose",
}

// Mirrors the three acquisition channels from the requirements doc.
export type Channel = "affiliated" | "scraped_link" | "manual_request"

export const CHANNEL_LABEL: Record<Channel, string> = {
  affiliated: "Affiliated store",
  scraped_link: "Scraped link",
  manual_request: "Manual request",
}

// Mirrors the Sellers nav distinction from the requirements doc §6:
// feed-integrated sellers have a real Shopify/WooCommerce connection and a
// live store URL; manual-mode sellers have none, so ops coordinates the
// purchase directly rather than clicking through to a storefront.
export type SellerType = "feed" | "manual"

export interface PurchaseLine {
  id: string
  orderNumber: string
  customerName: string
  productTitle: string
  variant?: string
  productImage: string // Mock: real free-license stock photo picked per product (Unsplash/Pexels), not the actual SKU. Swap for real product images / configure next.config images.domains later.
  sellerName: string
  sellerType: SellerType
  storeUrl?: string // present only when sellerType is "feed"
  channel: Channel
  quantity: number
  quotedUnitPriceINR: number
  actualUnitPriceINR?: number // set once status is "purchased"; can drift from quoted
  purchaseReference?: string
  purchasedBy?: string
  purchasedAt?: string // ISO date
  status: PurchaseStatus
  issueNote?: string // set once status is "unavailable"
  ageLabel: string // time since this line entered the purchase queue
}

export const MOCK_PURCHASE_LINES: PurchaseLine[] = [
  {
    id: "pl_1",
    orderNumber: "WD-2291",
    customerName: "Ishara F.",
    productTitle: "Ceramic pour-over set",
    productImage:
      "https://images.unsplash.com/photo-1603124712721-e5699777490c?w=400&h=400&fit=crop&auto=format&q=80",
    sellerName: "The Pot Project",
    sellerType: "feed",
    storeUrl: "https://thepotproject.example.com/products/pour-over-set",
    channel: "affiliated",
    quantity: 1,
    quotedUnitPriceINR: 1450,
    status: "needs_purchase",
    ageLabel: "20m",
  },
  {
    id: "pl_2",
    orderNumber: "WD-2291",
    customerName: "Ishara F.",
    productTitle: "Bamboo serving tray",
    productImage:
      "https://images.pexels.com/photos/9134588/pexels-photo-9134588.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop",
    sellerName: "Woodgrain Co.",
    sellerType: "manual",
    channel: "affiliated",
    quantity: 1,
    quotedUnitPriceINR: 890,
    status: "needs_purchase",
    ageLabel: "20m",
  },
  {
    id: "pl_3",
    orderNumber: "WD-2288",
    customerName: "Nadeesha K.",
    productTitle: "Wireless earbuds",
    variant: "Matte black",
    productImage:
      "https://images.pexels.com/photos/33298188/pexels-photo-33298188.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop",
    sellerName: "Boat Lifestyle",
    sellerType: "feed",
    storeUrl: "https://www.boat-lifestyle.com/products/wireless-earbuds",
    channel: "scraped_link",
    quantity: 1,
    quotedUnitPriceINR: 2400,
    actualUnitPriceINR: 2350,
    purchaseReference: "AMZ-88213",
    purchasedBy: "Sanduni R.",
    purchasedAt: "2026-09-11T05:20:00Z",
    status: "purchased",
    ageLabel: "3h",
  },
  {
    id: "pl_4",
    orderNumber: "WD-2295",
    customerName: "Ruwan P.",
    productTitle: "Table lamp, brass finish",
    productImage:
      "https://images.pexels.com/photos/15436154/pexels-photo-15436154.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop",
    sellerName: "Home Centre",
    sellerType: "feed",
    storeUrl: "https://www.homecentre.example.com/products/table-lamp-brass",
    channel: "affiliated",
    quantity: 1,
    quotedUnitPriceINR: 3200,
    status: "unavailable",
    issueNote: "Seller marked out of stock at checkout",
    ageLabel: "1d",
  },
  {
    id: "pl_5",
    orderNumber: "WD-2280",
    customerName: "Tharindu S.",
    productTitle: "Leather bifold wallet",
    productImage:
      "https://images.pexels.com/photos/915917/pexels-photo-915917.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop",
    sellerName: "Da Milano",
    sellerType: "manual",
    channel: "manual_request",
    quantity: 1,
    quotedUnitPriceINR: 2100,
    actualUnitPriceINR: 2100,
    purchaseReference: "DM-4471",
    purchasedBy: "Sanduni R.",
    purchasedAt: "2026-09-09T11:05:00Z",
    status: "purchased",
    ageLabel: "2d",
  },
  {
    id: "pl_6",
    orderNumber: "WD-2301",
    customerName: "Dilani W.",
    productTitle: "Cotton kurta",
    variant: "Size M",
    productImage:
      "https://images.pexels.com/photos/20791992/pexels-photo-20791992.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop",
    sellerName: "Fabindia",
    sellerType: "feed",
    storeUrl: "https://www.fabindia.com/products/cotton-kurta",
    channel: "affiliated",
    quantity: 2,
    quotedUnitPriceINR: 1650,
    status: "needs_purchase",
    ageLabel: "45m",
  },
  {
    id: "pl_7",
    orderNumber: "WD-2277",
    customerName: "Kavindu J.",
    productTitle: "Skincare gift set",
    productImage:
      "https://images.pexels.com/photos/5632343/pexels-photo-5632343.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop",
    sellerName: "Nykaa",
    sellerType: "feed",
    storeUrl: "https://www.nykaa.com/products/skincare-gift-set",
    channel: "scraped_link",
    quantity: 1,
    quotedUnitPriceINR: 1850,
    actualUnitPriceINR: 1800,
    purchaseReference: "NYK-90142",
    purchasedBy: "Imesha D.",
    purchasedAt: "2026-09-07T09:40:00Z",
    status: "purchased",
    ageLabel: "4d",
  },
]

export function getPurchaseLine(id: string): PurchaseLine | undefined {
  return MOCK_PURCHASE_LINES.find((line) => line.id === id)
}