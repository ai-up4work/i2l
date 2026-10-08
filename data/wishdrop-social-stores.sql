-- data/wishdrop-social-stores.sql
--
-- Store profile for custom sellers (Instagram / Facebook shops): the
-- cover photo, tagline and social links shown on their new store page.
-- Safe to run more than once. Run after data/wishdrop-seller-media.sql.

alter table public.sellers
  add column if not exists cover_url text,
  add column if not exists tagline text,
  add column if not exists instagram_url text,
  add column if not exists facebook_url text;

comment on column public.sellers.cover_url is 'Wide banner photo on the store page (Cloudinary link).';
comment on column public.sellers.tagline is 'One short line under the store name.';

-- "Follow this store". The table is in the reference schema already; this
-- creates it only if your database doesn't have it yet.
create table if not exists public.store_follows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform_slug text not null,
  created_at timestamptz not null default now(),
  unique (user_id, platform_slug)
);
create index if not exists store_follows_user_id_idx on public.store_follows (user_id);
create index if not exists store_follows_platform_slug_idx on public.store_follows (platform_slug);
alter table public.store_follows enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'store_follows' and policyname = 'own store follows'
  ) then
    create policy "own store follows" on public.store_follows for all
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;
