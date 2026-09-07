/**
 * lib/orderStatus.ts
 *
 * Single source of truth for the request/order lifecycle. Replaces the two
 * diverging `RequestStatus` unions that had drifted apart in types.ts —
 * everything downstream (customer tracker, admin console, permissions)
 * should import from here instead of redeclaring the flow.
 */

export type RequestStatus =
  | 'Requested'
  | 'Awaiting payment'
  | 'Order accepted'
  | 'Product received'
  | 'Quality check'
  | 'Packaging'
  | 'Shipped'
  | 'Delivered'
  | 'Cancelled'

/**
 * Forward order for the happy path. 'Cancelled' is a side-state reachable
 * from most stages, not a step in this sequence — keep it out of the array
 * so index math (progress bars, "next status") stays simple.
 */
export const REQUEST_STATUS_FLOW: RequestStatus[] = [
  'Requested',
  'Awaiting payment',
  'Order accepted',
  'Product received',
  'Quality check',
  'Packaging',
  'Shipped',
  'Delivered',
]

/** Statuses at or after which WishDrop has already spent money/effort on the customer's behalf. */
const LOCKED_STATUSES: RequestStatus[] = [
  'Order accepted',
  'Product received',
  'Quality check',
  'Packaging',
  'Shipped',
  'Delivered',
  'Cancelled',
]

/** Statuses where a cancellation request can still meaningfully stop the order before it ships. */
const CANCELLATION_REQUESTABLE_STATUSES: RequestStatus[] = [
  'Order accepted',
  'Product received',
  'Quality check',
  'Packaging',
]

export type StatusActor = 'customer' | 'system' | 'admin'

export type StatusHistoryEntry = {
  status: RequestStatus
  at: string // ISO timestamp
  actor: StatusActor
  note?: string
}

export type ItemRequest = {
  id: string
  name: string
  url: string
  qty: number
  unitPrice: number
  image: string
  status: RequestStatus
  customerName: string
  customerId: string
  statusHistory: StatusHistoryEntry[]
  /** Customer has asked to cancel a locked order; awaiting admin decision. */
  cancellationRequested?: boolean
  /** Ops-set flag surfaced to the customer as an honest, early heads-up. */
  delayed?: boolean
  delayReason?: string
  trackingNumber?: string
  adminNote?: string
}

// ---------------------------------------------------------------------------
// Customer-facing copy — plain language per the product-language guidelines.
// ---------------------------------------------------------------------------

export const STATUS_COPY: Record<RequestStatus, { label: string; description: string }> = {
  Requested: {
    label: 'Requested',
    description: "We've got your request and we're reviewing it.",
  },
  'Awaiting payment': {
    label: 'Awaiting payment',
    description: 'Your quote is ready. Pay when ready to confirm the order.',
  },
  'Order accepted': {
    label: 'Order accepted',
    description: "We're buying this for you now.",
  },
  'Product received': {
    label: 'Product received',
    description: 'Your item arrived at our facility.',
  },
  'Quality check': {
    label: 'Quality check',
    description: "We're inspecting your item before it ships.",
  },
  Packaging: {
    label: 'Packaging',
    description: "We're packing your order for its trip to Sri Lanka.",
  },
  Shipped: {
    label: 'Shipped',
    description: 'Your order is on its way to your door.',
  },
  Delivered: {
    label: 'Delivered',
    description: 'Delivered! We hope you love it.',
  },
  Cancelled: {
    label: 'Cancelled',
    description: 'This request was cancelled.',
  },
}

// ---------------------------------------------------------------------------
// Permission helpers — the rules a customer's own actions must obey.
// Advancing status forward is intentionally NOT covered here: that only
// ever happens from payment webhooks, warehouse scans, courier webhooks,
// or an admin action. Customers never move their own order forward.
// ---------------------------------------------------------------------------

/** Customer can fully delete the request — nothing has been purchased yet. */
export function canCustomerDelete(status: RequestStatus): boolean {
  return status === 'Requested' || status === 'Awaiting payment'
}

/** Self-serve cancel, same window as delete — cheap to undo before purchase. */
export function canCustomerCancel(status: RequestStatus): boolean {
  return canCustomerDelete(status)
}

/** Order is locked: customer can no longer self-cancel, only ask support to. */
export function isLocked(status: RequestStatus): boolean {
  return LOCKED_STATUSES.includes(status)
}

/** Whether a "Request cancellation" (support-mediated) action should be offered. */
export function canRequestCancellation(request: Pick<ItemRequest, 'status' | 'cancellationRequested'>): boolean {
  if (request.cancellationRequested) return false
  return CANCELLATION_REQUESTABLE_STATUSES.includes(request.status)
}

/** Once shipped, the order is out of WishDrop's hands — no cancellation path at all. */
export function isPastCancellationWindow(status: RequestStatus): boolean {
  return status === 'Shipped' || status === 'Delivered' || status === 'Cancelled'
}

export function statusIndex(status: RequestStatus): number {
  return REQUEST_STATUS_FLOW.indexOf(status)
}

/** Next forward status, or null if there isn't one (Delivered, or Cancelled). */
export function nextStatus(status: RequestStatus): RequestStatus | null {
  const i = statusIndex(status)
  if (i === -1 || i === REQUEST_STATUS_FLOW.length - 1) return null
  return REQUEST_STATUS_FLOW[i + 1]
}

export function appendHistory(
  request: ItemRequest,
  status: RequestStatus,
  actor: StatusActor,
  note?: string,
): ItemRequest {
  return {
    ...request,
    status,
    statusHistory: [
      ...request.statusHistory,
      { status, at: new Date().toISOString(), actor, note },
    ],
  }
}