// lib/scrape/universal-settings.ts
//
// SERVER-ONLY. Where the universal scraper's connection settings live.
//
// Source of truth: Redis (WISH_DROP_REDIS_URL), edited by a Super Admin at
// /admin/super-admin/settings/integrations. Falls back to the
// UNIVERSAL_SCRAPER_* environment variables when nothing is saved in Redis, so
// an existing env-based setup keeps working. Redis wins when both exist.
//
// Speed: a lookup reads the settings only when it is about to use the backup,
// and the answer is kept in this process for CACHE_MS, so it is a memory read
// almost every time and a single Redis GET otherwise. Saving clears this
// process's copy at once; other server instances pick the change up within
// CACHE_MS.
//
// The bearer token is encrypted before it goes into Redis (AES-256-GCM, key
// derived from SUPABASE_SERVICE_ROLE_KEY — already a server secret, so no
// extra env var), so a Redis dump or a shared Redis browser doesn't show it.
// If that key is ever rotated the saved token can't be decrypted: it reads as
// "not set" and a Super Admin simply enters it again.
//
// The token is never returned to a browser — see /api/admin/universal-scraper.

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import { sharedRedis } from '@/lib/rate-limit'

export const UNIVERSAL_SETTINGS_KEY = 'wd:settings:universal-scraper'
const CACHE_MS = 15_000

export type UniversalSettings = {
  enabled: boolean
  baseUrl: string
  appId: string
  /** Bearer token. Server-side only. */
  token: string
  /** Origin/Referer the API expects; empty = same as baseUrl. */
  origin: string
  timeoutMs: number
  /** Show a backup result with a price as a normal priced listing. */
  trustPrice: boolean
}

export type UniversalSettingsRecord = {
  settings: UniversalSettings
  source: 'redis' | 'env' | 'none'
  updatedAt: string | null
  updatedBy: string | null
}

export const DEFAULT_TIMEOUT_MS = 15_000
// max 20 s: the lookup route allows 60 s for our own scraper + this, inside its 90 s limit.
export const TIMEOUT_LIMITS = { min: 3_000, max: 20_000 } as const

const EMPTY: UniversalSettings = {
  enabled: true,
  baseUrl: '',
  appId: '',
  token: '',
  origin: '',
  timeoutMs: DEFAULT_TIMEOUT_MS,
  trustPrice: true,
}

export const isComplete = (s: UniversalSettings) => s.enabled && !!(s.baseUrl && s.appId && s.token)

// ── token encryption ──────────────────────────────────────────────────────

function key(): Buffer | null {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) return null
  return Buffer.from(hkdfSync('sha256', secret, 'wishdrop', 'universal-scraper-token', 32))
}

function encrypt(plain: string): string {
  const k = key()
  if (!k) return `plain:${plain}`
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', k, iv)
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return `enc:${iv.toString('base64')}.${c.getAuthTag().toString('base64')}.${enc.toString('base64')}`
}

function decrypt(stored: string): string {
  if (stored.startsWith('plain:')) return stored.slice(6)
  if (!stored.startsWith('enc:')) return ''
  const k = key()
  if (!k) return ''
  try {
    const [iv, tag, data] = stored.slice(4).split('.')
    const d = createDecipheriv('aes-256-gcm', k, Buffer.from(iv, 'base64'))
    d.setAuthTag(Buffer.from(tag, 'base64'))
    return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8')
  } catch {
    return '' // key rotated / value damaged: treat as not set
  }
}

// ── normalising ───────────────────────────────────────────────────────────

const trimSlash = (s: string) => s.trim().replace(/\/+$/, '')

export function normalizeBaseUrl(raw: unknown): string {
  const v = typeof raw === 'string' ? trimSlash(raw) : ''
  if (!v) return ''
  try {
    const u = new URL(v)
    return u.protocol === 'https:' ? u.origin : ''
  } catch {
    return ''
  }
}

export function normalizeTimeout(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TIMEOUT_MS
  return Math.round(Math.min(TIMEOUT_LIMITS.max, Math.max(TIMEOUT_LIMITS.min, n)))
}

