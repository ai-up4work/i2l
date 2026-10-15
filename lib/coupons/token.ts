// lib/coupons/token.ts
//
// SERVER-ONLY. Signed coupon codes.
//
// A coupon code is a small binary payload plus an HMAC-SHA256 signature,
// both base64url-encoded — the same idea as a JWT, just compact enough to
// copy and paste:
//
//   WD1.<payload>.<signature>
//   payload = version(1) | couponId(16 bytes) | userId(16 bytes, or zeros)
//
// userId zeros = a shared code (an "everyone" or "new customers" campaign);
// otherwise the code is bound to that one customer and is rejected for
// anyone else. Changing a single character breaks the signature, and only
// the server knows the secret, so codes can't be forged, guessed or edited
// into a bigger discount. The token carries no discount amounts at all:
// the coupon row in the database is still the source of truth for value,
// limits, dates and status, and is re-checked on every use.
//
// Secret: COUPON_SIGNING_SECRET (set it on Vercel; any long random string,
// e.g. `openssl rand -base64 48`). Changing it invalidates every code
// already handed out.

import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'

const PREFIX = 'WD1'
const VERSION = 1
const SIG_BYTES = 16
const ZERO_UUID = '00000000-0000-0000-0000-000000000000'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function secret(): string {
  const s = process.env.COUPON_SIGNING_SECRET
  if (s && s.length >= 16) return s
  // Fallback so local development works without extra setup. Production
  // must set its own secret — see the header comment.
  const fallback = process.env.SUPABASE_JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!fallback) throw new Error('COUPON_SIGNING_SECRET is not set.')
  if (process.env.NODE_ENV === 'production') {
    console.warn('[coupons] COUPON_SIGNING_SECRET is not set; using a derived fallback. Set it on Vercel.')
  }
  return `coupon-signing:${fallback}`
}

function uuidToBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ''), 'hex')
}

function bytesToUuid(buf: Buffer): string {
  const h = buf.toString('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

function sign(payload: Buffer): Buffer {
  return createHmac('sha256', secret()).update(PREFIX).update(payload).digest().subarray(0, SIG_BYTES)
}

/** Mints a code for a coupon. Pass `userId` to bind it to one customer. */
export function mintCouponToken(couponId: string, userId: string | null = null): string {
  if (!UUID_RE.test(couponId)) throw new Error('Invalid coupon id')
  if (userId && !UUID_RE.test(userId)) throw new Error('Invalid user id')
  const payload = Buffer.concat([Buffer.from([VERSION]), uuidToBytes(couponId), uuidToBytes(userId ?? ZERO_UUID)])
  return `${PREFIX}.${payload.toString('base64url')}.${sign(payload).toString('base64url')}`
}

export type VerifiedCouponToken = { couponId: string; userId: string | null }

/** Returns the coupon (and bound customer) a code refers to, or null if
 *  the code is malformed or its signature doesn't match. */
export function verifyCouponToken(raw: string): VerifiedCouponToken | null {
  const token = raw.trim()
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== PREFIX) return null
  let payload: Buffer
  let sig: Buffer
  try {
    payload = Buffer.from(parts[1], 'base64url')
    sig = Buffer.from(parts[2], 'base64url')
  } catch {
    return null
  }
  if (payload.length !== 33 || payload[0] !== VERSION || sig.length !== SIG_BYTES) return null
  const expected = sign(payload)
  if (!timingSafeEqual(expected, sig)) return null
  const couponId = bytesToUuid(payload.subarray(1, 17))
  const userId = bytesToUuid(payload.subarray(17, 33))
  return { couponId, userId: userId === ZERO_UUID ? null : userId }
}

/** True if the text looks like one of our codes (cheap check, no crypto). */
export function looksLikeCouponToken(raw: string): boolean {
  return raw.trim().startsWith(`${PREFIX}.`)
}
