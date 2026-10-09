-- data/wishdrop-seller-applications.sql
--
-- "Sell on Wishdrop" applications from /stores/apply. Before this, the
-- form showed "Application received" but saved nothing.
-- Written and read only by the server (service role): the public form
-- posts to /api/seller-applications, staff read them in Admin → Social
-- Stores. No browser policies. Safe to run more than once.

create table if not exists public.seller_applications (
  id uuid primary key default gen_random_uuid(),
  store_name text not null,
  contact_name text not null,
  email text not null,
  whatsapp text not null,
  instagram text,
  facebook text,
  website text,
  category text,
  location text,
  product_count text,
  message text,
  -- new -> contacted -> approved | declined
  status text not null default 'new' check (status in ('new', 'contacted', 'approved', 'declined')),
  seller_id uuid references public.sellers(id) on delete set null,
  staff_note text,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists seller_applications_status_idx on public.seller_applications (status, created_at desc);

alter table public.seller_applications enable row level security;
