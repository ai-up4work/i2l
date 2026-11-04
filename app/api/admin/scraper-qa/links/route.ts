// app/api/admin/scraper-qa/links/route.ts
//
// Saved links for the scraper QA page (Super Admin) — table
// scraper_qa_links (data/wishdrop-scraper-qa-links.sql).
//
// GET                                         -> { links, needsMigration }
// POST   { url, label?, note? }               -> { link }   (saves; same URL updates)
// PATCH  { id, status?, label?, note?, run? } -> { link }   (run = last run summary)
// DELETE ?id=…                                -> { ok }

import { NextResponse } from 'next/server'
import { requireStaffRole, SUPER_ADMIN_ONLY } from '@/lib/supabase/admin-auth'
import { isPublicHttpUrl } from '@/lib/url-safety'

export const runtime = 'nodejs'

type Db = { from: (t: string) => any }
const TABLE = 'scraper_qa_links'
const OUTCOMES = ['product', 'needs_check', 'unreadable', 'redirect'] as const
const STATUSES = ['untested', 'pass', 'fail'] as const

const missingTable = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || /scraper_qa_links/.test(e.message ?? ''))

const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

function runFields(run: unknown): Record<string, unknown> | null {
  if (!run || typeof run !== 'object') return null
  const r = run as Record<string, unknown>
  const outcome = OUTCOMES.includes(r.outcome as (typeof OUTCOMES)[number]) ? r.outcome : null
  const ms = Number(r.ms)
  return {
    last_outcome: outcome,
    last_ms: Number.isFinite(ms) && ms >= 0 ? Math.min(Math.round(ms), 3_600_000) : null,
    last_site: text(r.site, 60),
    last_title: text(r.title, 300),
    last_price: text(r.price, 60),
    last_error: text(r.error, 500),
    last_fresh: r.fresh === true,
    last_run_at: new Date().toISOString(),
  }
}

export async function GET() {
  const auth = await requireStaffRole(SUPER_ADMIN_ONLY)
  if (!auth.ok) return auth.response
  const { data, error } = await (auth.admin as unknown as Db).from(TABLE).select('*').order('updated_at', { ascending: false }).limit(500)
  if (missingTable(error)) return NextResponse.json({ links: [], needsMigration: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ links: data ?? [], needsMigration: false })
}

export async function POST(req: Request) {
  const auth = await requireStaffRole(SUPER_ADMIN_ONLY)
  if (!auth.ok) return auth.response
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const url = text(body.url, 2000)
  if (!url || !/^https?:\/\//i.test(url) || !(await isPublicHttpUrl(url))) {
    return NextResponse.json({ error: 'Enter a full product link (https://…).' }, { status: 400 })
  }
  const row: Record<string, unknown> = { url, updated_at: new Date().toISOString(), created_by: auth.staffId }
  if (body.label !== undefined) row.label = text(body.label, 120)
  if (body.note !== undefined) row.note = text(body.note, 1000)
  const run = runFields(body.run)
  if (run) Object.assign(row, run)
  const { data, error } = await (auth.admin as unknown as Db).from(TABLE).upsert(row, { onConflict: 'url' }).select('*').single()
  if (missingTable(error)) return NextResponse.json({ needsMigration: true }, { status: 409 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ link: data })
}

export async function PATCH(req: Request) {
  const auth = await requireStaffRole(SUPER_ADMIN_ONLY)
  if (!auth.ok) return auth.response
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const id = text(body.id, 64)
  if (!id) return NextResponse.json({ error: 'Missing id.' }, { status: 400 })
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status as (typeof STATUSES)[number])) return NextResponse.json({ error: 'Bad status.' }, { status: 400 })
    patch.status = body.status
  }
  if (body.label !== undefined) patch.label = text(body.label, 120)
  if (body.note !== undefined) patch.note = text(body.note, 1000)
  const run = runFields(body.run)
  if (run) Object.assign(patch, run)
  const { data, error } = await (auth.admin as unknown as Db).from(TABLE).update(patch).eq('id', id).select('*').maybeSingle()
  if (missingTable(error)) return NextResponse.json({ needsMigration: true }, { status: 409 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  return NextResponse.json({ link: data })
}

export async function DELETE(req: Request) {
  const auth = await requireStaffRole(SUPER_ADMIN_ONLY)
  if (!auth.ok) return auth.response
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id.' }, { status: 400 })
  const { error } = await (auth.admin as unknown as Db).from(TABLE).delete().eq('id', id)
  if (missingTable(error)) return NextResponse.json({ needsMigration: true }, { status: 409 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
