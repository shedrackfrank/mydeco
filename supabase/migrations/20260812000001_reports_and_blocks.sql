-- Adds reporting and blocking.
-- Reports are write-only from the client's perspective (a person can
-- file one and see their own past ones, nothing more) -- there's no
-- admin UI yet, so triaging them happens by looking at the table
-- directly in the Supabase dashboard for now.
-- Blocking actually does something, not just a preference flag: it's
-- enforced in the messages INSERT policy below, so a blocked person
-- genuinely cannot send new messages in that conversation, on either
-- side.
-- Run in Supabase: Project -> SQL Editor -> New query -> paste -> Run.

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.user_profiles(id) on delete cascade,
  -- 'review' -> target_id is a reviews.id; 'user' -> target_id is a
  -- user_profiles.id (covers reporting someone over a conversation,
  -- a profile, etc. without needing a table per report type).
  target_type text not null check (target_type in ('review', 'user')),
  target_id uuid not null,
  reason text not null,
  details text,
  created_at timestamptz not null default now()
);

create index reports_reporter_id_idx on public.reports (reporter_id);

alter table public.reports enable row level security;

create policy "A user can file a report"
  on public.reports for insert
  to authenticated
  with check (reporter_id = auth.uid());

-- Lets the UI check "have I already reported this" without exposing
-- anyone else's reports.
create policy "A user can see their own reports"
  on public.reports for select
  to authenticated
  using (reporter_id = auth.uid());

create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.user_profiles(id) on delete cascade,
  blocked_id uuid not null references public.user_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id)
);

create index blocks_blocker_id_idx on public.blocks (blocker_id);

alter table public.blocks enable row level security;

create policy "A user can see their own blocks"
  on public.blocks for select
  to authenticated
  using (blocker_id = auth.uid());

create policy "A user can block someone"
  on public.blocks for insert
  to authenticated
  with check (blocker_id = auth.uid() and blocker_id <> blocked_id);

create policy "A user can unblock someone"
  on public.blocks for delete
  to authenticated
  using (blocker_id = auth.uid());

-- Replaces the messages insert policy from the messaging migration --
-- same as before, plus a new check that neither participant has
-- blocked the other. Checked in both directions: it shouldn't matter
-- who blocked whom, new messages just stop either way.
drop policy "A participant can send a message in their conversation" on public.messages;

create policy "A participant can send a message in their conversation"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversations
      where conversations.id = messages.conversation_id
      and (conversations.customer_id = auth.uid() or conversations.decorator_id = auth.uid())
    )
    and not exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
      and (
        exists (select 1 from public.blocks where blocker_id = c.customer_id and blocked_id = c.decorator_id)
        or exists (select 1 from public.blocks where blocker_id = c.decorator_id and blocked_id = c.customer_id)
      )
    )
  );