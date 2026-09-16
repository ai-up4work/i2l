-- 04-useful-commands.sql
--
-- Not part of setup — a reference sheet of one-off commands you'll
-- actually want while testing this and afterward. Run any line
-- individually as needed, not as one script.

-- See what the sweep WOULD delete, without deleting anything:
select * from public.orphaned_storage_objects;

-- Run the real cleanup right now, instead of waiting for Sunday:
select public.run_storage_cleanup();

-- Check the outcome of the most recent HTTP delete calls pg_net made
-- (status_code 200/204 = success; anything else needs a look):
select * from net._http_response order by created desc limit 20;

-- See every scheduled cron job on this project (not just this one):
select * from cron.job;

-- See run history for this specific job (success/failure, timing):
select *
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'weekly-storage-cleanup')
order by start_time desc
limit 20;

-- Change the schedule (e.g. to daily at 3am instead of weekly):
select cron.alter_job(
  (select jobid from cron.job where jobname = 'weekly-storage-cleanup'),
  schedule := '0 3 * * *'
);

-- Turn it off entirely:
select cron.unschedule('weekly-storage-cleanup');

-- Rotate the service_role key stored in Vault, if you ever regenerate it:
select vault.update_secret(
  (select id from vault.secrets where name = 'service_role_key'),
  'NEW-SERVICE-ROLE-KEY-HERE'
);
