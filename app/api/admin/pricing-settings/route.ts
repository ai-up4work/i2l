// app/api/admin/pricing-settings/route.ts
//
// GET -> the saved pricing settings, the built-in defaults, who saved last
//        and the recent change history. Any active staff member.
// PUT { settings, note? } -> save new settings. Super Admin only.
//        Validated with normalizePricingSettings (never trusts the client),
//        recorded in pricing_settings_history, and the server-side cache
//        is invalidated so every page prices with the new numbers at once.
//
// See lib/pricing-settings.ts and data/wishdrop-pricing-settings.sql.

import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { requireStaffRole, SUPER_ADMIN_ONLY } from '@/lib/supabase/admin-auth'
import { DEFAULT_PRICING_SETTINGS, normalizePricingSettings } from '@/lib/pricing-settings'
import type { Json } from '@/lib/supabase/types'
import { loadPricingSettingsRecord, PRICING_SETTINGS_TAG } from '@/lib/pricing-settings-server'

export const dynamic = 'force-dynamic'

const MIGRATION_HINT = 'The database needs an update first: run data/wishdrop-pricing-settings.sql in Supabase.'

type HistoryRow = { id: number; changed_at: string; changed_by_name: string | null; note: string | null; settings: unknown; previous: unknown }

export async function GET() {
  const auth = await requireStaffRole()
  if (!auth.ok) return auth.response

  const record = await loadPricingSettingsRecord()
  const { data: history, error } = await auth.admin
    .from('pricing_settings_history')
    .select('id, changed_at, changed_by_name, note, settings, previous')
    .order('changed_at', { ascending: false })
    .limit(15)

  return NextResponse.json(
    {
      settings: record.settings,
      defaults: DEFAULT_PRICING_SETTINGS,
      saved: record.saved,
      updatedAt: record.updatedAt,
      updatedBy: record.updatedBy,
      history: ((history ?? []) as HistoryRow[]).map((h) => ({
        id: h.id,
        changedAt: h.changed_at,
        changedBy: h.changed_by_name,
        note: h.note,
        settings: normalizePricingSettings(h.settings),
        previous: h.previous ? normalizePricingSettings(h.previous) : null,
      })),
      needsMigration: error?.code === '42P01',
      canEdit: auth.role === 'super_admin',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function PUT(req: NextRequest) {
  const auth = await requireStaffRole(SUPER_ADMIN_ONLY)
  if (!auth.ok) return auth.response
  const { admin, staffId } = auth

  const body = (await req.json().catch(() => null)) as { settings?: unknown; note?: unknown } | null
  if (!body?.settings) return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 })

  const settings = normalizePricingSettings(body.settings)
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 300) || null : null

  const { data: staffRow } = await admin.from('staff').select('name, user_id').eq('id', staffId).maybeSingle()
  const staff = (staffRow ?? {}) as { name?: string | null; user_id?: string | null }
  const name = staff.name ?? 'Super Admin'

  const { data: currentRow } = await admin.from('pricing_settings').select('settings').eq('id', 1).maybeSingle()
  const previous = (currentRow as { settings?: unknown } | null)?.settings ?? null

  const now = new Date().toISOString()
  const settingsJson = settings as unknown as Json
  const { error } = await admin
    .from('pricing_settings')
    .upsert({ id: 1, settings: settingsJson, updated_at: now, updated_by: staff.user_id ?? null, updated_by_name: name })
  if (error) {
    if (error.code === '42P01') return NextResponse.json({ error: MIGRATION_HINT }, { status: 500 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await admin.from('pricing_settings_history').insert({
    settings: settingsJson,
    previous: (previous ?? null) as Json | null,
    note,
    changed_at: now,
    changed_by: staff.user_id ?? null,
    changed_by_name: name,
  })

  // Every server-rendered price picks up the new numbers on the next request.
  revalidateTag(PRICING_SETTINGS_TAG, { expire: 0 })

  return NextResponse.json({ settings, updatedAt: now, updatedBy: name })
}
