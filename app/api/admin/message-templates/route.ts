// app/api/admin/message-templates/route.ts
//
// GET  -> the saved wording (overrides only; defaults ship with the app).
//         Any active staff member — every admin page needs it to draft messages.
// PUT  { key, body } -> save wording for one template. Super Admin only.
//      { key, body: null } -> reset that template to the built-in wording.
//
// Validated here (never trust the browser): known key, 1–1500 characters,
// only the {placeholders} that template offers. Saving invalidates the server
// cache; open admin tabs pick the change up on their next load (and the tab
// that saved updates at once).
//
// See lib/chat/messageTemplateDefs.ts and data/wishdrop-message-templates.sql.

import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { logAuditEvent } from '@/lib/audit-event'
import { requireStaffRole, SUPER_ADMIN_ONLY } from '@/lib/supabase/admin-auth'
import { MAX_TEMPLATE_LENGTH, TEMPLATE_BY_KEY, unknownPlaceholders, type TemplateKey } from '@/lib/chat/messageTemplateDefs'
import { loadTemplateRecord, MESSAGE_TEMPLATES_TAG } from '@/lib/chat/messageTemplates-server'

export const dynamic = 'force-dynamic'

const MIGRATION_HINT = 'The database needs an update first: run data/wishdrop-message-templates.sql in Supabase.'

export async function GET() {
  const auth = await requireStaffRole()
  if (!auth.ok) return auth.response
  const rec = await loadTemplateRecord()
  return NextResponse.json(
    { overrides: rec.overrides, updatedAt: rec.updatedAt, updatedBy: rec.updatedBy, needsMigration: rec.needsMigration, canEdit: auth.role === 'super_admin' },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function PUT(req: NextRequest) {
  const auth = await requireStaffRole(SUPER_ADMIN_ONLY)
  if (!auth.ok) return auth.response
  const { admin, staffId } = auth

  const input = (await req.json().catch(() => null)) as { key?: unknown; body?: unknown } | null
  const key = typeof input?.key === 'string' ? input.key : ''
  if (!(key in TEMPLATE_BY_KEY)) return NextResponse.json({ error: 'Unknown template.' }, { status: 400 })
  const def = TEMPLATE_BY_KEY[key as TemplateKey]

  // The table isn't in the generated Supabase types yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const table = (admin as any).from('message_templates')

  if (input?.body === null) {
    const { error } = await table.delete().eq('key', key)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    revalidateTag(MESSAGE_TEMPLATES_TAG, { expire: 0 })
    await logAuditEvent({ entity: 'message template', label: def.label, summary: `Reset "${def.label}" message template to the default wording`, severity: 'info' })
    return NextResponse.json({ key, body: null })
  }

  if (typeof input?.body !== 'string') return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 })
  const body = input.body.replace(/\r\n/g, '\n').trim()
  if (!body) return NextResponse.json({ error: 'A message can’t be empty. Use “Reset to default” to go back to the built-in wording.' }, { status: 400 })
  if (body.length > MAX_TEMPLATE_LENGTH) return NextResponse.json({ error: `Keep it under ${MAX_TEMPLATE_LENGTH} characters.` }, { status: 400 })
  const unknown = unknownPlaceholders(def.key, body)
  if (unknown.length) {
    return NextResponse.json({ error: `This message doesn't have ${unknown.map((u) => `{${u}}`).join(', ')}. Use only: ${def.placeholders.map((p) => `{${p.name}}`).join(', ')}.` }, { status: 400 })
  }

  const { data: staffRow } = await admin.from('staff').select('name, user_id').eq('id', staffId).maybeSingle()
  const staff = (staffRow ?? {}) as { name?: string | null; user_id?: string | null }
  const now = new Date().toISOString()
  const { error } = await table.upsert({ key, body, updated_at: now, updated_by: staff.user_id ?? null, updated_by_name: staff.name ?? 'Super Admin' })
  if (error) {
    const missing = error.code === '42P01' || error.code === 'PGRST205' || /schema cache|does not exist/i.test(error.message ?? '')
    return NextResponse.json({ error: missing ? MIGRATION_HINT : error.message }, { status: 500 })
  }
  revalidateTag(MESSAGE_TEMPLATES_TAG, { expire: 0 })
  await logAuditEvent({ entity: 'message template', label: def.label, summary: `Edited the "${def.label}" message template`, severity: 'info', detail: { key, body } })
  return NextResponse.json({ key, body, updatedAt: now, updatedBy: staff.name ?? 'Super Admin' })
}
