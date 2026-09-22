-- Restructures three related things at once, since they all touch the
-- same tables:
--   1. A decorator now has ONE category, not several -- locked once
--      set, but only at the app layer (no DB trigger), so it can
--      still be corrected by hand for a genuine edge case.
--   2. Pricing moves off the decorator's profile and onto individual
--      products -- each product can optionally have its own price.
--   3. Reactions move from "one reaction per decorator" to "one
--      reaction per product", since products are what customers
--      actually browse and react to now.
-- Also adds avatar columns for both customers and decorators.
-- Run in Supabase: Project -> SQL Editor -> New query -> paste -> Run.

-- ============================================================
-- 1. DECORATOR_PROFILES: single category, no profile-level pricing
-- ============================================================

alter table public.decorator_profiles add column category text;

-- Backfills every existing decorator to their first previously-selected
-- category -- picking one is what "locked to a single category" means
-- going forward, this just seeds it from what they already had.
update public.decorator_profiles set category = categories[1] where category is null;

alter table public.decorator_profiles alter column category set not null;
alter table public.decorator_profiles add constraint decorator_profiles_category_check
  check (category in ('Interior Decorator', 'Event Plans', 'Birthday Plans', 'Wedding Plans'));

alter table public.decorator_profiles drop column categories;
alter table public.decorator_profiles drop column pricing_from;
alter table public.decorator_profiles drop column pricing_note;

-- ============================================================
-- 2. PORTFOLIO_ITEMS (now "products" in the UI): drop the redundant
-- per-item category -- the decorator's own category above already
-- covers every product they upload -- and add an optional price.
-- ============================================================

alter table public.portfolio_items drop column category;
alter table public.portfolio_items add column price numeric;

-- ============================================================
-- 3. REACTIONS: rebuilt keyed to a product, not a decorator.
-- Dropped and recreated rather than migrated -- there's no correct
-- product to attach an old profile-level reaction to, and at this
-- stage there's no real production data worth preserving over a
-- clean rebuild.
-- ============================================================

drop table if exists public.reactions;

create table public.reactions (
  id uuid primary key default gen_random_uuid(),
  portfolio_item_id uuid not null references public.portfolio_items(id) on delete cascade,
  customer_id uuid not null references public.user_profiles(id) on delete cascade,
  type text not null default 'like' check (type in ('like', 'love', 'wow')),
  created_at timestamptz not null default now(),
  unique (portfolio_item_id, customer_id)
);

create index reactions_portfolio_item_id_idx on public.reactions (portfolio_item_id);

alter table public.reactions enable row level security;

-- Visible to the product's owner (to count reactions on their own
-- products) and to the reacting customer (so the UI knows whether
-- they've already reacted) -- nobody else.
create policy "Decorator or the reacting customer can view a reaction"
  on public.reactions for select
  to authenticated
  using (
    auth.uid() = customer_id
    or exists (
      select 1 from public.portfolio_items
      where portfolio_items.id = reactions.portfolio_item_id
      and portfolio_items.decorator_id = auth.uid()
    )
  );

-- A customer can react to any product that isn't their own -- this
-- mostly matters in theory (a decorator can't browse products in the
-- first place), but it's cheap insurance either way.
create policy "A customer can react to a product"
  on public.reactions for insert
  to authenticated
  with check (
    auth.uid() = customer_id
    and not exists (
      select 1 from public.portfolio_items
      where portfolio_items.id = reactions.portfolio_item_id
      and portfolio_items.decorator_id = auth.uid()
    )
  );

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
-- 4. AVATARS -- for both customers and decorators
-- ============================================================

alter table public.user_profiles add column avatar_url text;
alter table public.user_profiles add column avatar_public_id text;