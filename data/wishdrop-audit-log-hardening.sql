-- ============================================================================
-- Wishdrop — AUDIT LOG: TAMPER-PROOFING + 60-DAY RETENTION.
-- Run in the Supabase SQL editor AFTER wishdrop-audit-log.sql and
-- wishdrop-audit-log-everything.sql. Safe to run more than once.
-- ============================================================================
--  * Rows can NEVER be edited. Rows can only be deleted once they are older
--    than 60 days (the retention rule) — by anyone, however they connect.
--    The old "housekeeping switch" that let someone bypass this is removed.
--  * TRUNCATE and DROP of the table are blocked.
--  * Each row is chained to the one before it with a SHA-256 hash, so a
--    changed, inserted-in-the-middle or removed row is detected by
--    select * from audit_verify_chain();
--  * Each row also records the database login and app it came from
--    (db_user, app_name), so SQL-editor / script use is visible.
--  * Old rows are purged automatically (pg_cron daily, plus a safety purge
--    each time a super admin opens the Audit log page). Every purge writes
--    its own audit row saying how many entries were removed and which dates.
--  * Staff sign-ins are recorded.
--  * Anyone disabling/dropping an audit trigger is recorded (where the
--    database allows event triggers).
--  * select * from audit_coverage;  shows every table and whether it's audited.
-- ============================================================================

-- 0. Columns for the hash chain and the source of each row.
alter table public.audit_log add column if not exists prev_hash text;
alter table public.audit_log add column if not exists row_hash  text;
alter table public.audit_log add column if not exists db_user   text;
alter table public.audit_log add column if not exists app_name  text;

revoke all on public.audit_log from anon, authenticated;
alter table public.audit_log enable row level security;
alter table public.audit_log force row level security;

-- 1. Hash chain + source stamping (runs before every insert).
create or replace function public.audit_log_chain()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev text;
begin
  -- one writer at a time, so the chain has a single order
  perform pg_advisory_xact_lock(8675309);
  select row_hash into v_prev from public.audit_log where row_hash is not null order by id desc limit 1;
  new.prev_hash := v_prev;
  new.db_user   := session_user::text || case when current_user <> session_user then ' as ' || current_user else '' end;
  new.app_name  := left(coalesce(nullif(current_setting('application_name', true), ''), ''), 120);
  new.row_hash  := encode(sha256(convert_to(
      coalesce(v_prev, '') || '|' || new.id::text || '|' || new.at::text || '|' ||
      coalesce(new.actor_user_id::text, '') || '|' || new.action || '|' || new.entity_type || '|' ||
      coalesce(new.entity_id, '') || '|' || new.summary || '|' ||
      coalesce(new.changes::text, '') || '|' || coalesce(new.snapshot::text, ''), 'utf8')), 'hex');
  return new;
end $$;
drop trigger if exists audit_log_chain_t on public.audit_log;
create trigger audit_log_chain_t before insert on public.audit_log
  for each row execute function public.audit_log_chain();

-- 2. Append-only, with the 60-day retention exception. No bypass switch.
create or replace function public.audit_log_append_only()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'DELETE' and old.at < now() - interval '60 days' then
    return old;   -- retention: only entries older than 60 days can go
  end if;
  raise exception 'The audit log can''t be changed, and entries can only be removed after 60 days.' using errcode = 'P0001';
end $$;
drop trigger if exists audit_log_no_change on public.audit_log;
create trigger audit_log_no_change before update or delete on public.audit_log
  for each row execute function public.audit_log_append_only();

create or replace function public.audit_log_no_truncate()
returns trigger language plpgsql as $$
begin
  raise exception 'The audit log can''t be truncated.' using errcode = 'P0001';
end $$;
drop trigger if exists audit_log_no_truncate_t on public.audit_log;
create trigger audit_log_no_truncate_t before truncate on public.audit_log
  for each statement execute function public.audit_log_no_truncate();

-- 3. Retention: delete entries older than 60 days, and record that we did.
create or replace function public.audit_purge()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer; v_oldest timestamptz; v_newest timestamptz;
begin
  select count(*), min(at), max(at) into v_n, v_oldest, v_newest
    from public.audit_log where at < now() - interval '60 days';
  if v_n = 0 then return 0; end if;
  insert into public.audit_log (actor_role, actor_name, action, entity_type, severity, summary, changes)
  values ('system', 'Retention job', 'deleted', 'audit log', 'info',
          format('Removed %s audit entries older than 60 days (%s to %s)', v_n, v_oldest::date, v_newest::date),
          jsonb_build_object('removed', v_n, 'from', v_oldest, 'to', v_newest, 'retention_days', 60));
  delete from public.audit_log where at < now() - interval '60 days';
  return v_n;
end $$;
revoke all on function public.audit_purge() from public, anon, authenticated;
grant execute on function public.audit_purge() to service_role;

-- Daily at 03:30 Sri Lanka time (22:00 UTC). Needs the pg_cron extension
-- (Supabase: Database -> Extensions -> pg_cron). If it isn't available the
-- Audit log page still purges whenever a super admin opens it.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'wishdrop-audit-purge';
  perform cron.schedule('wishdrop-audit-purge', '0 22 * * *', 'select public.audit_purge()');
