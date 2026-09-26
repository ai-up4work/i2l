-- ============================================================================
-- Wishdrop Mall — Wishdrop's own store, sold as its own channel
-- ============================================================================
-- See WISHDROP_MALL.md. Safe to run more than once.
--
-- The Mall's store row itself is NOT created here: open
-- /admin/wishdrop-mall and click "Set up Wishdrop Mall" (it starts hidden).
-- This file only adds the columns that remember where each Mall product
-- was sourced from (and what it cost there), so staff know where to buy it
-- when an order comes in and can re-check it later. Mall selling prices
-- are set by staff in LKR in products.price.
-- ============================================================================

alter table public.products
  add column if not exists source_platform  text,          -- affiliated store slug, or scraper site / hostname
  add column if not exists source_handle    text,          -- product handle inside that store's feed
  add column if not exists source_url       text,          -- where staff actually buy it
  add column if not exists source_price     numeric(12,2), -- raw price at the source when last checked
  add column if not exists source_currency  text,
  add column if not exists source_synced_at timestamptz;

create index if not exists products_source_lookup_idx
  on public.products (seller_id, source_platform, source_handle);

-- Per-option cost (used by the seller-portal margin maths).
alter table public.product_variants
  add column if not exists cost_price numeric(12,2);

-- Full product editor (Wishdrop Mall): Amazon-style details.
alter table public.products
  add column if not exists brand      text,
  add column if not exists highlights text[] not null default '{}',   -- "About this item" bullet points
  add column if not exists specs      jsonb  not null default '[]';   -- [{ "name": "Material", "value": "Cotton" }, ...]

