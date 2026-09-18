// lib/supabase/chat.ts
//
// Real data layer for chat_threads / chat_messages, replacing the
// localStorage + IndexedDB mock in contexts/ChatContext.tsx and the
// standalone admin chat page. Shared by both sides so message shape,
// attachment handling, and realtime wiring only exist in one place.
//
// ── Known schema gaps, by design not oversight ──────────────────────
// - No reply-to column. `chat_messages` has no foreign key back to
//   another message, so "replying to X" can't be a real relation. It's
//   preserved as a plain-text quote prefix baked into the message body
//   instead (see buildReplyBody/parseReplyBody below) — a real feature,
//   just not a relational one. A future `reply_to_id uuid references
//   chat_messages(id)` column would let this become a proper quote-jump
//   instead of a text convention.
// - One attachment per message. `attachment_url` is a single text
//   column, not an array — picking multiple files sends one message
//   per file instead of one message with several attachments.
// - `chat_threads.unread` is a single boolean, not a per-participant
//   read state. It's used here as "does staff have something new to
//   read" (set true on every customer message, cleared when a staff
//   member opens the thread). The customer's own "new reply" badge is
//   computed separately client-side — see ChatContext's unreadCount.
//
// ── Realtime diagnostics (added) ─────────────────────────────────────
// subscribeToThreadMessages and subscribeToAllMessages now take an
// optional onStatus callback and log every status transition by
// default. If live sync breaks again, check the console for:
//   - Stuck on "SUBSCRIBING" / never reaches "SUBSCRIBED": usually RLS
//     erroring outright, or the role lacks SELECT on the table.
//   - "SUBSCRIBED" but onInsert never fires when the other side sends
//     a message: the row is being delivered-then-filtered by RLS for
//     this session (policy scoped to sender instead of thread owner),
//     or `chat_messages`/`chat_threads` were never added to the
//     `supabase_realtime` publication (Dashboard > Database >
//     Replication, or run the accompanying fix_chat_realtime.sql).
//   - "CHANNEL_ERROR" / "TIMED_OUT": network issue, or Realtime
//     disabled at the project level. Auto-resubscribe (below) retries
//     once after a short delay; if it fails again it gives up rather
//     than looping forever.

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

// The real chat_sender Postgres enum on this project is
// ('customer', 'ops') — NOT 'staff'. This type (and every literal
// throughout the codebase that writes/reads a real chat_messages row)
// must match that exactly, or every staff-authored insert fails with
// "invalid input value for enum chat_sender" and every staff-authored
// row silently gets mis-read as if it came from the customer. The
// user-facing label "Staff" shown in the UI is unrelated to this and
// doesn't need to change — this is purely the literal value stored in
// the database column. (contexts/AdminDataContext.tsx's separate MOCK
// ChatSender type in types/admin.ts is untouched by this — that one only
// ever holds local UI state and never round-trips through this enum
// directly; see requests-admin.ts for the one place that translates
// between the two.)
export type ChatSender = 'customer' | 'ops'

export type ChatMessageRow = Database['public']['Tables']['chat_messages']['Row']
export type ChatThreadRow = Database['public']['Tables']['chat_threads']['Row']

const REPLY_MARK = '\u21aa\ufe0f replying to: '

/** Bakes a quoted snippet into the message body as plain text — see the
 * module doc comment for why this isn't a real relation. */
export function buildReplyBody(quotedText: string, ownText: string): string {
  const snippet = quotedText.trim().slice(0, 140).replace(/\n/g, ' ')
  return `${REPLY_MARK}${snippet}\n${ownText}`
}

/** Splits a message body back into { quoted, text } if it was built by
 * buildReplyBody, otherwise returns { quoted: null, text: body }. */
export function parseReplyBody(body: string): { quoted: string | null; text: string } {
  if (!body.startsWith(REPLY_MARK)) return { quoted: null, text: body }
  const newlineIndex = body.indexOf('\n')
  if (newlineIndex === -1) return { quoted: null, text: body }
  return {
    quoted: body.slice(REPLY_MARK.length, newlineIndex),
    text: body.slice(newlineIndex + 1),
  }
}

export function inferAttachmentKind(url: string): 'image' | 'video' {
  const clean = url.split('?')[0].toLowerCase()
  return /\.(mp4|webm|mov|m4v|avi|ogv)$/.test(clean) ? 'video' : 'image'
}

