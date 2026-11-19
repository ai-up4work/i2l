-- data/wishdrop-chat-welcome.sql
--
-- Welcome messages for new customers (POST /api/account/chat/welcome).
--
-- profiles.chat_welcomed_at   when we sent (or decided not to send) the welcome,
--                             so it happens exactly once per customer.
-- chat_messages.is_automated  true for messages Wishdrop sends by itself
--                             (welcome, phone request), so they can be told
--                             apart from a real staff reply later.
--
-- Customers who already have any chat message are marked as welcomed, so
-- only genuinely new customers get it. Safe to run more than once.

alter table public.profiles
  add column if not exists chat_welcomed_at timestamptz;

alter table public.chat_messages
  add column if not exists is_automated boolean not null default false;

update public.profiles p
   set chat_welcomed_at = now()
 where p.chat_welcomed_at is null
   and exists (
     select 1
       from public.chat_messages m
       join public.chat_threads t on t.id = m.thread_id
      where t.user_id = p.id
   );

notify pgrst, 'reload schema';
