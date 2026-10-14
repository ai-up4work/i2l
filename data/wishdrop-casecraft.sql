-- data/wishdrop-casecraft.sql
--
-- Case Craft (custom-printed phone cases) — a custom store with its own
-- customer page and seller pages (lib/store-modules/casecraft). Its
-- orders are kept here, separate from Wishdrop's order pipeline.
--
--   casecraft_settings  price list, models on sale, delivery, payments
--                       (seller) + margin_percent (staff only)
--   casecraft_designs   ready-made designs the seller uploads
--   casecraft_orders    custom-print and ready-made orders
--
-- All three are read and written only by the server (service role), so
-- RLS is on with no policies. Safe to run more than once.

create table if not exists public.casecraft_settings (
  seller_id uuid primary key references public.sellers(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  margin_percent numeric(6,2) not null default 0,
  margin_updated_at timestamptz,
  margin_updated_by text,
  updated_at timestamptz not null default now()
);

create table if not exists public.casecraft_designs (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  name text not null,
  subtitle text,
  image_url text not null,
  case_type text not null default 'tough-cases',
  -- Phone models it's sold for. Empty = every model on sale.
  models text[] not null default '{}',
  price_lkr numeric(12,2) not null check (price_lkr >= 0),
  is_new boolean not null default false,
  is_bestseller boolean not null default false,
  active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists casecraft_designs_seller_idx on public.casecraft_designs (seller_id, sort, created_at desc);

create table if not exists public.casecraft_orders (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  seller_id uuid not null references public.sellers(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('custom', 'ready')),
  case_type text not null,
  case_label text not null,
  model_label text not null,
  template text,
  design_id uuid references public.casecraft_designs(id) on delete set null,
  design_name text,
  -- Custom prints: the customer's photo, the print-ready image (photo as
  -- placed, no template) and a preview with the case template on top.
  photo_url text,
  print_url text,
  preview_url text,
  quantity integer not null default 1 check (quantity between 1 and 20),
  seller_unit_lkr numeric(12,2) not null,
  margin_percent numeric(6,2) not null default 0,
  unit_price_lkr numeric(12,2) not null,
  delivery_fee_lkr numeric(12,2) not null default 0,
  total_lkr numeric(12,2) not null,
  customer jsonb not null,
  payment_method text not null check (payment_method in ('cod', 'bank')),
  status text not null default 'new'
    check (status in ('new', 'confirmed', 'printing', 'dispatched', 'delivered', 'cancelled')),
  seller_note text,
  tracking text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists casecraft_orders_seller_idx on public.casecraft_orders (seller_id, created_at desc);
create index if not exists casecraft_orders_user_idx on public.casecraft_orders (user_id, created_at desc);

alter table public.casecraft_settings enable row level security;
alter table public.casecraft_designs enable row level security;
alter table public.casecraft_orders enable row level security;

-- Make the API see the new tables straight away.
notify pgrst, 'reload schema';
