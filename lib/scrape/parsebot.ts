// lib/scrape/parsebot.ts
//
// SERVER-ONLY. One Parse.bot client for every store that uses it (Ajio now;
// Flipkart, Myntra and Nykaa once their scrapers are added), with several
// API keys and automatic rotation.
//
// KEYS — set any of these on Vercel (all are combined, duplicates ignored):
//   PARSE_API_KEYS   comma- or newline-separated list: "key1,key2,key3"
//   PARSE_API_KEY, PARSE_API_KEY2, PARSE_API_KEY3 … PARSE_API_KEY20
//   PARSE_API_KEY_1 … PARSE_API_KEY_20
//
// ROTATION — each call starts at the next key in turn (spreads usage), and
// moves on to the next key when one can't serve the call:
//   401 / 403 (bad or disabled key)            → key rests 6 hours
//   402, or a reply that mentions credits/quota → key rests 1 hour
//   429 (rate limited)                          → key rests for Retry-After (default 60s)
//   5xx, timeout, network error                 → key rests 30s, try the next key
//   400 / 404 / 422 or status ≠ "success"       → a problem with THIS product,
//                                                  not the key: stop, no rotation
// Resting keys are skipped. The rest is shared across every server through
// Redis (WISH_DROP_REDIS_URL) when it's set, and kept in memory otherwise.
// If every key is resting, the least-recently-rested key is still tried once
// rather than failing outright.
//
// Keys are never logged; they're referred to as "#1", "#2"… in their order
// above.

import { createHash } from 'node:crypto'
import { sharedRedis } from '@/lib/rate-limit'

const ATTEMPT_TIMEOUT_MS = Number(process.env.PARSE_API_TIMEOUT_MS) || 25_000
// Only for local testing against a fake server; leave unset in production.
const BASE_URL = (process.env.PARSE_API_BASE_URL || 'https://api.parse.bot').replace(/\/+$/, '')

const COOLDOWN_MS = {
  invalid: 6 * 60 * 60 * 1000,
  credits: 60 * 60 * 1000,
  rateLimit: 60 * 1000,
  transient: 30 * 1000,
} as const

export function parseBotKeys(env: NodeJS.ProcessEnv = process.env): string[] {
  const out: string[] = []
  const add = (v: string | undefined) => {
    for (const part of (v ?? '').split(/[\s,]+/)) {
      const k = part.trim()
      if (k && !out.includes(k)) out.push(k)
    }
  }
  add(env.PARSE_API_KEYS)
  add(env.PARSE_API_KEY)
  for (let i = 1; i <= 20; i++) {
    add(env[`PARSE_API_KEY${i}`])
    add(env[`PARSE_API_KEY_${i}`])
  }
  return out
}

export function parseBotConfigured(): boolean {
  return parseBotKeys().length > 0
}

// ── Resting keys ────────────────────────────────────────────────────────────

const memoryRest = new Map<string, number>() // key id → resting until (ms)
let cursor = 0

function keyId(key: string): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 16)
}

async function restingUntil(id: string): Promise<number> {
  const local = memoryRest.get(id) ?? 0
  const r = sharedRedis()
  if (!r) return local
  try {
    const v = await r.get(`wd:parsebot:rest:${id}`)
    return Math.max(local, Number(v) || 0)
  } catch {
    return local
  }
}

async function rest(id: string, ms: number): Promise<void> {
  const until = Date.now() + ms
  memoryRest.set(id, Math.max(memoryRest.get(id) ?? 0, until))
  const r = sharedRedis()
  if (!r) return
  try {
    await r.set(`wd:parsebot:rest:${id}`, String(until), 'PX', ms)
  } catch {
    // memory still has it
  }
}

// ── Classifying a reply ─────────────────────────────────────────────────────

type Verdict =
  | { kind: 'ok'; json: unknown }
  | { kind: 'rotate'; restMs: number; reason: string }
  | { kind: 'stop'; reason: string }

const CREDIT_WORDS = /\b(credit|credits|quota|insufficient|exceeded|limit reached|usage limit|billing|payment required|subscription)\b/i

