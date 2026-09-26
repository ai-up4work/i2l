-- data/wishdrop-chat-message-retag.sql
--
-- Staff can re-tag any chat message from the admin inbox (/admin/chat):
-- point it at a different order or request, or clear the tag. The tag
-- itself is chat_messages.order_id / request_id as before; these columns
-- only record WHO changed it, WHEN, and what the message was ORIGINALLY
-- tagged with (kept from the first edit, never overwritten), so a wrong
-- re-tag can always be traced and undone.
--
-- Writes go through /api/admin/chat/messages/[messageId]/tag (service
-- role, staff-only, checks the order/request belongs to that customer).
--
-- Idempotent — safe to run more than once.

alter table public.chat_messages
  add column if not exists tag_edited_by uuid references public.staff_accounts(id) on delete set null,
  add column if not exists tag_edited_by_name text,
  add column if not exists tag_edited_at timestamptz,
  add column if not exists original_order_id uuid references public.orders(id) on delete set null,
  add column if not exists original_request_id uuid references public.requests(id) on delete set null,
  -- true once edited, so "originally untagged" is distinguishable from
  -- "never edited" (both have null original_* ids).
  add column if not exists tag_edited boolean not null default false;

create index if not exists chat_messages_request_id_created_at
  on public.chat_messages (request_id, created_at);