-- Per-variant buying info: each size/colour can come from its own page.
alter table public.product_variants
  add column if not exists source_url   text,          -- where staff buy THIS variant
  add column if not exists source_price numeric(12,2); -- its price at the source (in the product's source_currency)

-- ---------------------------------------------------------------------------
-- Keep cost, margin & source columns away from shoppers and sellers
-- ---------------------------------------------------------------------------
-- The existing "public read products" policy lets anyone SELECT every
-- column of an active product through the public REST API — including
-- cost_price / margin_percent (every seller's cost and Wishdrop's markup)
-- and where Mall products are bought from.
--
-- Nothing in the app reads these from the browser any more: the
-- storefront reads products server-side with a safe column list
-- (lib/store-providers/catalogue.ts), the seller portal goes through
-- /api/seller/products, and the admin pages through /api/admin/**. All of
-- those use the service role, which these revokes don't affect.
revoke select (cost_price, margin_percent,
               source_platform, source_handle, source_url,
               source_price, source_currency, source_synced_at)
  on public.products from anon, authenticated;

revoke select (cost_price, source_url, source_price) on public.product_variants from anon, authenticated;

-- ============================================================================
-- Inventory — Wishdrop Mall sells stock Wishdrop already holds
-- ============================================================================
-- products.stock_count         quantity on hand (product with no variants),
--                              or the SUM of its variants' stock.
-- product_variants.stock       quantity on hand per size/colour.
-- NULL stock_count means "not tracked" (custom sellers); every Mall
-- product is tracked.
--
-- Stock goes down automatically when an order is placed: the checkout
-- calls /api/mall/orders/[id]/stock, which reads the order's own items
-- (never quantities sent by the browser) and calls mall_deduct_stock()
-- once per order item. Every change is logged in mall_stock_movements;
-- the unique order_item_id makes it impossible to deduct the same order
-- item twice. Cancellations/returns: adjust the quantity in the product
-- editor (that's also logged, as reason 'manual_edit').

create table if not exists public.mall_stock_movements (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references public.products(id) on delete cascade,
  variant_id      uuid references public.product_variants(id) on delete set null,
  order_id        uuid references public.orders(id) on delete set null,
  order_item_id   uuid unique references public.order_items(id) on delete set null,
  quantity_change integer not null,          -- negative = sold, positive = restocked
  stock_after     integer,
  shortage        integer not null default 0, -- sold more than was on hand (race at checkout)
  reason          text not null,             -- 'order' | 'manual_edit'
  created_at      timestamptz not null default now()
);
create index if not exists mall_stock_movements_product_idx on public.mall_stock_movements (product_id, created_at desc);

alter table public.mall_stock_movements enable row level security;
-- No policies: only the server (service role) reads/writes this table.

create or replace function public.mall_deduct_stock(
  p_product_id    uuid,
  p_variant_id    uuid,
  p_quantity      integer,
  p_order_id      uuid,
  p_order_item_id uuid
) returns table (applied boolean, stock_after integer, shortage integer)
language plpgsql
as $$
declare
  v_before integer;
  v_after  integer;
  v_short  integer;
begin
  if p_quantity is null or p_quantity <= 0 then
    return query select false, null::integer, 0;
    return;
  end if;

  -- Idempotency: this order item was already deducted.
  if p_order_item_id is not null and exists (
    select 1 from public.mall_stock_movements where order_item_id = p_order_item_id
  ) then
    return query select false, null::integer, 0;
    return;
  end if;

  if p_variant_id is not null then
    select stock into v_before from public.product_variants
      where id = p_variant_id and product_id = p_product_id for update;
    if not found then
      return query select false, null::integer, 0;
      return;
    end if;
    v_after := greatest(coalesce(v_before, 0) - p_quantity, 0);
    v_short := greatest(p_quantity - coalesce(v_before, 0), 0);
    update public.product_variants
      set stock = v_after, available = (v_after > 0)
      where id = p_variant_id;
    -- Keep the product total in step with its variants.
    update public.products
      set stock_count = (select coalesce(sum(stock), 0) from public.product_variants where product_id = p_product_id),
          updated_at = now()
      where id = p_product_id;
  else
    select stock_count into v_before from public.products where id = p_product_id for update;
    if not found or v_before is null then
      -- Not tracked: nothing to deduct.
      return query select false, null::integer, 0;
      return;
    end if;
    v_after := greatest(v_before - p_quantity, 0);
    v_short := greatest(p_quantity - v_before, 0);
    update public.products set stock_count = v_after, updated_at = now() where id = p_product_id;
  end if;

  insert into public.mall_stock_movements
    (product_id, variant_id, order_id, order_item_id, quantity_change, stock_after, shortage, reason)
  values
    (p_product_id, p_variant_id, p_order_id, p_order_item_id, -p_quantity, v_after, v_short, 'order');

  return query select true, v_after, v_short;
end;
$$;

-- Server-only: called with the service role from /api/mall/orders/[id]/stock.
revoke all on function public.mall_deduct_stock(uuid, uuid, integer, uuid, uuid) from public, anon, authenticated;

-- ============================================================================
-- Mall categories — created and ordered by the super admin
-- ============================================================================
-- Products link by id (mall_category_id), so renaming a category never
-- breaks anything. products.category (text) is kept in step with the
-- category's name for search and older code paths; 'General' when a
-- product has no category.

create table if not exists public.mall_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,          -- used in the storefront filter URL
  description text,
  image_url   text,
  sort_order  integer not null default 0,    -- storefront order, lowest first
  active      boolean not null default true, -- hidden categories don't show on the storefront
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists mall_categories_name_key on public.mall_categories (lower(name));

alter table public.mall_categories enable row level security;
-- No policies: read and written only by the server (service role).

alter table public.products
  add column if not exists mall_category_id uuid references public.mall_categories(id) on delete set null;
create index if not exists products_mall_category_idx on public.products (mall_category_id);

-- One-time conversion: turn the free-text categories already on Mall
-- products into real categories and link them. Safe to re-run.
insert into public.mall_categories (name, slug, sort_order)
select distinct on (lower(trim(p.category)))
       trim(p.category),
       trim(both '-' from lower(regexp_replace(trim(p.category), '[^a-zA-Z0-9]+', '-', 'g'))),
       0
from public.products p
join public.sellers s on s.id = p.seller_id
where s.platform_slug = 'wishdrop-mall'
  and p.category is not null
  and trim(p.category) <> ''
  and lower(trim(p.category)) <> 'general'
  and trim(both '-' from lower(regexp_replace(trim(p.category), '[^a-zA-Z0-9]+', '-', 'g'))) <> ''
on conflict do nothing;

update public.products p
set mall_category_id = c.id
from public.mall_categories c, public.sellers s
where s.id = p.seller_id
  and s.platform_slug = 'wishdrop-mall'
  and p.mall_category_id is null
  and lower(trim(p.category)) = lower(c.name);
