-- data/wishdrop-media-sweep.sql
--
-- Two read-only helpers for the media cleanup (lib/media-sweep.ts, run
-- daily by /api/cron/media-sweep and on demand from Super Admin →
-- Media cleanup). Safe to run more than once.
--
-- The cleanup deletes every uploaded file (Supabase Storage buckets
-- `uploads` and `chat-attachments`, and Cloudinary's `wishdrop/` folder)
-- that nothing in the database points to any more — replaced photos,
-- removed images, deleted products, cleared chat attachments.
--
-- media_referenced_urls() finds the references WITHOUT a hand-kept list
-- of columns: it reads every text / json / array column of every table
-- in `public` (plus users' profile data in auth.users) and pulls out
-- anything that looks like a Supabase Storage or Cloudinary link. A new
-- table or column added later is covered automatically, so a file can't
-- be deleted just because nobody remembered to add its column here.

create or replace function public.media_referenced_urls()
returns text[]
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  found text[];
  result text[] := '{}';
  -- Everything from the storage marker or Cloudinary host up to the end
  -- of the link. Values are read as JSON text, so a link always ends at
  -- a quote, whitespace or an escape; commas inside links are kept.
  pattern constant text := '(/storage/v1/(?:object|render/image)/public/[^"\s\\<>]+|res\.cloudinary\.com/[^"\s\\<>]+)';
begin
  for r in
    select c.table_schema, c.table_name, c.column_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public'
      -- Logs only record history; an old photo mentioned in a log entry
      -- shouldn't keep the file alive.
      and c.table_name not in ('audit_log', 'media_sweep_runs')
      and (
        c.data_type in ('text', 'character varying', 'json', 'jsonb')
        or (c.data_type = 'ARRAY' and c.udt_name in ('_text', '_varchar'))
      )
  loop
    execute format(
      'select coalesce(array_agg(distinct m[1]), ''{}'') from (select regexp_matches(to_jsonb(%I)::text, %L, ''g'') as m from %I.%I where %I is not null) s',
      r.column_name, pattern, r.table_schema, r.table_name, r.column_name
    ) into found;
    result := result || found;
  end loop;

  -- Profile photos are also kept in the login's own profile data.
  select coalesce(array_agg(distinct m[1]), '{}')
    into found
    from (select regexp_matches(raw_user_meta_data::text, pattern, 'g') as m from auth.users where raw_user_meta_data is not null) s;
  result := result || found;

  return array(select distinct unnest(result));
end;
$$;

-- Every file in the given Storage buckets, as one JSON array
-- ([{bucket, name, created_at, size}]) so the API's row limit can't
-- silently cut the list short.
create or replace function public.media_storage_objects(bucket_ids text[])
returns jsonb
language sql
security definer
set search_path = public, storage, pg_temp
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'bucket', o.bucket_id,
      'name', o.name,
      'created_at', o.created_at,
      'size', coalesce((o.metadata ->> 'size')::bigint, 0)
    )),
    '[]'::jsonb
  )
  from storage.objects o
  where o.bucket_id = any(bucket_ids)
    and o.name not like '%/.emptyFolderPlaceholder'
    and o.name <> '.emptyFolderPlaceholder';
$$;

-- One row per cleanup run, shown on Super Admin → Media cleanup.
create table if not exists public.media_sweep_runs (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  trigger text not null default 'schedule',      -- schedule | manual
  dry_run boolean not null default false,
  status text not null default 'ok',             -- ok | aborted | error
  scanned integer not null default 0,
  orphans integer not null default 0,
  deleted integer not null default 0,
  bytes_freed bigint not null default 0,
  message text,
  report jsonb
);
alter table public.media_sweep_runs enable row level security;
-- No policies: only the server (service role) reads or writes it.

-- Server only (service role). Never callable from the browser.
revoke all on function public.media_referenced_urls() from public, anon, authenticated;
revoke all on function public.media_storage_objects(text[]) from public, anon, authenticated;
grant execute on function public.media_referenced_urls() to service_role;
grant execute on function public.media_storage_objects(text[]) to service_role;
