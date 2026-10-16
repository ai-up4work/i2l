// app/api/admin/audit/route.ts
//
// Super Admin only. Reads the audit log (data/wishdrop-audit-log.sql) —
// every important change, who made it and what it changed.
//
// GET ?q=&actor=&role=&entity=&action=&severity=&from=&to=&ref=&before=&limit=
//   q        free text — summary / order or request number / name
//   actor    a staff member's user id ('system' for System, 'customer' for any customer)
//   role     staff role (super_admin, manager, sales, warehouse) / customer / system
//   entity   order, request, coupon, staff, store, refund, payment, … (comma-separated for several)
//   action   created | updated | deleted
//   severity info | warning | critical  (or 'important' = warning + critical)
//   from,to  dates (YYYY-MM-DD, Sri Lanka time)
//   ref      exact order / request number or record id (e.g. WD-1000051)
//   before   paging: last id from the previous page
//   format=csv  download the matching rows (up to 5,000)
// Also returns the staff list (for the "Person" filter) and the entity types seen.

import { NextResponse } from 'next/server'
import { requireStaffRole, SUPER_ADMIN_ONLY } from '@/lib/supabase/admin-auth'

export const runtime = 'nodejs'

type Row = {
  id: number
  at: string
  actor_user_id: string | null
  actor_staff_id: string | null
  actor_name: string | null
  actor_role: string | null
  action: string
  entity_type: string
  entity_id: string | null
  entity_label: string | null
  severity: 'info' | 'warning' | 'critical'
  summary: string
  changes: Record<string, [unknown, unknown]> | null
  snapshot: Record<string, unknown> | null
  route: string | null
}

const SL_OFFSET = '+05:30'

function csvCell(v: unknown): string {
  const s = v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET(req: Request) {
  const auth = await requireStaffRole(SUPER_ADMIN_ONLY)
  if (!auth.ok) return auth.response
  // The audit table isn't in the generated types — use an untyped handle.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = auth.admin as any

  const p = new URL(req.url).searchParams
  const csv = p.get('format') === 'csv'
  const limit = csv ? 5000 : Math.min(200, Math.max(10, Number(p.get('limit')) || 50))

  let query = admin.from('audit_log').select('*').order('id', { ascending: false }).limit(limit)

  const before = Number(p.get('before'))
  if (!csv && Number.isFinite(before) && before > 0) query = query.lt('id', before)

  const actor = p.get('actor')
  if (actor === 'system') query = query.is('actor_user_id', null)
  else if (actor && /^[0-9a-f-]{36}$/i.test(actor)) query = query.eq('actor_user_id', actor)

  const role = p.get('role')
  if (role) query = query.eq('actor_role', role)

  const entity = p.get('entity')
  if (entity) {
    const list = entity.split(',').map((e) => e.trim()).filter(Boolean).slice(0, 10)
    query = list.length > 1 ? query.in('entity_type', list) : query.eq('entity_type', list[0])
  }

  const action = p.get('action')
  if (action === 'created' || action === 'updated' || action === 'deleted') query = query.eq('action', action)

  const severity = p.get('severity')
  if (severity === 'important') query = query.in('severity', ['warning', 'critical'])
  else if (severity === 'info' || severity === 'warning' || severity === 'critical') query = query.eq('severity', severity)

  const from = p.get('from')
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) query = query.gte('at', `${from}T00:00:00${SL_OFFSET}`)
  const to = p.get('to')
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) query = query.lte('at', `${to}T23:59:59.999${SL_OFFSET}`)

  const ref = p.get('ref')?.trim()
  if (ref) {
    const safe = ref.replace(/[,()]/g, '')
    query = query.or(`entity_label.ilike.${safe},entity_id.eq.${/^[0-9a-f-]{36}$/i.test(safe) ? safe : '00000000-0000-0000-0000-000000000000'}`)
  }

  const q = p.get('q')?.trim()
  if (q) {
    const safe = q.replace(/[,()%*]/g, ' ').slice(0, 80)
    query = query.or(`summary.ilike.%${safe}%,entity_label.ilike.%${safe}%,actor_name.ilike.%${safe}%`)
  }

  const { data, error } = await query
  if (error) {
    const missing = /audit_log/.test(error.message) && /does not exist|schema cache/i.test(error.message)
    return NextResponse.json(
      { error: missing ? 'Run data/wishdrop-audit-log.sql in Supabase to turn on the audit log.' : error.message },
      { status: missing ? 503 : 500 },
    )
  }
  const rows = (data ?? []) as Row[]

  if (csv) {
    const header = ['time', 'person', 'role', 'action', 'area', 'record', 'severity', 'summary', 'page', 'changes']
    const lines = [header.join(',')].concat(
      rows.map((r) =>
        [r.at, r.actor_name, r.actor_role, r.action, r.entity_type, r.entity_label ?? r.entity_id, r.severity, r.summary, r.route, r.changes ?? r.snapshot]
          .map(csvCell)
          .join(','),
      ),
    )
    return new NextResponse(lines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="wishdrop-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  // Filter options: staff list + areas seen. Cheap; only on the first page.
  let staff: { userId: string; name: string; role: string | null }[] = []
  let entities: string[] = []
  if (!before) {
    const [{ data: s }, { data: e }] = await Promise.all([
      admin.from('staff_accounts').select('user_id, name, role').not('user_id', 'is', null).order('name'),
      admin.from('audit_log').select('entity_type').order('id', { ascending: false }).limit(2000),
    ])
    staff = ((s ?? []) as { user_id: string; name: string; role: string | null }[]).map((x) => ({ userId: x.user_id, name: x.name, role: x.role }))
    entities = Array.from(new Set(((e ?? []) as { entity_type: string }[]).map((x) => x.entity_type))).sort()
  }

  return NextResponse.json(
    { rows, nextBefore: rows.length === limit ? rows[rows.length - 1].id : null, staff, entities },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
