-- data/wishdrop-coupons-referrals-payments.sql
--
-- Server-side checkout, signed coupons, real referrals and (mock) payments.
-- Safe to run more than once. Run it BEFORE deploying the code that uses it.
--
-- What changes
--   1. coupons / coupon_allocations / coupon_redemptions
--        One coupon system for everything (admin campaigns, referral
--        rewards, QC compensation). Customers never read or write these
--        tables directly: every read and write goes through /api routes
--        running with the service role, and the code a customer holds is
--        a signed token (lib/coupons/token.ts) that only the server can
--        mint or check.
--   2. checkouts + payments
--        One row per "Confirm order" (which can create one order per
--        origin), holding the server-computed breakdown, the discount and
--        the payment status. payments logs every payment attempt.
--   3. orders / order_items columns
--        checkout_id, discount_lkr, coupon_id, payment_status,
--        price_review on orders; price_verified / price_source on items.
--   4. price_observations
--        The last price our own scraper saw for a product URL. Checkout
--        prices link items from here (or re-reads the page), never from
--        what the browser sends.
--   5. Referrals
--        referral_settings (one row) + extra columns on referrals.
--   6. Lock-down of the old client-written tables
--        personal_coupons and referrals could be INSERTED/UPDATED by any
--        signed-in user, for any user. Their open policies are removed;
--        customers keep read access to their own rows only. Unused,
--        unexpired personal coupons are copied into the new system first,
--        so nobody loses a coupon they already had.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Coupons
-- ---------------------------------------------------------------------------

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  max_discount_lkr numeric(12,2) check (max_discount_lkr is null or max_discount_lkr > 0),
  min_order_lkr numeric(12,2) not null default 0 check (min_order_lkr >= 0),
  -- Which items the discount applies to.
  store_scope text not null default 'all' check (store_scope in ('all', 'stores')),
  store_slugs text[] not null default '{}',
  -- Who can use it.
  --   everyone       any signed-in customer
  --   new_customers  customers with no previous (non-cancelled) order
  --   selected       only customers with a coupon_allocations row
  audience text not null check (audience in ('everyone', 'new_customers', 'selected')),
  per_user_limit integer not null default 1 check (per_user_limit >= 1),
  total_limit integer check (total_limit is null or total_limit >= 1),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  source text not null default 'admin' check (source in ('admin', 'referral', 'compensation', 'migrated')),
  legacy_personal_coupon_id uuid unique,
  created_by_staff_id uuid references public.staff_accounts(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists coupons_status_idx on public.coupons (status, ends_at);

create table if not exists public.coupon_allocations (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- How the customer got it.
  via text not null default 'admin' check (via in ('admin', 'claimed', 'referral', 'compensation', 'migrated')),
  allocated_by_staff_id uuid references public.staff_accounts(id) on delete set null,
  allocated_by_name text,
  allocated_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (coupon_id, user_id)
);
create index if not exists coupon_allocations_user_idx on public.coupon_allocations (user_id);

-- ---------------------------------------------------------------------------
-- 2. Checkouts + payments
-- ---------------------------------------------------------------------------

create table if not exists public.checkouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  delivery text not null check (delivery in ('express', 'economy')),
  item_count integer not null,
  price_subtotal_lkr numeric(12,2) not null,
  service_lkr numeric(12,2) not null,
  delivery_lkr numeric(12,2) not null,
  pickup_lkr numeric(12,2) not null default 0,
  discount_lkr numeric(12,2) not null default 0,
  total_lkr numeric(12,2) not null,
  coupon_id uuid references public.coupons(id) on delete set null,
  needs_price_review boolean not null default false,
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid', 'failed', 'refunded')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists checkouts_user_idx on public.checkouts (user_id, created_at desc);

create table if not exists public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  allocation_id uuid references public.coupon_allocations(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  checkout_id uuid references public.checkouts(id) on delete set null,
  amount_lkr numeric(12,2) not null,
  status text not null default 'redeemed' check (status in ('redeemed', 'voided')),
  redeemed_at timestamptz not null default now(),
  voided_at timestamptz,
  void_reason text
);
create index if not exists coupon_redemptions_coupon_idx on public.coupon_redemptions (coupon_id, status);
create index if not exists coupon_redemptions_user_idx on public.coupon_redemptions (user_id);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  checkout_id uuid not null references public.checkouts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  amount_lkr numeric(12,2) not null,
  status text not null check (status in ('succeeded', 'failed')),
  reference text not null,
  card_last4 text,
  failure_reason text,
  created_at timestamptz not null default now()
);
create index if not exists payments_checkout_idx on public.payments (checkout_id);

