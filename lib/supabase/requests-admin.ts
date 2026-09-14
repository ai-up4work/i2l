// lib/supabase/requests-admin.ts
//
// Real data layer for /admin/requests(+detail) and /admin/chat — the
// Channel 3 manual-quote queue and its conversations. Same pattern as
// lib/supabase/orders-admin.ts: converts real Supabase rows into the
// EXACT shapes contexts/AdminDataContext.tsx already exposes (Request,
// RequestItemAsk, ChatThread, ChatMessage — see types/admin.ts), so the
// original admin pages built against those types keep working completely
// unchanged.
//
// GRANULARITY NOTE: the mock's Request.items is an array (a request can
// ask for several different products at once), but the real `requests`
// table is single-item — one link/note/screenshot_url/quote per row,
// matching exactly what the customer-facing flow actually creates today
// (contexts/DashboardContext.tsx's confirmRequest only ever submits one
// link at a time). Every real request maps to a ONE-element items array
// here. If a real multi-item request builder gets built later, this
// mapping needs to change — right now it would silently only ever show
// item [0].
//
// STATUS MAPPING: mock RequestStatus has 4 values (sent_for_review /
// quoted / confirmed / declined). The real `request_status` enum has 5
// (adds 'pending_quote', and uses 'rejected' instead of 'declined') —
// mapRealStatusToMockStatus/mapMockStatusToRealStatus below are the one
// place that translation happens.

import { createClient } from '@/lib/supabase/client'
import { sendChatMessage as realSendChatMessage, markThreadRead as realMarkThreadRead } from '@/lib/supabase/chat'
import type { RequestStatus, ChatSender as MockChatSender } from '@/types/admin'

/* ============================================================
 * STATUS MAPPING
 * ============================================================ */

export type DbRequestStatus = 'sent_for_review' | 'pending_quote' | 'quoted' | 'confirmed' | 'rejected'

export function mapRealStatusToMockStatus(status: DbRequestStatus): RequestStatus {
  switch (status) {
    case 'sent_for_review':
    case 'pending_quote':
      return 'sent_for_review'
    case 'quoted':
      return 'quoted'
    case 'confirmed':
      return 'confirmed'
    case 'rejected':
      return 'declined'
  }
}

/* ============================================================
 * TYPES (mirrors types/admin.ts exactly — see that file for field docs)
 * ============================================================ */

export interface RealQuoteHistoryEntry {
  amount: number
  by: string
  at: string
}

export interface RealRequestItemAsk {
  id: string
  link: string
  note: string
  screenshotUrl?: string
  sourceDomain: string
  quote?: number
  quoteHistory: RealQuoteHistoryEntry[]
}

export interface RealRequest {
  id: string
  userId: string
  customerName: string
  items: RealRequestItemAsk[]
  status: RequestStatus
  submittedAt: string
  assignedStaffId?: string
  chatThreadId: string
}

export interface RealChatMessage {
  id: string
  threadId: string
  sender: MockChatSender
  body: string
  at: string
  sentViaWhatsApp?: boolean
}

export interface RealChatThread {
  id: string
  customerName: string
  requestId?: string
  lastActivity: string
  unread: boolean
  messages: RealChatMessage[]
}

/* ============================================================
 * FETCHERS
 * ============================================================ */

