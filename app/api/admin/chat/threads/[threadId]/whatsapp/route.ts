// app/api/admin/chat/threads/[threadId]/whatsapp/route.ts
//
// "Send to WhatsApp" support for the admin inbox.
//
// GET  — the customer's name + VERIFIED WhatsApp number (null if not
//        verified), and the last reminder sent in this conversation.
// POST — { kind: 'messages' | 'reminder', messageIds, text, link }
//        Records that a staff member opened this text in WhatsApp: logs
//        it, marks forwarded messages, stamps the conversation's last
//        reminder. Called as the WhatsApp link opens; we can't know if
//        they then pressed Send, so it's recorded as "opened".
//
// Manager, Sales and Super Admin.

import { NextRequest, NextResponse } from 'next/server'
import { requireStaffRole } from '@/lib/supabase/admin-auth'
import { firstNameOf } from '@/lib/chat/whatsapp-handoff'

export const runtime = 'nodejs'

const ROLES = ['manager', 'sales', 'super_admin'] as const

type Params = { params: Promise<{ threadId: string }> }
type Admin = Extract<Awaited<ReturnType<typeof requireStaffRole>>, { ok: true }>['admin']

async function loadThread(admin: Admin, threadId: string) {
  const { data: thread } = await admin
    .from('chat_threads')
    .select('id, user_id, last_whatsapp_reminder_at, last_whatsapp_reminder_by_name')
    .eq('id', threadId)
    .maybeSingle()
  if (!thread) return null
  const { data: profile } = await admin
    .from('profiles')
    .select('full_name, phone, phone_verified')
    .eq('id', thread.user_id)
    .maybeSingle()
  return { thread, profile }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireStaffRole(ROLES)
  if (!auth.ok) return auth.response
  const { threadId } = await params

  const loaded = await loadThread(auth.admin, threadId)
  if (!loaded) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 })
  const { thread, profile } = loaded

  return NextResponse.json({
    customer: {
      name: profile?.full_name ?? '',
      firstName: firstNameOf(profile?.full_name),
      verifiedPhone: profile?.phone_verified && profile.phone ? profile.phone : null,
    },
    lastReminder: thread.last_whatsapp_reminder_at
      ? { at: thread.last_whatsapp_reminder_at, by: thread.last_whatsapp_reminder_by_name }
      : null,
  })
}

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireStaffRole(ROLES)
  if (!auth.ok) return auth.response
  const { admin, staffId } = auth
  const { threadId } = await params

  let body: { kind?: string; messageIds?: unknown; text?: unknown; link?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 })
  }
  const kind = body.kind === 'reminder' ? 'reminder' : body.kind === 'messages' ? 'messages' : null
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  const link = typeof body.link === 'string' && body.link ? body.link.slice(0, 500) : null
  const messageIds = Array.isArray(body.messageIds)
    ? body.messageIds.filter((id): id is string => typeof id === 'string').slice(0, 50)
    : []
  if (!kind || !text) return NextResponse.json({ error: 'Missing kind or text.' }, { status: 400 })
  if (text.length > 4000) return NextResponse.json({ error: 'Message too long.' }, { status: 400 })
  if (kind === 'messages' && messageIds.length === 0) {
    return NextResponse.json({ error: 'Pick at least one message.' }, { status: 400 })
  }

  const loaded = await loadThread(admin, threadId)
  if (!loaded) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 })
  const phone = loaded.profile?.phone_verified ? loaded.profile.phone : null
  if (!phone) {
    return NextResponse.json({ error: 'This customer hasn’t verified a WhatsApp number.' }, { status: 400 })
  }

  // Only this conversation's own STAFF messages can be marked.
  let validIds: string[] = []
  if (messageIds.length) {
    const { data: rows } = await admin
      .from('chat_messages')
      .select('id, sender')
      .eq('thread_id', threadId)
      .in('id', messageIds)
    validIds = (rows ?? []).filter((r) => String(r.sender) !== 'customer').map((r) => r.id)
  }

  const { data: staff } = await admin.from('staff_accounts').select('name').eq('id', staffId).maybeSingle()
  const staffName = staff?.name ?? null
  const now = new Date().toISOString()

  const { error: logError } = await admin.from('chat_whatsapp_handoffs').insert({
    thread_id: threadId,
    kind,
    message_ids: validIds,
    phone,
    text,
    link,
    staff_id: staffId,
    staff_name: staffName,
  })
  if (logError) console.error('[whatsapp handoff] log failed', logError)

  if (validIds.length) {
    const { error } = await admin
      .from('chat_messages')
      .update({
        sent_via_whatsapp: true,
        whatsapp_sent_by: staffId,
        whatsapp_sent_by_name: staffName,
        whatsapp_sent_at: now,
      })
      .in('id', validIds)
    if (error) console.error('[whatsapp handoff] mark messages failed', error)
  }

  // Both kinds count as "we reached out on WhatsApp" for the reminder
  // indicator, so staff don't double up.
  await admin
    .from('chat_threads')
    .update({ last_whatsapp_reminder_at: now, last_whatsapp_reminder_by_name: staffName })
    .eq('id', threadId)

  return NextResponse.json({ ok: true, at: now, by: staffName, messageIds: validIds })
}
