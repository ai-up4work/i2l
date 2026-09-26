// app/api/admin/chat/messages/[messageId]/tag/route.ts
//
// Staff re-tagging of a single chat message from the admin inbox.
//
// GET   — what this message could be tagged with: the customer's orders
//         and requests (newest first), the current tag, and suggestions
//         for any WD-/REQ- numbers mentioned in the message text.
// PATCH — { type: 'order' | 'request' | 'none', id? }
//         Sets the tag. The order/request must belong to the same
//         customer as the conversation. Records who changed it and the
//         original tag (data/Wishdrop-chat-message-retag.sql), then
//         recomputes the conversation's "last order/request" rollup.
//
// Manager, Sales and Super Admin — the roles that work the inbox.

import { NextRequest, NextResponse } from 'next/server'
import { requireStaffRole } from '@/lib/supabase/admin-auth'

export const runtime = 'nodejs'

const TAG_ROLES = ['manager', 'sales', 'super_admin'] as const

type Params = { params: Promise<{ messageId: string }> }

type Admin = Extract<Awaited<ReturnType<typeof requireStaffRole>>, { ok: true }>['admin']

async function loadMessageAndOwner(admin: Admin, messageId: string) {
  const { data: message } = await admin
    .from('chat_messages')
    .select('id, thread_id, text, order_id, request_id, tag_edited')
    .eq('id', messageId)
    .maybeSingle()
  if (!message) return null
  const { data: thread } = await admin.from('chat_threads').select('id, user_id').eq('id', message.thread_id).maybeSingle()
  if (!thread) return null
  return { message, userId: thread.user_id as string }
}

