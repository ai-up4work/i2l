// app/api/whatsapp/relay-outbound/route.ts
//
// Called by the client-side admin chat-send code paths (the main
// /admin/chat inbox, and the order/request detail drawers' shared
// sendAdminChatMessage) right after a staff reply is successfully
// written to chat_messages — see triggerWhatsAppRelay in
// lib/chat/relay-client.ts for the client-side half of this.
//
// WHY THIS IS ITS OWN ROUTE, not just logic inside sendChatMessage
// (lib/supabase/chat.ts): that function is called directly from
// CLIENT code in multiple places (ChatContext.tsx, the admin chat
// page, requests-admin.ts) — none of those go through a server route
// for the actual database write, they use the browser's own Supabase
// client with RLS. Calling sendTextMessage() (which needs
// WHATSAPP_ACCESS_TOKEN, a private server secret) from inside that
// shared function would mean trying to run it in the browser too,
// which either fails outright or — worse — tries to call Meta's Graph
// API directly from a customer/staff's own browser with no valid
// token. This route is the one place that secret is ever touched,
// reachable only server-side.
//
// Fire-and-forget on the client side by design: a failed relay
// attempt (no verified phone, thread never touched WhatsApp, the
// Cloud API call itself failing) should never surface as a failure of
// the already-succeeded in-app send.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { sendTextMessage } from '@/lib/chat/whatsapp'
import { e164ToWhatsAppDigits } from '@/lib/chat/phone'

export async function POST(req: NextRequest) {
  let body: { threadId?: string; text?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 })
  }

  const { threadId, text } = body
  if (!threadId || !text) {
    return NextResponse.json({ error: 'Missing threadId or text.' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()

  // Only relay if this thread's most recent CUSTOMER message actually
  // came in over WhatsApp — a thread that's never touched WhatsApp
  // shouldn't suddenly start receiving messages there just because
  // staff replied from the admin panel.
  const { data: lastCustomerMessage } = await supabase
    .from('chat_messages')
    .select('channel')
    .eq('thread_id', threadId)
    .eq('sender', 'customer')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lastCustomerMessage?.channel !== 'whatsapp') {
    return NextResponse.json({ relayed: false, reason: 'thread is not currently WhatsApp-active' })
  }

  const { data: thread } = await supabase
    .from('chat_threads')
    .select('user_id')
    .eq('id', threadId)
    .maybeSingle()
  if (!thread) {
    return NextResponse.json({ relayed: false, reason: 'thread not found' })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('phone')
    .eq('id', thread.user_id)
    .maybeSingle()
  if (!profile?.phone) {
    // Shouldn't normally happen if their last message really came in
    // via WhatsApp (that requires a matched, verified phone in the
    // first place — see the inbound webhook) but checked defensively
    // rather than assumed.
    return NextResponse.json({ relayed: false, reason: 'no verified phone on file' })
  }

  try {
    await sendTextMessage(e164ToWhatsAppDigits(profile.phone), text)
  } catch (err) {
    console.error('[whatsapp relay-outbound] send failed', err)
    return NextResponse.json({ relayed: false, reason: 'send failed' }, { status: 500 })
  }

  return NextResponse.json({ relayed: true })
}