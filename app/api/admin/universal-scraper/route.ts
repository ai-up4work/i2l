// app/api/admin/universal-scraper/route.ts
//
// Super Admin only. The backup ("universal") scraper's connection settings,
// stored in Redis — see lib/scrape/universal-settings.ts.
//
// GET    -> current settings. The token is NEVER returned: only whether one is
//           set and its last 4 characters.
// PUT    -> save { enabled, baseUrl, appId, token?, origin?, timeoutMs?, trustPrice }.
//           A blank token keeps the one already saved.
// POST   -> { action: 'test', url?, ...settings } one uncached test call with
//           the form's values (a blank token uses the saved one).
// DELETE -> remove the Redis copy (env variables, if any, apply again).

import { NextRequest, NextResponse } from 'next/server'
import { requireStaffRole, SUPER_ADMIN_ONLY } from '@/lib/supabase/admin-auth'
import { logAuditEvent } from '@/lib/audit-event'
import { isPublicHttpUrl } from '@/lib/url-safety'
import {
  clearSavedUniversalSettings,
  isComplete,
  loadUniversalSettings,
  normalizeBaseUrl,
  normalizeTimeout,
  redisAvailable,
  saveUniversalSettings,
  TIMEOUT_LIMITS,
  type UniversalSettings,
} from '@/lib/scrape/universal-settings'
import { testUniversalConnection } from '@/lib/scrape/universal-fallback'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const NO_STORE = { 'Cache-Control': 'no-store' }
const SAMPLE_URL = 'https://www.soch.com/in/mauve-roman-silk-embroidered-kurta-with-sequins-cwa5ku61488b.html'

async function view() {
  const rec = await loadUniversalSettings({ fresh: true })
  const s = rec.settings
  return {
    enabled: s.enabled,
    baseUrl: s.baseUrl,
    appId: s.appId,
    origin: s.origin,
    timeoutMs: s.timeoutMs,
    trustPrice: s.trustPrice,
    tokenSet: !!s.token,
    tokenPreview: s.token ? `••••${s.token.slice(-4)}` : null,
    source: rec.source,
    ready: isComplete(s),
    updatedAt: rec.updatedAt,
    updatedBy: rec.updatedBy,
    redisAvailable: redisAvailable(),
    timeoutLimits: TIMEOUT_LIMITS,
    sampleUrl: SAMPLE_URL,
  }
}

type Body = {
  enabled?: unknown
  baseUrl?: unknown
  appId?: unknown
  token?: unknown
  origin?: unknown
  timeoutMs?: unknown
  trustPrice?: unknown
  url?: unknown
  action?: unknown
}

/** Validates the form. Returns the cleaned input or an error message. */
async function parse(body: Body): Promise<{ ok: true; value: Omit<UniversalSettings, 'token'> & { token: string } } | { ok: false; error: string }> {
  const baseUrl = normalizeBaseUrl(body.baseUrl)
  if (!baseUrl) return { ok: false, error: 'Base URL must be a full https:// address, e.g. https://api.example.com' }
  // Only ever call a public site (Super Admin or not, never an internal address).
  if (!(await isPublicHttpUrl(baseUrl))) return { ok: false, error: 'That base URL is not a public website.' }

  const appId = typeof body.appId === 'string' ? body.appId.trim() : ''
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(appId)) return { ok: false, error: 'App ID looks wrong (letters, numbers, - and _ only).' }

  const token = typeof body.token === 'string' ? body.token.trim() : ''
  if (token && (token.length < 10 || token.length > 4000 || /\s/.test(token))) {
    return { ok: false, error: 'That token does not look right. Paste only the token, without "Bearer".' }
  }

  const origin = typeof body.origin === 'string' ? body.origin.trim().replace(/\/+$/, '') : ''
  if (origin) {
    try {
      if (new URL(origin).protocol !== 'https:') throw new Error()
    } catch {
      return { ok: false, error: 'Origin must be a full https:// address, or left empty.' }
    }
  }

  return {
    ok: true,
    value: {
      enabled: body.enabled !== false,
      baseUrl,
      appId,
      token,
      origin,
      timeoutMs: normalizeTimeout(body.timeoutMs),
      trustPrice: body.trustPrice !== false,
    },
  }
}

