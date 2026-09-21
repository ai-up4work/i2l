// lib/chat/phone.ts
//
// Sri-Lanka-focused normalizer. Two representations kept deliberately
// distinct, since this app needs both and they're NOT interchangeable:
//   - E.164 (+94770774828) — what Supabase Auth's own `phone` field
//     needs (verify-code/route.ts passes this straight through to
//     admin.auth.admin.updateUserById), and what's stored in
//     profiles.phone / pending_phone.
//   - "WhatsApp digits" (94770774828, no leading +) — what Meta's Cloud
//     API wants for the `to` field in sendTextMessage/sendTemplateMessage
//     (see lib/chat/whatsapp.ts's own param comment), and what arrives
//     in the `from` field of an inbound webhook payload.
// Every place that talks to both Supabase and Meta in the same request
// (send-code today; the inbound webhook next) needs to convert between
// the two, so this lives once instead of being reimplemented per file.

const SL_COUNTRY_CODE = '94'

/**
 * Best-effort: turns whatever a customer actually typed (0770774828,
 * +94 77 077 4828, 94770774828, with spaces/dashes/parens) into strict
 * E.164 (+94770774828). Returns null if it doesn't look like a
 * plausible Sri Lankan mobile number once cleaned — callers should
 * treat that as "ask them to re-enter it," not silently store
 * something malformed that'll quietly fail to match anything later.
 */
export function normalizePhoneE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')

  // Already has the country code: "94770774828" (11 digits total).
  if (digits.startsWith(SL_COUNTRY_CODE) && digits.length === 11) {
    return `+${digits}`
  }
  // Local format with leading 0: "0770774828" (10 digits).
  if (digits.startsWith('0') && digits.length === 10) {
    return `+${SL_COUNTRY_CODE}${digits.slice(1)}`
  }
  // Bare 9-digit national number, no leading 0 and no country code —
  // e.g. someone pasted just "770774828".
  if (digits.length === 9) {
    return `+${SL_COUNTRY_CODE}${digits}`
  }
  return null
}

/** E.164 (+94770774828) -> the digits-only shape Meta's Cloud API wants
 * for `to` when sending. */
export function e164ToWhatsAppDigits(e164: string): string {
  return e164.replace(/^\+/, '')
}

/** The reverse — an inbound webhook's `from` (94770774828, always
 * digits-only per Meta's own payload format) back to the E.164 shape
 * profiles.phone is actually stored in, so it can be matched with a
 * plain `.eq('phone', ...)` lookup. */
export function whatsAppDigitsToE164(digits: string): string {
  return `+${digits.replace(/\D/g, '')}`
}