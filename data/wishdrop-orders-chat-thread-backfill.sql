-- data/Wishdrop-orders-chat-thread-backfill.sql
--
-- One-time repair: link every order that has no chat thread
-- (orders.chat_thread_id is null) to the right conversation.
--
-- Why they exist: orders created before every order got a thread at
-- creation, and orders from the "paste a link → priced → confirm" flow
-- (fixed in contexts/DashboardContext.tsx confirmRequest). The admin order
-- page also repairs these one at a time when opened; this does them all
-- at once so "review before send" customer messages (QC flagged, shipped,
-- delivered…) work for every order.
--
-- Same rules as /api/admin/orders/[orderId]/chat-thread, in order:
--   1. the thread that messages tagged to the order were sent in;
--   2. the thread of the request the order came from;
--   3. the customer's most recently active thread;
--   4. a new thread for customers who have none.
-- Only fills empty links. Safe to run more than once.

begin;

-- 1. Where the customer has been talking about this order.
update public.orders o
set chat_thread_id = m.thread_id
from (
  select distinct on (order_id) order_id, thread_id
  from public.chat_messages
  where order_id is not null
  order by order_id, created_at desc
) m
where m.order_id = o.id
  and o.chat_thread_id is null;

-- 2. The request this order came from.
update public.orders o
set chat_thread_id = r.chat_thread_id
from public.requests r
where o.request_id = r.id
  and o.chat_thread_id is null
  and r.chat_thread_id is not null;

-- 3. The customer's most recently active thread.
update public.orders o
set chat_thread_id = (
  select t.id from public.chat_threads t
  where t.user_id = o.user_id
  order by t.last_activity desc
  limit 1
)
where o.chat_thread_id is null
  and exists (select 1 from public.chat_threads t where t.user_id = o.user_id);

-- 4. Customers with no conversation at all: start one, then link it.
insert into public.chat_threads (user_id, unread)
select distinct o.user_id, false
from public.orders o
where o.chat_thread_id is null;

update public.orders o
set chat_thread_id = (
  select t.id from public.chat_threads t
  where t.user_id = o.user_id
  order by t.last_activity desc
  limit 1
)
where o.chat_thread_id is null;

commit;

-- Check — should return 0:
--   select count(*) from public.orders where chat_thread_id is null;
