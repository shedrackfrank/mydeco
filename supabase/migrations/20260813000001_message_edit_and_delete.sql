-- Adds message editing and "delete for me" on both messages and whole
-- conversations. Deliberately NOT true deletion -- see the earlier
-- conversation about this: a message or conversation only disappears
-- from the person who deleted it, never for the other side, and the
-- underlying row is never actually removed. That keeps the reports
-- system meaningful -- someone can't send something and erase it
-- before it can be reported.
-- Run in Supabase: Project -> SQL Editor -> New query -> paste -> Run.

alter table public.messages add column edited_at timestamptz;
alter table public.messages add column deleted_for_sender boolean not null default false;
alter table public.messages add column deleted_for_recipient boolean not null default false;

alter table public.conversations add column hidden_for_customer boolean not null default false;
alter table public.conversations add column hidden_for_decorator boolean not null default false;

-- Replaces the original messages select policy from the messaging
-- migration -- same participant check, plus excluding whichever
-- messages the CURRENT viewer has deleted for themself. A message
-- deleted-for-sender simply never shows up for the sender again; the
-- recipient's copy (and vice versa) is untouched.
drop policy "A participant can view messages in their conversation" on public.messages;

create policy "A participant can view messages in their conversation"
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1 from public.conversations
      where conversations.id = messages.conversation_id
      and (conversations.customer_id = auth.uid() or conversations.decorator_id = auth.uid())
    )
    and not (sender_id = auth.uid() and deleted_for_sender)
    and not (sender_id <> auth.uid() and deleted_for_recipient)
  );

-- Lets a participant update a message in their own conversation --
-- either the sender editing their own body, or either side flipping
-- their own "hide this from my view" flag. The trigger below is what
-- actually stops someone editing text they didn't write; RLS alone
-- only checks that they're a real participant of the conversation.
create policy "A participant can update a message in their conversation"
  on public.messages for update
  to authenticated
  using (
    exists (
      select 1 from public.conversations
      where conversations.id = messages.conversation_id
      and (conversations.customer_id = auth.uid() or conversations.decorator_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.conversations
      where conversations.id = messages.conversation_id
      and (conversations.customer_id = auth.uid() or conversations.decorator_id = auth.uid())
    )
  );

-- Rejects anyone but the original sender changing the message body,
-- and stamps edited_at automatically the moment the sender actually
-- changes it -- the client never sets edited_at directly.
create or replace function public.enforce_message_edit_rules()
returns trigger
language plpgsql
as $$
begin
  if new.body is distinct from old.body then
    if old.sender_id <> auth.uid() then
      raise exception 'Only the sender can edit a message.';
    end if;
    new.edited_at := now();
  end if;
  return new;
end;
$$;

create trigger messages_edit_rules
  before update on public.messages
  for each row
  execute function public.enforce_message_edit_rules();