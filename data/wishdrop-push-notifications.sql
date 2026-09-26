-- data/Wishdrop-push-notifications.sql
--
-- Web push notifications: device subscriptions, the customer's "offers"
-- preference, broadcast history, and the trigger that pushes every staff
-- chat message to the customer.
--
-- Idempotent — safe to run more than once.
--
-- ─── ONE-TIME SETUP (run once, in the Supabase SQL editor) ─────────────
--
-- 1. pg_net is already enabled if you ran
--    Wishdrop-storage-reconciliation-views.sql; if not:
--
--      create extension if not exists pg_net;
--
-- 2. Store the app URL and a shared secret in Vault. The secret must match
--    PUSH_WEBHOOK_SECRET on Vercel (any long random string, e.g. the output
--    of `openssl rand -hex 32`). Use your PRODUCTION URL, no trailing slash:
--
--      select vault.create_secret('https://www.Wishdrop.shop', 'Wishdrop_app_url');
--      select vault.create_secret('<same value as PUSH_WEBHOOK_SECRET>', 'Wishdrop_push_webhook_secret');
--
--    To change one later:
--      select vault.update_secret(
--        (select id from vault.secrets where name = 'Wishdrop_push_webhook_secret'),
--        '<new value>');
--
-- Until both secrets exist the trigger silently does nothing, so running
-- this file first is harmless.
-- ───────────────────────────────────────────────────────────────────────


-- ─── Device subscriptions ──────────────────────────────────────────────
-- One row per browser/device a customer has turned notifications on for.
-- `endpoint` is unique per device: if someone else signs in on the same
-- device, the row is reassigned to them (see /api/push/subscribe).

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  failure_count integer not null default 0
);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Customers can see and remove their own devices. Inserts/updates go
-- through /api/push/subscribe with the service role (needed to reassign a
-- shared device between accounts), so there is no insert policy.
drop policy if exists "own push subscriptions read" on public.push_subscriptions;
create policy "own push subscriptions read" on public.push_subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists "own push subscriptions delete" on public.push_subscriptions;
create policy "own push subscriptions delete" on public.push_subscriptions
  for delete using (auth.uid() = user_id);


-- ─── Customer preference ───────────────────────────────────────────────
-- Offers/promotional broadcasts respect this. Chat replies and service
-- announcements (delays, closures) don't — those are part of the service.

alter table public.profiles
  add column if not exists push_offers boolean not null default true;


-- ─── Broadcast history ─────────────────────────────────────────────────
-- Written only by /api/admin/push/broadcast (service role). No RLS
-- policies on purpose: nothing client-side reads this table directly.

create table if not exists public.push_broadcasts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('announcement', 'offer')),
  title text not null,
  body text not null,
  url text not null default '/',
  audience jsonb not null,
  audience_label text not null,
  created_by uuid references public.staff_accounts(id) on delete set null,
  created_by_name text,
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  recipient_count integer not null default 0,   -- customers who got an in-app notification
  device_count integer not null default 0,      -- devices a push was attempted to
  push_sent integer not null default 0,
  push_failed integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists push_broadcasts_created_at_idx on public.push_broadcasts (created_at desc);

alter table public.push_broadcasts enable row level security;


-- ─── Push every staff chat message to the customer ─────────────────────
-- Fires for ANY non-customer message, however it was written (admin
-- inbox, request/order/QC drawers, SendMessageModal, anything added
-- later), so no send path can forget to notify.
--
-- `sender::text <> 'customer'` rather than `= 'ops'`: the reference
-- schema declares the enum as ('customer','staff') while the live
-- database uses ('customer','ops') — this matches either.

create or replace function public.push_on_staff_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  app_url text;
  push_secret text;
begin
  select decrypted_secret into app_url
    from vault.decrypted_secrets where name = 'Wishdrop_app_url' limit 1;
  select decrypted_secret into push_secret
    from vault.decrypted_secrets where name = 'Wishdrop_push_webhook_secret' limit 1;

  -- Not configured yet: do nothing rather than fail the chat insert.
  if app_url is null or push_secret is null then
    return new;
  end if;

  -- pg_net is asynchronous: the request is queued and sent after this
  -- transaction commits, so a slow or failing push never delays or
  -- breaks the message itself.
  perform net.http_post(
    url := rtrim(app_url, '/') || '/api/push/chat-message',
    body := jsonb_build_object('messageId', new.id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', push_secret
    ),
    timeout_milliseconds := 8000
  );

  return new;
exception when others then
  -- Never let a notification problem block a staff reply.
  raise warning 'push_on_staff_chat_message failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists push_on_staff_chat_message on public.chat_messages;
create trigger push_on_staff_chat_message
  after insert on public.chat_messages
  for each row
  when (new.sender::text <> 'customer')
  execute function public.push_on_staff_chat_message();


-- ─── Troubleshooting ───────────────────────────────────────────────────
-- Recent trigger calls and the app's responses (status 200 = delivered to
-- the app; the JSON body says how many devices were pushed):
--
--   select id, status_code, content::text, created
--   from net._http_response order by created desc limit 20;
