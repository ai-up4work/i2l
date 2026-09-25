// lib/whatsapp/verification.ts
//
// Shared helpers for staff-reviewed WhatsApp verification
// (data/wishdrop-whatsapp-manual-verification.sql). Safe to import from
// both client and server code — no secrets here.

/** The WhatsApp number customers message to verify. Must be a number
 * staff actually read in the WhatsApp (Business) app. Defaults to the
 * site's normal WhatsApp contact number. */
export const WHATSAPP_VERIFY_NUMBER = (
  process.env.NEXT_PUBLIC_WHATSAPP_VERIFY_NUMBER ||
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ||
  '94770774828'
).replace(/\D/g, '')

/**
 * Normalizes what a customer types into E.164.
 * - Sri Lankan mobiles in any common shape: 0771234567, 771234567,
 *   94771234567, +94 77 123 4567 → +94771234567
 * - Any other country only with an explicit "+" and country code
 *   (+91…, +44…), 8–15 digits — we can't guess the country otherwise.
 */
export function normalizeWhatsAppNumber(input: string): string | null {
  const trimmed = input.trim()
  const cleaned = trimmed.replace(/[^\d+]/g, '')

  let rest: string
  if (cleaned.startsWith('+94')) rest = cleaned.slice(3)
  else if (cleaned.startsWith('94') && cleaned.length === 11) rest = cleaned.slice(2)
  else if (cleaned.startsWith('0') && cleaned.length === 10) rest = cleaned.slice(1)
  else if (!cleaned.startsWith('+')) rest = cleaned
  else rest = ''

  if (/^7\d{8}$/.test(rest)) return `+94${rest}`

  if (cleaned.startsWith('+') && !cleaned.startsWith('+94') && /^\+\d{8,15}$/.test(cleaned)) {
    return cleaned
  }
  return null
}

/** "+94771234567" → "+94 77 123 4567" (other countries: unchanged). */
export function formatPhone(e164: string): string {
  const m = /^\+94(\d{2})(\d{3})(\d{4})$/.exec(e164)
  return m ? `+94 ${m[1]} ${m[2]} ${m[3]}` : e164
}

// No 0/O/1/I/L — easy to read out and type from a phone screen.
const REF_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/** "WD-7K3D9Q" — short, unambiguous, random. */
export function newVerificationReference(): string {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const b of bytes) out += REF_ALPHABET[b % REF_ALPHABET.length]
  return `WD-${out}`
}

export interface VerificationMessageInput {
  reference: string
  name: string
  email: string
  handle: string | null
  phone: string
}

/** The pre-written WhatsApp message the customer sends. */
export function verificationMessage(v: VerificationMessageInput): string {
  return [
    'Hi WishDrop! Please verify my WhatsApp number.',
    '',
    `Reference: ${v.reference}`,
    `Name: ${v.name}`,
    ...(v.handle ? [`Chat handle: ${v.handle}`] : []),
    `Email: ${v.email}`,
    `Number: ${formatPhone(v.phone)}`,
  ].join('\n')
}

export function verificationWhatsAppLink(message: string): string {
  return `https://wa.me/${WHATSAPP_VERIFY_NUMBER}?text=${encodeURIComponent(message)}`
}

/** Reject reasons staff can pick from; shown to the customer as-is. */
export const REJECT_REASONS = [
  'We didn’t receive your WhatsApp message.',
  'The message came from a different number than the one you entered.',
  'This number is already linked to another WishDrop account.',
] as const
