-- 0004_create_memories.sql
-- Phase 2 — Core Ask Symora + AI pipeline. See .claude/rules/data-model.md § memories.
-- Phase 2 only writes here via remember_preference (a plain insert). Retrieval,
-- aliases, corrections and effective-date superseding are Phase 3 scope.

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  memory_type text not null check (memory_type in ('alias', 'preference', 'fact', 'correction')),
  key text not null,
  value_json jsonb not null,
  source text not null check (source in ('user_stated', 'confirmed', 'corrected')),
  confidence numeric(3, 2) not null default 1.0 check (confidence between 0 and 1),
  effective_from date not null default current_date,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists memories_user_key_idx
  on public.memories (user_id, key);

create trigger memories_set_updated_at
  before update on public.memories
  for each row
  execute function public.set_updated_at();

alter table public.memories enable row level security;

create policy memories_deny_anon_select on public.memories
  for select to anon using (false);
create policy memories_deny_anon_insert on public.memories
  for insert to anon with check (false);
create policy memories_deny_anon_update on public.memories
  for update to anon using (false) with check (false);
create policy memories_deny_anon_delete on public.memories
  for delete to anon using (false);
create policy memories_deny_authenticated_select on public.memories
  for select to authenticated using (false);
create policy memories_deny_authenticated_insert on public.memories
  for insert to authenticated with check (false);
create policy memories_deny_authenticated_update on public.memories
  for update to authenticated using (false) with check (false);
create policy memories_deny_authenticated_delete on public.memories
  for delete to authenticated using (false);