const CHAT_ATTACHMENTS_BUCKET = 'chat-attachments'
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024 // 8MB

/**
 * Uploads one file to the `chat-attachments` Storage bucket and returns
 * its public URL. That bucket has to exist in the Supabase project (this
 * code can't create it) — Storage > New bucket > name it exactly
 * `chat-attachments` > Public. Without it every attachment send will
 * fail with a "Bucket not found" error surfaced to the composer's error
 * state, not a silent failure.
 */
export async function uploadChatAttachment(
  supabase: SupabaseClient,
  threadId: string,
  file: File,
): Promise<string> {
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error(`${file.name} is larger than 8MB`)
  if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
    throw new Error(`${file.name} isn't an image or video`)
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${threadId}/${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`
  const { error } = await supabase.storage.from(CHAT_ATTACHMENTS_BUCKET).upload(path, file)
  if (error) throw error
  const { data } = supabase.storage.from(CHAT_ATTACHMENTS_BUCKET).getPublicUrl(path)
  return data.publicUrl
}

/** Finds this user's general support thread (no request/order attached),
 * creating it on first contact. Used as the guaranteed fallback by
 * getMostRecentOrGeneralThread below when the user has no thread at all
 * yet. Per-request threads are created separately at request-submission
 * time (see DashboardContext's confirmRequest).
 *
 * FIX: was `.maybeSingle()` on the filtered find query, which throws
 * PGRST116 ("multiple (or no) rows returned") the instant a user
 * already has more than one general thread (request_id/order_id both
 * null) — exactly the failure mode getMostRecentOrGeneralThread's own
 * doc comment below describes having fixed, except that fix was only
 * ever applied there, not here, even though this function has the same
 * shape of query and is what that one calls as its fallback. Any user
 * with a legacy duplicate (or one created by a past race between two
 * concurrent getOrCreateGeneralThread calls both missing the "not
 * found yet" window) hit a hard failure on literally every future
 * unpriced/Channel-3 request — confirmRequest calls this directly, so
 * there was no fallback once it started throwing. Same fix as that
 * function: order + limit(1) can never return more than one row, so
 * `.maybeSingle()` on it can never throw PGRST116, only genuinely
 * return null when there's no row at all.
 */
export async function getOrCreateGeneralThread(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data: existing, error: findError } = await supabase
    .from('chat_threads')
    .select('id')
    .eq('user_id', userId)
    .is('request_id', null)
    .is('order_id', null)
    .order('last_activity', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (findError) throw findError
  if (existing) return existing.id

  const { data: created, error: createError } = await supabase
    .from('chat_threads')
    .insert({ user_id: userId })
    .select('id')
    .single()
  if (createError) throw createError
  return created.id
}

/**
 * The thread the customer-facing chat view (floating widget,
 * /account/messages) actually loads: whichever of the user's threads
 * was active most recently, general or request-linked. This is what
 * makes a freshly created Channel 3 request (see DashboardContext's
 * confirmRequest) show up as "the chat" the moment the customer lands
 * on /account/messages — its thread's last_activity is newer than the
 * general thread's, so it naturally surfaces first, no thread-switching
 * UI needed. Falls back to the general thread (creating it if this is a
 * first-time visitor with no threads at all).
 *
 * This also replaces the old resolveGeneralThreadId's "multiple general
 * threads" workaround (see git history) — ordering by last_activity and
 * taking the top row can never throw PGRST116 the way a filtered
 * `.single()` lookup could, so that whole failure mode is gone, not just
 * caught.
 */
export async function getMostRecentOrGeneralThread(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from('chat_threads')
    .select('id')
    .eq('user_id', userId)
    .order('last_activity', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (data) return data.id
  return getOrCreateGeneralThread(supabase, userId)
}

export async function fetchThreadMessages(supabase: SupabaseClient, threadId: string): Promise<ChatMessageRow[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

/** How many messages a single fetch pulls, both for the initial load and
 * each "load older" page. 100 balances "enough history to feel like a
 * real conversation" against not dragging in a year of messages just to
 * open the thread. */
export const MESSAGES_PAGE_SIZE = 100

/**
 * The real initial load for a thread — the most recent MESSAGES_PAGE_SIZE
 * messages, oldest-first for display. Replaces the old unbounded
 * fetchThreadMessages (still exported above for anything that
 * genuinely wants full history) as what both ChatContext and the admin
 * chat page actually call: a thread with hundreds or thousands of
 * messages used to have no limit at all, which meant Supabase's own
 * project-level "Max Rows" cap (Settings > API, 1000 by default) would
 * silently truncate the query — and since the old query ordered
 * ascending, that cap kept the OLDEST messages and silently dropped
 * everything more recent. This fetches descending (newest first) so the
 * cap, if it ever mattered, would protect the right end of the
 * conversation, then reverses for display order.
 *
 * `hasMore: true` means there's more history above what's returned —
 * the UI should offer "load older messages" (see
 * fetchOlderThreadMessages below) rather than assume this is
 * everything.
 */
export async function fetchRecentThreadMessages(
  supabase: SupabaseClient,
  threadId: string,
  limit: number = MESSAGES_PAGE_SIZE,
): Promise<{ messages: ChatMessageRow[]; hasMore: boolean }> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(limit + 1) // one extra row is the cheapest way to know if there's more without a separate count query
  if (error) throw error
  const rows = data ?? []
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  return { messages: page.reverse(), hasMore }
}

/**
 * The next page "up" — older messages than whatever's currently loaded.
 * Cursor-based on the oldest currently-loaded message's created_at
 * (pass `oldestLoaded.createdAt`), not an offset — offset pagination on
 * a table that gets new rows constantly (this one does, in realtime)
 * can skip or duplicate rows as they shift under you; a timestamp
 * cursor can't.
 */
export async function fetchOlderThreadMessages(
  supabase: SupabaseClient,
  threadId: string,
  beforeCreatedAt: string,
  limit: number = MESSAGES_PAGE_SIZE,
): Promise<{ messages: ChatMessageRow[]; hasMore: boolean }> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('thread_id', threadId)
    .lt('created_at', beforeCreatedAt)
    .order('created_at', { ascending: false })
    .limit(limit + 1)
  if (error) throw error
  const rows = data ?? []
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  return { messages: page.reverse(), hasMore }
}

/** Inserts one message and bumps the thread's last_activity (+ unread
 * flag when the sender is the customer — see the module doc comment). */
export async function sendChatMessage(
  supabase: SupabaseClient,
  params: {
    threadId: string
    sender: ChatSender
    senderName: string
    text: string
    attachmentUrl?: string | null
    /** Tags this message to a Channel 3 request (chat_messages.request_id) — shown as a visible tag in the admin chat view (see wishdrop-admin-route-specs.md's /admin/chat spec). Used for the initial message a request is created with, and for any staff/customer follow-up while that request is still open. */
    requestId?: string | null
  },
): Promise<ChatMessageRow> {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      thread_id: params.threadId,
      sender: params.sender,
      sender_name: params.senderName,
      text: params.text || null,
      attachment_url: params.attachmentUrl ?? null,
      request_id: params.requestId ?? null,
    })
    .select('*')
    .single()
  if (error) throw error

  await supabase
    .from('chat_threads')
    .update({
      last_activity: new Date().toISOString(),
      ...(params.sender === 'customer' ? { unread: true } : {}),
    })
    .eq('id', params.threadId)

  return data
}

/** Staff-only moderation: clears one message's attachment. Just nulls
 * the column — doesn't delete the underlying Storage object here.
 * That's intentional: the weekly DB-side sweep
 * (data/wishdrop-storage-reconciliation-views.sql, run entirely via
 * pg_cron/pg_net) reads exactly this column to decide what's still
 * referenced, so the moment this goes null the file naturally shows up
 * as orphaned on the next scheduled run and gets cleaned up there —
 * no app-side Storage call needed. Trade-off: the file sits for up to a
 * week instead of disappearing instantly, in exchange for this staying
 * a plain column update with no Storage dependency at all. */
export async function removeMessageAttachment(supabase: SupabaseClient, messageId: string): Promise<void> {
  const { error } = await supabase.from('chat_messages').update({ attachment_url: null }).eq('id', messageId)
  if (error) throw error
}

export async function markThreadRead(supabase: SupabaseClient, threadId: string): Promise<void> {
  await supabase.from('chat_threads').update({ unread: false }).eq('id', threadId)
}

type RealtimeStatus = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED'

/** Shared subscribe helper — generic enough to use for any Postgres
 * changes subscription, not just chat. Logs every status transition
 * (prefixed so it's easy to grep in the console) and retries exactly
 * once, after a short delay, if the channel errors out or times out —
 * covers the case where the underlying websocket drops due to a token
 * refresh or a flaky network blip. If the retry also fails, it gives up
 * and logs loudly rather than retrying forever. */
export function subscribeWithDiagnostics(
  supabase: SupabaseClient,
  label: string,
  buildChannel: () => RealtimeChannel,
  onStatus?: (status: RealtimeStatus) => void,
): () => void {
  let channel: RealtimeChannel | null = null
  let retried = false
  let cancelled = false

  const start = () => {
    channel = buildChannel()
    channel.subscribe((status: string, err?: Error) => {
      console.log(`[realtime:${label}]`, status, err ?? '')
      onStatus?.(status as RealtimeStatus)

      if (cancelled) return

      if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !retried) {
        retried = true
        console.warn(`[realtime:${label}] connection dropped, retrying once in 1.5s…`)
        if (channel) supabase.removeChannel(channel)
        setTimeout(() => {
          if (!cancelled) start()
        }, 1500)
      } else if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && retried) {
        console.error(
          `[realtime:${label}] failed again after retry — live sync is down for this subscription. ` +
            `Check Dashboard > Database > Replication (is the table added to supabase_realtime?) ` +
            `and RLS SELECT policies on the table (is this session's row visible via the policy?).`,
        )
      }
    })
  }

  start()

  return () => {
    cancelled = true
    if (channel) supabase.removeChannel(channel)
  }
}