/** Every Channel 3 request across every customer — feeds AdminDataContext's `requests` state directly. */
export async function fetchAdminRequests(): Promise<RealRequest[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('requests')
    .select('id, user_id, link, note, screenshot_url, source_domain, status, quote, chat_thread_id, assigned_staff_id, submitted_at')
    .order('submitted_at', { ascending: false })
  if (error) {
    console.error('[fetchAdminRequests]', error)
    return []
  }
  const rows = data ?? []
  const userIds = [...new Set(rows.map((r) => r.user_id))]
  const requestIds = rows.map((r) => r.id)

  const [{ data: profiles }, { data: histories }] = await Promise.all([
    userIds.length
      ? supabase.from('profiles').select('id, full_name').in('id', userIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    requestIds.length
      ? supabase
          .from('request_quote_history')
          .select('id, request_id, amount, staff_id, created_at')
          .in('request_id', requestIds)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] as { id: string; request_id: string; amount: number; staff_id: string | null; created_at: string }[] }),
  ])

  const nameByUserId = new Map((profiles ?? []).map((p) => [p.id, p.full_name]))
  const staffIds = [...new Set((histories ?? []).map((h) => h.staff_id).filter((id): id is string => !!id))]
  const { data: staff } = staffIds.length
    ? await supabase.from('staff_accounts').select('id, name').in('id', staffIds)
    : { data: [] as { id: string; name: string }[] }
  const staffNameById = new Map((staff ?? []).map((s) => [s.id, s.name]))

  const historyByRequestId = new Map<string, RealQuoteHistoryEntry[]>()
  for (const h of histories ?? []) {
    const entry = { amount: h.amount, by: h.staff_id ? staffNameById.get(h.staff_id) ?? 'Staff' : 'Staff', at: h.created_at }
    historyByRequestId.set(h.request_id, [...(historyByRequestId.get(h.request_id) ?? []), entry])
  }

  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    customerName: nameByUserId.get(r.user_id) ?? 'Unknown customer',
    status: mapRealStatusToMockStatus(r.status as DbRequestStatus),
    submittedAt: r.submitted_at,
    assignedStaffId: r.assigned_staff_id ?? undefined,
    chatThreadId: r.chat_thread_id,
    items: [
      {
        id: `${r.id}-item`,
        link: r.link,
        note: r.note ?? '',
        screenshotUrl: r.screenshot_url ?? undefined,
        sourceDomain: r.source_domain,
        quote: r.quote ?? undefined,
        quoteHistory: historyByRequestId.get(r.id) ?? [],
      },
    ],
  }))
}

/** Every chat thread across every customer — feeds /admin/chat's inbox. */
export async function fetchAdminChatThreads(): Promise<RealChatThread[]> {
  const supabase = createClient()
  const { data: threads, error } = await supabase
    .from('chat_threads')
    .select('id, user_id, request_id, last_activity, unread')
    .order('last_activity', { ascending: false })
  if (error) {
    console.error('[fetchAdminChatThreads]', error)
    return []
  }
  const rows = threads ?? []
  const userIds = [...new Set(rows.map((t) => t.user_id))]
  const threadIds = rows.map((t) => t.id)

  const [{ data: profiles }, { data: messages }] = await Promise.all([
    userIds.length
      ? supabase.from('profiles').select('id, full_name').in('id', userIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    threadIds.length
      ? supabase
          .from('chat_messages')
          .select('id, thread_id, sender, sender_name, text, attachment_url, sent_via_whatsapp, created_at')
          .in('thread_id', threadIds)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] as { id: string; thread_id: string; sender: string; sender_name: string; text: string | null; attachment_url: string | null; sent_via_whatsapp: boolean; created_at: string }[] }),
  ])

  const nameByUserId = new Map((profiles ?? []).map((p) => [p.id, p.full_name]))
  const messagesByThreadId = new Map<string, RealChatMessage[]>()
  for (const m of messages ?? []) {
    const msg: RealChatMessage = {
      id: m.id,
      threadId: m.thread_id,
      sender: m.sender === 'staff' ? 'staff' : 'customer',
      body: m.text ?? (m.attachment_url ? '[Attachment]' : ''),
      at: m.created_at,
      sentViaWhatsApp: m.sent_via_whatsapp,
    }
    messagesByThreadId.set(m.thread_id, [...(messagesByThreadId.get(m.thread_id) ?? []), msg])
  }

  return rows.map((t) => ({
    id: t.id,
    customerName: nameByUserId.get(t.user_id) ?? 'Unknown customer',
    requestId: t.request_id ?? undefined,
    lastActivity: t.last_activity,
    unread: t.unread,
    messages: messagesByThreadId.get(t.id) ?? [],
  }))
}

