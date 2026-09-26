-- data/Wishdrop-unique-chat-handles.sql
--
-- Every customer gets a UNIQUE chat handle, stored in profiles.chat_handle
-- (without the "@"). Before this, nothing ever set chat_handle, so the app
-- derived "@firstname" on the fly — two customers called Kavindi were both
-- "@kavindi" in chat, WhatsApp messages and the admin inbox.
--
-- Handles: first name, lowercased, letters/digits only, max 15 chars.
-- If taken, a number is added: kavindi, kavindi2, kavindi3, …
-- Case-insensitive: "Kavindi" and "kavindi" count as the same handle.
--
-- 1. generate_chat_handle(name, email) picks the next free handle
--    (titles like "Dr." skipped, accents plain: Émile → emile).
-- 2. A BEFORE INSERT trigger fills chat_handle for every new profile,
--    however the profile is created.
-- 3. Existing profiles without a handle are backfilled, one row at a time
--    (so each sees the handles assigned before it).
-- 4. A case-insensitive unique index makes duplicates impossible.
--
-- Idempotent — safe to run more than once.

create or replace function public.chat_handle_key(h text)
returns text
language sql
immutable
as $$ select lower(regexp_replace(coalesce(h, ''), '^@+', '')) $$;

create or replace function public.generate_chat_handle(p_name text, p_email text)
returns text
language plpgsql
as $$
declare
  words text[];
  word text;
  base text := '';
  candidate text;
  n integer := 1;
begin
  -- First real word of the name: skip titles (Dr., Mr, Mrs…), keep
  -- accented Latin letters as plain letters (Émile → emile). Names in
  -- other scripts (Sinhala, Tamil) have no a–z letters, so they fall
  -- through to the email below.
  words := regexp_split_to_array(lower(btrim(coalesce(p_name, ''))), '\s+');
  foreach word in array coalesce(words, array[]::text[]) loop
    word := translate(word, 'áàâäãåāéèêëēíìîïīóòôöõøōúùûüūçñýÿ', 'aaaaaaaeeeeeiiiiioooooooouuuuucnyy');
    word := regexp_replace(word, '[^a-z0-9]', '', 'g');
    continue when word = '' or word in ('dr', 'mr', 'mrs', 'ms', 'miss', 'mx', 'rev', 'prof', 'sir', 'madam');
    base := word;
    exit;
  end loop;
  if base = '' then
    base := regexp_replace(lower(split_part(coalesce(p_email, ''), '@', 1)), '[^a-z0-9]', '', 'g');
  end if;
  if base = '' then
    base := 'customer';
  end if;
  base := left(base, 15);

  loop
    candidate := case when n = 1 then base else base || n::text end;
    exit when not exists (
      select 1 from public.profiles where public.chat_handle_key(chat_handle) = candidate
    );
    n := n + 1;
  end loop;
  return candidate;
end;
$$;

create or replace function public.assign_chat_handle()
returns trigger
language plpgsql
as $$
begin
  if new.chat_handle is null or btrim(new.chat_handle) = '' then
    -- Serialize handle picking so two sign-ups at the same instant can't
    -- both choose "kavindi2". Held only until this transaction ends.
    perform pg_advisory_xact_lock(hashtext('Wishdrop_chat_handle'));
    new.chat_handle := public.generate_chat_handle(new.full_name, new.email);
  else
    new.chat_handle := public.chat_handle_key(new.chat_handle);
  end if;
  return new;
end;
$$;

drop trigger if exists assign_chat_handle on public.profiles;
create trigger assign_chat_handle
  before insert on public.profiles
  for each row execute function public.assign_chat_handle();

-- Tidy handles that were set by hand ("@Kasun" → "kasun") BEFORE
-- backfilling, so the generator sees them. If two tidy to the same
-- handle, the later one gets a number.
do $$
declare
  r record;
  wanted text;
begin
  perform pg_advisory_xact_lock(hashtext('Wishdrop_chat_handle'));
  for r in
    select id, chat_handle, created_at from public.profiles
    where chat_handle is not null and btrim(chat_handle) <> ''
      and chat_handle <> public.chat_handle_key(chat_handle)
    order by created_at, id
  loop
    wanted := regexp_replace(public.chat_handle_key(r.chat_handle), '[^a-z0-9_.]', '', 'g');
    -- Clash only with handles that are already tidy, or belong to
    -- someone who had theirs first — the earliest owner keeps it.
    if wanted = '' or exists (
      select 1 from public.profiles p
      where p.id <> r.id
        and public.chat_handle_key(p.chat_handle) = wanted
        and (p.chat_handle = public.chat_handle_key(p.chat_handle)
             or (p.created_at, p.id) < (r.created_at, r.id))
    ) then
      wanted := public.generate_chat_handle(coalesce(nullif(wanted, ''), 'customer'), null);
    end if;
    update public.profiles set chat_handle = wanted where id = r.id;
  end loop;
end;
$$;

-- Backfill existing customers, oldest first (earliest sign-ups keep the
-- plain first-name handle).
do $$
declare
  r record;
begin
  perform pg_advisory_xact_lock(hashtext('Wishdrop_chat_handle'));
  for r in
    select id, full_name, email from public.profiles
    where chat_handle is null or btrim(chat_handle) = ''
    order by created_at, id
  loop
    update public.profiles
      set chat_handle = public.generate_chat_handle(r.full_name, r.email)
      where id = r.id;
  end loop;
end;
$$;

create unique index if not exists profiles_chat_handle_lower_unique
  on public.profiles (public.chat_handle_key(chat_handle));

-- Check: should return no rows.
--   select lower(chat_handle), count(*) from public.profiles
--   group by 1 having count(*) > 1;
