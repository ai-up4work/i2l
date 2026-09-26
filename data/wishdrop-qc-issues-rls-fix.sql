-- data/Wishdrop-qc-issues-rls-fix.sql
--
-- Same root cause as Wishdrop-admin-orders-rls-fix.sql and
-- Wishdrop-admin-requests-chat-rls-fix.sql, applied to the tables the
-- QC-fault flow depends on: lib/supabase/qc-issues.ts is called directly
-- from 'use client' admin pages (app/admin/(warehouse)/qc/[id]/page.tsx,
-- app/admin/(warehouse)/qc-issues/[issueId]/page.tsx) using the browser
-- Supabase client — same as any customer page — because, same as the
-- other two fixes, there's no real staff authentication wired up yet.
-- Whichever Supabase Auth session happens to be active in that admin
-- browser tab is a STAFF session, not the customer's own — so any write
-- gated on "auth.uid() = user_id" (the default "own row" policy this
-- schema gives every customer-owned table) is written on behalf of a
-- user_id that will never equal the staff member's own auth.uid().
-- Concretely, until this is applied:
--   - Flagging an item on /admin/qc/[id] (createQcIssue) fails to
--     insert into order_item_issues — "new row violates row-level
--     security policy" (the exact error reported).
--   - Recording the seller-refund outcome (setSellerRefundOutcome) and
--     marking the WhatsApp message sent (markQcIssueWhatsappSent) fail
--     to update that same row for the same reason.
--   - Issuing a compensation coupon (issueCompensationCoupon) fails to
--     insert into personal_coupons — the coupon is for the customer,
--     written by staff.
--   - Every notification this flow sends (coupon issued, shipped as-is,
--     retry) fails to insert into notifications for the same reason.
--
-- Assumed existing policies (not shown in the schema dump, which only
-- includes CREATE TABLE statements — inferred from the same "own X"
-- naming/shape every other customer-owned table in this schema uses):
--
--   create policy "own qc issues" on public.order_item_issues
--     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
--   create policy "own coupons" on public.personal_coupons
--     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
--   create policy "own notifications" on public.notifications
--     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
--
-- If your actual policy names differ, adjust the `drop policy if exists`
-- lines below to match — the `create policy` statements are what
-- actually matters.
--
-- INTERIM FIX (this file): widen every one of these to any authenticated
-- session, same reasoning and same caveat as the other two fixes — this
-- is NOT a real access-control layer, it's the minimum change to
-- unblock the QC-fault flow today, given there's no staff-auth-aware
-- policy or service-role server route in front of these tables yet.
-- Revisit before this goes anywhere near production with real customer
-- data — a widened policy here means any authenticated customer session
-- (e.g. poking the network tab) could also flag issues, issue coupons to
-- themselves, or write notifications, not just staff.
--
-- REAL FIX, later: same two options as the other two files — (a) move
-- these writes behind a server-side API route using
-- createServiceRoleClient() from lib/supabase/server.ts (bypasses RLS
-- entirely, matches the schema's original intent — see that file's own
-- doc comment), which the admin QC pages would call instead of importing
-- lib/supabase/qc-issues.ts's browser-client functions directly; or
-- (b) give staff_accounts a matching auth.users row and write a policy
-- that checks staff_accounts instead of "any authenticated user".
--
-- RUNNING THIS: if your SQL editor executes the whole file as one
-- script/transaction, a concurrent process touching the same tables
-- (another editor tab, Supabase Studio's own background schema refresh,
-- PostgREST reloading its cache after a prior DDL statement) can
-- deadlock against these locks — Postgres will abort one side with
-- error 40P01 "deadlock detected". That's a transient race, not a
-- problem with the statements themselves: re-running the same script
-- usually succeeds outright once the other process has moved on. The
-- `lock_timeout` below makes a retry fail fast and clearly (a plain
-- timeout error) instead of potentially deadlocking again.
--
-- Because this script isn't wrapped in an explicit BEGIN/COMMIT, a
-- deadlock partway through leaves whatever ran BEFORE the failing
-- statement already committed — so a retry can legitimately hit
-- "policy ... already exists" on a table whose block already succeeded
-- last time, not because anything is broken. Every block below drops
-- both the assumed original policy name and the new widened name before
-- creating it, specifically so the whole script is safe to run from the
-- top as many times as needed regardless of how far a previous attempt
-- got. Each table's DROP+CREATE pair is also independent, so you can
-- always copy-paste and run just one block on its own if you'd rather
-- shrink the blast radius further.

set lock_timeout = '10s';

-- Each block drops BOTH the assumed original policy name and the new
-- widened name before creating — not just the original — so this is
-- safe to re-run from scratch no matter how far a previous attempt got.
-- (The first run's deadlock aborted partway through without a wrapping
-- transaction, so some of these three policies were already applied
-- successfully before the error — "already exists" on a re-run is that,
-- not a sign anything is wrong. Dropping the new name too makes every
-- block idempotent regardless of which ones already went through.)

drop policy if exists "own qc issues" on public.order_item_issues;
drop policy if exists "own qc issues or any authenticated (admin) session" on public.order_item_issues;
create policy "own qc issues or any authenticated (admin) session"
  on public.order_item_issues for all
  using (auth.uid() = user_id or auth.role() = 'authenticated')
  with check (auth.uid() = user_id or auth.role() = 'authenticated');

drop policy if exists "own coupons" on public.personal_coupons;
drop policy if exists "own coupons or any authenticated (admin) session" on public.personal_coupons;
create policy "own coupons or any authenticated (admin) session"
  on public.personal_coupons for all
  using (auth.uid() = user_id or auth.role() = 'authenticated')
  with check (auth.uid() = user_id or auth.role() = 'authenticated');

drop policy if exists "own notifications" on public.notifications;
drop policy if exists "own notifications or any authenticated (admin) session" on public.notifications;
create policy "own notifications or any authenticated (admin) session"
  on public.notifications for all
  using (auth.uid() = user_id or auth.role() = 'authenticated')
  with check (auth.uid() = user_id or auth.role() = 'authenticated');

-- Storage: the "qc" (and "products"/"banners") upload folder(s) are now
-- routed through createServiceRoleClient() in app/api/upload/route.ts,
-- which bypasses storage RLS entirely — so no policy change is needed
-- in storage.objects for this to keep working. This section is here
-- only so anyone reading this file for "what did the QC RLS fix touch"
-- has the full picture in one place, not split across a SQL file and a
-- code comment.
