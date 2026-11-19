// app/api/account/chat/messages/[messageId]/route.ts
//
// DELETE — a signed-in customer removes one of THEIR OWN chat messages.
//
// Allowed only when the message is theirs (sent by them, in their own
// conversation) and is not tagged to an order or a request: tagged messages are
// part of that order's record, so they stay (the customer can ask support).
// The database keeps a snapshot of every deleted message in the audit log.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

type Params = { params: Promise<{ messageId: string }> }

export async function DELETE(_req: NextRequest, { params }: Params) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  const { messageId } = await params

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createServiceRoleClient() as any
  const { data: message } = await admin
    .from('chat_messages')
    .select('id, sender, thread_id, order_id, request_id')
    .eq('id', messageId)
    .maybeSingle()
  if (!message) return NextResponse.json({ ok: true, alreadyGone: true })

  const { data: thread } = await admin.from('chat_threads').select('user_id').eq('id', message.thread_id).maybeSingle()
  if (!thread || thread.user_id !== user.id || message.sender !== 'customer') {
    return NextResponse.json({ error: 'You can only delete your own messages.' }, { status: 403 })
  }
  if (message.order_id || message.request_id) {
    return NextResponse.json(
      { error: 'This message is part of an order or request, so it can’t be deleted. Message us if it needs removing.' },
      { status: 409 },
    )
  }

  const { error } = await admin.from('chat_messages').delete().eq('id', messageId)
  if (error) return NextResponse.json({ error: 'Could not delete the message. Please try again.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
