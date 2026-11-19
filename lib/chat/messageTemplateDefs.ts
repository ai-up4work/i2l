// lib/chat/messageTemplateDefs.ts
//
// The customer-message templates admins can edit (Admin → Settings →
// Templates): their keys, labels, the {placeholders} each one accepts,
// and the built-in wording used until someone saves their own.
//
// Pure and shared — imported by the browser (editor + the send buttons)
// and the server (api/admin/requests sends quotes/payment receipts).
//
// Saved wording is only held as OVERRIDES (key -> body). setTemplateOverrides()
// installs them for this process/tab; renderMessageTemplate() reads from
// that in-memory copy, so building a message never waits on the network.
// The admin layout fetches overrides once on mount (MessageTemplatesContext).

export type TemplateKey =
  | 'quote_new'
  | 'quote_revised'
  | 'payment_confirmed'
  | 'order_confirmed'
  | 'request_declined'
  | 'purchase_failed'
  | 'qc_flagged'
  | 'replacement_passed'
  | 'arrived_sri_lanka'
  | 'delivered'
  | 'welcome'
  | 'welcome_phone'

export type TemplatePlaceholder = {
  name: string
  /** What gets filled in, shown in the editor. */
  help: string
  /** Sample used in the live preview. */
  example: string
}

export type TemplateDef = {
  key: TemplateKey
  label: string
  /** When this message is drafted. */
  when: string
  placeholders: TemplatePlaceholder[]
  defaultBody: string
}

const REQUEST: TemplatePlaceholder = { name: 'request', help: 'Request number', example: 'REQ-2031' }
const ORDER: TemplatePlaceholder = { name: 'order', help: 'Order number', example: 'WD-10499' }
const ITEM: TemplatePlaceholder = { name: 'item', help: 'Item name, with its variant if one was confirmed', example: 'Soft Sculpt V-neck Sports Bra (32, Ash)' }