export async function GET() {
  const auth = await requireStaffRole(SUPER_ADMIN_ONLY)
  if (!auth.ok) return auth.response
  return NextResponse.json(await view(), { headers: NO_STORE })
}

export async function PUT(req: NextRequest) {
  const auth = await requireStaffRole(SUPER_ADMIN_ONLY)
  if (!auth.ok) return auth.response

  const body = (await req.json().catch(() => null)) as Body | null
  if (!body) return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 })
  const parsed = await parse(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { data: staffRow } = await auth.admin.from('staff').select('name').eq('id', auth.staffId).maybeSingle()
  const by = (staffRow as { name?: string | null } | null)?.name ?? 'Super Admin'

  const saved = await saveUniversalSettings(parsed.value, by)
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 503 })

  // Never put the token in the audit log — only that it changed.
  void logAuditEvent({
    entity: 'universal_scraper_settings',
    label: 'Universal scraper',
    summary: `${by} updated the universal scraper settings${parsed.value.token ? ' (token replaced)' : ''}`,
    severity: 'warning',
    detail: { enabled: parsed.value.enabled, baseUrl: parsed.value.baseUrl, appId: parsed.value.appId, tokenReplaced: !!parsed.value.token, trustPrice: parsed.value.trustPrice },
    route: '/admin/super-admin/settings/integrations',
  })

  return NextResponse.json(await view(), { headers: NO_STORE })
}

export async function POST(req: NextRequest) {
  const auth = await requireStaffRole(SUPER_ADMIN_ONLY)
  if (!auth.ok) return auth.response

  const body = (await req.json().catch(() => null)) as Body | null
  if (!body || body.action !== 'test') return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })

  const parsed = await parse(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  // Blank token in the form = test with the saved one.
  const cfg = { ...parsed.value }
  if (!cfg.token) cfg.token = (await loadUniversalSettings({ fresh: true })).settings.token
  if (!cfg.token) return NextResponse.json({ error: 'Enter a token first — none is saved yet.' }, { status: 400 })

  const testUrl = typeof body.url === 'string' && body.url.trim() ? body.url.trim() : SAMPLE_URL
  if (!(await isPublicHttpUrl(testUrl))) return NextResponse.json({ error: 'That test link is not a public website.' }, { status: 400 })

  const started = Date.now()
  const r = await testUniversalConnection(cfg, testUrl)
  const ms = Date.now() - started

  if (r.error) return NextResponse.json({ ok: false, error: r.error, ms }, { headers: NO_STORE })
  return NextResponse.json(
    {
      ok: true,
      ms,
      title: r.title ?? null,
      brand: r.brand ?? null,
      price: r.price ?? null,
      mrp: r.mrp ?? null,
      currency: r.currencyCode ?? null,
      image: r.images?.[0] ?? null,
      sizes: r.variants?.find((v) => v.dimension === 'Size')?.options.map((o) => o.label) ?? [],
      colors: r.variants?.find((v) => v.dimension === 'Color')?.options.map((o) => o.label) ?? [],
    },
    { headers: NO_STORE },
  )
}

export async function DELETE() {
  const auth = await requireStaffRole(SUPER_ADMIN_ONLY)
  if (!auth.ok) return auth.response
  const ok = await clearSavedUniversalSettings()
  if (!ok) return NextResponse.json({ error: 'Redis is not connected, nothing to clear.' }, { status: 503 })
  void logAuditEvent({
    entity: 'universal_scraper_settings',
    label: 'Universal scraper',
    summary: 'Saved universal scraper settings were cleared',
    severity: 'warning',
    route: '/admin/super-admin/settings/integrations',
  })
  return NextResponse.json(await view(), { headers: NO_STORE })
}
