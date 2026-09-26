// app/api/admin/orders/[orderId]/chat-thread/route.ts
//
// POST — make sure this order is linked to the customer's chat thread
// (orders.chat_thread_id), and return that thread id.
//
// Orders created before every order got a thread at creation — and, until
// fixed, orders from the "paste a link → priced → confirm" flow — have no
// thread, so the order page's chat drawer used to dead-end with "No chat
// thread linked". The drawer now calls this to repair the link itself.
//
// Picks, in order:
//   1. the thread that messages TAGGED to this order were sent in
//      (so the conversation staff see is the one the customer is using);
//   2. the thread of the request this order came from (Channel 3);
//   3. the customer's most recently active thread;
//   4. a new thread for the customer.
// Only fills an empty link — never overwrites an existing one.
//
// Any active staff member (the order page is shared across roles).

import { NextRequest, NextResponse } from 'next/server'
import { requireStaffRole } from '@/lib/supabase/admin-auth'

export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(_req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const auth = await requireStaffRole()
  if (!auth.ok) return auth.response
  const { admin } = auth
  const { orderId: raw } = await params
  const key = decodeURIComponent(raw)

  const { data: order } = await admin
    .from('orders')
    .select('id, user_id, request_id, chat_thread_id')
    .eq(UUID.test(key) ? 'id' : 'display_id', key)
    .maybeSingle()
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  if (order.chat_thread_id) return NextResponse.json({ threadId: order.chat_thread_id, linked: false })

  let threadId: string | null = null

  // 1. Where the customer has actually been talking about this order.
  const { data: tagged } = await admin
    .from('chat_messages')
    .select('thread_id')
    .eq('order_id', order.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  threadId = (tagged?.thread_id as string | undefined) ?? null

  // 2. The request this order came from.
  if (!threadId && order.request_id) {
    const { data: request } = await admin
      .from('requests')
      .select('chat_thread_id')
      .eq('id', order.request_id)
      .maybeSingle()
    threadId = (request?.chat_thread_id as string | undefined) ?? null
  }

  // 3. The customer's most recently active thread.
  if (!threadId) {
    const { data: recent } = await admin
      .from('chat_threads')
      .select('id')
      .eq('user_id', order.user_id)
      .order('last_activity', { ascending: false })
      .limit(1)
      .maybeSingle()
    threadId = (recent?.id as string | undefined) ?? null
  }

  // 4. No conversation at all yet — start one (not flagged unread: nobody wrote).
  if (!threadId) {
    const { data: created, error } = await admin
      .from('chat_threads')
      .insert({ user_id: order.user_id, unread: false })
      .select('id')
      .single()
    if (error || !created) {
      console.error('[order chat-thread] create failed', error)
      return NextResponse.json({ error: 'Could not start a conversation for this customer.' }, { status: 500 })
    }
    threadId = created.id as string
  }

  // Fill only if still empty (another tab may have just done it).
  const { data: updated, error: updateError } = await admin
    .from('orders')
    .update({ chat_thread_id: threadId })
    .eq('id', order.id)
    .is('chat_thread_id', null)
    .select('chat_thread_id')
    .maybeSingle()
  if (updateError) {
    console.error('[order chat-thread] link failed', updateError)
    return NextResponse.json({ error: 'Could not link this order to the chat.' }, { status: 500 })
  }
  if (!updated) {
    const { data: again } = await admin.from('orders').select('chat_thread_id').eq('id', order.id).maybeSingle()
    return NextResponse.json({ threadId: again?.chat_thread_id ?? threadId, linked: false })
  }
  return NextResponse.json({ threadId, linked: true })
}
