-- Adds a real, server-side 30-day cooldown on username changes.
-- Deliberately a trigger, not just a client-side check -- a client
-- check alone can be bypassed by anyone calling the REST API
-- directly, and username changes are exactly the kind of thing worth
-- rate-limiting for real (impersonation, username squatting/cycling).
-- Run in Supabase: Project -> SQL Editor -> New query -> paste -> Run.

alter table public.user_profiles
  add column username_changed_at timestamptz;

-- Only does anything when username actually changes (is distinct
-- from), so every other update to this row -- deactivating an
-- account, anything else added later -- is completely unaffected.
-- On an allowed change, it stamps username_changed_at itself, so the
-- client never needs to set that column directly.
create or replace function public.enforce_username_change_cooldown()
returns trigger
language plpgsql
as $$
begin
  if new.username is distinct from old.username then
    if old.username_changed_at is not null and old.username_changed_at > now() - interval '30 days' then
      raise exception 'Username can only be changed once every 30 days.';
    end if;
    new.username_changed_at := now();
  end if;
  return new;
end;
$$;

create trigger user_profiles_username_cooldown
  before update on public.user_profiles
  for each row
  execute function public.enforce_username_change_cooldown();