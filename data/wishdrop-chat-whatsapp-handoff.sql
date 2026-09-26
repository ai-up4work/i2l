-- data/Wishdrop-chat-whatsapp-handoff.sql
--
-- "Send to WhatsApp" from the admin inbox (/admin/chat), without the Meta
-- API: staff open a wa.me link that pre-fills the customer's verified
-- number and a message, and press Send in their own WhatsApp (Business
-- app / WhatsApp Web). We can't see whether they actually pressed Send,
-- so everything here records that a staff member OPENED the message in
-- WhatsApp — who, when, and exactly what text.
--
-- Idempotent — safe to run more than once.

-- Per message: marks staff messages that were forwarded to WhatsApp.
-- (sent_via_whatsapp already exists — see Wishdrop-supabase-schema.sql.)
alter table public.chat_messages
  add column if not exists whatsapp_sent_by uuid references public.staff_accounts(id) on delete set null,
  add column if not exists whatsapp_sent_by_name text,
  add column if not exists whatsapp_sent_at timestamptz;

-- Per conversation: last reminder, so two staff don't both remind the
-- same customer.
alter table public.chat_threads
  add column if not exists last_whatsapp_reminder_at timestamptz,
  add column if not exists last_whatsapp_reminder_by_name text;

-- Full log of every hand-off (message forwards and reminders).
create table if not exists public.chat_whatsapp_handoffs (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  kind text not null check (kind in ('messages', 'reminder')),
  message_ids uuid[] not null default '{}',
  phone text not null,
  text text not null,
  link text,
  staff_id uuid references public.staff_accounts(id) on delete set null,
  staff_name text,
  created_at timestamptz not null default now()
);

create index if not exists chat_whatsapp_handoffs_thread
  on public.chat_whatsapp_handoffs (thread_id, created_at desc);

-- Written and read only through /api/admin/chat/threads/[threadId]/whatsapp
-- (service role). No policies = no direct client access.
alter table public.chat_whatsapp_handoffs enable row level security;