async function classify(res: Response): Promise<Verdict> {
  const text = await res.text().catch(() => '')
  const snippet = text.replace(/\s+/g, ' ').slice(0, 200)

  if (res.ok) {
    let json: any
    try {
      json = JSON.parse(text)
    } catch {
      return { kind: 'rotate', restMs: COOLDOWN_MS.transient, reason: 'reply was not JSON' }
    }
    if (json?.status && json.status !== 'success') {
      const msg = JSON.stringify(json).slice(0, 300)
      if (CREDIT_WORDS.test(msg)) return { kind: 'rotate', restMs: COOLDOWN_MS.credits, reason: `out of credit (${json.status})` }
      return { kind: 'stop', reason: `Parse.bot reported status "${json.status}"` }
    }
    return { kind: 'ok', json }
  }

  if (res.status === 401 || res.status === 403) {
    if (CREDIT_WORDS.test(text)) return { kind: 'rotate', restMs: COOLDOWN_MS.credits, reason: `HTTP ${res.status}, out of credit` }
    return { kind: 'rotate', restMs: COOLDOWN_MS.invalid, reason: `HTTP ${res.status}, key rejected` }
  }
  if (res.status === 402) return { kind: 'rotate', restMs: COOLDOWN_MS.credits, reason: 'HTTP 402, out of credit' }
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('retry-after'))
    const ms = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, COOLDOWN_MS.credits) : COOLDOWN_MS.rateLimit
    if (CREDIT_WORDS.test(text) && !/rate/i.test(text)) return { kind: 'rotate', restMs: COOLDOWN_MS.credits, reason: 'HTTP 429, out of credit' }
    return { kind: 'rotate', restMs: ms, reason: 'HTTP 429, rate limited' }
  }
  if (res.status >= 500) return { kind: 'rotate', restMs: COOLDOWN_MS.transient, reason: `HTTP ${res.status}` }
  if (CREDIT_WORDS.test(text)) return { kind: 'rotate', restMs: COOLDOWN_MS.credits, reason: `HTTP ${res.status}, out of credit` }
  return { kind: 'stop', reason: `HTTP ${res.status}${snippet ? `: ${snippet}` : ''}` }
}

// ── The call ────────────────────────────────────────────────────────────────

export type ParseBotResult<T = any> = {
  data: T | null
  error: string | null
  /** e.g. ["#2: HTTP 402, out of credit", "#3: ok"] — for logs / scrape health. */
  attempts: string[]
}

/**
 * GET https://api.parse.bot/scraper/<scraperId>/<endpoint>?<params>
 * with key rotation (see the top of this file).
 */
export async function callParseBot<T = any>(
  scraperId: string,
  endpoint: string,
  params: Record<string, string>,
  opts: { snapshotVersion?: string; signal?: AbortSignal } = {},
): Promise<ParseBotResult<T>> {
  const keys = parseBotKeys()
  if (!keys.length) return { data: null, error: 'No Parse.bot key is set (PARSE_API_KEY / PARSE_API_KEYS).', attempts: [] }

  const url = `${BASE_URL}/scraper/${encodeURIComponent(scraperId)}/${encodeURIComponent(endpoint)}?${new URLSearchParams(params)}`

  // Order to try: starting at the round-robin cursor, awake keys first,
  // then resting keys (soonest-awake first) as a last chance.
  const start = cursor++ % keys.length
  const ordered = keys.map((_, i) => (start + i) % keys.length)
  const now = Date.now()
  const restInfo = await Promise.all(ordered.map(async (i) => ({ i, until: await restingUntil(keyId(keys[i])) })))
  const awake = restInfo.filter((k) => k.until <= now).map((k) => k.i)
  const asleep = restInfo.filter((k) => k.until > now).sort((a, b) => a.until - b.until).map((k) => k.i)
  const plan = awake.length ? awake : asleep.slice(0, 1)

  const attempts: string[] = []
  let lastReason = 'Parse.bot request failed'

  for (const i of plan) {
    if (opts.signal?.aborted) return { data: null, error: 'Client disconnected', attempts }
    const label = `#${i + 1}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS)
    const onAbort = () => controller.abort()
    opts.signal?.addEventListener('abort', onAbort, { once: true })
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'X-API-Key': keys[i],
          ...(opts.snapshotVersion ? { 'API-Snapshot-Version': opts.snapshotVersion } : {}),
        },
        signal: controller.signal,
        cache: 'no-store',
      })
      const verdict = await classify(res)
      if (verdict.kind === 'ok') {
        attempts.push(`${label}: ok`)
        return { data: verdict.json as T, error: null, attempts }
      }
      if (verdict.kind === 'stop') {
        attempts.push(`${label}: ${verdict.reason}`)
        return { data: null, error: verdict.reason, attempts }
      }
      attempts.push(`${label}: ${verdict.reason} — resting ${Math.round(verdict.restMs / 1000)}s`)
      lastReason = verdict.reason
      await rest(keyId(keys[i]), verdict.restMs)
    } catch (e) {
      if (opts.signal?.aborted) return { data: null, error: 'Client disconnected', attempts }
      const reason = controller.signal.aborted ? `timed out after ${ATTEMPT_TIMEOUT_MS / 1000}s` : e instanceof Error ? e.message : String(e)
      attempts.push(`${label}: ${reason} — resting ${COOLDOWN_MS.transient / 1000}s`)
      lastReason = reason
      await rest(keyId(keys[i]), COOLDOWN_MS.transient)
    } finally {
      clearTimeout(timer)
      opts.signal?.removeEventListener('abort', onAbort)
    }
  }

  const resting = awake.length ? '' : ' (every key is resting — tried the one that wakes soonest)'
  return { data: null, error: `Parse.bot: ${lastReason}${resting}. Tried ${attempts.length} of ${keys.length} key(s).`, attempts }
}
