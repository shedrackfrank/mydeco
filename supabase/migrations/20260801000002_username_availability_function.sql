-- A narrow, single-purpose function: answers "is this username taken?"
-- without exposing anything else in user_profiles. This is what lets the
-- signup form (used by people who aren't logged in yet) check availability,
-- without opening up the whole table to anonymous reads -- which would be a
-- problem now that the table also holds phone numbers.
--
-- SECURITY DEFINER means this function runs with the permissions of
-- whoever created it (bypassing the caller's own RLS restrictions) --
-- but since it only ever returns true/false, there's nothing it can leak.
-- Run in Supabase: Project -> SQL Editor -> New query -> paste -> Run.

create or replace function public.is_username_taken(check_username text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_profiles where lower(username) = lower(check_username)
  );
$$;

-- Grant execute to both anonymous visitors (filling out the signup form)
-- and logged-in users (e.g. if you ever let someone change their username
-- later). This only grants permission to RUN the function -- it does not
-- grant any direct table access.
grant execute on function public.is_username_taken(text) to anon, authenticated;