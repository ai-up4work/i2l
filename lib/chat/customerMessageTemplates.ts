// lib/chat/customerMessageTemplates.ts
//
// Default drafts for every admin action that has a natural customer-
// facing message attached. Pure functions, no side effects — pages pass
// the result straight into <SendMessageModal defaultMessage={...} />,
// where the admin can edit before it actually sends. Keeping these in
// one file means the wording stays consistent across every trigger
// point, and there's one place to update copy later.
//
// Every message that concerns an existing order now names it by its
// real order id (e.g. "WD-10499"), and every message that concerns a
// specific item names that item (and its variant, if one was confirmed)
// instead of a bare "your item" — a customer juggling more than one
// order or item had no way to tell which one an auto-sent message was
// actually about otherwise. quoteMessage/paymentConfirmedMessage/
// requestDeclinedMessage are the one exception to "always include an
// order id": they fire on a Channel 3 request BEFORE an order exists
// (confirmRequestReal only creates the order once the request is
// actually confirmed), so there's genuinely no order id yet at that
// point — they still name the item, just not an order.
//
// The WORDING of each message now lives in messageTemplateDefs.ts (the
// built-in defaults) and can be overridden by Super Admin at Admin →
// Settings → Templates. The functions below only prepare the values
// (formatting amounts, optional bits) and call renderMessageTemplate,
// which uses the saved wording when there is one and the built-in
// wording otherwise. Call sites are unchanged.

import { renderMessageTemplate } from './messageTemplateDefs'

/**
 * Combines a title with its confirmed variant (size/color/etc.) into one
 * label for a customer-facing message — "Soft Sculpt V-neck Sports Bra
 * (32, Ash)" rather than a bare title that leaves out a detail the
 * customer themselves specified. Pass whatever variant text is on hand
 * (RequestItemAsk.confirmedVariant, OrderItem.variant, PurchaseLine.variant,
 * QCLine.variant — all the same free-text shape); omit it entirely if
 * there isn't one rather than showing an empty pair of parentheses.
 */
export function formatItemLabel(title: string, variant?: string | null): string {
  const cleanTitle = title.trim() || 'your item'
  const cleanVariant = variant?.trim()
  return cleanVariant ? `${cleanTitle} (${cleanVariant})` : cleanTitle
}

/**
 * Strips the known internal-only tag/estimate patterns
 * buildRequestNote() (DashboardContext.tsx) bakes into a Channel 3
 * request item's note — the same two patterns
 * stripInternalNoteTags (lib/supabase/requests-admin.ts) already strips
 * server-side for the ORDER's title once a request is confirmed. This is
 * the client-side equivalent for messages composed BEFORE that point
 * (quote, payment-confirmed, declined) — a customer should never see
 * "[Confirm size/color with customer]" or an internal cost estimate
 * quoted back at them in their own chat thread.
 */
export function cleanRequestItemNote(note: string): string {
  return note
    .replace(/^\[Confirm size\/color with customer\]\s*/, '')
    .replace(/\s*\(customer's estimate:.*?\)\s*$/, '')
    .trim()
}

export function quoteMessage(requestDisplayId: string, itemLabel: string, amount: number, isRevision: boolean): string {
  return renderMessageTemplate(isRevision ? 'quote_revised' : 'quote_new', {
    request: requestDisplayId,
    item: itemLabel,
    amount: amount.toLocaleString(),
  })
}

export function paymentConfirmedMessage(requestDisplayId: string, itemLabel: string, amount: number, method?: string): string {
  return renderMessageTemplate('payment_confirmed', {
    request: requestDisplayId,
    item: itemLabel,
    amount: amount.toLocaleString(),
    method: method ? ` (${method.replace('_', ' ')})` : '',
  })
}

export function orderConfirmedMessage(orderDisplayId: string, itemLabel: string, total: number, itemCount: number): string {
  return renderMessageTemplate('order_confirmed', {
    order: orderDisplayId,
    items: itemCount > 1 ? `${itemCount} items` : `"${itemLabel}"`,
    total: total.toLocaleString(),
  })
}

export function requestDeclinedMessage(requestDisplayId: string, itemLabel: string): string {
  return renderMessageTemplate('request_declined', { request: requestDisplayId, item: itemLabel })
}

export function purchaseFailedMessage(orderDisplayId: string, itemLabel: string, reason: string): string {
  return renderMessageTemplate('purchase_failed', {
    order: orderDisplayId,
    item: itemLabel,
    reason: reason.trim() ? ` (${reason.trim()})` : '',
  })
}

export function qcFlaggedMessage(orderDisplayId: string, itemLabel: string, customerNote: string): string {
  return renderMessageTemplate('qc_flagged', {
    order: orderDisplayId,
    item: itemLabel,
    note: customerNote.trim() || 'there was an issue with the item during our quality check',
  })
}

export function replacementPassedMessage(orderDisplayId: string, itemLabel: string): string {
  return renderMessageTemplate('replacement_passed', { order: orderDisplayId, item: itemLabel })
}

export function arrivedInSriLankaMessage(orderDisplayId: string): string {
  return renderMessageTemplate('arrived_sri_lanka', { order: orderDisplayId })
}

export function deliveredMessage(orderDisplayId: string): string {
  return renderMessageTemplate('delivered', { order: orderDisplayId })
}
