-- Wishdrop — records when a customer agreed to be messaged on WhatsApp
-- (ticked in the chat box / sign-up). Safe to run more than once.
alter table public.profiles add column if not exists whatsapp_consent_at timestamptz;

-- Audit: watch the consent too (only if the audit log is installed).
do $$
begin
  if to_regclass('public.audit_log') is not null and to_regclass('public.profiles') is not null then
    drop trigger if exists audit_profiles on public.profiles;
    create trigger audit_profiles after update or delete on public.profiles
      for each row execute function public.audit_row_change(
        'customer', 'full_name', 'full_name,email,phone,phone_verified,chat_handle,whatsapp_consent_at', 'phone,phone_verified,email');
  end if;
end $$;