-- ---------------------------------------------------------------------------
-- 3. Orders / order items
-- ---------------------------------------------------------------------------

alter table public.orders add column if not exists checkout_id uuid references public.checkouts(id) on delete set null;
alter table public.orders add column if not exists discount_lkr numeric(12,2) not null default 0;
alter table public.orders add column if not exists coupon_id uuid references public.coupons(id) on delete set null;
alter table public.orders add column if not exists payment_status text not null default 'unpaid';
-- True when at least one item's price couldn't be confirmed by the server
-- (shown to staff — check the price before buying).
alter table public.orders add column if not exists price_review boolean not null default false;
create index if not exists orders_checkout_idx on public.orders (checkout_id);

alter table public.order_items add column if not exists price_verified boolean not null default true;
-- 'catalogue' | 'mall' | 'observed' | 'live_scrape' | 'customer'
alter table public.order_items add column if not exists price_source text;

-- ---------------------------------------------------------------------------
-- 4. Price observations (written by /api/scrape)
-- ---------------------------------------------------------------------------

create table if not exists public.price_observations (
  url text primary key,
  site text,
  price numeric(14,2) not null,
  currency text,
  weight_kg numeric(10,3),
  observed_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 5. Referrals
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists referral_code text;
create unique index if not exists profiles_referral_code_key on public.profiles (referral_code);

create table if not exists public.referral_settings (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default true,
  -- What the new customer gets when they sign up with a link.
  friend_reward_type text not null default 'fixed' check (friend_reward_type in ('percent', 'fixed')),
  friend_reward_value numeric(12,2) not null default 1000,
  friend_max_discount_lkr numeric(12,2),
  friend_min_order_lkr numeric(12,2) not null default 5000,
  friend_valid_days integer not null default 30,
  -- What the person who shared the link gets once the friend's first
  -- order is paid.
  referrer_reward_type text not null default 'fixed' check (referrer_reward_type in ('percent', 'fixed')),
  referrer_reward_value numeric(12,2) not null default 1000,
  referrer_max_discount_lkr numeric(12,2),
  referrer_min_order_lkr numeric(12,2) not null default 5000,
  referrer_valid_days integer not null default 60,
  -- The friend's first paid order must be at least this much.
  qualifying_order_lkr numeric(12,2) not null default 5000,
  updated_at timestamptz not null default now(),
  updated_by_name text
);
insert into public.referral_settings (id) values (1) on conflict (id) do nothing;

alter table public.referrals add column if not exists friend_coupon_id uuid references public.coupons(id) on delete set null;
alter table public.referrals add column if not exists referrer_coupon_id uuid references public.coupons(id) on delete set null;
alter table public.referrals add column if not exists qualifying_checkout_id uuid references public.checkouts(id) on delete set null;
alter table public.referrals add column if not exists voided_at timestamptz;
alter table public.referrals add column if not exists void_reason text;
alter table public.referrals add column if not exists reward_label text;
alter table public.referrals add column if not exists reward_amount numeric(12,2);
-- A customer can only ever be referred once.
create unique index if not exists referrals_referred_user_key on public.referrals (referred_user_id) where referred_user_id is not null;

-- ---------------------------------------------------------------------------
-- 6. Atomic redemption: checks limits under a row lock so two checkouts at
--    the same moment can't both use the last redemption.
-- ---------------------------------------------------------------------------

create or replace function public.coupon_try_redeem(
  p_coupon uuid,
  p_user uuid,
  p_allocation uuid,
  p_checkout uuid,
  p_amount numeric
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.coupons%rowtype;
  used_total integer;
  used_user integer;
  rid uuid;
begin
  select * into c from public.coupons where id = p_coupon for update;
  if not found then raise exception 'COUPON_NOT_FOUND'; end if;
  if c.status <> 'active' then raise exception 'COUPON_INACTIVE'; end if;
  if c.starts_at > now() or (c.ends_at is not null and c.ends_at < now()) then raise exception 'COUPON_EXPIRED'; end if;

  select count(*) into used_total from public.coupon_redemptions where coupon_id = p_coupon and status = 'redeemed';
  if c.total_limit is not null and used_total >= c.total_limit then raise exception 'COUPON_LIMIT'; end if;

  select count(*) into used_user from public.coupon_redemptions
    where coupon_id = p_coupon and user_id = p_user and status = 'redeemed';
  if used_user >= c.per_user_limit then raise exception 'COUPON_USED'; end if;

  insert into public.coupon_redemptions (coupon_id, allocation_id, user_id, checkout_id, amount_lkr)
  values (p_coupon, p_allocation, p_user, p_checkout, p_amount)
  returning id into rid;
  return rid;
end;
$$;
revoke all on function public.coupon_try_redeem(uuid, uuid, uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function public.coupon_try_redeem(uuid, uuid, uuid, uuid, numeric) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Copy unused personal coupons into the new system (once per coupon)
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
  cid uuid;
begin
  if to_regclass('public.personal_coupons') is null then return; end if;
  for r in
    select pc.* from public.personal_coupons pc
    where pc.used_at is null
      and pc.expires_at > now()
      and not exists (select 1 from public.coupons c where c.legacy_personal_coupon_id = pc.id)
  loop
    insert into public.coupons (
      title, discount_type, discount_value, max_discount_lkr, min_order_lkr,
      audience, per_user_limit, starts_at, ends_at, source, legacy_personal_coupon_id, created_by_name
    ) values (
      coalesce(nullif(r.title, ''), 'Coupon'),
      case when r.discount_type = 'percent' then 'percent' else 'fixed' end,
      greatest(r.discount_value, 0.01),
      r.max_discount,
      coalesce(r.min_order_value, 0),
      'selected', 1, r.issued_at, r.expires_at, 'migrated', r.id, 'Moved from old coupons'
    ) returning id into cid;
    insert into public.coupon_allocations (coupon_id, user_id, via, allocated_at, allocated_by_name)
    values (cid, r.user_id, 'migrated', r.issued_at, 'Moved from old coupons')
    on conflict do nothing;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Row level security
-- ---------------------------------------------------------------------------

-- New tables: no browser access except reading your own checkouts/payments.
alter table public.coupons enable row level security;
alter table public.coupon_allocations enable row level security;
alter table public.coupon_redemptions enable row level security;
alter table public.checkouts enable row level security;
alter table public.payments enable row level security;
alter table public.price_observations enable row level security;
alter table public.referral_settings enable row level security;

drop policy if exists "own checkouts read" on public.checkouts;
create policy "own checkouts read" on public.checkouts for select using (auth.uid() = user_id);
drop policy if exists "own payments read" on public.payments;
create policy "own payments read" on public.payments for select using (auth.uid() = user_id);

-- Old client-written tables: drop every existing policy, then allow
-- reading your own rows only. Writes now happen on the server.
do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in ('personal_coupons', 'referrals')
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end;
$$;

do $$
begin
  if to_regclass('public.personal_coupons') is not null then
    execute 'alter table public.personal_coupons enable row level security';
    execute 'create policy "own coupons read" on public.personal_coupons for select using (auth.uid() = user_id)';
  end if;
end;
$$;

alter table public.referrals enable row level security;
create policy "own referrals read" on public.referrals for select using (auth.uid() = referrer_id);

-- Orders: the browser no longer creates orders (POST /api/checkout does,
-- with the service role). If your orders/order_items policies still let a
-- customer INSERT their own rows, they can be tightened to read-only for
-- customers — see the note in COUPONS_REFERRALS_PAYMENTS.md.

-- ---------------------------------------------------------------------------
-- 9. QC compensation coupons now live in `coupons`
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.order_item_issues') is not null then
    execute 'alter table public.order_item_issues add column if not exists coupon_id uuid references public.coupons(id) on delete set null';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Coupon card design (colours, pattern, icon, images) — Admin → Coupons
-- ---------------------------------------------------------------------------
alter table public.coupons add column if not exists design jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- 11. Manual (WhatsApp) payments — staff record payments on the admin order
--     page (lib/payments/server.ts recordManualPayment). Safe to re-run.
-- ---------------------------------------------------------------------------
alter table public.payments add column if not exists method text;
alter table public.payments add column if not exists note text;
alter table public.payments add column if not exists recorded_by uuid;

-- ---------------------------------------------------------------------------
-- 12. Cancelling an unpaid order puts its Wishdrop Mall stock back.
--     Called from lib/payments/server.ts cancelUnpaidCheckout(). Runs once
--     per order (a second call does nothing). Safe to re-run this file.
-- ---------------------------------------------------------------------------
create or replace function public.mall_restore_stock_for_order(p_order_id uuid)
returns integer
language plpgsql
as $$
declare
  m        record;
  v_back   integer;
  v_after  integer;
  n        integer := 0;
begin
  if exists (
    select 1 from public.mall_stock_movements where order_id = p_order_id and reason = 'order_cancelled'
  ) then
    return 0;
  end if;

  for m in
    select * from public.mall_stock_movements
    where order_id = p_order_id and reason = 'order' and quantity_change < 0
  loop
    -- Only what was really taken off the shelf (a shortage was never there).
    v_back := greatest(-m.quantity_change - coalesce(m.shortage, 0), 0);
    if v_back = 0 then continue; end if;

    if m.variant_id is not null then
      update public.product_variants
        set stock = coalesce(stock, 0) + v_back, available = true
        where id = m.variant_id
        returning stock into v_after;
      update public.products
        set stock_count = (select coalesce(sum(stock), 0) from public.product_variants where product_id = m.product_id),
            updated_at = now()
        where id = m.product_id;
    else
      update public.products
        set stock_count = coalesce(stock_count, 0) + v_back, updated_at = now()
        where id = m.product_id
        returning stock_count into v_after;
    end if;

    insert into public.mall_stock_movements (product_id, variant_id, order_id, quantity_change, stock_after, reason)
    values (m.product_id, m.variant_id, p_order_id, v_back, v_after, 'order_cancelled');
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.mall_restore_stock_for_order(uuid) from public, anon, authenticated;
grant execute on function public.mall_restore_stock_for_order(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 13. Refunds. A paid order is never deleted: staff cancel & refund it
--     (lib/payments/server.ts refundOrder). Each refund is a row here —
--     Wishdrop credit (a one-use coupon for the amount) or money back
--     (bank transfer / cash). Safe to re-run.
-- ---------------------------------------------------------------------------
create table if not exists public.refunds (
  id               uuid primary key default gen_random_uuid(),
  checkout_id      uuid references public.checkouts(id) on delete cascade,
  order_id         uuid references public.orders(id) on delete set null,
  user_id          uuid not null references auth.users(id) on delete cascade,
  amount_lkr       numeric(12,2) not null check (amount_lkr > 0),
  method           text not null check (method in ('wishdrop_credit', 'bank_transfer', 'cash', 'other')),
  reference        text,
  coupon_id        uuid references public.coupons(id) on delete set null,
  reason           text not null,
  cancelled_order  boolean not null default false,
  created_by       uuid,
  created_at       timestamptz not null default now()
);
create index if not exists refunds_checkout_idx on public.refunds (checkout_id);
create index if not exists refunds_order_idx on public.refunds (order_id);
create index if not exists refunds_user_idx on public.refunds (user_id, created_at desc);
alter table public.refunds enable row level security;
drop policy if exists "own refunds read" on public.refunds;
create policy "own refunds read" on public.refunds for select using (auth.uid() = user_id);

alter table public.checkouts add column if not exists refunded_lkr numeric(12,2) not null default 0;
alter table public.checkouts add column if not exists refunded_at timestamptz;

-- Coupons created as refund credit: source / via 'refund'.
do $$
declare c record;
begin
  for c in
    select conrelid::regclass::text as tbl, conname
    from pg_constraint
    where contype = 'c'
      and ((conrelid = 'public.coupons'::regclass and pg_get_constraintdef(oid) ilike '%source%')
        or (conrelid = 'public.coupon_allocations'::regclass and pg_get_constraintdef(oid) ilike '%via%'))
  loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
  end loop;
end $$;
alter table public.coupons add constraint coupons_source_check
  check (source in ('admin', 'referral', 'compensation', 'migrated', 'refund'));
alter table public.coupon_allocations add constraint coupon_allocations_via_check
  check (via in ('admin', 'claimed', 'referral', 'compensation', 'migrated', 'refund'));

-- A paid (or refunded) order can't be deleted — cancel & refund it instead.
-- data/reset-all-orders.sql switches this off for its own transaction.
create or replace function public.prevent_paid_order_delete()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('wishdrop.allow_order_delete', true), '') = 'on' then
    return old;
  end if;
  if old.payment_status in ('paid', 'refunded') then
    raise exception 'Order % is paid — cancel and refund it instead of deleting it.', old.display_id
      using errcode = 'P0001';
  end if;
  return old;
end;
$$;
drop trigger if exists orders_prevent_paid_delete on public.orders;
create trigger orders_prevent_paid_delete
  before delete on public.orders
  for each row execute function public.prevent_paid_order_delete();
