-- 0003_create_financial_obligations_and_instances.sql
-- Phase 2 — Core Ask Symora + AI pipeline. See .claude/rules/data-model.md and
-- .claude/rules/finance-rules.md for the obligation-vs-instance separation this
-- schema encodes: the obligation is the recurring definition, an instance is one
-- period's occurrence, and payment state lives only on the instance.

create table if not exists public.financial_obligations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  commitment_id uuid not null references public.commitments (id) on delete cascade,
  account_name text not null,
  obligation_type text not null
    check (obligation_type in ('emi', 'rent', 'bill', 'subscription', 'insurance', 'other')),
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'INR',
  due_day int not null check (due_day between 1 and 31),
  recurrence_rule text not null default 'monthly',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists financial_obligations_user_id_idx
  on public.financial_obligations (user_id);

create trigger financial_obligations_set_updated_at
  before update on public.financial_obligations
  for each row
  execute function public.set_updated_at();

create table if not exists public.financial_instances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  obligation_id uuid not null references public.financial_obligations (id) on delete cascade,
  -- Calendar-month key, e.g. '2026-09', derived in the user's timezone (never UTC).
  period text not null,
  expected_amount numeric(12, 2) not null,
  paid_amount numeric(12, 2),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'partial', 'skipped', 'overdue')),
  paid_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The constraint that makes instance generation and mark_paid idempotent
  -- (finance-rules.md § Instance generation / Idempotency) — enforced by the
  -- database, not merely a read-then-write check in application code.
  unique (obligation_id, period)
);

create index if not exists financial_instances_user_status_idx
  on public.financial_instances (user_id, status);

create trigger financial_instances_set_updated_at
  before update on public.financial_instances
  for each row
  execute function public.set_updated_at();

alter table public.financial_obligations enable row level security;
alter table public.financial_instances enable row level security;

create policy financial_obligations_deny_anon_select on public.financial_obligations
  for select to anon using (false);
create policy financial_obligations_deny_anon_insert on public.financial_obligations
  for insert to anon with check (false);
create policy financial_obligations_deny_anon_update on public.financial_obligations
  for update to anon using (false) with check (false);
create policy financial_obligations_deny_anon_delete on public.financial_obligations
  for delete to anon using (false);
create policy financial_obligations_deny_authenticated_select on public.financial_obligations
  for select to authenticated using (false);
create policy financial_obligations_deny_authenticated_insert on public.financial_obligations
  for insert to authenticated with check (false);
create policy financial_obligations_deny_authenticated_update on public.financial_obligations
  for update to authenticated using (false) with check (false);
create policy financial_obligations_deny_authenticated_delete on public.financial_obligations
  for delete to authenticated using (false);

create policy financial_instances_deny_anon_select on public.financial_instances
  for select to anon using (false);
create policy financial_instances_deny_anon_insert on public.financial_instances
  for insert to anon with check (false);
create policy financial_instances_deny_anon_update on public.financial_instances
  for update to anon using (false) with check (false);
create policy financial_instances_deny_anon_delete on public.financial_instances
  for delete to anon using (false);
create policy financial_instances_deny_authenticated_select on public.financial_instances
  for select to authenticated using (false);
create policy financial_instances_deny_authenticated_insert on public.financial_instances
  for insert to authenticated with check (false);
create policy financial_instances_deny_authenticated_update on public.financial_instances
  for update to authenticated using (false) with check (false);
create policy financial_instances_deny_authenticated_delete on public.financial_instances
  for delete to authenticated using (false);
