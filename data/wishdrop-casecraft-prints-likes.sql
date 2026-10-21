-- Case Craft: "Fresh from the printer" photos and likes.
-- Run once in Supabase → SQL Editor (after data/wishdrop-casecraft.sql).
-- Safe to run again.

-- Photos of real, finished cases the seller uploads (seller portal →
-- Printed cases). Shown on the shop page.
create table if not exists public.casecraft_prints (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  image_url text not null,
  caption text,
  model_label text,
  -- Optional: the ready-made design it was printed from.
  design_id uuid references public.casecraft_designs(id) on delete set null,
  active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists casecraft_prints_seller_idx on public.casecraft_prints (seller_id, sort, created_at desc);

-- One like per shopper per design / print. `liker` is 'u:<user id>' for a
-- signed-in shopper, or 'd:<random id>' kept on a guest's device.
create table if not exists public.casecraft_likes (
  target_type text not null check (target_type in ('design', 'print')),
  target_id uuid not null,
  liker text not null check (liker ~ '^[ud]:[0-9a-f-]{20,40}$'),
  created_at timestamptz not null default now(),
  primary key (target_type, target_id, liker)
);
create index if not exists casecraft_likes_target_idx on public.casecraft_likes (target_type, target_id);
create index if not exists casecraft_likes_liker_idx on public.casecraft_likes (liker);

-- Like totals, read by the shop page.
create or replace view public.casecraft_like_counts as
  select target_type, target_id, count(*)::int as likes
  from public.casecraft_likes
  group by target_type, target_id;

-- Only the server (service role) reads and writes these.
alter table public.casecraft_prints enable row level security;
alter table public.casecraft_likes enable row level security;
revoke all on public.casecraft_like_counts from anon, authenticated;

notify pgrst, 'reload schema';
