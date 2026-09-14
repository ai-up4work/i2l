-- data/wishdrop-admin-orders-rls-fix.sql
--
-- ROOT CAUSE of "fresh orders show on /admin/orders but not on
-- /admin/purchases (or only one order ever shows at all, no matter who
-- placed it)":
--
-- public.orders and public.order_items currently only allow a row to be
-- SELECTed by the customer who owns it:
--
--   create policy "own orders" on public.orders
--     for select using (auth.uid() = user_id);
--
--   create policy "own order items" on public.order_items
--     for select using (exists (select 1 from public.orders o
--       where o.id = order_id and o.user_id = auth.uid()));
--
-- The admin panel's pages (lib/supabase/orders-admin.ts) query these
-- tables with the browser/anon Supabase client — same as any customer
-- page — because there's no real staff authentication wired up yet (the
-- role switcher in the top-right of /admin is a local, client-side mock;
-- it isn't backed by a Supabase Auth session). So whichever Supabase Auth
-- session happens to be active in that browser tab is what "own orders"
-- gets evaluated against: if that session belongs to one specific
-- customer, you only ever see THAT customer's own orders — everyone
-- else's orders (including every "fresh" one just placed) are invisible,
-- not because they don't exist, but because RLS is silently filtering
-- them out. This is a real permissions issue, not a bug in the fetch
-- code or in AdminDataContext.
--
-- INTERIM FIX (this file): widen SELECT on orders/order_items to any
-- authenticated user, so the admin panel can see every order regardless
-- of who's logged into that browser tab. This matches the level of
-- access-control maturity the rest of the admin panel already has today
-- (per data/wishdrop-supabase-schema.sql's own comment: "Staff/admin
-- tables intentionally have NO client-facing RLS policy... access them
-- only through server-side routes using the service role key" — i.e.
-- the schema's author always expected a real access-control layer to
-- come later). This is NOT that real layer — it's the minimum change to
-- unblock the admin panel today. Any authenticated user (including a
-- logged-in customer poking at the network tab) can now read every
-- order in the system through this policy.
--
-- REAL FIX, later: either (a) move admin order reads behind a
-- server-side API route using the Supabase service role key (bypasses
-- RLS entirely, matches the schema's original intent), or (b) give
-- staff_accounts a matching auth.users row and write a policy that
-- checks staff_accounts instead of "any authenticated user". Don't ship
-- the policy below to a production database with real customer data
-- without doing one of those first.

drop policy if exists "own orders" on public.orders;
create policy "own orders or any authenticated (admin) session"
  on public.orders for select
  using (auth.uid() = user_id or auth.role() = 'authenticated');

drop policy if exists "own order items" on public.order_items;
create policy "own order items or any authenticated (admin) session"
  on public.order_items for select
  using (
    exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
    or auth.role() = 'authenticated'
  );
