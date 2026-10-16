-- ============================================================================
-- Wishdrop — AUDIT LOG (who did what, when). Run in the Supabase SQL editor.
-- Safe to run more than once. Run AFTER wishdrop-coupons-referrals-payments.sql.
-- ============================================================================
-- Every important change is recorded by the DATABASE itself (triggers), so
-- nothing can skip it — admin screens, server actions, the SQL editor or a
-- script. Each row says:
--   who    — the staff member (name + role) or customer, from their login;
--            server actions pass the signed-in person along (header
--            x-wishdrop-actor-user, see lib/supabase/server.ts); anything
--            else (SQL editor, cron) shows as "System".
--   what   — created / updated / deleted, on which order, request, coupon…
--   detail — for updates, each changed field old -> new; for deletes, the
--            whole row as it was (so it can be restored by hand); for
--            creates, the new row.
--   where  — the admin page it was done from, when known.
--
-- The log is append-only: nobody (not even the service role) can edit or
-- delete rows, except with an explicit SQL switch for housekeeping. Only
-- Super Admin can read it (Admin -> Audit log).
-- ============================================================================

create table if not exists public.audit_log (
  id              bigint generated always as identity primary key,
  at              timestamptz not null default now(),
  actor_user_id   uuid,
  actor_staff_id  uuid,
  actor_name      text,
  actor_role      text,                 -- staff role, 'customer' or 'system'
  action          text not null,        -- 'created' | 'updated' | 'deleted'
  entity_type     text not null,        -- 'order', 'request', 'coupon', …
  entity_id       text,
  entity_label    text,                 -- e.g. WD-1000051, REQ-10018, coupon title
  severity        text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  summary         text not null,
  changes         jsonb,                -- updates: { field: [old, new] }
  snapshot        jsonb,                -- deletes: the row as it was; creates: the new row
  route           text                  -- admin page it came from, when known
);
create index if not exists audit_log_at_idx on public.audit_log (at desc);
create index if not exists audit_log_entity_idx on public.audit_log (entity_type, entity_id, at desc);
create index if not exists audit_log_actor_idx on public.audit_log (actor_user_id, at desc);
create index if not exists audit_log_label_idx on public.audit_log (lower(entity_label));
create index if not exists audit_log_severity_idx on public.audit_log (severity, at desc);

alter table public.audit_log enable row level security;
-- No policies: read and written only by the server (service role) and the
-- trigger below.

