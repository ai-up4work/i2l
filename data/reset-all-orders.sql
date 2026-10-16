-- ============================================================================
-- RESET: delete EVERY order and start again.
-- ============================================================================
-- Run in the Supabase SQL editor. It's one transaction: either everything
-- below happens, or nothing does.
--
-- Deletes, for every order in the database:
--   - the orders, their items, stage history and internal notes
--   - their purchases (Purchases queue) and QC issues
--   - every checkout (Confirm order), its payments, and its coupon uses
--     (so the coupons can be used again)
-- Before deleting, it puts Wishdrop Mall stock back for each order.
--
-- Keeps: customers, addresses, bags, wishlists, coupons themselves,
-- referrals, requests (see the optional part at the end), chats (messages
-- that mentioned an order just lose the link), products and stores.
--
-- CANNOT BE UNDONE. Take a backup first if you might want this data:
-- Supabase -> Database -> Backups, or Table editor -> orders -> Export.
-- ============================================================================

begin;

-- Allow deleting paid orders for this reset only (see the trigger in
-- wishdrop-coupons-referrals-payments.sql, section 13).
set local wishdrop.allow_order_delete = 'on';

do $$
declare
  o record;
  n_orders   integer;
  n_checkout integer := 0;
begin
  select count(*) into n_orders from public.orders;
  if to_regclass('public.checkouts') is not null then
    execute 'select count(*) from public.checkouts' into n_checkout;
  end if;
  raise notice 'Deleting % orders and % checkouts', n_orders, n_checkout;

  -- 1. Put Wishdrop Mall stock back (only if that function exists — SQL
  --    file wishdrop-coupons-referrals-payments.sql, section 12).
  if to_regprocedure('public.mall_restore_stock_for_order(uuid)') is not null then
    for o in select id from public.orders loop
      perform public.mall_restore_stock_for_order(o.id);
    end loop;
  end if;

  -- 2. Rows that point at orders but wouldn't be removed with them.
  if to_regclass('public.purchases') is not null then
    delete from public.purchases where order_id is not null;
  end if;
  if to_regclass('public.order_item_issues') is not null then
    delete from public.order_item_issues;
  end if;
  if to_regclass('public.mall_stock_movements') is not null then
    delete from public.mall_stock_movements where order_id is not null and reason in ('order', 'order_cancelled');
  end if;

  -- 3. Coupon uses from checkouts -> coupons become usable again.
  if to_regclass('public.coupon_redemptions') is not null then
    delete from public.coupon_redemptions where checkout_id is not null;
  end if;
  if to_regclass('public.refunds') is not null then
    delete from public.refunds;
  end if;

  -- 4. The orders (items, stage history and internal notes go with them).
  delete from public.orders;

  -- 5. Checkouts (their payments go with them).
  if to_regclass('public.checkouts') is not null then
    delete from public.checkouts;
  end if;
end $$;

-- 6. Order numbers are NOT reset: new orders continue from the last number
--    (e.g. WD-1000051). Resetting the counter safely depends on how the
--    order-number default is set up in your database, so it's left alone.

commit;

-- Check: both should be 0.
select (select count(*) from public.orders) as orders_left,
       (select count(*) from public.order_items) as order_items_left;


-- ============================================================================
-- OPTIONAL — also clear REQUESTS (the Requests page). Not run unless you
-- remove the /* and */ around it.
-- ============================================================================
/*
begin;
delete from public.purchases where request_id is not null;
delete from public.requests;
commit;
*/
