-- data/wishdrop-staff-rls.sql
--
-- Closes the "any signed-in user" hole left by the three interim fixes:
--   data/wishdrop-admin-orders-rls-fix.sql
--   data/wishdrop-admin-requests-chat-rls-fix.sql
--   data/wishdrop-qc-issues-rls-fix.sql
--
-- Those widened orders, order_items, requests, chat_threads,
-- chat_messages, order_item_issues and notifications to
-- `auth.role() = 'authenticated'`, which is true for EVERY logged-in
-- customer, not just staff. This file replaces each of them with:
--   "your own rows"  OR  "you are an active staff member"
--
-- Staff are checked with public.is_staff(), which reads staff_accounts
-- the same way middleware.ts does (user_id match, or email match for a
-- row that hasn't been linked to a login yet; status must be 'active').
-- It is SECURITY DEFINER because staff_accounts' own RLS doesn't let a
-- user read their row.
--
-- Safe to run more than once. Run it AFTER the three files above (or
-- instead of them — it covers the same tables).

set lock_timeout = '10s';

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_accounts s
    where s.status = 'active'
      and s.role is not null
      and (
        s.user_id = auth.uid()
        or (
          s.user_id is null
          and lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
      )
  );
$$;

revoke all on function public.is_staff() from public;
grant execute on function public.is_staff() to authenticated;

-- Drop the widened policies by name, plus any other policy on these
-- tables that still relies on auth.role() (in case one was renamed or
-- created by hand in the dashboard).
do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('orders', 'order_items', 'requests', 'chat_threads',
                        'chat_messages', 'order_item_issues', 'notifications', 'personal_coupons')
      and (
        coalesce(qual, '') ilike '%auth.role()%'
        or coalesce(with_check, '') ilike '%auth.role()%'
        or policyname in (
          'own orders', 'own order items', 'own requests', 'own chat threads',
          'own thread messages', 'own qc issues', 'own notifications',
          'own orders or staff', 'own order items or staff', 'own requests or staff',
          'own chat threads or staff', 'own thread messages or staff',
          'own qc issues or staff', 'own notifications or staff'
        )
        or policyname ilike '%or any authenticated (admin) session'
      )
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end;
$$;

-- Orders: customers read their own; staff read all (writes go through
-- the server with the service role, as before).
create policy "own orders or staff"
  on public.orders for select
  using (auth.uid() = user_id or public.is_staff());

create policy "own order items or staff"
  on public.order_items for select
  using (
    exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
    or public.is_staff()
  );

-- Requests and chat: same access as before for the owner and for staff.
create policy "own requests or staff"
  on public.requests for all
  using (auth.uid() = user_id or public.is_staff())
  with check (auth.uid() = user_id or public.is_staff());

create policy "own chat threads or staff"
  on public.chat_threads for all
  using (auth.uid() = user_id or public.is_staff())
  with check (auth.uid() = user_id or public.is_staff());

create policy "own thread messages or staff"
  on public.chat_messages for all
  using (
    exists (select 1 from public.chat_threads t where t.id = thread_id and t.user_id = auth.uid())
    or public.is_staff()
  )
  with check (
    exists (select 1 from public.chat_threads t where t.id = thread_id and t.user_id = auth.uid())
    or public.is_staff()
  );

-- QC issues and notifications.
do $$
begin
  if to_regclass('public.order_item_issues') is not null then
    execute 'create policy "own qc issues or staff" on public.order_item_issues for all
             using (auth.uid() = user_id or public.is_staff())
             with check (auth.uid() = user_id or public.is_staff())';
  end if;
  if to_regclass('public.notifications') is not null then
    execute 'create policy "own notifications or staff" on public.notifications for all
             using (auth.uid() = user_id or public.is_staff())
             with check (auth.uid() = user_id or public.is_staff())';
  end if;
end;
$$;

-- personal_coupons keeps its "own coupons read" policy from
-- data/wishdrop-coupons-referrals-payments.sql; only a widened copy (if the
-- old QC fix was re-run after it) is dropped above.
