// lib/scrape/route-memory.ts
//
// SERVER-ONLY. Remembers, per store, which fetch method last worked, so the
// next link from that store goes straight to it instead of first waiting on
// methods that are currently blocked.
//
// Example: Myntra's plain fetch keeps getting a CAPTCHA, the headless browser
// gets one too, and Scrapingdog works. For the next 30 minutes every Myntra
// link starts with Scrapingdog. If Scrapingdog then fails, the lookup falls
// back to the normal full order and the memory is cleared.
//
// The memory is written once when a NEW winner is found and is not extended
// by later wins, so after 30 minutes the full order runs again once. If the
// plain fetch works again by then (cheaper and faster), it becomes the winner.
//
// Shared by every server through Redis (WISH_DROP_REDIS_URL); in memory
// otherwise.

import { sharedRedis } from '@/lib/rate-limit'

export type FetchRoute = 'direct' | 'render' | 'scraperapi' | 'fingerprint_fetch' | 'scrapingdog' | 'scrape_do'

const TTL_SECONDS = Number(process.env.SCRAPE_ROUTE_MEMORY_SECONDS) || 30 * 60
const memory = new Map<string, { route: FetchRoute; expires: number }>()

const keyFor = (site: string) => `wd:scrape-route:${site}`

export async function rememberedRoute(site: string): Promise<FetchRoute | null> {
  const r = sharedRedis()
  if (r) {
    try {
      const v = await r.get(keyFor(site))
      if (v) return v as FetchRoute
    } catch {
      // fall back to memory
    }
  }
  const m = memory.get(site)
  if (m && m.expires > Date.now()) return m.route
  if (m) memory.delete(site)
  return null
}

export async function rememberRoute(site: string, route: FetchRoute): Promise<void> {
  memory.set(site, { route, expires: Date.now() + TTL_SECONDS * 1000 })
  const r = sharedRedis()
  if (!r) return
  try {
    await r.set(keyFor(site), route, 'EX', TTL_SECONDS)
  } catch {
    // memory still has it
  }
}

export async function forgetRoute(site: string): Promise<void> {
  memory.delete(site)
  const r = sharedRedis()
  if (!r) return
  try {
    await r.del(keyFor(site))
  } catch {
    // ignore
  }
}
