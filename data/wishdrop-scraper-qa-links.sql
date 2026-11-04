-- data/wishdrop-scraper-qa-links.sql
--
-- Saved test links for the scraper QA page (/demo/scraper-qa, Super Admin).
-- The page runs each link through the exact customer item-screen flow and
-- records how it went (what the customer would see, how long it took), so
-- the team keeps one shared list of links to re-check after scraper changes.
--
-- Only the server (service role) reads or writes this table; the browser
-- goes through /api/admin/scraper-qa/links. Safe to run more than once.

create table if not exists public.scraper_qa_links (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  label text,
  note text,
  -- The tester's verdict.
  status text not null default 'untested' check (status in ('untested', 'pass', 'fail')),
  -- What the last run showed the "customer":
  --   product      buyable product page (price found)
  --   needs_check  partial read — the chat screen with name/photo
  --   unreadable   couldn't load — the chat screen
  --   redirect     one of our own stores — opens our store page
  last_outcome text check (last_outcome is null or last_outcome in ('product', 'needs_check', 'unreadable', 'redirect')),
  last_ms integer,
  last_site text,
  last_title text,
  last_price text,
  last_error text,
  last_fresh boolean,
  last_run_at timestamptz,
  created_by uuid references public.staff_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scraper_qa_links_updated_idx on public.scraper_qa_links (updated_at desc);

alter table public.scraper_qa_links enable row level security;
-- No policies: browser clients get nothing; the API uses the service role.

notify pgrst, 'reload schema';
