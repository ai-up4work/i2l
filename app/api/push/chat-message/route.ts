// app/api/push/chat-message/route.ts
//
// Called ONLY by the database trigger `push_on_staff_chat_message`
// (data/wishdrop-push-notifications.sql) after any staff message is
// inserted into chat_messages. Looks the message up itself — the trigger
// only sends its id — and pushes it to every device of the thread's
// customer.
//
// Auth: the `x-push-secret` header must equal PUSH_WEBHOOK_SECRET (the same
// value stored in Supabase Vault as `wishdrop_push_webhook_secret`).

import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { notificationText, sendPushToUsers } from '@/lib/push/server'

export const runtime = 'nodejs'

function secretMatches(provided: string | null): boolean {
  const expected = process.env.PUSH_WEBHOOK_SECRET
  if (!expected || !provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(req: NextRequest) {
  if (!secretMatches(req.headers.get('x-push-secret'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let messageId: string | undefined
  try {
    ;({ messageId } = await req.json())
  } catch {
    return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 })
  }
  if (!messageId) return NextResponse.json({ error: 'Missing messageId.' }, { status: 400 })

  const admin = createServiceRoleClient()

  const { data: message } = await admin
    .from('chat_messages')
    .select('id, thread_id, sender, sender_name, text, attachment_url')
    .eq('id', messageId)
    .maybeSingle()
  if (!message) return NextResponse.json({ pushed: false, reason: 'message not found' })
  // Belt and braces: the trigger already filters these out.
  if (String(message.sender) === 'customer') {
    return NextResponse.json({ pushed: false, reason: 'customer message' })
  }

  const { data: thread } = await admin
    .from('chat_threads')
    .select('user_id')
    .eq('id', message.thread_id)
    .maybeSingle()
  if (!thread?.user_id) return NextResponse.json({ pushed: false, reason: 'thread not found' })

  const body =
    notificationText(message.text) || (message.attachment_url ? 'Sent you a photo' : 'Sent you a message')
  const senderName = message.sender_name?.trim()

  const result = await sendPushToUsers(admin, [thread.user_id], {
    kind: 'chat',
    title: senderName ? `${senderName} from WishDrop` : 'WishDrop support',
    body,
    url: '/account/messages',
    // One notification per conversation: a new reply replaces the last
    // one instead of stacking ten notifications from the same chat.
    tag: `chat-${message.thread_id}`,
  })

  return NextResponse.json({ pushed: result.sent > 0, ...result })
}
