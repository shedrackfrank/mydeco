-- Creates decorator_profiles and portfolio_items, with the fixed category
-- list, the 20-photo cap, and Row Level Security.
-- Run in Supabase: Project -> SQL Editor -> New query -> paste -> Run.

-- One row per decorator, extending their user_profiles row with the
-- decorator-specific fields customers don't have any use for.
create table public.decorator_profiles (
  user_id uuid primary key references public.user_profiles(id) on delete cascade,
  bio text,
  -- Fixed category list, exactly as decided -- a decorator can pick more
  -- than one (e.g. someone who does both weddings and birthdays), but
  -- every entry must be one of these four, and at least one is required.
  categories text[] not null
    check (categories <@ array['Interior Decorator', 'Event Plans', 'Birthday Plans', 'Wedding Plans']::text[])
    check (array_length(categories, 1) > 0),
  -- Both optional -- pricing display is the decorator's choice, decided
  -- back when we first planned this out.
  pricing_from numeric,
  pricing_note text,
  -- The safety-net switch from the very first spec: no admin screen exists
  -- yet, but the field is here so disabling a reported profile is just a
  -- database update away, not a schema change, when that need comes up.
  is_disabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per uploaded photo.
create table public.portfolio_items (
  id uuid primary key default gen_random_uuid(),
  decorator_id uuid not null references public.decorator_profiles(user_id) on delete cascade,
  image_url text not null,
  -- Cloudinary's own identifier for the uploaded file -- kept so a future
  -- "delete this photo" feature can also remove it from Cloudinary itself,
  -- not just this table.
  image_public_id text not null,
  caption text,
  category text
    check (category is null or category = any (array['Interior Decorator', 'Event Plans', 'Birthday Plans', 'Wedding Plans']::text[])),
  created_at timestamptz not null default now()
);

create index portfolio_items_decorator_id_idx on public.portfolio_items (decorator_id);

-- ============================================================
-- 20-PHOTO CAP
-- Enforced here, at the database level, not just in the upload form --
-- the same reasoning as every other rule so far: a check only in the
-- React code can be bypassed by anyone calling the database directly.
-- ============================================================
create or replace function public.enforce_portfolio_item_limit()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.portfolio_items where decorator_id = new.decorator_id) >= 20 then
    raise exception 'Portfolio limit reached: a decorator can have at most 20 photos.';
  end if;
  return new;
end;
$$;

create trigger portfolio_item_limit_trigger
  before insert on public.portfolio_items
  for each row execute function public.enforce_portfolio_item_limit();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.decorator_profiles enable row level security;
alter table public.portfolio_items enable row level security;

-- Visible to any logged-in user UNLESS disabled -- except the decorator
-- themself can always see their own, even while disabled, so they aren't
-- left staring at a profile that just vanished with no explanation.
create policy "Decorator profiles are visible unless disabled"
  on public.decorator_profiles for select
  to authenticated
  using (is_disabled = false or auth.uid() = user_id);

create policy "A decorator can create their own profile"
  on public.decorator_profiles for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "A decorator can update their own profile"
  on public.decorator_profiles for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Portfolio items follow the same visibility as their decorator's profile
-- -- if the profile is hidden, its photos are hidden too.
create policy "Portfolio items visible if the decorator profile is visible"
  on public.portfolio_items for select
  to authenticated
  using (
    exists (
      select 1 from public.decorator_profiles
      where decorator_profiles.user_id = portfolio_items.decorator_id
      and (decorator_profiles.is_disabled = false or decorator_profiles.user_id = auth.uid())
    )
  );

create policy "A decorator can add their own portfolio items"
  on public.portfolio_items for insert
  to authenticated
  with check (auth.uid() = decorator_id);

create policy "A decorator can update their own portfolio items"
  on public.portfolio_items for update
  to authenticated
  using (auth.uid() = decorator_id)
  with check (auth.uid() = decorator_id);

create policy "A decorator can delete their own portfolio items"
  on public.portfolio_items for delete
  to authenticated
  using (auth.uid() = decorator_id);