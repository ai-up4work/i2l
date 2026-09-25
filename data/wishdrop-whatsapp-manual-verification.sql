-- data/wishdrop-whatsapp-manual-verification.sql
--
-- Staff-reviewed WhatsApp number verification (no Meta API, no templates).
--
-- Flow:
--   1. Customer enters their number on My Profile → a request row is
--      created here with a short reference code (e.g. WD-7K3D9Q).
--   2. They tap "Verify on WhatsApp", which opens WhatsApp with a
--      pre-written message (reference, name, chat handle, email, number)
--      addressed to the WishDrop business number, and they send it.
--   3. Staff open /admin/whatsapp-verifications, find that message in the
--      WhatsApp app, check it was sent FROM the claimed number (WhatsApp
--      shows the real sender), and Verify or Reject.
--   4. Verify writes the number to profiles.phone + auth.users.phone
--      (phone_confirm) — the same two places the old OTP flow wrote — so
--      everything that reads "verified number" keeps working unchanged.
--
-- Idempotent — safe to run more than once.

create table if not exists public.whatsapp_verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- The number the customer typed (E.164, e.g. +94771234567).
  phone text not null,
  -- Short code included in the WhatsApp message so staff can match it.
  reference text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'rejected', 'cancelled')),
  -- The number staff actually confirmed. Usually = phone; differs when
  -- the message came from another number and staff attached that one.
  verified_phone text,
  reject_reason text,
  decided_by uuid references public.staff_accounts(id) on delete set null,
  decided_by_name text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

-- At most one open request per customer.
create unique index if not exists whatsapp_verification_one_pending
  on public.whatsapp_verification_requests (user_id)
  where status = 'pending';

create index if not exists whatsapp_verification_status_created
  on public.whatsapp_verification_requests (status, created_at desc);

alter table public.whatsapp_verification_requests enable row level security;

-- Customers can read their own requests (status on My Profile). All
-- writes go through the API routes with the service role.
drop policy if exists "own whatsapp verification requests read" on public.whatsapp_verification_requests;
create policy "own whatsapp verification requests read" on public.whatsapp_verification_requests
  for select using (auth.uid() = user_id);
