// app/api/account/chat/welcome/route.ts
//
// POST — sends the welcome messages to a NEW customer's chat, once.
//
// Called by the chat when a signed-in customer's thread loads. Everything
// is decided here, on the server:
//   1. The customer is claimed first (profiles.chat_welcomed_at set where it
//      was null), so two tabs or a double call can never send twice.
//   2. Anyone who already has chat messages is skipped (existing customers).
//   3. Message 1 (welcome) always; message 2 (phone request) only when there's
//      no verified WhatsApp number.
// Both go in as "Wishdrop Support", sender 'ops', is_automated = true. They are
// inserted directly rather than through sendChatMessage so they don't bump the
// thread to the top of the staff inbox or count as a staff reply.
//
// The wording is editable at Admin → Settings → Templates.
// Needs data/wishdrop-chat-welcome.sql.

import { NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { ensureMessageTemplates } from '@/lib/chat/messageTemplates-server'
import { welcomeMessage, welcomePhoneMessage } from '@/lib/chat/customerMessageTemplates'
import { SITE_URL } from '@/lib/seo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SENDER_NAME = 'Wishdrop Support'

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createServiceRoleClient() as any

  // 1. Claim. Only the call that flips null -> now() goes on.
  const { data: claimed, error: claimError } = await admin
    .from('profiles')
    .update({ chat_welcomed_at: new Date().toISOString() })
    .eq('id', user.id)
    .is('chat_welcomed_at', null)
    .select('id, full_name, phone_verified')
    .maybeSingle()
  if (claimError) {
    // Most likely the migration hasn't been run. Never break the chat over it.
    console.error('[chat welcome] claim failed', claimError.message)
    return NextResponse.json({ sent: 0 })
  }
  if (!claimed) return NextResponse.json({ sent: 0 })

  // 2. A thread (the chat creates one on load; make sure) with no messages yet.
  const { data: threads } = await admin.from('chat_threads').select('id').eq('user_id', user.id).order('last_activity', { ascending: false })
  const threadIds = ((threads ?? []) as { id: string }[]).map((t) => t.id)
  if (threadIds.length) {
    const { count } = await admin.from('chat_messages').select('id', { count: 'exact', head: true }).in('thread_id', threadIds)
    if ((count ?? 0) > 0) return NextResponse.json({ sent: 0 })
  }
  let threadId = threadIds[0]
  if (!threadId) {
    const { data: created, error } = await admin.from('chat_threads').insert({ user_id: user.id }).select('id').single()
    if (error) return NextResponse.json({ sent: 0 })
    threadId = created.id as string
  }

  // 3. Build and insert.
  await ensureMessageTemplates()
  const firstName = ((claimed.full_name as string | null) ?? '').trim().split(/\s+/)[0] || null
  const texts = [welcomeMessage(firstName)]
  if (!claimed.phone_verified) texts.push(welcomePhoneMessage(`${SITE_URL}/account/profile`))

  // created_at a moment apart so they always show in this order.
  const base = Date.now()
  const rows = texts.map((text, i) => ({
    thread_id: threadId,
    sender: 'ops',
    sender_name: SENDER_NAME,
    text,
    is_automated: true,
    created_at: new Date(base + i * 1000).toISOString(),
  }))
  const { data: inserted, error: insertError } = await admin.from('chat_messages').insert(rows).select('*')
  if (insertError) {
    console.error('[chat welcome] insert failed', insertError.message)
    // Let the next visit try again.
    await admin.from('profiles').update({ chat_welcomed_at: null }).eq('id', user.id)
    return NextResponse.json({ sent: 0 })
  }
  return NextResponse.json({ sent: rows.length, messages: inserted })
}
