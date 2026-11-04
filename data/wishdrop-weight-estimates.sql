-- data/wishdrop-weight-estimates.sql
--
-- Weight-based pricing for pasted links, and the staff "Price check".
--
-- Pasted links (Amazon, Myntra, FirstCry…) rarely tell us an item's weight,
-- and freight + customs clearance are charged by weight. The product page
-- now prices with the store's weight, or a weight category the shopper
-- picks (Pricing engine → Weight categories), or a weight they type.
-- Checkout saves that weight on each order item and flags the order
-- (orders.price_review) so staff confirm it on the order page
-- (Admin → order → Price check), where they can set the real weight or
-- price; the order and checkout totals are recalculated and the customer is
-- notified.
--
-- Safe to run more than once. Checkout keeps working before this is run
-- (it retries without these columns), but the weights aren't saved and
-- the Price check can only set prices by hand.

-- What each item was priced at, and from what.
alter table public.order_items add column if not exists weight_kg numeric(8,3);
alter table public.order_items add column if not exists weight_source text;
alter table public.order_items add column if not exists source_price numeric(12,2);
alter table public.order_items add column if not exists source_currency text;
alter table public.order_items add column if not exists price_checked_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'order_items_weight_source_check'
  ) then
    alter table public.order_items
      add constraint order_items_weight_source_check
      check (weight_source is null or weight_source in ('store', 'category', 'custom', 'default', 'staff'));
  end if;
end $$;

-- Who confirmed the order's prices, and when.
alter table public.orders add column if not exists price_checked_at timestamptz;
alter table public.orders add column if not exists price_checked_by uuid references public.staff_accounts(id) on delete set null;

-- Every order now waits for staff to confirm its final price (and tell the
-- customer) before payment is requested or recorded. Orders already placed,
-- not paid and not yet confirmed join that queue. Paid / cancelled orders
-- are left alone. Running this again only re-flags still-unconfirmed ones.
update public.orders
   set price_review = true
 where checkout_id is not null
   and payment_status = 'unpaid'
   and stage <> 'cancelled'
   and price_review = false
   and price_checked_at is null;

update public.checkouts c
   set needs_price_review = true
 where c.payment_status = 'unpaid'
   and c.needs_price_review = false
   and exists (select 1 from public.orders o where o.checkout_id = c.id and o.price_review);

-- The admin orders list can filter "needs a price check" quickly.
create index if not exists orders_price_review_idx on public.orders (created_at desc) where price_review;

notify pgrst, 'reload schema';
