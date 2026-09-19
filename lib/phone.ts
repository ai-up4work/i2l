// lib/phone.ts
//
// Validates and normalizes a Sri Lankan mobile number into E.164 format
// ("+947XXXXXXXX") before it's ever sent to Supabase's phone-auth API
// (supabase.auth.updateUser({ phone })) or the WhatsApp Cloud API.
//
// Previously nothing validated the phone input at all — handleSendOtp
// just did phoneInput.trim() and sent whatever the customer typed
// straight to Supabase, so a malformed number (missing country code,
// wrong digit count, stray characters) would only surface as whatever
// generic error Supabase's own phone-auth endpoint happened to return,
// if it caught it at all, rather than a clear, immediate message before
// an OTP send was even attempted.

/**
 * Accepts the shapes a customer is likely to actually type — with or
 * without the country code, with or without a leading 0, with spaces or
 * dashes — so "0771234567", "94771234567", "+94 77 123 4567" and
 * "771234567" all resolve to the same normalized value. Returns null
 * (never a partial/garbage value) for anything that isn't a plausible
 * Sri Lankan mobile number, so the caller can reject it locally instead
 * of letting it reach the SMS provider.
 */
export function normalizeSriLankanMobile(input: string): string | null {
  const cleaned = input.trim().replace(/[^\d+]/g, '')

  let rest: string
  if (cleaned.startsWith('+94')) rest = cleaned.slice(3)
  else if (cleaned.startsWith('94')) rest = cleaned.slice(2)
  else if (cleaned.startsWith('0')) rest = cleaned.slice(1)
  else rest = cleaned

  // Every current Sri Lankan mobile prefix starts with 7, followed by 8
  // more digits — 9 digits total after the country code. This
  // deliberately doesn't try to validate the specific second digit
  // against the exact list of assigned prefixes (70/71/72/74/75/76/77/78)
  // since new ones get assigned over time; the shape check is enough to
  // catch actual mistakes (too short, too long, a landline number, junk
  // text) without this needing to be updated every time a new prefix
  // is issued.
  if (!/^7\d{8}$/.test(rest)) return null
  return `+94${rest}`
}

/**
 * Rewrites known Supabase phone-auth errors into something a customer
 * can actually act on, instead of showing GoTrue's internal error text
 * verbatim — same principle as useProductLookup.ts's scraper-failure
 * handling: the raw reason is an ops/config detail, not something a
 * customer reading it can do anything about, and naming it invites a
 * confused support ticket rather than helping them. Anything not
 * recognized here is passed through as-is rather than guessed at.
 */
export function friendlyPhoneAuthError(rawMessage: string): string {
  if (/unable to get sms provider/i.test(rawMessage)) {
    return "We can't send verification codes right now — please try again later or contact support."
  }
  return rawMessage
}