/** "wd 10499", "WD10499", "wd-10499" → "WD-10499"; same for REQ-. */
function mentionedIds(text: string | null) {
  const found = { orders: new Set<string>(), requests: new Set<string>() }
  for (const m of (text ?? '').matchAll(/\b(WD|REQ)[\s-]?(\d{3,})\b/gi)) {
    const id = `${m[1].toUpperCase()}-${m[2]}`
    ;(m[1].toUpperCase() === 'WD' ? found.orders : found.requests).add(id)
  }
  return found
}

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireStaffRole(TAG_ROLES)
  if (!auth.ok) return auth.response
  const { admin } = auth
  const { messageId } = await params

  const loaded = await loadMessageAndOwner(admin, messageId)
  if (!loaded) return NextResponse.json({ error: 'Message not found.' }, { status: 404 })
  const { message, userId } = loaded

  const [{ data: orders }, { data: requests }] = await Promise.all([
    admin
      .from('orders')
      .select('id, display_id, stage, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100),
    admin
      .from('requests')
      .select('id, display_id, status, source_domain, submitted_at')
      .eq('user_id', userId)
      .order('submitted_at', { ascending: false })
      .limit(100),
  ])

  const orderIds = (orders ?? []).map((o) => o.id)
  const { data: items } = orderIds.length
    ? await admin.from('order_items').select('order_id, title').in('order_id', orderIds)
    : { data: [] as { order_id: string; title: string }[] }
  const itemsByOrder = new Map<string, string[]>()
  for (const it of items ?? []) {
    const list = itemsByOrder.get(it.order_id) ?? []
    list.push(it.title)
    itemsByOrder.set(it.order_id, list)
  }

  const mentioned = mentionedIds(message.text)

  return NextResponse.json({
    current: { orderId: message.order_id, requestId: message.request_id },
    orders: (orders ?? []).map((o) => {
      const titles = itemsByOrder.get(o.id) ?? []
      return {
        id: o.id,
        displayId: o.display_id,
        stage: o.stage,
        createdAt: o.created_at,
        summary: titles.length ? `${titles[0]}${titles.length > 1 ? ` +${titles.length - 1} more` : ''}` : null,
        mentioned: mentioned.orders.has(o.display_id),
      }
    }),
    requests: (requests ?? []).map((r) => ({
      id: r.id,
      displayId: r.display_id,
      status: r.status,
      createdAt: r.submitted_at,
      summary: r.source_domain,
      mentioned: mentioned.requests.has(r.display_id),
    })),
    // Numbers mentioned that DON'T belong to this customer — worth a
    // warning in the UI rather than silently ignoring them.
    foreignMentions: [
      ...[...mentioned.orders].filter((d) => !(orders ?? []).some((o) => o.display_id === d)),
      ...[...mentioned.requests].filter((d) => !(requests ?? []).some((r) => r.display_id === d)),
    ],
  })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireStaffRole(TAG_ROLES)
  if (!auth.ok) return auth.response
  const { admin, staffId } = auth
  const { messageId } = await params

  let body: { type?: string; id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 })
  }
  if (body.type !== 'order' && body.type !== 'request' && body.type !== 'none') {
    return NextResponse.json({ error: 'type must be order, request or none.' }, { status: 400 })
  }
  if (body.type !== 'none' && !body.id) return NextResponse.json({ error: 'Missing id.' }, { status: 400 })

  const loaded = await loadMessageAndOwner(admin, messageId)
  if (!loaded) return NextResponse.json({ error: 'Message not found.' }, { status: 404 })
  const { message, userId } = loaded

  let orderId: string | null = null
  let requestId: string | null = null
  let displayId: string | null = null

  if (body.type === 'order') {
    const { data: order } = await admin.from('orders').select('id, display_id, user_id').eq('id', body.id!).maybeSingle()
    if (!order || order.user_id !== userId) {
      return NextResponse.json({ error: 'That order doesn’t belong to this customer.' }, { status: 400 })
    }
    orderId = order.id
    displayId = order.display_id
  } else if (body.type === 'request') {
    const { data: request } = await admin
      .from('requests')
      .select('id, display_id, user_id')
      .eq('id', body.id!)
      .maybeSingle()
    if (!request || request.user_id !== userId) {
      return NextResponse.json({ error: 'That request doesn’t belong to this customer.' }, { status: 400 })
    }
    requestId = request.id
    displayId = request.display_id
  }

  if (message.order_id === orderId && message.request_id === requestId) {
    return NextResponse.json({ ok: true, unchanged: true })
  }

  const { data: staff } = await admin.from('staff_accounts').select('name').eq('id', staffId).maybeSingle()
  const now = new Date().toISOString()

  const { data: updated, error: updateError } = await admin
    .from('chat_messages')
    .update({
      order_id: orderId,
      request_id: requestId,
      tag_edited: true,
      tag_edited_by: staffId,
      tag_edited_by_name: staff?.name ?? null,
      tag_edited_at: now,
      // Keep the ORIGINAL tag from the first edit only.
      ...(message.tag_edited ? {} : { original_order_id: message.order_id, original_request_id: message.request_id }),
    })
    .eq('id', message.id)
    .select('*')
    .single()
  if (updateError || !updated) {
    console.error('[chat retag] update failed', updateError)
    return NextResponse.json({ error: 'Could not save the tag. Try again.' }, { status: 500 })
  }

  // Recompute the conversation rollup from the newest tagged messages,
  // so the inbox list and its "order" tab stay correct after a re-tag.
  const [{ data: lastOrder }, { data: lastRequest }] = await Promise.all([
    admin
      .from('chat_messages')
      .select('order_id')
      .eq('thread_id', message.thread_id)
      .not('order_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('chat_messages')
      .select('request_id')
      .eq('thread_id', message.thread_id)
      .not('request_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  const rollup = {
    last_order_id: (lastOrder?.order_id as string | null) ?? null,
    last_request_id: (lastRequest?.request_id as string | null) ?? null,
  }
  const { error: threadError } = await admin.from('chat_threads').update(rollup).eq('id', message.thread_id)
  if (threadError) console.error('[chat retag] rollup update failed', threadError)

  return NextResponse.json({ ok: true, message: updated, thread: { id: message.thread_id, ...rollup }, displayId })
}
