// app/api/admin/orders/[orderId]/price-check/route.ts
//
// Staff (Sales, Manager, Super Admin): check and correct an order's prices
// — mainly pasted links priced at an estimated weight. See
// lib/orders/price-check.ts.
//
// GET                                             -> { check }
// POST { action: 'preview', changes }             -> { preview }
// POST { action: 'apply', changes, note? }        -> { check, totalLKR, previousTotalLKR, notified }
//   (the customer is always told the final total)
//   changes: [{ itemId, weightKg?, unitPriceLKR? }]

import { NextResponse } from 'next/server'
import { requireStaffRole, SOURCING_ROLES } from '@/lib/supabase/admin-auth'
import { staffName } from '@/lib/supabase/staff-name'
import { applyPriceCheck, getPriceCheck, previewPriceCheck, type PriceChange } from '@/lib/orders/price-check'

export const runtime = 'nodejs'

function parseChanges(raw: unknown): PriceChange[] | null {
  if (raw == null) return []
  if (!Array.isArray(raw) || raw.length > 100) return null
  const out: PriceChange[] = []
  for (const r of raw as Record<string, unknown>[]) {
    if (typeof r?.itemId !== 'string' || !r.itemId) return null
    const weightKg = r.weightKg == null || r.weightKg === '' ? null : Number(r.weightKg)
    const unitPriceLKR = r.unitPriceLKR == null || r.unitPriceLKR === '' ? null : Number(r.unitPriceLKR)
    if ((weightKg != null && !Number.isFinite(weightKg)) || (unitPriceLKR != null && !Number.isFinite(unitPriceLKR))) return null
    if (weightKg == null && unitPriceLKR == null) continue
    out.push({ itemId: r.itemId, weightKg, unitPriceLKR })
  }
  return out
}

export async function GET(_req: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const auth = await requireStaffRole(SOURCING_ROLES)
  if (!auth.ok) return auth.response
  const { orderId } = await params
  const check = await getPriceCheck(orderId)
  if (!check) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  return NextResponse.json({ check })
}

export async function POST(req: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const auth = await requireStaffRole(SOURCING_ROLES)
  if (!auth.ok) return auth.response
  const { orderId } = await params
  const body = (await req.json().catch(() => ({}))) as { action?: string; changes?: unknown; note?: string }
  const changes = parseChanges(body.changes)
  if (!changes) return NextResponse.json({ error: 'Those changes don’t look right.' }, { status: 400 })

  if (body.action === 'preview') {
    const preview = await previewPriceCheck(orderId, changes)
    if ('error' in preview) return NextResponse.json({ error: preview.error }, { status: 400 })
    return NextResponse.json({ preview })
  }
  if (body.action === 'apply') {
    const r = await applyPriceCheck(
      orderId,
      { id: auth.staffId, name: await staffName(auth.admin, auth.staffId) },
      { changes, note: typeof body.note === 'string' ? body.note : null },
    )
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status ?? 400 })
    return NextResponse.json(r)
  }
  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}
