-- data/wishdrop-pricing-settings.sql
--
-- Editable pricing engine (Admin → Super Admin → Pricing engine).
-- Every rate that used to be hardcoded in lib/quote.ts and
-- lib/currency-config.ts now lives in one JSON row here — exchange rates,
-- storefront markup and fees, local-store and Wishdrop Mall fees, and the
-- customs/HS-code schedule. Shape: PricingSettings in lib/pricing-settings.ts.
--
-- Until a row is saved, the app uses the old hardcoded values
-- (DEFAULT_PRICING_SETTINGS), so running this changes no prices by itself.
--
-- Read and written only by the server with the service role
-- (lib/pricing-settings-server.ts, /api/admin/pricing-settings); RLS is on
-- with no policies, so the browser can't read or change it directly.
--
-- Safe to run more than once.

create table if not exists public.pricing_settings (
  id smallint primary key default 1 check (id = 1),   -- exactly one row
  settings jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_by_name text
);

-- Every save, with what it replaced, so a bad change can be traced and undone.
create table if not exists public.pricing_settings_history (
  id bigint generated always as identity primary key,
  settings jsonb not null,
  previous jsonb,
  note text,
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users(id) on delete set null,
  changed_by_name text
);
create index if not exists pricing_settings_history_changed_at_idx
  on public.pricing_settings_history (changed_at desc);

alter table public.pricing_settings enable row level security;
alter table public.pricing_settings_history enable row level security;
