-- Requests that staff create on behalf of a customer
-- (Admin → Requests → "Create request for customer", and the chat inbox).
--
-- Marks who created the request and how, so reports can tell these apart
-- from requests customers made themselves ("Buy for me").
--
-- Optional: the feature works without this file (the markers are simply
-- not saved). Safe to run more than once.

alter table public.requests
  add column if not exists created_by_staff_id uuid,
  add column if not exists created_via text not null default 'customer';

comment on column public.requests.created_by_staff_id is
  'staff_accounts.id of the staff member who created this request for the customer; null when the customer made it.';
comment on column public.requests.created_via is
  '''customer'' (Buy for me) or ''staff'' (created on the customer''s behalf).';
