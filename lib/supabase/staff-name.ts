// lib/supabase/staff-name.ts — SERVER-ONLY. A staff member's display name,
// for "created by" / "given by" columns.
import 'server-only'
import type { createServiceRoleClient } from '@/lib/supabase/server'

export async function staffName(admin: ReturnType<typeof createServiceRoleClient>, staffId: string): Promise<string | null> {
  const { data } = await admin.from('staff_accounts').select('name, email').eq('id', staffId).maybeSingle()
  const row = data as { name?: string | null; email?: string | null } | null
  return row?.name || row?.email || null
}
