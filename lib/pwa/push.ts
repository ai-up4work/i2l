// lib/pwa/push.ts
//
// Browser side of push notifications: permission, subscribing this device,
// telling the server about it, and a hook for UI.
//
// Device registration lives on the server per signed-in customer
// (push_subscriptions). The browser's own subscription is kept across
// sign-out, but the server mapping is removed, so a shared device stops
// receiving the previous customer's messages; PushSync re-links it to
// whoever signs in next (only if they had notifications on).

'use client'

import { useCallback, useEffect, useState } from 'react'

export type PushStatus =
  | 'loading'
  | 'unsupported' // browser has no web push (or the service worker isn't running, e.g. `next dev`)
  | 'needs-install' // iPhone/iPad: only works from the Home Screen app
  | 'not-configured' // NEXT_PUBLIC_VAPID_PUBLIC_KEY missing
  | 'denied' // the customer blocked notifications for this site
  | 'off'
  | 'on'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function isIOS() {
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function hasPushApis() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/** The active service worker registration, or null if none is running. */
async function getRegistration(timeoutMs = 4000): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  const existing = await navigator.serviceWorker.getRegistration('/')
  if (existing?.active) return existing
  // Registration happens after page load (ServiceWorkerRegister); wait briefly.
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ])
}

async function saveSubscription(sub: PushSubscription) {
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub.toJSON()),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || 'Could not turn on notifications.')
  }
}

async function forgetSubscription(endpoint: string) {
  await fetch('/api/push/subscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  })
}

export async function getPushStatus(): Promise<PushStatus> {
  if (typeof window === 'undefined') return 'loading'
  if (isIOS() && !isStandalone()) return 'needs-install'
  if (!hasPushApis()) return 'unsupported'
  if (!VAPID_PUBLIC_KEY) return 'not-configured'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await getRegistration()
  if (!reg) return 'unsupported'
  const sub = await reg.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

/** Asks for permission (call from a click/tap) and registers this device. */
export async function enablePush(): Promise<PushStatus> {
  const status = await getPushStatus()
  if (status !== 'off' && status !== 'on') return status

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'

  const reg = await getRegistration()
  if (!reg) return 'unsupported'
  const sub =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }))
  await saveSubscription(sub)
  return 'on'
}

/** Turns notifications off on this device (server + browser). */
export async function disablePush(): Promise<PushStatus> {
  const reg = await getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await forgetSubscription(sub.endpoint).catch(() => {})
    await sub.unsubscribe().catch(() => {})
  }
  return getPushStatus()
}

/**
 * Called on sign-out, BEFORE the session ends (the API needs it). Unlinks
 * this device from the account but keeps the browser permission, so it can
 * be re-linked to whoever signs in next.
 */
export async function releaseDeviceForSignOut(): Promise<void> {
  if (!hasPushApis()) return
  const reg = await navigator.serviceWorker.getRegistration('/')
  const sub = await reg?.pushManager.getSubscription()
  if (sub) await forgetSubscription(sub.endpoint).catch(() => {})
}

/**
 * Called when a customer signs in (PushSync). If this device already has
 * notification permission, (re)links it to them — covers new logins on a
 * shared device and keeps the server's device list fresh. Never prompts.
 */
export async function syncDeviceForSignedInUser(): Promise<void> {
  if (!hasPushApis() || !VAPID_PUBLIC_KEY || Notification.permission !== 'granted') return
  const reg = await getRegistration()
  if (!reg) return
  const sub =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }))
  await saveSubscription(sub)
}

/** UI hook: current status on this device, plus enable/disable actions. */
export function usePushNotifications() {
  const [status, setStatus] = useState<PushStatus>('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setStatus(await getPushStatus())
    } catch {
      setStatus('unsupported')
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const run = useCallback(async (action: () => Promise<PushStatus>) => {
    setBusy(true)
    setError(null)
    try {
      setStatus(await action())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }, [])

  return {
    status,
    busy,
    error,
    enable: () => run(enablePush),
    disable: () => run(disablePush),
    refresh,
  }
}
