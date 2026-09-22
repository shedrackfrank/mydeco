-- Adds follows -- lets a customer follow a decorator to keep track of
-- them, and gives the decorator a follower count for their dashboard.
-- Same shape as reactions in the previous migration: one row per
-- (follower, decorator) pair, not a growing log.
-- Run in Supabase: Project -> SQL Editor -> New query -> paste -> Run.

create table public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references public.user_profiles(id) on delete cascade,
  decorator_id uuid not null references public.decorator_profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (follower_id, decorator_id)
);

create index follows_decorator_id_idx on public.follows (decorator_id);
create index follows_follower_id_idx on public.follows (follower_id);

alter table public.follows enable row level security;

-- The decorator can see everyone following them (to count, and to show
-- who they are); a follower can see their own follow rows (so the app
-- knows whether to show "Follow" or "Following" on a profile). Nobody
-- else can see either -- same visibility rule as reactions.
create policy "Decorator or the follower can view a follow"
  on public.follows for select
  to authenticated
  using (auth.uid() = decorator_id or auth.uid() = follower_id);

-- A user can follow a decorator but not themself -- this mostly
-- matters in theory, since decorators can't browse other decorators
-- in the first place (BrowsePage.jsx is customer-only), but it's
-- cheap insurance at the database level either way.
create policy "A user can follow a decorator"
  on public.follows for insert
  to authenticated
  with check (auth.uid() = follower_id and auth.uid() <> decorator_id);

create policy "A user can unfollow a decorator they followed"
  on public.follows for delete
  to authenticated
  using (auth.uid() = follower_id);