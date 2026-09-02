-- 0006_create_ai_usage_events.sql
-- Phase 2 — Core Ask Symora + AI pipeline. One row per AI provider call, per
-- .claude/rules/ai-pipeline.md § Provider and model use. Append-only, like
-- audit_events — no updated_at trigger.

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  provider text not null,
  model text not null,
  intent text,
  prompt_tokens int not null default 0,
  completion_tokens int not null default 0,
  total_tokens int not null default 0,
  estimated_cost_usd numeric(10, 6),
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_events_user_id_created_at_idx
  on public.ai_usage_events (user_id, created_at);

alter table public.ai_usage_events enable row level security;

create policy ai_usage_events_deny_anon_select on public.ai_usage_events
  for select to anon using (false);
create policy ai_usage_events_deny_anon_insert on public.ai_usage_events
  for insert to anon with check (false);
create policy ai_usage_events_deny_anon_update on public.ai_usage_events
  for update to anon using (false) with check (false);
create policy ai_usage_events_deny_anon_delete on public.ai_usage_events
  for delete to anon using (false);
create policy ai_usage_events_deny_authenticated_select on public.ai_usage_events
  for select to authenticated using (false);
create policy ai_usage_events_deny_authenticated_insert on public.ai_usage_events
  for insert to authenticated with check (false);
create policy ai_usage_events_deny_authenticated_update on public.ai_usage_events
  for update to authenticated using (false) with check (false);
create policy ai_usage_events_deny_authenticated_delete on public.ai_usage_events
  for delete to authenticated using (false);