-- Append-only.
create or replace function public.audit_log_append_only()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('wishdrop.audit_housekeeping', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  raise exception 'The audit log can''t be changed or deleted.' using errcode = 'P0001';
end;
$$;
drop trigger if exists audit_log_no_change on public.audit_log;
create trigger audit_log_no_change
  before update or delete on public.audit_log
  for each row execute function public.audit_log_append_only();

-- ---------------------------------------------------------------------------
-- The recorder. Attach with:
--   create trigger … after insert or update or delete on public.<table>
--   for each row execute function public.audit_row_change(
--     '<entity type>', '<label column>', '<watched columns, comma-separated, or *>',
--     '<columns whose change is a warning, comma-separated>');
-- Updates that only touch unwatched columns are not recorded.
-- ---------------------------------------------------------------------------
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity   text := TG_ARGV[0];
  v_labelcol text := nullif(TG_ARGV[1], '');
  v_watch    text[] := string_to_array(coalesce(nullif(TG_ARGV[2], ''), '*'), ',');
  v_warn     text[] := string_to_array(coalesce(TG_ARGV[3], ''), ',');
  v_hdr      json;
  v_uid      uuid;
  v_staff_id uuid;
  v_name     text;
  v_role     text;
  v_old      jsonb;
  v_new      jsonb;
  v_row      jsonb;
  v_changes  jsonb;
  v_action   text;
  v_severity text := 'info';
  v_summary  text;
  v_label    text;
  v_id       text;
  k          text;
  parts      text[] := '{}';
begin
  if TG_OP = 'INSERT' then
    v_new := to_jsonb(new); v_row := v_new; v_action := 'created';
  elsif TG_OP = 'DELETE' then
    v_old := to_jsonb(old); v_row := v_old; v_action := 'deleted'; v_severity := 'critical';
  else
    v_old := to_jsonb(old); v_new := to_jsonb(new); v_row := v_new; v_action := 'updated';
    for k in select jsonb_object_keys(v_new) loop
      if (v_old -> k) is distinct from (v_new -> k)
         and k not in ('updated_at', 'stage_entered_at', 'has_unreplied_message', 'last_message_at')
         and (v_watch = array['*'] or k = any (v_watch)) then
        v_changes := coalesce(v_changes, '{}'::jsonb) || jsonb_build_object(k, jsonb_build_array(v_old -> k, v_new -> k));
        if k = any (v_warn) or v_warn = array['*'] then v_severity := 'warning'; end if;
        parts := parts || format('%s: %s → %s', k,
          coalesce(left(v_old ->> k, 60), '—'), coalesce(left(v_new ->> k, 60), '—'));
      end if;
    end loop;
    if v_changes is null then
      return new;  -- nothing we watch changed
    end if;
    -- Cancelling an order / revoking things is worth a closer look.
    if (v_new ->> 'stage') = 'cancelled' and (v_old ->> 'stage') is distinct from 'cancelled' then v_severity := 'critical'; end if;
    if (v_new ->> 'status') in ('archived', 'suspended', 'inactive', 'voided') and (v_old ->> 'status') is distinct from (v_new ->> 'status') then
      if v_severity = 'info' then v_severity := 'warning'; end if;
    end if;
  end if;

  v_id := v_row ->> 'id';
  v_label := case when v_labelcol is not null then v_row ->> v_labelcol end;

  -- Who: the logged-in user (browser), or the person a server action passed on.
  begin
    v_hdr := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_hdr := null;
  end;
  v_uid := auth.uid();
  if v_uid is null and v_hdr is not null then
    begin
      v_uid := nullif(v_hdr ->> 'x-wishdrop-actor-user', '')::uuid;
    exception when others then
      v_uid := null;
    end;
  end if;

  if v_uid is not null then
    select id, name, coalesce(role::text, 'pending') into v_staff_id, v_name, v_role
      from public.staff_accounts where user_id = v_uid limit 1;
    if v_staff_id is null then
      select full_name into v_name from public.profiles where id = v_uid;
      v_role := 'customer';
    end if;
  else
    v_role := 'system';
    v_name := case when v_hdr is null then 'System / SQL editor' else 'System (server)' end;
  end if;

  v_summary := initcap(replace(v_entity, '_', ' ')) || ' ' || coalesce(v_label, left(v_id, 8)) || ' ' || v_action
    || case when array_length(parts, 1) > 0 then ': ' || array_to_string(parts, '; ') else '' end;

  insert into public.audit_log
    (actor_user_id, actor_staff_id, actor_name, actor_role, action, entity_type, entity_id, entity_label,
     severity, summary, changes, snapshot, route)
  values
    (v_uid, v_staff_id, v_name, v_role, v_action, v_entity, v_id, v_label,
     v_severity, left(v_summary, 1000), v_changes,
     case when TG_OP = 'DELETE' then v_old when TG_OP = 'INSERT' then v_new end,
     left(v_hdr ->> 'x-wishdrop-route', 300));

  return coalesce(new, old);
exception when others then
  -- Recording must never block the real change.
  raise warning 'audit_row_change failed on %: %', TG_TABLE_NAME, sqlerrm;
  return coalesce(new, old);
end;
$$;

revoke all on function public.audit_row_change() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- What's recorded. Each block only runs if that table exists.
--   events  — which operations are logged for the table
--   watch   — columns whose change is logged ('*' = any)
--   warn    — columns whose change is flagged as a warning
-- ---------------------------------------------------------------------------
do $$
declare
  t record;
begin
  for t in
    select * from (values
      -- table,                 events,                      entity,          label,           watch,                                                                                   warn
      ('orders',                'insert or update or delete', 'order',         'display_id',    'stage,payment_status,site_id,total_value,discount_lkr,delayed,export_hold,recipient_address_id,coupon_id,user_id', 'payment_status,site_id,total_value,discount_lkr,user_id'),
      ('order_items',           'update or delete',          'order item',    'title',         'title,quantity,unit_price,variant_label,store_url,request_link',                       'quantity,unit_price'),
      ('order_internal_notes',  'delete',                    'order note',    'text',          '*',                                                                                     ''),
      ('requests',              'insert or update or delete', 'request',       'display_id',    'status,quote,payment_amount,payment_method,payment_reference,payment_confirmed_at,assigned_staff_id,quantity,confirmed_variant', 'quote,payment_amount,payment_confirmed_at'),
      ('purchases',             'update or delete',          'purchase',      'reference',     'status,actual_unit_price_inr,reference,purchased_by',                                   'status'),
      ('checkouts',             'update or delete',          'checkout',      'id',            'payment_status,refunded_lkr,total_lkr',                                                 'payment_status,refunded_lkr'),
      ('payments',              'insert or update or delete', 'payment',       'reference',     'status,amount_lkr,reference,method',                                                    'status,amount_lkr'),
      ('refunds',               'insert or update or delete', 'refund',        'reason',        '*',                                                                                     'amount_lkr'),
      ('coupons',               'insert or update or delete', 'coupon',        'title',         'title,status,discount_type,discount_value,max_discount_lkr,min_order_lkr,total_limit,per_user_limit,ends_at,store_scope,store_slugs,audience', 'discount_value,discount_type,total_limit,status'),
      ('coupon_allocations',    'update or delete',          'coupon holder', 'user_id',       'revoked_at',                                                                            'revoked_at'),
      ('coupon_redemptions',    'update or delete',          'coupon use',    'coupon_id',     'status',                                                                                'status'),
      ('referrals',             'update or delete',          'referral',      'referred_user_id', 'voided_at,void_reason,reward_amount,rewarded_at,status',                              'voided_at'),
      ('referral_settings',     'update',                    'referral settings', 'id',        '*',                                                                                     '*'),
      ('staff_accounts',        'insert or update or delete', 'staff',         'email',         'name,email,role,status,site_id,user_id',                                               'role,status,site_id,user_id'),
      ('sellers',               'insert or update or delete', 'store',         'name',          'name,status,outbound_url,store_kind,store_source,store_origin,owner_user_id,platform_slug', 'status,owner_user_id,platform_slug'),
      ('products',              'update or delete',          'product',       'name',          'name,price,compare_at_price,active,seller_id,mall_category_id',                         'price,active'),
      ('pricing_settings',      'update',                    'pricing settings', 'id',         '*',                                                                                     '*'),
      ('chat_messages',         'delete',                    'chat message',  'text',          '*',                                                                                     ''),
      ('profiles',              'delete',                    'customer',      'full_name',     '*',                                                                                     '')
    ) as v(tbl, events, entity, label, watch, warn)
  loop
    if to_regclass('public.' || t.tbl) is null then
      raise notice 'audit: table % not found, skipped', t.tbl;
      continue;
    end if;
    execute format('drop trigger if exists audit_%s on public.%I', t.tbl, t.tbl);
    execute format(
      'create trigger audit_%s after %s on public.%I for each row execute function public.audit_row_change(%L, %L, %L, %L)',
      t.tbl, t.events, t.tbl, t.entity,
      -- label column only if it exists
      case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t.tbl and column_name = t.label)
           then t.label else '' end,
      t.watch, t.warn);
  end loop;
end $$;
