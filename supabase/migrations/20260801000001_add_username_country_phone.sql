-- Adds username (replacing display_name), country, and an optional
-- decorator phone number. This is a NEW migration file, not an edit to the
-- original one -- migrations are a running history of changes. Editing a
-- file that may already be applied to your live database won't
-- retroactively change what's already there; a new file is how you alter
-- an existing table safely.
-- Run in Supabase: Project -> SQL Editor -> New query -> paste -> Run.

-- Rename display_name -> username. The NOT NULL constraint from the
-- original column carries over automatically with a rename.
alter table public.user_profiles rename column display_name to username;

-- Case-insensitive uniqueness -- without this, "Jane_Doe" and "jane_doe"
-- would both be allowed, which defeats the point of "no two users can
-- have the same username."
create unique index user_profiles_username_lower_idx
  on public.user_profiles (lower(username));

-- Enforce the character rules at the database level too, not just in the
-- signup form -- same defense-in-depth reasoning as the role check
-- constraint in the original migration. Letters, numbers, underscore, and
-- period only, 3-20 characters.
alter table public.user_profiles
  add constraint username_format check (username ~ '^[A-Za-z0-9._]{3,20}$');

-- Country, for every user -- this is what powers region-based filtering
-- later (customers only seeing decorators in their own country).
alter table public.user_profiles add column country text;

-- Phone number -- decorator-only in practice, left null for customers.
-- Not SMS-verified (see the note in SignupPage.jsx for why); this is a
-- self-reported, format-checked value, not a confirmed one.
alter table public.user_profiles add column phone_number text;