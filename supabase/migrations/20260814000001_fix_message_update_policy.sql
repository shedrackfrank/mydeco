-- Corrective migration: the UPDATE policy on messages (added in
-- 20260813000001_message_edit_and_delete.sql, meant to allow editing
-- your own message body or hiding a message from your own view) isn't
-- actually taking effect -- every edit/delete attempt is failing with
-- "new row violates row-level security policy for table messages",
-- which is exactly what Postgres does when NO policy matches an
-- operation at all. Using "drop policy if exists" first makes this
-- safe to run regardless of whether the original policy silently
-- failed to get created or something else is going on -- this
-- guarantees the end state is correct either way.
-- Run in Supabase: Project -> SQL Editor -> New query -> paste -> Run.

drop policy if exists "A participant can update a message in their conversation" on public.messages;

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

-- Also re-confirms the edit trigger exists correctly -- if this
-- fails saying the function already exists, that's fine, it just
-- means that part was already fine and this recreates it identically.
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

drop trigger if exists messages_edit_rules on public.messages;

create trigger messages_edit_rules
  before update on public.messages
  for each row
  execute function public.enforce_message_edit_rules();