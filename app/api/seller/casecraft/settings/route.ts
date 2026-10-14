// app/api/seller/casecraft/settings/route.ts
//
// GET -> Case Craft's price list and settings. The margin is included
//        only for staff (staff view).
// PUT { settings?, marginPercent? } -> save. The seller can change the
//        settings; only staff can change the margin.

import { NextRequest, NextResponse } from 'next/server'
import { requireCaseCraftSeller } from '@/lib/store-modules/casecraft/seller-api'
import { CASECRAFT_MIGRATION_HINT, isMissingTable, loadSettings } from '@/lib/store-modules/casecraft/server'
import { DEFAULT_CASECRAFT_SETTINGS, normalizeCaseCraftSettings, normalizeMargin } from '@/lib/store-modules/casecraft/settings'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireCaseCraftSeller()
  if (!auth.ok) return auth.response
  const rec = await loadSettings(auth.seller.id, auth.db)
  const staff = Boolean(auth.seller.staffView)
  return NextResponse.json(
    {
      settings: rec.settings,
      defaults: DEFAULT_CASECRAFT_SETTINGS,
      needsMigration: rec.needsMigration,
      staff,
      margin: staff ? { percent: rec.marginPercent, updatedAt: rec.marginUpdatedAt, updatedBy: rec.marginUpdatedBy } : null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function PUT(req: NextRequest) {
  const auth = await requireCaseCraftSeller()
  if (!auth.ok) return auth.response
  const body = (await req.json().catch(() => null)) as { settings?: unknown; marginPercent?: unknown } | null
  if (!body) return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 })

  const now = new Date().toISOString()
  const update: Record<string, unknown> = { seller_id: auth.seller.id, updated_at: now }
  if (body.settings !== undefined) update.settings = normalizeCaseCraftSettings(body.settings)
  if (body.marginPercent !== undefined) {
    if (!auth.seller.staffView) return NextResponse.json({ error: 'Only Wishdrop staff can change the margin.' }, { status: 403 })
    update.margin_percent = normalizeMargin(body.marginPercent)
    update.margin_updated_at = now
    update.margin_updated_by = auth.seller.staffView.name
  }

  const { error } = await auth.db.from('casecraft_settings').upsert(update, { onConflict: 'seller_id' })
  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ error: CASECRAFT_MIGRATION_HINT }, { status: 503 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const rec = await loadSettings(auth.seller.id, auth.db)
  const staff = Boolean(auth.seller.staffView)
  return NextResponse.json({
    settings: rec.settings,
    staff,
    margin: staff ? { percent: rec.marginPercent, updatedAt: rec.marginUpdatedAt, updatedBy: rec.marginUpdatedBy } : null,
  })
}
