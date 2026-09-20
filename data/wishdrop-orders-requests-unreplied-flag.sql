-- data/wishdrop-orders-requests-unreplied-flag.sql
--
-- WHY: chat_threads.unread already exists, but it's thread-wide — a
-- single customer thread can carry many orders and requests over their
-- lifetime, so "this thread has something unread" doesn't tell you
-- WHICH order or request actually needs attention. The Orders queue,
-- Requests queue, and each order/request's own detail page all need a
-- per-record answer to "does the customer's last word on THIS one still
-- need a reply", not a thread-wide one.
--
-- Same pattern as chat_threads.unread itself: a boolean, flipped true
-- the moment a CUSTOMER message tagged to this order/request lands, and
-- flipped false the moment an OPS message tagged to it goes out. Kept
-- current by sendChatMessage() in lib/supabase/chat.ts — the single
-- write path for every chat message, customer or staff — exactly the
-- same place that already maintains chat_threads.unread and the
-- last_request_id/last_order_id rollup.
--
-- "Unreplied" here specifically means: the last message TAGGED to this
-- order/request was from the customer with no ops reply after it via
-- that same tag. A customer message with no tag at all (general chat)
-- doesn't set this — it's chat_threads.unread's job, not this one's.

alter table public.orders
  add column if not exists has_unreplied_message boolean not null default false;

alter table public.requests
  add column if not exists has_unreplied_message boolean not null default false;

-- Backfill: for every order/request, look at the single most recent
-- message tagged to it (if any) and set the flag from that message's
-- sender.
update public.orders o
set has_unreplied_message = (latest.sender = 'customer')
from (
  select distinct on (order_id) order_id, sender
  from public.chat_messages
  where order_id is not null
  order by order_id, created_at desc
) latest
where latest.order_id = o.id;

update public.requests r
set has_unreplied_message = (latest.sender = 'customer')
from (
  select distinct on (request_id) request_id, sender
  from public.chat_messages
  where request_id is not null
  order by request_id, created_at desc
) latest
where latest.request_id = r.id;

-- Cheap "does anything in this queue need attention" checks (sidebar /
-- listing badges) read straight off these, no join needed.
create index if not exists orders_has_unreplied_message_idx on public.orders (has_unreplied_message) where has_unreplied_message;
create index if not exists requests_has_unreplied_message_idx on public.requests (has_unreplied_message) where has_unreplied_message;
