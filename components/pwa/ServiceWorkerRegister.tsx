'use client'

// components/pwa/ServiceWorkerRegister.tsx
//
// Registers /public/sw.js. Mounted once in app/layout.tsx; renders nothing.
//
// Production only by default: a service worker in `next dev` intercepts
// hot-reload requests and serves stale pages, which is confusing while
// developing. Set NEXT_PUBLIC_ENABLE_SW_IN_DEV=true to test PWA behaviour
// locally (then use DevTools → Application → Service workers → Unregister
// when you're done). In dev without that flag, any previously registered
// worker is removed so it can't haunt localhost.

import { useEffect } from 'react'

const SW_URL = '/sw.js'
const UPDATE_CHECK_MS = 60 * 60 * 1000 // hourly, for long-lived tabs / installed app

function swEnabled() {
  return process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_ENABLE_SW_IN_DEV === 'true'
}

/** Tell the active worker to drop cached pages/assets (called on logout). */
export function clearServiceWorkerCaches() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  navigator.serviceWorker.controller?.postMessage({ type: 'CLEAR_CACHES' })
}

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    if (!swEnabled()) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => {})
      return
    }

    let interval: ReturnType<typeof setInterval> | undefined
    let registration: ServiceWorkerRegistration | undefined

    const checkForUpdate = () => {
      if (document.visibilityState === 'visible') registration?.update().catch(() => {})
    }

    const register = async () => {
      try {
        registration = await navigator.serviceWorker.register(SW_URL, {
          scope: '/',
          // Always re-fetch sw.js itself, never from the HTTP cache.
          updateViaCache: 'none',
        })
        // A worker that installed while an older one was still in control
        // is told to take over now rather than waiting for every tab to close.
        registration.waiting?.postMessage({ type: 'SKIP_WAITING' })
        interval = setInterval(checkForUpdate, UPDATE_CHECK_MS)
        document.addEventListener('visibilitychange', checkForUpdate)
      } catch (err) {
        console.error('[pwa] service worker registration failed', err)
      }
    }

    // Register after load so it never competes with first-paint resources.
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })

    return () => {
      window.removeEventListener('load', register)
      document.removeEventListener('visibilitychange', checkForUpdate)
      if (interval) clearInterval(interval)
    }
  }, [])

  return null
}
