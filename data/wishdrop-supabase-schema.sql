-- ============================================================================
-- WishDrop — Supabase (Postgres) Schema
-- ============================================================================
-- Generated from: README.md, wishdrop-requirements-and-discussion-summary.md,
-- wishlist-boards-spec.md, loyalty-program.md, wishdrop-admin-route-specs.md,
-- whatsapp-integration-discussion-summary.md, and the actual mock shapes in
-- lib/store.types.ts, types/admin-mock.ts, lib/loyaltyPoints.ts,
-- contexts/{Cartcontext,Wishlistcontext,Ordercontexts,DashboardContext}.tsx.
--
-- PHASES:
--   Phase 1 — needed to wire up public-facing pages with real data
--             (storefront, account, cart, wishlist/boards, requests/chat,
--             orders, reviews, recently-viewed).
--   Phase 2 — retention/loyalty features referenced across account pages
--             (loyalty, referrals, credits, gift cards, coupons, community,
--             notifications). Build once Phase 1 pages are live on real data.
--   Phase 3 — ops/admin backend (staff, sites, purchases, scrape health).
--             Not required for public pages; included so Phase 1 tables
--             (orders, requests, sellers) already have the right FK targets
--             and you don't have to migrate them later.
--
-- Conventions:
--   * All primary keys are uuid, default gen_random_uuid() (pgcrypto).
--   * All user-owned tables carry user_id uuid references auth.users(id).
--   * Money columns are numeric(12,2) in major currency units (matches
--     StoreProduct.price's contract: 89.00, not 8900).
--   * "product_snapshots" is the join point between real catalogue products
--     and the ad-hoc scraped/external products the app already treats as
--     small serializable snapshots (CartProduct / WishlistProduct). Cart,
--     wishlist, boards, and order line items all point at a snapshot
--     instead of duplicating url/title/image/price columns four times.
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- PHASE 1 — Public-facing pages
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Profiles (extends Supabase auth.users)
-- ---------------------------------------------------------------------------
-- Maps: contexts/AuthContext.tsx (AuthUser)

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  phone_verified boolean not null default false,
  avatar_url text,
  chat_handle text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. Address book
-- ---------------------------------------------------------------------------
-- Maps: app/account/address-book/page.tsx

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text,                          -- "Home", "Office"
  recipient_name text not null,
  phone text not null,
  address_line1 text not null,
  address_line2 text,
  city text not null,
  postal_code text,
  country text not null default 'Sri Lanka',
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.addresses (user_id);

-- ---------------------------------------------------------------------------
-- 3. Sellers (feed-integrated + manual-mode)
-- ---------------------------------------------------------------------------
-- Maps: types/admin-mock.ts Seller, data/stores/data.ts AffiliatedStore
-- 'feed' sellers (Shopify/WooCommerce/jsonapi) are read live via
-- lib/store-providers/* — this table just tracks the connection + health,
-- not their product data. 'manual' sellers' actual products live in
-- `products` below.

create type seller_type as enum ('feed', 'manual');
create type seller_status as enum ('active', 'deactivated');
create type store_kind as enum ('marketplace', 'local');

create table public.sellers (
  id uuid primary key default gen_random_uuid(),
  platform_slug text unique not null,   -- URL slug, e.g. 'giva', 'ebay'
  name text not null,
  type seller_type not null,
  store_kind store_kind not null default 'local',
  status seller_status not null default 'active',
  contact_email text,
  logo_url text,
  country text,
  flag_emoji text,
  description text,
  categories text[] default '{}',
  outbound_url text,                    -- AffiliatedStore.url
  -- feed-integrated only
  provider_type text,                   -- 'shopify' | 'woocommerce' | 'jsonapi'
  provider_config jsonb,                -- baseUrl, collectionMap, categoryMap, etc.
  last_sync timestamptz,
  feed_healthy boolean,
  -- manual-mode only
  last_edit timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. Products & variants (manual-mode catalogue only — feed-integrated
--    products are fetched live, not stored)
-- ---------------------------------------------------------------------------
-- Maps: types/admin-mock.ts CatalogueProduct, lib/store.types.ts StoreProduct

create table public.products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  handle text not null,                 -- used in /stores/[platform]/product/[handle]
  name text not null,
  description text,
  full_description text,
  category text,
  condition text,
  tags text[] default '{}',
  gender text check (gender in ('men','women','unisex')),
  sku text,
  cost_price numeric(12,2),             -- ops-only; never expose client-side
  margin_percent numeric(5,2),
  price numeric(12,2) not null,         -- DERIVED at write-time from cost+margin; never hand-typed
  compare_at_price numeric(12,2),
  currency text not null default 'INR',
  weight_kg numeric(8,3),
  images text[] default '{}',
  stock_count integer,                  -- null = unknown, not zero
  average_rating numeric(2,1),
  review_count integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (seller_id, handle)
);
create index on public.products (seller_id);
create index on public.products (active);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  label text not null,                  -- "Size M / Red"
  sku text,
  options jsonb not null default '{}',  -- {"Size":"M","Color":"Red"}
  price numeric(12,2),                  -- overrides product.price when set
  compare_at_price numeric(12,2),
  stock integer not null default 0,
  image_url text,
  available boolean not null default true
);
create index on public.product_variants (product_id);

-- ---------------------------------------------------------------------------
-- 5. Product snapshots — the shared "what did the user actually save/add"
--    record used by cart, wishlist, boards, and order line items. Covers
--    BOTH a real catalogue product AND an arbitrary scraped/external URL
--    (Channel 2/3), matching CartProduct/WishlistProduct's "trimmed
--    serializable snapshot, not the full scrape result" design.
-- ---------------------------------------------------------------------------

create type snapshot_source as enum ('catalogue', 'external');

create table public.product_snapshots (
  id uuid primary key default gen_random_uuid(),
  source snapshot_source not null,
  product_id uuid references public.products(id) on delete set null,   -- set when source='catalogue'
  variant_id uuid references public.product_variants(id) on delete set null,
  url text,                              -- set when source='external'
  site text,                             -- seller/site label for external items
  title text not null,
  image_url text,
  currency text,
  price numeric(12,2),
  captured_at timestamptz not null default now()
);
create index on public.product_snapshots (product_id);

-- ---------------------------------------------------------------------------
-- 6. Collections (curated, cross-seller merchandising shelves)
-- ---------------------------------------------------------------------------
-- Maps: types/admin-mock.ts Collection/CollectionRule

create type collection_filter_type as enum ('auto', 'manual', 'both');

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  filter_type collection_filter_type not null default 'manual',
  rule jsonb,                            -- {tag, minPrice, maxPrice} when filter_type uses 'auto'
  active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

-- manual_add / removed flags reproduce manualProductIds vs. removedProductIds
-- semantics: a manual add always overrides a rule-match removal.
create table public.collection_items (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  manually_added boolean not null default false,
  manually_removed boolean not null default false,
  position integer not null default 0,
  unique (collection_id, product_id)
);

-- ---------------------------------------------------------------------------
-- 7. Discounts / coupons
-- ---------------------------------------------------------------------------
-- Maps: types/admin-mock.ts Discount, components/dashboard/types.ts PromoCode

create type discount_type as enum ('percent', 'fixed');
create type discount_scope as enum ('platform', 'collection', 'products');
create type discount_status as enum ('active', 'expired', 'paused');

create table public.discounts (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  title text,
  type discount_type not null,
  value numeric(12,2) not null,
  scope discount_scope not null default 'platform',
  scope_ids uuid[],                      -- collection or product ids, if scope isn't platform-wide
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  usage_limit integer,                   -- null = unlimited
  usage_count integer not null default 0,
  status discount_status not null default 'active',
  created_at timestamptz not null default now()
);

-- Per-user visibility/claim tracking for the "My promo codes" account page —
-- lets a code be shown as Available/Used/Expired per user without mutating
-- the shared `discounts` row.
create type user_promo_status as enum ('available', 'used', 'expired');

create table public.user_promo_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  discount_id uuid not null references public.discounts(id) on delete cascade,
  status user_promo_status not null default 'available',
  used_on_order_id uuid,                 -- FK added after orders table below
  assigned_at timestamptz not null default now(),
  used_at timestamptz,
  unique (user_id, discount_id)
);

create table public.discount_redemptions (
  id uuid primary key default gen_random_uuid(),
  discount_id uuid not null references public.discounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid,                         -- FK added after orders table below
  amount_applied numeric(12,2) not null,
  redeemed_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 8. Wishlist (flat) + Boards
-- ---------------------------------------------------------------------------
-- Maps: wishlist-boards-spec.md, contexts/Wishlistcontext.tsx

create table public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_snapshot_id uuid not null references public.product_snapshots(id) on delete cascade,
  added_at timestamptz not null default now(),
  unique (user_id, product_snapshot_id)
);

create type board_visibility as enum ('private', 'link', 'public');

create table public.boards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  visibility board_visibility not null default 'private',
  share_token text unique,               -- opaque random token, never sequential
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.boards (user_id);

create table public.board_items (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  product_snapshot_id uuid not null references public.product_snapshots(id) on delete cascade,
  variant jsonb,                         -- {label, value} — saved size/color
  quantity integer not null default 1,
  price_at_save numeric(12,2),           -- for price-drop comparisons
  position integer not null default 0,
  added_at timestamptz not null default now(),
  unique (board_id, product_snapshot_id)
);
create index on public.board_items (board_id);

-- ---------------------------------------------------------------------------
-- 9. Cart (server-persisted — lets a logged-in user's cart survive across
--    devices, replacing localStorage-only persistence)
-- ---------------------------------------------------------------------------
-- Maps: contexts/Cartcontext.tsx CartLineItem

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_snapshot_id uuid not null references public.product_snapshots(id) on delete cascade,
  quantity integer not null default 1,
  selected_options jsonb,                -- {"Size":"M","Color":"Black"}
  added_at timestamptz not null default now(),
  unique (user_id, product_snapshot_id)
);

-- ---------------------------------------------------------------------------
-- 10. Requests (Channel 3 — unscrapeable-link manual review) + Chat
-- ---------------------------------------------------------------------------
-- Maps: types/admin-mock.ts Request/ChatThread/ChatMessage,
--       whatsapp-integration-discussion-summary.md section 4 & 6

create type request_status as enum (
  'sent_for_review', 'pending_quote', 'quoted', 'confirmed', 'rejected'
);

create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid,                       -- FK added after requests below
  order_id uuid,                         -- FK added after orders below
  last_activity timestamptz not null default now(),
  unread boolean not null default true
);

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  link text not null,
  note text,
  screenshot_url text,
  source_domain text not null,           -- logged for the extractor/affiliate backlog signal
  status request_status not null default 'sent_for_review',
  quote numeric(12,2),
  chat_thread_id uuid not null references public.chat_threads(id) on delete cascade,
  assigned_staff_id uuid,                -- FK added in Phase 3 (staff_accounts)
  submitted_at timestamptz not null default now()
);
alter table public.chat_threads
  add constraint chat_threads_request_fk foreign key (request_id) references public.requests(id) on delete set null;

create table public.request_quote_history (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  amount numeric(12,2) not null,
  staff_id uuid,                         -- FK added in Phase 3
  created_at timestamptz not null default now()
);

create type chat_sender as enum ('customer', 'staff');

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  sender chat_sender not null,
  sender_name text not null,
  text text,
  attachment_url text,
  request_id uuid references public.requests(id) on delete set null,
  sent_via_whatsapp boolean not null default false,   -- manual wa.me deep-link click, never auto-synced
  created_at timestamptz not null default now()
);
create index on public.chat_messages (thread_id, created_at);

-- ---------------------------------------------------------------------------
-- 11. Orders
-- ---------------------------------------------------------------------------
-- Maps: contexts/Ordercontexts.tsx Order/OrderItem, types/admin-mock.ts Order
-- Pipeline: Ordered -> Quality check -> Shipped -> Delivered (+ Cancelled)

create type order_stage as enum ('ordered', 'quality_check', 'shipped', 'delivered', 'cancelled');
create type order_seller_type as enum ('store', 'individual');

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  display_id text unique not null,       -- customer-facing "WD-10499" style id
  user_id uuid not null references auth.users(id) on delete cascade,
  channel smallint not null check (channel in (1,2,3)),
  stage order_stage not null default 'ordered',
  currency text not null default 'LKR',
  total_value numeric(12,2) not null default 0,
  delayed boolean not null default false,
  site_id uuid,                          -- FK added in Phase 3 (sites)
  request_id uuid references public.requests(id) on delete set null,   -- set when channel = 3
  chat_thread_id uuid references public.chat_threads(id) on delete set null,
  recipient_address_id uuid references public.addresses(id) on delete set null,
  carrier text,
  tracking_number text,
  estimated_delivery text,
  delivered_confirmed_by text check (delivered_confirmed_by in ('warehouse','customer')),
  created_at timestamptz not null default now(),
  stage_entered_at timestamptz not null default now()
);
alter table public.chat_threads
  add constraint chat_threads_order_fk foreign key (order_id) references public.orders(id) on delete set null;
alter table public.user_promo_codes
  add constraint user_promo_codes_order_fk foreign key (used_on_order_id) references public.orders(id) on delete set null;
alter table public.discount_redemptions
  add constraint discount_redemptions_order_fk foreign key (order_id) references public.orders(id) on delete set null;
create index on public.orders (user_id);
create index on public.orders (stage);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_snapshot_id uuid references public.product_snapshots(id) on delete set null,
  title text not null,
  variant_label text,                    -- "Size UK 9"
  quantity integer not null default 1,
  unit_price numeric(12,2) not null,
  seller_name text,
  seller_type order_seller_type,
  store_url text,
  request_link text,                     -- channel 3 only
  screenshot_url text                    -- channel 3 only
);
create index on public.order_items (order_id);

create table public.order_stage_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  stage order_stage not null,
  by_staff_id uuid,                      -- FK added in Phase 3; null/'system' for automated transitions
  note text,
  created_at timestamptz not null default now()
);
create index on public.order_stage_history (order_id, created_at);

-- ---------------------------------------------------------------------------
-- 12. Reviews
-- ---------------------------------------------------------------------------

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  order_item_id uuid references public.order_items(id) on delete set null,  -- non-null => verified purchase
  rating smallint not null check (rating between 1 and 5),
  title text,
  body text,
  images text[] default '{}',
  created_at timestamptz not null default now()
);
create index on public.reviews (product_id);

-- ---------------------------------------------------------------------------
-- 13. Recently viewed
-- ---------------------------------------------------------------------------

create table public.recently_viewed (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_snapshot_id uuid not null references public.product_snapshots(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  unique (user_id, product_snapshot_id)
);

-- ============================================================================
-- PHASE 2 — Retention & community (build once Phase 1 pages read real data)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 14. Loyalty
-- ---------------------------------------------------------------------------
-- Maps: lib/loyaltyPoints.ts (current model — spend-linked + one-time
-- milestones + daily check-in). Tier is always DERIVED from points, never
-- stored — compute client/server-side from TIER_THRESHOLDS.
-- Note: loyalty-program.md describes an earlier prototype (capped
-- per-action engagement points); lib/loyaltyPoints.ts superseded it by
-- removing repeatable engagement points in favor of one-time milestones —
-- this schema follows the current code.

create table public.loyalty_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  points integer not null default 0,
  last_check_in_at date,
  claimed_order_ids uuid[] default '{}',     -- dedupe: pointsForOrder fires once per order
  created_at timestamptz not null default now()
);

create type loyalty_source as enum ('order', 'milestone', 'checkin', 'referral', 'broadcast', 'admin');

create table public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null,
  source loyalty_source not null,
  source_ref text,                       -- order id / milestone key / campaign id
  label text,
  created_at timestamptz not null default now()
);
create index on public.loyalty_transactions (user_id, created_at);

create table public.loyalty_milestones_claimed (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  milestone_key text not null,           -- 'firstPurchase' | 'mobileVerified' | 'firstBoardShared' | 'fiveOrdersCompleted'
  claimed_at timestamptz not null default now(),
  unique (user_id, milestone_key)
);

-- ---------------------------------------------------------------------------
-- 15. Referrals
-- ---------------------------------------------------------------------------

create type referral_status as enum ('invited', 'joined', 'rewarded');

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references auth.users(id) on delete cascade,
  referred_user_id uuid references auth.users(id) on delete set null,
  referred_contact text,                 -- email/phone before they sign up
  code text unique not null,
  status referral_status not null default 'invited',
  joined_at timestamptz,
  rewarded_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 16. Credits wallet & Gift cards
-- ---------------------------------------------------------------------------
-- Maps: components/dashboard/types.ts CreditTransaction, app/account/wallet,
-- app/account/gift-card

create table public.credit_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance numeric(12,2) not null default 0
);

create type credit_transaction_type as enum ('earned', 'redeemed', 'expired');

create table public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12,2) not null,
  type credit_transaction_type not null,
  label text,
  related_order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.gift_cards (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  initial_value numeric(12,2) not null,
  balance numeric(12,2) not null,
  purchased_by uuid references auth.users(id) on delete set null,
  recipient_email text,
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  redeemed boolean not null default false
);

-- ---------------------------------------------------------------------------
-- 17. Community
-- ---------------------------------------------------------------------------
-- Maps: components/dashboard/types.ts CommunityPost,
-- app/(public)/community/discover/recommended, app/account/community,
-- app/account/my-following

create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tag text,
  content text not null,
  image_url text,
  likes_count integer not null default 0,
  comments_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.community_likes (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

-- 'followed_type' lets one table cover following a seller/store AND
-- following another community user from the same "My following" page.
create type follow_target_type as enum ('seller', 'user');

create table public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references auth.users(id) on delete cascade,
  followed_type follow_target_type not null,
  followed_id uuid not null,             -- points at sellers.id or auth.users.id depending on type
  created_at timestamptz not null default now(),
  unique (follower_id, followed_type, followed_id)
);

-- ---------------------------------------------------------------------------
-- 18. Notifications
-- ---------------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,                    -- 'order_update' | 'price_drop' | 'chat_reply' | ...
  title text not null,
  body text,
  link text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, read);

-- ============================================================================
-- PHASE 3 — Ops/Admin backend (not required for public pages)
-- ============================================================================

create type staff_role as enum ('manager', 'sales', 'warehouse', 'super_admin');
create type staff_status as enum ('active', 'deactivated');

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text not null,
  headcount integer not null default 0,
  active boolean not null default true
);
alter table public.orders
  add constraint orders_site_fk foreign key (site_id) references public.sites(id) on delete set null;

create table public.staff_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,  -- link to Supabase auth for staff login
  name text not null,
  email text unique not null,
  role staff_role not null,
  site_id uuid references public.sites(id) on delete set null,  -- only meaningful for role='warehouse'
  status staff_status not null default 'active',
  last_login timestamptz
);
alter table public.requests
  add constraint requests_staff_fk foreign key (assigned_staff_id) references public.staff_accounts(id) on delete set null;
alter table public.request_quote_history
  add constraint request_quote_history_staff_fk foreign key (staff_id) references public.staff_accounts(id) on delete set null;
alter table public.order_stage_history
  add constraint order_stage_history_staff_fk foreign key (by_staff_id) references public.staff_accounts(id) on delete set null;

create table public.order_internal_notes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  staff_id uuid not null references public.staff_accounts(id),
  text text not null,
  created_at timestamptz not null default now()
);

create type purchase_status as enum ('pending', 'purchased', 'failed');

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  request_id uuid references public.requests(id) on delete set null,
  channel smallint not null check (channel in (1,2,3)),
  source_store text not null,
  amount numeric(12,2) not null,
  status purchase_status not null default 'pending',
  receipt_ref text,
  fail_reason text,
  outbound_payment jsonb,                -- {amount, method, reference, timestamp}
  created_at timestamptz not null default now()
);

create table public.scrape_health (
  domain text primary key,
  fail_count integer not null default 0,
  success_count integer not null default 0,
  last_failure timestamptz,
  linked_seller_id uuid references public.sellers(id) on delete set null
);

create table public.seller_extraction_history (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  url text not null,
  succeeded boolean not null,
  error_message text,
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references public.staff_accounts(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Row Level Security — Phase 1 essentials
-- ============================================================================
-- Pattern: every user-owned table restricts select/insert/update/delete to
-- auth.uid() = user_id. Public catalog data (products, sellers, collections,
-- discounts) is readable by anyone, writable only via the service role
-- (i.e. from admin routes using the Supabase service key, not client-side).

alter table public.profiles enable row level security;
create policy "own profile" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);

alter table public.addresses enable row level security;
create policy "own addresses" on public.addresses for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.products enable row level security;
create policy "public read products" on public.products for select using (active = true);

alter table public.product_variants enable row level security;
create policy "public read variants" on public.product_variants for select using (true);

alter table public.collections enable row level security;
create policy "public read collections" on public.collections for select using (active = true);

alter table public.discounts enable row level security;
create policy "public read active discounts" on public.discounts for select using (status = 'active');

alter table public.wishlist_items enable row level security;
create policy "own wishlist" on public.wishlist_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.boards enable row level security;
create policy "own boards" on public.boards for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "public read shared boards" on public.boards for select using (visibility in ('link', 'public'));

alter table public.board_items enable row level security;
create policy "own board items" on public.board_items for all using (
  exists (select 1 from public.boards b where b.id = board_id and b.user_id = auth.uid())
);
create policy "read items of shared boards" on public.board_items for select using (
  exists (select 1 from public.boards b where b.id = board_id and b.visibility in ('link','public'))
);

alter table public.cart_items enable row level security;
create policy "own cart" on public.cart_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.requests enable row level security;
create policy "own requests" on public.requests for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.chat_threads enable row level security;
create policy "own chat threads" on public.chat_threads for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.chat_messages enable row level security;
create policy "own thread messages" on public.chat_messages for all using (
  exists (select 1 from public.chat_threads t where t.id = thread_id and t.user_id = auth.uid())
);

alter table public.orders enable row level security;
create policy "own orders" on public.orders for select using (auth.uid() = user_id);

alter table public.order_items enable row level security;
create policy "own order items" on public.order_items for select using (
  exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
);

alter table public.reviews enable row level security;
create policy "public read reviews" on public.reviews for select using (true);
create policy "own reviews write" on public.reviews for insert with check (auth.uid() = user_id);

alter table public.recently_viewed enable row level security;
create policy "own recently viewed" on public.recently_viewed for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Phase 2 RLS (add when those tables go live)
alter table public.loyalty_accounts enable row level security;
create policy "own loyalty" on public.loyalty_accounts for select using (auth.uid() = user_id);

alter table public.credit_wallets enable row level security;
create policy "own wallet" on public.credit_wallets for select using (auth.uid() = user_id);

alter table public.notifications enable row level security;
create policy "own notifications" on public.notifications for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Staff/admin tables (Phase 3) intentionally have NO client-facing RLS
-- policy here — access them only through server-side routes using the
-- Supabase service role key, gated by your own staff-role checks (Manager /
-- Sales & Purchase / Warehouse / Super Admin), matching wishdrop-admin-route-specs.md.
