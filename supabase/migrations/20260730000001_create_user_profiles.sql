-- Creates user_profiles and locks it down with Row Level Security.
-- Run this in Supabase: Project -> SQL Editor -> New query -> paste -> Run.
-- (Or `supabase db push` if the project is linked to the Supabase CLI.)

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('customer', 'decorator')),
  display_name text not null,
  city text,
  created_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

-- Any logged-in user can read any profile. This is intentional, not an
-- oversight: /browse needs to show decorator names to any customer, and a
-- decorator needs to see the name of whoever messaged them. Nothing
-- sensitive lives in this table -- just role, display name, and city.
create policy "Logged-in users can view all profiles"
  on public.user_profiles
  for select
  to authenticated
  using (true);

-- A user can only ever create a profile row for themselves -- the id being
-- inserted must match their own authenticated id.
create policy "Users can create their own profile"
  on public.user_profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

-- A user can only update their own row, never anyone else's.
create policy "Users can update their own profile"
  on public.user_profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);
