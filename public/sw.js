/* WishDrop service worker
 *
 * What it caches, and why:
 *   - Build assets (/_next/static/*): cache-first. Filenames are content-
 *     hashed, so a cached copy can never be stale.
 *   - Public images, icons, fonts: stale-while-revalidate. Fast repeat
 *     loads, and replaced images still refresh in the background.
 *   - Public pages (home, stores, product pages, policies): network-first,
 *     falling back to the last cached copy, then to /offline.
 *
 * What it NEVER caches:
 *   - Anything under /account, /admin, /seller, /catalogue, /demo, /auth,
 *     /api — these contain personal or staff data, and a cached copy could
 *     be shown to the next person using the same device.
 *   - Next.js RSC/data requests (client-side navigation payloads).
 *   - Cross-origin requests (Supabase, store images, analytics).
 *   - Anything that isn't a GET.
 *
 * Bump VERSION whenever this file's logic changes; old caches are deleted
 * on activate. (App deploys don't need a bump — hashed assets handle that.)
 */

const VERSION = 'v1'
const PRECACHE = `wishdrop-precache-${VERSION}`
const PAGES = `wishdrop-pages-${VERSION}`
const ASSETS = `wishdrop-assets-${VERSION}`
const STATIC = `wishdrop-static-${VERSION}`

const OFFLINE_URL = '/offline'

const PRECACHE_URLS = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/favicon.ico',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
]

const PRIVATE_PREFIXES = ['/account', '/admin', '/seller', '/catalogue', '/demo', '/auth', '/api']

const MAX_PAGE_ENTRIES = 60
const MAX_ASSET_ENTRIES = 150

// ─── Lifecycle ──────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PRECACHE)
      // cache: 'reload' bypasses the HTTP cache so we precache fresh copies.
      .then((cache) => cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  const keep = new Set([PRECACHE, PAGES, ASSETS, STATIC])
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names.filter((n) => n.startsWith('wishdrop-') && !keep.has(n)).map((n) => caches.delete(n)),
      )
      // Navigation preload lets the browser start the page request while
      // the worker boots, so network-first pages aren't slowed down.
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable()
      }
      await self.clients.claim()
    })(),
  )
})

// Lets the page tell a waiting worker to take over (see ServiceWorkerRegister).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
  if (event.data && event.data.type === 'CLEAR_CACHES') {
    // Called on logout so nothing from the signed-in session lingers.
    event.waitUntil(
      caches.keys().then((names) =>
        Promise.all(names.filter((n) => n.startsWith('wishdrop-') && n !== PRECACHE).map((n) => caches.delete(n))),
      ),
    )
  }
})

// ─── Routing ────────────────────────────────────────────────────────────

function isPrivatePath(pathname) {
  return PRIVATE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

function isRscRequest(request, url) {
  return (
    request.headers.get('RSC') === '1' ||
    request.headers.get('Next-Router-Prefetch') === '1' ||
    url.searchParams.has('_rsc')
  )
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (isPrivatePath(url.pathname)) {
    // Network only — but still show the offline page if a private page is
    // opened with no connection, instead of the browser's error screen.
    if (request.mode === 'navigate') {
      event.respondWith(fetch(request).catch(() => offlineResponse()))
    }
    return
  }
  if (isRscRequest(request, url)) return

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, STATIC))
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(event))
    return
  }

  if (['image', 'font', 'style'].includes(request.destination) || url.pathname.startsWith('/icons/')) {
    event.respondWith(staleWhileRevalidate(event, request, ASSETS))
  }
})

// ─── Strategies ─────────────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) cache.put(request, response.clone())
  return response
}

async function networkFirstPage(event) {
  const { request } = event
  const cache = await caches.open(PAGES)
  try {
    const preloaded = await event.preloadResponse
    const response = preloaded || (await fetch(request))
    // Only keep successful, non-redirected HTML. A redirected response
    // (e.g. to a login page) must not be cached under the original URL.
    if (response.ok && !response.redirected && response.type === 'basic') {
      cache.put(request, response.clone()).then(() => trimCache(PAGES, MAX_PAGE_ENTRIES))
    }
    return response
  } catch {
    const cached = await cache.match(request, { ignoreSearch: true })
    return cached || offlineResponse()
  }
}

async function staleWhileRevalidate(event, request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  const network = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone()).then(() => trimCache(cacheName, MAX_ASSET_ENTRIES))
      }
      return response
    })
    .catch(() => undefined)

  if (cached) {
    event.waitUntil(network)
    return cached
  }
  const response = await network
  return response || Response.error()
}

async function offlineResponse() {
  const cached = await caches.match(OFFLINE_URL)
  return (
    cached ||
    new Response('<h1>You are offline</h1><p>Check your connection and try again.</p>', {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  )
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  if (keys.length <= maxEntries) return
  await Promise.all(keys.slice(0, keys.length - maxEntries).map((key) => cache.delete(key)))
}
