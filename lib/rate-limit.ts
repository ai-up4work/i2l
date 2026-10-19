// lib/rate-limit.ts
//
// SERVER-ONLY. Simple per-IP rate limit shared by every server instance.
//
// Uses Redis (WISH_DROP_REDIS_URL, the same one lib/store-providers/http.ts
// uses) so the count survives Vercel starting fresh instances. If Redis
// isn't configured or is unreachable, falls back to an in-memory count —
// weaker, but never blocks real customers because of a Redis outage.

import Redis from 'ioredis'

let client: Redis | null | undefined

/** Shared Redis client (WISH_DROP_REDIS_URL), or null when not configured. Also used by lib/scrape/parsebot.ts. */
export function sharedRedis(): Redis | null {
  return redis()
}

function redis(): Redis | null {
  if (client !== undefined) return client
  const url = process.env.WISH_DROP_REDIS_URL || process.env.REDIS_URL
  if (!url) return (client = null)
  try {
    client = new Redis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      commandTimeout: 1500,
      retryStrategy: (times) => (times > 3 ? null : 500),
    })
    client.on('error', () => {})
  } catch {
    client = null
  }
  return client
}

const memory = new Map<string, { count: number; resetAt: number }>()

function memoryHit(key: string, windowMs: number): number {
  const now = Date.now()
  const entry = memory.get(key)
  if (!entry || entry.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + windowMs })
    if (memory.size > 10_000) {
      for (const [k, v] of memory) if (v.resetAt <= now) memory.delete(k)
    }
    return 1
  }
  entry.count += 1
  return entry.count
}

/** The caller's IP as Vercel reports it. */
export function clientIp(req: Request): string {
  return (
    req.headers.get('x-real-ip')?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  )
}

/**
 * Counts one request for `name` + this caller's IP. Returns true when the
 * caller is over `limit` requests in the last `windowSeconds`.
 */
export async function isRateLimited(
  req: Request,
  name: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const key = `wd:rl:${name}:${clientIp(req)}`
  const r = redis()
  if (r) {
    try {
      const count = await r.incr(key)
      // First hit starts the window; the ttl check also repairs a key
      // whose expire was ever lost, so it can't block someone forever.
      if (count === 1 || (count > limit && (await r.ttl(key)) === -1)) await r.expire(key, windowSeconds)
      if (count > 0) return count > limit
    } catch {
      // fall through to memory
    }
  }
  return memoryHit(key, windowSeconds * 1000) > limit
}
