-- data/wishdrop-store-collections.sql
--
-- Collections inside a social store (e.g. "Eid edit", "Under Rs 5,000",
-- "New this week"). Staff create them on the store's admin page; products
-- are attached from the product editor or from the collection itself.
-- Shoppers filter the store page by them.
--
-- A product can be in any number of collections (unlike its category).
-- Read and written only by the server (service role), so no browser
-- policies are added. Safe to run more than once.

create table if not exists public.store_collections (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  image_url text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (seller_id, slug)
);
create index if not exists store_collections_seller_idx on public.store_collections (seller_id, sort_order);

create table if not exists public.store_collection_products (
  collection_id uuid not null references public.store_collections(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (collection_id, product_id)
);
create index if not exists store_collection_products_product_idx on public.store_collection_products (product_id);

alter table public.store_collections enable row level security;
alter table public.store_collection_products enable row level security;