/** Realtime subscription for new messages in one thread. Requires
 * Realtime to be enabled for the chat_messages table in the Supabase
 * dashboard (Database > Replication) — without that this simply never
 * fires and messages only show up on next manual refetch. Also requires
 * an RLS SELECT policy that lets this session see rows regardless of
 * which side (`customer` or `ops`) sent them — see fix_chat_realtime.sql.
 *
 * Topic includes a random suffix, not just the thread id. Supabase-js
 * caches channels by topic string — if a component unmounts and
 * remounts fast (React StrictMode, Fast Refresh, rapid thread
 * switching), the old channel's `removeChannel()` call is async and may
 * not have finished server-side before the new subscription tries to
 * `.channel(sameTopic)` again. That hands back the already-subscribed
 * instance, and calling `.on(...)` on an already-subscribed channel
 * throws "cannot add postgres_changes callbacks ... after subscribe()".
 * A unique suffix per call means there's never a topic to collide on in
 * the first place. */
export function subscribeToThreadMessages(
  supabase: SupabaseClient,
  threadId: string,
  onInsert: (row: ChatMessageRow) => void,
  onStatus?: (status: RealtimeStatus) => void,
): () => void {
  return subscribeWithDiagnostics(
    supabase,
    `thread:${threadId}`,
    () => {
      const topic = `chat_messages:${threadId}:${Math.random().toString(36).slice(2)}`
      return supabase.channel(topic).on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `thread_id=eq.${threadId}` },
        (payload) => onInsert(payload.new as ChatMessageRow),
      )
    },
    onStatus,
  )
}

/** Inbox-wide realtime subscription (staff only) — unfiltered INSERT on
 * chat_messages, used to keep the admin thread strip's preview/ordering
 * live for threads that aren't currently open. Requires an RLS SELECT
 * policy on chat_messages that grants staff visibility across every
 * thread, not just ones tied to their own user id — see the "staff
 * select all messages" policy in fix_chat_realtime.sql. Without that
 * policy this subscribes successfully (status: SUBSCRIBED) but silently
 * receives nothing for threads belonging to other customers. */
export function subscribeToAllMessages(
  supabase: SupabaseClient,
  onInsert: (row: ChatMessageRow) => void,
  onStatus?: (status: RealtimeStatus) => void,
): () => void {
  return subscribeWithDiagnostics(
    supabase,
    'admin-inbox',
    () => {
      const topic = `chat_messages:admin-inbox:${Math.random().toString(36).slice(2)}`
      return supabase
        .channel(topic)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) =>
          onInsert(payload.new as ChatMessageRow),
        )
    },
    onStatus,
  )
}