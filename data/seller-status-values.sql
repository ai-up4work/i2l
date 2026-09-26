-- ============================================================================
-- seller_status: add the values the app actually uses
-- ============================================================================
-- The original schema created
--   create type seller_status as enum ('active', 'deactivated');
-- but the Sellers admin (data/sellers/data.ts, app/api/admin/sellers/**)
-- and Wishdrop Mall use 'active' | 'pending_review' | 'inactive'.
-- Without these, creating a seller with an unverified feed, deactivating
-- a seller, or setting up Wishdrop Mall fails with:
--   invalid input value for enum seller_status: "inactive"
--
-- Safe to run more than once.
-- ============================================================================

alter type public.seller_status add value if not exists 'pending_review';
alter type public.seller_status add value if not exists 'inactive';

-- ----------------------------------------------------------------------------
-- OPTIONAL, run SEPARATELY afterwards (Postgres won't let a new enum value
-- be used in the same transaction that added it):
--
--   update public.sellers set status = 'inactive' where status = 'deactivated';
--
-- The app never writes 'deactivated' for sellers and shows it as unknown,
-- so this tidies any seller rows that still carry the old value.
-- ----------------------------------------------------------------------------
