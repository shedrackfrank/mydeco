-- Adds in-app messaging: one conversation thread per (customer,
-- decorator) pair, holding many messages. Reopening a chat with the
-- same decorator continues the existing thread instead of starting a
-- new one, thanks to the unique constraint below.
-- Run in Supabase: Project -> SQL Editor -> New query -> paste -> Run.

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.user_profiles(id) on delete cascade,
  decorator_id uuid not null references public.decorator_profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  unique (customer_id, decorator_id)
);

create index conversations_customer_id_idx on public.conversations (customer_id);
create index conversations_decorator_id_idx on public.conversations (decorator_id);

alter table public.conversations enable row level security;

create policy "A participant can view their conversation"
  on public.conversations for select
  to authenticated
  using (auth.uid() = customer_id or auth.uid() = decorator_id);

-- Only the customer side can START a conversation -- matches the
-- product decision that customers reach out to decorators, not the
-- other way around. auth.uid() <> decorator_id is cheap insurance
-- against a customer accidentally messaging themself.
create policy "A customer can start a conversation with a decorator"
  on public.conversations for insert
  to authenticated
  with check (auth.uid() = customer_id and auth.uid() <> decorator_id);

-- Lets the trigger below (which runs as the sending user, not as a
-- privileged role) bump last_message_at. Harmless either way -- it's
-- just a cached timestamp a participant is updating on their own
-- conversation, not something that grants access to anything.
create policy "A participant can update their conversation"
  on public.conversations for update
  to authenticated
  using (auth.uid() = customer_id or auth.uid() = decorator_id)
  with check (auth.uid() = customer_id or auth.uid() = decorator_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.user_profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index messages_conversation_id_idx on public.messages (conversation_id);

alter table public.messages enable row level security;

create policy "A participant can view messages in their conversation"
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1 from public.conversations
      where conversations.id = messages.conversation_id
      and (conversations.customer_id = auth.uid() or conversations.decorator_id = auth.uid())
    )
  );

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
  );

-- Keeps conversations.last_message_at current automatically, so
-- InboxPage.jsx can sort threads by recent activity with a plain
-- ORDER BY instead of a slower "latest message per conversation" query.
create function public.touch_conversation_last_message()
returns trigger
language plpgsql
as $$
begin
  update public.conversations
  set last_message_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_touch_conversation
  after insert on public.messages
  for each row
  execute function public.touch_conversation_last_message();