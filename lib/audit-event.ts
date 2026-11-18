// lib/audit-event.ts
//
// Records an action that isn't a plain row change (a sign-in, a broadcast,
// an export, a preview…) in the audit log. Row changes — create, edit,
// delete — are recorded by the database itself (data/wishdrop-audit-log.sql
// and data/wishdrop-audit-log-everything.sql), so most things need nothing.
// Never throws: recording must not block the real action.

import { createServiceRoleClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'

export async function logAuditEvent(e: {
  entity: string
  label?: string
  summary: string
  severity?: 'info' | 'warning' | 'critical'
  detail?: Record<string, unknown>
  route?: string
}): Promise<void> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createServiceRoleClient() as any
    await admin.rpc('audit_event', {
      p_actor_user: user?.id ?? null,
      p_entity: e.entity,
      p_label: e.label ?? null,
      p_summary: e.summary,
      p_severity: e.severity ?? 'info',
      p_detail: e.detail ?? null,
      p_route: e.route ?? null,
    })
  } catch {
    /* ignore */
  }
}
