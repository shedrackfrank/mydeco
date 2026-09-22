-- Adds account deactivation with a 30-day grace period. Deleting an
-- account doesn't remove anything immediately -- it just marks WHEN
-- deactivation happened and hides a decorator's profile from
-- customers. A daily scheduled job then permanently deletes anyone
-- whose 30 days are up. This gives people a way to undo an accidental
-- deletion, and gives you a real (if short) window to look into an
-- account if a scam is reported, before the data is actually gone.
-- Run in Supabase: Project -> SQL Editor -> New query -> paste -> Run.

alter table public.user_profiles
  add column deactivated_at timestamptz;

-- pg_cron is a Postgres extension Supabase ships but doesn't enable by
-- default. If this line errors when you run the migration, go to
-- Database > Extensions in the dashboard, enable "pg_cron" there
-- instead, then just re-run everything below this line.
create extension if not exists pg_cron;

-- SECURITY DEFINER so this runs with the privileges of whoever created
-- it (you, via the SQL Editor / CLI, which has access to auth.users)
-- rather than whichever role happens to trigger it. Deleting straight
-- from auth.users is what actually removes the person's ability to
-- log in -- everything in the public schema (profile, portfolio,
-- messages, reviews, etc.) is already wired with "on delete cascade"
-- back to auth.users, so one delete here cleans up everywhere.
create or replace function public.purge_expired_deactivated_accounts()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from auth.users
  where id in (
    select id from public.user_profiles
    where deactivated_at is not null
    and deactivated_at < now() - interval '30 days'
  );
end;
$$;

-- Runs once a day at 3am UTC. Re-running this migration is safe --
-- cron.schedule with an existing job name updates it instead of
-- creating a duplicate.
select cron.schedule(
  'purge-deactivated-accounts',
  '0 3 * * *',
  $$ select public.purge_expired_deactivated_accounts(); $$
);