/* ============================================================
 * MUTATORS
 * ============================================================ */

/**
 * Quotes the request (real `requests` is single-item, so there's no
 * per-item target the way the mock's setQuote(requestId, itemId, ...)
 * implies — see file header). Updates requests.quote, flips status to
 * 'quoted', and logs the change to request_quote_history so the revision
 * panel has something real to show.
 */
export async function setRequestQuote(requestId: string, amount: number, staffId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { error: updateError } = await supabase.from('requests').update({ quote: amount, status: 'quoted' }).eq('id', requestId)
  if (updateError) return { ok: false, error: updateError.message }

  const { error: historyError } = await supabase.from('request_quote_history').insert({ request_id: requestId, amount, staff_id: staffId })
  if (historyError) return { ok: false, error: historyError.message }
  return { ok: true }
}

export async function declineRequestReal(requestId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { error } = await supabase.from('requests').update({ status: 'rejected' }).eq('id', requestId)
  return error ? { ok: false, error: error.message } : { ok: true }
}

export async function reassignRequestReal(requestId: string, staffId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { error } = await supabase.from('requests').update({ assigned_staff_id: staffId }).eq('id', requestId)
  return error ? { ok: false, error: error.message } : { ok: true }
}

/**
 * Confirms a quoted request AND creates the real Channel 3 order it
 * becomes — the only place a channel=3 `orders` row is created. Mirrors
 * lib/supabase/orders-admin.ts's shape (display_id, stage='ordered')
 * exactly, so the new order immediately shows up in every real queue
 * (QC/Pack&Label/etc. once it's purchased and advanced) the same way any
 * other order does. Returns the new order's display_id so the caller can
 * link to it.
 */
export async function confirmRequestReal(
  requestId: string,
  userId: string,
  customerNote: string,
  link: string,
  quote: number,
): Promise<{ ok: boolean; error?: string; orderDisplayId?: string }> {
  const supabase = createClient()

  let displayId = ''
  let orderId = ''
  for (let attempt = 0; attempt < 5; attempt++) {
    displayId = `WD-${Math.floor(10000 + Math.random() * 89999)}`
    const { data, error } = await supabase
      .from('orders')
      .insert({
        display_id: displayId,
        user_id: userId,
        channel: 3,
        stage: 'ordered',
        currency: 'LKR',
        total_value: quote,
        request_id: requestId,
      })
      .select('id')
      .single()
    if (!error) {
      orderId = data.id as string
      break
    }
    if (error.code !== '23505') return { ok: false, error: error.message }
  }
  if (!orderId) return { ok: false, error: 'Could not generate a unique order number. Please try again.' }

  const { error: itemError } = await supabase.from('order_items').insert({
    order_id: orderId,
    title: customerNote.length > 60 ? `${customerNote.slice(0, 57)}...` : customerNote || link,
    quantity: 1,
    unit_price: quote,
    request_link: link,
    seller_type: 'individual',
  })
  if (itemError) return { ok: false, error: itemError.message }

  const { error: statusError } = await supabase.from('requests').update({ status: 'confirmed' }).eq('id', requestId)
  if (statusError) return { ok: false, error: statusError.message }

  return { ok: true, orderDisplayId: displayId }
}

/* ============================================================
 * CHAT — reuses lib/supabase/chat.ts's real functions directly
 * ============================================================ */

export async function sendAdminChatMessage(
  threadId: string,
  staffName: string,
  body: string,
  requestId?: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  try {
    await realSendChatMessage(supabase, { threadId, sender: 'staff', senderName: staffName, text: body, requestId })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to send message.' }
  }
}

export async function markThreadReadReal(threadId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  try {
    await realMarkThreadRead(supabase, threadId)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to mark read.' }
  }
}

export async function markSentViaWhatsAppReal(messageId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { error } = await supabase.from('chat_messages').update({ sent_via_whatsapp: true }).eq('id', messageId)
  return error ? { ok: false, error: error.message } : { ok: true }
}
