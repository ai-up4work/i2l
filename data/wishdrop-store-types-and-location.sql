-- data/wishdrop-store-types-and-location.sql
--
-- 1. STORE TYPE, saved explicitly (sellers.store_source)
--    'feed'      Shopify / WooCommerce / JSON API / HTML scrape
--    'extractor' seller wizard "mock": a custom page + product extractor in code
--    'social'    Instagram / Facebook store, products in our database
--                (Admin → Social Stores only)
--    'mall'      Wishdrop Mall
--    Before this, the type was guessed and every wizard "mock" store was
--    treated as a social store (shown in Social Stores and on the social
--    store page). See lib/catalogue-stores.ts.
--
-- 2. STORE LOCATION (sellers.store_origin): 'IN' (default) or 'LK' (local
--    Sri Lankan shop). Any store type can be local. See lib/store-origin.ts.
--
-- 3. LOCAL ORDERS: orders.store_origin + orders.pickup_fee_lkr. A bag
--    with Indian and local items becomes two orders at checkout.
--    sites.country marks the warehouse that receives local pickups.
--
-- Safe to run more than once. Run in the Supabase SQL editor.

-- ---------------------------------------------------------------------------
-- 1. Store type
-- ---------------------------------------------------------------------------
alter table public.sellers add column if not exists store_source text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sellers_store_source_check') then
    alter table public.sellers
      add constraint sellers_store_source_check
      check (store_source is null or store_source in ('feed', 'extractor', 'social', 'mall'));
  end if;
end $$;

-- Backfill rows that don't have a type yet.
update public.sellers set store_source = 'mall'
where store_source is null and platform_slug = 'wishdrop-mall';

update public.sellers set store_source = 'social'
where store_source is null
  and (provider_type = 'catalogue' or provider_config->>'type' = 'catalogue');

-- Old hand-managed stores made in the wizard with "mock" that already
-- have products in our database were really social stores. Move them over
-- properly (type + config) so they keep their products and page.
-- anishka-creation has a real extractor in code and is never one of these.
update public.sellers s set
  store_source = 'social',
  provider_type = 'catalogue',
  provider_config = jsonb_build_object('type', 'catalogue', 'currency', coalesce(s.provider_config->>'currency', 'INR'))
    || case when s.provider_config ? 'display' then jsonb_build_object('display', s.provider_config->'display') else '{}'::jsonb end
where s.store_source is null
  and coalesce(s.provider_type, s.provider_config->>'type', 'mock') = 'mock'
  and s.platform_slug <> 'anishka-creation'
  and exists (select 1 from public.products p where p.seller_id = s.id);

-- Every other "mock" store is an extractor store.
update public.sellers set store_source = 'extractor'
where store_source is null
  and coalesce(provider_type, provider_config->>'type', 'mock') = 'mock';

update public.sellers set store_source = 'feed'
where store_source is null;

-- ---------------------------------------------------------------------------
-- 2. Store location
-- ---------------------------------------------------------------------------
alter table public.sellers add column if not exists store_origin text not null default 'IN';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sellers_store_origin_check') then
    alter table public.sellers
      add constraint sellers_store_origin_check check (store_origin in ('IN', 'LK'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Local orders
-- ---------------------------------------------------------------------------
alter table public.orders add column if not exists store_origin text not null default 'IN';
alter table public.orders add column if not exists pickup_fee_lkr numeric(12,2) not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_store_origin_check') then
    alter table public.orders
      add constraint orders_store_origin_check check (store_origin in ('IN', 'LK'));
  end if;
end $$;

-- Which warehouse receives local shop pickups. Mark your Sri Lanka
-- warehouse after running this, e.g.:
--   update public.sites set country = 'LK' where name = 'Colombo';
-- Until one is marked, local orders go to the default site.
alter table public.sites add column if not exists country text not null default 'IN';

-- ---------------------------------------------------------------------------
-- 4. Social store product currency follows the store
-- ---------------------------------------------------------------------------
-- A social store's prices are entered in ONE currency, decided by the
-- store: LKR for a local Sri Lankan store, INR otherwise. Products used to
-- be saved as INR whatever the store, so a store switched to Sri Lanka
-- showed some prices as INR (converted at the INR rate) and some as LKR.
-- The app now writes the store's currency on every save and when a store
-- changes location; this fixes rows saved before that.
update public.products p
set currency = case when s.store_origin = 'LK' then 'LKR' else 'INR' end
from public.sellers s
where p.seller_id = s.id
  and s.store_source = 'social'
  and p.currency is distinct from (case when s.store_origin = 'LK' then 'LKR' else 'INR' end);
