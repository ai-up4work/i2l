// lib/chat/customerMessageTemplates.ts
//
// Default drafts for every admin action that has a natural customer-
// facing message attached. Pure functions, no side effects — pages pass
// the result straight into <SendMessageModal defaultMessage={...} />,
// where the admin can edit before it actually sends. Keeping these in
// one file means the wording stays consistent across every trigger
// point, and there's one place to update copy later.

export function quoteMessage(amount: number, isRevision: boolean): string {
  return isRevision
    ? `We've updated the price for your item to Rs. ${amount.toLocaleString()}. Let us know here once you're happy with it and we'll get it confirmed.`
    : `Here's the price for your item: Rs. ${amount.toLocaleString()}. Reply here to let us know you'd like to go ahead, or if you have any questions first.`
}

export function paymentConfirmedMessage(amount: number, method?: string): string {
  const methodLabel = method ? ` (${method.replace('_', ' ')})` : ''
  return `We've received your payment of Rs. ${amount.toLocaleString()}${methodLabel}. Thank you! We'll get your order confirmed shortly.`
}

export function orderConfirmedMessage(total: number, itemCount: number): string {
  return `Your order is confirmed! Total: Rs. ${total.toLocaleString()} for ${itemCount} item${itemCount === 1 ? '' : 's'}. You can track it from your Orders page.`
}

export function requestDeclinedMessage(): string {
  return `We're sorry, but we're not able to fulfil this request. Let us know here if you'd like to try a different item or have any questions.`
}

export function purchaseFailedMessage(itemTitle: string, reason: string): string {
  const reasonNote = reason.trim() ? ` (${reason.trim()})` : ''
  return `We weren't able to purchase "${itemTitle}" from the store${reasonNote}. We'll be in touch shortly about a refund or an alternative — sorry for the trouble.`
}

export function qcFlaggedMessage(itemTitle: string, customerNote: string): string {
  const noteText = customerNote.trim() || 'there was an issue with the item during our quality check'
  return `Quick update on "${itemTitle}": ${noteText}. We're sorting out a replacement — we'll keep you posted here.`
}

export function replacementPassedMessage(itemTitle: string): string {
  return `Good news — the replacement for "${itemTitle}" has passed our quality check! It's moving on to packing and shipping now.`
}

export function arrivedInSriLankaMessage(): string {
  return `Your order has arrived in Sri Lanka! It's being prepared for local delivery — we'll update you again once it's on its way to you.`
}