function fromEnv(): UniversalSettings {
  return {
    enabled: true,
    baseUrl: normalizeBaseUrl(process.env.UNIVERSAL_SCRAPER_BASE_URL),
    appId: (process.env.UNIVERSAL_SCRAPER_APP_ID ?? '').trim(),
    token: (process.env.UNIVERSAL_SCRAPER_TOKEN ?? '').trim(),
    origin: trimSlash(process.env.UNIVERSAL_SCRAPER_ORIGIN ?? ''),
    timeoutMs: normalizeTimeout(process.env.UNIVERSAL_SCRAPER_TIMEOUT_MS),
    trustPrice: process.env.UNIVERSAL_SCRAPER_TRUST_PRICE !== '0',
  }
}

// ── read ──────────────────────────────────────────────────────────────────

let cached: { at: number; record: UniversalSettingsRecord } | null = null

export function clearUniversalSettingsCache() {
  cached = null
}

type Stored = Partial<Omit<UniversalSettings, 'token'>> & { token?: string; updatedAt?: string; updatedBy?: string }

async function readRedis(): Promise<Stored | null> {
  const r = sharedRedis()
  if (!r) return null
  try {
    const raw = await r.get(UNIVERSAL_SETTINGS_KEY)
    return raw ? (JSON.parse(raw) as Stored) : null
  } catch {
    return null
  }
}

/** The effective settings: Redis, else env, else empty. Cached ~15 s per process. */
export async function loadUniversalSettings(opts: { fresh?: boolean } = {}): Promise<UniversalSettingsRecord> {
  if (!opts.fresh && cached && Date.now() - cached.at < CACHE_MS) return cached.record

  let record: UniversalSettingsRecord
  const stored = await readRedis()
  if (stored) {
    record = {
      settings: {
        enabled: stored.enabled !== false,
        baseUrl: normalizeBaseUrl(stored.baseUrl),
        appId: (stored.appId ?? '').trim(),
        token: stored.token ? decrypt(stored.token) : '',
        origin: trimSlash(stored.origin ?? ''),
        timeoutMs: normalizeTimeout(stored.timeoutMs),
        trustPrice: stored.trustPrice !== false,
      },
      source: 'redis',
      updatedAt: stored.updatedAt ?? null,
      updatedBy: stored.updatedBy ?? null,
    }
  } else {
    const env = fromEnv()
    const any = !!(env.baseUrl || env.appId || env.token)
    record = { settings: any ? env : { ...EMPTY }, source: any ? 'env' : 'none', updatedAt: null, updatedBy: null }
  }

  cached = { at: Date.now(), record }
  return record
}

// ── write ─────────────────────────────────────────────────────────────────

export type SaveInput = {
  enabled: boolean
  baseUrl: string
  appId: string
  /** Blank = keep the token already saved. */
  token?: string
  origin?: string
  timeoutMs?: number
  trustPrice: boolean
}

export const redisAvailable = () => !!sharedRedis()

export async function saveUniversalSettings(input: SaveInput, by: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = sharedRedis()
  if (!r) return { ok: false, error: 'Redis is not connected (WISH_DROP_REDIS_URL), so settings cannot be saved here.' }

  const existing = await readRedis()
  const newToken = (input.token ?? '').trim()
  let tokenEnc = existing?.token ?? ''
  if (newToken) tokenEnc = encrypt(newToken)
  // First save with no token typed: carry the env token over so the switch
  // from env to Redis doesn't silently drop it.
  if (!tokenEnc && process.env.UNIVERSAL_SCRAPER_TOKEN) tokenEnc = encrypt(process.env.UNIVERSAL_SCRAPER_TOKEN.trim())

  const doc: Stored = {
    enabled: !!input.enabled,
    baseUrl: normalizeBaseUrl(input.baseUrl),
    appId: input.appId.trim(),
    token: tokenEnc,
    origin: trimSlash(input.origin ?? ''),
    timeoutMs: normalizeTimeout(input.timeoutMs),
    trustPrice: !!input.trustPrice,
    updatedAt: new Date().toISOString(),
    updatedBy: by,
  }
  try {
    await r.set(UNIVERSAL_SETTINGS_KEY, JSON.stringify(doc))
  } catch {
    return { ok: false, error: 'Could not write to Redis. Please try again.' }
  }
  clearUniversalSettingsCache()
  return { ok: true }
}

/** Removes the Redis copy (the env variables, if any, apply again). */
export async function clearSavedUniversalSettings(): Promise<boolean> {
  const r = sharedRedis()
  if (!r) return false
  try {
    await r.del(UNIVERSAL_SETTINGS_KEY)
  } catch {
    return false
  }
  clearUniversalSettingsCache()
  return true
}
