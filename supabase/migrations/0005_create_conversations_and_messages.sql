-- 0005_create_conversations_and_messages.sql
-- Phase 2 — Core Ask Symora + AI pipeline. Chat history behind /api/chat.

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger conversations_set_updated_at
  before update on public.conversations
  for each row
  execute function public.set_updated_at();

-- Individual turns. Append-only in practice (a turn is never edited after being
-- written), so unlike its parent conversation this table has no updated_at trigger.
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  language text check (language in ('en', 'hi', 'hinglish')),
  intent text,
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_id_created_at_idx
  on public.messages (conversation_id, created_at);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy conversations_deny_anon_select on public.conversations
  for select to anon using (false);
create policy conversations_deny_anon_insert on public.conversations
  for insert to anon with check (false);
create policy conversations_deny_anon_update on public.conversations
  for update to anon using (false) with check (false);
create policy conversations_deny_anon_delete on public.conversations
  for delete to anon using (false);
create policy conversations_deny_authenticated_select on public.conversations
  for select to authenticated using (false);
create policy conversations_deny_authenticated_insert on public.conversations
  for insert to authenticated with check (false);
create policy conversations_deny_authenticated_update on public.conversations
  for update to authenticated using (false) with check (false);
create policy conversations_deny_authenticated_delete on public.conversations
  for delete to authenticated using (false);

create policy messages_deny_anon_select on public.messages
  for select to anon using (false);
create policy messages_deny_anon_insert on public.messages
  for insert to anon with check (false);
create policy messages_deny_anon_update on public.messages
  for update to anon using (false) with check (false);
create policy messages_deny_anon_delete on public.messages
  for delete to anon using (false);
create policy messages_deny_authenticated_select on public.messages
  for select to authenticated using (false);
create policy messages_deny_authenticated_insert on public.messages
  for insert to authenticated with check (false);
create policy messages_deny_authenticated_update on public.messages
  for update to authenticated using (false) with check (false);
create policy messages_deny_authenticated_delete on public.messages
  for delete to authenticated using (false);
