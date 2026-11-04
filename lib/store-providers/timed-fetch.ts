// lib/store-providers/timed-fetch.ts
//
// `fetch` with a time limit, for store providers that call stores directly
// (shopify.ts, shopify-plus.ts, jsonapi.ts). Imported as `fetch` so every
// call in those files gets it.
//
// FIX: these requests had no time limit. A store that accepted the
// connection and never answered (row.gymshark.com's /products/<x>.js did
// exactly this) held a pasted-link lookup open until Vercel killed it at
// 300 s. Routing is unchanged — unlike storeFetch (http.ts) this adds no
// relay, retries or Firecrawl, only the limit.

const TIMEOUT_MS = Number(process.env.STORE_FETCH_TIMEOUT_MS) || 15_000

export function timedFetch(input: string | URL | Request, init: RequestInit & { next?: unknown } = {}): Promise<Response> {
  const limit = AbortSignal.timeout(TIMEOUT_MS)
  return fetch(input, { ...init, signal: init.signal ? AbortSignal.any([init.signal, limit]) : limit } as RequestInit)
}
