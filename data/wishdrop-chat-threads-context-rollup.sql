-- data/Wishdrop-chat-threads-context-rollup.sql
--
-- WHY: chat_messages already carries request_id/order_id per message
-- (see lib/supabase/chat.ts's sendChatMessage) — that's how the order
-- detail page's and request detail page's own mini chat panels filter
-- down to "just this record's messages" via fetchOrderMessages /
-- fetchRequestMessages. But the main admin inbox (/admin/chat)'s
-- thread LIST has no cheap way to know "what has this thread touched"
-- without scanning every message in every thread on every load.
--
-- chat_threads.request_id/order_id (already on the table) can't answer
-- this either: since the "reuse one thread per customer" fix, a
-- customer has ONE persistent thread for their whole lifetime, and that
-- thread-level pair was only ever set at thread-CREATION time — it's
-- null for essentially every thread going forward, even though
-- individual messages inside it are very much tagged.
--
-- FIX: two small rollup columns, kept current by sendChatMessage()
-- itself (same write, no extra round trip) whenever a tagged message
-- comes in. Cheap to maintain, cheap to read, and exactly what the
-- inbox list needs: "what's the most recent thing this thread was
-- about" — not "everything it's ever touched" (that's still a
-- chat_messages query, for the rare case you actually need it).

alter table public.chat_threads
  add column if not exists last_request_id uuid references public.requests(id) on delete set null,
  add column if not exists last_order_id uuid references public.orders(id) on delete set null;

-- Backfill from each thread's own most recent tagged message, so
-- existing threads aren't blank until their next message.
update public.chat_threads t
set
  last_request_id = latest.request_id,
  last_order_id = latest.order_id
from (
  select distinct on (thread_id)
    thread_id,
    request_id,
    order_id
  from public.chat_messages
  where request_id is not null or order_id is not null
  order by thread_id, created_at desc
) latest
where latest.thread_id = t.id;

-- Cheap filters for the inbox ("Has open request" / "Has active order")
-- read straight off these, no join needed.
create index if not exists chat_threads_last_request_id_idx on public.chat_threads (last_request_id) where last_request_id is not null;
create index if not exists chat_threads_last_order_id_idx on public.chat_threads (last_order_id) where last_order_id is not null;
