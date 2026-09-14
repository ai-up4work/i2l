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
 * creating it on first contact. Per-request threads are created
 * separately at request-submission time (see DashboardContext's
 * confirmRequest) and are surfaced only in the admin console, not here —
 * the floating widget and /account/messages are the general-support
 * line, not a per-request inbox. */
export async function getOrCreateGeneralThread(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data: existing, error: findError } = await supabase
    .from('chat_threads')
    .select('id')
    .eq('user_id', userId)
    .is('request_id', null)
    .is('order_id', null)
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

export async function fetchThreadMessages(supabase: SupabaseClient, threadId: string): Promise<ChatMessageRow[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

/** Inserts one message and bumps the thread's last_activity (+ unread
 * flag when the sender is the customer — see the module doc comment). */
export async function sendChatMessage(
  supabase: SupabaseClient,
  params: { threadId: string; sender: ChatSender; senderName: string; text: string; attachmentUrl?: string | null },
): Promise<ChatMessageRow> {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      thread_id: params.threadId,
      sender: params.sender,
      sender_name: params.senderName,
      text: params.text || null,
      attachment_url: params.attachmentUrl ?? null,
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

/** Staff-only moderation: clears one message's attachment without
 * deleting the row (matches the old mock's own documented tradeoff —
 * the Storage object itself is left behind rather than also deleting
 * it, since another message could in principle reuse an identical
 * upload path... in practice this just mirrors what the mock already
 * accepted for IndexedDB orphans). */
export async function removeMessageAttachment(supabase: SupabaseClient, messageId: string): Promise<void> {
  const { error } = await supabase.from('chat_messages').update({ attachment_url: null }).eq('id', messageId)
  if (error) throw error
}

export async function markThreadRead(supabase: SupabaseClient, threadId: string): Promise<void> {
  await supabase.from('chat_threads').update({ unread: false }).eq('id', threadId)
}

type RealtimeStatus = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED'

/** Shared subscribe helper. Logs every status transition (prefixed so
 * it's easy to grep in the console) and retries exactly once, after a
 * short delay, if the channel errors out or times out — covers the
 * case where the underlying websocket drops due to a token refresh or
 * a flaky network blip. If the retry also fails, it gives up and logs
 * loudly rather than retrying forever. */
function subscribeWithDiagnostics(
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