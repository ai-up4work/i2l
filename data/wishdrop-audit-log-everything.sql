-- ============================================================================
-- Wishdrop — AUDIT LOG: RECORD EVERYTHING. Run in the Supabase SQL editor.
-- Safe to run more than once. Run AFTER data/wishdrop-audit-log.sql
-- (that file creates the audit_log table and the recorder; this one widens
-- what it watches). If the Audit log page is empty, run BOTH files, in order.
-- ============================================================================
-- 1. Order item changes now include the photo (staff uploads / removals).
-- 2. EVERY other table in the public schema gets a recorder (create / update
--    / delete, any column; deletes keep the whole row as a snapshot so a
--    mistaken delete can be restored by hand). Only noisy, machine-written
--    tables are skipped (listed below).
-- 3. Chat: only staff replies are recorded (not every customer message), and
--    any deleted message.
-- 4. audit_event(): lets server code record things that aren't a row change
--    (sign-ins, exports, broadcasts, previews…). See lib/audit-event.ts.
-- ============================================================================

-- 0. Make sure the table exists (no-op when the first file was already run).
do $$
begin
  if to_regclass('public.audit_log') is null then
    raise exception 'Run data/wishdrop-audit-log.sql first — the audit_log table does not exist yet.';
  end if;
end $$;

-- 1. Order items: add the photo, store link and variant.
do $$
begin
  if to_regclass('public.order_items') is not null then
    drop trigger if exists audit_order_items on public.order_items;
    create trigger audit_order_items after insert or update or delete on public.order_items
      for each row execute function public.audit_row_change(
        'order item',
        case when exists (select 1 from information_schema.columns where table_schema='public' and table_name='order_items' and column_name='title') then 'title' else '' end,
        'title,quantity,unit_price,variant_label,store_url,request_link,product_image_url,screenshot_url',
        'quantity,unit_price,product_image_url');
  end if;
end $$;

-- 2. Everything else.
do $$
declare
  t record;
  lbl text;
  skip text[] := array[
    'audit_log', 'notifications', 'push_subscriptions', 'price_observations',
    'mall_stock_movements', 'pricing_settings_history', 'store_follows',
    'casecraft_likes', 'media_sweep_runs', 'chat_messages', 'chat_threads',
    'scraper_runs', 'scrape_health', 'rate_limits', 'cart_items', 'recently_viewed',
    'wishlist_items', 'community_likes', 'follows'
  ];
begin
  for t in
    select c.relname as tbl
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname <> all (skip)
      and c.relname !~ '(^|_)(cart|cart_items|wishlist|sessions|analytics|rate_limit|rate_limits)$'
  loop
    -- already has a recorder from the first file (or from above)?
    continue when exists (
      select 1 from pg_trigger tg
      where tg.tgrelid = ('public.' || quote_ident(t.tbl))::regclass and tg.tgname = 'audit_' || t.tbl);

    -- best human label: first of these columns that exists
    select column_name into lbl
    from information_schema.columns
    where table_schema = 'public' and table_name = t.tbl
      and column_name in ('display_id', 'name', 'title', 'email', 'reference', 'slug', 'code', 'label')
    order by array_position(array['display_id','name','title','email','reference','slug','code','label'], column_name::text)
    limit 1;

    execute format(
      'create trigger audit_%s after insert or update or delete on public.%I for each row execute function public.audit_row_change(%L, %L, %L, %L)',
      t.tbl, t.tbl, replace(t.tbl, '_', ' '), coalesce(lbl, ''), '*', '');
  end loop;
end $$;

-- 3. Chat: staff replies and deletions only.
do $$
begin
  if to_regclass('public.chat_messages') is not null then
    drop trigger if exists audit_chat_messages on public.chat_messages;
    drop trigger if exists audit_chat_messages_ops on public.chat_messages;
    create trigger audit_chat_messages after delete on public.chat_messages
      for each row execute function public.audit_row_change('chat message', 'text', '*', '');
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='chat_messages' and column_name='sender') then
      create trigger audit_chat_messages_ops after insert on public.chat_messages
        for each row when (new.sender::text = 'ops')
        execute function public.audit_row_change('chat message', 'text', '*', '');
    end if;
  end if;
end $$;

-- 4. Events that aren't a row change. Called from server code with the
--    service role (never from the browser).
create or replace function public.audit_event(
  p_actor_user uuid,
  p_entity text,
  p_label text,
  p_summary text,
  p_severity text default 'info',
  p_detail jsonb default null,
  p_route text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff uuid; v_name text; v_role text;
begin
  if p_actor_user is not null then
    select id, name, coalesce(role::text, 'pending') into v_staff, v_name, v_role
      from public.staff_accounts where user_id = p_actor_user limit 1;
    if v_staff is null then
      select full_name into v_name from public.profiles where id = p_actor_user;
      v_role := 'customer';
    end if;
  else
    v_role := 'system'; v_name := 'System (server)';
  end if;
  insert into public.audit_log
    (actor_user_id, actor_staff_id, actor_name, actor_role, action, entity_type, entity_label, severity, summary, changes, route)
  values
    (p_actor_user, v_staff, v_name, v_role, 'created', p_entity, p_label,
     case when p_severity in ('info','warning','critical') then p_severity else 'info' end,
     left(p_summary, 1000), p_detail, left(p_route, 300));
end $$;
revoke all on function public.audit_event(uuid, text, text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.audit_event(uuid, text, text, text, text, jsonb, text) to service_role;