exception when others then
  raise notice 'pg_cron not enabled (%): purge will run from the Audit log page instead.', sqlerrm;
end $$;

-- 4. Verify the chain. Returns the rows that don't match (empty = intact).
create or replace function public.audit_verify_chain()
returns table (id bigint, problem text)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record; v_prev text := null; v_first boolean := true; v_calc text;
begin
  for r in select * from public.audit_log where row_hash is not null order by public.audit_log.id loop
    if not v_first and r.prev_hash is distinct from v_prev then
      id := r.id; problem := 'chain broken: an entry before this one was removed or altered'; return next;
    end if;
    v_calc := encode(sha256(convert_to(
      coalesce(r.prev_hash, '') || '|' || r.id::text || '|' || r.at::text || '|' ||
      coalesce(r.actor_user_id::text, '') || '|' || r.action || '|' || r.entity_type || '|' ||
      coalesce(r.entity_id, '') || '|' || r.summary || '|' ||
      coalesce(r.changes::text, '') || '|' || coalesce(r.snapshot::text, ''), 'utf8')), 'hex');
    if v_calc <> r.row_hash then
      id := r.id; problem := 'entry content was changed'; return next;
    end if;
    v_prev := r.row_hash; v_first := false;
  end loop;
end $$;
revoke all on function public.audit_verify_chain() from public, anon, authenticated;
grant execute on function public.audit_verify_chain() to service_role;

-- 5. Staff sign-ins (auth.users.last_sign_in_at changes on every login).
create or replace function public.audit_staff_signin()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_name text; v_role text; v_staff uuid;
begin
  if new.last_sign_in_at is distinct from old.last_sign_in_at then
    select id, name, role::text into v_staff, v_name, v_role from public.staff_accounts where user_id = new.id limit 1;
    if v_staff is not null then
      insert into public.audit_log (actor_user_id, actor_staff_id, actor_name, actor_role, action, entity_type, entity_label, severity, summary)
      values (new.id, v_staff, v_name, v_role, 'created', 'sign-in', new.email, 'info', coalesce(v_name, new.email) || ' signed in');
    end if;
  end if;
  return new;
exception when others then
  return new;
end $$;
do $$
begin
  drop trigger if exists audit_staff_signin_t on auth.users;
  create trigger audit_staff_signin_t after update of last_sign_in_at on auth.users
    for each row execute function public.audit_staff_signin();
exception when others then
  raise notice 'Could not attach the sign-in recorder to auth.users (%): skipped.', sqlerrm;
end $$;

-- 6. Someone switching the audit off: record it (and refuse to drop the table).
create or replace function public.audit_ddl_watch()
returns event_trigger
language plpgsql
security definer
set search_path = public
as $$
declare r record;
begin
  for r in select * from pg_event_trigger_ddl_commands() loop
    if r.object_identity ilike 'public.audit\_log%' then
      insert into public.audit_log (actor_role, actor_name, action, entity_type, severity, summary, db_user)
      values ('system', session_user::text, 'updated', 'audit configuration', 'critical',
              r.command_tag || ' on ' || r.object_identity, session_user::text);
    end if;
  end loop;
end $$;
create or replace function public.audit_ddl_block_drop()
returns event_trigger
language plpgsql
security definer
set search_path = public
as $$
declare r record;
begin
  for r in select * from pg_event_trigger_dropped_objects() loop
    if r.object_name = 'audit_log' and r.object_type = 'table' then
      raise exception 'The audit log table can''t be dropped.' using errcode = 'P0001';
    end if;
    -- A recorder being removed can't be stopped, but it is always on record.
    if r.object_type = 'trigger' and r.object_identity like 'audit\_%' then
      insert into public.audit_log (actor_role, actor_name, action, entity_type, severity, summary, db_user)
      values ('system', session_user::text, 'deleted', 'audit configuration', 'critical',
              'Audit recorder removed: ' || r.object_identity, session_user::text);
    end if;
  end loop;
end $$;
do $$
begin
  drop event trigger if exists audit_ddl_watch_t;
  create event trigger audit_ddl_watch_t on ddl_command_end execute function public.audit_ddl_watch();
  drop event trigger if exists audit_ddl_block_t;
  create event trigger audit_ddl_block_t on sql_drop execute function public.audit_ddl_block_drop();
exception when others then
  raise notice 'Event triggers not permitted on this database (%): DDL watching skipped.', sqlerrm;
end $$;

-- 7. Coverage report: every table, audited or not.
create or replace view public.audit_coverage as
select c.relname as table_name,
       exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname like 'audit\_%' and not t.tgisinternal) as audited,
       (select string_agg(regexp_replace(t.tgname, '^audit_', ''), ', ') from pg_trigger t where t.tgrelid = c.oid and t.tgname like 'audit\_%' and not t.tgisinternal) as recorders
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by audited, c.relname;
revoke all on public.audit_coverage from public, anon, authenticated;
grant select on public.audit_coverage to service_role;
