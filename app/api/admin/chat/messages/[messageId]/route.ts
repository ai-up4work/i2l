// app/api/admin/chat/messages/[messageId]/route.ts
//
// DELETE — removes one chat message ("delete for everyone": the customer's
// copy disappears too, it is the same row).
//
//   - Staff messages: Manager, Sales and Super Admin.
//   - Customer messages: Manager and Super Admin only.
//
// The database keeps a full snapshot of the deleted message in the audit log
// (data/wishdrop-audit-log-everything.sql), so it can be restored by hand.

import { NextRequest, NextResponse } from 'next/server'
import { DELETE_ROLES, requireStaffRole } from '@/lib/supabase/admin-auth'

export const runtime = 'nodejs'

const INBOX_ROLES = ['manager', 'sales', 'super_admin'] as const

type Params = { params: Promise<{ messageId: string }> }

export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requireStaffRole(INBOX_ROLES)
  if (!auth.ok) return auth.response
  const { admin, role } = auth
  const { messageId } = await params

  const { data: message } = await admin.from('chat_messages').select('id, sender').eq('id', messageId).maybeSingle()
  if (!message) return NextResponse.json({ ok: true, alreadyGone: true })

  if (message.sender !== 'ops' && !(DELETE_ROLES as readonly string[]).includes(role)) {
    return NextResponse.json({ error: 'Only a Manager or Super Admin can delete a customer’s message.' }, { status: 403 })
  }

  const { error } = await admin.from('chat_messages').delete().eq('id', messageId)
  if (error) return NextResponse.json({ error: `Could not delete the message: ${error.message}` }, { status: 500 })
  return NextResponse.json({ ok: true })
}
