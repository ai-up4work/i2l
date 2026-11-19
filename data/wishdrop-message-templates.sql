-- data/wishdrop-message-templates.sql
--
-- Editable customer-message templates (Admin → Settings → Templates).
-- Only CHANGED wording is stored: a row per template the Super Admin has
-- edited. No row = the built-in wording in lib/chat/messageTemplateDefs.ts,
-- so running this changes no messages by itself. "Reset to default" deletes
-- the row.
--
-- Read and written only by the server with the service role
-- (/api/admin/message-templates); RLS is on with no policies.
-- Row changes are recorded by the audit log like every other table.
--
-- Safe to run more than once.

create table if not exists public.message_templates (
  key text primary key,
  body text not null check (length(btrim(body)) > 0 and length(body) <= 1500),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_by_name text
);

alter table public.message_templates enable row level security;

notify pgrst, 'reload schema';
