// lib/chat/whatsapp-handoff.ts
//
// Builds the text + link for "Send to WhatsApp" in the admin inbox. Pure
// functions (no React, no secrets) so they're easy to test and safe to
// import anywhere.
//
// WhatsApp formatting used: *bold* and plain line breaks. Everything else
// is plain text so it reads fine even if formatting isn't rendered.

import { SITE_URL } from '@/lib/seo'
import { parseReplyBody } from '@/lib/supabase/chat'

/** Keeps the pre-filled text safely under what wa.me handles on every
 * platform (long URLs get cut off on some phones). */
export const MAX_WHATSAPP_CHARS = 1500

export type LinkTarget =
  | { kind: 'order'; displayId: string }
  | { kind: 'messages' }
  | { kind: 'orders' }
  | { kind: 'none' }

/** What the conversation is about, for the greeting line. */
export type Context = { kind: 'order' | 'request'; displayId: string } | null

export interface HandoffMessage {
  text: string | null
  attachmentUrl: string | null
}

export function linkUrl(target: LinkTarget): string | null {
  switch (target.kind) {
    case 'order':
      return `${SITE_URL}/account/orders/track?order=${encodeURIComponent(target.displayId)}`
    case 'messages':
      return `${SITE_URL}/account/messages`
    case 'orders':
      return `${SITE_URL}/account/orders`
    default:
      return null
  }
}

function linkLine(target: LinkTarget): string | null {
  const url = linkUrl(target)
  if (!url) return null
  if (target.kind === 'order') return `Track your order: ${url}`
  if (target.kind === 'orders') return `Your orders: ${url}`
  return `Read and reply here: ${url}`
}

function aboutPhrase(ctx: Context): string {
  if (!ctx) return ''
  return ctx.kind === 'order' ? ` about your order *${ctx.displayId}*` : ` about your request *${ctx.displayId}*`
}

function greeting(firstName: string | null) {
  return firstName ? `Hi ${firstName},` : 'Hi,'
}

/** A message body without the "↪️ replying to: …" prefix staff replies carry. */
function cleanBody(text: string | null): string {
  return parseReplyBody(text ?? '').text.trim()
}

/**
 * One or more staff messages, combined in order.
 * - 1 message → sent as a paragraph.
 * - several → bullet list.
 * Photos/videos can't travel through a link, so they're counted and the
 * customer is pointed at the link. If the text would be too long, later
 * messages are replaced with "…and N more".
 */
export function composeMessagesText(opts: {
  firstName: string | null
  messages: HandoffMessage[]
  context: Context
  link: LinkTarget
}): string {
  const { firstName, messages, context, link } = opts
  const bodies = messages.map((m) => cleanBody(m.text)).filter(Boolean)
  const mediaCount = messages.filter((m) => m.attachmentUrl).length
  const tail = linkLine(link)

  const header =
    messages.length === 1
      ? `${greeting(firstName)} a message from Wishdrop${aboutPhrase(context)}:`
      : `${greeting(firstName)} here's an update from Wishdrop${aboutPhrase(context)}:`

  const mediaLine =
    mediaCount > 0
      ? `We also sent you ${mediaCount === 1 ? 'a photo' : `${mediaCount} photos/videos`}${
          tail ? ` — see ${mediaCount === 1 ? 'it' : 'them'} at the link below.` : ' in your Wishdrop messages.'
        }`
      : null

  const build = (shown: string[], hidden: number) => {
    const body =
      shown.length === 1 && hidden === 0 && messages.length === 1
        ? shown[0]
        : [...shown.map((b) => `• ${b.replace(/\n+/g, ' ')}`), ...(hidden > 0 ? [`…and ${hidden} more message${hidden === 1 ? '' : 's'}.`] : [])].join('\n')
    return [header, '', body, ...(mediaLine ? ['', mediaLine] : []), ...(tail ? ['', tail] : [])].join('\n')
  }

  // Drop messages from the end until it fits; truncate a single huge one.
  for (let n = bodies.length; n >= 1; n--) {
    const text = build(bodies.slice(0, n), bodies.length - n)
    if (text.length <= MAX_WHATSAPP_CHARS) return text
  }
  const room = Math.max(200, MAX_WHATSAPP_CHARS - build([''], bodies.length - 1).length - 1)
  return build([`${(bodies[0] ?? '').slice(0, room).trimEnd()}…`], bodies.length - 1)
}

/** "You have messages waiting" nudge. */
export function composeReminderText(opts: {
  firstName: string | null
  waitingCount: number
  context: Context
  link: LinkTarget
}): string {
  const { firstName, waitingCount, context, link } = opts
  const what =
    waitingCount > 1
      ? `you have ${waitingCount} new messages from Wishdrop`
      : waitingCount === 1
        ? 'you have a new message from Wishdrop'
        : 'we have an update for you from Wishdrop'
  const tail = linkLine(link)
  return [`${greeting(firstName)} ${what}${aboutPhrase(context)}.`, ...(tail ? ['', tail] : [])].join('\n')
}

/** wa.me link for a verified E.164 number (+94…) and text. */
export function waMeUrl(phoneE164: string, text: string): string {
  return `https://wa.me/${phoneE164.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`
}

/** First name for greetings; null if it doesn't look like a name. */
export function firstNameOf(fullName: string | null | undefined): string | null {
  const first = (fullName ?? '').trim().split(/\s+/)[0] ?? ''
  if (!first || /@|\d/.test(first)) return null
  return first.charAt(0).toUpperCase() + first.slice(1)
}

/**
 * Best default link + greeting context for a set of messages:
 * - all tagged to one order → that order's tracking page
 * - a request (customers have no request page) → My Messages
 * - otherwise → My Messages
 */
export function defaultTargets(
  tags: { orderDisplayId: string | null; requestDisplayId: string | null }[],
): { context: Context; link: LinkTarget } {
  const orders = new Set(tags.map((t) => t.orderDisplayId).filter(Boolean) as string[])
  const requests = new Set(tags.map((t) => t.requestDisplayId).filter(Boolean) as string[])
  if (orders.size === 1 && requests.size === 0) {
    const displayId = [...orders][0]
    return { context: { kind: 'order', displayId }, link: { kind: 'order', displayId } }
  }
  if (requests.size === 1 && orders.size === 0) {
    return { context: { kind: 'request', displayId: [...requests][0] }, link: { kind: 'messages' } }
  }
  return { context: null, link: { kind: 'messages' } }
}
