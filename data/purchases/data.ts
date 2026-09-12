// data/purchases/data.ts
//
// Display-only constants for the Purchases queue. The actual purchase
// records live in AdminDataContext, joined live against real orders —
// see useAdminData().purchaseLines / getPurchaseLine / markPurchased /
// flagUnavailable. This file only maps domain values to UI labels/colors,
// so the list and detail pages can never drift into showing a different
// word or color for the same status.

import type { StatusTone } from "@/components/admin/warehouse/status-pill"
import type { PurchaseStatus, SellerType, Channel, PurchaseLine } from "@/types/admin"
import { CHANNEL_LABEL } from "@/types/admin"

export type { PurchaseStatus, SellerType, Channel, PurchaseLine }
export { CHANNEL_LABEL }

export const STATUS_LABEL: Record<PurchaseStatus, string> = {
  needs_purchase: "Needs purchase",
  purchased: "Purchased",
  unavailable: "Unavailable",
}

export const STATUS_TONE: Record<PurchaseStatus, StatusTone> = {
  needs_purchase: "amber",
  purchased: "teal",
  unavailable: "rose",
}