export const TEMPLATE_DEFS: TemplateDef[] = [
  {
    key: 'quote_new',
    label: 'Price quote',
    when: 'You send a customer the price for a request.',
    placeholders: [REQUEST, ITEM, { name: 'amount', help: 'Price, number only (add "Rs." yourself)', example: '12,500' }],
    defaultBody:
      `Here's the price for "{item}" (Request {request}): Rs. {amount}. Reply here to let us know you'd like to go ahead, or if you have any questions first.`,
  },
  {
    key: 'quote_revised',
    label: 'Price quote — revised',
    when: 'You change a price you already sent.',
    placeholders: [REQUEST, ITEM, { name: 'amount', help: 'New price, number only', example: '11,800' }],
    defaultBody:
      `We've updated the price for "{item}" (Request {request}) to Rs. {amount}. Let us know here once you're happy with it and we'll get it confirmed.`,
  },
  {
    key: 'payment_confirmed',
    label: 'Payment received',
    when: 'You record a payment against a request.',
    placeholders: [
      REQUEST,
      ITEM,
      { name: 'amount', help: 'Amount paid, number only', example: '12,500' },
      { name: 'method', help: 'Payment method in brackets, e.g. " (bank transfer)". Empty if not recorded', example: ' (bank transfer)' },
    ],
    defaultBody:
      `We've received your payment of Rs. {amount}{method} for "{item}" (Request {request}). Thank you! We'll get your order confirmed shortly.`,
  },
  {
    key: 'order_confirmed',
    label: 'Order confirmed',
    when: 'A request becomes a real order.',
    placeholders: [
      ORDER,
      { name: 'items', help: 'The item in quotes, or "3 items" for several', example: '"Soft Sculpt V-neck Sports Bra"' },
      { name: 'total', help: 'Order total, number only', example: '12,500' },
    ],
    defaultBody: `Your order {order} is confirmed — {items}, total Rs. {total}. You can track it from your Orders page.`,
  },
  {
    key: 'request_declined',
    label: 'Request declined',
    when: 'You decline a request.',
    placeholders: [REQUEST, ITEM],
    defaultBody:
      `We're sorry, but we're not able to fulfil your request for "{item}" (Request {request}). Let us know here if you'd like to try a different item or have any questions.`,
  },
  {
    key: 'purchase_failed',
    label: 'Purchase failed',
    when: 'We could not buy an item from the store.',
    placeholders: [
      ORDER,
      ITEM,
      { name: 'reason', help: 'Your reason in brackets, e.g. " (out of stock)". Empty if you gave none', example: ' (out of stock)' },
    ],
    defaultBody:
      `We weren't able to purchase "{item}" from order {order}{reason}. We'll be in touch shortly about a refund or an alternative — sorry for the trouble.`,
  },
  {
    key: 'qc_flagged',
    label: 'Quality check — issue found',
    when: 'An item fails quality check.',
    placeholders: [ORDER, ITEM, { name: 'note', help: 'The note you wrote for the customer', example: 'the zip was damaged' }],
    defaultBody:
      `Quick update on order {order}, "{item}": {note}. We're sorting out a replacement — we'll keep you posted here.`,
  },
  {
    key: 'replacement_passed',
    label: 'Replacement passed quality check',
    when: 'A replacement item passes quality check.',
    placeholders: [ORDER, ITEM],
    defaultBody:
      `Good news — the replacement for "{item}" (order {order}) has passed our quality check! It's moving on to packing and shipping now.`,
  },
  {
    key: 'arrived_sri_lanka',
    label: 'Arrived in Sri Lanka',
    when: 'An order is marked arrived in Sri Lanka.',
    placeholders: [ORDER],
    defaultBody: `Your order {order} has arrived in Sri Lanka! It's being prepared for local delivery — we'll update you again once it's on its way to you.`,
  },
  {
    key: 'delivered',
    label: 'Delivered',
    when: 'An order is marked delivered.',
    placeholders: [ORDER],
    // Deliberately doesn't mention loyalty points — addOrderPoints exists
    // in the loyalty engine but has no call site wiring it to real orders
    // yet (see Wishdrop_STATUS.md), so promising points would be false.
    defaultBody: `🎉 Your order {order} has arrived — enjoy! We really hope it's exactly what you were after. If anything's not quite right, just reply here and we'll sort it out for you. And whenever you spot something else you'd like, send us the link or browse our catalogue — we're always ready for the next one!`,
  },
  {
    key: 'welcome',
    label: 'Welcome — new customer',
    when: 'First message a new customer sees when they open the chat. Sent once, as Wishdrop Support.',
    placeholders: [{ name: 'name', help: 'Customer’s first name ("there" if we don’t have one)', example: 'Kavindi' }],
    defaultBody:
      `Hi {name}, welcome to Wishdrop.\n\nHere's how it works. Send us a link to anything you'd like from any store, or just tell us what you're looking for, and we'll reply with a price. Once you're happy, we buy it, check it, and ship it to you. You can follow every step under My Orders.\n\nIf you have any questions, ask here and we'll reply as soon as we can.`,
  },
  {
    key: 'welcome_phone',
    label: 'Welcome — ask for phone number',
    when: 'Sent right after the welcome, only if the customer has no verified WhatsApp number.',
    placeholders: [{ name: 'link', help: 'Link to the page where they add and verify their number', example: 'https://wishdrop.lk/account/profile' }],
    defaultBody:
      `One more thing. So we can reach you about prices, updates and delivery, and confirm it's really you, please add your WhatsApp number to your account: {link}\n\nIf you'd rather not, you can add it later from your account, and you can still use this chat as normal.`,
  },
]

export const TEMPLATE_BY_KEY: Record<TemplateKey, TemplateDef> = Object.fromEntries(
  TEMPLATE_DEFS.map((d) => [d.key, d]),
) as Record<TemplateKey, TemplateDef>

export const MAX_TEMPLATE_LENGTH = 1500

export type TemplateOverrides = Partial<Record<TemplateKey, string>>

let overrides: TemplateOverrides = {}

/** Installs the saved wording for this process/tab. Unknown keys are ignored. */
export function setTemplateOverrides(next: Record<string, unknown> | null | undefined): void {
  const clean: TemplateOverrides = {}
  for (const [k, v] of Object.entries(next ?? {})) {
    if (k in TEMPLATE_BY_KEY && typeof v === 'string' && v.trim()) clean[k as TemplateKey] = v
  }
  overrides = clean
}

export function getTemplateOverrides(): TemplateOverrides {
  return overrides
}

export function templateBody(key: TemplateKey): string {
  return overrides[key] ?? TEMPLATE_BY_KEY[key].defaultBody
}

/** Fills {placeholders}. A placeholder with no value is left as typed. */
export function fillTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{([a-z_]+)\}/g, (whole, name: string) => (name in vars ? vars[name] : whole))
}

export function renderMessageTemplate(key: TemplateKey, vars: Record<string, string>): string {
  return fillTemplate(templateBody(key), vars)
}

/** Placeholders written in `body` that this template doesn't know about. */
export function unknownPlaceholders(key: TemplateKey, body: string): string[] {
  const allowed = new Set(TEMPLATE_BY_KEY[key].placeholders.map((p) => p.name))
  const found = new Set<string>()
  for (const m of body.matchAll(/\{([^{}]*)\}/g)) if (!allowed.has(m[1])) found.add(m[1])
  return [...found]
}
