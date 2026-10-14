-- data/wishdrop-account-sync.sql
--
-- Cart, wishlist and boards belong to the ACCOUNT, not the device.
-- The database is the source of truth; the browser's local storage is
-- only a cache that's shown instantly and then replaced with what the
-- database says (contexts/Cartcontext.tsx, contexts/Wishlistcontext.tsx,
-- lib/account-sync.ts).
--
-- What was wrong before:
--   * Every page load pushed the whole local cart / wishlist up to the
--     database before reading it back, so an item removed on one device
--     came back from another device's stale copy, and quantities fought.
--   * Deletes looked the product up by URL and picked the NEWEST matching
--     product snapshot; if the row pointed at an older one, nothing was
--     deleted and the item reappeared ("cleared wishlist comes back").
--   * Boards were never saved to the database at all.
--
-- This migration:
--   1. cart_items / wishlist_items get a stable key (the product URL the
--      app already uses as the item id) and the item itself as JSON, so
--      reads and deletes no longer depend on product_snapshots.
--   2. boards get an `items` JSON column: each board is saved as one row.
--   3. All three tables are added to Supabase Realtime, so other devices
--      update straight away (they also re-check when the tab is focused).
--
-- Safe to run more than once. Run in the Supabase SQL editor.

-- ---------------------------------------------------------------------------
-- 1. Cart
-- ---------------------------------------------------------------------------
alter table public.cart_items add column if not exists line_key text;
alter table public.cart_items add column if not exists product jsonb;
alter table public.cart_items add column if not exists updated_at timestamptz not null default now();
alter table public.cart_items add column if not exists source text;
alter table public.cart_items alter column product_snapshot_id drop not null;

-- Backfill from the product snapshot each row points at.
update public.cart_items c
set line_key = s.url,
    product = jsonb_strip_nulls(jsonb_build_object(
      'id', s.url,
      'url', s.url,
      'site', s.site,
      'title', s.title,
      'image', s.image_url,
      'currencyCode', s.currency,
      'sourcePrice', case when s.price is null then null else s.price::text end,
      'source', coalesce(c.source, 'link'),
      'selectedOptions', c.selected_options
    ))
from public.product_snapshots s
where s.id = c.product_snapshot_id
  and (c.line_key is null or c.product is null);

-- Rows that can't be identified can't be shown or removed: drop them.
delete from public.cart_items where line_key is null or product is null;

-- One row per item per account (keep the newest).
delete from public.cart_items a
using public.cart_items b
where a.user_id = b.user_id and a.line_key = b.line_key
  and (a.added_at, a.id) < (b.added_at, b.id);

create unique index if not exists cart_items_user_line_key on public.cart_items (user_id, line_key);

-- ---------------------------------------------------------------------------
-- 2. Wishlist
-- ---------------------------------------------------------------------------
alter table public.wishlist_items add column if not exists item_key text;
alter table public.wishlist_items add column if not exists product jsonb;
alter table public.wishlist_items alter column product_snapshot_id drop not null;

update public.wishlist_items w
set item_key = s.url,
    product = jsonb_strip_nulls(jsonb_build_object(
      'id', s.url,
      'url', s.url,
      'site', s.site,
      'title', s.title,
      'image', s.image_url,
      'currencyCode', s.currency,
      'price', case when s.price is null then null else s.price::text end
    ))
from public.product_snapshots s
where s.id = w.product_snapshot_id
  and (w.item_key is null or w.product is null);

delete from public.wishlist_items where item_key is null or product is null;

delete from public.wishlist_items a
using public.wishlist_items b
where a.user_id = b.user_id and a.item_key = b.item_key
  and (a.added_at, a.id) < (b.added_at, b.id);

create unique index if not exists wishlist_items_user_item_key on public.wishlist_items (user_id, item_key);

-- ---------------------------------------------------------------------------
-- 3. Boards (one row per board, items inside it)
-- ---------------------------------------------------------------------------
alter table public.boards add column if not exists items jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- 4. Realtime: other devices hear about changes straight away
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['cart_items', 'wishlist_items', 'boards'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- Make the API see the new columns straight away.
notify pgrst, 'reload schema';
