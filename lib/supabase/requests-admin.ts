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

/**
 * Supabase throws PostgrestError-shaped plain objects ({ message,
 * details, hint, code }) from a bare `if (error) throw error`, not real
 * Error instances — a naive `err instanceof Error ? err.message : ...`
 * always falls through to the generic fallback for these, throwing away
 * the actual reason (an RLS policy rejection, a bad foreign key, etc.)
 * right when it matters most for debugging a failed customer-facing
 * send. Use this instead of that pattern anywhere a Supabase client call
 * is what's being caught.
 */
function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const message = String((err as { message: unknown }).message)
    if (message) return message
  }
  return fallback
}

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
  needsVariantConfirmation?: boolean
  confirmedVariant?: string
}

/** Recorded once Manager/Sales & Purchase confirms the customer's payment
 * for this request's quote — required before the request can move to
 * 'confirmed' (see confirmRequestReal's guard below). */
export interface RealRequestPayment {
  amount: number
  method: string
  reference?: string
  confirmedAt: string
  confirmedByName?: string
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
  payment?: RealRequestPayment
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
    .select(
      'id, user_id, link, note, item_name, screenshot_url, source_domain, status, quote, chat_thread_id, assigned_staff_id, submitted_at, payment_amount, payment_method, payment_reference, payment_confirmed_at, payment_confirmed_by, needs_variant_confirmation, confirmed_variant',
    )
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
  const staffIds = [
    ...new Set(
      [
        ...(histories ?? []).map((h) => h.staff_id),
        ...rows.map((r) => r.payment_confirmed_by),
      ].filter((id): id is string => !!id),
    ),
  ]
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
    payment: r.payment_confirmed_at
      ? {
          amount: r.payment_amount ?? 0,
          method: r.payment_method ?? 'other',
          reference: r.payment_reference ?? undefined,
          confirmedAt: r.payment_confirmed_at,
          confirmedByName: r.payment_confirmed_by ? staffNameById.get(r.payment_confirmed_by) ?? 'Staff' : undefined,
        }
      : undefined,
    items: [
      {
        id: `${r.id}-item`,
        link: r.link,
        note: r.note ?? '',
        screenshotUrl: r.screenshot_url ?? undefined,
        sourceDomain: r.source_domain,
        quote: r.quote ?? undefined,
        quoteHistory: historyByRequestId.get(r.id) ?? [],
        needsVariantConfirmation: r.needs_variant_confirmation ?? false,
        confirmedVariant: r.confirmed_variant ?? undefined,
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
      // m.sender is the raw DB value — real chat_sender enum is
      // ('customer', 'ops'), so this must check against 'ops' to
      // correctly recognize a staff-authored message. This used to check
      // 'staff' (which the enum never actually contained), so every
      // real staff reply was silently mis-mapped to look like it came
      // from the customer throughout the whole admin chat inbox.
      sender: m.sender === 'ops' ? 'staff' : 'customer',
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

/**
 * Records that the customer's payment for a quoted request has come in
 * (agreed over chat/WhatsApp, then confirmed here by whoever is working
 * the request — Manager or Sales & Purchase). This is a distinct step
 * from confirmRequestReal below: recording payment does NOT by itself
 * create the order — it just unblocks the "Confirm → creates order"
 * action, which still has to be clicked separately. Re-callable: if the
 * amount/reference was mistyped, calling this again overwrites the
 * previous confirmation rather than stacking a history (unlike quotes,
 * a request is only ever paid once, so there's nothing to keep a
 * revision trail of).
 */
export async function confirmRequestPaymentReal(
  requestId: string,
  payment: { amount: number; method: string; reference?: string; staffId: string },
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { error } = await supabase
    .from('requests')
    .update({
      payment_amount: payment.amount,
      payment_method: payment.method,
      payment_reference: payment.reference ?? null,
      payment_confirmed_at: new Date().toISOString(),
      payment_confirmed_by: payment.staffId,
    })
    .eq('id', requestId)
  return error ? { ok: false, error: error.message } : { ok: true }
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
 * Manually attaches (or replaces) the product photo for a request —
 * used when the OG scrape found no image at all (Instagram posts and
 * heavily bot-protected sites are the classic case), or found the wrong
 * one. Admin uploads a file through the 'products' folder (see
 * app/api/upload/route.ts — shared, not user-scoped, same as banners/qc)
 * and this just persists the resulting URL onto requests.screenshot_url,
 * same column the OG-fetched photo would have landed in. Whatever's here
 * at confirm time is what confirmRequestReal carries over onto the new
 * order_items row, so this is also how you fix a bad/missing photo
 * before an order gets created — after that, the order's own
 * order_items.screenshot_url would need editing separately.
 */
export async function setRequestScreenshotReal(requestId: string, screenshotUrl: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { error } = await supabase.from('requests').update({ screenshot_url: screenshotUrl }).eq('id', requestId)
  return error ? { ok: false, error: error.message } : { ok: true }
}

/**
 * Records the confirmed variant (size/color/etc.) once the admin has
 * actually confirmed it with the customer over chat — replaces the old
 * "[Confirm size/color with customer]" tag-in-note approach, which had
 * nowhere to capture the answer once someone actually got it; the tag
 * just sat there forever (or, after the item_name fix, got silently
 * dropped with the information lost entirely). Whatever's set here at
 * confirm time gets prepended onto the order's item name — see
 * confirmRequestReal below.
 */
export async function setRequestVariantReal(requestId: string, variant: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { error } = await supabase.from('requests').update({ confirmed_variant: variant }).eq('id', requestId)
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
/**
 * Defensive fallback ONLY — strips the known internal tag/estimate
 * patterns that buildRequestNote() (DashboardContext.tsx) bakes into
 * requests.note, for any request created before item_name existed as a
 * column. Every request created going forward has a real item_name set
 * at creation time and never needs this. Kept narrowly matched to
 * exactly those two known patterns rather than a general "strip
 * bracketed prefixes" rule, so it can't accidentally eat something that
 * was actually part of the product name.
 */
function stripInternalNoteTags(note: string): string {
  return note
    .replace(/^\[Confirm size\/color with customer\]\s*/, '')
    .replace(/\s*\(customer's estimate:.*?\)\s*$/, '')
    .trim()
}

export async function confirmRequestReal(
  requestId: string,
  userId: string,
  customerNote: string,
  link: string,
  quote: number,
): Promise<{ ok: boolean; error?: string; orderDisplayId?: string }> {
  const supabase = createClient()

  // Payment must already be on record — recorded separately via
  // confirmRequestPaymentReal above, on the same request-detail page,
  // before this action is even reachable in the UI. Re-checked here so
  // this can never create an order for a request nobody's actually paid
  // for, even if a caller skips the UI's own gating. Also pulls
  // screenshot_url here (rather than a second round trip) — this is the
  // OG-fetched or admin-uploaded photo of the actual item (see
  // DashboardContext's confirmRequest / setRequestScreenshotReal below),
  // and needs to carry over onto the new order_items row so the order
  // shows this real photo everywhere instead of the generic placeholder.
  const { data: existing, error: fetchError } = await supabase
    .from('requests')
    .select('payment_confirmed_at, screenshot_url, chat_thread_id, item_name, confirmed_variant')
    .eq('id', requestId)
    .single()
  if (fetchError) return { ok: false, error: fetchError.message }
  if (!existing?.payment_confirmed_at) {
    return { ok: false, error: 'Payment must be confirmed before this request can be confirmed.' }
  }

  // display_id is intentionally left out of this insert — orders.display_id
  // has a real DEFAULT backed by a Postgres sequence (see
  // data/wishdrop-order-display-id-sequence.sql), the same mechanism
  // Channel 1/2 checkout relies on via createOrderWithRetry
  // (contexts/DashboardContext.tsx). The retry loop below exists for the
  // same reason createOrderWithRetry's does: this table can still contain
  // legacy rows whose display_id came from the OLD client-side random
  // generator this function used to use, which drew from the exact same
  // numeric range the sequence starts at. A `23505` on display_id is a
  // real transitional collision against one of those rows, not a
  // hypothetical one — retrying re-evaluates the same DEFAULT expression
  // and gets a fresh, guaranteed-new value from the sequence each time.
  const MAX_ATTEMPTS = 5
  let orderId = ''
  let displayId = ''
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { data, error } = await supabase
      .from('orders')
      .insert({
        user_id: userId,
        channel: 3,
        stage: 'ordered',
        currency: 'LKR',
        total_value: quote,
        request_id: requestId,
        // Carries the customer's chat thread onto the order itself, so
        // any later order-level action (purchase failed, QC flagged,
        // shipped, delivered) can message the same thread without
        // re-deriving it through the request — see Order.chatThreadId's
        // doc comment in types/admin.ts.
        chat_thread_id: existing.chat_thread_id,
      })
      .select('id, display_id')
      .single()
    if (!error) {
      orderId = data.id as string
      displayId = data.display_id as string
      break
    }
    const isDisplayIdCollision = error.code === '23505' && /display_id/i.test(error.message)
    if (!isDisplayIdCollision || attempt === MAX_ATTEMPTS - 1) return { ok: false, error: error.message }
  }

  // Clean, customer-facing title — never the raw ops note, which can
  // carry an internal tag like "[Confirm size/color with customer]"
  // (see buildRequestNote in DashboardContext.tsx). item_name is the
  // real source going forward; stripInternalNoteTags is only a fallback
  // for a request created before that column existed. If the admin
  // confirmed a variant (size/color/etc.) with the customer, it's
  // prepended here — e.g. "Size M, Black - Everyday Seamless Racerback
  // Tank" — instead of the old tag being silently dropped with the
  // resolved answer nowhere to be seen.
  const baseTitle = existing.item_name?.trim() || stripInternalNoteTags(customerNote) || link
  const cleanTitle = existing.confirmed_variant?.trim() ? `${existing.confirmed_variant.trim()} - ${baseTitle}` : baseTitle
  const { error: itemError } = await supabase.from('order_items').insert({
    order_id: orderId,
    title: cleanTitle.length > 60 ? `${cleanTitle.slice(0, 57)}...` : cleanTitle,
    quantity: 1,
    unit_price: quote,
    request_link: link,
    screenshot_url: existing.screenshot_url ?? null,
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
  attachmentUrl?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  try {
    await realSendChatMessage(supabase, { threadId, sender: 'ops', senderName: staffName, text: body, requestId, attachmentUrl })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: extractErrorMessage(err, 'Failed to send message.') }
  }
}

export async function markThreadReadReal(threadId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  try {
    await realMarkThreadRead(supabase, threadId)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: extractErrorMessage(err, 'Failed to mark read.') }
  }
}

export async function markSentViaWhatsAppReal(messageId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { error } = await supabase.from('chat_messages').update({ sent_via_whatsapp: true }).eq('id', messageId)
  return error ? { ok: false, error: error.message } : { ok: true }
}