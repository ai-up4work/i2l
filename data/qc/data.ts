import { MOCK_PURCHASE_LINES, type PurchaseLine } from "@/data/purchases/data"
import type { StatusTone } from "@/components/admin/warehouse/status-pill"

// A QC line only exists once its purchase line has actually been bought and
// arrived at a warehouse — you can't inspect what hasn't shipped in. Rather
// than duplicate product/order/seller fields, each QC line just points at
// its purchaseLineId and the two are joined at read time (getQCRow below).
// This is the literal "connection" between Purchases (Sales & Purchase) and
// QC (Warehouse): same underlying item, different stage of the pipeline.

export type QCStatus = "pending" | "passed" | "flagged"

export const QC_STATUS_LABEL: Record<QCStatus, string> = {
  pending: "Needs inspection",
  passed: "Passed",
  flagged: "Flagged",
}

// Centralized here (not redeclared per-page) — same reasoning as
// STATUS_TONE in data/purchases/data.ts.
export const QC_STATUS_TONE: Record<QCStatus, StatusTone> = {
  pending: "amber",
  passed: "teal",
  flagged: "rose",
}

// SLA threshold, in hours, for flagging an order as overdue since it was
// placed — separate from how long an item has sat in the QC queue itself.
// ASSUMPTION: 48h, placeholder until there's a real operational target.
export const ORDER_AGE_SLA_HOURS = 48

export interface QCLine {
  id: string
  purchaseLineId: string
  site: string // TODO: scope to the signed-in Warehouse account's own warehouse_id server-side
  status: QCStatus
  note?: string
  photoCount: number
  arrivedAgo: string // time since this item arrived at THIS warehouse/QC stage
  orderAgeHours: number // time since the parent order was originally placed
  orderAgeLabel: string
}

export const MOCK_QC_LINES: QCLine[] = [
  {
    id: "qc_1",
    purchaseLineId: "pl_3", // Wireless earbuds — Nadeesha K.
    site: "Colombo Hub",
    status: "pending",
    photoCount: 0,
    arrivedAgo: "35m",
    orderAgeHours: 6,
    orderAgeLabel: "6h",
  },
  {
    id: "qc_2",
    purchaseLineId: "pl_5", // Leather wallet — Tharindu S.
    site: "Colombo Hub",
    status: "flagged",
    note: "Corner scuffed in transit — flagging for customer follow-up before packing.",
    photoCount: 2,
    arrivedAgo: "1d 4h",
    orderAgeHours: 58,
    orderAgeLabel: "2d 10h",
  },
  {
    id: "qc_3",
    purchaseLineId: "pl_7", // Skincare gift set — Kavindu J.
    site: "Colombo Hub",
    status: "passed",
    photoCount: 1,
    arrivedAgo: "2d",
    orderAgeHours: 96,
    orderAgeLabel: "4d",
  },
]

export function isOrderAgeBreached(hours: number): boolean {
  return hours >= ORDER_AGE_SLA_HOURS
}

export interface QCRow extends QCLine {
  purchase: PurchaseLine
}

export function getQCRows(): QCRow[] {
  return MOCK_QC_LINES.map((qc) => {
    const purchase = MOCK_PURCHASE_LINES.find((p) => p.id === qc.purchaseLineId)
    if (!purchase) {
      throw new Error(`QC line ${qc.id} references missing purchase line ${qc.purchaseLineId}`)
    }
    return { ...qc, purchase }
  })
}