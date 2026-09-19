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
  return isRevision
    ? `We've updated the price for "${itemLabel}" (Request ${requestDisplayId}) to Rs. ${amount.toLocaleString()}. Let us know here once you're happy with it and we'll get it confirmed.`
    : `Here's the price for "${itemLabel}" (Request ${requestDisplayId}): Rs. ${amount.toLocaleString()}. Reply here to let us know you'd like to go ahead, or if you have any questions first.`
}

export function paymentConfirmedMessage(requestDisplayId: string, itemLabel: string, amount: number, method?: string): string {
  const methodLabel = method ? ` (${method.replace('_', ' ')})` : ''
  return `We've received your payment of Rs. ${amount.toLocaleString()}${methodLabel} for "${itemLabel}" (Request ${requestDisplayId}). Thank you! We'll get your order confirmed shortly.`
}

export function orderConfirmedMessage(orderDisplayId: string, itemLabel: string, total: number, itemCount: number): string {
  const itemsPart = itemCount > 1 ? `${itemCount} items` : `"${itemLabel}"`
  return `Your order ${orderDisplayId} is confirmed — ${itemsPart}, total Rs. ${total.toLocaleString()}. You can track it from your Orders page.`
}

export function requestDeclinedMessage(requestDisplayId: string, itemLabel: string): string {
  return `We're sorry, but we're not able to fulfil your request for "${itemLabel}" (Request ${requestDisplayId}). Let us know here if you'd like to try a different item or have any questions.`
}

export function purchaseFailedMessage(orderDisplayId: string, itemLabel: string, reason: string): string {
  const reasonNote = reason.trim() ? ` (${reason.trim()})` : ''
  return `We weren't able to purchase "${itemLabel}" from order ${orderDisplayId}${reasonNote}. We'll be in touch shortly about a refund or an alternative — sorry for the trouble.`
}

export function qcFlaggedMessage(orderDisplayId: string, itemLabel: string, customerNote: string): string {
  const noteText = customerNote.trim() || 'there was an issue with the item during our quality check'
  return `Quick update on order ${orderDisplayId}, "${itemLabel}": ${noteText}. We're sorting out a replacement — we'll keep you posted here.`
}

export function replacementPassedMessage(orderDisplayId: string, itemLabel: string): string {
  return `Good news — the replacement for "${itemLabel}" (order ${orderDisplayId}) has passed our quality check! It's moving on to packing and shipping now.`
}

export function arrivedInSriLankaMessage(orderDisplayId: string): string {
  return `Your order ${orderDisplayId} has arrived in Sri Lanka! It's being prepared for local delivery — we'll update you again once it's on its way to you.`
}

// Deliberately doesn't mention loyalty points — addOrderPoints exists in
// the loyalty engine but has no call site wiring it to real orders yet
// (see WISHDROP_STATUS.md), so promising "points are in your account"
// here would just be false. Update this once that's actually wired up.
export function deliveredMessage(orderDisplayId: string): string {
  return `🎉 Your order ${orderDisplayId} has arrived — enjoy! We really hope it's exactly what you were after. If anything's not quite right, just reply here and we'll sort it out for you. And whenever you spot something else you'd like, send us the link or browse our catalogue — we're always ready for the next one!`
}