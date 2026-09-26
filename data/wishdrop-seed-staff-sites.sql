-- data/Wishdrop-seed-staff-sites.sql
--
-- Seeds `sites` and `staff_accounts` with fixed UUIDs matching the mock
-- role-switcher identities in contexts/AdminDataContext.tsx (SITES,
-- MOCK_USERS, STAFF_DIRECTORY). Run this once against your Supabase
-- project (SQL Editor, or `psql`/`supabase db execute`) before using any
-- admin action that WRITES to an order — advancing/rolling back a
-- pipeline stage, adding an internal note, passing QC, marking an order
-- packed, reassigning a site, or confirming delivery. All of those go
-- through lib/supabase/orders-admin.ts, which now writes the *real*
-- `currentUser.id` from the role switcher into `order_stage_history.by_staff_id`
-- and `order_internal_notes.staff_id` (NOT NULL, foreign-keyed to
-- staff_accounts.id) — so those rows have to actually exist first, or every
-- write fails with a foreign-key violation (or, with the old non-UUID mock
-- ids like "u_mgr_1", an "invalid input syntax for type uuid" error before
-- the FK check even runs).
--
-- Reads (orders lists, order detail, purchases, dashboards) do NOT need
-- this — they'll work today regardless. Only writes need it.
--
-- If you ever change an id in AdminDataContext.tsx's SITES/MOCK_USERS/
-- STAFF_DIRECTORY, update the matching row below to match, or the two
-- will drift out of sync again exactly like this bug did.

insert into public.sites (id, name, location, headcount, active) values
  ('e166db30-47fe-466d-b5ee-2f600300c50f', 'Colombo Hub', 'Colombo, LK', 6, true),
  ('925ea5ba-e910-4d7b-a351-13b06cda235f', 'Kandy Hub',   'Kandy, LK',   3, true),
  ('ef990cda-4177-419d-967a-f9e966bf389e', 'Galle Hub',   'Galle, LK',   3, true)
on conflict (id) do update set
  name = excluded.name,
  location = excluded.location;

insert into public.staff_accounts (id, user_id, name, email, role, site_id, status) values
  ('20910cf1-6c79-4891-b7b0-15fcf8fd636a', null, 'Amara Perera',          'amara.perera@Wishdrop.shop',          'manager',   null,                                      'active'),
  ('857f794e-d28d-4800-b17e-4b1393461dda', null, 'Nadia Fernando',        'nadia.fernando@Wishdrop.shop',        'sales',     null,                                      'active'),
  ('e03e6489-a4d4-43ca-a43c-d415403ce80c', null, 'Ruvindi Jayasekara',    'ruvindi.jayasekara@Wishdrop.shop',    'sales',     null,                                      'active'),
  ('00af059b-624d-4b31-9956-ed1c0feff14e', null, 'Kasun Silva',           'kasun.silva@Wishdrop.shop',           'warehouse', 'e166db30-47fe-466d-b5ee-2f600300c50f',   'active'),
  ('6e37890f-346f-4a55-a779-8320765a452d', null, 'Dimuthu Rajapaksha',    'dimuthu.rajapaksha@Wishdrop.shop',    'warehouse', '925ea5ba-e910-4d7b-a351-13b06cda235f',   'active'),
  ('3ed33c0b-b888-4660-9360-418f36e556ac', null, 'Harshani Weerasinghe',  'harshani.weerasinghe@Wishdrop.shop',  'warehouse', 'ef990cda-4177-419d-967a-f9e966bf389e',   'active'),
  ('12f50202-9165-4dd3-accf-6116137ce9c1', null, 'Pasan Gunathilaka',     'pasan.gunathilaka@Wishdrop.shop',     'warehouse', 'e166db30-47fe-466d-b5ee-2f600300c50f',   'active')
on conflict (id) do update set
  name = excluded.name,
  email = excluded.email,
  role = excluded.role,
  site_id = excluded.site_id,
  status = excluded.status;

-- Sanity check — should return 3 sites and 7 staff.
-- select count(*) from public.sites;
-- select count(*) from public.staff_accounts;
