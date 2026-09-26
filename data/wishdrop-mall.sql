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

-- Per-option cost, so margin changes can re-price every size/colour
-- correctly (options can cost different amounts at the source).
alter table public.product_variants
  add column if not exists cost_price numeric(12,2);

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

revoke select (cost_price) on public.product_variants from anon, authenticated;
