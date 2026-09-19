-- data/wishdrop-order-display-id-sequence.sql
--
-- ROOT CAUSE of every real in-platform checkout failing outright:
--
-- public.orders.display_id is `text unique not null` with NO default
-- (see data/wishdrop-supabase-schema.sql, section 11). Channel 1/2
-- checkout (contexts/DashboardContext.tsx's createOrderWithRetry) and
-- Channel 3 order confirmation (lib/supabase/requests-admin.ts's
-- confirmRequestReal) both insert into `orders` without supplying
-- display_id — createOrderWithRetry's own comment already documents the
-- intent ("orders.display_id has a real DEFAULT backed by a Postgres
-- sequence... so leaving it out of the insert entirely lets the database
-- assign a real, race-free, strictly increasing order number"), but this
-- migration — the thing that comment depends on — was never actually
-- written and run. Until it is, every one of those inserts fails with
-- `null value in column "display_id" of relation "orders" violates
-- not-null constraint`, which means the real cart checkout
-- (app/account/cart/page.tsx) and Channel 3 request confirmation
-- (admin /admin/requests/[requestId]) cannot create an order at all.
--
-- FIX (this file): a sequence-backed DEFAULT that formats to the
-- existing "WD-10499"-style id used everywhere in the UI/copy — zero-
-- padded to 5 digits while the sequence is still small, growing past 5
-- digits naturally once it passes 99999 rather than wrapping or
-- colliding. Both insert sites can now safely omit display_id and read
-- back whatever the database assigned.
--
-- Idempotent — safe to run again on a database that already has this
-- sequence/default in place.

create sequence if not exists public.order_display_id_seq
  start with 10000
  increment by 1;

alter table public.orders
  alter column display_id set default ('WD-' || lpad(nextval('public.order_display_id_seq')::text, 5, '0'));

-- Keep the sequence ahead of any display_id already in the table (e.g.
-- rows inserted by the old client-side random-with-retry generator, or
-- by a previous partial run of this migration) so the very next
-- nextval() can't collide with an existing "WD-#####" id.
select setval(
  'public.order_display_id_seq',
  greatest(
    10000,
    coalesce(
      (select max(nullif(regexp_replace(display_id, '\D', '', 'g'), '')::bigint) from public.orders),
      0
    ) + 1
  ),
  false
);
