// app/api/admin/chat/threads/[threadId]/route.ts
//
// DELETE — permanently removes a whole conversation and every message in it.
//
// Manager and Super Admin only (the same roles that may hard-delete orders).
// The database records every message as it goes (snapshot of each one, severity
// "critical" — data/wishdrop-audit-log-everything.sql), and this route adds one
// summary entry saying who deleted whose chat and how many messages it held, so
// a mistaken delete is traceable and the text can be restored by hand.
// Attachment files are left to the existing weekly orphan clean-up.

import { NextRequest, NextResponse } from 'next/server'
import { logAuditEvent } from '@/lib/audit-event'
import { DELETE_ROLES, requireStaffRole } from '@/lib/supabase/admin-auth'

export const runtime = 'nodejs'

type Params = { params: Promise<{ threadId: string }> }

export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requireStaffRole(DELETE_ROLES)
  if (!auth.ok) return auth.response
  const { admin } = auth
  const { threadId } = await params

  const { data: thread } = await admin.from('chat_threads').select('id, user_id').eq('id', threadId).maybeSingle()
  if (!thread) return NextResponse.json({ error: 'This conversation no longer exists.' }, { status: 404 })

  const [{ data: profile }, { count }] = await Promise.all([
    admin.from('profiles').select('full_name, email, chat_handle').eq('id', thread.user_id).maybeSingle(),
    admin.from('chat_messages').select('id', { count: 'exact', head: true }).eq('thread_id', threadId),
  ])
  const who = profile?.full_name || profile?.email || (profile?.chat_handle ? `@${profile.chat_handle}` : 'a customer')

  // chat_messages go with the thread (on delete cascade).
  const { error } = await admin.from('chat_threads').delete().eq('id', threadId)
  if (error) {
    return NextResponse.json({ error: `Could not delete this conversation: ${error.message}` }, { status: 500 })
  }

  await logAuditEvent({
    entity: 'chat thread',
    label: who,
    summary: `Whole chat with ${who} deleted (${count ?? 0} messages)`,
    severity: 'critical',
    detail: { threadId, customerId: thread.user_id, messages: count ?? 0 },
    route: '/admin/chat',
  })

  return NextResponse.json({ ok: true, deletedMessages: count ?? 0 })
}
