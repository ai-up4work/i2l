-- Deleting an order properly (Admin → order → "Delete order").
--
-- Before: the admin screen removed the order from its own list and then asked
-- the database to delete it, without checking the answer. If the database
-- refused, or other rows were left behind (the checkout, the customer's
-- notifications, purchases, stock movements), the customer kept seeing the
-- order while staff saw nothing.
--
-- This function deletes one order and everything that only existed because of
-- it, in one transaction (all or nothing):
--   * puts Wishdrop Mall stock back
--   * removes its purchases, QC issues and stock-movement log lines
--   * removes the customer's notifications that point at the order
--   * removes the checkout (and its coupon uses, so the coupon works again)
--     when no other order is using it
-- Paid or refunded orders are refused: cancel and refund them instead.
--
-- Called only by the server (service role) from DELETE /api/admin/orders/[id].
-- Safe to run more than once.

create or replace function public.admin_delete_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o            record;
  others       integer;
  n_notif      integer := 0;
  v_checkout   uuid;
begin
  select id, display_id, user_id, checkout_id, payment_status
    into o
    from public.orders
   where id = p_order_id;

  -- Already gone: nothing to do (so a second click is harmless).
  if not found then
    return jsonb_build_object('deleted', false, 'reason', 'not_found');
  end if;

  if o.payment_status in ('paid', 'refunded') then
    raise exception 'Order % is paid. Cancel and refund it instead of deleting it.', o.display_id
      using errcode = 'P0001';
  end if;

  v_checkout := o.checkout_id;

  -- 1. Wishdrop Mall stock back on the shelf.
  if to_regprocedure('public.mall_restore_stock_for_order(uuid)') is not null then
    perform public.mall_restore_stock_for_order(o.id);
  end if;

  -- 2. Rows that point at the order but would otherwise stay behind.
  if to_regclass('public.purchases') is not null then
    delete from public.purchases where order_id = o.id;
  end if;
  if to_regclass('public.order_item_issues') is not null then
    delete from public.order_item_issues where order_id = o.id;
  end if;
  if to_regclass('public.mall_stock_movements') is not null then
    delete from public.mall_stock_movements
     where order_id = o.id and reason in ('order', 'order_cancelled');
  end if;

  -- 3. The customer's notifications about this order (e.g. "WD-10499 shipped").
  --    Matches the order number only as a whole number, so WD-1049 never
  --    removes a notification about WD-10499.
  delete from public.notifications
   where user_id = o.user_id
     and (coalesce(link, '') ~* (o.display_id || '($|[^0-9])')
          or coalesce(body, '') ~* (o.display_id || '($|[^0-9])')
          or coalesce(title, '') ~* (o.display_id || '($|[^0-9])'));
  get diagnostics n_notif = row_count;

  -- 4. The order itself (items, stage history and notes go with it).
  delete from public.orders where id = o.id;

  -- 5. Its checkout, only when no other order still uses it.
  if v_checkout is not null and to_regclass('public.checkouts') is not null then
    select count(*) into others from public.orders where checkout_id = v_checkout;
    if others = 0 then
      if to_regclass('public.coupon_redemptions') is not null then
        delete from public.coupon_redemptions where checkout_id = v_checkout;
      end if;
      delete from public.checkouts where id = v_checkout;
    end if;
  end if;

  return jsonb_build_object(
    'deleted', true,
    'display_id', o.display_id,
    'notifications_removed', n_notif,
    'checkout_removed', v_checkout is not null and others = 0
  );
end;
$$;

revoke all on function public.admin_delete_order(uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_order(uuid) to service_role;
