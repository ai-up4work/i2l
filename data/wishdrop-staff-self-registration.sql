-- data/Wishdrop-staff-self-registration.sql
--
-- Adds self-service admin registration with Manager/Super Admin
-- approval — a reliable alternative to the one-time invite-link flow,
-- which kept breaking in production on this project's live Supabase
-- Redirect URLs configuration (see app/admin/invite/page.tsx and
-- app/admin/login/page.tsx's own doc comments for that saga: a
-- one-time link that dies to email/chat link-preview crawlers, or that
-- silently bounces to the wrong page if the redirect target isn't on
-- Supabase's allow-list). Self-registration sidesteps all of that:
-- there is no email step and no one-time token at all.
--
-- Flow: a person registers themselves with their own email + password
-- at /admin/register. The resulting staff_accounts row starts life as
-- status='pending' with role = NULL — they have a real, working
-- Supabase Auth login, but /api/admin/auth/me and middleware.ts's
-- getStaffRole both treat anything other than status='active' as "not
-- staff," so a pending account cannot reach anything under /admin/**
-- until a Manager or Super Admin reviews the request (see
-- app/api/admin/staff/[staffId]/route.ts's PATCH) and assigns a real
-- role, which also flips status to 'active'.
--
-- ============================================================
-- RUN THIS FILE IN TWO SEPARATE STEPS — do not run it all at once.
-- ============================================================
-- Postgres refuses to let a brand-new enum value be referenced —
-- even just written literally inside a CHECK constraint, which is
-- what STEP 2 below does — in the same transaction that added it.
-- Supabase's SQL editor runs everything you paste in as one
-- transaction, so STEP 1 and STEP 2 must be two separate "Run" clicks,
-- not one. Running STEP 2 before STEP 1 has been committed produces
-- exactly this error:
--   ERROR: 55P04: unsafe use of new value "pending" of enum type staff_status
--   HINT: New enum values must be committed before they can be used.
--
-- Both steps are individually idempotent — safe to re-run either one.

-- ---------------------------------------------------------------
-- STEP 1 — run this alone first, then wait for it to finish/commit
-- before running anything below.
-- ---------------------------------------------------------------

alter type staff_status add value if not exists 'pending';

-- ---------------------------------------------------------------
-- STEP 2 — run this only after STEP 1 above has completed as its own
-- separate query.
-- ---------------------------------------------------------------

-- role is now only required once an account is actually active — a
-- pending registration hasn't been assigned one yet, and nobody should
-- be able to grant themselves one just by registering.
alter table public.staff_accounts alter column role drop not null;

alter table public.staff_accounts
  drop constraint if exists staff_accounts_role_required_unless_pending;
alter table public.staff_accounts
  add constraint staff_accounts_role_required_unless_pending
  check (status = 'pending' or role is not null);

-- What the applicant said they're applying for — purely informational
-- for whoever reviews the request. The actual `role` granted always
-- comes from an explicit choice by the approver (see the PATCH route),
-- never copied from this automatically, so requesting a role is never
-- the same as being granted it.
alter table public.staff_accounts add column if not exists requested_role staff_role;
