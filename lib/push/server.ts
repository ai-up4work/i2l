// lib/push/server.ts
//
// SERVER ONLY — holds the VAPID private key. Sends web push notifications
// to every registered device of a set of users, and cleans up devices the
// browser has retired.
//
// Env:
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY  public key (also used by the browser)
//   VAPID_PRIVATE_KEY             private key — never expose
//   VAPID_SUBJECT                 mailto: or https: contact, e.g. mailto:support@wishdrop.shop
// Generate a pair once with `npm run push:keys`.
//
// Only import from route handlers / server code. (web-push is Node-only,
// so an accidental client import fails the build instead of leaking keys.)

import webpush, { type PushSubscription, WebPushError } from 'web-push'
import type { createServiceRoleClient } from '@/lib/supabase/server'

type AdminClient = ReturnType<typeof createServiceRoleClient>

/** What the service worker receives (see the `push` handler in public/sw.js). */
export interface PushPayload {
  title: string
  body: string
  /** Site-relative path opened when the notification is tapped. */
  url: string
  /** Notifications with the same tag replace each other (e.g. one per chat thread). */
  tag?: string
  /** 'account' = one-off updates about the customer's own account (e.g. WhatsApp number verified). */
  kind: 'chat' | 'announcement' | 'offer' | 'test' | 'account'
  /** Optional large image (Android/desktop only). */
  image?: string
}

export interface PushResult {
  devices: number
  sent: number
  failed: number
  removed: number
}

let configured: boolean | null = null

export function isPushConfigured(): boolean {
  if (configured !== null) return configured
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:support@wishdrop.shop'
  if (!publicKey || !privateKey) {
    configured = false
    return false
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)
  configured = true
  return true
}

const CONCURRENCY = 25
const IN_CHUNK = 300 // user ids per `in (...)` query, keeps URLs well under limits
const MAX_FAILURES_BEFORE_REMOVAL = 5

async function fetchSubscriptions(admin: AdminClient, userIds: string[]) {
  const rows: { id: string; endpoint: string; p256dh: string; auth: string; failure_count: number }[] = []
  for (let i = 0; i < userIds.length; i += IN_CHUNK) {
    const { data, error } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth, failure_count')
      .in('user_id', userIds.slice(i, i + IN_CHUNK))
    if (error) throw error
    rows.push(...(data ?? []))
  }
  return rows
}

/**
 * Sends `payload` to every device registered by `userIds`.
 *
 * - 404/410 from the push service = the browser dropped that subscription
 *   (user revoked permission, cleared data, uninstalled) → row deleted.
 * - Other failures bump failure_count; after 5 in a row the row is deleted.
 * - Success resets failure_count.
 */
export async function sendPushToUsers(
  admin: AdminClient,
  userIds: string[],
  payload: PushPayload,
): Promise<PushResult> {
  const result: PushResult = { devices: 0, sent: 0, failed: 0, removed: 0 }
  if (!userIds.length || !isPushConfigured()) return result

  const unique = Array.from(new Set(userIds))
  const subs = await fetchSubscriptions(admin, unique)
  result.devices = subs.length
  if (!subs.length) return result

  const body = JSON.stringify(payload)
  const toRemove: string[] = []
  const toBump: { id: string; failure_count: number }[] = []
  const succeeded: string[] = []

  let cursor = 0
  async function worker() {
    while (cursor < subs.length) {
      const sub = subs[cursor++]
      const target: PushSubscription = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }
      try {
        await webpush.sendNotification(target, body, {
          TTL: payload.kind === 'chat' ? 60 * 60 * 24 : 60 * 60 * 24 * 3,
          // 'high' = deliver now, even to an idle phone. With 'normal',
          // Android holds the push while the phone sleeps (Doze) and only
          // delivers when the screen comes on — it looked like
          // notifications "only arrive when the app is open". Offers are
          // the one kind that can wait.
          urgency: payload.kind === 'offer' ? 'normal' : 'high',
          topic: payload.tag?.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || undefined,
        })
        result.sent++
        if (sub.failure_count > 0) succeeded.push(sub.id)
      } catch (err) {
        result.failed++
        const status = err instanceof WebPushError ? err.statusCode : 0
        if (status === 404 || status === 410 || sub.failure_count + 1 >= MAX_FAILURES_BEFORE_REMOVAL) {
          toRemove.push(sub.id)
        } else {
          toBump.push({ id: sub.id, failure_count: sub.failure_count + 1 })
        }
        if (status !== 404 && status !== 410) {
          console.error('[push] send failed', status, err instanceof Error ? err.message : err)
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, subs.length) }, worker))

  // Bookkeeping is best-effort; never fail the send because of it.
  try {
    for (let i = 0; i < toRemove.length; i += IN_CHUNK) {
      await admin.from('push_subscriptions').delete().in('id', toRemove.slice(i, i + IN_CHUNK))
    }
    result.removed = toRemove.length
    for (const row of toBump) {
      await admin.from('push_subscriptions').update({ failure_count: row.failure_count }).eq('id', row.id)
    }
    for (let i = 0; i < succeeded.length; i += IN_CHUNK) {
      await admin.from('push_subscriptions').update({ failure_count: 0 }).in('id', succeeded.slice(i, i + IN_CHUNK))
    }
  } catch (err) {
    console.error('[push] subscription bookkeeping failed', err)
  }

  return result
}

/** Trims text for a notification body (lock screens show ~2–4 lines). */
export function notificationText(text: string | null | undefined, max = 140): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean
}
