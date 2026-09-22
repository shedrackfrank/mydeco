-- Adds profile views, reactions, and reviews -- the data a decorator's
-- dashboard needs to show "how am I doing" without ever exposing other
-- decorators' portfolios to them. Decorators still can't browse each
-- other (BrowsePage.jsx is customer-only, unchanged); this migration
-- only adds what a decorator sees about their OWN profile.
-- Run in Supabase: Project -> SQL Editor -> New query -> paste -> Run.

-- ============================================================
-- PORTFOLIO VIEWS
-- One row per profile visit. Kept intentionally simple (no "already
-- viewed today" de-duplication) -- that's a nice-to-have that can be
-- layered on later without a schema change, and isn't worth the
-- complexity on a zero-dollar budget yet.
-- ============================================================
create table public.portfolio_views (
  id uuid primary key default gen_random_uuid(),
  decorator_id uuid not null references public.decorator_profiles(user_id) on delete cascade,
  viewer_id uuid not null references public.user_profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index portfolio_views_decorator_id_idx on public.portfolio_views (decorator_id);

alter table public.portfolio_views enable row level security;

-- Only the decorator themself can read their view log -- this is their
-- private stat, not something other decorators or customers can see.
create policy "A decorator can view their own profile view log"
  on public.portfolio_views for select
  to authenticated
  using (auth.uid() = decorator_id);

-- Any logged-in customer can log a view of a decorator's profile, but
-- not of their own (auth.uid() = decorator_id is blocked) -- otherwise
-- a decorator could inflate their own view count just by refreshing
-- their profile page.
create policy "A customer can log a profile view"
  on public.portfolio_views for insert
  to authenticated
  with check (auth.uid() = viewer_id and auth.uid() <> decorator_id);

-- ============================================================
-- REACTIONS
-- One row per (decorator, customer) pair, not one row per click -- a
-- customer reacting again updates their existing row instead of
-- piling up duplicates, which keeps counting simple (just count rows).
-- ============================================================
create table public.reactions (
  id uuid primary key default gen_random_uuid(),
  decorator_id uuid not null references public.decorator_profiles(user_id) on delete cascade,
  customer_id uuid not null references public.user_profiles(id) on delete cascade,
  type text not null default 'like' check (type in ('like', 'love', 'wow')),
  created_at timestamptz not null default now(),
  unique (decorator_id, customer_id)
);

create index reactions_decorator_id_idx on public.reactions (decorator_id);

alter table public.reactions enable row level security;

-- The decorator can see all reactions on their profile (to count them);
-- a customer can see their own reaction (so the app can show them
-- whether they've already reacted). Nobody else can see either.
create policy "Decorator or the reacting customer can view a reaction"
  on public.reactions for select
  to authenticated
  using (auth.uid() = decorator_id or auth.uid() = customer_id);

create policy "A customer can react to a decorator"
  on public.reactions for insert
  to authenticated
  with check (auth.uid() = customer_id and auth.uid() <> decorator_id);

create policy "A customer can change their own reaction"
  on public.reactions for update
  to authenticated
  using (auth.uid() = customer_id)
  with check (auth.uid() = customer_id);

create policy "A customer can remove their own reaction"
  on public.reactions for delete
  to authenticated
  using (auth.uid() = customer_id);

-- ============================================================
-- REVIEWS
-- One row per (decorator, customer) pair, same reasoning as
-- reactions -- a customer edits their existing review rather than
-- leaving several. Unlike views and reactions, reviews are visible to
-- ANY logged-in user, not just the decorator -- they're meant to help
-- other customers decide, the same way the decorator's profile itself
-- is visible to every customer.
-- ============================================================
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  decorator_id uuid not null references public.decorator_profiles(user_id) on delete cascade,
  customer_id uuid not null references public.user_profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (decorator_id, customer_id)
);

create index reviews_decorator_id_idx on public.reviews (decorator_id);

alter table public.reviews enable row level security;

-- Visible to any logged-in user, matching decorator_profiles' own
-- visibility rule -- if the profile is disabled, its reviews are
-- hidden too, except from the decorator who owns them.
create policy "Reviews are visible unless the decorator profile is disabled"
  on public.reviews for select
  to authenticated
  using (
    exists (
      select 1 from public.decorator_profiles
      where decorator_profiles.user_id = reviews.decorator_id
      and (decorator_profiles.is_disabled = false or decorator_profiles.user_id = auth.uid())
    )
  );

create policy "A customer can leave a review for a decorator"
  on public.reviews for insert
  to authenticated
  with check (auth.uid() = customer_id and auth.uid() <> decorator_id);

create policy "A customer can edit their own review"
  on public.reviews for update
  to authenticated
  using (auth.uid() = customer_id)
  with check (auth.uid() = customer_id);

create policy "A customer can delete their own review"
  on public.reviews for delete
  to authenticated
  using (auth.uid() = customer_id);