-- 0002_create_commitments.sql
-- Phase 2 — Core Ask Symora + AI pipeline. See .claude/rules/data-model.md § commitments.
-- The umbrella table for payments, tasks, reminders and important dates.

create table if not exists public.commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  type text not null check (type in ('PAYMENT', 'TASK', 'REMINDER', 'IMPORTANT_DATE')),
  title text not null,
  description text,
  due_date date,
  due_time time,
  recurrence_rule text,
  status text not null default 'pending' check (status in ('pending', 'done', 'cancelled')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  source text not null check (source in ('chat', 'voice', 'paste', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- list_pending's primary access pattern: a user's open items ordered by due date.
create index if not exists commitments_user_status_due_date_idx
  on public.commitments (user_id, status, due_date);

create trigger commitments_set_updated_at
  before update on public.commitments
  for each row
  execute function public.set_updated_at();

-- RLS: see 0001_create_users.sql for why these are explicit deny-by-default policies
-- rather than an auth.uid()-based one (auth is Firebase, not Supabase Auth; the
-- server's service-role client does the real user_id filtering).
alter table public.commitments enable row level security;

create policy commitments_deny_anon_select on public.commitments
  for select to anon using (false);
create policy commitments_deny_anon_insert on public.commitments
  for insert to anon with check (false);
create policy commitments_deny_anon_update on public.commitments
  for update to anon using (false) with check (false);
create policy commitments_deny_anon_delete on public.commitments
  for delete to anon using (false);

create policy commitments_deny_authenticated_select on public.commitments
  for select to authenticated using (false);
create policy commitments_deny_authenticated_insert on public.commitments
  for insert to authenticated with check (false);
create policy commitments_deny_authenticated_update on public.commitments
  for update to authenticated using (false) with check (false);
create policy commitments_deny_authenticated_delete on public.commitments
  for delete to authenticated using (false);
