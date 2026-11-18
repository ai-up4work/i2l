// lib/whatsapp/extract-phone.ts
//
// Pulls phone numbers out of whatever staff paste: a bare number, a
// WhatsApp message/contact card, a wa.me link, "94771234567@s.whatsapp.net",
// "+94 77 123 4567 · Maya". Returns each distinct valid number as E.164,
// best (most "number-looking") first. Safe on client and server.

import { normalizeWhatsAppNumber } from './verification'

export function extractPhoneNumbers(text: string): string[] {
  const found: string[] = []
  const add = (raw: string) => {
    const n = normalizeWhatsAppNumber(raw)
    if (n && !found.includes(n)) found.push(n)
  }
  const t = text.slice(0, 4000)

  // wa.me/9477…, api.whatsapp.com/send?phone=9477…, 9477…@s.whatsapp.net
  for (const m of t.matchAll(/(?:wa\.me\/|phone=|@?)(\+?\d{9,15})(?:@s\.whatsapp\.net|@c\.us)?/gi)) add(m[1])
  // Runs of digits with spaces/dashes/brackets: "+94 77 123 4567", "(077) 123-4567"
  for (const m of t.matchAll(/\+?\d[\d\s\-().]{7,18}\d/g)) add(m[0])
  return found
}
